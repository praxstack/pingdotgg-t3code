import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { ToolName } from "./definitions";
import * as sandbox from "./sandbox";

const SHELL_OUTPUT_LIMIT = 10_000;
const BROWSER_OUTPUT_LIMIT = 15_000;
const FILE_READ_LIMIT = 100_000;
const DEFAULT_SHELL_TIMEOUT = 120_000;
const DEFAULT_BROWSER_TIMEOUT = 30_000;

export type ToolResult = {
  readonly output: string;
  readonly error: boolean;
  readonly duration: number;
};

type Config = {
  readonly root: string;
  readonly timeout?: number;
  readonly browserTimeout?: number;
};

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "\n[output truncated at " + limit + " chars]";
}

const MAX_FILE_BYTES = 1_048_576; // 1MB — refuse to read larger files into memory

async function read(args: { path: string }, cfg: Config): Promise<ToolResult> {
  const start = Date.now();
  try {
    const resolved = sandbox.validate(args.path, cfg.root);
    const stat = fs.statSync(resolved);
    if (stat.size > MAX_FILE_BYTES) {
      // Read only first MAX_FILE_BYTES to avoid OOM on huge binaries
      const fd = fs.openSync(resolved, "r");
      const buf = Buffer.alloc(MAX_FILE_BYTES);
      fs.readSync(fd, buf, 0, MAX_FILE_BYTES, 0);
      fs.closeSync(fd);
      return { output: truncate(buf.toString("utf-8"), FILE_READ_LIMIT), error: false, duration: Date.now() - start };
    }
    const content = fs.readFileSync(resolved, "utf-8");
    return { output: truncate(content, FILE_READ_LIMIT), error: false, duration: Date.now() - start };
  } catch (err) {
    const msg = err instanceof sandbox.SandboxViolation ? err.message : `File not found: ${args.path}`;
    return { output: msg, error: true, duration: Date.now() - start };
  }
}

async function write(args: { path: string; content: string }, cfg: Config): Promise<ToolResult> {
  const start = Date.now();
  try {
    const resolved = sandbox.validate(args.path, cfg.root);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, args.content);
    return { output: `File written: ${args.path}`, error: false, duration: Date.now() - start };
  } catch (err) {
    const msg = err instanceof sandbox.SandboxViolation ? err.message : `Write failed: ${String(err)}`;
    return { output: msg, error: true, duration: Date.now() - start };
  }
}

async function edit(args: { path: string; old_text: string; new_text: string }, cfg: Config): Promise<ToolResult> {
  const start = Date.now();
  try {
    const resolved = sandbox.validate(args.path, cfg.root);
    const content = fs.readFileSync(resolved, "utf-8");
    const idx = content.indexOf(args.old_text);
    if (idx === -1) return { output: `Text not found in ${args.path}`, error: true, duration: Date.now() - start };
    const updated = content.slice(0, idx) + args.new_text + content.slice(idx + args.old_text.length);
    fs.writeFileSync(resolved, updated);
    return { output: `Edit applied to ${args.path}`, error: false, duration: Date.now() - start };
  } catch (err) {
    const msg = err instanceof sandbox.SandboxViolation ? err.message : `Edit failed: ${String(err)}`;
    return { output: msg, error: true, duration: Date.now() - start };
  }
}

function shell(args: { command: string }, cfg: Config): Promise<ToolResult> {
  const start = Date.now();
  const timeout = cfg.timeout ?? DEFAULT_SHELL_TIMEOUT;
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const ac = new AbortController();
    const proc = spawn(args.command, { cwd: cfg.root, shell: true, signal: ac.signal });
    const timer = setTimeout(() => {
      ac.abort();
      resolve({ output: `Command timed out after ${timeout}ms and was killed.`, error: true, duration: Date.now() - start });
    }, timeout);
    proc.stdout?.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr?.on("data", (d: Buffer) => chunks.push(d));
    proc.on("close", (code) => {
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString("utf-8");
      const out = truncate(raw, SHELL_OUTPUT_LIMIT) + `\nExit code: ${code ?? "unknown"}`;
      resolve({ output: out, error: false, duration: Date.now() - start });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      if (err.name === "AbortError") return; // handled by timer
      resolve({ output: `Shell error: ${err.message}`, error: true, duration: Date.now() - start });
    });
  });
}

async function browser(args: { url: string }, cfg: Config): Promise<ToolResult> {
  const start = Date.now();
  const timeout = cfg.browserTimeout ?? DEFAULT_BROWSER_TIMEOUT;
  try {
    const parsed = new URL(args.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { output: `Invalid URL: only HTTP and HTTPS protocols are allowed. Got: ${args.url}`, error: true, duration: Date.now() - start };
    }
    const resp = await fetch(args.url, { signal: AbortSignal.timeout(timeout) });
    if (!resp.ok) return { output: `HTTP ${resp.status} ${resp.statusText}: ${args.url}`, error: true, duration: Date.now() - start };
    const text = await resp.text();
    // Strip HTML tags for cleaner output
    const clean = text.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return { output: truncate(clean, BROWSER_OUTPUT_LIMIT), error: false, duration: Date.now() - start };
  } catch (err) {
    const msg = String(err).includes("TimeoutError") ? `URL fetch timed out after ${timeout}ms: ${args.url}` : `Fetch failed: ${String(err)}`;
    return { output: msg, error: true, duration: Date.now() - start };
  }
}

/** Execute a tool call by name. Returns the result string and error flag. */
export async function execute(name: ToolName, args: Record<string, unknown>, cfg: Config): Promise<ToolResult> {
  switch (name) {
    case "file_read": return read(args as { path: string }, cfg);
    case "file_write": return write(args as { path: string; content: string }, cfg);
    case "file_edit": return edit(args as { path: string; old_text: string; new_text: string }, cfg);
    case "shell": return shell(args as { command: string }, cfg);
    case "browser": return browser(args as { url: string }, cfg);
  }
}
