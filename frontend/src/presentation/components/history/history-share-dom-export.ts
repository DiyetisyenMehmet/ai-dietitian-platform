import { toBlob } from "html-to-image";

import type { HistorySharePayload } from "@/application/history/history-share";
import {
  shareHistoryPngBlob,
  shareHistoryVisual,
  type HistoryShareResult,
} from "@/presentation/components/history/history-share-card";

const EXPORT_WIDTH = 1080;

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Captures the exact preview node at a stable, high-resolution width and natural content height. */
export async function captureHistoryShareDom(node: HTMLElement): Promise<Blob> {
  if ("fonts" in document) await document.fonts.ready;
  await nextPaint();

  const width = node.getBoundingClientRect().width;
  if (!Number.isFinite(width) || width <= 0) throw new Error("Share preview is not visible.");

  const blob = await toBlob(node, {
    backgroundColor: "#f7fcf9",
    cacheBust: true,
    pixelRatio: EXPORT_WIDTH / width,
    skipAutoScale: false,
  });

  if (!blob || blob.type !== "image/png") throw new Error("Share image could not be created.");
  return blob;
}

/** Primary DOM export with the retained Canvas renderer as a safe fallback. */
export async function shareHistoryDomVisual(
  node: HTMLElement,
  payload: HistorySharePayload,
  caption?: string | null,
): Promise<HistoryShareResult> {
  let blob: Blob;
  try {
    blob = await captureHistoryShareDom(node);
  } catch {
    return shareHistoryVisual(payload, caption);
  }
  return shareHistoryPngBlob(payload, blob, caption);
}
