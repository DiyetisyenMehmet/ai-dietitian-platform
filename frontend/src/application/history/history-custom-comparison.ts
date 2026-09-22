export interface CustomHistoryComparisonInput {
  period1Start: string;
  period1End: string;
  period2Start: string;
  period2End: string;
}

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDateKey(value: string): boolean {
  const match = DATE_KEY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function nextDateKey(value: string): string {
  const match = DATE_KEY_RE.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function customRangeDayCount(startDate: string, endDate: string): number | null {
  if (!validDateKey(startDate) || !validDateKey(endDate) || startDate > endDate) return null;

  let cursor = startDate;
  let days = 1;
  while (cursor < endDate && days <= 31) {
    cursor = nextDateKey(cursor);
    days += 1;
  }
  return cursor === endDate ? days : days;
}

export function validateCustomComparisonInput(
  input: CustomHistoryComparisonInput,
  today?: string,
): string | null {
  if (
    !input.period1Start ||
    !input.period1End ||
    !input.period2Start ||
    !input.period2End
  ) {
    return "Tüm tarih alanlarını doldur.";
  }

  if (
    !validDateKey(input.period1Start) ||
    !validDateKey(input.period1End) ||
    !validDateKey(input.period2Start) ||
    !validDateKey(input.period2End)
  ) {
    return "Geçerli tarihler seç.";
  }

  if (input.period1Start > input.period1End || input.period2Start > input.period2End) {
    return "Başlangıç tarihi bitiş tarihinden sonra olamaz.";
  }

  if (
    today &&
    (input.period1End > today ||
      input.period1Start > today ||
      input.period2End > today ||
      input.period2Start > today)
  ) {
    return "Gelecek tarih karşılaştırılamaz.";
  }

  const period1Days = customRangeDayCount(input.period1Start, input.period1End);
  const period2Days = customRangeDayCount(input.period2Start, input.period2End);

  if (period1Days === null || period2Days === null) {
    return "Geçerli tarihler seç.";
  }
  if (period1Days > 31 || period2Days > 31) {
    return "Her dönem en fazla 31 gün içerebilir.";
  }
  if (period1Days !== period2Days) {
    return "Karşılaştırılacak dönemler aynı sayıda gün içermelidir.";
  }
  return null;
}
