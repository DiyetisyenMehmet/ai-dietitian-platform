import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { firebaseAuthProvider } from "./firebase-auth.provider";
import { accountLinkDelivery } from "./account-link-delivery";
import { ApiError } from "../../utils/api-error";

// Synthetic online-verifier responses only; no real Firebase, mail or account.
test("A2 verified provider facts cannot be inferred from a linked email/provider list", async (t) => {
  const oldFetch = global.fetch;
  const oldKey = env.FIREBASE_WEB_API_KEY;
  env.FIREBASE_WEB_API_KEY = "synthetic-firebase-web-key";
  t.after(() => {
    global.fetch = oldFetch;
    env.FIREBASE_WEB_API_KEY = oldKey;
  });
  const payload = {
    users: [
      {
        localId: "firebase-uid",
        email: "fixture@example.com",
        emailVerified: true,
        providerUserInfo: [{ providerId: "google.com", rawId: "stable-google-sub" }],
      },
    ],
  };
  global.fetch = async () => new Response(JSON.stringify(payload), { status: 200 });
  const token = (provider: string, sub = "firebase-uid", google = "stable-google-sub") =>
    jwt.sign(
      {
        sub,
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_provider: provider, identities: { "google.com": [google] } },
      },
      "synthetic-test-secret",
    );
  await t.test(
    "Google subject comes from verified provider rawId; UID and email are distinct",
    async () => {
      const identity = await firebaseAuthProvider.verifyIdToken(token("google.com"));
      assert.equal(identity.googleSubject, "stable-google-sub");
      assert.equal(identity.signInProvider, "google.com");
      assert.equal(identity.uid, "firebase-uid");
    },
  );
  await t.test(
    "a password token on a Google-linked Firebase user is not Google proof",
    async () => {
      const identity = await firebaseAuthProvider.verifyIdToken(token("password"));
      assert.equal(identity.googleSubject, null);
      assert.equal(identity.signInProvider, "password");
    },
  );
  await t.test(
    "phone proof must match both the verified token and current lookup number",
    async () => {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            users: [
              {
                localId: "firebase-uid",
                phoneNumber: "+905551112233",
                providerUserInfo: [{ providerId: "phone" }],
              },
            ],
          }),
        );
      const current = jwt.sign(
        {
          sub: "firebase-uid",
          auth_time: Math.floor(Date.now() / 1000),
          phone_number: "+905551112233",
          firebase: { sign_in_provider: "phone" },
        },
        "synthetic-test-secret",
      );
      assert.equal(
        (await firebaseAuthProvider.verifyIdToken(current)).phoneAuthenticationVerified,
        true,
      );
      const stale = jwt.sign(
        {
          sub: "firebase-uid",
          auth_time: Math.floor(Date.now() / 1000),
          phone_number: "+905551110000",
          firebase: { sign_in_provider: "phone" },
        },
        "synthetic-test-secret",
      );
      assert.equal(
        (await firebaseAuthProvider.verifyIdToken(stale)).phoneAuthenticationVerified,
        false,
      );
      global.fetch = async () => new Response(JSON.stringify(payload));
    },
  );
  await t.test("token UID and Google subject must match the online lookup", async () => {
    await assert.rejects(
      firebaseAuthProvider.verifyIdToken(token("google.com", "wrong-uid")),
      ApiError,
    );
    await assert.rejects(
      firebaseAuthProvider.verifyIdToken(token("google.com", "firebase-uid", "other-google")),
      ApiError,
    );
  });
  await t.test(
    "failed online verification and malformed tokens never expose provider payloads",
    async () => {
      global.fetch = async () => {
        throw new Error("synthetic secret provider payload");
      };
      await assert.rejects(
        firebaseAuthProvider.verifyIdToken("synthetic-opaque-token"),
        (err: unknown) => err instanceof ApiError && !err.message.includes("payload"),
      );
      global.fetch = async () => new Response(JSON.stringify(payload));
      await assert.rejects(firebaseAuthProvider.verifyIdToken("synthetic-opaque-token"), ApiError);
    },
  );
});

test("A2 email verification fails closed without #49's safe transport", () => {
  assert.throws(() => accountLinkDelivery.assertConfigured(), ApiError);
});
