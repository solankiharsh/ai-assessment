"""
Deep Research Agent — Main Entry Point.

Usage:
    python -m src.main investigate "Timothy Overturf" --role CEO --org "Sisu Capital"
    python -m src.main investigate "Jensen Huang" --role CEO --org NVIDIA --max-iter 3 --budget 5
    python -m src.main evaluate --persona easy
    python -m src.main evaluate --all
"""

from __future__ import annotations

# Load .env before any other imports so no third-party lib (e.g. anthropic/openai) can capture stale env keys
import src.config  # noqa: F401, E402 — ensure load_dotenv runs first

import argparse
import asyncio
import json
import time
from collections.abc import Callable
from pathlib import Path

import structlog
from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table
from rich.text import Text
from rich.theme import Theme

from src.config import get_settings
from src.evaluation.eval_set import ALL_PERSONAS, get_persona
from src.evaluation.metrics import evaluate
from src.graph import ResearchGraph
from src.models import ResearchState
from src.observability import metrics as obs_metrics

# ── Design: Intelligence Console — orange primary, amber/red risk ─────────────
# Matches frontend design system: true dark, orange-tinted primary, risk severity colors
_PHASE_CONFIG: dict[str, dict] = {
    "baseline":       {"color": "bold #94a3b8",  "emoji": "🔍", "label": "BASELINE"},
    "breadth":        {"color": "bold #64748b", "emoji": "🌐", "label": "BREADTH"},
    "depth":          {"color": "bold #e87900", "emoji": "🔬", "label": "DEPTH"},
    "adversarial":    {"color": "bold #f59e0b", "emoji": "⚔️ ", "label": "ADVERSARIAL"},
    "triangulation":  {"color": "bold #d97706", "emoji": "🔺", "label": "TRIANGULATION"},
    "synthesis":      {"color": "bold #ea580c", "emoji": "📋", "label": "SYNTHESIS"},
}

_CUSTOM_THEME = Theme({
    "phase.baseline":      "bold #94a3b8",
    "phase.breadth":       "bold #64748b",
    "phase.depth":         "bold #e87900",
    "phase.adversarial":   "bold #f59e0b",
    "phase.triangulation": "bold #d97706",
    "phase.synthesis":     "bold #ea580c",
    "log.info":            "dim white",
    "log.warning":         "bold #f59e0b",
    "log.error":           "bold #dc2626",
    "log.debug":           "dim #64748b",
    "log.key":             "#94a3b8",
    "log.val":             "#64748b",
    "primary":             "#ea580c",
    "risk.high":           "#dc2626",
    "risk.medium":        "#f59e0b",
    "fallback.banner":     "bold yellow on #ea580c",
    "node.header":         "bold #64748b",
})

console = Console(theme=_CUSTOM_THEME, highlight=False)
_current_phase: list[str] = [""]   # mutable singleton to track phase transitions


# ── Node display names ───────────────────────────────────────────────────────
_NODE_LABELS: dict[str, str] = {
    "director":           "Director · Planning",
    "web_research":       "Web Research",
    "fact_extraction":    "Fact Extraction",
    "risk_analysis":      "Risk Analysis",
    "connection_mapping": "Connection Mapping",
    "source_verification":"Source Verification",
    "entity_resolution":  "Entity Resolution",
    "temporal_analysis":  "Temporal Analysis",
    "generate_report":    "Report Generation",
    "update_graph_db":    "Graph DB Sync",
}


