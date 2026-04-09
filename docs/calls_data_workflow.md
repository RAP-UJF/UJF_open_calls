# Calls Data Workflow

## What belongs in `calls.json`

Include:

- publicly shareable funding opportunities
- calls relevant to UJF research areas or realistic collaboration profile
- active calls or calls worth monitoring because an official call is expected soon

Do not include:

- raw notes or incomplete scouting notes
- speculative opportunities without an official source URL
- expired calls that no longer help anyone act
- internal comments, private assessments, or non-public details

## Entry decision rules

Add or keep a record only if all of these are true:

- there is an official source URL
- the call has enough information to set `status`, `relevance`, and `domains`
- the entry is not a duplicate of an existing call

If the same call already exists, update the existing record instead of creating a new one.

## Field guidance

- `id`: stable, unique, slug-like identifier. Do not change it unless the entry was created incorrectly.
- `status`: use `closing_soon` when a published call is approaching deadline and needs immediate attention; use `open` when the call is currently active but not yet urgent; use `monitoring` when the call is not yet open or still too early for action, but should stay visible.
- `priority`: use `high` for calls worth active attention from UJF, `medium` for useful but more selective opportunities, `low` only for clearly lower-fit entries.
- `relevance`: use `very_high` when the fit to UJF profile is direct and strong; use `high` when the fit is good but narrower or more conditional; use `medium` when the call is plausible but less central.
- `deadline`: use `YYYY-MM-DD` when an official deadline is known; otherwise use `null`.
- `last_updated`: set to the date when the record was last checked against the source.
- `summary`: short factual description of what the call funds.
- `reality_check`: short practical note about actual fit, likely effort, or the main constraint.
- `domains`: short topic tags that describe the scientific or application areas; keep them specific and useful for scanning.

## Update workflow

1. Review the official source.
2. Add or update the record in `data/calls.json`.
3. Update `last_updated`.
4. Run `py tools/render_static_fallback.py` to refresh the public HTML fallback with currently active calls.
5. Run `py tools/validate_calls.py`.
6. Commit and push.
7. Let GitHub Actions confirm the same validation on push or pull request.

## Retirement and cleanup

- Update a call when the source changes, the deadline changes, or the practical assessment changes.
- Keep a call as `monitoring` when it is still worth watching and there is a real official source behind it.
- Remove a call when it is expired and no longer useful, duplicated by another record, or no longer relevant to UJF.
