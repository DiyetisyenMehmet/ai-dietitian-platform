const { test, expect } = require("@playwright/test");

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL || "https://staging.diewish.com";
const API_BASE_URL = process.env.E2E_API_BASE_URL || `${WEB_BASE_URL}/api`;

async function apiJson(request, method, path, { token, data } = {}) {
  const options = {};
  if (token) options.headers = { authorization: `Bearer ${token}` };
  if (data !== undefined) options.data = data;
  const response = await request[method](`${API_BASE_URL}${path}`, options);
  let body = null;
  if (response.status() !== 204) body = await response.json();
  return { response, body };
}

async function grantRequiredConsents(request, token) {
  for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"]) {
    const { response, body } = await apiJson(request, "post", "/legal/consents", {
      token,
      data: { type },
    });
    expect(response.status()).toBe(200);
    expect(body.success).toBe(true);
  }
}

async function loginForToken(request, email, password) {
  const { response, body } = await apiJson(request, "post", "/auth/login", {
    data: { email, password },
  });
  expect(response.status()).toBe(200);
  expect(body.success).toBe(true);
  return body.data.tokens.accessToken;
}

async function getProfile(request, token) {
  const { response, body } = await apiJson(request, "get", "/onboarding", { token });
  expect(response.status()).toBe(200);
  expect(body.success).toBe(true);
  return body.data.profile;
}

async function getHistory(request, token) {
  const { response, body } = await apiJson(request, "get", "/tracking/weight", { token });
  expect(response.status()).toBe(200);
  expect(body.success).toBe(true);
  return body.data.logs;
}

async function expectVisibleWeight(page, kg) {
  const escaped = String(kg).replace(".", "[,.]");
  await expect(page.getByText(new RegExp(`${escaped}\\s*kg`, "i")).first()).toBeVisible();
}

