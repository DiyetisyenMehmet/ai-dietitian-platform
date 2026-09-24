import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

const ROOT = process.cwd();
const ASSET_ROOT = join(ROOT, "public/images/diewish/semantic");

const EXPECTED_ASSETS = {
  "diewish-coach-avatar.png":
    "51df0e4898b7fa57f4eabb1a85207a77d71ab297ac5c1933a61d0abfebc8f6f0",
  "diewish-quick-suggestions.png":
    "284de95f03b05e0edf91be44868dcad3910965c7addd5159aac0f524d3156b35",
  "diewish-evaluation.png":
    "110e6c5e3b85c27c6b405245a076ed1716105a5bf18f36e203db9c11a5602eab",
  "diewish-weight-analysis.png":
    "4b82c26a2cf63ad4330c585cdca64f7892f64db10b140d909555256cb6924e6c",
} as const;

function source(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

test("approved semantic icon binaries are exact and unmodified", () => {
  for (const [name, expected] of Object.entries(EXPECTED_ASSETS)) {
    const bytes = readFileSync(join(ASSET_ROOT, name));
    expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(expected);
  }
});

test("semantic icon usage map is explicit while bottom navigation stays unchanged", () => {
  const avatar = source("src/presentation/components/chat/ai-avatar.tsx");
  const input = source("src/presentation/components/chat/chat-input.tsx");
  const sheet = source("src/presentation/components/chat/quick-prompts-sheet.tsx");
  const evaluation = source("src/presentation/components/history/history-evaluation-card.tsx");
  const share = source("src/presentation/components/history/history-share-dom.tsx");
  const progress = source("src/presentation/components/progress/progress-view.tsx");
  const stats = source("src/presentation/components/progress/progress-stats-section.tsx");
  const navigation = source("src/shared/constants/navigation.ts");

  expect(avatar).toContain("diewish-coach-avatar.png");
  expect(avatar).toContain('data-diewish-semantic-icon="coach-avatar"');

  expect(input).toContain('aria-label="Hızlı öneriler"');
  expect(input).toContain("setSuggestionsOpen(true)");
  expect(input).toContain("diewish-quick-suggestions.png");
  expect(sheet).toContain("diewish-quick-suggestions.png");

  expect(evaluation).toContain("diewish-evaluation.png");
  expect(share).toContain("diewish-evaluation.png");
  expect(progress).toContain("diewish-evaluation.png");
  expect(stats).toContain("diewish-evaluation.png");
  expect(stats).toContain("diewish-weight-analysis.png");

  expect(navigation).toMatch(/id:\s*"ai"[\s\S]*?label:\s*"Koç"[\s\S]*?icon:\s*Leaf/u);
  expect(navigation).not.toContain("diewish-coach-avatar");
});

test("History business formatter remains separate from icon presentation", () => {
  const formatter = source("src/application/history/history-share-text.ts");
  const share = source("src/presentation/components/history/history-share-dom.tsx");

  expect(formatter).toContain("formatHistoryShareText");
  expect(formatter).not.toContain("diewish-evaluation.png");
  expect(formatter).not.toContain("diewish-coach-avatar.png");
  expect(share).toContain('data-diewish-semantic-icon="evaluation"');
});
