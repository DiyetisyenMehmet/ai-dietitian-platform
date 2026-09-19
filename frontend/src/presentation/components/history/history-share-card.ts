import type {
  HistorySharePayload,
  HistoryShareVisualCard,
  HistoryShareVisualTone,
} from "@/application/history/history-share";

interface NativeShareBridge {
  isAvailable(): boolean;
  sharePng(base64Png: string, filename: string, text: string): void;
  shareText(text: string, title: string): void;
}

export type HistoryShareResult = "shared" | "copied" | "downloaded" | "cancelled";

const WIDTH = 1080;
const HEIGHT = 1920;
const SIDE = 64;
const FONT = "Arial, sans-serif";

const TONE: Record<HistoryShareVisualTone, { fill: string; accent: string }> = {
  nutrition: { fill: "#fff7ed", accent: "#ea580c" },
  protein: { fill: "#ecfdf5", accent: "#059669" },
  water: { fill: "#eff6ff", accent: "#0284c7" },
  activity: { fill: "#f0fdfa", accent: "#0f766e" },
  sleep: { fill: "#eef2ff", accent: "#4f46e5" },
  weight: { fill: "#fff1f2", accent: "#e11d48" },
  neutral: { fill: "#f8fafc", accent: "#475569" },
};

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function splitLongToken(ctx: CanvasRenderingContext2D, token: string, maxWidth: number): string[] {
  if (ctx.measureText(token).width <= maxWidth) return [token];
  const chunks: string[] = [];
  let current = "";
  for (const character of token) {
    const candidate = current + character;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => splitLongToken(ctx, word, maxWidth));
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${current} ${words[index]}`;
    if (ctx.measureText(candidate).width <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = words[index];
    }
  }
  lines.push(current);
  return lines;
}

function visualDetailLines(payload: HistorySharePayload): Array<{ title: string; text: string }> {
  const details: Array<{ title: string; text: string }> = [];
  for (const section of payload.sections) {
    for (const line of section.lines) {
      if (line.startsWith("Öğünler:")) {
        details.push({ title: "Öğünler", text: line.replace(/^Öğünler:\s*/, "") });
      }
    }
  }
  return details;
}

function drawSummaryCard(
  ctx: CanvasRenderingContext2D,
  card: HistoryShareVisualCard,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const tone = TONE[card.tone];
  ctx.fillStyle = tone.fill;
  roundedRect(ctx, x, y, width, height, 32);
  ctx.fill();

  ctx.fillStyle = tone.accent;
  roundedRect(ctx, x + 28, y + 26, 46, 46, 15);
  ctx.fill();

  ctx.fillStyle = "#64748b";
  ctx.font = `600 23px ${FONT}`;
  const titleLines = wrapText(ctx, card.title, width - 118).slice(0, 2);
  titleLines.forEach((line, index) => ctx.fillText(line, x + 92, y + 48 + index * 27));

  ctx.fillStyle = "#0f172a";
  ctx.font = `700 38px ${FONT}`;
  const value = card.value ?? "—";
  const valueLines = wrapText(ctx, value, width - 56).slice(0, 2);
  valueLines.forEach((line, index) => ctx.fillText(line, x + 28, y + 118 + index * 42));
}

function drawComparisonCard(
  ctx: CanvasRenderingContext2D,
  card: HistoryShareVisualCard,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const tone = TONE[card.tone];
  ctx.fillStyle = tone.fill;
  roundedRect(ctx, x, y, width, height, 32);
  ctx.fill();

  ctx.fillStyle = "#0f172a";
  ctx.font = `700 29px ${FONT}`;
  ctx.fillText(card.title, x + 32, y + 46);

  if (card.coverage) {
    ctx.font = `600 19px ${FONT}`;
    const badgeWidth = Math.min(250, ctx.measureText(card.coverage).width + 34);
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, x + width - badgeWidth - 28, y + 22, badgeWidth, 42, 21);
    ctx.fill();
    ctx.fillStyle = "#64748b";
    ctx.fillText(card.coverage, x + width - badgeWidth - 11, y + 49);
  }

  const innerX = x + 28;
  const innerY = y + 82;
  const innerWidth = width - 56;
  const innerHeight = height - 108;
  const columnWidth = innerWidth / 3;

  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, innerX, innerY, innerWidth, innerHeight, 24);
  ctx.fill();

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  for (let index = 1; index < 3; index += 1) {
    const lineX = innerX + columnWidth * index;
    ctx.beginPath();
    ctx.moveTo(lineX, innerY + 16);
    ctx.lineTo(lineX, innerY + innerHeight - 16);
    ctx.stroke();
  }

  const columns = [
    [card.currentLabel ?? "Bu dönem", card.currentValue ?? "—"],
    [card.previousLabel ?? "Önceki dönem", card.previousValue ?? "—"],
    ["Fark", card.difference ?? "—"],
  ];

  columns.forEach(([label, value], index) => {
    const left = innerX + columnWidth * index;
    const center = left + columnWidth / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = "#64748b";
    ctx.font = `600 18px ${FONT}`;
    const labelLines = wrapText(ctx, label, columnWidth - 24).slice(0, 2);
    labelLines.forEach((line, lineIndex) => ctx.fillText(line, center, innerY + 36 + lineIndex * 22));

    ctx.fillStyle = "#0f172a";
    ctx.font = `700 25px ${FONT}`;
    const valueLines = wrapText(ctx, value, columnWidth - 24).slice(0, 2);
    valueLines.forEach((line, lineIndex) => ctx.fillText(line, center, innerY + 96 + lineIndex * 30));
  });
  ctx.textAlign = "start";
}

function drawDetailCard(
  ctx: CanvasRenderingContext2D,
  title: string,
  text: string,
  y: number,
  maxHeight: number,
): number {
  const width = WIDTH - SIDE * 2;
  ctx.font = `500 24px ${FONT}`;
  const lines = wrapText(ctx, text, width - 64);
  const visible = lines.slice(0, Math.max(1, Math.floor((maxHeight - 88) / 34)));
  const height = Math.min(maxHeight, 92 + visible.length * 34);

  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, SIDE, y, width, height, 30);
  ctx.fill();
  ctx.fillStyle = "#0f7a55";
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(title, SIDE + 32, y + 42);
  ctx.fillStyle = "#334155";
  ctx.font = `500 24px ${FONT}`;
  visible.forEach((line, index) => ctx.fillText(line, SIDE + 32, y + 82 + index * 34));
  return height;
}

export function createHistoryShareCanvas(payload: HistorySharePayload): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#0f7a55";
  roundedRect(ctx, SIDE, 64, WIDTH - SIDE * 2, 250, 42);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText("DIEWISH", SIDE + 42, 126);
  ctx.font = `700 46px ${FONT}`;
  const title = payload.title.replace("Diewish • ", "");
  wrapText(ctx, title, WIDTH - SIDE * 2 - 84)
    .slice(0, 2)
    .forEach((line, index) => ctx.fillText(line, SIDE + 42, 194 + index * 50));

  ctx.font = `500 25px ${FONT}`;
  ctx.fillText(payload.periodLabel, SIDE + 42, 282);

  let y = 350;
  if (payload.comparisonLabel) {
    ctx.fillStyle = "#e8f3ee";
    roundedRect(ctx, SIDE, y, WIDTH - SIDE * 2, 64, 24);
    ctx.fill();
    ctx.fillStyle = "#155e49";
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(payload.comparisonLabel, SIDE + 28, y + 40);
    y += 88;
  }

  const details = visualDetailLines(payload);
  const aiReserve = payload.aiInsight ? 260 : 0;
  const detailReserve = details.length > 0 ? 190 : 0;
  const footerReserve = 90;
  const available = HEIGHT - y - aiReserve - detailReserve - footerReserve;

  if (payload.scope === "DAY") {
    const gap = 22;
    const cardWidth = (WIDTH - SIDE * 2 - gap) / 2;
    const rows = Math.max(1, Math.ceil(payload.visualCards.length / 2));
    const cardHeight = Math.max(150, Math.min(190, (available - gap * (rows - 1)) / rows));
    payload.visualCards.forEach((card, index) => {
      const row = Math.floor(index / 2);
      const column = index % 2;
      const x = SIDE + column * (cardWidth + gap);
      const cardY = y + row * (cardHeight + gap);
      drawSummaryCard(ctx, card, x, cardY, cardWidth, cardHeight);
    });
    y += rows * cardHeight + Math.max(0, rows - 1) * gap + 24;
  } else {
    const gap = 18;
    const count = Math.max(1, payload.visualCards.length);
    const cardHeight = Math.max(180, Math.min(225, (available - gap * (count - 1)) / count));
    payload.visualCards.forEach((card, index) => {
      drawComparisonCard(ctx, card, SIDE, y + index * (cardHeight + gap), WIDTH - SIDE * 2, cardHeight);
    });
    y += count * cardHeight + Math.max(0, count - 1) * gap + 22;
  }

  for (const detail of details.slice(0, 1)) {
    const height = drawDetailCard(ctx, detail.title, detail.text, y, 180);
    y += height + 18;
  }

  if (payload.aiInsight && y < HEIGHT - 160) {
    const maxHeight = Math.max(120, HEIGHT - y - 112);
    drawDetailCard(ctx, "Diewish değerlendirmesi", payload.aiInsight, y, Math.min(250, maxHeight));
  }

  ctx.fillStyle = "#64748b";
  ctx.font = `500 20px ${FONT}`;
  const footerLines = wrapText(ctx, payload.footer, WIDTH - SIDE * 2).slice(0, 2);
  footerLines.forEach((line, index) => ctx.fillText(line, SIDE, HEIGHT - 66 + index * 24));

  return canvas;
}

export function historyPayloadText(payload: HistorySharePayload): string {
  const heading =
    payload.scope === "DAY"
      ? `${payload.periodLabel} Diewish gün özetim 🌿`
      : payload.scope === "WEEK"
        ? `${payload.periodLabel} Diewish hafta özetim 🌿`
        : `${payload.periodLabel} Diewish ay özetim 🌿`;

  const lines = [heading, ""];
  if (payload.comparisonLabel) {
    lines.push(payload.comparisonLabel, "");
  }
  for (const section of payload.sections) {
    lines.push(section.title);
    for (const line of section.lines) lines.push(line);
    lines.push("");
  }
  if (payload.aiInsight) {
    lines.push("Diewish değerlendirmesi", payload.aiInsight, "");
  }
  lines.push("Diewish ile ilerlememi takip ediyorum.");
  return lines.join("\n").trim();
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Share image could not be created."));
    }, "image/png");
  });
}

function nativeBridge(): NativeShareBridge | undefined {
  return (window as typeof window & { DiewishShare?: NativeShareBridge }).DiewishShare;
}

export async function shareHistoryVisual(payload: HistorySharePayload): Promise<HistoryShareResult> {
  const canvas = createHistoryShareCanvas(payload);
  const filename = `Diewish-gecmisim-${payload.scope.toLowerCase()}.png`;
  const text = historyPayloadText(payload);
  const nativeShare = nativeBridge();

  if (nativeShare?.isAvailable()) {
    const dataUrl = canvas.toDataURL("image/png");
    nativeShare.sharePng(dataUrl.slice(dataUrl.indexOf(",") + 1), filename, text);
    return "shared";
  }

  const blob = await canvasToBlob(canvas);
  const file = new File([blob], filename, { type: "image/png" });

  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: payload.title, text: payload.periodLabel, files: [file] });
      return "shared";
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}

export async function shareHistoryText(payload: HistorySharePayload): Promise<HistoryShareResult> {
  const text = historyPayloadText(payload);
  const nativeShare = nativeBridge();

  if (nativeShare?.isAvailable()) {
    nativeShare.shareText(text, payload.title);
    return "shared";
  }

  try {
    if (navigator.share) {
      await navigator.share({ title: payload.title, text });
      return "shared";
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }

  await navigator.clipboard.writeText(text);
  return "copied";
}

/** Backward-compatible visual share entry point. */
export async function shareHistoryPayload(payload: HistorySharePayload): Promise<HistoryShareResult> {
  return shareHistoryVisual(payload);
}
