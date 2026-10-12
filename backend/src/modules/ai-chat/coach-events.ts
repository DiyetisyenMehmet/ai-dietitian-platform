import type { Prisma } from "@prisma/client";
import { Client } from "pg";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";

export const COACH_CHANNEL = "diewish_coach_change_v1";
// Deliberately fixed, not an environment-selectable application/migration account.
export const COACH_LISTENER_ROLE = "diewish_staging_coach_listener";
export const changeSchema = z
  .object({
    userId: z.string().uuid(),
    conversationId: z.string().uuid(),
    type: z.enum(["created", "turn", "renamed", "pinned", "deleted"]),
    version: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .max(20),
  })
  .strict();
export type CoachChange = z.infer<typeof changeSchema>;

/** Same database/endpoint, but ONLY the predefined notification-only account. */
export function sameCoachDatabase(queryUrl: string, listenerUrl: string): boolean {
  try {
    const query = new URL(queryUrl),
      listener = new URL(listenerUrl);
    // node-postgres accepts query-string host/user/port overrides and startup
    // options. Reject these before comparing URL authority, including encoded keys.
    const overrides = new Set([
      "host",
      "hostaddr",
      "port",
      "user",
      "password",
      "database",
      "dbname",
      "options",
      "service",
      "role",
    ]);
    return (
      [query, listener].every(
        (url) =>
          ["postgres:", "postgresql:"].includes(url.protocol) &&
          Boolean(url.hostname && url.username && url.pathname.length > 1) &&
          !url.hash &&
          ![...url.searchParams.keys()].some((key) => overrides.has(key.toLowerCase())),
      ) &&
      !listener.hostname.includes("-pooler") &&
      query.hostname.replace(/-pooler(?=\.)/, "") === listener.hostname &&
      query.port === listener.port &&
      query.pathname === listener.pathname &&
      listener.username === COACH_LISTENER_ROLE
    );
  } catch {
    return false;
  }
}

/** Catalog/ACL metadata only: no application rows and no grants or role changes.
 * Checked once per dedicated session, before LISTEN; never a periodic data query.
 */
export async function verifyCoachListener(client: Client): Promise<void> {
  const result = await client.query<{ allowed: boolean }>(
    `
    SELECT session_user = $1 AND current_user = $1
      AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit
      AND NOT r.rolcreatedb AND NOT r.rolcreaterole
      AND NOT r.rolreplication AND NOT r.rolbypassrls
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid)
      AND NOT pg_catalog.has_database_privilege(r.oid, pg_catalog.current_database(), 'CREATE')
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_namespace n
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
          AND pg_catalog.has_schema_privilege(r.oid, n.oid, 'CREATE')
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
          AND CASE
            WHEN c.relkind IN ('r', 'p', 'v', 'm', 'f') THEN (
              pg_catalog.has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
              OR pg_catalog.has_any_column_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
            )
            WHEN c.relkind = 'S' THEN pg_catalog.has_sequence_privilege(r.oid, c.oid, 'USAGE,SELECT,UPDATE')
            ELSE false
          END
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
          AND p.prosecdef AND pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE')
      ) AS allowed
    FROM pg_catalog.pg_roles r WHERE r.rolname = $1
  `,
    [COACH_LISTENER_ROLE],
  );
  if (result.rows.length !== 1 || result.rows[0].allowed !== true)
    throw new Error("Coach listener account is not restricted");
}

/** Durable watermark is in the SAME transaction as its conversation mutation. */
export async function recordCoachChange(
  tx: Prisma.TransactionClient,
  userId: string,
  conversationId: string,
  type: CoachChange["type"],
): Promise<CoachChange> {
  const revision = await tx.coachSyncRevision.upsert({
    where: { userId },
    create: { userId, version: 1n },
    update: { version: { increment: 1n } },
  });
  return { userId, conversationId, type, version: revision.version.toString() };
}

/** NOTIFY failure never rolls back a saved message or changes its HTTP reply. */
export function publishCoachChange(change: CoachChange): void {
  if (!env.COACH_SYNC_ENABLED) return;
  void prisma.$executeRaw`SELECT pg_notify(${COACH_CHANNEL}, ${JSON.stringify(change)})`.catch(
    () => {
      /* The durable watermark repairs this on reconnect. No PHI/credentials in logs. */
    },
  );
}

export async function coachVersion(userId: string): Promise<string> {
  return (
    (await prisma.coachSyncRevision.findUnique({ where: { userId } }))?.version.toString() ?? "0"
  );
}

type Subscriber = { changed: (event: CoachChange) => void; disconnected: () => void };

/** One dedicated LISTEN session per server PROCESS, not per browser/client. */
export class CoachEventBroker {
  private client: Client | null = null;
  private opening: Promise<void> | null = null;
  private subscribers = new Map<string, Set<Subscriber>>();
  constructor(private readonly connectionString: string) {}

  connectionsFor(userId: string): number {
    return this.subscribers.get(userId)?.size ?? 0;
  }

  get activeConnections(): number {
    return [...this.subscribers.values()].reduce((sum, set) => sum + set.size, 0);
  }

  async subscribe(userId: string, subscriber: Subscriber): Promise<() => void> {
    const group = this.subscribers.get(userId) ?? new Set<Subscriber>();
    group.add(subscriber);
    this.subscribers.set(userId, group);
    const release = () => {
      group.delete(subscriber);
      if (!group.size) this.subscribers.delete(userId);
      if (!this.activeConnections) this.close();
    };
    try {
      await this.open(); // LISTEN commits before caller reads its watermark.
      return release;
    } catch {
      release();
      throw new Error("Coach event transport unavailable");
    }
  }

  private open(): Promise<void> {
    if (this.opening) return this.opening;
    if (this.client) return Promise.resolve();
    const client = new Client({
      connectionString: this.connectionString,
      connectionTimeoutMillis: 5000,
    });
    this.client = client;
    client.on("notification", (notification) => {
      if (notification.channel !== COACH_CHANNEL || !notification.payload) return;
      try {
        const parsed = changeSchema.safeParse(JSON.parse(notification.payload));
        if (!parsed.success) return;
        for (const subscriber of this.subscribers.get(parsed.data.userId) ?? []) {
          subscriber.changed(parsed.data);
        }
      } catch {
        /* Reject malformed/untrusted database payloads without logging them. */
      }
    });
    const disconnected = () => {
      if (this.client !== client) return;
      const subscribers = [...this.subscribers.values()].flatMap((set) => [...set]);
      this.close();
      for (const subscriber of subscribers) subscriber.disconnected();
    };
    client.on("error", disconnected);
    client.on("end", disconnected);
    this.opening = (async () => {
      try {
        await client.connect();
        await verifyCoachListener(client);
        await client.query(`LISTEN ${COACH_CHANNEL}`);
        if (this.client !== client) throw new Error("Listener disconnected");
      } catch {
        disconnected();
        throw new Error("Coach event transport unavailable");
      } finally {
        this.opening = null;
      }
    })();
    return this.opening;
  }

  close(): void {
    const client = this.client;
    this.client = null;
    this.subscribers.clear();
    if (client) void client.end().catch(() => {});
  }
}
