# Session Records

The prompts and replies of every development session are recorded, but **not in
this repository**. They live in a separate, private repository:

> **`Techzone-session-history`** — https://github.com/thaivanlam/Techzone-session-history

Access is granted per person. Ask the repository owner.

---

## Why they are not here

This repository is public, and a session record is a conversation — the prompts
as they were typed and the replies that answered them. That is worth keeping as
evidence of how the platform was built; it is not worth publishing next to the
code, and redaction by pattern is not a strong enough guarantee to make it so.
Separating the two means privacy rests on repository access rather than on a
regular expression being complete. The reasoning is in
[ADR-0011](../architecture/decisions/0011-session-records-in-a-private-repository.md).

The two layers of the log therefore live in different places:

| Layer | Where | Written by | Answers |
|---|---|---|---|
| Narrative | [`dev-log/YYYY-MM.md`](./) — this repository | By hand, per session | Why the work happened, what was tried, what came of it |
| Evidence | `sessions/` in the private repository | Generated from the transcript | What was asked and what came back, in order, with timestamps |

The narrative layer is the one a reader starts from, and it is public. It
summarises and cites; it does not quote wholesale. A monthly entry links to the
record that backs it, which resolves for anyone with access to the private
repository and is a dead end for anyone without — deliberately.

## What a record contains

A sequence of **exchanges**, each one a prompt and the reply that closed that
turn, plus the session's start time, duration, branch, tool version, the files
it modified and the commits it produced.

Dropped: tool calls, tool output, pasted attachments, subagent traffic, and the
assistant's narration between tool calls.

## Producing them

The exporter lives here, in
[`scripts/export_session.py`](../../scripts/export_session.py); only its output
goes elsewhere. It reads the local Claude Code transcript store, which the CLI
prunes after `cleanupPeriodDays` (30 by default) — the reason the records are
generated and committed at all.

```bash
python scripts/export_session.py              # every session, and rebuild the index
python scripts/export_session.py --session 5ab27b00
python scripts/export_session.py --check      # exit 1 if a record is missing or stale
```

It locates the private repository in this order:

1. `--output-dir <path>`
2. `$TECHZONE_SESSION_HISTORY`
3. a sibling directory named `Techzone-session-history`

If none of those exists the exporter writes nothing and says so, rather than
creating a fresh directory and starting a second, divergent copy. A `SessionEnd`
hook in [`.claude/settings.json`](../../.claude/settings.json) runs it
automatically; when the history repository is absent the hook stays silent and
the session is unaffected.

Committing and pushing the result is a separate step, done in that repository.

## The rule that matters

Redaction runs automatically on everything the exporter writes — the shapes are
listed in [README.md](README.md#what-must-not-go-in) — but it is pattern-based
and incomplete. **It is not what keeps these records private; the repository's
visibility is.** Treat the masker as a second line, and keep secrets out of
prompts in the first place.
