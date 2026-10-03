// Renders the production components and production Tailwind stylesheet without an
// account, database or deployed site. No card markup is copied into the fixture.
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
    let source = fs.readFileSync(filename, "utf8");
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
// Compile Lucide's CJS distribution explicitly (its package marks .js as ESM).
const lucidePath = require.resolve("lucide-react");
const lucide = new Module(lucidePath, module);
lucide.filename = lucidePath;
lucide.paths = Module._nodeModulePaths(path.dirname(lucidePath));
lucide._compile(fs.readFileSync(lucidePath, "utf8"), lucidePath);
require.cache[lucidePath] = lucide;
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const {
  DashboardFeatureLinks,
} = require("../../src/presentation/components/dashboard/dashboard-feature-links.tsx");
const {
  DashboardAiBanner,
} = require("../../src/presentation/components/dashboard/dashboard-ai-banner.tsx");
const {
  StepRow,
} = require("../../src/presentation/components/dashboard/daily-journey-section.tsx");
let css;
async function renderFixture(locale = "tr", theme = "light") {
  if (!css) {
    const config = require("../../tailwind.config.ts").default;
    config.content = [path.join(root, "src/**/*.{ts,tsx}")];
    css = (
      await require("postcss")([require("tailwindcss")(config), require("autoprefixer")]).process(
        fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8"),
        { from: path.join(root, "src/app/globals.css") },
      )
    ).css;
  }
  const h = React.createElement;
  const content = renderToStaticMarkup(
    h(
      "main",
      { style: { maxWidth: 672, margin: "auto", padding: 16 } },
      h(DashboardFeatureLinks, { bloodTestLocale: locale, featureLocale: locale }),
      h("div", { style: { marginTop: 24 } }, h(DashboardAiBanner, { locale })),
      h(
        "ul",
        { style: { marginTop: 24, padding: 16 } },
        ["completed", "recommended", "pending", "skipped"].map((state, i) =>
          h(StepRow, {
            key: state,
            last: i === 3,
            step: {
              kind: "dinner",
              state,
              icon: "utensils",
              label: locale === "tr" ? "Akşam yemeği" : "Evening meal",
              hint:
                locale === "tr"
                  ? "Akşam yemeği kaydı henüz yok. Kilo verme hedefin için öğününü kaydet."
                  : "Your evening meal is not recorded yet. Record your meal to follow your goal.",
              href: "/meals",
              progress: 0.2,
            },
          }),
        ),
      ),
    ),
  );
  // After a Next build, exercise the exact production Inter font files too.
  let fontCss = "";
  if (process.env.DASHBOARD_PRODUCTION_FONTS === "1") {
    const cssDir = path.join(root, ".next/static/css");
    const blocks = fs
      .readdirSync(cssDir)
      .flatMap(
        (file) =>
          fs.readFileSync(path.join(cssDir, file), "utf8").match(/@font-face\{[^}]+\}/g) || [],
      )
      .filter((block) => /font-family:Inter;/.test(block));
    if (!blocks.length) throw new Error("Run npm run build before production-font layout tests");
    fontCss = blocks.join("");
  }
  return `<!doctype html><html lang="${locale}" class="${theme === "dark" ? "dark" : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fontCss}${css}</style></head><body class="font-sans" style="--font-sans:${fontCss ? "Inter" : "Arial"}">${content}</body></html>`;
}
module.exports = { renderFixture };
