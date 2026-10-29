/** No default DATABASE_URL fallback: tests must explicitly select disposable PG. */
export function localCheckInTestUrl(): string {
  const raw = process.env.MEAL_CHECK_IN_TEST_DATABASE_URL;
  if (process.env.MEAL_CHECK_IN_LOCAL_TEST !== "1" || !raw) {
    throw new Error("Explicit disposable local PostgreSQL test configuration is required.");
  }
  const url = new URL(raw);
  if (
    process.env.NODE_ENV !== "test" ||
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    !/^\/app13_mealcheckin_[a-z0-9_]+$/.test(url.pathname) ||
    [...url.searchParams.keys()].some(
      (key) => !["schema", "connection_limit", "application_name"].includes(key),
    )
  ) {
    throw new Error("Refusing non-local or non-disposable PostgreSQL target.");
  }
  return url.toString();
}