class _RichStructlogRenderer:
    """Custom structlog processor that renders log lines via Rich."""

    _SKIP_KEYS = frozenset({"event", "level", "_record"})

    def __call__(self, logger_: object, method: str, event_dict: dict) -> str:  # noqa: ARG002
        event = event_dict.get("event", "")
        level = event_dict.get("level", "info").lower()

        # ── Phase transition banner ──────────────────────────────────────────
        phase_raw = event_dict.get("phase", "") or ""
        phase_val = phase_raw.get("value", "") if isinstance(phase_raw, dict) else str(phase_raw)
        phase_val = phase_val.lower().strip()
        if phase_val and phase_val in _PHASE_CONFIG and phase_val != _current_phase[0]:
            _current_phase[0] = phase_val
            cfg = _PHASE_CONFIG[phase_val]
            console.print()
            console.print(Rule(
                f"{cfg['emoji']}  {cfg['label']}  PHASE",
                style=cfg["color"],
                characters="━",
            ))

        # ── Model fallback highlight ─────────────────────────────────────────
        if event == "llm_fallback_triggered":
            primary_m  = event_dict.get("primary_model", event_dict.get("primary_provider", "?"))
            fallback_m = event_dict.get("fallback_model", event_dict.get("fallback_provider", "?"))
            err_code   = event_dict.get("error_code", "transient")
            task_name  = event_dict.get("task", "")
            console.print()
            console.print(
                f"  [bold #f59e0b]╔══ MODEL FALLBACK ══╗[/bold #f59e0b]  "
                f"[#64748b]{primary_m}[/#64748b] [bold #ea580c]→[/bold #ea580c] [bold #0ea5e9]{fallback_m}[/bold #0ea5e9]  "
                f"[bold #dc2626][{err_code}][/bold #dc2626]  "
                + (f"[#64748b]task={task_name}[/#64748b]" if task_name else "")
            )
            console.print()
            raise structlog.DropEvent()

        # ── Pipeline node stage header ───────────────────────────────────────
        if event in ("node_stage_start",):
            node  = event_dict.get("node", "?")
            label = _NODE_LABELS.get(node, node.replace("_", " ").title())
            itr   = event_dict.get("iteration", "")
            ents  = event_dict.get("entity_count", "")
            flags = event_dict.get("risk_flags", "")
            detail_parts = []
            if itr != "":    detail_parts.append(f"iter {itr}")
            if ents != "":   detail_parts.append(f"entities {ents}")
            if flags != "": detail_parts.append(f"flags {flags}")
            detail = "  ·  ".join(detail_parts)
            console.print(
                f"  [bold #ea580c]▶[/bold #ea580c] "
                f"[bold #e2e8f0]{label}[/bold #e2e8f0]  "
                f"[#94a3b8]{detail}[/#94a3b8]"
            )
            raise structlog.DropEvent()

        # ── Regular log line (event-specific + risk/primary accents) ──────────
        extras = {
            k: v for k, v in event_dict.items()
            if k not in self._SKIP_KEYS
        }
        # Keys that get primary/risk accent instead of muted
        accent_keys = {"batch", "new_entities", "new_connections", "new_facts", "running_totals", "risk_flags", "entity_count", "iteration"}
        kv_parts = []
        for k, v in extras.items():
            vs = str(v)
            if len(vs) > 120:
                vs = vs[:117] + "…"
            if k in accent_keys:
                kv_parts.append(f"[#94a3b8]{k}[/#94a3b8]=[#ea580c]{vs}[/#ea580c]")
            elif k in ("sources", "queries") or "error" in k.lower():
                kv_parts.append(f"[#64748b]{k}[/#64748b]=[#94a3b8]{vs}[/#94a3b8]")
            else:
                kv_parts.append(f"[#64748b]{k}[/#64748b]=[#94a3b8]{vs}[/#94a3b8]")
        kv_str = "  ".join(kv_parts)

        if level == "warning":
            prefix = "[bold #f59e0b]⚠[/bold #f59e0b]"
            ev_fmt = f"[bold #f59e0b]{event}[/bold #f59e0b]"
        elif level in ("error", "critical"):
            prefix = "[bold #dc2626]✗[/bold #dc2626]"
            ev_fmt = f"[bold #dc2626]{event}[/bold #dc2626]"
        elif level == "debug":
            # Event-specific colors for high-density "intelligence" feel
            prefix = "[#64748b]·[/#64748b]"
            if "fact_extraction" in event:
                ev_fmt = f"[#0ea5e9]{event}[/#0ea5e9]"
            elif "risk" in event or "adversarial" in event.lower():
                ev_fmt = f"[#f59e0b]{event}[/#f59e0b]"
            elif "phase" in event or "director" in event or "iteration" in event:
                ev_fmt = f"[#ea580c]{event}[/#ea580c]"
            elif "entity" in event or "connection" in event:
                ev_fmt = f"[#94a3b8]{event}[/#94a3b8]"
            else:
                ev_fmt = f"[#64748b]{event}[/#64748b]"
        else:
            prefix = "[#ea580c]▪[/#ea580c]"
            if "fact_extraction" in event:
                ev_fmt = f"[bold #0ea5e9]{event}[/bold #0ea5e9]"
            elif "risk" in event or "adversarial" in event:
                ev_fmt = f"[bold #f59e0b]{event}[/bold #f59e0b]"
            elif "phase" in event or "iteration" in event or "director" in event:
                ev_fmt = f"[bold #ea580c]{event}[/bold #ea580c]"
            else:
                ev_fmt = f"[bold #e2e8f0]{event}[/bold #e2e8f0]"

        console.print(f"  {prefix} {ev_fmt}  {kv_str}")
        raise structlog.DropEvent()


structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        _RichStructlogRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger()



def _live_layout_and_callback(
    live_display: Live,
    layout: Layout,
    start_time: float,
) -> Callable[[str, dict], None]:
    """Build callback that updates the live layout on each node completion."""
    log_lines: list[str] = []

    def _phase_text(state: dict) -> Text:
        cp = state.get("current_phase")
        phase = cp.get("value", "—") if isinstance(cp, dict) else (cp or "—")
        return Text(f"Phase: {phase}  |  Iteration: {state.get('iteration', 0)}")

    def _stats_text(state: dict) -> Text:
        return Text(
            f"Entities: {len(state.get('entities') or [])}  |  "
            f"Connections: {len(state.get('connections') or [])}  |  "
            f"Risk flags: {len(state.get('risk_flags') or [])}"
        )

    def _footer_text(state: dict) -> Text:
        cost = state.get("estimated_cost_usd") or 0.0
        return Text(f"Elapsed: {time.time() - start_time:.1f}s  |  Est. cost: ${cost:.4f}")

    def on_progress(node_name: str, state_dict: dict) -> None:
        log_lines.append(f"{node_name} completed")
        layout["phase"].update(Panel(_phase_text(state_dict), title="Phase"))
        layout["stats"].update(Panel(_stats_text(state_dict), title="Stats"))
        layout["log"].update(Panel(Text("\n".join(log_lines[-5:]) or "—"), title="Log"))
        layout["footer"].update(Panel(_footer_text(state_dict), title="Progress"))
        live_display.update(layout)

    return on_progress


async def run_investigation(
    subject_name: str,
    current_role: str | None = None,
    current_org: str | None = None,
    max_iterations: int | None = None,
    output_dir: str = "outputs",
    budget_usd: float | None = None,
    debug: bool = False,
    live: bool = False,
    resume_thread_id: str | None = None,
    redact_pii: bool = False,
) -> None:
    """Run a complete investigation and save results."""
    settings = get_settings()
    if settings.observability.metrics_enabled:
        obs_metrics.start_server(port=settings.observability.metrics_port)
    budget = budget_usd if budget_usd is not None else settings.agent.cost_budget_usd
    console.print(
        Panel(
            f"[bold #ea580c]Deep Research AI Agent[/bold #ea580c]  —  Building an AI Investigator\n"
            f"Subject: [bold #e2e8f0]{subject_name}[/bold #e2e8f0]\n"
            f"Role: [#94a3b8]{current_role or 'Unknown'}[/#94a3b8] @ [#94a3b8]{current_org or 'Unknown'}[/#94a3b8]\n"
            f"Max Iterations: [#64748b]{max_iterations or 'default'}[/#64748b]  ·  "
            f"Cost budget: [bold #f59e0b]${budget:.2f}[/bold #f59e0b]" + (" (no limit)" if budget <= 0 else ""),
            title="[#ea580c] Intelligence Console — Investigation[/#ea580c]",
            border_style="#ea580c",
        )
    )

    start_time = time.time()
    on_progress: Callable[[str, dict], None] | None = None

    if live:
        layout = Layout()
        layout.split_column(
            Layout(name="phase", size=3),
            Layout(name="stats", size=3),
            Layout(name="log", size=8),
            Layout(name="footer", size=3),
        )
        with Live(layout, refresh_per_second=4, console=console) as live_display:
            on_progress = _live_layout_and_callback(live_display, layout, start_time)
            graph = ResearchGraph(
                budget_usd=budget if budget > 0 else None,
                debug=debug,
                output_dir=output_dir,
                on_progress=on_progress,
            )
            try:
                state = await graph.investigate(
                    subject_name=subject_name,
                    current_role=current_role,
                    current_org=current_org,
                    max_iterations=max_iterations,
                )
            finally:
                await graph.cleanup()
    else:
        graph = ResearchGraph(
            budget_usd=budget if budget > 0 else None,
            debug=debug,
            output_dir=output_dir,
            on_progress=None,
        )
        try:
            state = await graph.investigate(
                subject_name=subject_name,
                current_role=current_role,
                current_org=current_org,
                max_iterations=max_iterations,
            )
        finally:
            await graph.cleanup()

    elapsed = time.time() - start_time
    _display_results(state, elapsed)

    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    safe_name = subject_name.replace(" ", "_").lower()

    (out_path / f"{safe_name}_report.md").write_text(state.final_report or "No report")
    (out_path / f"{safe_name}_state.json").write_text(json.dumps(state.model_dump(), indent=2, default=str))

    # Save PII-redacted report if requested or if redacted content exists
    if redact_pii or state.redacted_report:
        if not state.redacted_report:
            from src.pii import PIIRedactor
            redactor = PIIRedactor()
            state.redacted_report = redactor.redact_report(state.final_report or "")
        (out_path / f"{safe_name}_report_redacted.md").write_text(state.redacted_report)
        console.print(f"[yellow]Redacted report saved to {out_path}/{safe_name}_report_redacted.md[/yellow]")
    entities_data = [
        {
            "name": e.name,
            "type": e.entity_type.value,
            "confidence": e.confidence,
            "attributes": e.attributes,
            "sources": e.source_urls,
        }
        for e in state.entities
    ]
    (out_path / f"{safe_name}_entities.json").write_text(json.dumps(entities_data, indent=2, default=str))
    console.print(f"\n[green]Outputs saved to {out_path}/[/green]")


