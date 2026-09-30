import jwt, { type JwtPayload } from "jsonwebtoken";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs";
const GOOGLE_ISSUER = "https://accounts.google.com";
const CERT_FETCH_TIMEOUT_MS = 5_000;
const FALLBACK_CERT_TTL_MS = 5 * 60 * 1000;

export interface SchedulerOidcConfig {
  audience: string;
  serviceAccountEmail: string;
}

export type SchedulerCertificateResolver = (kid: string) => Promise<string | null>;

interface SchedulerClaims extends JwtPayload {
  email?: string;
  email_verified?: boolean;
}

let certCache: { values: Record<string, string>; expiresAt: number } = {
  values: {},
  expiresAt: 0,
};

function cacheTtlMs(cacheControl: string | null): number {
  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl ?? "");
  if (!match) return FALLBACK_CERT_TTL_MS;
  return Math.max(60, Number(match[1])) * 1000;
}

async function refreshGoogleCertificates(): Promise<Record<string, string>> {
  const response = await fetch(GOOGLE_CERTS_URL, {
    signal: AbortSignal.timeout(CERT_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Google OIDC certificate fetch failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Google OIDC certificate response is invalid.");
  }

  const values = Object.fromEntries(
    Object.entries(payload).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
  certCache = {
    values,
    expiresAt: Date.now() + cacheTtlMs(response.headers.get("cache-control")),
  };
  return values;
}

async function googleCertificateForKid(kid: string): Promise<string | null> {
  let values = certCache.values;
  if (Date.now() >= certCache.expiresAt || Object.keys(values).length === 0) {
    values = await refreshGoogleCertificates();
  }
  return values[kid] ?? null;
}

/**
 * Verifies the Google-signed service-account ID token used by Cloud Scheduler.
 * Signature, issuer, audience and the exact expected service-account email must
 * all match before the scheduler trigger is accepted.
 */
export async function verifySchedulerOidcToken(
  token: string,
  config: SchedulerOidcConfig,
  resolveCertificate: SchedulerCertificateResolver = googleCertificateForKid,
): Promise<SchedulerClaims> {
  const decoded = jwt.decode(token, { complete: true });
  if (
    !decoded ||
    typeof decoded !== "object" ||
    decoded.header.alg !== "RS256" ||
    typeof decoded.header.kid !== "string"
  ) {
    throw new Error("Scheduler token header is invalid.");
  }

  const certificate = await resolveCertificate(decoded.header.kid);
  if (!certificate) {
    throw new Error("Scheduler token signing key is unknown.");
  }

  const claims = jwt.verify(token, certificate, {
    algorithms: ["RS256"],
    audience: config.audience,
    issuer: GOOGLE_ISSUER,
    clockTolerance: 5,
  }) as SchedulerClaims;

  if (
    claims.email_verified !== true ||
    claims.email?.toLowerCase() !== config.serviceAccountEmail.toLowerCase()
  ) {
    throw new Error("Scheduler service-account identity does not match.");
  }

  return claims;
}
