// Isolated renderer uses the actual mascot JSX/CSS and unchanged WebPs. No
// accounts, API calls or production access. Full lifecycle is tested in E2E.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { chromium, webkit } = require("playwright");
const { PNG } = require("playwright-core/lib/utilsBundle");
const root = path.resolve(__dirname, "..");
const directory = path.join(root, "src/presentation/components/mascot");
const output = path.join(root, "test-results/mirmir-motion");
fs.mkdirSync(output, { recursive: true });

function markup(active) {
  let state = 0;
  const hooks = {
    ...React,
    useId: () => "fixture",
    useRef: () => ({ current: null }),
    useEffect: () => {},
    useState: () => [state++ < 5, () => {}],
  };
  function load(name) {
    const source = fs.readFileSync(path.join(directory, name + ".tsx"), "utf8");
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const exports = {};
    vm.runInNewContext(code, {
      exports,
      require: (id) => {
        if (id === "react") return hooks;
        if (id === "next/image")
          return {
            default: ({ unoptimized, onLoad, onError, ...props }) =>
              React.createElement("img", props),
          };
        if (id.endsWith(".css")) return { default: new Proxy({}, { get: (_, name) => name }) };
        if (id.includes("shared/lib/utils"))
          return { cn: (...values) => values.filter(Boolean).join(" ") };
        if (id === "./mirmir-motion") return load("mirmir-motion");
        return require(id);
      },
    });
    return exports;
  }
  const { MirmirMascot } = load("mirmir-mascot");
  const css = fs.readFileSync(path.join(directory, "mirmir-mascot.module.css"), "utf8");
  return `<!doctype html><style>${css}html,body{margin:0;background:var(--bg,#fff)}.size-14{width:56px;height:56px}</style>${renderToStaticMarkup(React.createElement(MirmirMascot, { animationEnabled: active }))}`;
}

function changes(a, b, box) {
  const left = PNG.sync.read(a),
    right = PNG.sync.read(b);
  let count = 0,
    total = 0;
  for (let y = box[1]; y < box[3]; y++)
    for (let x = box[0]; x < box[2]; x++) {
      const offset = (y * left.width + x) * 4;
      const delta = [0, 1, 2].reduce(
        (n, i) => n + Math.abs(left.data[offset + i] - right.data[offset + i]),
        0,
      );
      if (delta > 12) count++;
      total += delta;
    }
  return { count, total };
}

for (const [name, engine] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  test(
    `${name}: actual SVG tail/breath output, fixed cushion, original rest frame and mobile recording`,
    { timeout: 90_000 },
    async () => {
      const server = http.createServer((req, res) => {
        if (req.url.startsWith("/images/")) {
          res.setHeader("Content-Type", "image/webp");
          res.end(fs.readFileSync(path.join(root, "public", req.url)));
        } else {
          res.setHeader("Content-Type", "text/html");
          res.end(markup(!req.url.includes("off")));
        }
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      let browser, context;
      try {
        browser = await engine.launch();
        context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          recordVideo: { dir: output, size: { width: 390, height: 844 } },
        });
        const page = await context.newPage();
        await page.goto(base);
        await page
          .locator("img")
          .first()
          .evaluate((img) => img.decode());
        const mascot = page.locator('[data-mascot="mirmir"]');
        await mascot.evaluate((node) => {
          node.style.width = "512px";
          node.style.height = "512px";
        });
        async function snapshot(time) {
          await mascot.evaluate((node, t) => {
            for (const a of node.getAnimations({ subtree: true })) {
              a.pause();
              a.currentTime = 100;
            }
            const svg = node.querySelector("svg");
            svg.pauseAnimations();
            svg.setCurrentTime(t);
          }, time);
          return mascot.screenshot();
        }
        const rest = await snapshot(0);
        const tail = await snapshot(8.424);
        const breath = await snapshot(3.536);
        fs.writeFileSync(path.join(output, `${name}-rest.png`), rest);
        fs.writeFileSync(path.join(output, `${name}-tail.png`), tail);
        fs.writeFileSync(path.join(output, `${name}-breath.png`), breath);
        const tailDiff = changes(rest, tail, [375, 260, 512, 374]);
        const breathDiff = changes(rest, breath, [30, 100, 370, 340]);
        const cushionDiff = changes(rest, tail, [0, 380, 330, 465]);
        console.log(JSON.stringify({ engine: name, tailDiff, breathDiff, cushionDiff }));
        assert.ok(tailDiff.count > 200, "Tail tip must visibly move in actual rendered pixels");
        assert.ok(breathDiff.count > 200, "Breath must affect only upper body");
        assert.equal(cushionDiff.count, 0, "Tail must leave cushion stationary");
        assert.equal(changes(rest, tail, [0, 0, 360, 340]).count, 0, "Tail must not move the face");
        await page.goto(base + "/off");
        await page
          .locator("img")
          .first()
          .evaluate((img) => img.decode());
        await mascot.evaluate((node) => {
          node.style.width = "512px";
          node.style.height = "512px";
        });
        const original = await mascot.screenshot();
        assert.equal(
          changes(rest, original, [0, 0, 512, 512]).count,
          0,
          "Zero displacement preserves original pixels",
        );
        await page.goto(base);
        await page
          .locator("img")
          .first()
          .evaluate((img) => img.decode());
        for (const width of [390, 412, 430])
          for (const theme of ["light", "dark"]) {
            await page.setViewportSize({ width, height: 844 });
            await page.evaluate(
              (color) => document.body.style.setProperty("--bg", color),
              theme === "dark" ? "#111827" : "#ffffff",
            );
            const before = await snapshot(0),
              after = await snapshot(8.424);
            const diff = changes(before, after, [0, 0, 56, 56]);
            assert.ok(diff.count > 4, "Tail must remain readable at 56px");
            fs.writeFileSync(path.join(output, `${name}-${width}-${theme}.png`), after);
          }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(base + "/off");
        await page.waitForTimeout(1200);
        await page.goto(base);
        await page.waitForTimeout(11000);
        // Small inline evidence can be inspected without downloading a private artifact.
        await mascot.evaluate((node) => {
          node.style.width = "192px";
          node.style.height = "192px";
        });
        const preview = await snapshot(8.424);
        console.log(`MIRMIR_PREVIEW_${name}=${preview.toString("base64")}`);
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(
          await mascot.locator(".motionLayer").evaluate((node) => getComputedStyle(node).filter),
          "none",
        );
      } finally {
        await context?.close();
        await browser?.close();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  );
}
