const SUPPORTED_LENGTHS = new Set([8, 12, 13]);

function gtinChecksumValid(digits: string): boolean {
  if (!/^\d+$/.test(digits) || digits.length < 2) return false;
  const body = digits.slice(0, -1);
  const expected = Number(digits.at(-1));
  let sum = 0;
  for (let index = body.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    const digit = Number(body[index]);
    sum += digit * (position % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === expected;
}

function expandUpcE(code: string): string | null {
  if (!/^\d{8}$/.test(code)) return null;
  const ns = code[0];
  const d = code.slice(1, 7);
  const check = code[7];
  if (ns !== "0" && ns !== "1") return null;

  let manufacturer: string;
  let product: string;
  const last = d[5];
  if (last === "0" || last === "1" || last === "2") {
    manufacturer = `${d.slice(0, 2)}${last}00`;
    product = `00${d.slice(2, 5)}`;
  } else if (last === "3") {
    manufacturer = `${d.slice(0, 3)}00`;
    product = `000${d.slice(3, 5)}`;
  } else if (last === "4") {
    manufacturer = `${d.slice(0, 4)}0`;
    product = `0000${d[4]}`;
  } else {
    manufacturer = d.slice(0, 5);
    product = `0000${last}`;
  }
  return `${ns}${manufacturer}${product}${check}`;
}

export function normalizeBarcode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  if (!SUPPORTED_LENGTHS.has(digits.length) || !/^\d+$/.test(digits)) return null;
  if (gtinChecksumValid(digits)) return digits;
  if (digits.length === 8) {
    const expanded = expandUpcE(digits);
    if (expanded && gtinChecksumValid(expanded)) return expanded;
  }
  return null;
}

export function isSupportedBarcode(input: string): boolean {
  return normalizeBarcode(input) !== null;
}
