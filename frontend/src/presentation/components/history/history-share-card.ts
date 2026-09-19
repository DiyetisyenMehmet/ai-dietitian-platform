import type { HistorySharePayload } from "@/application/history/history-share";

interface NativeShareBridge {
  isAvailable(): boolean;
  sharePng(base64Png: string, filename: string, text: string): void;
}

const WIDTH = 1080;
const HEIGHT = 1920;
const SIDE = 72;
const FONT = "Arial, sans-serif";

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

function splitLongToken(
  ctx: CanvasRenderingContext2D,
  token: string,
  maxWidth: number,
): string[] {
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

interface ShareCanvasLayout {
  scale: number;
  bodyFont: number;
  sectionTitleFont: number;
  bodyLineHeight: number;
  sectionBaseHeight: number;
  sectionGap: number;
  sectionTitleOffset: number;
  sectionBodyOffset: number;
  aiFont: number;
  aiTitleFont: number;
  aiLineHeight: number;
  aiBaseHeight: number;
  aiTitleOffset: number;
  aiBodyOffset: number;
  totalHeight: number;
}

function measureShareLayout(
  ctx: CanvasRenderingContext2D,
  payload: HistorySharePayload,
  scale: number,
): ShareCanvasLayout {
  const maxTextWidth = WIDTH - SIDE * 2 - 88;
  const bodyFont = Math.max(12, Math.round(28 * scale));
  const sectionTitleFont = Math.max(14, Math.round(30 * scale));
  const bodyLineHeight = Math.max(18, Math.round(42 * scale));
  const sectionBaseHeight = Math.max(56, Math.round(120 * scale));
  const sectionGap = Math.max(8, Math.round(24 * scale));
  const sectionTitleOffset = Math.max(22, Math.round(54 * scale));
  const sectionBodyOffset = Math.max(40, Math.round(102 * scale));
  const aiFont = Math.max(12, Math.round(26 * scale));
  const aiTitleFont = Math.max(14, Math.round(29 * scale));
  const aiLineHeight = Math.max(18, Math.round(38 * scale));
  const aiBaseHeight = Math.max(56, Math.round(104 * scale));
  const aiTitleOffset = Math.max(22, Math.round(54 * scale));
  const aiBodyOffset = Math.max(40, Math.round(100 * scale));

  let totalHeight = 0;
  for (const section of payload.sections) {
    ctx.font = `500 ${bodyFont}px ${FONT}`;
    const lineCount = section.lines.reduce(
      (count, line) => count + Math.max(1, wrapText(ctx, line, maxTextWidth).length),
      0,
    );
    totalHeight += sectionBaseHeight + lineCount * bodyLineHeight + sectionGap;
  }

  if (payload.aiInsight) {
    ctx.font = `500 ${aiFont}px ${FONT}`;
    const aiLines = wrapText(ctx, payload.aiInsight, maxTextWidth);
    totalHeight += aiBaseHeight + aiLines.length * aiLineHeight;
  }

  return {
    scale,
    bodyFont,
    sectionTitleFont,
    bodyLineHeight,
    sectionBaseHeight,
    sectionGap,
    sectionTitleOffset,
    sectionBodyOffset,
    aiFont,
    aiTitleFont,
    aiLineHeight,
    aiBaseHeight,
    aiTitleOffset,
    aiBodyOffset,
    totalHeight,
  };
}

function chooseShareLayout(
  ctx: CanvasRenderingContext2D,
  payload: HistorySharePayload,
): ShareCanvasLayout {
  const availableHeight = HEIGHT - 130 - 410;
  for (const scale of [1, 0.9, 0.8, 0.7, 0.6, 0.55, 0.5, 0.45, 0.4]) {
    const layout = measureShareLayout(ctx, payload, scale);
    if (layout.totalHeight <= availableHeight) return layout;
  }
  return measureShareLayout(ctx, payload, 0.4);
}

export function createHistoryShareCanvas(payload: HistorySharePayload): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");

  ctx.fillStyle = "#f7faf8";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#0f7a55";
  roundedRect(ctx, SIDE, 72, WIDTH - SIDE * 2, 292, 42);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 36px ${FONT}`;
  ctx.fillText("DIEWISH", SIDE + 44, 142);
  ctx.font = `700 50px ${FONT}`;
  wrapText(ctx, payload.title.replace("Diewish • ", ""), WIDTH - SIDE * 2 - 88)
    .slice(0, 2)
    .forEach((line, index) => ctx.fillText(line, SIDE + 44, 220 + index * 58));
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(payload.periodLabel, SIDE + 44, 326);

  const layout = chooseShareLayout(ctx, payload);
  const maxTextWidth = WIDTH - SIDE * 2 - 88;
  let y = 410;

  for (const section of payload.sections) {
    ctx.font = `500 ${layout.bodyFont}px ${FONT}`;
    const wrappedLines = section.lines.flatMap((line) =>
      wrapText(ctx, line, maxTextWidth),
    );
    const height =
      layout.sectionBaseHeight +
      wrappedLines.length * layout.bodyLineHeight;

    ctx.fillStyle = "#ffffff";
    roundedRect(
      ctx,
      SIDE,
      y,
      WIDTH - SIDE * 2,
      height,
      Math.max(16, Math.round(30 * layout.scale)),
    );
    ctx.fill();

    ctx.fillStyle = "#0f7a55";
    ctx.font = `700 ${layout.sectionTitleFont}px ${FONT}`;
    ctx.fillText(section.title, SIDE + 36, y + layout.sectionTitleOffset);

    ctx.fillStyle = "#23312b";
    ctx.font = `500 ${layout.bodyFont}px ${FONT}`;
    let lineY = y + layout.sectionBodyOffset;
    for (const wrapped of wrappedLines) {
      ctx.fillText(wrapped, SIDE + 36, lineY);
      lineY += layout.bodyLineHeight;
    }
    y += height + layout.sectionGap;
  }

  if (payload.aiInsight) {
    ctx.font = `500 ${layout.aiFont}px ${FONT}`;
    const lines = wrapText(ctx, payload.aiInsight, maxTextWidth);
    const height = layout.aiBaseHeight + lines.length * layout.aiLineHeight;

    ctx.fillStyle = "#e8f3ee";
    roundedRect(
      ctx,
      SIDE,
      y,
      WIDTH - SIDE * 2,
      height,
      Math.max(16, Math.round(30 * layout.scale)),
    );
    ctx.fill();

    ctx.fillStyle = "#153d2e";
    ctx.font = `700 ${layout.aiTitleFont}px ${FONT}`;
    ctx.fillText("Diewish değerlendirmesi", SIDE + 36, y + layout.aiTitleOffset);

    ctx.font = `500 ${layout.aiFont}px ${FONT}`;
    let aiY = y + layout.aiBodyOffset;
    for (const line of lines) {
      ctx.fillText(line, SIDE + 36, aiY);
      aiY += layout.aiLineHeight;
    }
  }

  ctx.fillStyle = "#66736e";
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(payload.footer, SIDE, HEIGHT - 74);

  return canvas;
}

function payloadText(payload: HistorySharePayload): string {
  const lines = [payload.title, payload.periodLabel, ""];
  for (const section of payload.sections) {
    lines.push(section.title);
    for (const line of section.lines) lines.push(`• ${line}`);
    lines.push("");
  }
  if (payload.aiInsight) {
    lines.push("Diewish değerlendirmesi");
    lines.push(payload.aiInsight);
    lines.push("");
  }
  lines.push(payload.footer);
  return lines.join("\n");
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Share image could not be created."));
    }, "image/png");
  });
}

export async function shareHistoryPayload(
  payload: HistorySharePayload,
): Promise<"shared" | "copied" | "cancelled"> {
  const canvas = createHistoryShareCanvas(payload);
  const filename = `Diewish-gecmisim-${payload.scope.toLowerCase()}.png`;
  const text = payloadText(payload);
  const nativeShare = (window as typeof window & { DiewishShare?: NativeShareBridge }).DiewishShare;

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
