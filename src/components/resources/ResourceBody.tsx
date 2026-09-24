import Link from "next/link";
import type { ReactNode } from "react";
import type { ResourceBlock, ResourceInline, TableAlign } from "@/domain/resources/resource-content";
import { ResourceCtaPanel } from "@/components/resources/ResourceCtaPanel";

/**
 * Generic renderer for a parsed resource body (see
 * src/domain/resources/resource-content.ts). Presentational only: every
 * resource renders through this one component — no per-article JSX.
 *
 * Output is built from React elements only (never dangerouslySetInnerHTML).
 * Tables sit inside a labelled, keyboard-focusable horizontal scroll region so
 * a wide financial table scrolls inside itself on a 375px screen instead of
 * forcing the whole page to overflow sideways.
 */

const linkClass = "font-medium text-[var(--primary-text)] underline underline-offset-2 hover:no-underline";

function renderInline(nodes: ResourceInline[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, idx) => {
    const key = `${keyPrefix}-${idx}`;
    switch (node.type) {
      case "text":
        return node.value;
      case "strong":
        return (
          <strong key={key} className="font-semibold text-foreground">
            {renderInline(node.children, key)}
          </strong>
        );
      case "em":
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case "code":
        return (
          <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground">
            {node.value}
          </code>
        );
      case "link":
        if (node.href.startsWith("/")) {
          return (
            <Link key={key} href={node.href} className={linkClass}>
              {renderInline(node.children, key)}
            </Link>
          );
        }
        return (
          <a
            key={key}
            href={node.href}
            className={linkClass}
            {...(node.href.startsWith("https://") ? { rel: "noopener noreferrer" } : {})}
          >
            {renderInline(node.children, key)}
          </a>
        );
    }
  });
}

function alignClass(align: TableAlign): string {
  if (align === "right") return "text-right tabular-nums";
  if (align === "center") return "text-center";
  return "text-left";
}

function renderBlock(block: ResourceBlock, key: string): ReactNode {
  switch (block.type) {
    case "heading":
      return block.level === 2 ? (
        <h2 key={key} id={block.id} className="font-display mt-10 scroll-mt-6 text-2xl font-bold tracking-tight text-foreground">
          {renderInline(block.children, key)}
        </h2>
      ) : (
        <h3 key={key} id={block.id} className="font-display mt-8 scroll-mt-6 text-xl font-semibold tracking-tight text-foreground">
          {renderInline(block.children, key)}
        </h3>
      );
    case "paragraph":
      return (
        <p key={key} className="mt-4">
          {renderInline(block.children, key)}
        </p>
      );
    case "list":
      return block.ordered ? (
        <ol key={key} start={block.start === 1 ? undefined : block.start} className="mt-4 list-decimal space-y-2 pl-6">
          {block.items.map((item, idx) => (
            <li key={`${key}-${idx}`} className="pl-1">
              {renderInline(item, `${key}-${idx}`)}
            </li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="mt-4 list-disc space-y-2 pl-6">
          {block.items.map((item, idx) => (
            <li key={`${key}-${idx}`} className="pl-1">
              {renderInline(item, `${key}-${idx}`)}
            </li>
          ))}
        </ul>
      );
    case "checklist":
      return (
        <ul key={key} className="mt-4 space-y-2" aria-label="Checklist">
          {block.items.map((item, idx) => (
            <li key={`${key}-${idx}`} className="flex gap-3">
              <span
                aria-hidden="true"
                className={`mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[0.65rem] leading-none ${
                  item.checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                }`}
              >
                {item.checked ? "✓" : ""}
              </span>
              <span>
                {item.checked && <span className="sr-only">Done: </span>}
                {renderInline(item.children, `${key}-${idx}`)}
              </span>
            </li>
          ))}
        </ul>
      );
    case "table": {
      const captionId = `${key}-caption`;
      return (
        <div
          key={key}
          role="region"
          aria-labelledby={captionId}
          tabIndex={0}
          className="mt-6 max-w-full overflow-x-auto rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <table className="w-full border-collapse text-sm">
            <caption id={captionId} className="border-b border-border px-3 py-2 text-left font-semibold text-foreground">
              {renderInline(block.caption, `${key}-cap`)}
            </caption>
            <thead className="bg-muted">
              <tr>
                {block.header.map((cell, idx) => (
                  <th
                    key={`${key}-h${idx}`}
                    scope="col"
                    className={`whitespace-nowrap border-b border-border px-3 py-2 font-semibold text-foreground ${alignClass(block.align[idx])}`}
                  >
                    {renderInline(cell, `${key}-h${idx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIdx) => (
                <tr key={`${key}-r${rowIdx}`} className="border-b border-border last:border-b-0">
                  {row.map((cell, idx) => {
                    const cellKey = `${key}-r${rowIdx}c${idx}`;
                    const className = `px-3 py-2 align-top ${alignClass(block.align[idx])} ${
                      block.align[idx] === "right" ? "whitespace-nowrap" : "min-w-[8rem]"
                    }`;
                    return idx === 0 ? (
                      <th key={cellKey} scope="row" className={`${className} font-medium text-foreground`}>
                        {renderInline(cell, cellKey)}
                      </th>
                    ) : (
                      <td key={cellKey} className={className}>
                        {renderInline(cell, cellKey)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "blockquote":
      return (
        <blockquote key={key} className="mt-6 border-l-4 border-border pl-4 italic">
          {block.children.map((child, idx) => renderBlock(child, `${key}-${idx}`))}
        </blockquote>
      );
    case "callout":
      return (
        <aside
          key={key}
          aria-label={block.variant === "disclaimer" ? "Disclaimer" : "Note"}
          // Body text on a tinted panel uses the full foreground token: muted-foreground on
          // bg-muted / bg-primary/5 falls just short of WCAG AA 4.5:1 (axe-verified).
          className={`mt-6 rounded-lg border px-4 pb-4 text-foreground ${
            block.variant === "disclaimer" ? "border-border bg-muted text-sm" : "border-primary/30 bg-primary/5"
          }`}
        >
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-foreground">
            {block.variant === "disclaimer" ? "Disclaimer" : "Note"}
          </p>
          {block.children.map((child, idx) => renderBlock(child, `${key}-${idx}`))}
        </aside>
      );
    case "cta":
      return (
        <ResourceCtaPanel key={key} heading={renderInline(block.heading, `${key}-h`)}>
          {block.children.map((child, idx) => renderBlock(child, `${key}-${idx}`))}
        </ResourceCtaPanel>
      );
    case "image":
      return (
        // Resource images are fixed, repo-local files under public/resources; a plain <img>
        // (width-constrained, lazy) avoids requiring authors to declare pixel dimensions.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={key} src={block.src} alt={block.alt} loading="lazy" className="mt-6 h-auto max-w-full rounded-lg border border-border" />
      );
    case "rule":
      return <hr key={key} className="my-10 border-border" />;
  }
}

export function ResourceBody({ blocks }: { blocks: ResourceBlock[] }) {
  return (
    <div className="text-base leading-relaxed text-muted-foreground break-words">
      {blocks.map((block, idx) => renderBlock(block, `b${idx}`))}
    </div>
  );
}
