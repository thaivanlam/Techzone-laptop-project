# ADR-NNNN: Short title naming the decision, not the problem

- **Status:** Proposed | Accepted | Superseded by [ADR-NNNN](NNNN-slug.md) | Deprecated
- **Date:** YYYY-MM-DD
- **Affects:** which services or layers this binds

## Context

The forces in play: the requirement, the constraint, the thing that made a
choice necessary. Written so a reader who was not there can tell why the
question arose. Avoid naming the answer here.

## Decision

What was chosen, in the present tense and stated as a fact about the system:
"The gateway uses …", not "We should use …". Name the concrete artefact — the
dependency, the property key, the class — so the decision is checkable against
the code.

## Consequences

**Positive.** What this buys, concretely.

**Negative.** The cost, stated plainly. An ADR with no negative consequences is
almost always an ADR that has not been thought through.

**If this is revisited.** The alternative that would be chosen instead, and what
would have to change first.

## References

- Source: [`path/to/file`](../../../path/to/file)
- Related: [ADR-NNNN](NNNN-slug.md)
