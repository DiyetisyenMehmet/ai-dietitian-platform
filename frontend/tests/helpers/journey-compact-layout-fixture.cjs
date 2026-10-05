// Renders the real DailyJourneyContent with production Tailwind styles.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "../..");
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(
    this,
    request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request,
    ...args,
  );
};

for (const ext of [".ts", ".tsx"]) {
  require.extensions[ext] = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8");
    module._compile(
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText,
      filename,
    );
  };
}

const lucidePath = require.resolve("lucide-react");
const lucide = new Module(lucidePath, module);
lucide.filename = lucidePath;
lucide.paths = Module._nodeModulePaths(path.dirname(lucidePath));
lucide._compile(fs.readFileSync(lucidePath, "utf8"), lucidePath);
require.cache[lucidePath] = lucide;

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const {
  DailyJourneyContent,
} = require("../../src/presentation/components/dashboard/daily-journey-section.tsx");

let css;

async function styles() {
  if (css) return css;
  const config = require("../../tailwind.config.ts").default;
  config.content = [path.join(root, "src/**/*.{ts,tsx}")];
  css = (
    await require("postcss")([require("tailwindcss")(config), require("autoprefixer")]).process(
      fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8"),
      { from: path.join(root, "src/app/globals.css") },
    )
  ).css;
  return css;
}

function productionFontCss() {
  if (process.env.JOURNEY_PRODUCTION_FONTS !== "1") return "";
  const cssDir = path.join(root, ".next/static/css");
  const blocks = fs
    .readdirSync(cssDir)
    .flatMap(
      (file) =>
        fs.readFileSync(path.join(cssDir, file), "utf8").match(/@font-face\{[^}]+\}/g) || [],
    )
    .filter((block) => /font-family:Inter;/.test(block));
  if (!blocks.length) throw new Error("Run npm run build before production-font Journey tests");
  return blocks.join("");
}

const steps = [
  {
    kind: "breakfast",
    state: "completed",
    icon: "sunrise",
    label: "Kahvaltı",
    hint: "Öğün kaydedildi",
    href: "/meals/add?slot=breakfast",
  },
  {
    kind: "lunch",
    state: "recommended",
    icon: "sun",
    label: "Öğle yemeği",
    hint: "Öğle yemeği kaydı henüz yok. Kilo verme hedefini düzenli kayıtlarla takip et",
    href: "/meals/add?slot=lunch",
  },
  {
    kind: "dinner",
    state: "pending",
    icon: "moon",
    label: "Akşam yemeği",
    hint: "Akşam yemeği kaydı henüz yok. Kilo verme hedefini düzenli kayıtlarla takip et",
    href: "/meals/add?slot=dinner",
  },
  {
    kind: "water",
    state: "pending",
    icon: "droplet",
    label: "Su",
    hint: "0 / 2500 ml su kaydı",
    progress: 0,
  },
];

async function renderJourneyFixture({ theme = "light", expanded = false } = {}) {
  const style = await styles();
  const fontCss = productionFontCss();
  const content = renderToStaticMarkup(
    React.createElement(
      "main",
      { style: { maxWidth: 672, margin: "auto", padding: 16 } },
      React.createElement(DailyJourneyContent, {
        steps,
        status: "actionable",
        expanded,
        onExpandedChange: () => {},
      }),
    ),
  );

  return `<!doctype html><html lang="tr" class="${theme === "dark" ? "dark" : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fontCss}${style}</style></head><body class="font-sans" style="--font-sans:${fontCss ? "Inter" : "Arial"}">${content}</body></html>`;
}

module.exports = { renderJourneyFixture };
