# ADR-0011: Record every development session, in a separate private repository

- **Status:** Accepted
- **Date:** 2026-09-12
- **Affects:** `scripts/`, `docs/dev-log/`, the documentation workflow, the `Techzone-session-history` repository

## Context

Most of this platform was built in sessions with an AI coding assistant. The
assistant's CLI already writes a complete transcript of every session — one
JSONL file per session under the user's home directory — but that store cannot
serve as a project record:

1. **It is not in any repository.** It lives outside the working tree, on one
   machine, and is not backed up with the code.
2. **It expires.** The CLI prunes transcripts after `cleanupPeriodDays`, 30 by
   default. When this was written, the oldest session for this project was three
   weeks old and the store held 24 sessions and 38 MB.
3. **It is unreadable at scale.** Almost all of that bulk is tool output — file
   contents echoed back, build logs, thousands of lines of JMeter results.

The monthly dev log answers "why did this change happen". It does not answer
"what was actually asked, and what came back" — the question a thesis committee
asks about AI-assisted work, and the one that makes a defect's origin traceable
months later. Writing that by hand for every session is the kind of task that is
done for two weeks and then quietly dropped.

Two things complicate simply committing the distilled result here.

**A transcript carries whatever was pasted into it.** Over this project's
history that included database passwords and API keys — development ones so
far. `docs/dev-log/README.md` already forbids committing exactly those shapes,
but it forbids it to a human author who remembers the rule, and a generated file
has no such author.

**This repository is public.** A session record is a conversation, quoted whole.
Mechanical redaction reduces the risk but cannot bound it: masking works from a
pattern list, and a pattern list is only ever right about the inputs it has
already seen.

## Decision

Every session is distilled from its transcript into one markdown record, and
those records are committed to a **separate, private repository**,
`Techzone-session-history`. This repository keeps a pointer to it and none of
its contents: [`docs/dev-log/sessions.md`](../../dev-log/sessions.md).

[`scripts/export_session.py`](../../../scripts/export_session.py) produces them
and stays here, because it is this project's tooling; only its output goes
elsewhere. It resolves the destination from `--output-dir`, then
`$TECHZONE_SESSION_HISTORY`, then a sibling directory — and writes nothing if
none exists, rather than silently starting a second copy. A `SessionEnd` hook
runs it when a session ends.

A record is a sequence of **exchanges**: each the operator's prompt and the
assistant's last text block before the next prompt — the reply actually read and
acted on. Narration between tool calls is dropped, as are tool calls, tool
output, pasted attachments, subagent traffic and system reminders. Measured over
the 24 sessions: 80 prompts and 146 KB of assistant prose, of which the closing
replies are 98 KB. The records total 232 KB against 38 MB of transcripts.

Three rules bind the output:

- **Privacy rests on repository access, not on redaction.** Masking still runs
  on everything written — vendor key formats, JWTs, credentials in connection
  strings, `KEY=value` pairs whose key names a secret, public IPv4 addresses —
  but it is a second line, not the guarantee.
- **Quotations are verbatim, in their original language.** This repository's
  documentation is otherwise English-only. Translating evidence destroys it, so
  the structure is English and the quotations are not.
- **Provenance is attributed, not guessed.** A commit SHA is recorded only when
  it came back from a shell call that actually ran `git commit`, never from text
  that merely looks like commit output.

## Consequences

**Positive.** The records survive transcript expiry and machine loss. They are
small enough to diff and grep. Generation is mechanical, so the practice does
not decay when the project gets busy. A record names the commits its session
produced, so code and conversation are traceable in both directions. And the
public repository stays a repository of code and documentation, which is what a
reader of it expects.

**Negative.** Two repositories must be kept in step, and the pointer resolves to
nothing for a reader without access — by design, but still a dead end. The split
also means the evidence for a public claim may be unavailable to the person
reading the claim; the narrative layer therefore has to stand on its own rather
than lean on a link.

The distillation is lossy: the assistant's reasoning and the tool output it saw
are gone, so a record shows the closing claim without what would substantiate
it. A reply that was wrong is preserved as confidently as one that was right,
and should be read as a statement made at the time, not a verified fact.

Redaction remains incomplete, and has already been wrong twice in this
repository's short history — a truncated Stripe key sat one character under the
length threshold, and a JSON-quoted key name never matched the `KEY=value` rule
at all, which is the shape of `launch.json` and the Compose files. Both were
found only when replies were captured as well as prompts. That is the argument
for the private repository rather than against the masker: a pattern list gets
better, but never becomes a guarantee.

**If this is revisited.** To make the records public, the redaction list would
have to become something it currently is not — allowlist-based rather than
denylist-based, or reviewed by a person before each commit. To stop keeping them
at all, delete the exporter and the hook; the transcripts then expire on their
own after 30 days and the dev log's narrative layer is all that remains.

## References

- Source: [`scripts/export_session.py`](../../../scripts/export_session.py)
- Pointer and procedure: [`docs/dev-log/sessions.md`](../../dev-log/sessions.md)
- Redaction rules: [`docs/dev-log/README.md`](../../dev-log/README.md)
