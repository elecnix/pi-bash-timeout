# pi-bash-timeout

A [pi-coding-agent](https://github.com/badlogic/pi-mono) extension that enforces default and maximum timeouts on all `bash` tool calls.

## Goal

The pi coding agent's built-in `bash` tool has **no default timeout** — commands run indefinitely unless an explicit `timeout` is passed each time. This extension solves that by:

1. **Injecting a default timeout** on every bash call that doesn't specify one
2. **Capping timeouts** that exceed a maximum threshold

Both values can be set to **infinite** (0 = no default / no cap). Values persist across sessions in `~/.pi/agent/bash-timeout.json`.

## Behavior

The extension intercepts every `bash` tool call via the `tool_call` event:

```
timeout = undefined (not specified)  →  apply DEFAULT if set
timeout < MAX                       →  use as-is
timeout > MAX                       →  cap to MAX
timeout = 0                         →  no timeout (passthrough)
```

**Rule:** `default` can never exceed `max`. If you lower `max` below the current `default`, the `default` is automatically lowered to match.

## Commands

### `/timeout` — Interactive picker

Opens a TUI menu showing current default/max values with quick presets:

```
 Default:  infinite
 Max cap:  infinite

 Set Default:
> 60 seconds (60s)
  5 minutes (300s)
  10 minutes (600s)
  1 hour (3600s)
  Other... (type seconds)
  Infinite (no default)
```

Navigation: `↑↓` navigate, `Enter` select, `Esc` close

### `/timeout get`

```
Bash timeout — default: 60s, max: 300s
```

### `/timeout set default <n|infinite>`

Sets the default timeout. Use `infinite` to disable.

```bash
/timeout set default 60          # 60 seconds
/timeout set default infinite    # no default applied
```

### `/timeout set max <n|infinite>`

Sets the maximum cap. If the new cap is lower than the current default, the default is automatically lowered to match. Use `infinite` to remove the cap.

```bash
/timeout set max 300             # cap at 5 minutes
/timeout set max infinite       # no cap
```

## Install

```bash
pi install git:github.com/elecnix/pi-bash-timeout
```

## Persisted config

`~/.pi/agent/bash-timeout.json` — `0` means infinite:

```json
{
  "defaultTimeout": 60,
  "maxTimeout": 300
}
```

## Architecture

```
extensions/bash-timeout/index.ts
├── tool_call handler  → injects default / caps max timeout on every bash call
├── /timeout command  → interactive picker + get/set/subcommand handlers
└── JSON config I/O   → persists settings to ~/.pi/agent/bash-timeout.json
```

## Requirements

- pi-coding-agent v0.69+
- Node.js 20+
