import type {
  HistorySharePayload,
  HistoryShareVisualCard,
  HistoryShareVisualTone,
} from "@/application/history/history-share";
import { formatHistoryShareText } from "@/application/history/history-share-text";
import {
  buildHistoryShareScene,
  distributeVerticalSpace,
  type HistoryShareScene,
  type HistoryShareSceneDetail,
} from "./history-share-scene";

interface NativeShareBridge {
  isAvailable(): boolean;
  sharePng(base64Png: string, filename: string, text: string): void;
  shareText(text: string, title: string): void;
}

export type HistoryShareResult = "shared" | "copied" | "downloaded" | "cancelled";

export const HISTORY_SHARE_EXPORT_SIZE = Object.freeze({ width: 1080, height: 1920 });

const WIDTH = HISTORY_SHARE_EXPORT_SIZE.width;
const HEIGHT = HISTORY_SHARE_EXPORT_SIZE.height;
const OUTER = 48;
const SHEET = 54;
const FOOTER_HEIGHT = 106;
const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const TONE: Record<HistoryShareVisualTone, { fill: string; accent: string; soft: string }> = {
  nutrition: { fill: "#fff7ed", accent: "#ea580c", soft: "#fed7aa" },
  protein: { fill: "#ecfdf5", accent: "#059669", soft: "#a7f3d0" },
  water: { fill: "#eff6ff", accent: "#0284c7", soft: "#bae6fd" },
  activity: { fill: "#f0fdfa", accent: "#0f766e", soft: "#99f6e4" },
  sleep: { fill: "#eef2ff", accent: "#4f46e5", soft: "#c7d2fe" },
  weight: { fill: "#fff1f2", accent: "#e11d48", soft: "#fecdd3" },
  neutral: { fill: "#f8fafc", accent: "#475569", soft: "#e2e8f0" },
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

function wrapParagraph(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.replace(/\r\n?/g, "\n").split("\n");
  const lines: string[] = [];
  paragraphs.forEach((paragraph, index) => {
    const wrapped = wrapParagraph(ctx, paragraph, maxWidth);
    if (wrapped.length > 0) lines.push(...wrapped);
    if (index < paragraphs.length - 1 && lines.length > 0) lines.push("");
  });
  return lines;
}

function fitLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines = wrapText(ctx, text, maxWidth);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  const last = visible[maxLines - 1] ?? "";
  visible[maxLines - 1] = last.endsWith("…") ? last : `${last.replace(/[\s.,;:!?-]+$/, "")}…`;
  return visible;
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, "#e7f6ef");
  background.addColorStop(0.55, "#f2f8f5");
  background.addColorStop(1, "#edf5ff");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#bbf7d0";
  ctx.beginPath();
  ctx.arc(WIDTH - 82, 180, 190, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#bfdbfe";
  ctx.beginPath();
  ctx.arc(80, HEIGHT - 120, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawSheet(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = "rgba(15, 23, 42, 0.12)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, OUTER, OUTER, WIDTH - OUTER * 2, HEIGHT - OUTER * 2, 52);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function drawHeader(ctx: CanvasRenderingContext2D, scene: HistoryShareScene): number {
  const x = OUTER + SHEET;
  const width = WIDTH - (OUTER + SHEET) * 2;
  const y = OUTER + SHEET;
  const customComparison = scene.scope === "CUSTOM" && Boolean(scene.comparisonLabel);
  const height = scene.comparisonLabel ? (customComparison ? 306 : 272) : 232;

  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, "#087a55");
  gradient.addColorStop(1, "#0f9f72");
  ctx.fillStyle = gradient;
  roundedRect(ctx, x, y, width, height, 38);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.arc(x + width - 44, y + 44, 118, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 30px ${FONT}`;
  ctx.letterSpacing = "2px";
  ctx.fillText(scene.brand, x + 38, y + 55);
  ctx.letterSpacing = "0px";

  ctx.font = `800 45px ${FONT}`;
  const heading = fitLines(ctx, scene.heading, width - 76, 2);
  heading.forEach((line, index) => ctx.fillText(line, x + 38, y + 121 + index * 50));

  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = "#dcfce7";

  if (customComparison) {
    const periodLines = wrapText(ctx, scene.periodLabel, width - 76);
    periodLines.forEach((line, index) => ctx.fillText(line, x + 38, y + 194 + index * 28));

    ctx.fillStyle = "rgba(255,255,255,0.14)";
    roundedRect(ctx, x + 38, y + 226, width - 76, 58, 20);
    ctx.fill();
    ctx.fillStyle = "#ecfdf5";
    ctx.font = `600 18px ${FONT}`;
    const comparisonLines = wrapText(ctx, scene.comparisonLabel ?? "", width - 110);
    comparisonLines.forEach((line, index) =>
      ctx.fillText(line, x + 55, y + 250 + index * 21),
    );
  } else {
    ctx.fillText(scene.periodLabel, x + 38, y + height - 36);

    if (scene.comparisonLabel) {
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      roundedRect(ctx, x + 38, y + height - 86, width - 76, 40, 20);
      ctx.fill();
      ctx.fillStyle = "#ecfdf5";
      ctx.font = `600 18px ${FONT}`;
      const label = fitLines(ctx, scene.comparisonLabel, width - 110, 1)[0] ?? "";
      ctx.fillText(label, x + 55, y + height - 59);
    }
  }

  return y + height;
}

function drawSummaryCard(
  ctx: CanvasRenderingContext2D,
  card: HistoryShareVisualCard,
  x: number,
  y: number,
  width: number,
  height: number,
  dense: boolean,
): void {
  const tone = TONE[card.tone];
  ctx.fillStyle = tone.fill;
  roundedRect(ctx, x, y, width, height, 34);
  ctx.fill();

  ctx.strokeStyle = tone.soft;
  ctx.lineWidth = 2;
  roundedRect(ctx, x, y, width, height, 34);
  ctx.stroke();

  ctx.fillStyle = tone.accent;
  roundedRect(ctx, x + 28, y + 28, 50, 50, 17);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x + 53, y + 53, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#475569";
  ctx.font = `700 ${dense ? 20 : 22}px ${FONT}`;
  const titleWidth = card.coverage ? width - 260 : width - 126;
  const titleLines = fitLines(ctx, card.title, Math.max(120, titleWidth), 2);
  titleLines.forEach((line, index) => ctx.fillText(line, x + 96, y + 49 + index * 23));

  if (card.coverage) {
    ctx.font = `600 16px ${FONT}`;
    const badgeWidth = Math.min(200, ctx.measureText(card.coverage).width + 30);
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, x + width - badgeWidth - 24, y + 26, badgeWidth, 36, 18);
    ctx.fill();
    ctx.fillStyle = "#64748b";
    ctx.fillText(card.coverage, x + width - badgeWidth - 9, y + 50);
  }

  ctx.fillStyle = "#0f172a";
  ctx.font = `800 ${dense ? 34 : 42}px ${FONT}`;
  const valueLines = fitLines(ctx, card.value ?? "—", width - 56, 2);
  const valueBase = y + Math.max(124, height * 0.58);
  valueLines.forEach((line, index) => ctx.fillText(line, x + 28, valueBase + index * 44));

  if (card.description && height >= 215) {
    ctx.fillStyle = "#64748b";
    ctx.font = `500 17px ${FONT}`;
    const description = fitLines(ctx, card.description, width - 56, 2);
    description.forEach((line, index) =>
      ctx.fillText(line, x + 28, y + height - (card.note ? 62 : 30) - index * 20),
    );
  }

  if (card.note) {
    ctx.fillStyle = "#64748b";
    ctx.font = `500 16px ${FONT}`;
    const note = fitLines(ctx, card.note, width - 56, 1)[0];
    if (note) ctx.fillText(note, x + 28, y + height - 22);
  }
}

function drawComparisonCard(
  ctx: CanvasRenderingContext2D,
  card: HistoryShareVisualCard,
  x: number,
  y: number,
  width: number,
  height: number,
  dense: boolean,
): void {
  const tone = TONE[card.tone];
  ctx.fillStyle = tone.fill;
  roundedRect(ctx, x, y, width, height, 32);
  ctx.fill();
  ctx.strokeStyle = tone.soft;
  ctx.lineWidth = 2;
  roundedRect(ctx, x, y, width, height, 32);
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.font = `800 ${dense ? 23 : 27}px ${FONT}`;
  const title = fitLines(ctx, card.title, width - 300, 1)[0] ?? card.title;
  ctx.fillText(title, x + 28, y + 43);

  if (card.coverage) {
    ctx.font = `600 16px ${FONT}`;
    const badgeWidth = Math.min(230, ctx.measureText(card.coverage).width + 30);
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, x + width - badgeWidth - 24, y + 20, badgeWidth, 36, 18);
    ctx.fill();
    ctx.fillStyle = "#64748b";
    ctx.fillText(card.coverage, x + width - badgeWidth - 9, y + 44);
  }

  const innerX = x + 24;
  const innerY = y + 68;
  const innerWidth = width - 48;
  const innerHeight = Math.max(82, height - (card.note ? 110 : 90));
  const columnWidth = innerWidth / 3;

  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, innerX, innerY, innerWidth, innerHeight, 24);
  ctx.fill();

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  for (let index = 1; index < 3; index += 1) {
    const lineX = innerX + columnWidth * index;
    ctx.beginPath();
    ctx.moveTo(lineX, innerY + 14);
    ctx.lineTo(lineX, innerY + innerHeight - 14);
    ctx.stroke();
  }

  const columns = [
    [card.currentLabel ?? "Bu dönem", card.currentValue ?? "—"],
    [card.previousLabel ?? "Önceki dönem", card.previousValue ?? "—"],
    ["Fark", card.difference ?? "—"],
  ];

  columns.forEach(([label, value], index) => {
    const center = innerX + columnWidth * index + columnWidth / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = "#64748b";
    ctx.font = `700 16px ${FONT}`;
    const labelLine = fitLines(ctx, label, columnWidth - 20, 1)[0] ?? "";
    ctx.fillText(labelLine, center, innerY + 28);
    ctx.fillStyle = "#0f172a";
    ctx.font = `800 ${dense ? 22 : 25}px ${FONT}`;
    const valueLines = fitLines(ctx, value, columnWidth - 22, 2);
    valueLines.forEach((line, lineIndex) =>
      ctx.fillText(line, center, innerY + 59 + lineIndex * 26),
    );
  });
  ctx.textAlign = "start";

  if (card.note) {
    ctx.fillStyle = "#64748b";
    ctx.font = `500 15px ${FONT}`;
    const note = fitLines(ctx, card.note, width - 56, 1)[0];
    if (note) ctx.fillText(note, x + 28, y + height - 19);
  }
}

function estimateDetailHeight(
  ctx: CanvasRenderingContext2D,
  detail: HistoryShareSceneDetail,
  dense: boolean,
): number {
  ctx.font = `500 ${dense ? 17 : 19}px ${FONT}`;
  const width = WIDTH - (OUTER + SHEET) * 2 - 64;
  const lines = detail.lines.flatMap((line) => wrapText(ctx, line, width));
  return Math.min(dense ? 154 : 196, 72 + Math.max(1, lines.length) * (dense ? 24 : 27));
}

function drawDetail(
  ctx: CanvasRenderingContext2D,
  detail: HistoryShareSceneDetail,
  y: number,
  height: number,
  dense: boolean,
): void {
  const x = OUTER + SHEET;
  const width = WIDTH - (OUTER + SHEET) * 2;
  ctx.fillStyle = "#f8fafc";
  roundedRect(ctx, x, y, width, height, 28);
  ctx.fill();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  roundedRect(ctx, x, y, width, height, 28);
  ctx.stroke();

  ctx.fillStyle = "#087a55";
  ctx.font = `800 ${dense ? 20 : 23}px ${FONT}`;
  ctx.fillText(detail.title, x + 30, y + 38);

  ctx.fillStyle = "#334155";
  ctx.font = `500 ${dense ? 17 : 19}px ${FONT}`;
  let lineY = y + 70;
  const maxLines = dense ? 3 : 4;
  const content = detail.lines.join(" • ");
  const lines = fitLines(ctx, content, width - 60, maxLines);
  lines.forEach((line) => {
    ctx.fillText(line, x + 30, lineY);
    lineY += dense ? 24 : 27;
  });
}

function estimateAiHeight(ctx: CanvasRenderingContext2D, scene: HistoryShareScene): number {
  if (!scene.aiInsight) return 0;
  const dense = scene.density === "dense";
  ctx.font = `500 ${dense ? 17 : 19}px ${FONT}`;
  const width = WIDTH - (OUTER + SHEET) * 2 - 64;
  const lines = wrapText(ctx, scene.aiInsight, width);
  return Math.min(dense ? 220 : 300, 78 + Math.max(2, lines.length) * (dense ? 24 : 27));
}

/** Same Diewish dashboard mascot leaf silhouette in the Canvas fallback. */
function drawDiewishHistoryMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 32, size / 28);
  ctx.strokeStyle = "#168D69";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.stroke(new Path2D("M16 26C16.2 20.7 15.8 15.5 16.3 10.2"));
  ctx.fillStyle = "#149A73";
  ctx.fill(new Path2D("M15.8 11.6C11.2 12.1 6.6 9.4 5.1 4.1C10.2 2.8 14.9 5.9 15.8 11.6Z"));
  ctx.fillStyle = "#0D8F69";
  ctx.fill(new Path2D("M16.4 9.9C17.7 5.2 21.9 2.1 27.1 2.9C26.3 8 22.1 11.2 16.4 9.9Z"));
  ctx.restore();
}

function drawAi(
  ctx: CanvasRenderingContext2D,
  scene: HistoryShareScene,
  y: number,
  height: number,
): void {
  if (!scene.aiInsight) return;
  const dense = scene.density === "dense";
  const x = OUTER + SHEET;
  const width = WIDTH - (OUTER + SHEET) * 2;
  ctx.fillStyle = "#ecfdf5";
  roundedRect(ctx, x, y, width, height, 30);
  ctx.fill();
  ctx.strokeStyle = "#a7f3d0";
  ctx.lineWidth = 2;
  roundedRect(ctx, x, y, width, height, 30);
  ctx.stroke();

  drawDiewishHistoryMark(ctx, x + 30, y + 17, 26);
  ctx.fillStyle = "#087a55";
  ctx.font = `800 ${dense ? 20 : 23}px ${FONT}`;
  ctx.fillText("Değerlendirme", x + 62, y + 40);

  ctx.fillStyle = "#334155";
  ctx.font = `500 ${dense ? 17 : 19}px ${FONT}`;
  const maxLines = Math.max(2, Math.floor((height - 74) / (dense ? 24 : 27)));
  const lines = fitLines(ctx, scene.aiInsight, width - 60, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x + 30, y + 76 + index * (dense ? 24 : 27)));
}

function drawFooter(ctx: CanvasRenderingContext2D, scene: HistoryShareScene): void {
  const x = OUTER + SHEET;
  const y = HEIGHT - OUTER - SHEET - FOOTER_HEIGHT;
  const width = WIDTH - (OUTER + SHEET) * 2;

  ctx.fillStyle = "#f1f5f9";
  roundedRect(ctx, x, y, width, FOOTER_HEIGHT, 28);
  ctx.fill();

  drawDiewishHistoryMark(ctx, x + 20, y + 18, 26);
  ctx.fillStyle = "#334155";
  ctx.font = `700 17px ${FONT}`;
  const motivationLines = fitLines(ctx, scene.motivation, width - 82, 3);
  motivationLines.forEach((line, index) => ctx.fillText(line, x + 52, y + 30 + index * 22));

}

function normalCardGridHeight(scene: HistoryShareScene, available: number): number {
  const rows = Math.max(1, scene.cardRows);
  const gap = scene.density === "dense" ? 16 : 20;
  const min = scene.density === "dense" ? 158 : scene.density === "balanced" ? 190 : 220;
  const max = scene.density === "dense" ? 205 : scene.density === "balanced" ? 280 : 420;
  const fit = (available - gap * (rows - 1)) / rows;
  const cardHeight = Math.max(min, Math.min(max, fit));
  return rows * cardHeight + gap * (rows - 1);
}

function drawNormalCards(
  ctx: CanvasRenderingContext2D,
  scene: HistoryShareScene,
  y: number,
  gridHeight: number,
): void {
  if (scene.cards.length === 0) return;
  const dense = scene.density === "dense";
  const gap = dense ? 16 : 20;
  const columns = scene.normalColumns;
  const rows = Math.max(1, scene.cardRows);
  const width = WIDTH - (OUTER + SHEET) * 2;
  const cardWidth = (width - gap * (columns - 1)) / columns;
  const cardHeight = (gridHeight - gap * (rows - 1)) / rows;
  const x0 = OUTER + SHEET;

  scene.cards.forEach((card, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    drawSummaryCard(
      ctx,
      card,
      x0 + column * (cardWidth + gap),
      y + row * (cardHeight + gap),
      cardWidth,
      cardHeight,
      dense,
    );
  });
}

function comparisonCardsHeight(scene: HistoryShareScene, available: number): number {
  const count = Math.max(1, scene.cards.length);
  const gap = scene.density === "dense" ? 14 : 18;
  const min = scene.density === "dense" ? 145 : 170;
  const max = scene.density === "sparse" ? 245 : scene.density === "balanced" ? 210 : 176;
  const fit = (available - gap * (count - 1)) / count;
  const cardHeight = Math.max(min, Math.min(max, fit));
  return count * cardHeight + gap * (count - 1);
}

function drawComparisonCards(
  ctx: CanvasRenderingContext2D,
  scene: HistoryShareScene,
  y: number,
  totalHeight: number,
): void {
  if (scene.cards.length === 0) return;
  const dense = scene.density === "dense";
  const gap = dense ? 14 : 18;
  const count = scene.cards.length;
  const cardHeight = (totalHeight - gap * (count - 1)) / count;
  const x = OUTER + SHEET;
  const width = WIDTH - (OUTER + SHEET) * 2;

  scene.cards.forEach((card, index) => {
    drawComparisonCard(ctx, card, x, y + index * (cardHeight + gap), width, cardHeight, dense);
  });
}

export function createHistoryShareCanvas(payload: HistorySharePayload): HTMLCanvasElement {
  const scene = buildHistoryShareScene(payload);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");

  drawBackground(ctx);
  drawSheet(ctx);
  const headerBottom = drawHeader(ctx, scene);

  const contentTop = headerBottom + 18;
  const footerTop = HEIGHT - OUTER - SHEET - FOOTER_HEIGHT - 14;
  const contentHeight = footerTop - contentTop;
  const dense = scene.density === "dense";

  const detailHeights = scene.details.map((detail) => estimateDetailHeight(ctx, detail, dense));
  const aiHeight = estimateAiHeight(ctx, scene);
  const fixedExtras = detailHeights.reduce((sum, height) => sum + height, 0) + aiHeight;
  const minimumGaps = (scene.details.length + (scene.aiInsight ? 1 : 0)) * (dense ? 12 : 16);
  const cardAvailable = Math.max(280, contentHeight - fixedExtras - minimumGaps);

  const cardsHeight =
    scene.kind === "comparison"
      ? comparisonCardsHeight(scene, cardAvailable)
      : normalCardGridHeight(scene, cardAvailable);

  const blockHeights = [
    ...(scene.cards.length > 0 ? [cardsHeight] : []),
    ...detailHeights,
    ...(scene.aiInsight ? [aiHeight] : []),
  ];
  const spacing = distributeVerticalSpace(contentHeight, blockHeights, dense ? 10 : 16);

  let y = contentTop + spacing.before;
  let blockIndex = 0;

  if (scene.cards.length > 0) {
    if (scene.kind === "comparison") drawComparisonCards(ctx, scene, y, cardsHeight);
    else drawNormalCards(ctx, scene, y, cardsHeight);
    y += cardsHeight;
    blockIndex += 1;
    if (blockIndex < blockHeights.length) y += spacing.between;
  }

  scene.details.forEach((detail, index) => {
    drawDetail(ctx, detail, y, detailHeights[index], dense);
    y += detailHeights[index];
    blockIndex += 1;
    if (blockIndex < blockHeights.length) y += spacing.between;
  });

  if (scene.aiInsight) {
    drawAi(ctx, scene, y, aiHeight);
  }

  drawFooter(ctx, scene);
  return canvas;
}

export const historyPayloadText = formatHistoryShareText;

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

function blobData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Share image could not be read."));
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== "string") {
        reject(new Error("Share image could not be read."));
        return;
      }
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export function buildHistoryWebShareData(
  payload: HistorySharePayload,
  file: File,
): ShareData {
  return {
    title: payload.title,
    text: formatHistoryShareText(payload),
    files: [file],
  };
}

/** Shares an already-rendered PNG with the canonical professional History text. */
export async function shareHistoryPngBlob(
  payload: HistorySharePayload,
  blob: Blob,
): Promise<HistoryShareResult> {
  const filename = `Diewish-gecmisim-${payload.scope.toLowerCase()}.png`;
  const text = formatHistoryShareText(payload);
  const nativeShare = nativeBridge();

  if (nativeShare?.isAvailable()) {
    nativeShare.sharePng(await blobData(blob), filename, text);
    return "shared";
  }

  const file = new File([blob], filename, { type: "image/png" });

  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share(buildHistoryWebShareData(payload, file));
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

export async function shareHistoryVisual(
  payload: HistorySharePayload,
): Promise<HistoryShareResult> {
  const canvas = createHistoryShareCanvas(payload);
  const blob = await canvasToBlob(canvas);
  return shareHistoryPngBlob(payload, blob);
}

export async function shareHistoryText(payload: HistorySharePayload): Promise<HistoryShareResult> {
  const text = formatHistoryShareText(payload);
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

export async function copyHistoryText(payload: HistorySharePayload): Promise<HistoryShareResult> {
  await navigator.clipboard.writeText(formatHistoryShareText(payload));
  return "copied";
}

/** Backward-compatible visual share entry point. */
export async function shareHistoryPayload(
  payload: HistorySharePayload,
): Promise<HistoryShareResult> {
  return shareHistoryVisual(payload);
}
