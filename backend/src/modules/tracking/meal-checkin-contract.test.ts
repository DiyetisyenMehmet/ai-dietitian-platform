import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { MealLog, PrismaClient } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";

/**
 * Baseline characterization for G1/#103 Devam 10-B, NOT fix acceptance.
 * Runs the real router/guards/schema/controller/service/repository, replacing
 * only Prisma with a fail-closed synthetic store. No database client is opened.
 * GAP tests deliberately assert the observed unsafe behavior so the evidence
 * stays reproducible until the plan identity/state contract is approved.
 */
test("meal check-in baseline: contract gaps and preserved food/owner behavior", async (t) => {
  process.env.NODE_ENV = "test";
  process.env.DIEWISH_ENVIRONMENT = "test";
  process.env.DATABASE_URL = "postgresql://synthetic:synthetic@127.0.0.1:1/never_connect";
  process.env.JWT_ACCESS_SECRET = "synthetic-access-secret-for-isolated-tests-only";
  process.env.JWT_REFRESH_SECRET = "synthetic-refresh-secret-for-isolated-tests-only";
  process.env.LOG_LEVEL = "silent";

  const accountA = randomUUID();
  const accountB = randomUUID();
  const inactiveAccount = randomUUID();
  let rows: MealLog[] = [];
  let beforeInsert: (() => Promise<void>) | undefined;
  let consentGranted = true;
  let consentRows: unknown[] = [];

  // An unimplemented database operation fails rather than reaching any real DB.
  function only<T extends object>(methods: T): T {
    return new Proxy(methods, {
      get(target, property, receiver) {
        if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
        throw new Error(`Unexpected persistence operation: ${String(property)}`);
      },
    });
  }

  type MealWhere = { userId: string; id?: string; loggedAt?: { gte: Date; lt?: Date } };
  const matches = (row: MealLog, where: MealWhere) =>
    row.userId === where.userId &&
    (where.id === undefined || row.id === where.id) &&
    (!where.loggedAt ||
      (row.loggedAt >= where.loggedAt.gte &&
        (!where.loggedAt.lt || row.loggedAt < where.loggedAt.lt)));

  const store = only({
    mealLog: only({
      async create({ data }: { data: Partial<MealLog> & Pick<MealLog, "userId" | "mealType"> }) {
        await beforeInsert?.();
        const row: MealLog = {
          id: randomUUID(),
          name: null,
          calories: null,
          proteinG: null,
          carbsG: null,
          fatG: null,
          sodiumMg: null,
          sugarG: null,
          micronutrients: null,
          consumedAmount: null,
          consumedUnit: null,
          loggedAt: new Date(),
          createdAt: new Date(),
          ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
          userId: data.userId,
          mealType: data.mealType,
        };
        rows.push(row);
        return structuredClone(row);
      },
      async findMany({ where }: { where: MealWhere }) {
        return structuredClone(rows.filter((row) => matches(row, where)));
      },
      async deleteMany({ where }: { where: MealWhere }) {
        const count = rows.filter((row) => matches(row, where)).length;
        rows = rows.filter((row) => !matches(row, where));
        return { count };
      },
    }),
    user: only({
      async findUnique({ where }: { where: { id: string } }) {
        if (!new Set<string>([accountA, accountB, inactiveAccount]).has(where.id)) return null;
        return {
          id: where.id,
          email: `${where.id}@example.invalid`,
          role: "USER",
          isActive: where.id !== inactiveAccount,
          authVersion: 0,
          onboardingCompleted: true,
        };
      },
    }),
    consentRecord: only({
      async findMany() {
        return consentGranted ? consentRows : [];
      },
    }),
  });

  const globalPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
  const previousPrisma = globalPrisma.prisma;
  globalPrisma.prisma = store as unknown as PrismaClient;
  t.after(() => {
    globalPrisma.prisma = previousPrisma;
  });

  // Dynamic imports are intentional: install the synthetic store before any
  // application module can initialize the Prisma singleton.
  const { trackingRouter } = await import("./tracking.routes");
  const { errorHandler } = await import("../../middleware/error-handler");
  const { createMealLogSchema } = await import("./tracking.schemas");
  const { LEGAL_DOCUMENTS } = await import("../legal/constants");
  consentRows = LEGAL_DOCUMENTS.filter((doc) => doc.consentable).map((doc) => ({
    type: doc.type,
    documentVersion: doc.version,
    granted: true,
  }));

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.log = { warn() {}, error() {} } as unknown as typeof req.log;
    if (req.headers["x-test-lose-response"] === "true") {
      // Drop the connection only after the service has persisted the row and
      // the controller attempts to send its response.
      res.json = () => {
        req.socket.destroy();
        return res;
      };
    }
    next();
  });
  app.use("/api/tracking", trackingRouter);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/tracking/meals`;
  function token(userId: string = accountA, email = `${userId}@example.invalid`) {
    return jwt.sign(
      { email, role: "USER", type: "access", authVersion: 0 },
      process.env.JWT_ACCESS_SECRET!,
      { subject: userId, issuer: "diewish", expiresIn: "5m", jwtid: randomUUID() },
    );
  }
  async function request(
    body?: object,
    options: {
      bearer?: string | null;
      method?: string;
      path?: string;
      loseResponse?: boolean;
    } = {},
  ) {
    return fetch(baseUrl + (options.path ?? ""), {
      method: options.method ?? "POST",
      headers: {
        "content-type": "application/json",
        ...(options.bearer === null
          ? {}
          : { authorization: `Bearer ${options.bearer ?? token()}` }),
        ...(options.loseResponse ? { "x-test-lose-response": "true" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(5000),
    });
  }
  async function create(body: object, bearer?: string) {
    const response = await request(body, { bearer });
    assert.equal(response.status, 201);
    return ((await response.json()) as { data: { log: MealLog } }).data.log;
  }
  const checkIn = { mealType: "SNACK", loggedAt: "2026-10-27T10:00:00.000Z" };

  await t.test("GAP: three retries produce three IDs for one explicit check-in", async () => {
    rows = [];
    const logs = [];
    for (let i = 0; i < 3; i++) logs.push(await create(checkIn));
    assert.equal(new Set(logs.map((log) => log.id)).size, 3);
    assert.equal(rows.length, 3);
  });

  await t.test("GAP: two authenticated device sessions both insert concurrently", async () => {
    rows = [];
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    beforeInsert = async () => {
      if (++arrivals === 2) release();
      await barrier;
    };
    try {
      const deviceA = token();
      const deviceB = token();
      assert.notEqual(deviceA, deviceB);
      const logs = await Promise.all([create(checkIn, deviceA), create(checkIn, deviceB)]);
      assert.equal(arrivals, 2);
      assert.equal(rows.length, 2);
      assert.notEqual(logs[0].id, logs[1].id);
      const refresh = await request(undefined, { method: "GET", bearer: deviceB });
      assert.equal(((await refresh.json()) as { data: { logs: MealLog[] } }).data.logs.length, 2);
    } finally {
      beforeInsert = undefined;
    }
  });

  await t.test(
    "GAP: committed write with lost HTTP response is inserted again on retry",
    async () => {
      rows = [];
      await assert.rejects(request(checkIn, { loseResponse: true }), /fetch failed/);
      assert.equal(rows.length, 1);
      const committedId = rows[0].id;
      const retry = await create(checkIn);
      assert.equal(rows.length, 2);
      assert.notEqual(retry.id, committedId);
    },
  );

  await t.test("different owners, dates and meal types remain independent", async () => {
    rows = [];
    await create(checkIn);
    await create(checkIn, token(accountB));
    await create({ ...checkIn, loggedAt: "2026-10-28T10:00:00.000Z" });
    await create({ ...checkIn, mealType: "LUNCH" });
    assert.equal(rows.length, 4);
    const response = await request(undefined, { method: "GET", bearer: token(accountB) });
    const logs = ((await response.json()) as { data: { logs: MealLog[] } }).data.logs;
    assert.equal(logs.length, 1);
    assert.equal(logs[0].userId, accountB);
  });

  await t.test(
    "multiple real foods, including repeated portions and zero values, are legitimate",
    async () => {
      rows = [];
      const food = {
        ...checkIn,
        name: "Synthetic food",
        calories: 100,
        consumedAmount: 25,
        consumedUnit: "g",
      };
      await create(food);
      await create(food);
      await create({ ...checkIn, name: "Synthetic water-like food", calories: 0 });
      assert.equal(rows.length, 3);
      assert.equal(
        rows.reduce((sum, row) => sum + (row.calories ?? 0), 0),
        200,
      );
    },
  );

  await t.test(
    "GAP: undo removes one ID; a delayed original request can resurrect it",
    async () => {
      rows = [];
      const log = await create(checkIn);
      const response = await request(undefined, { method: "DELETE", path: `/${log.id}` });
      assert.equal(response.status, 204);
      assert.equal(rows.length, 0);
      await create(checkIn); // indistinguishable from a deliberate re-check-in
      assert.equal(rows.length, 1);
    },
  );

  await t.test("undo never removes another real food in the same meal", async () => {
    rows = [];
    const food = await create({ ...checkIn, name: "Synthetic food", calories: 150 });
    const log = await create(checkIn);
    assert.equal((await request(undefined, { method: "DELETE", path: `/${log.id}` })).status, 204);
    assert.deepEqual(
      rows.map((row) => row.id),
      [food.id],
    );
  });

  await t.test("GAP: distinct planned snacks collapse to the same validated request", () => {
    const firstSnack = { ...checkIn, planId: randomUUID(), dayNumber: 1, mealIndex: 1 };
    const secondSnack = { ...firstSnack, mealIndex: 3 };
    const anotherPlan = { ...firstSnack, planId: randomUUID() };
    assert.deepEqual(createMealLogSchema.parse(firstSnack), checkIn);
    assert.deepEqual(createMealLogSchema.parse(secondSnack), checkIn);
    assert.deepEqual(createMealLogSchema.parse(anotherPlan), checkIn);
    assert.equal("planId" in createMealLogSchema.parse(firstSnack), false);
  });

  await t.test(
    "real authentication and ownership guards reject unauthorized writes/deletes",
    async () => {
      rows = [];
      assert.equal((await request(checkIn, { bearer: null })).status, 401);
      assert.equal((await request(checkIn, { bearer: "invalid" })).status, 401);
      assert.equal((await request(checkIn, { bearer: token(inactiveAccount) })).status, 401);
      assert.equal(
        (await request(checkIn, { bearer: token(accountA, "test@guest.diewish.invalid") })).status,
        403,
      );
      assert.equal(rows.length, 0);
      const log = await create({ ...checkIn, userId: accountB });
      assert.equal(log.userId, accountA);
      const foreignDelete = await request(undefined, {
        method: "DELETE",
        path: `/${log.id}`,
        bearer: token(accountB),
      });
      assert.equal(foreignDelete.status, 404);
      assert.equal(rows.length, 1);
    },
  );

  await t.test("current consent guard is preserved", async () => {
    rows = [];
    consentGranted = false;
    try {
      assert.equal((await request(checkIn)).status, 403);
      assert.equal(rows.length, 0);
    } finally {
      consentGranted = true;
    }
  });

  await t.test(
    "old clients can post bare check-ins and food logs without fabricated nutrients",
    async () => {
      rows = [];
      const log = await create({ mealType: "DINNER" });
      assert.equal(log.name, null);
      assert.equal(log.calories, null);
      assert.equal(log.proteinG, null);
      assert.equal(log.micronutrients, null);
      const food = await create({ mealType: "DINNER", calories: 500 });
      assert.equal(food.calories, 500);
      assert.equal(rows.length, 2);
    },
  );
});
