"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { Investigation } from "@/lib/types";

const components: Components = {
    h1: ({ children }) => (
        <h1 className="mb-2 border-b border-orange-500/30 pb-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {children}
        </h1>
    ),
    h2: ({ children }) => (
        <h2 className="mb-2 mt-8 flex items-center gap-2 border-b border-white/10 pb-2 text-lg font-semibold text-white sm:mb-3 sm:mt-10 sm:text-xl">
            <span className="inline-block h-4 w-1 rounded-full bg-orange-500 sm:h-5" />
            {children}
        </h2>
    ),
    h3: ({ children }) => (
        <h3 className="mb-1.5 mt-5 text-base font-semibold text-neutral-200 sm:mb-2 sm:mt-6 sm:text-lg">
            {children}
        </h3>
    ),
    p: ({ children }) => (
        <p className="mb-3 text-sm leading-relaxed text-neutral-300 sm:mb-4 sm:text-base sm:leading-7">{children}</p>
    ),
    strong: ({ children }) => (
        <strong className="font-semibold text-white">{children}</strong>
    ),
    em: ({ children }) => (
        <em className="text-neutral-400">{children}</em>
    ),
    a: ({ href, children }) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-400 underline decoration-orange-400/30 underline-offset-2 transition-colors hover:text-orange-300 hover:decoration-orange-300/50"
        >
            {children}
        </a>
    ),
    ul: ({ children }) => (
        <ul className="mb-3 ml-1 space-y-1.5 text-neutral-300 sm:mb-4 sm:space-y-2">{children}</ul>
    ),
    ol: ({ children }) => (
        <ol className="mb-3 ml-1 list-none space-y-1.5 text-neutral-300 sm:mb-4 sm:space-y-2 [counter-reset:item]">
            {children}
        </ol>
    ),
    li: ({ children }) => (
        <li className="flex gap-2 sm:gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400/60 sm:mt-2.5" />
            <span className="text-sm leading-relaxed sm:text-base sm:leading-7">{children}</span>
        </li>
    ),
    blockquote: ({ children }) => (
        <blockquote className="my-3 border-l-2 border-orange-500/40 bg-orange-500/5 py-2 pl-3 pr-3 text-sm text-neutral-300 sm:my-4 sm:py-3 sm:pl-4 sm:pr-4 sm:text-base [&>p]:mb-0">
            {children}
        </blockquote>
    ),
    hr: () => <hr className="my-6 border-white/10 sm:my-8" />,
    table: ({ children }) => (
        <div className="my-4 overflow-x-auto rounded-lg border border-white/10 sm:my-6">
            <table className="w-full text-xs sm:text-sm">{children}</table>
        </div>
    ),
    thead: ({ children }) => (
        <thead className="border-b border-white/10 bg-white/5 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-400 sm:text-xs">
            {children}
        </thead>
    ),
    tbody: ({ children }) => (
        <tbody className="divide-y divide-white/5">{children}</tbody>
    ),
    tr: ({ children }) => (
        <tr className="transition-colors hover:bg-white/[.03]">{children}</tr>
    ),
    th: ({ children }) => (
        <th className="px-2 py-2 font-semibold text-neutral-300 sm:px-4 sm:py-3">{children}</th>
    ),
    td: ({ children }) => (
        <td className="px-2 py-2 text-neutral-300 sm:px-4 sm:py-3">{children}</td>
    ),
    code: ({ children, className }) => {
        const isBlock = className?.includes("language-");
        if (isBlock) {
            return (
                <code className="block overflow-x-auto rounded-lg bg-black p-3 font-mono text-xs text-neutral-300 sm:p-4 sm:text-sm">
                    {children}
                </code>
            );
        }
        return (
            <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs text-orange-300 sm:px-1.5 sm:text-sm">
                {children}
            </code>
        );
    },
    pre: ({ children }) => (
        <pre className="my-3 overflow-x-auto rounded-lg border border-white/10 bg-black p-0 sm:my-4">
            {children}
        </pre>
    ),
};

interface Props {
    investigation: Investigation;
}

export function TabReport({ investigation: inv }: Props) {
    const report = inv.final_report?.trim() || inv.redacted_report?.trim();

    if (!report) {
        return (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center text-sm text-neutral-400 sm:p-8">
                No report generated.
            </div>
        );
    }

    return (
        <div className="p-0 sm:p-2 lg:p-4">
            <div className="rounded-lg border border-white/10 bg-gradient-to-b from-white/[.04] to-white/[.02] p-4 shadow-lg sm:p-6 md:p-8 lg:p-10">
                {/* Subtle top accent line */}
                <div className="mb-5 h-0.5 w-12 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 sm:mb-8 sm:w-16" />

                <article className="max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                        {report}
                    </ReactMarkdown>
                </article>

                {/* Footer */}
                <div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-4 text-[10px] text-neutral-500 sm:mt-10 sm:gap-3 sm:pt-6 sm:text-xs">
                    <div className="h-1.5 w-1.5 rounded-full bg-orange-500/60 sm:h-2 sm:w-2" />
                    Generated by AI Research Agent
                </div>
            </div>
        </div>
    );
}
