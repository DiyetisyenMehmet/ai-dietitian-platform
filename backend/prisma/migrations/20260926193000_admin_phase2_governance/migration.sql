CREATE TABLE "admin_invitations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "invitedByAdminId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "admin_invitations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_invitations_email_createdAt_idx"
ON "admin_invitations"("email", "createdAt");

CREATE INDEX "admin_invitations_userId_createdAt_idx"
ON "admin_invitations"("userId", "createdAt");

CREATE INDEX "admin_invitations_invitedByAdminId_createdAt_idx"
ON "admin_invitations"("invitedByAdminId", "createdAt");

CREATE INDEX "admin_invitations_expiresAt_idx"
ON "admin_invitations"("expiresAt");

ALTER TABLE "admin_invitations"
ADD CONSTRAINT "admin_invitations_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_invitations"
ADD CONSTRAINT "admin_invitations_invitedByAdminId_fkey"
FOREIGN KEY ("invitedByAdminId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
