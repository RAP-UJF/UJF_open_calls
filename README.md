# UJF Open Calls

Minimal static site for publishing research funding calls relevant for UJF. The site uses plain HTML, CSS, vanilla JavaScript, and one JSON data file.

## How to update calls

Edit `data/calls.json`.

For each call, keep the existing schema and update the content directly in the JSON file, including:

- `id` as a stable unique identifier
- `last_updated` as the date of the latest content check
- call details such as title, status, deadline, summary, and source link

Run the validator after editing `data/calls.json`:

```bash
python tools/validate_calls.py
```

The same validator also runs automatically in GitHub Actions on push and pull request.

See `docs/calls_data_workflow.md` for the editorial maintenance workflow.

After committing changes, GitHub Pages serves the repository directly. There is no build step.
