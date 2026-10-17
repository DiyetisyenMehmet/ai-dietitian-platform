const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const time = new Date(2026, 9, 14, 0, 5).getTime();
function renderHistory(conversations) {
  const exports = {};
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [time]));
    }
    static now() {
      return time;
    }
  }
  const primitive = ({ children }) => React.createElement("div", null, children);
  const ui = new Proxy(
    { Modal: ({ open, children }) => (open ? children : null) },
    {
      get: (target, name) => target[name] ?? primitive,
    },
  );
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.join(__dirname, "../src/presentation/components/chat/chat-sidebar.tsx"),
        "utf8",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    {
      exports,
      Date: Clock,
      require: (name) => {
        if (name === "react" || name === "react/jsx-runtime") return require(name);
        if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
        if (name === "sonner") return { toast: {} };
        if (name.endsWith("chat-store"))
          return {
            chatStore: {},
            isDraftConversationId: (id) => id.startsWith("draft-"),
            useChatState: () => ({ conversations, activeId: "draft-unsent", isResponding: false }),
          };
        if (name.endsWith("/utils")) return { cn: (...values) => values.filter(Boolean).join(" ") };
        if (name.endsWith("conversation-share")) return {};
        if (name === "./ai-avatar") return { AiAvatar: () => null };
        return ui;
      },
    },
  );
  return renderToStaticMarkup(
    React.createElement(exports.ChatSidebar, {
      open: true,
      onClose() {},
      triggerRef: React.createRef(),
    }),
  );
}
const thread = (id, title, messages = []) => ({
  id,
  title,
  messages,
  updatedAt: time,
  pinnedAt: null,
});

test("actual sidebar renders dates for unloaded summaries without claiming they are empty", () => {
  const html = renderHistory([
    thread("server-unloaded", "Remote saved conversation"),
    thread("server-loaded", "Selected saved conversation", [
      { role: "user", content: "Synthetic" },
    ]),
  ]);
  assert.match(html, /Remote saved conversation/);
  assert.match(html, /Selected saved conversation/);
  assert.equal((html.match(/>Bugün<\/span>/g) ?? []).length, 2);
  assert.doesNotMatch(html, />Boş<\/span>/);
});

test("actual sidebar hides only message-free local drafts and preserves all saved records", () => {
  const rows = [
    thread("draft-unsent", "Unsent local draft"),
    thread("server-empty", "Saved empty conversation"),
    thread("server-pinned", "Saved pinned conversation"),
    thread("draft-failed", "Local message awaiting retry", [
      { role: "user", content: "Synthetic" },
    ]),
  ];
  rows[2].pinnedAt = time;
  const before = JSON.stringify(rows);
  const html = renderHistory(rows);
  assert.doesNotMatch(html, /Unsent local draft/);
  for (const title of [
    "Saved empty conversation",
    "Saved pinned conversation",
    "Local message awaiting retry",
  ])
    assert.ok(html.includes(title));
  assert.equal(JSON.stringify(rows), before);
});

test("actual sidebar displays yesterday and two days ago across the local midnight boundary", () => {
  const yesterday = thread("server-yesterday", "Yesterday conversation");
  yesterday.updatedAt = new Date(2026, 9, 13, 23, 59).getTime();
  const older = thread("server-older", "Older conversation");
  older.updatedAt = new Date(2026, 9, 12, 23, 59).getTime();
  const html = renderHistory([yesterday, older]);
  assert.match(html, />Dün<\/span>/);
  assert.match(html, />2 gün önce<\/span>/);
});
