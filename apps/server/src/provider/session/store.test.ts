import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as store from "./store";

describe("session store", () => {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "session-test-")));

  const data: store.SessionData = {
    threadId: "test-thread-1",
    model: "claude-sonnet-4",
    created: Date.now(),
    updated: Date.now(),
    messages: [{ role: "user", content: "hello" }],
    turnCount: 1,
    projectDir: "/tmp/project",
    runtimeMode: "approval-required",
    state: "active",
  };

  it("save and load round-trip", () => {
    store.save(dir, data);
    const loaded = store.load(dir, data.threadId);
    expect(loaded).not.toBeNull();
    expect(loaded!.threadId).toBe(data.threadId);
    expect(loaded!.model).toBe(data.model);
    expect(loaded!.messages).toHaveLength(1);
  });

  it("list returns saved sessions", () => {
    const sessions = store.list(dir);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions.find((s) => s.threadId === data.threadId)).toBeDefined();
  });

  it("load returns null for missing session", () => {
    expect(store.load(dir, "nonexistent")).toBeNull();
  });

  it("remove deletes session file", () => {
    store.save(dir, { ...data, threadId: "to-delete" });
    expect(store.load(dir, "to-delete")).not.toBeNull();
    store.remove(dir, "to-delete");
    expect(store.load(dir, "to-delete")).toBeNull();
  });

  it("list skips corrupt files", () => {
    const bad = path.join(dir, "corrupt.json");
    fs.writeFileSync(bad, "NOT VALID JSON{{{");
    const sessions = store.list(dir);
    // corrupt file should be deleted, not in results
    expect(sessions.every((s) => s.threadId !== "corrupt")).toBe(true);
    expect(fs.existsSync(bad)).toBe(false);
  });

  it("list skips .tmp files", () => {
    fs.writeFileSync(path.join(dir, "temp.json.tmp"), "{}");
    const sessions = store.list(dir);
    expect(sessions.every((s) => !s.threadId.includes("tmp"))).toBe(true);
  });

  it("save is atomic (temp + rename)", () => {
    const sub = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "atomic-test-")));
    store.save(sub, { ...data, threadId: "atomic-test" });
    const files = fs.readdirSync(sub);
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
    expect(files.some((f) => f === "atomic-test.json")).toBe(true);
  });
});
