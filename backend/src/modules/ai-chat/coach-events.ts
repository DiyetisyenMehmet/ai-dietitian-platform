import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";

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

type Subscriber = {
  changed: (event: CoachChange) => void;
  revised: (version: string) => void;
  disconnected: () => void;
};
type Group = { subscribers: Set<Subscriber>; pending: Set<Subscriber>; version: bigint | null };
type ReadVersions = (userIds: string[]) => Promise<{ userId: string; version: bigint }[]>;

/** Existing application pool; only revision metadata for authenticated subscribers.
 * No listener credential, LISTEN session, schema migration or new data permission.
 */
export const readCoachVersions: ReadVersions = (userIds) =>
  prisma.coachSyncRevision.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, version: true },
    take: 20,
  });

/** One bounded, non-overlapping metadata check per active server process.
 * Cross-process changes invalidate the existing authenticated snapshot; local
 * post-commit changes retain the existing targeted event fast path.
 */
export class CoachEventBroker {
  private groups = new Map<string, Group>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private reading = false;
  private unavailableUntil = 0;
  private stalled = false;
  constructor(
    private readonly readVersions: ReadVersions = readCoachVersions,
    private readonly intervalMs = 2000,
    private readonly deadlineMs = 5000,
  ) {}

  get available(): boolean {
    return !this.stalled && Date.now() >= this.unavailableUntil;
  }
  connectionsFor(userId: string): number {
    return this.groups.get(userId)?.subscribers.size ?? 0;
  }
  get activeConnections(): number {
    return [...this.groups.values()].reduce((sum, group) => sum + group.subscribers.size, 0);
  }

  async subscribe(userId: string, subscriber: Subscriber): Promise<() => void> {
    if (!this.available)
      throw new ApiError(503, "Coach sync temporarily unavailable.", {
        code: "COACH_SYNC_UNAVAILABLE",
      });
    // Reserve synchronously, before any await, including concurrent openings.
    if (this.activeConnections >= 20 || this.connectionsFor(userId) >= 6)
      throw ApiError.tooManyRequests("Coach connection capacity reached.");
    const group = this.groups.get(userId) ?? {
      subscribers: new Set<Subscriber>(),
      pending: new Set<Subscriber>(),
      version: null,
    };
    group.subscribers.add(subscriber);
    group.pending.add(subscriber);
    this.groups.set(userId, group);
    this.schedule();
    return () => {
      group.subscribers.delete(subscriber);
      group.pending.delete(subscriber);
      if (!group.subscribers.size && this.groups.get(userId) === group) this.groups.delete(userId);
      if (!this.activeConnections) this.close();
    };
  }

  publish(change: CoachChange): void {
    const parsed = changeSchema.safeParse(change);
    if (!parsed.success) return;
    const group = this.groups.get(parsed.data.userId);
    if (!group) return;
    const version = BigInt(parsed.data.version);
    if (group.version !== null && version <= group.version) return;
    group.version = version;
    for (const subscriber of group.subscribers) subscriber.changed(parsed.data);
  }

  private schedule(): void {
    if (this.timer || this.reading || !this.activeConnections) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.poll();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  private fail(): void {
    this.unavailableUntil = Date.now() + 10000;
    const subscribers = [...this.groups.values()].flatMap((group) => [...group.subscribers]);
    this.close();
    for (const subscriber of subscribers) subscriber.disconnected();
  }

  private async poll(): Promise<void> {
    if (this.reading || !this.activeConnections) return;
    this.reading = true;
    const groups = new Map(this.groups);
    let expired = false;
    const deadline = setTimeout(() => {
      expired = true;
      this.stalled = true;
      this.fail();
    }, this.deadlineMs);
    try {
      const rows = await this.readVersions([...groups.keys()]);
      if (expired) return;
      const revisions = new Map(rows.map((row) => [row.userId, row.version]));
      for (const [userId, group] of groups) {
        // Discard an old query after all subscribers left or changed account.
        if (this.groups.get(userId) !== group) continue;
        const readVersion = revisions.get(userId) ?? 0n;
        const advanced = group.version === null || readVersion > group.version;
        const version = advanced ? readVersion : group.version!;
        group.version = version;
        for (const subscriber of group.subscribers) {
          if (advanced || group.pending.has(subscriber)) {
            group.pending.delete(subscriber);
            subscriber.revised(version.toString());
          }
        }
      }
    } catch {
      if (!expired) this.fail();
    } finally {
      clearTimeout(deadline);
      this.reading = false;
      this.stalled = false;
      // Even after a timeout do not start another query until the first settles.
      this.schedule();
    }
  }

  close(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.groups.clear();
  }
}

export const coachBroker = new CoachEventBroker();

/** Local delivery is only an optimization; the committed revision repairs misses. */
export function publishCoachChange(change: CoachChange): void {
  if (!env.COACH_SYNC_ENABLED) return;
  try {
    coachBroker.publish(change);
  } catch {
    /* Never fail a saved mutation. */
  }
}
