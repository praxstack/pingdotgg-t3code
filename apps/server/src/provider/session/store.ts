import * as fs from "node:fs";
import * as path from "node:path";

export type SessionData = {
  readonly threadId: string;
  readonly model: string;
  readonly created: number;
  readonly updated: number;
  readonly messages: unknown[];
  readonly turnCount: number;
  readonly projectDir: string;
  readonly runtimeMode: string;
  readonly state: string;
};

/** Ensure the session directory exists. */
function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function filepath(dir: string, id: string): string {
  return path.join(dir, `${id}.json`);
}

/** Save session atomically (write temp, then rename). */
export function save(dir: string, data: SessionData): void {
  ensureDir(dir);
  const dest = filepath(dir, data.threadId);
  const tmp = dest + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, dest);
}

/** Load a single session by threadId. Returns null if not found or corrupt. */
export function load(dir: string, id: string): SessionData | null {
  const file = filepath(dir, id);
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

/** List all sessions from disk. Skips corrupt files (deletes them). */
export function list(dir: string): SessionData[] {
  ensureDir(dir);
  const result: SessionData[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".json") || entry.endsWith(".tmp")) continue;
    const file = path.join(dir, entry);
    try {
      const raw = fs.readFileSync(file, "utf-8");
      const data = JSON.parse(raw) as SessionData;
      if (data.threadId && data.model) {
        result.push(data);
      } else {
        fs.unlinkSync(file);
      }
    } catch {
      // Corrupt file — delete it
      try { fs.unlinkSync(file); } catch { /* ignore */ }
    }
  }
  return result;
}

/** Delete a session file. */
export function remove(dir: string, id: string): void {
  try { fs.unlinkSync(filepath(dir, id)); } catch { /* ignore */ }
}
