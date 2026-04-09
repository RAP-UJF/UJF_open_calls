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

STATUS_ORDER = {
    "closing_soon": 0,
    "open_now": 1,
    "open": 2,
    "open_rolling": 3,
    "open_partner_required": 4,
    "open_bilateral_partner_required": 5,
    "open_consortium_gated": 6,
    "open_excellence_gated": 7,
    "monitoring_expected": 8,
    "monitoring_planned": 9,
    "monitoring": 10,
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
    "monitoring_expected": "Monitoring, expected",
    "monitoring_planned": "Monitoring, planned",
    "monitoring": "Monitoring",
}

ACCESS_BARRIER_LABELS = {
    "individual_entry": "Individual entry",
    "excellence_gated": "Excellence-gated",
    "consortium_gated": "Consortium-gated",
    "partner_required": "Partner required",
    "bilateral_partner_required": "Bilateral partner required",
    "institutional_only": "Institutional route",
    "expected_call": "Expected call",
}


@dataclass(frozen=True)
class CallRecord:
    call_id: str
    title: str
    program: str
    scope: str
    status: str
    access_barrier: str | None
    opens_on: str | None
    priority: str | None
    deadline: str | None
    summary: str
    reality_check: str
    action_note: str | None
    relevance: str | None
    domains: tuple[str, ...]
    source_label: str
    source_url: str
    last_updated: str


def main() -> int:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8-sig"))
    records = [parse_call_record(item) for item in payload]
    sorted_records = sorted(records, key=sort_key)

    latest_update = max((record.last_updated for record in sorted_records), default=None)
    summary_markup = "\n".join(render_summary_row(record) for record in sorted_records)
    card_markup = "\n".join(render_card(record) for record in sorted_records)
    jsonld_markup = render_jsonld(sorted_records)

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
        content=f'{len(sorted_records)} call{"s are" if len(sorted_records) != 1 else " is"} listed below. JavaScript enhances filtering and refresh.',
    )
    index_text = replace_block(
        index_text,
        "<!-- STATIC_MACHINE_SUMMARY_START -->",
        "<!-- STATIC_MACHINE_SUMMARY_END -->",
        summary_markup,
    )
    index_text = replace_block(
        index_text,
        "<!-- STATIC_ALL_CALLS_START -->",
        "<!-- STATIC_ALL_CALLS_END -->",
        card_markup,
    )
    index_text = replace_block(
        index_text,
        "<!-- STATIC_JSONLD_START -->",
        "<!-- STATIC_JSONLD_END -->",
        jsonld_markup,
    )
    INDEX_PATH.write_text(index_text, encoding="utf-8")
    print(f"Rendered {len(sorted_records)} calls into {INDEX_PATH}")
    return 0


