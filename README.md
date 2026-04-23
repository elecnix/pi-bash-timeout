# pi-bash-timeout

A [pi-coding-agent](https://github.com/badlogic/pi-mono) extension that enforces default and maximum timeouts on all `bash` tool calls.

## Goal

The pi coding agent's built-in `bash` tool has **no default timeout** — commands run indefinitely unless an explicit `timeout` is passed each time. This extension solves that by:

1. **Injecting a default timeout** on every bash call that doesn't specify one
2. **Capping timeouts** that exceed a maximum threshold

Values persist across sessions in `~/.pi/agent/bash-timeout.json`.

## Behavior

The extension intercepts every `bash` tool call via the `tool_call` event:

1. If `timeout` is `undefined` or `null` → inject the **default**
2. If `timeout > max` → cap it to the **max**

```
no timeout specified    →  apply DEFAULT
timeout < max         →  use as-is  
timeout > max         →  cap to MAX
timeout = 0           →  no timeout (passthrough)
```

## Commands

### `/timeout` — Interactive picker

Opens a TUI menu showing current default/max values with quick presets:

```
 Default:  5s
 Max cap:  20s

 Set Default:
> 60 seconds (60s)
  5 minutes (300s)
  10 minutes (600s)
  1 hour (3600s)
  Other... (type seconds)
  Clear defaults
```

Navigation: `↑↓` navigate, `Enter` select, `Esc` close

### `/timeout get`

Shows current values in an inline notification.

```
Bash timeout — default: 5s, max: 20s
```

### `/timeout set default <n|null>`

Sets the default timeout (in seconds). Use `null` to clear.

```bash
/timeout set default 60        # 60 seconds
/timeout set default null      # clear (no default applied)
```

### `/timeout set max <n|null>`

Sets the maximum cap. Use `null` to disable.

```bash
/timeout set max 300           # cap at 5 minutes
/timeout set max null          # no cap
```

## Install

```bash
pi install git:github.com/elecnix/pi-bash-timeout
```

This installs the extension from the public GitHub repo. It auto-discovers on next pi restart.

## Persisted config

`~/.pi/agent/bash-timeout.json`:
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
├── /timeout command   → interactive picker + get/set/subcommand handlers
└── JSON config I/O     → persists settings to ~/.pi/agent/bash-timeout.json
```

## Requirements

- pi-coding-agent v0.69+
- Node.js 20+
