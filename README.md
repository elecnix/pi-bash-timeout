# bash-timeout

Slash command to get and set the bash tool's default and max timeout, with an interactive picker menu.

## Features

- `/timeout` — interactive menu showing current default/max values with preset quick-picks:
  - 60 seconds
  - 5 minutes
  - 10 minutes
  - 1 hour
  - Other... (type any number of seconds)
  - Clear defaults
- `/timeout get` — inline notification with current values
- `/timeout set default <n|null>` — set the default timeout applied to bash calls with no explicit timeout
- `/timeout set max <n|null>` — set the maximum cap; bash calls requesting more than this get capped

## How it works

The extension intercepts every `bash` tool call via the `tool_call` event:

1. If no `timeout` is provided (or it's `null`), the **default** is injected
2. If the requested timeout exceeds the **max**, it's capped to the max

Values are persisted to `~/.pi/agent/bash-timeout.json`.

## Install

```bash
pi install git:github.com/nicobailon/py-bash-timeout
```

Or install locally from this repo:

```bash
pi install git:/home/nicolas/source/py-bash-timeout
```

## Usage

```
/timeout              # Interactive picker (current values + quick presets)
/timeout get         # Show current default and max timeout
/timeout set default 60        # Set default to 60 seconds
/timeout set default null      # Clear default (no default applied)
/timeout set max 300           # Cap max to 5 minutes
/timeout set max null         # Clear max cap
```