def parse_call_record(item: dict[str, Any]) -> CallRecord:
    return CallRecord(
        call_id=require_text(item, "id"),
        title=require_text(item, "title"),
        program=require_text(item, "program"),
        scope=require_text(item, "scope"),
        status=require_text(item, "status"),
        access_barrier=optional_text(item.get("access_barrier")),
        opens_on=optional_text(item.get("opens_on")),
        priority=optional_text(item.get("priority")),
        deadline=optional_text(item.get("deadline")),
        summary=require_text(item, "summary"),
        reality_check=require_text(item, "reality_check"),
        action_note=optional_text(item.get("action_note")),
        relevance=optional_text(item.get("relevance")),
        domains=parse_domains(item.get("domains")),
        source_label=require_text(item, "source_label"),
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


def parse_domains(value: Any) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(
        entry.strip()
        for entry in value
        if isinstance(entry, str) and entry.strip()
    )


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
    status_label = STATUS_LABELS.get(record.status, format_label(record.status, "Unknown"))
    status_class = escape_css_class(record.status)
    priority_class = escape_css_class(record.priority or "unknown")
    relevance_class = escape_css_class(record.relevance or "unknown")
    domains_value = ", ".join(record.domains) if record.domains else "General research"
    domains_attr = "|".join(record.domains)
    access_label = format_access_barrier(record.access_barrier)
    return f"""        <article class="call-card" data-call-id="{escape(record.call_id, quote=True)}" data-status="{escape(record.status, quote=True)}" data-scope="{escape(record.scope, quote=True)}" data-priority="{escape(record.priority or 'unknown', quote=True)}" data-relevance="{escape(record.relevance or 'unknown', quote=True)}" data-access-barrier="{escape(record.access_barrier or '', quote=True)}" data-domains="{escape(domains_attr, quote=True)}">
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
          <div class="card-badges">
            <span class="badge badge-priority-{priority_class}">Priority: {escape(format_label(record.priority, "Unknown"))}</span>
            <span class="badge badge-relevance-{relevance_class}">Relevance: {escape(format_label(record.relevance, "Unknown"))}</span>
          </div>
          <dl class="card-facts">
            <div class="fact fact-program">
              <dt class="fact-label">Program</dt>
              <dd class="fact-value">{escape(record.program)}</dd>
            </div>
            <div class="fact fact-scope">
              <dt class="fact-label">Scope</dt>
              <dd class="fact-value">{escape(record.scope)}</dd>
            </div>
            <div class="fact fact-status">
              <dt class="fact-label">Status</dt>
              <dd class="fact-value">{escape(status_label)}</dd>
            </div>
            <div class="fact fact-opens">
              <dt class="fact-label">Opens</dt>
              <dd class="fact-value">{render_time(record.opens_on, "TBD")}</dd>
            </div>
            <div class="fact fact-deadline">
              <dt class="fact-label">Deadline</dt>
              <dd class="fact-value">{render_time(record.deadline, "N/A")}</dd>
            </div>
            <div class="fact fact-relevance">
              <dt class="fact-label">Relevance</dt>
              <dd class="fact-value">{escape(format_label(record.relevance, "Unknown"))}</dd>
            </div>
            <div class="fact fact-priority">
              <dt class="fact-label">Priority</dt>
              <dd class="fact-value">{escape(format_label(record.priority, "Unknown"))}</dd>
            </div>
            <div class="fact fact-access">
              <dt class="fact-label">Access</dt>
              <dd class="fact-value">{escape(access_label)}</dd>
            </div>
            <div class="fact fact-domains">
              <dt class="fact-label">Domains</dt>
              <dd class="fact-value">{escape(domains_value)}</dd>
            </div>
            <div class="fact fact-source-label">
              <dt class="fact-label">Source label</dt>
              <dd class="fact-value">{escape(record.source_label)}</dd>
            </div>
            <div class="fact fact-source-url">
              <dt class="fact-label">Source URL</dt>
              <dd class="fact-value"><a href="{escape(record.source_url, quote=True)}" target="_blank" rel="noreferrer noopener">{escape(record.source_url)}</a></dd>
            </div>
          </dl>
          <div class="card-copy">
            <p class="summary">{escape(record.summary)}</p>
            <p class="insight"><strong>Reality check:</strong> {escape(record.reality_check)}</p>
            {render_action_note(record.action_note)}
          </div>
          <div class="card-tags" aria-label="Domains">
            {render_domains(record.domains)}
          </div>
        </article>"""


def render_summary_row(record: CallRecord) -> str:
    status_label = STATUS_LABELS.get(record.status, format_label(record.status, "Unknown"))
    return f"""              <tr>
                <td>{escape(record.title)}</td>
                <td>{escape(status_label)}</td>
                <td>{render_time(record.opens_on, "TBD")}</td>
                <td>{render_time(record.deadline, "N/A")}</td>
                <td><a href="{escape(record.source_url, quote=True)}" target="_blank" rel="noreferrer noopener">{escape(record.source_label)}</a></td>
              </tr>"""


def render_jsonld(records: list[CallRecord]) -> str:
    payload = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "UJF Open Calls",
        "numberOfItems": len(records),
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": index,
                "item": {
                    "@type": "Thing",
                    "identifier": record.call_id,
                    "name": record.title,
                    "program": record.program,
                    "status": record.status,
                    "opens_on": record.opens_on,
                    "deadline": record.deadline,
                    "domains": list(record.domains),
                    "summary": record.summary,
                    "url": record.source_url,
                },
            }
            for index, record in enumerate(records, start=1)
        ],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2).replace("</", "<\\/")


def render_time(value: str | None, fallback: str) -> str:
    if value is None:
        return escape(fallback)
    return f'<time datetime="{escape(value, quote=True)}">{escape(format_display_date(value))}</time>'


def render_action_note(value: str | None) -> str:
    if value is None:
        return ""
    return f'<p class="action-note"><strong>Action:</strong> {escape(value)}</p>'


def render_domains(domains: tuple[str, ...]) -> str:
    if not domains:
        return '<span class="tag">General research</span>'
    return "".join(f'<span class="tag">{escape(domain)}</span>' for domain in domains)


def format_label(value: str | None, fallback: str) -> str:
    if value is None:
        return fallback
    cleaned = value.strip()
    if not cleaned:
        return fallback
    return cleaned.replace("_", " ")


def format_access_barrier(value: str | None) -> str:
    if value is None:
        return "General access"
    return ACCESS_BARRIER_LABELS.get(value, format_label(value, "General access"))


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
