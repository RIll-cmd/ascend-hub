// A small Markdown subset for agent messages: enough for headings, lists, code and emphasis. It never produces HTML,
// so an agent's text cannot inject markup; the renderer turns these tokens into React elements.
export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "rule" }
  | { kind: "code"; lang: string; text: string };

export type Inline = { kind: "text" | "code" | "bold" | "em"; text: string } | { kind: "link"; text: string; href: string };

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "para", text: para.join("\n") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```([\w+-]*)\s*(.*)$/.exec(line);
    if (fence) {
      flush();
      const body = fence[2] ? [fence[2]] : [];
      while (i + 1 < lines.length && !/^\s*```\s*$/.test(lines[i + 1])) body.push(lines[++i]);
      i++; // the closing fence, if there is one
      blocks.push({ kind: "code", lang: fence[1], text: body.join("\n") });
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }
    const item = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line);
    if (item) {
      flush();
      const ordered = item[1] !== undefined;
      const last = blocks.at(-1);
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(item[2]);
      else blocks.push({ kind: "list", ordered, items: [item[2]] });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const last = blocks.at(-1);
    if (!para.length && last?.kind === "list" && /^\s{2,}\S/.test(line)) {
      last.items[last.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

// Leftmost match wins, so markup inside `code` stays literal; italics need text hugging both asterisks.
const INLINE = /`([^`\n]+)`|\*\*(?=\S)([^*\n]+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|\*(?=\S)([^*\n]*?\S)\*/g;

export function inlineTokens(text: string): Inline[] {
  const tokens: Inline[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = tokens.at(-1);
    if (last?.kind === "text") last.text += value;
    else tokens.push({ kind: "text", text: value });
  };
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    pushText(text.slice(at, m.index));
    if (m[1] !== undefined) tokens.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined) tokens.push({ kind: "bold", text: m[2] });
    else if (m[3] !== undefined) tokens.push({ kind: "link", text: m[3], href: m[4] });
    else tokens.push({ kind: "em", text: m[5] });
    at = m.index + m[0].length;
  }
  pushText(text.slice(at));
  return tokens;
}

// Gate summaries are flattened to one line (the same words Vision speaks), so fenced code arrives inline:
// a closed fence becomes inline code, and a fence the length cap cut off loses its marker.
export function inlineSummary(text: string): string {
  return text.replace(/```[\w+-]*\s*([\s\S]*?)\s*```/g, "`$1`").replace(/```[\w+-]*\s*/g, "");
}
