# Development Log

A running record of *how* the platform was built, kept alongside the record of
*what* it is. The rest of `docs/` describes the system as it stands today; this
folder describes the sequence of decisions, dead ends, and fixes that produced
it.

One file per month, named `YYYY-MM.md`. Entries within a file run
**newest first**, so the most recent work is at the top.

The log has two layers:

| Layer | Where | Written by | Answers |
|---|---|---|---|
| Narrative | `YYYY-MM.md` (this folder) | By hand, per session | Why the work happened, what was tried, what came of it |
| Evidence | a **private** repository — see [sessions.md](sessions.md) | Generated from the session transcript | What was asked and what came back, in order, with timestamps |

The narrative layer is the one a reader starts from. The evidence layer exists
so a claim in it can be checked, and so a question like "where did this defect
first come up?" has an answer that is not a memory.

---

## Why this exists

| Reader | What they get from it |
|---|---|
| The author, three weeks later | Why a config value is the way it is, without re-deriving it |
| A thesis committee | Evidence of an incremental build with real timestamps and commit SHAs |
| A future maintainer | The reasoning behind changes that the diff alone does not explain |

The other documents in `docs/` answer "how does this work?". This one answers
"why did it end up like this, and what was tried first?".

---

## Entry format

Each entry is one work session. Keep it short — a session that produced one
commit needs four lines, not four paragraphs.

```markdown
## 2026-08-24 — Short title in the imperative or past tense

**Commits:** `30ea5f6` (superproject), `3b25e16` (backend)

**Context.** What prompted the work — a bug report, a missing feature, a
question that came up while doing something else.

**Changes.**
- `path/to/file.ext` — what changed and why
- `path/to/other.ext` — what changed and why

**Notes.** Anything that would not be obvious from the diff: an approach that
was tried and abandoned, a surprising root cause, a follow-up left open.
```

`Context` and `Changes` are required. `Notes` is optional — omit the heading
rather than writing "none".

---

## Session records

The prompts and replies of each session are recorded, but not in this
repository — they live in the private `Techzone-session-history` repository.
What they contain, how they are generated, and how to reach them is in
[sessions.md](sessions.md). The reasoning is in
[ADR-0011](../architecture/decisions/0011-session-records-in-a-private-repository.md).

This folder keeps the narrative layer: the monthly entries, written by hand.
They are public, so they **summarise and cite** the records rather than quoting
them wholesale, and an entry has to make sense to a reader who cannot open the
record it links to.

---

## What must not go in

This folder is committed and pushed, so every entry is public and permanent.
Three categories to strip before committing:

1. **Secret values.** Name the variable, never its value. Write
   ``the stack needs `STRIPE_SECRET_KEY` and `MAIL_PASSWORD` set`` — never the
   key itself, not even truncated, not even "just as an example". The same rule
   covers database passwords, JWT secrets, and connection strings.
2. **Deployment specifics of a live host.** Write "the OCI ARM instance", not
   its public IP, hostname, or the ports it currently exposes. A deployment
   guide with real addresses belongs in a file that is not committed.
3. **Anything you would not read aloud in an interview.** Frustration with a
   library, a framework, or another person's code reads very differently on a
   public repository than it did at 2 a.m.

These rules bind this folder, which is public. They also bind
`scripts/export_session.py`, which enforces the first two mechanically on
everything it writes into the private history repository: vendor key formats
(Stripe, AWS, Google, GitHub, Slack), JSON Web Tokens, credentials inside
connection strings, any `KEY=value` whose key name contains SECRET / PASSWORD /
TOKEN / API_KEY / CREDENTIAL, and public IPv4 addresses. It is deliberately
over-eager and it is not exhaustive — a secret in a shape it does not recognise
passes straight through. What keeps those records private is the repository's
visibility, not the masker.

Redaction is cheaper before the commit than after: rewriting published git
history is possible but the value is already scraped and mirrored by then. If a
secret does reach a commit, **rotate it** — do not rely on a force-push.

---

## Related documents

| Record | Where | Cadence |
|---|---|---|
| How the work happened | `docs/dev-log/YYYY-MM.md` (this folder) | Per work session |
| What was asked and answered, verbatim | `Techzone-session-history` (private) | Per work session, generated |
| Why the architecture is what it is | [../architecture/design-decisions.md](../architecture/design-decisions.md) | When a platform choice is made or revised |
| What changed for a consumer of the release | [../../CHANGELOG.md](../../CHANGELOG.md) | When a version is cut |
