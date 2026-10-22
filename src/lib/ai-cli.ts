import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AiError } from "./ai-error";

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
export async function runClaudeCli({ prompt, system, model }: { prompt: string; system: string; model?: string }): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "harmoni-claude-"));
  try {
    const args = ["-p", "--output-format", "text", "--append-system-prompt", system];
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
        if (code !== 0) return reject(new AiError(`Claude Code failed: ${(err || out).trim().slice(0, 500)}`));
        resolve(out);
      });
      child.stdin.on("error", () => undefined); // the process may exit before reading stdin
      child.stdin.end(prompt);
    });

    const text = stdout.trim();
    if (!text) throw new AiError("Claude Code gave no answer. Try again.");
    return text;
  } finally {
    await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
  }
}
