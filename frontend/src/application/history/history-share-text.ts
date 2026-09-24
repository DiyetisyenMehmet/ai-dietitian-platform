import type { HistorySharePayload, HistoryShareSection } from "./history-share";

export const HISTORY_SHARE_BRAND_CLOSING = "Diewish ile ilerlememi takip ediyorum. 🌿";

const SECTION_HEADING: Record<string, string> = {
  Beslenme: "🥗 Beslenme",
  Su: "💧 Su Tüketimi",
  Hareket: "🚶 Aktivite",
  Uyku: "😴 Uyku",
};

function heading(payload: HistorySharePayload): string {
  if (payload.kind === "comparison") {
    const label =
      payload.scope === "CUSTOM"
        ? "Özel Karşılaştırmam"
        : payload.scope === "WEEK"
          ? "Haftalık Karşılaştırmam"
          : "Aylık Karşılaştırmam";
    return `${payload.periodLabel} • Diewish ${label} 🌿`;
  }

  const label =
    payload.scope === "DAY"
      ? "Gün Özetim"
      : payload.scope === "WEEK"
        ? "Hafta Özetim"
        : "Ay Özetim";
  return `${payload.periodLabel} • Diewish ${label} 🌿`;
}

function visibleLine(line: string): boolean {
  const value = line.trim();
  if (!value) return false;
  if (/(^|:\s*)—(?:\s|$)/u.test(value)) return false;
  if (/\((?:kayıt yok|değer hesaplanamıyor|veri şu anda alınamıyor)/iu.test(value)) return false;
  return true;
}

function professionalLine(
  line: string,
  payload: HistorySharePayload,
  section: HistoryShareSection,
): string {
  const replacements: Array<[RegExp, string]> = [
    [/^Kalori:/u, "Toplam enerji:"],
    [/^Hareket:/u, "Toplam hareket:"],
    [/^Uyku:/u, "Toplam uyku:"],
    [/^Ortalama Kalori:/u, "Günlük ortalama enerji:"],
    [/^Ortalama Protein:/u, "Günlük ortalama protein:"],
    [/^Ortalama Karbonhidrat:/u, "Günlük ortalama karbonhidrat:"],
    [/^Ortalama Yağ:/u, "Günlük ortalama yağ:"],
    [/^Toplam Su:/u, "Toplam:"],
    [/^Ortalama Su:/u, "Günlük ortalama:"],
    [/^Toplam Aktivite Süresi:/u, "Toplam hareket:"],
    [/^Toplam Mesafe:/u, "Mesafe:"],
    [/^Aktif Enerji:/u, "Aktif enerji:"],
    [/^Ortalama Uyku Süresi:/u, "Ortalama:"],
    [/^Kilo Değişimi:/u, "Dönem değişimi:"],
  ];

  let result = line.trim();
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(result)) {
      result = result.replace(pattern, replacement);
      break;
    }
  }

  if (section.title === "Kilo" && payload.scope === "DAY" && !result.includes(":")) {
    return `Bugünkü kayıt: ${result}`;
  }
  return result;
}

function sectionHeading(payload: HistorySharePayload, section: HistoryShareSection): string {
  if (section.title === "Kilo") {
    return payload.scope === "DAY" ? "⚖️ Kilo" : "⚖️ Kilo Değişimi";
  }
  if (payload.kind === "comparison") {
    if (section.title === "Su") return "💧 Su Tüketimi";
    if (section.title === "Protein" || section.title === "Ortalama Kalori") {
      return `🥗 ${section.title}`;
    }
    if (section.title.includes("Aktivite")) return `🚶 ${section.title}`;
    if (section.title.includes("Uyku")) return `😴 ${section.title}`;
    if (section.title.includes("Kilo")) return `⚖️ ${section.title}`;
    return `📊 ${section.title}`;
  }
  return SECTION_HEADING[section.title] ?? `📊 ${section.title}`;
}

function preparedSections(payload: HistorySharePayload): Array<{ heading: string; lines: string[]; key: string }> {
  return payload.sections
    .map((section) => ({
      key: section.title,
      heading: sectionHeading(payload, section),
      lines: section.lines
        .filter(visibleLine)
        .map((line) => professionalLine(line, payload, section))
        .filter(Boolean),
    }))
    .filter((section) => section.lines.length > 0);
}

function joinTurkish(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} ve ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} ve ${values.at(-1)}`;
}

function generalStatus(payload: HistorySharePayload, sectionKeys: string[]): string | null {
  if (payload.kind === "comparison" || sectionKeys.length === 0) return null;

  const names = sectionKeys.map((key) => {
    if (key === "Beslenme") return "beslenme";
    if (key === "Su") return "su";
    if (key === "Hareket") return "aktivite";
    if (key === "Uyku") return "uyku";
    if (key === "Kilo") return "kilo";
    return key.toLocaleLowerCase("tr-TR");
  });
  const joined = joinTurkish(names);

  let first: string;
  if (payload.scope === "DAY") {
    if (sectionKeys.length === 1 && sectionKeys[0] === "Su") {
      first =
        "Bugün kaydettiğim verilere göre takip edilen başlıca alan su tüketimim oldu.";
    } else if (sectionKeys.length === 1) {
      first = `Bugün kaydettiğim verilere göre takip edilen başlıca alan ${joined} oldu.`;
    } else {
      first = `Bugün ${joined} kayıtlarımı birlikte takip ettim.`;
    }
  } else {
    const period = payload.scope === "WEEK" ? "Bu hafta" : "Bu ay";
    first =
      sectionKeys.length === 1
        ? `${period} kaydettiğim veriler ${joined} alanındaki özetimi yansıtıyor.`
        : `${period} kaydettiğim verilere göre ${joined} özetlerimi birlikte takip ettim.`;
  }

  const limited = payload.visualCards.some((card) => {
    const match = card.coverage?.match(/^(\d+)\/(\d+) gün kayıt$/u);
    return match ? Number(match[1]) < Number(match[2]) : false;
  });

  return limited
    ? `${first} Kayıt kapsamı dönemin tamamını içermediği için özet yalnız kayıt bulunan günleri yansıtır.`
    : first;
}

function insightText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

/**
 * Canonical History share-text formatter.
 * Consumes only the already privacy-filtered immutable HistorySharePayload.
 * Image caption, text share and clipboard copy must all use this exact function.
 */
export function formatHistoryShareText(payload: HistorySharePayload): string {
  const sections = preparedSections(payload);
  const lines: string[] = [heading(payload), ""];

  if (payload.comparisonLabel) lines.push(payload.comparisonLabel, "");

  for (const section of sections) {
    lines.push(section.heading, ...section.lines, "");
  }

  const status = generalStatus(
    payload,
    Array.from(new Set(sections.map((section) => section.key))),
  );
  if (status) {
    const label =
      payload.scope === "DAY"
        ? "📊 Günün Genel Durumu"
        : payload.scope === "WEEK"
          ? "📊 Haftanın Genel Durumu"
          : "📊 Ayın Genel Durumu";
    lines.push(label, status, "");
  }

  if (payload.aiInsight?.trim()) {
    lines.push("🌱 Diewish Değerlendirmesi", insightText(payload.aiInsight), "");
  }

  lines.push(HISTORY_SHARE_BRAND_CLOSING);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
