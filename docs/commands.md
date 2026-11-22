---
title: Commands
layout: default
permalink: /commands.html
---

# Commands

All commands are prefixed with `/forgery`.

| Command | Effect |
|---------|--------|
| `/forgery` | Open the dashboard (Activity view) |
| `/forgery status` | Print a compact config + activity summary |
| `/forgery agents` | List recorded one-shot agents |
| `/forgery log <agent-id>` | Show one agent's transcript |
| `/forgery stop <agent-id>` | Stop one running agent |
| `/forgery settings` | Read-only host-call + agent runner config |
| `/forgery image <path>` | Display an image inline in the terminal (Kitty graphics protocol) |
| `/forgery video <path>` | Play a video inline in the terminal (Kitty graphics protocol, ffmpeg frame extraction) |

## Shortcuts

| Shortcut | Effect |
|----------|--------|
| `ctrl+alt+f` | Open the dashboard |
| `ctrl+alt+e` | Focus the activity widget (expand a participant) |

## Examples

```
# Open the full-screen dashboard
/forgery

# Check current run status
/forgery status

# List all recorded agents
/forgery agents

# View an agent's transcript
/forgery log abc123def

# Stop a running agent
/forgery stop abc123def

# Show an image inline in the terminal
/forgery image screenshots/homepage.png

# Play a video inline in the terminal
/forgery video recordings/qa-run.mp4
