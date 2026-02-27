"use client";

const PHASES: { phase: string; what: string; analogy: string }[] = [
  { phase: "Baseline", what: "Name, title, company, public record", analogy: '"Who is this person?"' },
  { phase: "Breadth", what: "Cast wide net across domains", analogy: '"What world do they operate in?"' },
  { phase: "Depth", what: "Drill into anomalies found in Breadth", analogy: '"Wait, what\'s this SEC filing?"' },
  { phase: "Adversarial", what: "Actively search for contradictions, aliases, removed content", analogy: '"What are they hiding?"' },
  { phase: "Triangulation", what: "Cross-validate key claims across 3+ independent sources", analogy: '"Can I trust what I found?"' },
  { phase: "Synthesis", what: "Generate report with confidence-weighted findings", analogy: '"Here\'s what I know and how sure I am"' },
];

export function TabMethodology() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <section className="mb-8">
        <h1 className="mb-2 text-xl font-bold text-[var(--foreground)]">
          Cognitive architecture: not a pipeline — a thinking loop
        </h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Most agents run search → extract → report. This agent models how a human investigator
          actually thinks: form hypotheses, seek disconfirming evidence, revise beliefs, follow
          the thread that smells wrong.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          The agent runs in <strong>cognitive phases</strong>, not sequential stages:
        </p>
      </section>

      <section className="mb-8 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="py-2 pr-4 text-left font-semibold text-[var(--foreground)]">
                Phase
              </th>
              <th className="py-2 pr-4 text-left font-semibold text-[var(--foreground)]">
                What it does
              </th>
              <th className="py-2 text-left font-semibold text-[var(--foreground)]">
                Human analogy
              </th>
            </tr>
          </thead>
          <tbody>
            {PHASES.map((row) => (
              <tr key={row.phase} className="border-b border-[var(--border)]">
                <td className="py-2.5 pr-4 font-medium text-[var(--foreground)]">
                  {row.phase}
                </td>
                <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                  {row.what}
                </td>
                <td className="py-2.5 text-[var(--muted)]">{row.analogy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold text-[var(--foreground)]">
          Dynamic phase selection
        </h2>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          The Research Director doesn&apos;t follow a fixed order — it chooses the next phase based
          on what&apos;s missing. If Depth reveals a new entity, it can loop back to Breadth. If
          Triangulation finds contradictions, it triggers Adversarial. The graph loops until the
          Director calls <code className="rounded bg-[var(--bg-secondary)] px-1 py-0.5 font-mono text-xs">generate_report</code> or
          hits budget.
        </p>
      </section>

      <section className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <h2 className="mb-2 text-base font-semibold text-[var(--foreground)]">
          Trade-off — why not a fixed pipeline?
        </h2>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          A fixed pipeline would be simpler to debug and easier to explain the cost profile to
          stakeholders. We chose the dynamic loop because due diligence quality is non-linear: a
          single unexpected finding in step 3 can invalidate the entire direction. The cost of
          missed findings (false negatives in risk assessment) far exceeds the cost of a few extra
          search iterations. We mitigate unpredictability with hard budget caps and diminishing-returns
          termination.
        </p>
      </section>

      <section className="text-xs text-[var(--muted)]">
        <p>
          See <strong>ADR 001</strong> (LangGraph over chains) and <code className="rounded bg-[var(--bg-secondary)] px-1 font-mono">src/graph.py</code> for
          the orchestration implementation.
        </p>
      </section>
    </div>
  );
}
