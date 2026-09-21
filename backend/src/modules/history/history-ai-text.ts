const NAMED_CHARACTER_REFERENCES: Readonly<Record<string, string>> = Object.freeze({
  AMP: "&",
  APOS: "'",
  GT: ">",
  LT: "<",
  QUOT: '"',
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  Ccedil: "Ç",
  ccedil: "ç",
  Ouml: "Ö",
  ouml: "ö",
  Uuml: "Ü",
  uuml: "ü",
});

const WINDOWS_1252_SPECIAL_TO_BYTE = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

const MOJIBAKE_MARKER = /[ÃÂÄÅâð]/g;

function characterReference(codePoint: number): string | null {
  if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return null;
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return null;
  return String.fromCodePoint(codePoint);
}

/**
 * Decode one HTML character-reference layer only.
 *
 * Numeric references cover arbitrary Unicode (including Turkish characters and
 * emoji). The named table intentionally contains the standard text/punctuation
 * references AI providers commonly emit. Unknown names are preserved verbatim.
 *
 * Decoding exactly one layer is important: "&amp;lt;script&amp;gt;" becomes
 * "&lt;script&gt;", never executable markup.
 */
export function decodeHtmlCharacterReferencesOnce(value: string): string {
  return value.replace(
    /&(?:#[xX]([0-9a-fA-F]+)|#([0-9]+)|([A-Za-z][A-Za-z0-9]+));/g,
    (match, hex: string | undefined, decimal: string | undefined, named: string | undefined) => {
      if (hex) return characterReference(Number.parseInt(hex, 16)) ?? match;
      if (decimal) return characterReference(Number.parseInt(decimal, 10)) ?? match;
      if (!named) return match;
      return NAMED_CHARACTER_REFERENCES[named] ?? match;
    },
  );
}

function windows1252Bytes(value: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return null;
    const special = WINDOWS_1252_SPECIAL_TO_BYTE.get(codePoint);
    if (special !== undefined) {
      bytes.push(special);
      continue;
    }
    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }
    return null;
  }
  return Uint8Array.from(bytes);
}

function markerScore(value: string): number {
  return value.match(MOJIBAKE_MARKER)?.length ?? 0;
}

/**
 * Repairs the common UTF-8 -> Windows-1252 mojibake failure only when the
 * original text contains strong mojibake markers, the byte round-trip is valid
 * UTF-8, and the repaired candidate strictly reduces those markers.
 */
export function repairUtf8MojibakeOnce(value: string): string {
  const originalScore = markerScore(value);
  if (originalScore === 0) return value;

  const bytes = windows1252Bytes(value);
  if (!bytes) return value;

  try {
    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return markerScore(repaired) < originalScore ? repaired : value;
  } catch {
    return value;
  }
}

/**
 * History-specific plain-text normalization boundary.
 *
 * This function does not parse or render HTML. React and the share canvas
 * continue to receive ordinary text, so decoded angle brackets stay text.
 */
export function normalizeHistoryInsightText(value: string): string {
  const normalizedLineEndings = value.replace(/\r\n?/g, "\n");
  const decodedOnce = decodeHtmlCharacterReferencesOnce(normalizedLineEndings);
  return repairUtf8MojibakeOnce(decodedOnce).normalize("NFC").trim();
}
