# pi-forgery

An improved, focused programmable tool and agent runtime for Pi.

pi-forgery gives Pi one programmable execution tool (`forgery_exec`), one-shot
agent runs, a live activity widget, a status-line footer, terminal image/video
display, and a `/forgery` dashboard — all driven by a single in-memory activity
snapshot. It deliberately drops speculative heavy machinery to stay
small, auditable, and cheap to boot.

## Install

```
pi install /absolute/path/to/pi-forgery
```

or, for one development run:

```
pi -e /absolute/path/to/pi-forgery
```

## Quick start

Open the dashboard:

```
/forgery
```

Display an image inline in the terminal:

```
/forgery image screenshot.png
```

Play a video inline in the terminal:

```
/forgery video recording.mp4
```

## Documentation

Full documentation lives in [`docs/`](./docs/):

- [Usage](./docs/usage.md) — `forgery_exec` programs, media display
- [Commands](./docs/commands.md) — all `/forgery` subcommands + shortcuts
- [Host calls](./docs/host-calls.md) — `pi.showImage`, `pi.showImages`, `pi.showVideo`
- [Status line / footer](./docs/status-line.md)
- [Repository layout](./docs/layout.md)
- [Development](./docs/development.md)
- [Non-goals](./docs/non-goals.md)

## Development

```sh
cd extensions/forgery
npm install
npm run typecheck   # npx tsc --noEmit
npm test            # npx tsx --test tests/*.test.ts
```
