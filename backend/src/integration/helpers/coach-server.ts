// Hermetic existing-CI fixture. Never a deploy entry point or a production AI provider.
import { createApp } from "../../app";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { setAIAdapter } from "../../modules/blood-test-analysis/ai-adapter/ai-adapter.factory";
import type { IAIAdapter } from "../../modules/blood-test-analysis/ai-adapter/ai-adapter.interface";
import type { AddressInfo } from "node:net";
import { coachConnectionCount } from "../../modules/ai-chat/coach-stream";

if (env.NODE_ENV !== "test" || !env.COACH_SYNC_ENABLED) throw new Error("Test-only Coach fixture");
const unused = async (): Promise<never> => {
  throw new Error("Unused synthetic provider method");
};
const adapter: IAIAdapter = {
  info: { provider: "integration-fake", model: "event-contract" },
  validateBloodTestDocument: unused,
  extractBloodTestValues: unused,
  analyzeBloodTestValues: unused,
  generateNutritionPlan: unused,
  chatWithDietitian: async () => ({ reply: "Sentetik test yanıtı." }),
};
setAIAdapter(adapter);
let chatReads = 0;
prisma.$use(async (params, next) => {
  if (
    ["ChatConversation", "ChatMessage"].includes(params.model ?? "") &&
    ["findMany", "findFirst", "findUnique"].includes(params.action)
  )
    chatReads++;
  return next(params);
});
process.on("message", (message) => {
  if ((message as { command?: string }).command !== "metrics") return;
  const cpu = process.cpuUsage(),
    memory = process.memoryUsage();
  process.send?.({
    type: "metrics",
    userUs: cpu.user,
    systemUs: cpu.system,
    rss: memory.rss,
    heap: memory.heapUsed,
    connections: coachConnectionCount(),
    chatReads,
  });
});
const server = createApp().listen(process.send ? 0 : env.PORT, "127.0.0.1", () => {
  process.send?.({ port: (server.address() as AddressInfo).port });
});
const close = () => {
  server.closeAllConnections();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
};
process.on("SIGTERM", close);
process.on("SIGINT", close);
