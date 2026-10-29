# Repository layout

```
pi-forgery/
├── extensions/forgery/
│   ├── index.ts            # extension factory (default export)
│   ├── package.json        # pi.extensions entry + peer deps
│   ├── tsconfig.json
│   ├── src/
│   │   ├── activity/       # data model + in-memory store (source of truth)
│   │   │   ├── types.ts
│   │   │   └── store.ts
│   │   ├── agents/
│   │   │   └── runner.ts   # one-shot agent subprocess runner
│   │   ├── exec/
│   │   │   ├── display.ts  # terminal image + video display (Kitty graphics protocol)
│   │   │   ├── runtime.ts  # program execution + host proxy + bridging
│   │   │   ├── schemas.ts  # TypeBox schemas for host calls
│   │   │   └── tool.ts     # forgery_exec ToolDefinition
│   │   └── ui/
│   │       ├── format.ts   # pure text presenters
│   │       ├── footer.ts   # status-line footer component
│   │       ├── widget.ts   # above-editor activity widget
│   │       ├── dashboard.ts# /forgery modal
│   │       └── controller.ts # mount/refresh orchestration
│   └── tests/
│       ├── store.test.ts
│       ├── format.test.ts
│       └── runtime.test.ts
├── dev-notes/              # GOAL / SPEC / PROGRESS / DECISIONS
├── docs/                   # this documentation site
├── package.json            # thin root wrapper
└── README.md
```
