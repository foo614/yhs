import type { ReactNode } from "react";
import { parseMarketingMarkdown, safeMarkdownHref } from "./marketing-markdown";

export function MarketingDescription({ markdown, className = "" }: { markdown?: string; className?: string }) {
  const blocks = parseMarketingMarkdown(markdown);
  if (blocks.length === 0) return null;

  return (
    <div className={`marketingDescription ${className}`.trim()}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return block.level === 2
            ? <h2 key={`${block.type}-${index}`}>{renderInlineMarkdown(block.text)}</h2>
            : <h3 key={`${block.type}-${index}`}>{renderInlineMarkdown(block.text)}</h3>;
        }
        if (block.type === "list") {
          return <ul key={`${block.type}-${index}`}>{block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>)}</ul>;
        }
        return <p key={`${block.type}-${index}`}>{renderInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const expression = /\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = expression.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    if (match[1]) {
      const href = safeMarkdownHref(match[2]);
      nodes.push(href ? <a href={href} key={`${match.index}-link`} target="_blank" rel="noreferrer">{match[1]}</a> : match[1]);
    } else if (match[3]) {
      nodes.push(<strong key={`${match.index}-strong`}>{match[3]}</strong>);
    } else {
      nodes.push(<em key={`${match.index}-em`}>{match[4]}</em>);
    }
    cursor = expression.lastIndex;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
