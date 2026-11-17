import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AiError } from "./ai-error";
import type { CallUsage } from "./ai-usage";

/** Claude Code can take minutes on a long document. Same limit as the original desktop app. */
const CLI_TIMEOUT_MS = 900_000;

/** Tools that would let text from a teacher's prompt touch the server. The CLI is only used as a text generator. */
const BLOCKED_TOOLS = ["Bash", "Edit", "Write", "Read", "Glob", "Grep", "WebFetch", "WebSearch", "NotebookEdit", "Task"];

let cliAvailable: boolean | null = null;

/** True when a working `claude` binary is on PATH. Checked once per process. */
export function isClaudeCliAvailable(): boolean {
  if (cliAvailable !== null) return cliAvailable;
  try {
    const r = spawnSync("claude", ["--version"], { timeout: 30_000, stdio: "ignore" });
    cliAvailable = r.status === 0;
  } catch {
    cliAvailable = false;
  }
  return cliAvailable;
}

/**
 * One text generation through Claude Code (`claude -p`), using the login of the account on the server.
 * The prompt goes through stdin (import prompts can be very long) and the CLI runs in an empty temp
 * directory so it cannot read this project.
 */
export async function runClaudeCli({ prompt, system, model }: { prompt: string; system: string; model?: string }): Promise<{ text: string; usage: CallUsage }> {
  const cwd = await mkdtemp(join(tmpdir(), "harmoni-claude-"));
  try {
    // JSON output carries the answer plus the tokens used and the cost Claude Code computes for them.
    const args = ["-p", "--output-format", "json", "--append-system-prompt", system];
    if (model) args.push("--model", model);
    args.push("--disallowedTools", ...BLOCKED_TOOLS);

    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn("claude", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, CLI_TIMEOUT_MS);

      child.stdout.setEncoding("utf8").on("data", (d: string) => (out += d));
      child.stderr.setEncoding("utf8").on("data", (d: string) => (err += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new AiError(`Claude Code could not be started: ${e.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) return reject(new AiError("Claude Code did not respond within the time limit."));
        if (code !== 0) return reject(new AiError(`Claude Code failed: ${(err || readCliJson(out)?.result || out).trim().slice(0, 500)}`));
        resolve(out);
      });
      child.stdin.on("error", () => undefined); // the process may exit before reading stdin
      child.stdin.end(prompt);
    });

    const json = readCliJson(stdout);
    // An older Claude Code without JSON output: the whole output is the answer, with no usage numbers.
    if (!json) {
      const text = stdout.trim();
      if (!text) throw new AiError("Claude Code gave no answer. Try again.");
      return { text, usage: { model: model ?? "", input: 0, output: 0 } };
    }
    if (json.is_error) throw new AiError(`Claude Code failed: ${(json.result ?? "").trim().slice(0, 500)}`);
    const text = (json.result ?? "").trim();
    if (!text) throw new AiError("Claude Code gave no answer. Try again.");
    const u = json.usage ?? {};
    return {
      text,
      usage: {
        model: Object.keys(json.modelUsage ?? {})[0] ?? model ?? "",
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        costUsd: typeof json.total_cost_usd === "number" ? json.total_cost_usd : null,
      },
    };
  } finally {
    await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
  }
}

type CliJson = {
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  modelUsage?: Record<string, unknown>;
};

/** The final JSON object Claude Code prints with --output-format json, or null when the output is not that. */
function readCliJson(out: string): CliJson | null {
  const s = out.trim();
  if (!s.startsWith("{") && !s.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(s) as unknown;
    // With --verbose Claude Code prints every event as an array; the answer is the "result" event.
    const v = (Array.isArray(parsed) ? parsed.findLast((e) => (e as { type?: string })?.type === "result") : parsed) as CliJson | undefined;
    return typeof v === "object" && v !== null && ("result" in v || "is_error" in v) ? v : null;
  } catch {
    return null;
  }
}
