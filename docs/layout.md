---
title: Repository Layout
layout: default
permalink: /layout.html
---

# Repository layout

```
pi-forgery/
├── index.ts                # extension factory (default export)
├── package.json            # root pi.extensions entry + dependencies
├── pnpm-lock.yaml          # reproducible root install
├── pnpm-workspace.yaml     # dependency build policy
├── tsconfig.json
├── src/
│   ├── activity/           # data model + in-memory store (source of truth)
│   │   ├── types.ts
│   │   └── store.ts
│   ├── agents/
│   │   └── runner.ts       # one-shot agent subprocess runner
│   ├── exec/
│   │   ├── display.ts      # terminal image + video display (Kitty graphics protocol)
│   │   ├── runtime.ts      # program execution + host proxy + bridging
│   │   ├── schemas.ts      # TypeBox schemas for host calls
│   │   └── tool.ts         # forgery_exec ToolDefinition
│   ├── git/                # branch and GitHub telemetry
│   ├── ui/
│   │   ├── format.ts       # pure text presenters
│   │   ├── footer.ts       # status-line footer component
│   │   ├── widget.ts       # above-editor activity widget
│   │   ├── dashboard.ts    # /forgery modal
│   │   └── controller.ts   # mount/refresh orchestration
│   └── workflow/           # chains, journals, pipelines, and personas
├── tests/                  # unit and golden-render tests
├── .github/workflows/ci.yml
├── dev-notes/              # GOAL / SPEC / PROGRESS / DECISIONS
├── docs/                   # this documentation site
└── README.md
```
