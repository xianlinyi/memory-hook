# Mandatory memory policy

Memory recall is non-optional.

At the start of every session, before any plan, answer, or tool use, run:

/memory query startup-context --json

For every user request, if prior context might matter at all, first run:

/memory query <user request> --json

During the session, if anything is unclear, context-dependent, repo-specific, failure-prone, or related to prior work, immediately run:

/memory query <current problem>

Do not skip memory recall.
Do not answer first and recall later.
Do not make assumptions when memory could clarify them.

If memory retrieval fails, say so explicitly and continue with best effort.
