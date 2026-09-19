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

  const compactForInsight = Boolean(payload.aiInsight);
  const sectionBodySize = compactForInsight ? 24 : 28;
  const sectionTitleSize = compactForInsight ? 27 : 30;
  const sectionLineHeight = compactForInsight ? 34 : 42;
  const sectionBaseHeight = compactForInsight ? 82 : 120;
  const sectionGap = compactForInsight ? 14 : 24;
  const sectionTitleOffset = compactForInsight ? 44 : 54;
  const sectionBodyOffset = compactForInsight ? 80 : 102;

  let y = 410;
  for (const section of payload.sections) {
    if (!compactForInsight && y > 1450) break;
    ctx.fillStyle = "#ffffff";
    const lineCount = section.lines.reduce((count, line) => {
      ctx.font = `500 ${sectionBodySize}px ${FONT}`;
      return count + Math.max(1, wrapText(ctx, line, WIDTH - SIDE * 2 - 88).length);
    }, 0);
    const height = sectionBaseHeight + lineCount * sectionLineHeight;
    roundedRect(ctx, SIDE, y, WIDTH - SIDE * 2, height, 30);
    ctx.fill();

    ctx.fillStyle = "#0f7a55";
    ctx.font = `700 ${sectionTitleSize}px ${FONT}`;
    ctx.fillText(section.title, SIDE + 36, y + sectionTitleOffset);

    ctx.fillStyle = "#23312b";
    ctx.font = `500 ${sectionBodySize}px ${FONT}`;
    let lineY = y + sectionBodyOffset;
    for (const line of section.lines) {
      for (const wrapped of wrapText(ctx, line, WIDTH - SIDE * 2 - 88)) {
        ctx.fillText(wrapped, SIDE + 36, lineY);
        lineY += sectionLineHeight;
      }
    }
    y += height + sectionGap;
  }

  if (payload.aiInsight) {
    ctx.fillStyle = "#e8f3ee";
    const aiBodySize = compactForInsight ? 24 : 26;
    const aiTitleSize = compactForInsight ? 27 : 29;
    const aiLineHeight = compactForInsight ? 32 : 38;
    const aiBaseHeight = compactForInsight ? 84 : 104;
    const aiTitleOffset = compactForInsight ? 46 : 54;
    const aiBodyOffset = compactForInsight ? 82 : 100;
    const lines = (() => {
      ctx.font = `500 ${aiBodySize}px ${FONT}`;
      return wrapText(ctx, payload.aiInsight ?? "", WIDTH - SIDE * 2 - 88).slice(0, 7);
    })();
    const height = aiBaseHeight + lines.length * aiLineHeight;
    roundedRect(ctx, SIDE, y, WIDTH - SIDE * 2, height, 30);
    ctx.fill();
    ctx.fillStyle = "#153d2e";
    ctx.font = `700 ${aiTitleSize}px ${FONT}`;
    ctx.fillText("Diewish değerlendirmesi", SIDE + 36, y + aiTitleOffset);
    ctx.font = `500 ${aiBodySize}px ${FONT}`;
    let aiY = y + aiBodyOffset;
    for (const line of lines) {
      ctx.fillText(line, SIDE + 36, aiY);
      aiY += aiLineHeight;
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
