"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders investigation report markdown in a prose-style layout matching
 * the Executive Due Diligence Report reference (card, headings, tables).
 */
export function ReportMarkdownView({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const text = content?.trim() || "No report generated yet.";
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-sm",
        "max-w-none",
        className
      )}
    >
      <div className="p-6 sm:p-8 md:p-10 text-[var(--text-secondary)]">
        <div
          className={cn(
            "report-prose max-w-none",
            "[&_h1]:text-2xl md:[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-[var(--foreground)] [&_h1]:mb-4",
            "[&_h2]:text-lg md:[&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-[var(--foreground)] [&_h2]:mt-10 [&_h2]:mb-4",
            "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[var(--foreground)] [&_h3]:mt-6 [&_h3]:mb-2",
            "[&_p]:leading-relaxed [&_p]:mb-3",
            "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-4 [&_ul]:space-y-1",
            "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-4 [&_ol]:space-y-1",
            "[&_li]:leading-relaxed",
            "[&_hr]:my-8 [&_hr]:border-[var(--border)]",
            "[&_strong]:font-semibold [&_strong]:text-[var(--foreground)]",
            "[&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:border-[var(--border)] [&_table]:my-4 [&_table]:rounded-lg [&_table]:overflow-hidden",
            "[&_thead]:bg-[var(--bg-secondary)]",
            "[&_th]:bg-[var(--bg-secondary)] [&_th]:border [&_th]:border-[var(--border)] [&_th]:p-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-[var(--muted)]",
            "[&_td]:border [&_td]:border-[var(--border)] [&_td]:p-3 [&_td]:text-sm [&_td]:text-[var(--text-secondary)]",
            "[&_tr]:border-b [&_tr]:border-[var(--border)] [&_tr:last-child]:border-b-0",
            "[&_blockquote]:border-l-4 [&_blockquote]:border-[var(--border-strong)] [&_blockquote]:pl-4 [&_blockquote]:my-4 [&_blockquote]:italic [&_blockquote]:text-[var(--muted)]"
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
