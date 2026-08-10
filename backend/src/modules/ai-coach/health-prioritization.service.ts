/**
 * Smart Health Prioritization layer (Sprint 21.1).
 *
 * A COMPLETELY INDEPENDENT, pure post-processing layer that runs immediately
 * before the final AI Coach response is assembled. It classifies each generated
 * insight, sorts by priority, removes duplicates, merges highly similar
 * recommendations (keeping the most actionable one), and limits the visible
 * output to the highest-priority items.
 *
 * It does NOT detect risks, invent diagnoses, change medical wording, or alter
 * any safety message — it only reorders/deduplicates strings that the existing
 * AI Coach logic already produced. New priority rules can be added here (via the
 * keyword tables) without touching any existing AI Coach service.
 */

/** Priority category of a single coach insight (highest → lowest). */
export type InsightPriority = "CRITICAL" | "IMPORTANT" | "POSITIVE" | "INFORMATIONAL";

/** A coach insight, optionally pre-tagged with a category. */
export interface CoachInsight {
  /** The user-facing message text (never altered by this layer). */
  readonly message: string;
  /** Optional pre-assigned category; when omitted it is inferred from text. */
  readonly category?: InsightPriority;
}

/** A classified insight after prioritization. */
export interface PrioritizedInsight {
  readonly message: string;
  readonly category: InsightPriority;
}

/** Maximum number of insights surfaced to the user. */
const MAX_VISIBLE_INSIGHTS = 5;
/** Token-overlap ratio at/above which two messages are treated as duplicates. */
const SIMILARITY_MERGE_THRESHOLD = 0.6;

/** Fixed ranking used to sort categories (lower = higher priority). */
const PRIORITY_ORDER: Record<InsightPriority, number> = {
  CRITICAL: 0,
  IMPORTANT: 1,
  POSITIVE: 2,
  INFORMATIONAL: 3,
};

/**
 * Keyword tables (Turkish + English), checked in priority order. Extend these
 * to add new rules — no other code needs to change. Matching is
 * case-insensitive and diacritic-insensitive.
 */
const CRITICAL_KEYWORDS = [
  "tehlikeli",
  "kritik",
  "acil",
  "ciddi",
  "anormal",
  "yuksek risk",
  "risk",
  "hareketsiz",
  "uzun suredir",
  "dangerous",
  "critical",
  "severe",
  "urgent",
  "abnormal",
];
const IMPORTANT_KEYWORDS = [
  "kilo",
  "su hedef",
  "su ic",
  "yeterli su",
  "ogun",
  "tutarli",
  "gerisinde",
  "altinda kald",
  "duzenli",
  "porsiyon",
  "protein",
  "weight",
  "water",
  "meal",
  "consistency",
  "behind",
];
const POSITIVE_KEYWORDS = [
  "iyi gidiyor",
  "basarili",
  "koru",
  "harika",
  "ulastin",
  "surdur",
  "tebrik",
  "cok iyi",
  "improving",
  "achieved",
  "great",
  "keep it up",
  "well done",
];
/** Verbs/phrases that signal an actionable recommendation (kept when merging). */
const ACTION_KEYWORDS = [
  "ekle",
  "hedefle",
  "dene",
  "bulundur",
  "gozden gecir",
  "artir",
  "kaydet",
  "unutma",
  "add",
  "try",
  "aim",
  "review",
  "increase",
  "track",
];

/** Lowercases and strips Turkish diacritics for robust keyword matching. */
function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Infers a category from message text when none was supplied. */
function classify(insight: CoachInsight): InsightPriority {
  if (insight.category) return insight.category;
  const text = fold(insight.message);
  if (CRITICAL_KEYWORDS.some((k) => text.includes(k))) return "CRITICAL";
  if (POSITIVE_KEYWORDS.some((k) => text.includes(k))) return "POSITIVE";
  if (IMPORTANT_KEYWORDS.some((k) => text.includes(k))) return "IMPORTANT";
  return "INFORMATIONAL";
}

/** Returns the set of significant word tokens for similarity comparison. */
function tokenize(text: string): Set<string> {
  return new Set(
    fold(text)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

/** Jaccard similarity of two token sets (0–1). */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

/** True when `candidate` reads as more actionable than `current`. */
function isMoreActionable(candidate: string, current: string): boolean {
  const score = (text: string): number =>
    ACTION_KEYWORDS.reduce((n, k) => (fold(text).includes(k) ? n + 1 : n), 0);
  const candidateScore = score(candidate);
  const currentScore = score(current);
  if (candidateScore !== currentScore) return candidateScore > currentScore;
  // Tie-break: prefer the more specific (longer) recommendation.
  return candidate.length > current.length;
}

export const healthPrioritizationService = {
  /**
   * Prioritizes coach insights: classify → dedupe → merge similar → sort →
   * cap at the top {@link MAX_VISIBLE_INSIGHTS}. Pure and side-effect free.
   *
   * @param insights - Raw insights as strings or {@link CoachInsight} objects.
   * @returns The prioritized, de-duplicated insights (message text unchanged).
   */
  prioritize(insights: ReadonlyArray<string | CoachInsight>): PrioritizedInsight[] {
    const normalized: CoachInsight[] = insights
      .map((i) => (typeof i === "string" ? { message: i } : i))
      .filter((i) => typeof i.message === "string" && i.message.trim().length > 0);

    // Classify, then de-duplicate / merge highly similar messages.
    const kept: Array<{ message: string; category: InsightPriority; tokens: Set<string> }> = [];
    for (const insight of normalized) {
      const category = classify(insight);
      const tokens = tokenize(insight.message);

      const duplicateIndex = kept.findIndex(
        (k) => similarity(k.tokens, tokens) >= SIMILARITY_MERGE_THRESHOLD,
      );
      if (duplicateIndex === -1) {
        kept.push({ message: insight.message, category, tokens });
        continue;
      }

      // Merge: keep the higher-priority category and the more actionable text.
      const existing = kept[duplicateIndex];
      const mergedCategory =
        PRIORITY_ORDER[category] < PRIORITY_ORDER[existing.category]
          ? category
          : existing.category;
      const mergedMessage = isMoreActionable(insight.message, existing.message)
        ? insight.message
        : existing.message;
      kept[duplicateIndex] = {
        message: mergedMessage,
        category: mergedCategory,
        tokens: tokenize(mergedMessage),
      };
    }

    // Stable sort by priority (Array.prototype.sort is stable in modern V8),
    // then cap the visible list.
    return kept
      .map((k, index) => ({ ...k, index }))
      .sort((a, b) =>
        PRIORITY_ORDER[a.category] !== PRIORITY_ORDER[b.category]
          ? PRIORITY_ORDER[a.category] - PRIORITY_ORDER[b.category]
          : a.index - b.index,
      )
      .slice(0, MAX_VISIBLE_INSIGHTS)
      .map(({ message, category }) => ({ message, category }));
  },
};
