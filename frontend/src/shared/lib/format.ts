/** Time-of-day aware Turkish greeting. */
export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 6) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

/** Long, localized Turkish date, e.g. "9 Temmuz Perşembe". */
export function formatLongDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(date);
}

/** Formats a number with Turkish thousands separators. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("tr-TR").format(value);
}

/** Clamps a 0..1 ratio and returns a whole percentage. */
export function toPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}
