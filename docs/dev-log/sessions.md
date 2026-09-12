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
python scripts/export_session.py --no-push    # write and commit, leave the push to you
python scripts/export_session.py --no-commit  # write only
```

It locates the private repository in this order:

1. `--output-dir <path>`
2. `$TECHZONE_SESSION_HISTORY`
3. a sibling directory named `Techzone-session-history`

If none of those exists the exporter writes nothing and says so, rather than
creating a fresh directory and starting a second, divergent copy. A path that
resolves inside *this* repository is refused outright — that is the one mistake
the whole arrangement exists to prevent. A `SessionEnd`
hook in [`.claude/settings.json`](../../.claude/settings.json) runs it
automatically; when the history repository is absent the hook stays silent and
the session is unaffected.

## Committing and pushing

The records are committed and pushed by the same run that writes them. A record
that only exists on one laptop is not kept — the transcript it came from expires
in 30 days and the working copy is nobody's backup — so the export is not
finished until the commit is on the remote.

What the exporter does after writing, in that repository:

1. Stages **`sessions/` only**, so anything else in flight there is untouched.
2. Commits it — `Record session <date> — <title>` for one session, or
   `Record N sessions (<span>)` for several. Nothing to stage means no commit.
3. Pushes the current branch, setting an upstream if it has none.

| To do this | Use |
|---|---|
| Write, commit, push | the default, and what the hook runs |
| Write and commit, push by hand | `--no-push`, or `TECHZONE_SESSION_HISTORY_AUTOPUSH=0` |
| Write only | `--no-commit`, or `TECHZONE_SESSION_HISTORY_AUTOCOMMIT=0` |

None of this can fail the export or the session it fired from. A repository that
is not a git repository, a missing credential, or a branch that has moved on
elsewhere is reported on stderr and the run still succeeds — the records are on
disk and the next run commits them. A **rejected push is left to a person**: the
hook will not rebase or merge history nobody has looked at. Pull in
`Techzone-session-history` and push again.

Pushing needs a credential that works without a prompt, since the hook has no
terminal to prompt on — a credential helper with the token already cached, or an
SSH remote with a passphrase-less key. The exporter sets `GIT_TERMINAL_PROMPT=0`
so a missing one fails in a second instead of hanging until the hook times out.

## The rule that matters

Redaction runs automatically on everything the exporter writes — the shapes are
listed in [README.md](README.md#what-must-not-go-in) — but it is pattern-based
and incomplete. **It is not what keeps these records private; the repository's
visibility is.** Treat the masker as a second line, and keep secrets out of
prompts in the first place.
