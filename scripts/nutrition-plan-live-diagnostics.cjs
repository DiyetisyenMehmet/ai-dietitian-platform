// Staging-only observer: uses the deployed image, actual provider and normal
// authenticated routes. It never changes provider output or safety checks.
const { randomBytes, createHash } = require('node:crypto');
if (process.env.DIEWISH_ENVIRONMENT !== 'staging' ||
    process.env.DIAGNOSTIC_BUCKET !== 'project-a2e260c1-839d-4f1d-b90-diewish-health-staging' ||
    !/^nutrition-diagnostics\/[0-9]+\/evidence\.json$/.test(process.env.DIAGNOSTIC_OBJECT || '')) {
  throw new Error('Refusing nutrition diagnostics outside isolated staging');
}
const { getAIAdapter } = require('/app/dist/modules/blood-test-analysis/ai-adapter/ai-adapter.factory');
const { findNutritionTargetViolations } = require('/app/dist/modules/nutrition-plan/meal-generator/nutrition-target-validator');
const { prisma } = require('/app/dist/lib/prisma');
const { disconnectNutritionGenerationLocks } = require('/app/dist/modules/nutrition-plan/nutrition-plan-generation-lock');
const evidence = { sourceSha: process.env.DIEWISH_APPLICATION_SHA, providerCalls: [], transports: [], checks: {} };
const originalFetch = global.fetch;
const epoch = Date.now();
global.fetch = async (...args) => {
  const url = String(args[0]);
  if (!url.includes('aiplatform.googleapis.com') || !url.endsWith(':generateContent')) return originalFetch(...args);
  const started = Date.now();
  const record = { startedMs: started - epoch };
  evidence.transports.push(record);
  try {
    const response = await originalFetch(...args);
    record.httpStatus = response.status;
    const body = await response.clone().json().catch(() => ({}));
    record.elapsedMs = Date.now() - started;
    record.finishReason = body.candidates?.[0]?.finishReason;
    record.usage = body.usageMetadata;
    return response;
  } catch (error) {
    record.elapsedMs = Date.now() - started; record.error = error.name; throw error;
  }
};
const adapter = getAIAdapter();
evidence.provider = adapter.info;
const generate = adapter.generateNutritionPlan.bind(adapter);
adapter.generateNutritionPlan = async input => {
  const started = Date.now();
  const record = {
    startDay: input.startDayNumber || 1, requestedDays: input.cycleLengthDays,
    requestedDayNumbers: input.requestedDayNumbers,
    inputHash: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
    startedMs: started - epoch,
    targets: { calories: input.dailyCalories, protein: input.proteinGrams, carbs: input.carbsGrams, fat: input.fatGrams },
  };
  evidence.providerCalls.push(record);
  try {
    const output = await generate(input);
    record.elapsedMs = Date.now() - started;
    record.violations = findNutritionTargetViolations(output.cycle, input);
    record.days = output.cycle.map((day, index) => {
      const totals = { calories: day.totalCalories, protein: day.totalProteinGrams, carbs: day.totalCarbsGrams, fat: day.totalFatGrams };
      const meals = day.meals.map((meal, i) => ({ mealIndex: i + 1, calories: meal.calories, protein: meal.proteinGrams, carbs: meal.carbsGrams, fat: meal.fatGrams }));
      const sum = Object.fromEntries(Object.keys(totals).map(field => [field, meals.reduce((n, meal) => n + meal[field], 0)]));
      return {
        dayNumber: input.requestedDayNumbers?.[index] || record.startDay + index,
        totals, meals, mealSum: sum,
        targetDeviationPercent: Object.fromEntries(Object.keys(totals).map(field => [field, Math.round((totals[field] - record.targets[field]) / record.targets[field] * 10000) / 100])),
        mealSumDifference: Object.fromEntries(Object.keys(totals).map(field => [field, totals[field] - sum[field]])),
      };
    });
    return output;
  } catch (error) { record.elapsedMs = Date.now() - started; record.errorCode = error.code || error.name; throw error; }
};
let server, token, password;
async function request(path, body) {
  const started = Date.now();
  const response = await originalFetch('http://127.0.0.1:4000/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(450000),
  });
  const value = await response.json();
  return { status: response.status, elapsedMs: Date.now() - started, value };
}
async function publish() {
  const metadata = await originalFetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } });
  const credential = await metadata.json();
  const target = `https://storage.googleapis.com/upload/storage/v1/b/${process.env.DIAGNOSTIC_BUCKET}/o?uploadType=media&name=${encodeURIComponent(process.env.DIAGNOSTIC_OBJECT)}`;
  const response = await originalFetch(target, { method: 'POST', headers: { authorization: `Bearer ${credential.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify(evidence) });
  if (!response.ok) throw new Error(`Could not store synthetic diagnostic metrics: HTTP ${response.status}`);
}
(async () => {
  try {
    const { createApp } = require('/app/dist/app');
    server = createApp().listen(4000, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    password = `NutritionDiag04-${randomBytes(16).toString('hex')}!`;
    const registration = await request('/auth/register', { email: `nutrition-live-diag-${Date.now()}@example.com`, password, fullName: 'Nutrition Synthetic Diagnostics' });
    if (registration.status !== 201) throw new Error(`Registration blocked: ${registration.status}`);
    token = registration.value.data.tokens.accessToken;
    for (const type of ['TERMS_OF_SERVICE', 'MEDICAL_DISCLAIMER', 'KVKK_EXPLICIT_CONSENT']) {
      const consent = await request('/legal/consents', { type });
      if (consent.status !== 200) throw new Error(`Consent blocked: ${consent.status}`);
    }
    const profile = await request('/onboarding', {
      fullName: 'Nutrition Synthetic Diagnostics', dateOfBirth: '1990-05-20', gender: 'PREFER_NOT_TO_SAY',
      heightCm: 175, currentWeightKg: 70, targetWeightKg: 65, activityLevel: 'MODERATE', healthConditions: [], allergies: [],
      dietaryPreference: 'OMNIVORE', dailyWaterGoalMl: 2500, workScheduleType: 'REGULAR', usualWakeTime: '07:00', usualSleepTime: '23:00',
    });
    if (profile.status !== 200) throw new Error(`Profile blocked: ${profile.status}`);
    const generated = await request('/nutrition-plans/generate', { duration: 'SEVEN_DAY', startDate: new Date().toISOString().slice(0, 10) });
    evidence.generation = { httpStatus: generated.status, elapsedMs: generated.elapsedMs, code: generated.value.error?.code };
    const plans = await request('/nutrition-plans');
    evidence.checks.plans = plans.value.data.plans.map(plan => ({ status: plan.status, isActive: plan.isActive, duration: plan.duration, days: plan.dailyPlans?.cycle?.length, processingTimeMs: plan.processingTimeMs }));
    const usage = await request('/ai-usage?feature=NUTRITION_PLAN');
    evidence.checks.quotaUsed = usage.value.data.usage[0].day.used;
  } catch (error) { evidence.failure = { name: error.name, code: error.code, message: error.message }; }
  finally {
    if (token) {
      try { evidence.checks.cleanupHttp = (await request('/account/deletion/request', { password })).status; }
      catch (error) { evidence.checks.cleanupFailure = error.name; }
    }
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await disconnectNutritionGenerationLocks(); await prisma.$disconnect();
    await publish();
  }
})().then(() => process.exit(0)).catch(error => { console.error(JSON.stringify({ diagnosticFailure: error.name })); process.exit(1); });
