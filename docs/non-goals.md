---
title: Non-Goals
layout: default
permalink: /non-goals.html
---

# Non-goals

These are parts pi-forgery deliberately does NOT do:

- No durable-residency actors, mesh topics, councils, recursion graphs.
- No speculative PTC, prompt-cache warming, entropy/proof certifiers.
- No Python/Monty execution kernel (TypeScript only; a Python kernel is a
  follow-up opt-in flag).
- No separate provider registry or MCP bridge.
- No Bend verified policy kernels.
- No security sandbox for generated program bodies. Programs are trusted code;
  the host-call whitelist and dry-run mode are not isolation boundaries.

These are parts that add large native dependencies and
startup cost without helping the "programmable tool + live status" goal.
