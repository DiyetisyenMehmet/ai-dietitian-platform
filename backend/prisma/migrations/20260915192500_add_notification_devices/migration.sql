CREATE TABLE "notification_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "appVersion" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_devices_token_key" ON "notification_devices"("token");
CREATE INDEX "notification_devices_userId_enabled_idx" ON "notification_devices"("userId", "enabled");

ALTER TABLE "notification_devices"
ADD CONSTRAINT "notification_devices_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
