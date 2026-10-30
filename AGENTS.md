# AI agent conventions — FilsPay

The rules for every coding agent (Claude, Cursor, Copilot, Codex, etc.) are
in [CLAUDE.md](CLAUDE.md). Read that file. This one only points to it, so
there is a single source to keep accurate.

The sole sources of truth for intended business behavior are
`docs/ARCHITECTURE.md`, `docs/HANDOVER.md`, and every record under `docs/adr/`.
Read all of them. Code, tests, comments, the checklist and changelog describe
implementation or history; they cannot override those sources. Follow explicit
ADR status/supersession. Escalate unresolved conflicts between designated
sources before changing the affected behavior; do not choose by author.
