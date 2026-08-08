export type MarketingMarkdownBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export function parseMarketingMarkdown(markdown?: string): MarketingMarkdownBlock[] {
  const lines = markdown?.replace(/\r\n?/g, "\n").split("\n") ?? [];
  const blocks: MarketingMarkdownBlock[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length === 1 ? 2 : 3, text: heading[2] });
      index += 1;
      continue;
    }

    const firstListItem = /^[-*]\s+(.+)$/.exec(line);
    if (firstListItem) {
      const items = [firstListItem[1]];
      index += 1;
      while (index < lines.length) {
        const item = /^\s*[-*]\s+(.+)$/.exec(lines[index]);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+/.test(lines[index]) && !/^\s*[-*]\s+/.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

export function safeMarkdownHref(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
