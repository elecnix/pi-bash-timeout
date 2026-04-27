import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

const AGENT_DIR = path.join(process.env.HOME || "", ".pi", "agent");
const CONFIG_FILE = path.join(AGENT_DIR, "bash-timeout.json");

interface BashTimeoutConfig {
	defaultTimeout: number; // 0 = infinite (no default), >0 = seconds
	maxTimeout: number;     // 0 = infinite (no cap), >0 = cap in seconds
}

const PRESETS = [
	{ label: "60 seconds", value: 60 },
	{ label: "5 minutes", value: 300 },
	{ label: "10 minutes", value: 600 },
	{ label: "1 hour", value: 3600 },
];

function loadConfig(): BashTimeoutConfig {
	try {
		if (fs.existsSync(CONFIG_FILE)) {
			const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
			// Migrate null → 0 for infinite
			return {
				defaultTimeout: raw.defaultTimeout ?? 0,
				maxTimeout: raw.maxTimeout ?? 0,
			};
		}
	} catch {
		// fall through to defaults
	}
	return { defaultTimeout: 0, maxTimeout: 0 };
}

function saveConfig(config: BashTimeoutConfig): void {
	fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function formatTimeout(seconds: number): string {
	if (seconds === 0) return "infinite";
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	if (h > 0) return `${h}h ${m}m ${s}s`;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}

export default function bashTimeout(pi: ExtensionAPI) {
	// Load persisted config
	let config = loadConfig();

	// Tool call interceptor: inject default / cap max timeout
	pi.on("tool_call", (event) => {
		if (!isToolCallEventType("bash", event)) return;

		const input = event.input as { command: string; timeout?: number };

		let desired = input.timeout;

		// Apply default if timeout is undefined
		if (desired === undefined) {
			if (config.defaultTimeout > 0) {
				input.timeout = config.defaultTimeout;
				desired = config.defaultTimeout;
			}
		}

		// Apply max cap
		if (config.maxTimeout > 0 && desired !== undefined && desired > config.maxTimeout) {
			input.timeout = config.maxTimeout;
		}
	});

	pi.registerCommand("timeout", {
		description: "Get or set bash tool default and max timeout",
		handler: async (args, ctx) => {
			const parts = (args || "").trim().split(/\s+/);
			const action = parts[0] || "show";

			if (action === "show") {
				const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
					let selected = PRESETS.length + 1;
					let editMode = false;
					let editBuffer = "";
					let cachedLines: string[] | undefined;

					function render(width: number): string[] {
						if (cachedLines) return cachedLines;
						const lines: string[] = [];
						const add = (s: string) => lines.push(s.length > width ? s.substring(0, width) : s);

						const sep = theme.fg("accent", "─".repeat(width));
						lines.push(sep);
						lines.push(theme.fg("text", " Bash Timeout Settings"));
						lines.push(sep);
						lines.push("");

						lines.push(` Default:  ${theme.fg("accent", formatTimeout(config.defaultTimeout))}`);
						lines.push(` Max cap:  ${theme.fg("accent", formatTimeout(config.maxTimeout))}`);
						lines.push("");

						if (!editMode) {
							lines.push(theme.fg("muted", " Set Default:"));
							PRESETS.forEach((p, i) => {
								const prefix = selected === i ? theme.fg("accent", "> ") : "  ";
								lines.push(`${prefix}${p.label} (${p.value}s)`);
							});
							const otherIdx = PRESETS.length;
							const prefix = selected === otherIdx ? theme.fg("accent", "> ") : "  ";
							lines.push(`${prefix} Other... (type seconds)`);
							const infiniteIdx = PRESETS.length + 1;
							const iprefix = selected === infiniteIdx ? theme.fg("accent", "> ") : "  ";
							lines.push(`${iprefix} Infinite (no default)`);
						} else {
							const maxHint =
								config.maxTimeout > 0 ? ` (max cap: ${config.maxTimeout}s)` : "";
							lines.push(theme.fg("muted", ` Enter seconds for DEFAULT${maxHint}:`));
							lines.push("");
							const line = ` ${theme.fg("accent", ">>> ")}${theme.fg("text", editBuffer || " ")}`;
							lines.push(line);
						}

						lines.push("");
						if (!editMode) {
							lines.push(theme.fg("dim", " ↑↓ navigate • Enter to select • Esc to close"));
						} else {
							lines.push(theme.fg("dim", " Enter to confirm • Esc to cancel"));
						}
						lines.push(sep);

						cachedLines = lines;
						return lines;
					}

					function refresh() {
						cachedLines = undefined;
						tui.requestRender();
					}

					function handleInput(data: string) {
						if (editMode) {
							if (data === "KEY_ESCAPE" || data === "\x1b") {
								editMode = false;
								editBuffer = "";
								refresh();
								return;
							}
							if (data === "KEY_ENTER" || data === "\r") {
								const secs = parseInt(editBuffer, 10);
								if (!isNaN(secs) && secs >= 1) {
									// default cannot exceed max
									if (config.maxTimeout > 0 && secs > config.maxTimeout) {
										editBuffer = "";
										editMode = false;
										refresh();
										return;
									}
									config = { ...config, defaultTimeout: secs };
									saveConfig(config);
									done(`default:${secs}`);
								} else {
									editMode = false;
									editBuffer = "";
									refresh();
								}
								return;
							}
							if (data === "KEY_BACKSPACE" || data === "\x7f") {
								editBuffer = editBuffer.slice(0, -1);
								refresh();
								return;
							}
							if (/^\d$/.test(data)) {
								editBuffer += data;
								refresh();
							}
							return;
						}

						if (data === "KEY_UP" || data === "\x1b[A") {
							selected = Math.max(0, selected - 1);
							refresh();
							return;
						}
						if (data === "KEY_DOWN" || data === "\x1b[B") {
							selected = Math.min(PRESETS.length + 1, selected + 1);
							refresh();
							return;
						}
						if (data === "KEY_ENTER" || data === "\r") {
							if (selected < PRESETS.length) {
								const secs = PRESETS[selected].value;
								if (config.maxTimeout > 0 && secs > config.maxTimeout) {
									// silently skip
								} else {
									config = { ...config, defaultTimeout: secs };
									saveConfig(config);
									done(`default:${secs}`);
								}
							} else if (selected === PRESETS.length) {
								editMode = true;
								editBuffer = "";
								refresh();
							} else {
								// Infinite
								config = { ...config, defaultTimeout: 0 };
								saveConfig(config);
								done("cleared");
							}
							return;
						}
						if (data === "KEY_ESCAPE" || data === "\x1b") {
							done(null);
							return;
						}
					}

					return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
				});

				if (!result) return;

				if (result === "cleared") {
					ctx.ui.notify("Default bash timeout set to infinite", "info");
					return;
				}

				if (result.startsWith("default:")) {
					const secs = parseInt(result.split(":")[1], 10);
					ctx.ui.notify(`Default bash timeout set to ${formatTimeout(secs)}`, "success");
					return;
				}

				return;
			}

			if (action === "set") {
				const sub = parts[1];
				const value = parts[2];

				if (sub === "default" || sub === "def") {
					if (!value) {
						ctx.ui.notify("Usage: /timeout set default <seconds|infinite>", "error");
						return;
					}
					if (value === "infinite") {
						config = { ...config, defaultTimeout: 0 };
						saveConfig(config);
						ctx.ui.notify("Default timeout set to infinite", "success");
						return;
					}
					const secs = parseInt(value, 10);
					if (isNaN(secs) || secs < 1) {
						ctx.ui.notify("Invalid timeout value (must be ≥ 1 second)", "error");
						return;
					}
					if (config.maxTimeout > 0 && secs > config.maxTimeout) {
						ctx.ui.notify(`Default (${secs}s) cannot exceed max (${config.maxTimeout}s)`, "error");
						return;
					}
					config = { ...config, defaultTimeout: secs };
					saveConfig(config);
					ctx.ui.notify(`Default timeout set to ${formatTimeout(secs)}`, "success");
					return;
				}

				if (sub === "max") {
					if (!value) {
						ctx.ui.notify("Usage: /timeout set max <seconds|infinite>", "error");
						return;
					}
					if (value === "infinite") {
						config = { ...config, maxTimeout: 0 };
						saveConfig(config);
						ctx.ui.notify("Max timeout cap removed (infinite)", "success");
						return;
					}
					const secs = parseInt(value, 10);
					if (isNaN(secs) || secs < 1) {
						ctx.ui.notify("Invalid timeout value (must be ≥ 1 second)", "error");
						return;
					}
					// Setting max lower than current default? pull default down
					if (config.defaultTimeout > secs) {
						config = { ...config, defaultTimeout: secs, maxTimeout: secs };
						saveConfig(config);
						ctx.ui.notify(
							`Max cap set to ${formatTimeout(secs)} (default also adjusted)`,
							"success",
						);
					} else {
						config = { ...config, maxTimeout: secs };
						saveConfig(config);
						ctx.ui.notify(`Max timeout cap set to ${formatTimeout(secs)}`, "success");
					}
					return;
				}

				ctx.ui.notify("Usage: /timeout set default <n|infinite> | set max <n|infinite>", "error");
				return;
			}

			if (action === "get") {
				ctx.ui.notify(
					`Bash timeout — default: ${formatTimeout(config.defaultTimeout)}, max: ${formatTimeout(config.maxTimeout)}`,
					"info",
				);
				return;
			}

			ctx.ui.notify(
				`Bash timeout — default: ${formatTimeout(config.defaultTimeout)}, max: ${formatTimeout(config.maxTimeout)}\n` +
					`Usage: /timeout [show|get|set default <n|infinite>|set max <n|infinite>]`,
				"info",
			);
		},
	});
}
