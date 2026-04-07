#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "calls.json"

REQUIRED_FIELDS = [
    "id",
    "title",
    "program",
    "scope",
    "status",
    "priority",
    "deadline",
    "last_updated",
    "relevance",
    "domains",
    "summary",
    "reality_check",
    "source_label",
    "source_url",
]

ALLOWED_SCOPE = {"EU", "CZ"}
ALLOWED_STATUS = {"closing_soon", "open", "monitoring"}
ALLOWED_PRIORITY = {"high", "medium", "low"}
ALLOWED_RELEVANCE = {"very_high", "high", "medium"}


def main() -> int:
    try:
        payload = json.loads(DATA_PATH.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        print(f"Validation failed: file not found: {DATA_PATH}")
        return 1
    except json.JSONDecodeError as error:
        print(f"Validation failed: invalid JSON in {DATA_PATH}")
        print(f"Line {error.lineno}, column {error.colno}: {error.msg}")
        return 1

    errors = validate_payload(payload)
    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Validation passed: {len(payload)} records checked in {DATA_PATH}")
    return 0


def validate_payload(payload: object) -> list[str]:
    errors: list[str] = []

    if not isinstance(payload, list):
        return ["Top-level JSON must be a list."]

    seen_ids: set[str] = set()

    for index, item in enumerate(payload, start=1):
        record_label = f"record {index}"

        if not isinstance(item, dict):
            errors.append(f"{record_label}: item must be an object.")
            continue

        missing_fields = [field for field in REQUIRED_FIELDS if field not in item]
        for field in missing_fields:
            errors.append(f"{record_label}: missing required field '{field}'.")

        record_id = item.get("id")
        if not is_non_empty_string(record_id):
            errors.append(f"{record_label}: 'id' must be a non-empty string.")
            record_name = record_label
        else:
            if record_id in seen_ids:
                errors.append(f"{record_label}: duplicate id '{record_id}'.")
            seen_ids.add(record_id)
            record_name = f"record '{record_id}'"

        validate_non_empty_string(item, "title", record_name, errors)
        validate_non_empty_string(item, "program", record_name, errors)
        validate_non_empty_string(item, "summary", record_name, errors)
        validate_non_empty_string(item, "reality_check", record_name, errors)
        validate_non_empty_string(item, "source_label", record_name, errors)

        validate_enum(item, "scope", ALLOWED_SCOPE, record_name, errors)
        validate_enum(item, "status", ALLOWED_STATUS, record_name, errors)
        validate_enum(item, "priority", ALLOWED_PRIORITY, record_name, errors)
        validate_enum(item, "relevance", ALLOWED_RELEVANCE, record_name, errors)

        validate_iso_date(item, "last_updated", record_name, errors, allow_null=False)
        validate_iso_date(item, "deadline", record_name, errors, allow_null=True)
        validate_domains(item.get("domains"), record_name, errors)
        validate_source_url(item.get("source_url"), record_name, errors)

    return errors


def validate_non_empty_string(item: dict, field: str, record_name: str, errors: list[str]) -> None:
    if not is_non_empty_string(item.get(field)):
        errors.append(f"{record_name}: '{field}' must be a non-empty string.")


def validate_enum(item: dict, field: str, allowed: set[str], record_name: str, errors: list[str]) -> None:
    value = item.get(field)
    if value not in allowed:
        allowed_values = ", ".join(sorted(allowed))
        errors.append(f"{record_name}: '{field}' must be one of: {allowed_values}.")


def validate_iso_date(
    item: dict,
    field: str,
    record_name: str,
    errors: list[str],
    *,
    allow_null: bool,
) -> None:
    value = item.get(field)

    if value is None:
        if allow_null:
            return
        errors.append(f"{record_name}: '{field}' must be a YYYY-MM-DD string.")
        return

    if not isinstance(value, str):
        errors.append(f"{record_name}: '{field}' must be a YYYY-MM-DD string.")
        return

    try:
        date.fromisoformat(value)
    except ValueError:
        errors.append(f"{record_name}: '{field}' must use ISO date format YYYY-MM-DD.")


def validate_domains(value: object, record_name: str, errors: list[str]) -> None:
    if not isinstance(value, list) or not value:
        errors.append(f"{record_name}: 'domains' must be a non-empty list of non-empty strings.")
        return

    for domain in value:
        if not is_non_empty_string(domain):
            errors.append(f"{record_name}: 'domains' must contain only non-empty strings.")
            return


def validate_source_url(value: object, record_name: str, errors: list[str]) -> None:
    if not isinstance(value, str) or not value.startswith(("http://", "https://")):
        errors.append(f"{record_name}: 'source_url' must start with http:// or https://.")


def is_non_empty_string(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


if __name__ == "__main__":
    sys.exit(main())
