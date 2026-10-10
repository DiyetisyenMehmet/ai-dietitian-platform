import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import bcrypt from "bcryptjs";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { setAIAdapter } from "../modules/blood-test-analysis/ai-adapter/ai-adapter.factory";
import type { IAIAdapter } from "../modules/blood-test-analysis/ai-adapter/ai-adapter.interface";
import { aiChatRepository } from "../modules/ai-chat/ai-chat.repository";

interface Thread {
  id: string;
  title: string | null;
  messages?: { id: string; role: string }[];
}
interface ResponseData {
  conversations: Thread[];
  conversation: Thread;
  conversationId: string;
  message: { id: string };
  user: { id: string };
  tokens: { accessToken: string };
}

test("Coach persistence and ownership across independent client sessions", async (t) => {
  const password = crypto.randomBytes(24).toString("hex");
  const passwordHash = await bcrypt.hash(password, 10);
  const ids: string[] = [];
  const create = async () => {
    const user = await prisma.user.create({
      data: {
        email: `${crypto.randomUUID()}@example.invalid`,
        passwordHash,
        fullName: "Synthetic Coach User",
        onboardingCompleted: true,
      },
    });
    ids.push(user.id);
    return user;
  };
  const owner = await create(),
    stranger = await create();
  const unused = async (): Promise<never> => {
    throw new Error("Unused provider method");
  };
  const adapter: IAIAdapter = {
    info: { provider: "integration-fake", model: "sync-contract" },
    validateBloodTestDocument: unused,
    extractBloodTestValues: unused,
    analyzeBloodTestValues: unused,
    generateNutritionPlan: unused,
    chatWithDietitian: async () => ({ reply: "Merhaba." }),
  };
  setAIAdapter(adapter);
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  const request = async (path: string, token?: string, method = "GET", body?: unknown) => {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload =
      response.status === 204 ? null : ((await response.json()) as { data?: ResponseData });
    return { status: response.status, data: payload?.data as ResponseData };
  };
  const login = async (email: string) => {
    const response = await request("/auth/login", undefined, "POST", { email, password });
    assert.equal(response.status, 200);
    assert.equal(response.data.user.id, email === owner.email ? owner.id : stranger.id);
    return response.data.tokens.accessToken;
  };
  let web = await login(owner.email),
    android = await login(owner.email);
  const other = await login(stranger.email);
  for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"]) {
    assert.equal((await request("/legal/consents", web, "POST", { type })).status, 200);
    assert.equal((await request("/legal/consents", other, "POST", { type })).status, 200);
  }
  const threadIds: string[] = [];
  await t.test("both directions read real persisted turns", async () => {
    for (const [source, target] of [
      [android, web],
      [web, android],
    ]) {
      const sent = await request("/ai-chat/messages", source, "POST", { message: "Merhaba." });
      assert.equal(sent.status, 201);
      const id = sent.data.conversationId;
      threadIds.push(id);
      const row = await prisma.chatConversation.findUniqueOrThrow({
        where: { id },
        include: { messages: true },
      });
      assert.equal(row.userId, owner.id);
      assert.equal(row.messages.length, 2);
      assert.equal(row.messages.filter((message) => message.role === "USER").length, 1);
      assert.equal(row.messages.filter((message) => message.role === "ASSISTANT").length, 1);
      assert.ok(row.messages.some((message) => message.id === sent.data.message.id));
      const list = await request("/ai-chat/conversations", target);
      assert.equal(list.status, 200);
      assert.ok(list.data.conversations.some((conversation) => conversation.id === id));
      assert.equal(
        (await request(`/ai-chat/conversations/${id}`, target)).data.conversation.messages?.length,
        2,
      );
    }
  });
  const id = threadIds[0];
  await t.test("ownership rejects foreign detail, send and all mutations", async () => {
    assert.equal((await request("/ai-chat/conversations", other)).data.conversations.length, 0);
    for (const [path, method, body] of [
      [`/ai-chat/conversations/${id}`, "GET", undefined],
      ["/ai-chat/messages", "POST", { conversationId: id, message: "Merhaba." }],
      [`/ai-chat/conversations/${id}`, "PATCH", { title: "Foreign" }],
      [`/ai-chat/conversations/${id}/pin`, "PATCH", { pinned: true }],
      [`/ai-chat/conversations/${id}`, "DELETE", undefined],
    ] as const)
      assert.equal((await request(path, other, method, body)).status, 404);
    assert.equal((await request("/ai-chat/conversations")).status, 401);
    assert.equal(await prisma.chatMessage.count({ where: { conversationId: id } }), 2);
  });
  await t.test("logout/login and repeat reads preserve unique IDs", async () => {
    assert.equal((await request("/auth/logout", web, "POST")).status, 200);
    web = await login(owner.email);
    android = await login(owner.email);
    for (const token of [web, android]) {
      const rows = (await request("/ai-chat/conversations", token)).data.conversations;
      assert.deepEqual(new Set(rows.map((row) => row.id)), new Set(threadIds));
      assert.equal(rows.length, 2);
    }
    // The existing endpoint returns the full list and has no archive/pagination
    // parameters; unsolicited query fields must never broaden ownership.
    assert.equal(
      (await request(`/ai-chat/conversations?userId=${owner.id}&page=2&archived=true`, other)).data
        .conversations.length,
      0,
    );
  });
  await t.test("null/renamed titles, pin and follow-up never hide or split a thread", async () => {
    await prisma.chatConversation.update({ where: { id }, data: { title: null } });
    assert.ok(
      (await request("/ai-chat/conversations", web)).data.conversations.some(
        (row) => row.id === id,
      ),
    );
    assert.equal(
      (await request(`/ai-chat/conversations/${id}`, android, "PATCH", { title: "Aynı başlık" }))
        .status,
      200,
    );
    assert.equal(
      (await request(`/ai-chat/conversations/${id}/pin`, web, "PATCH", { pinned: true })).status,
      200,
    );
    const sent = await request("/ai-chat/messages", android, "POST", {
      conversationId: id,
      message: "Tekrar merhaba.",
    });
    assert.equal(sent.status, 201);
    assert.equal(sent.data.conversationId, id);
    assert.equal(await prisma.chatMessage.count({ where: { conversationId: id } }), 4);
    assert.equal(await prisma.chatConversation.count({ where: { userId: owner.id } }), 2);
  });
  await t.test("failed write rolls back conversation and messages", async () => {
    const before = await prisma.chatConversation.count({ where: { userId: owner.id } });
    await assert.rejects(
      aiChatRepository.createConversationWithTurn(owner.id, "Rollback", "Merhaba", {
        content: null as unknown as string,
        provider: "synthetic",
        model: "synthetic",
      }),
    );
    assert.equal(await prisma.chatConversation.count({ where: { userId: owner.id } }), before);
    assert.equal(
      await prisma.chatMessage.count({ where: { conversation: { userId: owner.id } } }),
      6,
    );
  });
  await t.test("deletion cascades and disappears from the other session", async () => {
    assert.equal((await request(`/ai-chat/conversations/${id}`, web, "DELETE")).status, 204);
    assert.equal(await prisma.chatConversation.count({ where: { id } }), 0);
    assert.equal(await prisma.chatMessage.count({ where: { conversationId: id } }), 0);
    assert.equal((await request(`/ai-chat/conversations/${id}`, android)).status, 404);
    assert.deepEqual(
      (await request("/ai-chat/conversations", android)).data.conversations.map((row) => row.id),
      [threadIds[1]],
    );
  });
});