async def run_evaluation(persona_name: str | None = None, run_all: bool = False) -> None:
    """Run evaluation against test personas."""
    personas = ALL_PERSONAS if run_all else [get_persona(persona_name)] if persona_name else []
    personas = [p for p in personas if p is not None]

    if not personas:
        console.print("[red]No matching persona found.[/red]")
        console.print("Available: " + ", ".join(p.name for p in ALL_PERSONAS))
        return

    for persona in personas:
        console.print(
            Panel(
                f"[bold]Evaluating: {persona.name}[/bold] ({persona.difficulty})\n"
                f"Expected: {len(persona.expected_facts)} facts, "
                f"{len(persona.expected_entities)} entities",
                title="Evaluation",
                border_style="yellow",
            )
        )
        graph = ResearchGraph()
        try:
            state = await graph.investigate(
                subject_name=persona.name,
                current_role=persona.current_role,
                current_org=persona.current_org,
            )
            result = evaluate(state, persona)
            console.print(result.summary())
            out_path = Path("outputs/evaluations")
            out_path.mkdir(parents=True, exist_ok=True)
            eval_path = out_path / f"{persona.name.replace(' ', '_').lower()}_eval.json"
            eval_path.write_text(
                json.dumps(
                    {
                        "persona": persona.name,
                        "difficulty": persona.difficulty,
                        "fact_recall": result.fact_recall,
                        "entity_recall": result.entity_recall,
                        "connection_recall": result.connection_recall,
                        "weighted_score": result.weighted_score,
                        "depth_breakdown": result.depth_breakdown,
                        "matched_facts": result.matched_facts,
                        "missed_facts": result.missed_facts,
                        "cost": result.estimated_cost,
                    },
                    indent=2,
                )
            )
        finally:
            await graph.cleanup()


