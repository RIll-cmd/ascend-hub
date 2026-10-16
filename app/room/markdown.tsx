"use client";

import { useState } from "react";
import { inlineTokens, parseBlocks } from "./markdown-parse";

function InlineText({ text }: { text: string }) {
  return (
    <>
      {inlineTokens(text).map((t, i) => {
        if (t.kind === "code") return <code key={i}>{t.text}</code>;
        if (t.kind === "bold") return <strong key={i}>{t.text}</strong>;
        if (t.kind === "em") return <em key={i}>{t.text}</em>;
        if (t.kind === "link") {
          // Agents often link local files (file:///…); only web links open, the rest show their target on hover.
          return /^https?:\/\//.test(t.href)
            ? <a key={i} href={t.href} target="_blank" rel="noreferrer noopener">{t.text}</a>
            : <span key={i} className="md-link" title={t.href}>{t.text}</span>;
        }
        return <span key={i}>{t.text}</span>;
      })}
    </>
  );
}

function CodeBlock({ lang, text, fold }: { lang: string; text: string; fold: number }) {
  const lines = text.split("\n");
  const [open, setOpen] = useState(lines.length <= fold);
  return (
    <div className="md-code">
      {lang && <span className="md-code-lang">{lang}</span>}
      <pre>{open ? text : lines.slice(0, fold).join("\n")}</pre>
      {lines.length > fold && (
        <button type="button" className="md-more" onClick={() => setOpen(o => !o)}>{open ? "Show less" : `Show all ${lines.length} lines`}</button>
      )}
    </div>
  );
}

export function Markdown({ text, foldCode = 12 }: { text: string; foldCode?: number }) {
  return (
    <div className="md">
      {parseBlocks(text).map((b, i) => {
        if (b.kind === "heading") {
          const H = b.level <= 2 ? "h3" : "h4";
          return <H key={i}><InlineText text={b.text} /></H>;
        }
        if (b.kind === "rule") return <hr key={i} />;
        if (b.kind === "code") return <CodeBlock key={i} lang={b.lang} text={b.text} fold={foldCode} />;
        if (b.kind === "list") {
          const L = b.ordered ? "ol" : "ul";
          return <L key={i}>{b.items.map((item, j) => <li key={j}><InlineText text={item} /></li>)}</L>;
        }
        return <p key={i}><InlineText text={b.text} /></p>;
      })}
    </div>
  );
}
