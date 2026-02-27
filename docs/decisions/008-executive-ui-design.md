# ADR 008: Executive-grade UI design

## Status

Accepted.

## Context

The Deep Research Agent frontend originally targeted analysts: dense tabs (Overview, Entities, Graph, Risk, Source Audit, Execution Trace), a full markdown report dump in Overview, and methodology as a separate tab. Key backend innovations — Temporal Intelligence, Adversarial Risk Debate, and Identity Graph Reasoning — were under-exposed. C-level or compliance officers making go/no-go decisions need a scannable, action-oriented interface with critical information above the fold and details available on demand.

## Decision

1. **Decision-maker focus over analyst focus**  
   The primary persona is an executive or compliance officer. The main view (Brief tab) is a decision card: risk verdict, one-line summary, risk score and confidence, with subject profile and top findings immediately visible. Details (full risk list, timeline, network, evidence) live in dedicated tabs rather than buried in a long report.

2. **Collapsible detail pattern**  
   Subject profile, investigation scope, execution trace, risk debate transcript, and graph insights are shown in collapsible sections (e.g. `ExpandableReasoningBlock`). Defaults: Brief decision card and subject profile open; investigation scope and execution trace collapsed. This keeps the first screen minimal while preserving access to full detail.

3. **No raw report dump — structured data is the interface**  
   The full markdown report is removed from the Overview/Brief tab. The structured data (risk flags, temporal facts, entities, connections, run metadata) is the primary interface; the report remains available via the Export button for users who want the narrative document. This avoids redundancy and keeps the UI aligned with the same data the pipeline produces.

4. **Tab consolidation and new tabs**  
   - **Brief** (formerly Overview): Executive decision view; no report markdown.  
   - **Timeline**: New tab for temporal facts and contradiction callouts (Temporal Intelligence).  
   - **Risk Analysis**: Existing risk flags plus Timeline Anomalies, Risk Debate Transcript, and Graph Insights sections.  
   - **Network** (formerly Graph): Identity graph; header renamed to "Identity Network"; optional "Most connected" summary from `graph_insights`.  
   - **Entities**: Unchanged purpose; list view enhanced with confidence percentage and truncated description preview.  
   - **Evidence**: Merged Source Audit and Execution Trace into one tab (Source audit default expanded, Execution trace collapsible).  
   Methodology is folded into Brief’s "Investigation scope" section; separate Methodology tab removed.

5. **Citations everywhere**  
   All evidence and source URLs (risk flags, timeline facts, entity/connection sources, evidence tab) display as domain names (e.g. `sec.gov`) and link with `target="_blank"` and `rel="noopener noreferrer"`. A shared `domainFromUrl()` helper in `lib/utils.ts` ensures consistency.

6. **Confidence fallback**  
   When the backend never runs source verification (e.g. low `--max-iter`), `overall_confidence` stays 0. The API layer computes a fallback from entity-level confidences so the UI shows a meaningful percentage (e.g. ~96%) instead of 0%. See Part 1 of the implementation plan.

## Consequences

- **Pros**: Executives see verdict and key findings quickly; Timeline and Risk tabs clearly showcase temporal and adversarial innovations; fewer tabs and no report clutter improve scannability; citations are consistent and safe.  
- **Cons**: Users who want to read the full narrative in-app must use Export; persisted tab state (e.g. Zustand) uses new tab IDs so returning users may land on Brief instead of a previous "Overview" selection.  
- **Follow-up**: Run metadata (`duration_seconds`, cost, phases) is displayed in the header and Brief when `{id}_metadata.json` exists; future runs should ensure this file is written so the UI can show duration and cost consistently.