def _display_results(state: ResearchState, elapsed: float) -> None:
    """Rich-formatted results display — Intelligence Console styling."""
    table = Table(title="Investigation Summary", border_style="#ea580c", title_style="bold #ea580c")
    table.add_column("Metric", style="bold #94a3b8")
    table.add_column("Value", justify="right", style="#e2e8f0")
    table.add_row("Duration", f"{elapsed:.1f}s")
    table.add_row("Iterations", str(state.iteration))
    table.add_row("Searches", str(len(state.search_history)))
    table.add_row("LLM Calls", str(state.total_llm_calls))
    table.add_row("Entities Found", f"[#ea580c]{len(state.entities)}[/#ea580c]")
    table.add_row("Connections", f"[#94a3b8]{len(state.connections)}[/#94a3b8]")
    table.add_row("Risk Flags", f"[#f59e0b]{len(state.risk_flags)}[/#f59e0b]" if state.risk_flags else "0")
    table.add_row("Confidence", f"[#ea580c]{state.overall_confidence:.2f}[/#ea580c]")
    table.add_row("Est. Cost", f"${state.estimated_cost_usd:.4f}")
    console.print(table)

    if state.entities:
        et = Table(title="Top Entities", border_style="#64748b", title_style="#94a3b8")
        et.add_column("Type")
        et.add_column("Name")
        et.add_column("Conf", justify="right")
        for e in sorted(state.entities, key=lambda x: x.confidence, reverse=True)[:15]:
            et.add_row(e.entity_type.value, e.name, f"{e.confidence:.2f}")
        console.print(et)

    if state.risk_flags:
        rt = Table(title="Risk Flags", border_style="#dc2626", title_style="bold #f59e0b")
        rt.add_column("Severity", style="#dc2626")
        rt.add_column("Category", style="#94a3b8")
        rt.add_column("Title", style="#e2e8f0")
        for rf in state.risk_flags:
            rt.add_row(f"[#f59e0b]{rf.severity.value}[/#f59e0b]", rf.category.value, rf.title)
        console.print(rt)

    # Run metadata table
    meta_path = Path("outputs") / f"{state.subject.full_name.replace(' ', '_').lower()}_metadata.json"
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
            mt = Table(title="Run Metadata", border_style="#64748b", title_style="#94a3b8")
            mt.add_column("Field", style="bold")
            mt.add_column("Value", justify="right")
            mt.add_row("Run ID", str(meta.get("run_id", "")))
            mt.add_row("Duration", f"{meta.get('duration_seconds', 0):.1f}s")
            mt.add_row("Phases", ", ".join(meta.get("phases_executed", [])))
            mt.add_row("Sources Failed", str(meta.get("sources_failed", 0)))
            mt.add_row("Errors", str(meta.get("error_count", 0)))
            mt.add_row("Termination", str(meta.get("termination_reason", "")))
            console.print(mt)
        except Exception:
            pass

    if state.final_report:
        preview = state.final_report[:2000] + ("..." if len(state.final_report) > 2000 else "")
        console.print(Panel(preview, title="[#ea580c] Report Preview[/#ea580c]", border_style="#ea580c"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Deep Research Agent")
    sub = parser.add_subparsers(dest="command")

    inv = sub.add_parser("investigate", help="Investigate a person")
    inv.add_argument("name", help="Full name")
    inv.add_argument("--role", help="Current role")
    inv.add_argument("--org", help="Current organization")
    inv.add_argument("--max-iter", type=int, help="Max iterations")
    inv.add_argument("--output", default="outputs", help="Output dir")
    inv.add_argument(
        "--debug",
        action="store_true",
        help="Write per-iteration snapshots and pipeline stage I/O to output_dir/subject/ and output_dir/pipeline_debug/ (step_N_nodename_in.json, step_N_nodename_out.json)",
    )
    inv.add_argument(
        "--live",
        action="store_true",
        help="Show live progress (phase, stats, log, elapsed/cost) during investigation",
    )
    inv.add_argument(
        "--budget",
        type=float,
        default=None,
        help="Cost budget in USD (0 = no limit); uses COST_BUDGET_USD if not set",
    )
    inv.add_argument(
        "--resume",
        type=str,
        default=None,
        metavar="THREAD_ID",
        help="Resume a checkpointed investigation by thread_id",
    )
    inv.add_argument(
        "--redact-pii",
        action="store_true",
        help="Save a PII-redacted version of the report alongside the full report",
    )

    ev = sub.add_parser("evaluate", help="Run evaluation")
    ev.add_argument("--persona", help="Persona name (easy/medium/hard or full name)")
    ev.add_argument("--all", action="store_true", help="All personas")

    args = parser.parse_args()
    if args.command == "investigate":
        asyncio.run(
            run_investigation(
                args.name,
                args.role,
                args.org,
                getattr(args, "max_iter", None),
                getattr(args, "output", "outputs"),
                getattr(args, "budget", None),
                getattr(args, "debug", False),
                getattr(args, "live", False),
                getattr(args, "resume", None),
                getattr(args, "redact_pii", False),
            )
        )
    elif args.command == "evaluate":
        asyncio.run(run_evaluation(args.persona, args.all))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
