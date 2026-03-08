import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const MAX_README_CHARS = 2000;
const MAX_TREE_ENTRIES = 50;

function tree(dir: string): string {
  try {
    const entries = fs.readdirSync(dir).slice(0, MAX_TREE_ENTRIES);
    return entries.map((e) => {
      const full = path.join(dir, e);
      const stat = fs.statSync(full);
      return stat.isDirectory() ? `${e}/` : e;
    }).join("\n");
  } catch {
    return "(unable to read directory)";
  }
}

function git(dir: string): { branch: string; status: string } {
  try {
    const branch = execSync("git branch --show-current", { cwd: dir, timeout: 5000 }).toString().trim();
    const status = execSync("git status --short", { cwd: dir, timeout: 5000 }).toString().trim() || "clean";
    return { branch, status };
  } catch {
    return { branch: "(not a git repo)", status: "" };
  }
}

function readme(dir: string): string {
  for (const name of ["README.md", "readme.md", "README.txt", "README"]) {
    const file = path.join(dir, name);
    try {
      const content = fs.readFileSync(file, "utf-8");
      return content.length > MAX_README_CHARS ? content.slice(0, MAX_README_CHARS) + "\n..." : content;
    } catch { continue; }
  }
  return "(no README found)";
}

function pkg(dir: string): { name: string; description: string } {
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf-8");
    const data = JSON.parse(raw) as Record<string, string>;
    return { name: data.name || path.basename(dir), description: data.description || "" };
  } catch {
    return { name: path.basename(dir), description: "" };
  }
}

/** Build the system prompt for a Bedrock session with full project context. */
export function build(dir: string): string {
  const info = pkg(dir);
  const files = tree(dir);
  const repo = git(dir);
  const doc = readme(dir);

  return `You are an expert software engineer working in the project at: ${dir}

## Project Context
${info.name}${info.description ? ` — ${info.description}` : ""}

## File Structure (top-level)
${files}

## Git Status
Branch: ${repo.branch}
Status: ${repo.status}

## Key Files
${doc}

## Available Tools
You have access to these tools for modifying the project:
- file_read: Read file contents
- file_write: Create or overwrite files
- file_edit: Apply search/replace edits to files
- shell: Execute terminal commands
- browser: Fetch and read web pages

## Rules
- Always read a file before editing it
- Make minimal, targeted edits
- Explain what you're doing before using tools
- If a shell command might be destructive, explain why it's needed`;
}
