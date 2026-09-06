import type { DailyPlan } from "@/infrastructure/nutrition/nutrition-plan-client";

declare global {
  interface Window {
    DiewishShare?: {
      isAvailable(): boolean;
      sharePng(base64Png: string, filename: string, text: string): void;
    };
  }
}

export type NutritionDayShareResult = "shared" | "copied" | "cancelled";

interface ShareNutritionDayInput {
  dayNumber: number;
  dateLabel: string;
  day: DailyPlan;
}

const CARD_WIDTH = 1080;
const SIDE = 72;
const CONTENT_WIDTH = CARD_WIDTH - SIDE * 2;
const FONT_FAMILY = "Arial, sans-serif";

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

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = words[0];
  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${line} ${words[index]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = words[index];
    }
  }
  lines.push(line);
  return lines;
}

function mealHeight(ctx: CanvasRenderingContext2D, day: DailyPlan, mealIndex: number): number {
  const meal = day.meals[mealIndex];
  ctx.font = `500 27px ${FONT_FAMILY}`;
  let rows = 0;
  meal.foods.forEach((food) => {
    const line = `${food.name}  •  ${food.portion}`;
    rows += Math.max(1, wrapText(ctx, line, CONTENT_WIDTH - 96).length);
  });
  return 126 + rows * 42 + 30;
}

function createDayCanvas(input: ShareNutritionDayInput): HTMLCanvasElement {
  const sizing = document.createElement("canvas");
  const sizingCtx = sizing.getContext("2d");
  if (!sizingCtx) throw new Error("Canvas is unavailable.");

  const mealsHeight = input.day.meals.reduce(
    (sum, _meal, index) => sum + mealHeight(sizingCtx, input.day, index) + 24,
    0,
  );
  const height = Math.max(1450, 430 + mealsHeight + 300);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");

  ctx.fillStyle = "#f7faf8";
  ctx.fillRect(0, 0, CARD_WIDTH, height);

  ctx.fillStyle = "#0f7a55";
  roundedRect(ctx, SIDE, 64, CONTENT_WIDTH, 250, 42);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 34px ${FONT_FAMILY}`;
  ctx.fillText("DIEWISH", SIDE + 44, 125);
  ctx.font = `700 54px ${FONT_FAMILY}`;
  ctx.fillText(`${input.dayNumber}. Gün`, SIDE + 44, 202);
  ctx.font = `500 29px ${FONT_FAMILY}`;
  ctx.fillText(input.dateLabel, SIDE + 44, 254);

  let y = 356;
  input.day.meals.forEach((meal, mealIndex) => {
    const boxHeight = mealHeight(ctx, input.day, mealIndex);
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, SIDE, y, CONTENT_WIDTH, boxHeight, 30);
    ctx.fill();

    ctx.fillStyle = "#0f7a55";
    ctx.font = `700 29px ${FONT_FAMILY}`;
    const heading = `${meal.time || "Saat belirtilmedi"}  •  ${meal.name}`;
    ctx.fillText(heading, SIDE + 36, y + 54);

    ctx.fillStyle = "#23312b";
    ctx.font = `500 27px ${FONT_FAMILY}`;
    let foodY = y + 103;
    meal.foods.forEach((food) => {
      const lines = wrapText(ctx, `${food.name}  •  ${food.portion}`, CONTENT_WIDTH - 96);
      lines.forEach((line) => {
        ctx.fillText(`• ${line}`, SIDE + 42, foodY);
        foodY += 42;
      });
    });

    y += boxHeight + 24;
  });

  const totalsY = y + 8;
  ctx.fillStyle = "#e8f3ee";
  roundedRect(ctx, SIDE, totalsY, CONTENT_WIDTH, 180, 30);
  ctx.fill();

  ctx.fillStyle = "#153d2e";
  ctx.font = `700 30px ${FONT_FAMILY}`;
  ctx.fillText(`Günlük toplam  ~${Math.round(input.day.totalCalories)} kcal`, SIDE + 36, totalsY + 54);
  ctx.font = `600 25px ${FONT_FAMILY}`;
  ctx.fillText(
    `Protein ${Math.round(input.day.totalProteinGrams)} g   •   Karbonhidrat ${Math.round(input.day.totalCarbsGrams)} g   •   Yağ ${Math.round(input.day.totalFatGrams)} g`,
    SIDE + 36,
    totalsY + 105,
  );

  ctx.fillStyle = "#66736e";
  ctx.font = `500 22px ${FONT_FAMILY}`;
  ctx.fillText("Kişisel beslenme planı • Diewish", SIDE, height - 70);
  ctx.textAlign = "right";
  ctx.fillText("Yaklaşık besin değerleri içerir", CARD_WIDTH - SIDE, height - 70);
  ctx.textAlign = "left";

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Share image could not be created."));
    }, "image/png");
  });
}

function shareText(input: ShareNutritionDayInput): string {
  const lines = [`Diewish • ${input.dayNumber}. Gün`, input.dateLabel, ""];
  input.day.meals.forEach((meal) => {
    lines.push(`${meal.time || ""} ${meal.name}`.trim());
    meal.foods.forEach((food) => lines.push(`• ${food.name} — ${food.portion}`));
    lines.push("");
  });
  lines.push(`~${Math.round(input.day.totalCalories)} kcal`);
  lines.push(
    `Protein ${Math.round(input.day.totalProteinGrams)} g • Karbonhidrat ${Math.round(input.day.totalCarbsGrams)} g • Yağ ${Math.round(input.day.totalFatGrams)} g`,
  );
  return lines.join("\n");
}

export async function shareNutritionPlanDay(
  input: ShareNutritionDayInput,
): Promise<NutritionDayShareResult> {
  const canvas = createDayCanvas(input);
  const filename = `Diewish-${input.dayNumber}-gun.png`;
  const text = shareText(input);

  const nativeShare = window.DiewishShare;
  if (nativeShare?.isAvailable()) {
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    nativeShare.sharePng(base64, filename, text);
    return "shared";
  }

  const blob = await canvasToBlob(canvas);
  const file = new File([blob], filename, { type: "image/png" });
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({
        title: `Diewish • ${input.dayNumber}. Gün`,
        text: "Kişisel beslenme planı",
        files: [file],
      });
      return "shared";
    }

    if (navigator.share) {
      await navigator.share({ title: `Diewish • ${input.dayNumber}. Gün`, text });
      return "shared";
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }

  await navigator.clipboard.writeText(text);
  return "copied";
}
