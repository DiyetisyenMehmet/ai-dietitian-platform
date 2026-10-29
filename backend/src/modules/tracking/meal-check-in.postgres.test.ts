import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { localCheckInTestUrl } from "./meal-check-in.local-test-guard";

interface State {
  id: string | null;
  active: boolean;
  revision: number;
}
interface Day {
  total: number;
  completed: number;
  allDone: boolean;
  source: string;
  unplannedSupported: boolean;
  legacyMealLogsExcluded: boolean;
  checkIns: Array<State & { mealIndex: number }>;
}
interface Body {
  data?: { checkIn?: State; day?: Day; log?: { id: string; calories: number | null } };
  error?: { code: string };
}
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test(
  "planned check-ins: real disposable PostgreSQL acceptance",
  { timeout: 120_000 },
  async (t) => {
    const url = localCheckInTestUrl();
    process.env.DATABASE_URL = url;
    const db = new PrismaClient({ datasourceUrl: url, log: [] });
    const sql = new Client({ connectionString: url });
    const cleanup: Array<() => Promise<void>> = [];
    t.after(async () => {
      for (const action of cleanup.reverse()) await action();
    });
    await sql.connect();
    cleanup.push(async () => {
      await db.$disconnect();
      await sql.end();
    });
    assert.match(
      (await sql.query("SELECT version() AS version")).rows[0].version,
      /PostgreSQL 16\./,
    );
    assert.equal(
      (await sql.query("SELECT current_database() AS name")).rows[0].name,
      new URL(url).pathname.slice(1),
    );
    // A fresh CI service must have the baseline migrations and no draft table.
    assert.equal(
      (await sql.query("SELECT to_regclass('public.meal_check_ins') AS name")).rows[0].name,
      null,
    );
    const { LEGAL_DOCUMENTS } = await import("../legal/constants");
    const { signAccessToken } = await import("../../utils/jwt");
    const userA = await db.user.create({
      data: {
        email: "app13-a@example.invalid",
        passwordHash: "synthetic",
        onboardingCompleted: true,
      },
    });
    const userB = await db.user.create({
      data: {
        email: "app13-b@example.invalid",
        passwordHash: "synthetic",
        onboardingCompleted: true,
      },
    });
    cleanup.push(async () => {
      await db.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    });
    for (const user of [userA, userB])
      for (const doc of LEGAL_DOCUMENTS.filter((d) => d.consentable)) {
        await db.consentRecord.create({
          data: { userId: user.id, type: doc.type, documentVersion: doc.version, granted: true },
        });
      }
    function token(user = userA, email = user.email) {
      return signAccessToken({ userId: user.id, email, role: "USER", authVersion: 0 });
    }
    const meals = [
      ["Kahvaltı", "08:00"],
      ["Ara öğün", "10:00"],
      ["Öğle", "13:00"],
      ["Ara öğün", "16:00"],
    ];
    async function plan(
      owner = userA.id,
      options: { days?: 7 | 14 | 30; times?: string[]; offset?: number; empty?: boolean } = {},
    ) {
      const days = options.days ?? 7;
      const menu = options.empty
        ? []
        : meals.map(([name, time], index) => ({
            name,
            time: options.times?.[index] ?? time,
            foods: [{ name: "Synthetic food", portion: "1 portion" }],
            calories: 100,
            proteinGrams: 10,
            carbsGrams: 10,
            fatGrams: 2,
            explanation: "Synthetic",
          }));
      return db.nutritionPlan.create({
        data: {
          userId: owner,
          duration: days === 7 ? "SEVEN_DAY" : days === 14 ? "FOURTEEN_DAY" : "THIRTY_DAY",
          startDate: new Date("2026-10-27T00:00:00.000Z"),
          status: "COMPLETED",
          isActive: true,
          version: 1,
          bmr: 1500,
          tdee: 1800,
          dailyCalories: 1800,
          proteinGrams: 80,
          carbsGrams: 200,
          fatGrams: 60,
          waterMl: 2000,
          mealsPerDay: menu.length,
          mealTiming: {},
          explanations: {},
          recommendations: {},
          dailyPlans: {
            durationDays: days,
            cycleLengthDays: days,
            cycle: Array.from({ length: days }, () => ({ meals: menu })),
            calendar: Array.from({ length: days }, (_, i) => ({
              dayNumber: i + 1,
              cycleIndex: i,
              dateOffsetDays: options.offset ?? 0,
            })),
          },
        },
      });
    }
    const seedPlan = await plan();
    async function worker(index: number) {
      const workerUrl = new URL(url);
      workerUrl.searchParams.set("connection_limit", "1");
      workerUrl.searchParams.set("application_name", `app13_worker_${index}`);
      const child = fork(join(__dirname, "meal-check-in.test-worker.ts"), [], {
        execArgv: ["--import", "tsx"],
        env: { ...process.env, MEAL_CHECK_IN_TEST_DATABASE_URL: workerUrl.toString() },
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
      const message = await Promise.race([
        once(child, "message").then(
          ([message]) => message as { port: number; databasePid: number; processPid: number },
        ),
        once(child, "exit").then(() => {
          throw new Error("Test server exited before readiness");
        }),
      ]);
      cleanup.push(async () => {
        if (child.exitCode !== null) return;
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        await exited;
      });
      return { ...message, base: `http://127.0.0.1:${message.port}/api/tracking` };
    }
    const first = await worker(1),
      second = await worker(2);
    assert.notEqual(first.processPid, second.processPid);
    assert.notEqual(first.databasePid, second.databasePid);
    t.diagnostic(
      `Two real server processes ${first.processPid}/${second.processPid}; PostgreSQL connections ${first.databasePid}/${second.databasePid}`,
    );
    async function request(
      path: string,
      options: {
        method?: string;
        revision?: number | string;
        bearer?: string | null;
        body?: object;
        server?: typeof first;
        drop?: boolean;
      } = {},
    ) {
      return fetch((options.server ?? first).base + path, {
        method: options.method ?? "GET",
        headers: {
          "content-type": "application/json",
          ...(options.bearer === null
            ? {}
            : { authorization: `Bearer ${options.bearer ?? token()}` }),
          ...(options.revision === undefined
            ? {}
            : {
                "if-match":
                  typeof options.revision === "number" ? `"${options.revision}"` : options.revision,
              }),
          ...(options.drop ? { "x-app13-test-drop-response": "1" } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: AbortSignal.timeout(15000),
      });
    }
    const path = (id: string, index = 0, date = "2026-10-27", day = 1) =>
      `/meal-check-ins/${id}/${day}/${index}?localDate=${date}`;
    async function state(response: Response) {
      assert.equal(response.status, 200, await response.clone().text());
      const body = (await response.json()) as Body;
      assert.ok(body.data?.checkIn);
      return body.data.checkIn;
    }
    async function day(
      id: string,
      options: { date?: string; number?: number; bearer?: string } = {},
    ) {
      const response = await request(
        `/meal-check-ins?planId=${id}&dayNumber=${options.number ?? 1}&localDate=${options.date ?? "2026-10-27"}`,
        { bearer: options.bearer },
      );
      assert.equal(response.status, 200, await response.clone().text());
      const body = (await response.json()) as Body;
      assert.ok(body.data?.day);
      return body.data.day;
    }

    await t.test(
      "missing reviewed schema returns 503 instead of silently using old logs",
      async () => {
        const response = await request(
          `/meal-check-ins?planId=${seedPlan.id}&dayNumber=1&localDate=2026-10-27`,
        );
        assert.equal(response.status, 503);
        assert.equal(((await response.json()) as Body).error?.code, "MEAL_CHECK_IN_NOT_READY");
      },
    );
    await t.test("draft is additive and leaves existing food data and columns intact", async () => {
      const food = await db.mealLog.create({
        data: { userId: userA.id, mealType: "SNACK", name: "Pre-schema food", calories: 70 },
      });
      const columns = await sql.query(
        "SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
      );
      const draft = await readFile(
        join(
          __dirname,
          "../../..",
          "prisma/migration-drafts/20261029000100_meal_check_ins/migration.sql",
        ),
        "utf8",
      );
      await sql.query(draft);
      const after = await sql.query(
        "SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name <> 'meal_check_ins' ORDER BY table_name,ordinal_position",
      );
      assert.deepEqual(after.rows, columns.rows);
      assert.deepEqual(await db.mealLog.findUnique({ where: { id: food.id } }), food);
      assert.equal((await day(seedPlan.id)).completed, 0);
    });
    await t.test(
      "two backend processes block on the same DB lock and return one row/revision",
      async () => {
        const p = await plan();
        await sql.query("BEGIN");
        await sql.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userA.id]);
        const left = request(path(p.id), { method: "PUT", revision: 0 });
        const right = request(path(p.id), { method: "PUT", revision: 0, server: second });
        let waiting = 0;
        try {
          for (let i = 0; i < 100; i++) {
            waiting = Number(
              (
                await sql.query(
                  "SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'app13_worker_%' AND wait_event_type='Lock'",
                )
              ).rows[0].count,
            );
            if (waiting === 2) break;
            await sleep(10);
          }
          assert.equal(waiting, 2, "both independent sessions must actually contend for the lock");
        } finally {
          await sql.query("COMMIT");
        }
        const a = await state(await left),
          b = await state(await right);
        assert.deepEqual(a, b);
        assert.equal(a.revision, 1);
        assert.equal(await db.mealCheckIn.count({ where: { planId: p.id } }), 1);
        assert.equal((await day(p.id)).completed, 1);
      },
    );
    await t.test(
      "lost committed response and three retries preserve the same ID and revision",
      async () => {
        const p = await plan();
        await assert.rejects(
          request(path(p.id), { method: "PUT", revision: 0, drop: true }),
          /fetch failed/,
        );
        const a = await state(
          await request(path(p.id), { method: "PUT", revision: 0, server: second }),
        );
        for (let i = 0; i < 3; i++)
          assert.deepEqual(
            await state(await request(path(p.id), { method: "PUT", revision: 0 })),
            a,
          );
        assert.equal(a.revision, 1);
        assert.equal(await db.mealCheckIn.count({ where: { planId: p.id } }), 1);
      },
    );
    await t.test(
      "confirm -> undo -> stale confirm gets 409; deliberate re-confirm and ABA stay safe",
      async () => {
        const p = await plan();
        const a = await state(await request(path(p.id), { method: "PUT", revision: 0 }));
        const undone = await state(
          await request(path(p.id), { method: "DELETE", revision: 1, server: second }),
        );
        assert.equal(undone.id, a.id);
        assert.equal(undone.active, false);
        assert.equal(undone.revision, 2);
        assert.deepEqual(
          await state(await request(path(p.id), { method: "DELETE", revision: 1 })),
          undone,
        );
        const stale = await request(path(p.id), { method: "PUT", revision: 0 });
        assert.equal(stale.status, 409);
        assert.equal(((await stale.json()) as Body).error?.code, "MEAL_CHECK_IN_REVISION_CONFLICT");
        assert.equal((await day(p.id)).completed, 0);
        const again = await state(await request(path(p.id), { method: "PUT", revision: 2 }));
        assert.equal(again.revision, 3);
        assert.equal((await request(path(p.id), { method: "PUT", revision: 0 })).status, 409);
        assert.equal((await request(path(p.id), { method: "DELETE", revision: 1 })).status, 409);
      },
    );
    await t.test(
      "undo before initial confirm persists a tombstone against delayed revision zero",
      async () => {
        const p = await plan();
        assert.equal(
          (await state(await request(path(p.id), { method: "DELETE", revision: 0 }))).active,
          false,
        );
        assert.equal((await request(path(p.id), { method: "PUT", revision: 0 })).status, 409);
        assert.equal(await db.mealCheckIn.count({ where: { planId: p.id } }), 1);
      },
    );
    await t.test(
      "two planned SNACKs, another day, plan and owner have independent identities",
      async () => {
        const a = await plan(),
          b = await plan(),
          other = await plan(userB.id);
        const keys = [path(a.id, 1), path(a.id, 3), path(a.id, 1, "2026-10-28", 2), path(b.id, 1)];
        const states = [];
        for (const key of keys)
          states.push(await state(await request(key, { method: "PUT", revision: 0 })));
        states.push(
          await state(
            await request(path(other.id, 1), { method: "PUT", revision: 0, bearer: token(userB) }),
          ),
        );
        assert.equal(new Set(states.map((s) => s.id)).size, 5);
        assert.equal((await day(a.id)).completed, 2);
        assert.equal((await request(path(other.id), { method: "PUT", revision: 0 })).status, 404);
      },
    );
    await t.test(
      "7/14/30-day horizons accept the actual last day without modulo guesses",
      async () => {
        for (const days of [7, 14, 30] as const) {
          const p = await plan(userA.id, { days });
          const date = new Date("2026-10-27T00:00:00Z");
          date.setUTCDate(date.getUTCDate() + days - 1);
          const key = path(p.id, 0, date.toISOString().slice(0, 10), days);
          assert.equal(
            (await state(await request(key, { method: "PUT", revision: 0 }))).active,
            true,
          );
        }
      },
    );
    await t.test(
      "paused calendar and post-midnight meals use their server-validated real dates",
      async () => {
        const p = await plan(userA.id, { offset: 1, times: ["22:00", "00:30", "02:00", "04:00"] });
        assert.equal(
          (await request(path(p.id, 1, "2026-10-28"), { method: "PUT", revision: 0 })).status,
          422,
        );
        assert.equal(
          (await state(await request(path(p.id, 1, "2026-10-29"), { method: "PUT", revision: 0 })))
            .active,
          true,
        );
        assert.equal((await day(p.id, { date: "2026-10-28" })).total, 1);
        assert.equal((await day(p.id, { date: "2026-10-29" })).total, 3);
        assert.equal(
          (await request(path(p.id, 0, "2026-10-27"), { method: "PUT", revision: 0 })).status,
          422,
        );
      },
    );
    await t.test(
      "revised/inactive/deleted/pending plans cannot inherit or accept a confirmation",
      async () => {
        const old = await plan();
        await state(await request(path(old.id), { method: "PUT", revision: 0 }));
        await db.nutritionPlan.update({ where: { id: old.id }, data: { isActive: false } });
        assert.equal((await request(path(old.id), { method: "PUT", revision: 1 })).status, 409);
        const revised = await plan();
        await db.nutritionPlan.update({ where: { id: revised.id }, data: { version: 2 } });
        assert.equal((await day(revised.id)).completed, 0);
        await state(await request(path(revised.id), { method: "PUT", revision: 0 }));
        await db.nutritionPlan.update({
          where: { id: revised.id },
          data: { deletedAt: new Date() },
        });
        assert.equal((await request(path(revised.id), { method: "PUT", revision: 1 })).status, 404);
        const pending = await plan();
        await db.nutritionPlan.update({ where: { id: pending.id }, data: { status: "PENDING" } });
        assert.equal((await request(path(pending.id), { method: "PUT", revision: 0 })).status, 409);
      },
    );
    await t.test(
      "invalid calendar/date/meal/revision or body-supplied owner/nutrition cannot write",
      async () => {
        const p = await plan();
        for (const revision of [undefined, "*", "0", '"-1"', '"2147483647"']) {
          assert.equal((await request(path(p.id), { method: "PUT", revision })).status, 422);
        }
        assert.equal(
          (await request(path(p.id), { method: "PUT", revision: 0, body: { userId: userB.id } }))
            .status,
          422,
        );
        assert.equal(
          (await request(path(p.id), { method: "PUT", revision: 0, body: { calories: 500 } }))
            .status,
          422,
        );
        assert.equal((await request(path(p.id, 10), { method: "PUT", revision: 0 })).status, 422);
        assert.equal(
          (await request(path(p.id, 0, "2026-02-30"), { method: "PUT", revision: 0 })).status,
          422,
        );
        assert.equal(
          (await request(path(p.id, 0, "2026-10-27", 60), { method: "PUT", revision: 0 })).status,
          422,
        );
        await db.nutritionPlan.update({
          where: { id: p.id },
          data: { dailyPlans: { durationDays: 7, cycle: [], calendar: [] } },
        });
        assert.equal((await request(path(p.id), { method: "PUT", revision: 0 })).status, 409);
        assert.equal(await db.mealCheckIn.count({ where: { planId: p.id } }), 0);
      },
    );
    await t.test(
      "real authentication/consent guards deny invalid sessions and allow undo after withdrawal",
      async () => {
        const p = await plan();
        assert.equal(
          (await request(path(p.id), { method: "PUT", revision: 0, bearer: null })).status,
          401,
        );
        assert.equal(
          (await request(path(p.id), { method: "PUT", revision: 0, bearer: "invalid" })).status,
          401,
        );
        assert.equal(
          (
            await request(path(p.id), {
              method: "PUT",
              revision: 0,
              bearer: token(userA, "x@guest.diewish.invalid"),
            })
          ).status,
          403,
        );
        await db.user.update({ where: { id: userA.id }, data: { isActive: false } });
        assert.equal((await request(path(p.id), { method: "PUT", revision: 0 })).status, 401);
        await db.user.update({ where: { id: userA.id }, data: { isActive: true } });
        await state(await request(path(p.id), { method: "PUT", revision: 0 }));
        const consent = LEGAL_DOCUMENTS.find((d) => d.type === "KVKK_EXPLICIT_CONSENT")!;
        const withdrawal = await db.consentRecord.create({
          data: {
            userId: userA.id,
            type: consent.type,
            documentVersion: consent.version,
            granted: false,
          },
        });
        assert.equal((await request(path(p.id, 1), { method: "PUT", revision: 0 })).status, 403);
        assert.equal((await day(p.id)).completed, 1);
        assert.equal(
          (await state(await request(path(p.id), { method: "DELETE", revision: 1 }))).active,
          false,
        );
        await db.consentRecord.delete({ where: { id: withdrawal.id } });
      },
    );
    await t.test(
      "legacy food POST and bare confirmations never double-count new planned progress",
      async () => {
        const p = await plan();
        const ids: string[] = [];
        for (const body of [
          { mealType: "SNACK", name: "Same food", calories: 100 },
          { mealType: "SNACK", name: "Same food", calories: 100 },
          { mealType: "SNACK", name: "Zero calorie", calories: 0 },
          { mealType: "SNACK" },
          { mealType: "SNACK" },
        ]) {
          const response = await request("/meals", { method: "POST", body });
          assert.equal(response.status, 201);
          ids.push(((await response.json()) as Body).data!.log!.id);
        }
        const before = await db.mealLog.findMany({
          where: { id: { in: ids } },
          orderBy: { id: "asc" },
        });
        const empty = await day(p.id);
        assert.equal(empty.completed, 0);
        assert.equal(empty.legacyMealLogsExcluded, true);
        assert.equal(empty.source, "PLAN_CHECK_INS_ONLY");
        await state(await request(path(p.id, 1), { method: "PUT", revision: 0 }));
        assert.equal((await day(p.id)).completed, 1);
        await state(await request(path(p.id, 1), { method: "DELETE", revision: 1 }));
        assert.deepEqual(
          await db.mealLog.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } }),
          before,
        );
        assert.equal(
          before.reduce((n, row) => n + (row.calories ?? 0), 0),
          200,
        );
        assert.equal((await day(p.id)).completed, 0);
      },
    );
    await t.test(
      "zero-step day is never all-done; unplanned days are explicitly unsupported",
      async () => {
        const p = await plan(userA.id, { empty: true });
        const empty = await day(p.id);
        assert.equal(empty.total, 0);
        assert.equal(empty.completed, 0);
        assert.equal(empty.allDone, false);
        assert.equal(empty.unplannedSupported, false);
        assert.equal((await request(path(p.id), { method: "PUT", revision: 0 })).status, 422);
        assert.equal(
          (
            await request(path("00000000-0000-4000-8000-000000000000"), {
              method: "PUT",
              revision: 0,
            })
          ).status,
          404,
        );
      },
    );
    await t.test("DB exception rolls back an insert; retry starts at revision zero", async () => {
      const p = await plan();
      await sql.query(`CREATE FUNCTION app13_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW."planId" = '${p.id}' THEN RAISE EXCEPTION 'synthetic forced rollback'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER app13_fail_insert AFTER INSERT ON meal_check_ins FOR EACH ROW EXECUTE FUNCTION app13_fail_insert();`);
      try {
        assert.ok((await request(path(p.id), { method: "PUT", revision: 0 })).status >= 400);
        assert.equal(await db.mealCheckIn.count({ where: { planId: p.id } }), 0);
      } finally {
        await sql.query(
          "DROP TRIGGER app13_fail_insert ON meal_check_ins; DROP FUNCTION app13_fail_insert()",
        );
      }
      assert.equal(
        (await state(await request(path(p.id), { method: "PUT", revision: 0 }))).revision,
        1,
      );
    });
    await t.test(
      "database unique and composite owner constraints protect against direct invalid inserts",
      async () => {
        const p = await plan();
        await state(await request(path(p.id), { method: "PUT", revision: 0 }));
        const row = await db.mealCheckIn.findFirstOrThrow({ where: { planId: p.id } });
        const data = {
          userId: row.userId,
          planId: row.planId,
          dayNumber: row.dayNumber,
          mealIndex: row.mealIndex,
          localDate: row.localDate,
          active: true,
          revision: 1,
        };
        await assert.rejects(
          db.mealCheckIn.create({ data }),
          (e: unknown) => (e as { code: string }).code === "P2002",
        );
        await assert.rejects(
          db.mealCheckIn.create({ data: { ...data, userId: userB.id } }),
          (e: unknown) => (e as { code: string }).code === "P2003",
        );
        assert.equal(await db.mealCheckIn.count({ where: { planId: p.id } }), 1);
      },
    );
    await t.test(
      "all-done requires every exact planned meal, never a shared SNACK row",
      async () => {
        const p = await plan();
        for (const index of [0, 1, 2])
          await state(await request(path(p.id, index), { method: "PUT", revision: 0 }));
        assert.equal((await day(p.id)).allDone, false);
        await state(await request(path(p.id, 3), { method: "PUT", revision: 0 }));
        assert.equal((await day(p.id)).allDone, true);
        await state(await request(path(p.id, 1), { method: "DELETE", revision: 1 }));
        assert.equal((await day(p.id)).allDone, false);
      },
    );
  },
);
