"""
Capture structlog events as plain-text lines for persistence (e.g. state.logs).

When an investigation runs, the sink is set to a list; every structlog event
is appended as a one-line string matching the terminal format. The list is
then merged into state.logs so the frontend Log tab shows the full run.
"""

from __future__ import annotations

import contextvars
from typing import Any

_SKIP_KEYS = frozenset({"event", "level", "_record"})

# Phase banners (match main.py _PHASE_CONFIG labels for Log tab)
_PHASE_BANNERS: dict[str, str] = {
    "baseline": "🔍  BASELINE  PHASE",
    "breadth": "🌐  BREADTH  PHASE",
    "depth": "🔬  DEPTH  PHASE",
    "adversarial": "⚔️   ADVERSARIAL  PHASE",
    "triangulation": "🔺  TRIANGULATION  PHASE",
    "synthesis": "📋  SYNTHESIS  PHASE",
}

_last_phase: list[str] = [""]  # mutable so processor can update

_execution_log_sink: contextvars.ContextVar[list[str] | None] = contextvars.ContextVar(
    "execution_log_sink", default=None
)


def set_sink(sink: list[str] | None) -> None:
    """Set the list to append log lines to (or None to stop capturing)."""
    _last_phase[0] = ""
    _execution_log_sink.set(sink)


def get_sink() -> list[str]:
    """Return the current sink list (or empty list if not set). Clears the token; use once per run."""
    try:
        sink = _execution_log_sink.get()
    except LookupError:
        return []
    return list(sink) if sink is not None else []


def _format_value(v: Any, max_len: int = 120) -> str:
    s = str(v)
    return s if len(s) <= max_len else s[: max_len - 3] + "…"


def execution_log_processor(logger: object, method: str, event_dict: dict) -> dict:
    """
    Structlog processor: append a plain-text log line to the execution log sink
    when set (e.g. during an investigation). Does not drop the event.
    """
    sink = None
    try:
        sink = _execution_log_sink.get()
    except LookupError:
        pass
    if sink is None:
        return event_dict

    # Phase transition banner (match terminal)
    phase_raw = event_dict.get("phase", "") or ""
    phase_val = phase_raw.get("value", "") if isinstance(phase_raw, dict) else str(phase_raw)
    phase_val = phase_val.lower().strip() if phase_val else ""
    if phase_val and phase_val in _PHASE_BANNERS and phase_val != _last_phase[0]:
        _last_phase[0] = phase_val
        sink.append("")
        sink.append("━━━━━━━━━━━━━━━━━━━━━━ " + _PHASE_BANNERS[phase_val] + " ━━━━━━━━━━━━━━━━━━━━━━")

    level = (event_dict.get("level") or "info").lower()
    if level == "warning":
        prefix = "⚠"
    elif level in ("error", "critical"):
        prefix = "✗"
    elif level == "debug":
        prefix = "·"
    else:
        prefix = "▪"

    event = event_dict.get("event", "")
    parts = []
    for k, v in sorted(event_dict.items()):
        if k in _SKIP_KEYS:
            continue
        parts.append(f"{k}={_format_value(v)}")
    kv_str = "  ".join(parts)
    line = f"  {prefix} {event}  {kv_str}".strip()
    sink.append(line)
    return event_dict
