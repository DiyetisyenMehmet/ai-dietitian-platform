import express from "express";
import type { AddressInfo } from "node:net";
import { localCheckInTestUrl } from "./meal-check-in.local-test-guard";

async function main() {
  process.env.DATABASE_URL = localCheckInTestUrl();
  const { trackingRouter } = await import("./tracking.routes");
  const { errorHandler } = await import("../../middleware/error-handler");
  const { prisma } = await import("../../lib/prisma");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.log = { warn() {}, error() {} } as unknown as typeof req.log;
    // Test-only response loss after the real transaction has committed.
    if (req.get("x-app13-test-drop-response") === "1") {
      res.json = () => {
        req.socket.destroy();
        return res;
      };
    }
    next();
  });
  app.use("/api/tracking", trackingRouter);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1", async () => {
    const [{ pid }] = await prisma.$queryRaw<
      Array<{ pid: number }>
    >`SELECT pg_backend_pid() AS pid`;
    process.send?.({
      port: (server.address() as AddressInfo).port,
      databasePid: pid,
      processPid: process.pid,
    });
  });
  process.on("SIGTERM", () => {
    server.close(() => {
      void prisma.$disconnect().then(() => process.exit(0));
    });
    server.closeAllConnections();
  });
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
