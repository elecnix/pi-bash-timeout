import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

const AGENT_DIR = path.join(process.env.HOME || "", ".pi", "agent");
const CONFIG_FILE = path.join(AGENT_DIR, "bash-timeout.json");

interface BashTimeoutConfig {
	defaultTimeout: number | null;
	maxTimeout: number | null;
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
			return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
		}
	} catch {
		// fall through to defaults
	}
	return { defaultTimeout: null, maxTimeout: null };
}

function saveConfig(config: BashTimeoutConfig): void {
	fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function formatTimeout(seconds: number | null): string {
	if (seconds === null) return "(none)";
	if (seconds === 0) return "0 (immediate)";
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

		const input = event.input as { command: string; timeout?: number | null };

		let desired = input.timeout;

		// Apply default if not set or explicitly null
		if (desired === undefined || desired === null) {
			if (config.defaultTimeout !== null) {
				input.timeout = config.defaultTimeout;
				desired = config.defaultTimeout;
			}
		}

		// Apply max cap
		if (config.maxTimeout !== null && desired !== undefined && desired !== null && desired > config.maxTimeout) {
			input.timeout = config.maxTimeout;
		}
	});

	pi.registerCommand("timeout", {
		description: "Get or set bash tool default and max timeout",
		handler: async (args, ctx) => {
			const parts = (args || "").trim().split(/\s+/);
			const action = parts[0] || "show";

			if (action === "show") {
				// Show current settings with picker
				const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
					let selected = 0;
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

						// Current values
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
							const clearIdx = PRESETS.length + 1;
							const cprefix = selected === clearIdx ? theme.fg("accent", "> ") : "  ";
							lines.push(`${cprefix} Clear defaults`);
						} else {
							const maxHint =
								config.maxTimeout !== null
									? ` (max cap: ${config.maxTimeout}s)`
									: "";
							lines.push(theme.fg("muted", ` Enter seconds for DEFAULT timeout${maxHint}:`));
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
							// Filter to digits only
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
								config = { ...config, defaultTimeout: PRESETS[selected].value };
								saveConfig(config);
								done(`default:${PRESETS[selected].value}`);
							} else if (selected === PRESETS.length) {
								// Other — switch to edit mode
								editMode = true;
								editBuffer = "";
								refresh();
							} else {
								// Clear
								config = { ...config, defaultTimeout: null };
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

					return {
						render,
						invalidate: () => {
							cachedLines = undefined;
						},
						handleInput,
					};
				});

				if (!result) {
					return;
				}

				if (result === "cleared") {
					ctx.ui.notify("Bash default timeout cleared", "info");
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
						ctx.ui.notify("Usage: /timeout set default <seconds|null>", "error");
						return;
					}
					const secs = value === "null" ? null : parseInt(value, 10);
					if (secs !== null && (isNaN(secs) || secs < 1)) {
						ctx.ui.notify("Invalid timeout value (must be ≥ 1 second)", "error");
						return;
					}
					config = { ...config, defaultTimeout: secs };
					saveConfig(config);
					ctx.ui.notify(`Default timeout set to ${formatTimeout(secs)}`, "success");
					return;
				}

				if (sub === "max") {
					if (!value) {
						ctx.ui.notify("Usage: /timeout set max <seconds|null>", "error");
						return;
					}
					const secs = value === "null" ? null : parseInt(value, 10);
					if (secs !== null && (isNaN(secs) || secs < 1)) {
						ctx.ui.notify("Invalid timeout value (must be ≥ 1 second)", "error");
						return;
					}
					config = { ...config, maxTimeout: secs };
					saveConfig(config);
					ctx.ui.notify(`Max timeout cap set to ${formatTimeout(secs)}`, "success");
					return;
				}

				ctx.ui.notify("Usage: /timeout set default <n|null> | set max <n|null>", "error");
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
					`Usage: /timeout [show|get|set default <n|null>|set max <n|null>]`,
				"info",
			);
		},
	});
}
