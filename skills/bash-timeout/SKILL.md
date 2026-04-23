# bash-timeout

Use the `/timeout` slash command to get and set the bash tool's default and max timeout.

## Slash Commands

| Command | Description |
|---------|-------------|
| `/timeout` | Interactive picker: current default/max + quick presets (60s, 5m, 10m, 1h, Other, Clear) |
| `/timeout get` | Show current default and max timeout in an inline notification |
| `/timeout set default <n\|null>` | Set the default timeout applied to bash calls with no explicit timeout |
| `/timeout set max <n\|null>` | Set the maximum cap; bash calls requesting more than this get capped |

## How It Works

The extension intercepts every `bash` tool call:

1. If no `timeout` is provided (or it's `null`), the **default** is injected
2. If the requested timeout exceeds the **max**, it's capped to the max

Values are persisted to `~/.pi/agent/bash-timeout.json`.

## Examples

```
/timeout              # Opens interactive picker
/timeout get         # "Bash timeout — default: 60s, max: 300s"
/timeout set default 60
/timeout set default null      # Clear default (no default applied)
/timeout set max 300          # Cap max to 5 minutes
```
