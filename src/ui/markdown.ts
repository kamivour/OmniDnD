/**
 * A small, safe Markdown reader for journal text. It returns plain data (never HTML), so the
 * view builds React elements and typed markup can only ever appear as text.
 * Supported: headings, bold, italic, inline code, links (http/https only), lists, quotes.
 */
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'br' }
  | { t: 'b' | 'i'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'a'; href: string; c: Inline[] };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3; c: Inline[] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'ul' | 'ol'; items: Inline[][] };

const TOKEN =
  /`([^`]+)`|\*\*([^*]+?)\*\*|(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])|(?<!\w)_([^_\s][^_]*?)_(?!\w)|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function safeUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function parseInline(text: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  const push = (v: string) => {
    v.split('\n').forEach((line, index) => {
      if (index > 0) out.push({ t: 'br' });
      if (line) out.push({ t: 'text', v: line });
    });
  };
  const nested = (v: string): Inline[] =>
    depth < 3 ? parseInline(v, depth + 1) : [{ t: 'text', v }];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    push(text.slice(last, match.index));
    last = match.index + match[0].length;
    const [whole, code, bold, star, under, label, url] = match;
    if (code !== undefined) out.push({ t: 'code', v: code });
    else if (bold !== undefined) out.push({ t: 'b', c: nested(bold) });
    else if (star !== undefined || under !== undefined)
      out.push({ t: 'i', c: nested((star ?? under)!) });
    else {
      const href = safeUrl(url!);
      if (href) out.push({ t: 'a', href, c: [{ t: 'text', v: label! }] });
      else push(whole);
    }
  }
  push(text.slice(last));
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: Inline[][] } | undefined;
  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join('\n')) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: list.kind, items: list.items });
    list = undefined;
  };
  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+?)\s*#*$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({ t: 'h', level: heading[1]!.length as 1 | 2 | 3, c: parseInline(heading[2]!) });
    } else if (bullet || numbered) {
      flushPara();
      const kind = bullet ? 'ul' : 'ol';
      if (list && list.kind !== kind) flushList();
      list ??= { kind, items: [] };
      list.items.push(parseInline((bullet ?? numbered)![1]!));
    } else if (quote) {
      flushPara();
      flushList();
      blocks.push({ t: 'quote', c: parseInline(quote[1]!) });
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}
