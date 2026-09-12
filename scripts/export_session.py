#!/usr/bin/env python3
"""Export Claude Code session transcripts into committable dev-log records.

The Claude Code CLI writes one JSONL transcript per session under
``~/.claude/projects/<slug>/``. Those files are local, unversioned, and pruned
after ``cleanupPeriodDays`` (30 by default). This script distils each one into a
markdown record small enough to commit.

Records are written to a **separate, private repository**, never into this one.
This repository is public and the records quote whole conversations; the pointer
page is ``docs/dev-log/sessions.md``. The location is resolved by
:func:`resolve_output_dir`.

What is kept: each exchange — the operator's prompt and the reply that closed
that turn — verbatim and in order, plus the session's metadata, the files it
modified and the commits it produced.

What is dropped: tool calls, tool output, pasted attachments, subagent traffic,
system reminders, and the assistant's narration *between* tool calls. That
narration is progress, not outcome; the closing reply is what the operator read
and acted on. Those omissions are what makes a raw transcript tens of megabytes.

Every emitted string passes through :func:`redact` first. See the REDACTIONS
table below and ``docs/dev-log/README.md`` for the rules.

Usage::

    python scripts/export_session.py                  # every session, rebuild index
    python scripts/export_session.py --session 5ab27b00
    python scripts/export_session.py --since 2026-09-01
    python scripts/export_session.py --from-hook      # reads hook JSON on stdin
    python scripts/export_session.py --check          # exit 1 if output is stale
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MAX_PROMPT_CHARS = 4000
DEFAULT_MAX_RESPONSE_CHARS = 8000

# Records are written to a separate, private repository — never into this one.
# See docs/dev-log/sessions.md.
HISTORY_REPO_ENV = "TECHZONE_SESSION_HISTORY"
HISTORY_REPO_DEFAULT = "Techzone-session-history"


def resolve_output_dir(override: str | None = None) -> Path:
    """Locate the ``sessions/`` folder of the private history repository.

    Order: an explicit ``--output-dir``, then ``$TECHZONE_SESSION_HISTORY``,
    then a sibling of this repository. The folder is never created here — if it
    is missing, the history repository has not been cloned, and writing records
    into a fresh directory would quietly start a second, divergent copy.
    """
    if override:
        root = Path(override).expanduser()
    elif os.environ.get(HISTORY_REPO_ENV):
        root = Path(os.environ[HISTORY_REPO_ENV]).expanduser()
    else:
        root = REPO_ROOT.parent / HISTORY_REPO_DEFAULT
    return root.resolve() / "sessions"

# --------------------------------------------------------------------------
# Redaction
# --------------------------------------------------------------------------

MASK = "[REDACTED]"

# Applied in order. The KEY=value rule runs first: once a vendor rule has
# replaced a value with the mask, the key rule would re-match the mask itself
# and clip its closing bracket.
REDACTIONS: list[tuple[re.Pattern[str], str]] = [
    # KEY=value / KEY: value, where the key name says the value is a secret.
    (
        re.compile(
            r"(?i)\b([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|APIKEY|API_KEY|"
            r"PRIVATE_KEY|CREDENTIAL|ACCESS_KEY)[A-Z0-9_]*)"
            r"([\"']?\s*[=:]\s*)"  # a JSON key carries its closing quote first
            r"(\"[^\"\n]*\"|'[^'\n]*'|[^\s,;)}\]]+)"
        ),
        r"\1\2" + MASK,
    ),
    # Vendor key formats, matched on their own distinctive prefixes. The key
    # threshold is low on purpose: a truncated key ("sk_test_51SXfeX…") still
    # leaks the account it belongs to, and the dev-log rule forbids a shortened
    # key as firmly as a whole one.
    (re.compile(r"\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{4,}"), MASK),
    (re.compile(r"\bwhsec_[A-Za-z0-9]{8,}"), MASK),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), MASK),
    (re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b"), MASK),
    (re.compile(r"\bghp_[A-Za-z0-9]{20,}"), MASK),
    (re.compile(r"\bxox[baprs]-[A-Za-z0-9\-]{10,}"), MASK),
    # JSON Web Tokens, in headers, cookies or log lines.
    (re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}"), MASK),
    (re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._\-+/=]{12,}"), r"\1 " + MASK),
    # Credentials embedded in a connection string: scheme://user:pass@host.
    # The password half is greedy so that a password containing '@' is masked
    # whole, backtracking to the last '@' before the host.
    (re.compile(r"(?i)\b([a-z][a-z0-9+.\-]*://)[^\s:/@]+:[^\s/]+@"), r"\1" + MASK + "@"),
    # mysql -p<password>, with no space, as the client wants it. A value that is
    # only digits and colons is a port mapping (docker run -p8080:8080), not a
    # password.
    (
        re.compile(r"(?<![\w-])(-p)(?![\s=-])((?![\d:]+(?:\s|$))[^\s\"']{3,})"),
        r"\1" + MASK,
    ),
]

# Private and loopback ranges, which say nothing about a live host.
_PRIVATE_IP = re.compile(
    r"^(?:10\.|127\.|0\.|255\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)"
)
# A dotted quad that is not glued to further digits or dots, which would make it
# part of a longer numeric run rather than an address.
_IPV4 = re.compile(r"(?<![\w.])((?:\d{1,3}\.){3}\d{1,3})(?![\w.])")
# A four-part version number reads as a dotted quad. These cues precede one far
# more often than they precede a host address.
_VERSION_CUE = re.compile(
    r"(?i)(?:^|[\s(\[@/\\-])(?:v|ver|version|release|boot|spring|java|jdk|jre|node|npm|"
    r"python|mysql|docker|tag|image)[\s:=_-]*$"
)


def _redact_ipv4(text: str) -> str:
    def repl(m: re.Match[str]) -> str:
        ip = m.group(1)
        if any(int(o) > 255 for o in ip.split(".")):
            return ip
        if _PRIVATE_IP.match(ip):
            return ip
        if _VERSION_CUE.search(text[max(0, m.start() - 16):m.start()]):
            return ip
        return "[REDACTED-HOST]"

    return _IPV4.sub(repl, text)


def redact(text: str) -> str:
    """Mask secrets and live-host addresses in one string.

    Deliberately over-eager: a masked version number costs a reader nothing, a
    published database password costs a rotation.
    """
    for pattern, replacement in REDACTIONS:
        text = pattern.sub(replacement, text)
    return _redact_ipv4(text)


# --------------------------------------------------------------------------
# Transcript discovery
# --------------------------------------------------------------------------


def _read_records(path: Path, limit: int | None = None):
    with path.open(encoding="utf-8", errors="replace") as handle:
        for index, line in enumerate(handle):
            if limit is not None and index >= limit:
                return
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def _same_path(a: str, b: str) -> bool:
    norm = lambda s: s.lower().replace("/", "\\").rstrip("\\")
    return norm(a) == norm(b)


def find_transcript_dir(repo_root: Path, override: str | None = None) -> Path:
    """Locate the ``~/.claude/projects`` folder holding this repo's transcripts.

    The folder name is a slug of the working directory, but the slugging rules
    are not a public contract, so the folder is identified by the ``cwd`` its
    records carry instead.
    """
    if override:
        return Path(override).expanduser().resolve()

    projects = Path.home() / ".claude" / "projects"
    if not projects.is_dir():
        raise SystemExit(f"no transcript store at {projects}")

    for candidate in sorted(projects.iterdir()):
        if not candidate.is_dir():
            continue
        for transcript in candidate.glob("*.jsonl"):
            for record in _read_records(transcript, limit=200):
                cwd = record.get("cwd")
                if cwd and _same_path(cwd, str(repo_root)):
                    return candidate
            break  # one transcript is enough to identify the folder
    raise SystemExit(f"no transcript folder under {projects} has cwd {repo_root}")


# --------------------------------------------------------------------------
# Prompt text extraction
# --------------------------------------------------------------------------

_IDE_SELECTION = re.compile(
    r"<ide_selection>The user selected the lines (\d+) to (\d+) from ([^:]+:[^:]*):.*?</ide_selection>",
    re.DOTALL,
)
_TAG_BLOCKS = [
    re.compile(r"<system-reminder>.*?</system-reminder>", re.DOTALL),
    re.compile(r"<local-command-stdout>.*?</local-command-stdout>", re.DOTALL),
    re.compile(r"<command-message>.*?</command-message>", re.DOTALL),
    re.compile(r"<command-args>.*?</command-args>", re.DOTALL),
    re.compile(r"<ide_selection>.*?</ide_selection>", re.DOTALL),
    re.compile(r"<local-command-caveat>.*?</local-command-caveat>", re.DOTALL),
]
# The captured name already carries its leading slash.
_COMMAND_NAME = re.compile(r"<command-name>/?([^<]*)</command-name>")
_CAVEAT = re.compile(
    r"^\s*Caveat: The messages below were generated by the user.*?$", re.MULTILINE
)


def _flatten(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts)
    return ""


def clean_prompt(raw: str, repo_root: Path) -> str:
    """Strip harness scaffolding, leaving what the operator actually typed."""
    text = raw

    def selection(m: re.Match[str]) -> str:
        raw_path = m.group(3).strip()
        rel = _rel(raw_path, repo_root) or Path(raw_path.replace("\\", "/")).name
        return f"_[editor selection: {rel}:{m.group(1)}-{m.group(2)}]_\n"

    text = _IDE_SELECTION.sub(selection, text)
    text = _COMMAND_NAME.sub(r"/\1", text)
    for pattern in _TAG_BLOCKS:
        text = pattern.sub("", text)
    text = _CAVEAT.sub("", text)
    return text.strip()


def is_prompt(record: dict) -> bool:
    """True for a message the operator typed, not a tool result or subagent turn."""
    return (
        record.get("type") == "user"
        and "toolUseResult" not in record
        and not record.get("isSidechain")
        and isinstance(record.get("message"), dict)
    )


# --------------------------------------------------------------------------
# Session model
# --------------------------------------------------------------------------

_COMMIT = re.compile(r"\[([\w./\-]+)(?: \(root-commit\))? ([0-9a-f]{7,40})\]")
_EDIT_TOOLS = {"Edit", "Write", "NotebookEdit", "MultiEdit"}
_SHELL_TOOLS = {"Bash", "PowerShell"}
# `git commit` in command position — not the same string quoted as an argument,
# as in a grep over these transcripts.
_GIT_COMMIT_CALL = re.compile(
    r"(?:^|[\n;&|(]|&&|\|\|)\s*(?:sudo\s+)?git\s+"
    r"(?:(?:-C|--git-dir|--work-tree)[=\s]+\S+\s+|-\S+\s+)*"  # git -C backend commit …
    r"commit\b"
)


def _resolvable_commits(shas: list[str]) -> set[str]:
    """Of these SHAs, the ones still reachable from a ref here or in a submodule.

    git reports a SHA when a commit is made, but that commit may later be
    rewritten away — as happens when unpushed history is reshaped. Reachability
    is the test, not existence: a rewritten commit survives in the object
    database until it is garbage-collected, so ``cat-file`` would still find it
    and the record would cite a commit nobody can reach. When git cannot be run
    at all, nothing is dropped — an unverifiable claim beats a silently emptied
    list.
    """
    if not shas:
        return set()
    roots = [REPO_ROOT] + [
        REPO_ROOT / name
        for name in ("backend", "frontend")
        if (REPO_ROOT / name / ".git").exists()
    ]
    reachable: list[str] = []
    for root in roots:
        try:
            result = subprocess.run(
                ["git", "rev-list", "--all"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=60,
            )
        except (OSError, subprocess.SubprocessError):
            return set(shas)
        if result.returncode == 0:
            reachable.extend(result.stdout.split())
    if not reachable:
        return set(shas)
    return {sha for sha in shas if any(full.startswith(sha) for full in reachable)}


def _answers_commit_call(record: dict, commit_calls: set[str]) -> bool:
    """True if this tool result came back from a shell call that ran git commit."""
    content = record.get("message", {}).get("content")
    if not isinstance(content, list):
        return False
    return any(
        isinstance(block, dict)
        and block.get("type") == "tool_result"
        and block.get("tool_use_id") in commit_calls
        for block in content
    )


class Exchange:
    """One turn: what was asked, and the reply that closed it.

    The reply is the assistant's last text block before the next prompt — the
    answer the operator actually read. Narration between tool calls ("now
    checking X") is not kept; it is progress, not outcome.
    """

    def __init__(self, ts: str, prompt: str):
        self.ts = ts
        self.prompt = prompt
        self.response = ""
        self.response_ts = ""


class Session:
    def __init__(self, session_id: str):
        self.id = session_id
        self.title = ""
        self.branch = ""
        self.version = ""
        self.exchanges: list[Exchange] = []
        self.files: set[str] = set()
        self.commits: list[str] = []
        self.first_ts = ""
        self.last_ts = ""

    @property
    def answered(self) -> int:
        return sum(1 for e in self.exchanges if e.response)

    @property
    def short_id(self) -> str:
        return self.id.split("-")[0]

    def note_time(self, ts: str | None) -> None:
        if not ts:
            return
        if not self.first_ts or ts < self.first_ts:
            self.first_ts = ts
        if ts > self.last_ts:
            self.last_ts = ts


def _rel(path: str, repo_root: Path) -> str | None:
    """Repo-relative POSIX path, or None if the path is outside the repo."""
    if not path:
        return None
    candidate = Path(path.replace("\\", os.sep))
    if not candidate.is_absolute():
        return candidate.as_posix()
    try:
        return candidate.resolve().relative_to(repo_root).as_posix()
    except (ValueError, OSError):
        return None


def _clip(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n… [truncated, {len(text) - limit} more characters]"


def _assistant_text(record: dict) -> str:
    """The visible prose of one assistant message, without its tool calls."""
    blocks = record.get("message", {}).get("content", []) or []
    return "\n".join(
        b.get("text", "")
        for b in blocks
        if isinstance(b, dict) and b.get("type") == "text"
    ).strip()


def parse_session(
    path: Path, repo_root: Path, max_chars: int, max_response_chars: int
) -> Session | None:
    session = Session(path.stem)
    commit_calls: set[str] = set()
    reply, reply_ts = "", ""  # last assistant prose seen in the current turn

    def close_turn() -> None:
        """Attach the turn's closing reply to the exchange it answered."""
        nonlocal reply, reply_ts
        if session.exchanges and reply:
            session.exchanges[-1].response = _clip(redact(reply), max_response_chars)
            session.exchanges[-1].response_ts = reply_ts
        reply, reply_ts = "", ""

    for record in _read_records(path):
        kind = record.get("type")
        session.note_time(record.get("timestamp"))

        if kind == "ai-title" and record.get("aiTitle"):
            session.title = record["aiTitle"]

        elif kind == "file-history-delta":
            rel = _rel(record.get("trackingPath", ""), repo_root)
            if rel:
                session.files.add(rel)

        elif kind == "assistant":
            session.branch = record.get("gitBranch") or session.branch
            session.version = record.get("version") or session.version
            if not record.get("isSidechain"):
                text = _assistant_text(record)
                if text:
                    reply, reply_ts = text, record.get("timestamp", "")
            for block in record.get("message", {}).get("content", []) or []:
                if not isinstance(block, dict) or block.get("type") != "tool_use":
                    continue
                name, tool_input = block.get("name"), block.get("input", {}) or {}
                if name in _EDIT_TOOLS:
                    rel = _rel(str(tool_input.get("file_path", "")), repo_root)
                    if rel:
                        session.files.add(rel)
                elif name in _SHELL_TOOLS and _GIT_COMMIT_CALL.search(
                    str(tool_input.get("command", ""))
                ):
                    commit_calls.add(block.get("id"))

        elif kind == "user":
            session.branch = record.get("gitBranch") or session.branch
            result = record.get("toolUseResult")
            if result is not None:
                # Only the output of a git commit reports a new SHA. Anything
                # else that happens to print "[branch 1234567]" — a grep over
                # these very transcripts, for instance — is not this session's
                # work.
                if _answers_commit_call(record, commit_calls):
                    blob = result if isinstance(result, str) else json.dumps(result)
                    for match in _COMMIT.finditer(blob):
                        sha = match.group(2)[:7]
                        if sha not in session.commits:
                            session.commits.append(sha)
                continue
            if not is_prompt(record):
                continue
            text = clean_prompt(_flatten(record["message"].get("content")), repo_root)
            if not text:
                continue
            close_turn()
            session.exchanges.append(
                Exchange(record.get("timestamp", ""), _clip(redact(text), max_chars))
            )

    close_turn()
    keep = _resolvable_commits(session.commits)
    session.commits = [sha for sha in session.commits if sha in keep]
    return session if session.exchanges else None


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------


def _parse_ts(ts: str) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _duration(start: datetime | None, end: datetime | None) -> str:
    """Wall-clock span from first to last record.

    A session that was resumed on a later day spans the gap, so this is elapsed
    time, not time spent working.
    """
    if not start or not end:
        return "unknown"
    minutes = int((end - start).total_seconds() // 60)
    if minutes < 60:
        return f"{minutes}m"
    hours, minutes = divmod(minutes, 60)
    if hours < 24:
        return f"{hours}h {minutes:02d}m"
    return f"{hours // 24}d {hours % 24}h"


def _fence(text: str) -> str:
    longest = max((len(m) for m in re.findall(r"`+", text)), default=0)
    return "`" * max(3, longest + 1)


def session_date(session: Session) -> str:
    start = _parse_ts(session.first_ts)
    return start.strftime("%Y-%m-%d") if start else "0000-00-00"


def filename(session: Session) -> str:
    return f"{session_date(session)}-{session.short_id}.md"


def render(session: Session) -> str:
    start, end = _parse_ts(session.first_ts), _parse_ts(session.last_ts)
    title = redact(session.title or "Untitled session")

    # A resumed session can span days, which makes a bare clock time ambiguous —
    # prompt 3 can read as earlier than prompt 2. Carry the date in that case.
    multi_day = bool(start and end and start.date() != end.date())
    stamp_format = "%Y-%m-%d %H:%M" if multi_day else "%H:%M"

    out = [f"# Session {session_date(session)} — {title}", ""]
    out += [
        f"- **Session:** `{session.short_id}`",
        f"- **Started:** {start.strftime('%Y-%m-%d %H:%M UTC') if start else 'unknown'}"
        f" · **{'Spans' if multi_day else 'Duration'}:** {_duration(start, end)}",
        f"- **Branch:** `{session.branch or 'unknown'}`"
        f" · **Claude Code:** `{session.version or 'unknown'}`",
        f"- **Exchanges:** {len(session.exchanges)}"
        f" ({session.answered} with a recorded reply)",
    ]
    if session.commits:
        out.append("- **Commits:** " + ", ".join(f"`{c}`" for c in session.commits))
    out += [
        "",
        "> Generated by [`scripts/export_session.py`](../../../scripts/export_session.py)",
        "> from the local Claude Code transcript. Each exchange is the operator's prompt",
        "> and the reply that closed that turn. Tool calls, tool output, pasted",
        "> attachments and the narration between tool calls are not kept. Both sides are",
        "> verbatim, in the language they were written in; secrets and live-host",
        "> addresses are masked automatically. See [the dev-log README](../README.md).",
        "",
    ]

    if session.files:
        out += ["## Files modified", ""]
        out += [f"- `{name}`" for name in sorted(session.files)]
        out.append("")

    out += ["## Exchanges", ""]
    for index, exchange in enumerate(session.exchanges, start=1):
        moment = _parse_ts(exchange.ts)
        stamp = moment.strftime(stamp_format) if moment else "--:--"
        fence = _fence(exchange.prompt)
        out += [f"### {index} — {stamp}", "", f"{fence}text", exchange.prompt, fence, ""]

        if exchange.response:
            reply_at = _parse_ts(exchange.response_ts)
            when = f" — {reply_at.strftime(stamp_format)}" if reply_at else ""
            fence = _fence(exchange.response)
            out += [
                f"**Reply{when}**",
                "",
                f"{fence}markdown",
                exchange.response,
                fence,
                "",
            ]
        else:
            out += ["_No closing reply recorded for this turn._", ""]

    return "\n".join(out).rstrip() + "\n"


INDEX_HEADER = """# Session Records

One file per Claude Code session, generated from the local transcript by
[`scripts/export_session.py`](../../../scripts/export_session.py). This is the
evidence layer: each prompt and the reply that closed that turn, in order, with
timestamps. The narrative layer — why the work happened and what came of it — is
the monthly entry in [`dev-log/`](../), which links here.

Both sides are reproduced verbatim and may be in Vietnamese; only the
surrounding structure is English. Secrets and live-host addresses are masked
before writing. Read [the redaction rules](../README.md#what-must-not-go-in)
before adding anything here by hand.

**Replies** counts the exchanges that ended in prose; a turn that ended on a
tool call has none. **Commits** lists the SHAs git reported during the
session and that still resolve, so a commit made with `git commit -q`, which
prints nothing, does not appear — nor does one later rewritten away.

| Date | Session | Title | Exchanges | Replies | Commits |
|---|---|---|---|---|---|
"""


def render_index(sessions: list[Session]) -> str:
    rows = []
    for session in sorted(sessions, key=lambda s: s.first_ts, reverse=True):
        commits = ", ".join(f"`{c}`" for c in session.commits) or "—"
        title = redact(session.title or "Untitled session").replace("|", "\\|")
        rows.append(
            f"| {session_date(session)} | [`{session.short_id}`]({filename(session)}) "
            f"| {title} | {len(session.exchanges)} | {session.answered} | {commits} |"
        )
    return INDEX_HEADER + "\n".join(rows) + "\n"


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


def _collect(
    transcripts, max_chars: int, max_response_chars: int, since: str | None
) -> list[Session]:
    sessions = []
    for path in transcripts:
        session = parse_session(path, REPO_ROOT, max_chars, max_response_chars)
        if session is None:
            continue
        if since and session.first_ts[:10] < since:
            continue
        sessions.append(session)
    return sessions


def _write_if_changed(target: Path, body: str, check: bool, stale: list[str]) -> None:
    current = target.read_text(encoding="utf-8") if target.exists() else None
    if current == body:
        return
    if check:
        stale.append(target.name)
    else:
        target.write_text(body, encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--session", help="export only the session whose id starts with this")
    parser.add_argument("--since", help="skip sessions that started before this date (YYYY-MM-DD)")
    parser.add_argument("--transcript-dir", help="override transcript folder discovery")
    parser.add_argument("--transcript", help="export exactly this .jsonl file")
    parser.add_argument(
        "--from-hook",
        action="store_true",
        help="read Claude Code hook JSON on stdin and export that session",
    )
    parser.add_argument(
        "--max-prompt-chars",
        type=int,
        default=DEFAULT_MAX_PROMPT_CHARS,
        help=f"truncate a single prompt past this length (default {DEFAULT_MAX_PROMPT_CHARS})",
    )
    parser.add_argument(
        "--max-response-chars",
        type=int,
        default=DEFAULT_MAX_RESPONSE_CHARS,
        help=f"truncate a single reply past this length (default {DEFAULT_MAX_RESPONSE_CHARS})",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="write nothing; exit 1 if any record is missing or out of date",
    )
    parser.add_argument(
        "--output-dir",
        help=f"the private history repository to write into "
        f"(default: ${HISTORY_REPO_ENV}, else ../{HISTORY_REPO_DEFAULT})",
    )
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    single = None
    if args.from_hook:
        try:
            payload = json.load(sys.stdin)
        except (json.JSONDecodeError, ValueError):
            return 0  # a hook must never break the session it fires from
        path = payload.get("transcript_path")
        if not path or not Path(path).is_file():
            return 0
        single = Path(path)
    elif args.transcript:
        single = Path(args.transcript)

    folder = None
    if single is None:
        folder = find_transcript_dir(REPO_ROOT, args.transcript_dir)
        transcripts = sorted(folder.glob("*.jsonl"))
        if args.session:
            transcripts = [p for p in transcripts if p.stem.startswith(args.session)]
    else:
        transcripts = [single]

    output_dir = resolve_output_dir(args.output_dir)
    if not output_dir.parent.is_dir():
        # A hook must never break the session it fires from; a person running
        # this by hand needs to know why nothing was written.
        message = (
            f"session history repository not found at {output_dir.parent}; "
            f"clone it, or set {HISTORY_REPO_ENV} to its path "
            f"(see docs/dev-log/sessions.md)"
        )
        if args.from_hook:
            print(message, file=sys.stderr)
            return 0
        raise SystemExit(message)
    output_dir.mkdir(parents=True, exist_ok=True)
    stale: list[str] = []

    sessions = _collect(
        transcripts, args.max_prompt_chars, args.max_response_chars, args.since
    )
    for session in sessions:
        _write_if_changed(
            output_dir / filename(session), render(session), args.check, stale
        )

    # The index is only correct when every session was parsed, so a partial run
    # re-reads the rest of the folder rather than rewriting a truncated table.
    index_input = sessions
    if args.session or single is not None or args.since:
        try:
            folder = folder or find_transcript_dir(REPO_ROOT, args.transcript_dir)
            index_input = _collect(
                sorted(folder.glob("*.jsonl")),
                args.max_prompt_chars,
                args.max_response_chars,
                None,
            )
        except SystemExit:
            index_input = []
    if index_input:
        _write_if_changed(
            output_dir / "README.md", render_index(index_input), args.check, stale
        )

    if args.check:
        if stale:
            print("stale session records: " + ", ".join(sorted(stale)), file=sys.stderr)
            return 1
        return 0

    if not args.quiet:
        for session in sessions:
            print(
                f"{filename(session)}  ({len(session.exchanges)} exchanges, "
                f"{session.answered} replies)"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
