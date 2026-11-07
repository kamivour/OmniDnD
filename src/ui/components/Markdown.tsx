import type { ReactNode } from 'react';
import { parseMarkdown, type Inline } from '../markdown';

function inline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.t) {
      case 'text':
        return node.v;
      case 'br':
        return <br key={index} />;
      case 'b':
        return <strong key={index}>{inline(node.c)}</strong>;
      case 'i':
        return <em key={index}>{inline(node.c)}</em>;
      case 'code':
        return (
          <code key={index} className="rounded-btn bg-surface-2 px-1">
            {node.v}
          </code>
        );
      case 'a':
        return (
          <a
            key={index}
            href={node.href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent underline"
          >
            {inline(node.c)}
          </a>
        );
    }
  });
}

/** Journal text with light formatting. Typed HTML is shown as text, never run. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 wrap-anywhere ${className ?? ''}`}>
      {parseMarkdown(text).map((block, index) => {
        switch (block.t) {
          case 'p':
            return <p key={index}>{inline(block.c)}</p>;
          case 'h':
            return (
              <p key={index} className="font-semibold">
                {inline(block.c)}
              </p>
            );
          case 'quote':
            return (
              <blockquote key={index} className="border-l-2 border-border pl-3 text-text-muted">
                {inline(block.c)}
              </blockquote>
            );
          case 'ul':
            return (
              <ul key={index} className="list-disc pl-5">
                {block.items.map((item, at) => (
                  <li key={at}>{inline(item)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={index} className="list-decimal pl-5">
                {block.items.map((item, at) => (
                  <li key={at}>{inline(item)}</li>
                ))}
              </ol>
            );
        }
      })}
    </div>
  );
}