test("staging Body & Weight acceptance: chronology, CRUD, isolation, graph and shared current weight", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const runId = `${Date.now()}.${Math.random().toString(16).slice(2)}`;
  const email = `stage4-weight-a.${runId}@example.com`;
  const otherEmail = `stage4-weight-b.${runId}@example.com`;
  const password = "Stage4WeightPass123";

  // TEST A — a registered account has a safe empty history before onboarding.
  await page.goto(`${WEB_BASE_URL}/register`);
  await expect(page.getByRole("heading", { name: "Hesap oluşturun" })).toBeVisible();
  await page.getByLabel("Ad Soyad").fill("Stage4 Weight User A");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByLabel("Şifre (Tekrar)").fill(password);
  await page.getByRole("button", { name: "Hesap Oluştur" }).click();
  await expect(page).toHaveURL(/\/consent$/);

  let token = await loginForToken(request, email, password);
  expect(await getHistory(request, token)).toEqual([]);

  // Consent + onboarding creates exactly one canonical starting-weight entry.
  const consentCheckboxes = page.getByRole("checkbox");
  await expect(consentCheckboxes).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) await consentCheckboxes.nth(index).click();
  await page.getByRole("button", { name: "Onayla ve Devam Et" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel("Ad Soyad").fill("Stage4 Weight User A");
  await page.getByLabel("Doğum Tarihi").fill("1990-05-20");
  await page.getByRole("radio", { name: "Belirtmek istemiyorum" }).click();
  await page.getByRole("button", { name: /Devam/ }).click();
  await page.getByLabel("Boy (cm)").fill("175");
  await page.getByLabel("Mevcut Kilo (kg)").fill("80.5");
  await page.getByLabel("Hedef Kilo (kg)").fill("65");
  await page.getByRole("button", { name: /Devam/ }).click();
  await page.getByRole("radio", { name: /Orta Aktif/ }).click();
  await page.getByRole("button", { name: /Devam/ }).click();
  await page.getByRole("button", { name: "Hastalığım yok" }).click();
  await page.getByRole("button", { name: "Alerjim yok" }).click();
  await page.getByRole("button", { name: /Devam/ }).click();
  await page.getByRole("radio", { name: /Her şey/ }).click();
  await page.getByLabel("Günlük Su Hedefi (ml)").fill("2500");
  await page.getByRole("button", { name: /Devam/ }).click();
  await page.getByRole("radio", { name: /Gece vardiyası/ }).click();
  await page.getByLabel("Genellikle kaçta uyanırsınız?").fill("17:00");
  await page.getByLabel("Genellikle kaçta uyursunuz?").fill("09:00");
  await page.getByRole("button", { name: "Tamamla" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });

  token = await loginForToken(request, email, password);
  let history = await getHistory(request, token);
  expect(history).toHaveLength(1);
  expect(history[0].note).toBe("Başlangıç");
  expect(history[0].weightKg).toBe(80.5);
  expect((await getProfile(request, token)).currentWeightKg).toBe(80.5);

  // TEST C — newer entry becomes authoritative.
  const second = await apiJson(request, "post", "/tracking/weight", {
    token,
    data: { weightKg: 79.8 },
  });
  expect(second.response.status()).toBe(201);
  expect(second.body.success).toBe(true);
  const latestId = second.body.data.log.id;
  expect((await getProfile(request, token)).currentWeightKg).toBe(79.8);

  // TEST D — a backdated entry is history-only and cannot overwrite currentWeight.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const backdated = await apiJson(request, "post", "/tracking/weight", {
    token,
    data: { weightKg: 82, loggedAt: yesterday },
  });
  expect(backdated.response.status()).toBe(201);
  expect(backdated.body.success).toBe(true);
  const historicalId = backdated.body.data.log.id;
  expect((await getProfile(request, token)).currentWeightKg).toBe(79.8);
  history = await getHistory(request, token);
  expect(history.some((entry) => entry.id === historicalId)).toBe(true);
  expect(new Date(history[0].loggedAt).getTime()).toBeGreaterThanOrEqual(
    new Date(history[1].loggedAt).getTime(),
  );

  // TEST E — editing latest re-derives currentWeight.
  const editedLatest = await apiJson(request, "patch", `/tracking/weight/${latestId}`, {
    token,
    data: { weightKg: 79.7 },
  });
  expect(editedLatest.response.status()).toBe(200);
  expect(editedLatest.body.data.log.weightKg).toBe(79.7);
  expect((await getProfile(request, token)).currentWeightKg).toBe(79.7);

  // TEST F — editing historical remains historical and does not change currentWeight.
  const editedHistorical = await apiJson(request, "patch", `/tracking/weight/${historicalId}`, {
    token,
    data: { weightKg: 81.8 },
  });
  expect(editedHistorical.response.status()).toBe(200);
  expect((await getProfile(request, token)).currentWeightKg).toBe(79.7);

  // TEST I — invalid create and edit inputs never write.
  const countBeforeInvalid = (await getHistory(request, token)).length;
  for (const value of [0, -1, 24.9, 400.1, 69.85]) {
    const invalidCreate = await apiJson(request, "post", "/tracking/weight", {
      token,
      data: { weightKg: value },
    });
    expect(invalidCreate.response.status()).toBe(422);
    const invalidPatch = await apiJson(request, "patch", `/tracking/weight/${latestId}`, {
      token,
      data: { weightKg: value },
    });
    expect(invalidPatch.response.status()).toBe(422);
  }
  expect((await getHistory(request, token)).length).toBe(countBeforeInvalid);
  expect((await getProfile(request, token)).currentWeightKg).toBe(79.7);

  // TEST J — goal weight persists without manufacturing another weight-history row.
  const countBeforeGoal = (await getHistory(request, token)).length;
  const goalUpdate = await apiJson(request, "post", "/onboarding", {
    token,
    data: {
      fullName: "Stage4 Weight User A",
      dateOfBirth: "1990-05-20",
      gender: "PREFER_NOT_TO_SAY",
      heightCm: 175,
      currentWeightKg: 79.7,
      targetWeightKg: 64.5,
      activityLevel: "MODERATE",
      healthConditions: [],
      allergies: [],
      dietaryPreference: "OMNIVORE",
      dailyWaterGoalMl: 2500,
      workScheduleType: "NIGHT_SHIFT",
      usualWakeTime: "17:00",
      usualSleepTime: "09:00",
    },
  });
  expect(goalUpdate.response.status()).toBe(200);
  expect((await getProfile(request, token)).targetWeightKg).toBe(64.5);
  expect((await getHistory(request, token)).length).toBe(countBeforeGoal);

  // GRAPH + DATA CONSISTENCY — real staging browser uses the same authoritative value.
  await page.goto(`${WEB_BASE_URL}/progress`);
  await expect(page.getByText("Kilo İlerlemen", { exact: true })).toBeVisible();
  const graph = page.getByRole("img", { name: "Kilo değişim grafiği" });
  await expect(graph).toBeVisible();
  await expect(graph.locator("desc")).toContainText(/3 ölçüm/);
  await expect(graph.locator("desc")).toContainText(/son ölçüm 79[,.]7 kg/i);

  await page.goto(`${WEB_BASE_URL}/profile`);
  await expect(page.getByText("Güncel Kilo", { exact: true })).toBeVisible();
  await expectVisibleWeight(page, 79.7);
  await expect(page.getByText("Hedef Kilo", { exact: true })).toBeVisible();
  await expectVisibleWeight(page, 64.5);

  await page.goto(`${WEB_BASE_URL}/dashboard`);
  await expectVisibleWeight(page, 79.7);

  // TEST K — B cannot read, modify, or delete A's entry by id.
  const otherRegistration = await apiJson(request, "post", "/auth/register", {
    data: { email: otherEmail, password, fullName: "Stage4 Weight User B" },
  });
  expect(otherRegistration.response.status()).toBe(201);
  const otherToken = otherRegistration.body.data.tokens.accessToken;
  await grantRequiredConsents(request, otherToken);

  const crossGet = await apiJson(request, "get", `/tracking/weight/${latestId}`, {
    token: otherToken,
  });
  expect(crossGet.response.status()).toBe(404);
  const crossPatch = await apiJson(request, "patch", `/tracking/weight/${latestId}`, {
    token: otherToken,
    data: { weightKg: 90 },
  });
  expect(crossPatch.response.status()).toBe(404);
  const crossDelete = await request.delete(`${API_BASE_URL}/tracking/weight/${latestId}`, {
    headers: { authorization: `Bearer ${otherToken}` },
  });
  expect(crossDelete.status()).toBe(404);

  // TEST H — deleting historical has no current-weight effect.
  const deleteHistorical = await request.delete(`${API_BASE_URL}/tracking/weight/${historicalId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(deleteHistorical.status()).toBe(204);
  expect((await getProfile(request, token)).currentWeightKg).toBe(79.7);

  // TEST G — deleting latest promotes the previous chronological entry (baseline here).
  const deleteLatest = await request.delete(`${API_BASE_URL}/tracking/weight/${latestId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(deleteLatest.status()).toBe(204);
  expect((await getProfile(request, token)).currentWeightKg).toBe(80.5);

  // The canonical starting baseline is protected from destructive edit/delete.
  history = await getHistory(request, token);
  const baseline = history.find((entry) => entry.note === "Başlangıç");
  expect(baseline).toBeTruthy();
  const baselinePatch = await apiJson(request, "patch", `/tracking/weight/${baseline.id}`, {
    token,
    data: { weightKg: 80.4 },
  });
  expect(baselinePatch.response.status()).toBe(409);
  const baselineDelete = await request.delete(`${API_BASE_URL}/tracking/weight/${baseline.id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(baselineDelete.status()).toBe(409);

  // Final shared-value check after a fresh current measurement.
  const finalEntry = await apiJson(request, "post", "/tracking/weight", {
    token,
    data: { weightKg: 79.6 },
  });
  expect(finalEntry.response.status()).toBe(201);
  expect((await getProfile(request, token)).currentWeightKg).toBe(79.6);

  await page.goto(`${WEB_BASE_URL}/progress`);
  await expect(page.getByRole("img", { name: "Kilo değişim grafiği" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("img", { name: "Kilo değişim grafiği" })).toBeVisible();

  await page.goto(`${WEB_BASE_URL}/profile`);
  await expectVisibleWeight(page, 79.6);
  await page.goto(`${WEB_BASE_URL}/dashboard`);
  await expectVisibleWeight(page, 79.6);
});
