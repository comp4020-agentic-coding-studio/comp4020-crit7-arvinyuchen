# Your harness

This file is yours, and it arrives empty on purpose. The rules you hold the
agent to are part of what gets marked, so they should be rules you decided on.

Nothing about the starter is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec. Read them before you plan or build;
what the agent needs to carry from any of it is your call.

## Working agreements

Carried forward from Assignment 2, where they were the rules that held
regardless of what the site was about.

- **Never invent a fact about the real system.** This app models a slice of an
  ANU system, and how that system actually behaves (its entities, its rules,
  the constraint that makes it annoying) is ground truth that comes from me or
  from a source I can point to. If a behaviour cannot be traced, ask rather
  than guess; a plausible invented rule is worse than an admitted gap.
- **If a rule is inconvenient, change the rule deliberately and say so.** Do
  not work around a check. The check is the rule made enforceable.
- **Fix the harness, not the instance.** When something slips through, add or
  tighten a check (or a rule here) rather than patching the single case.
- **Write down rules that are living in a conversation.** A standing
  instruction followed consistently but recorded nowhere is not a mechanism;
  a fresh session breaks it on day one. When I correct the same thing twice,
  it belongs in this file.
- **Prefer cutting to padding.** A smaller slice that is wired end to end beats
  a complete-looking one that is not.
