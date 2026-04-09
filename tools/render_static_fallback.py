#!/usr/bin/env python3

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from html import escape
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT_DIR / "data" / "calls.json"
INDEX_PATH = ROOT_DIR / "index.html"

ACTIVE_STATUSES = {
    "closing_soon",
    "open",
    "open_now",
    "open_rolling",
    "open_partner_required",
    "open_bilateral_partner_required",
    "open_consortium_gated",
    "open_excellence_gated",
}

STATUS_ORDER = {
    "closing_soon": 0,
    "open_now": 1,
    "open": 2,
    "open_rolling": 3,
    "open_partner_required": 4,
    "open_bilateral_partner_required": 5,
    "open_consortium_gated": 6,
    "open_excellence_gated": 7,
}

STATUS_LABELS = {
    "closing_soon": "Closing soon",
    "open_now": "Open now",
    "open": "Open",
    "open_rolling": "Open, rolling",
    "open_partner_required": "Open, partner required",
    "open_bilateral_partner_required": "Open, bilateral partner required",
    "open_consortium_gated": "Open, consortium-gated",
    "open_excellence_gated": "Open, excellence-gated",
}


@dataclass(frozen=True)
class CallRecord:
    title: str
    program: str
    scope: str
    status: str
    deadline: str | None
    summary: str
    reality_check: str
    source_url: str
    last_updated: str


def main() -> int:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8-sig"))
    records = [parse_call_record(item) for item in payload if is_active_status(item.get("status"))]
    sorted_records = sorted(records, key=sort_key)

    latest_update = max((record.last_updated for record in sorted_records), default=None)
    card_markup = "\n".join(render_card(record) for record in sorted_records)

    index_text = INDEX_PATH.read_text(encoding="utf-8")
    index_text = replace_tag_content(
        index_text,
        tag_name="strong",
        element_id="hero-last-updated",
        content=format_display_date(latest_update),
    )
    index_text = replace_tag_content(
        index_text,
        tag_name="strong",
        element_id="hero-call-count",
        content=f'{len(sorted_records)} call{"s" if len(sorted_records) != 1 else ""}',
    )
    index_text = replace_tag_content(
        index_text,
        tag_name="p",
        element_id="loading-state",
        content=(
            f'{len(sorted_records)} active call{"s are" if len(sorted_records) != 1 else " is"} listed below. '
            "JavaScript refreshes the full list, including monitored opportunities."
        ),
    )
    index_text = replace_block(
        index_text,
        "<!-- STATIC_ACTIVE_CALLS_START -->",
        "<!-- STATIC_ACTIVE_CALLS_END -->",
        card_markup,
    )
    INDEX_PATH.write_text(index_text, encoding="utf-8")
    print(f"Rendered {len(sorted_records)} active fallback cards into {INDEX_PATH}")
    return 0


def parse_call_record(item: dict[str, Any]) -> CallRecord:
    return CallRecord(
        title=require_text(item, "title"),
        program=require_text(item, "program"),
        scope=require_text(item, "scope"),
        status=require_text(item, "status"),
        deadline=optional_text(item.get("deadline")),
        summary=require_text(item, "summary"),
        reality_check=require_text(item, "reality_check"),
        source_url=require_text(item, "source_url"),
        last_updated=require_text(item, "last_updated"),
    )


def require_text(item: dict[str, Any], field: str) -> str:
    value = item.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Missing required text field: {field}")
    return value.strip()


def optional_text(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()


def is_active_status(value: Any) -> bool:
    return isinstance(value, str) and value in ACTIVE_STATUSES


def sort_key(record: CallRecord) -> tuple[int, int]:
    return (
        STATUS_ORDER.get(record.status, 999),
        deadline_rank(record.deadline),
    )


def deadline_rank(deadline_value: str | None) -> int:
    if deadline_value is None:
        return 2**31 - 1
    return date.fromisoformat(deadline_value).toordinal()


def format_display_date(value: str | None) -> str:
    if value is None:
        return "Unknown"
    parsed = date.fromisoformat(value)
    return parsed.strftime("%d %b %Y")


def render_card(record: CallRecord) -> str:
    deadline_line = (
        f"Deadline {format_display_date(record.deadline)}. "
        if record.deadline is not None
        else "No fixed deadline published. "
    )
    status_label = STATUS_LABELS[record.status]
    status_class = escape_css_class(record.status)
    return f"""        <article class="call-card">
          <div class="card-top">
            <div class="card-heading">
              <h3>
                <a class="call-title-link" href="{escape(record.source_url, quote=True)}" target="_blank" rel="noreferrer noopener">{escape(record.title)}</a>
              </h3>
              <div class="program-line">{escape(record.program)}</div>
            </div>
            <div class="card-side">
              <span class="badge badge-neutral">{escape(record.scope)}</span>
              <span class="badge badge-status-{status_class}">{escape(status_label)}</span>
            </div>
          </div>
          <div class="card-copy">
            <p class="summary">{escape(deadline_line + record.summary)}</p>
            <p class="insight"><strong>Reality check:</strong> {escape(record.reality_check)}</p>
          </div>
        </article>"""


def escape_css_class(value: str) -> str:
    return "".join(character for character in value.lower() if character.isalnum() or character in {"-", "_"})


def replace_block(text: str, start_marker: str, end_marker: str, replacement_body: str) -> str:
    start_index = text.find(start_marker)
    end_index = text.find(end_marker)
    if start_index == -1 or end_index == -1 or end_index < start_index:
        raise ValueError("Static fallback markers were not found in index.html")

    block_start = start_index + len(start_marker)
    return f"{text[:block_start]}\n{replacement_body}\n{text[end_index:]}"


def replace_tag_content(text: str, *, tag_name: str, element_id: str, content: str) -> str:
    pattern = re.compile(
        rf'(<{tag_name}\b[^>]*\bid="{re.escape(element_id)}"[^>]*>)(.*?)(</{tag_name}>)',
        flags=re.DOTALL,
    )
    updated_text, replacements = pattern.subn(
        lambda match: f"{match.group(1)}{content}{match.group(3)}",
        text,
        count=1,
    )
    if replacements != 1:
        raise ValueError(f"Could not replace content for #{element_id}")
    return updated_text


if __name__ == "__main__":
    raise SystemExit(main())
