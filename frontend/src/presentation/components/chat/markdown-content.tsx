import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Lightbulb } from "lucide-react";

/**
 * Renders assistant markdown with premium styling: headings, bullet/numbered
 * lists, GFM tables, inline code and blockquotes styled as highlighted "tip"
 * callouts. Purely presentational — no HTML is dangerously injected.
 */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  ul: ({ children }) => <ul className="my-2 space-y-1 pl-1">{children}</ul>,
  ol: ({ children }) => (
    <ol className="my-2 list-inside list-decimal space-y-1 pl-1 marker:text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed [ul_&]:relative [ul_&]:pl-4 [ul_&]:before:absolute [ul_&]:before:left-0 [ul_&]:before:text-primary [ul_&]:before:content-['•']">
      {children}
    </li>
  ),
  h1: ({ children }) => (
    <h3 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h5>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  ),
  a: ({ children, href }) => (
    <a href={href} className="font-medium text-primary underline underline-offset-2">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-secondary/70">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border px-3 py-2 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/60 px-3 py-2 align-top last:text-right">{children}</td>
  ),
  blockquote: ({ children }) => (
    <div className="my-3 flex gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="[&_p]:my-0 [&_p]:text-foreground/90">{children}</div>
    </div>
  ),
};

export const MarkdownContent = React.memo(function MarkdownContent({
  content,
}: {
  content: string;
}) {
  return (
    <div className="text-sm text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
