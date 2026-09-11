import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LEGAL_DOCUMENT_BY_TYPE,
  MANDATORY_CONSENTS,
} from "./constants";

test("health-data consent is voluntary globally but remains grantable and withdrawable", () => {
  const health = LEGAL_DOCUMENT_BY_TYPE.KVKK_EXPLICIT_CONSENT;

  assert.equal(health.mandatory, false);
  assert.equal(health.consentable, true);
  assert.equal(MANDATORY_CONSENTS.includes("KVKK_EXPLICIT_CONSENT"), false);
});

test("privacy illumination remains informational while terms and medical acknowledgement stay mandatory", () => {
  assert.equal(LEGAL_DOCUMENT_BY_TYPE.PRIVACY_POLICY.consentable, false);
  assert.equal(LEGAL_DOCUMENT_BY_TYPE.PRIVACY_POLICY.mandatory, false);
  assert.equal(LEGAL_DOCUMENT_BY_TYPE.TERMS_OF_SERVICE.consentable, true);
  assert.equal(LEGAL_DOCUMENT_BY_TYPE.TERMS_OF_SERVICE.mandatory, true);
  assert.equal(LEGAL_DOCUMENT_BY_TYPE.MEDICAL_DISCLAIMER.consentable, true);
  assert.equal(LEGAL_DOCUMENT_BY_TYPE.MEDICAL_DISCLAIMER.mandatory, true);
});
