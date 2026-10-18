"""Disposable integration preview; never merges or updates a GitHub ref.

Only the pinned #49 source and this A2 source are used. The four known A1/#49
hunks and the provider guard overlap are explicitly resolved; unknown conflicts
abort. The checked-out A2 and existing #49 branch are never modified.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess

BASE = "de3bbc689d8e5f8b6bdfa74e93f6ba6877fb79b5"
RECOVERY = "e5291d66b8537bcc24f3dc3053869e9883b14bb6"
parser = argparse.ArgumentParser()
parser.add_argument("--source", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
source, output = args.source.resolve(), args.output.resolve()
if output.exists() or source == output or source in output.parents:
    raise SystemExit("Preview needs a new directory outside the source checkout.")

def git(*arguments, cwd=source, check=True, **kwargs):
    return subprocess.run(["git", *arguments], cwd=cwd, check=check,
                          capture_output=True, text=True, **kwargs)

def recovery(path):
    return git("show", f"{RECOVERY}:{path}").stdout

def write(path, text):
    (output / path).write_text(text)

patch = git("diff", "--binary", BASE, "HEAD").stdout
git("worktree", "add", "--detach", str(output), RECOVERY)
applied = git("apply", "--3way", "-", cwd=output, input=patch, check=False)
conflicts = set(git("diff", "--name-only", "--diff-filter=U", cwd=output).stdout.splitlines())
known = {"backend/package.json", "backend/prisma/schema.prisma",
         "backend/src/modules/auth/auth.repository.ts",
         "backend/src/modules/account/account.repository.ts",
         "backend/src/modules/identity/external-login.service.ts"}
if applied.returncode not in (0, 1) or conflicts - known:
    raise SystemExit("Unexpected preview conflict; inspect without changing either branch.")

package_path = "backend/package.json"
package = json.loads(recovery(package_path))
ours = json.loads((source / package_path).read_text())
for key, value in ours["scripts"].items():
    if key not in package["scripts"]:
        package["scripts"][key] = value
    elif key == "test:integration":
        existing = package["scripts"][key].split()
        package["scripts"][key] += "".join(" " + part for part in value.split()
                                           if part.endswith(".test.ts") and part not in existing)
write(package_path, json.dumps(package, indent=2) + "\n")

schema_path = "backend/prisma/schema.prisma"
schema = recovery(schema_path)
assert "authVersion" in schema and "PasswordResetDelivery" in schema
schema = schema.replace("  passwordHash        String\n", "  passwordHash        String\n  hasUsablePassword   Boolean?\n", 1)
schema = schema.replace("  refreshTokens     RefreshToken[]", "  accountIdentities AccountIdentity[]\n  identityOperations AccountIdentityOperation[]\n  refreshTokens     RefreshToken[]", 1)
ours = (source / schema_path).read_text()
blocks = []
for name in ("AccountIdentityKind", "AccountIdentity", "AccountIdentityOperationPurpose", "AccountIdentityOperation"):
    match = re.search(r"\n(?:enum|model) " + name + r" \{[^}]*\}\n", ours)
    assert match, name
    blocks.append(match.group())
schema = schema.replace("\nenum Gender {", "\n".join(blocks) + "\nenum Gender {", 1)
write(schema_path, schema)

path = "backend/src/modules/auth/auth.repository.ts"
text = recovery(path)
text = text.replace("createUser(data: { email: string; passwordHash: string; fullName?: string })", "createUser(data: { email: string; passwordHash: string; fullName?: string; hasUsablePassword?: boolean })", 1)
text = text.replace("updateLastLogin(userId: string):", "updateLastLogin(userId: string, passwordProven = false):", 1)
text = text.replace("data: { lastLoginAt: new Date() },", "data: { lastLoginAt: new Date(), ...(passwordProven ? { hasUsablePassword: true } : {}) },", 1)
assert "authVersion !== user.authVersion" in text
write(path, text)

path = "backend/src/modules/account/account.repository.ts"
text = recovery(path)
text = text.replace("data: { passwordHash, authVersion: { increment: 1 } }", "data: { passwordHash, hasUsablePassword: true, authVersion: { increment: 1 } }")
text = text.replace("data: { passwordHash }", "data: { passwordHash, hasUsablePassword: true }")
assert all(marker in text for marker in ("FOR UPDATE", "expiresAt: { gt: now }", "passwordResetDelivery.updateMany", "authVersion: { increment: 1 }"))
write(path, text)

# Retain #49's full exact-token provider check before any A2 safe branch.
path = "backend/src/modules/identity/external-login.service.ts"
text = (source / path).read_text()
original = recovery(path)
start = original.index("    // accounts:lookup")
end = original.index("    if (!identity.phoneNumber && !social)", start)
guard = original[start:end]
text = text.replace('import crypto from "node:crypto";', 'import crypto from "node:crypto";\nimport jwt, { type JwtPayload } from "jsonwebtoken";', 1)
anchor = "    const identity = await firebaseAuthProvider.verifyIdToken(idToken);"
text = text.replace(anchor, anchor + "\n" + guard, 1)
text, count = re.subn(r'    const social = identity.providers.some\([\s\S]*?\n    \);\n', "", text, count=1)
assert count == 1
write(path, text)

for path in known:
    git("add", path, cwd=output)
assert not git("diff", "--name-only", "--diff-filter=U", cwd=output).stdout.strip()
git("diff", "--check", cwd=output)
# Original SMTP source and recovery implementation stay byte-for-byte #49,
# except the explicit additional provenance field in its two password writes.
assert (output / "backend/src/lib/mailer.ts").read_text() == recovery("backend/src/lib/mailer.ts")
assert (output / "backend/src/modules/account/account.service.ts").read_text() == recovery("backend/src/modules/account/account.service.ts")
print("Prepared isolated A2+#49 preview; provider, reset, SMTP and session guards retained. No ref/merge/deploy action.")
