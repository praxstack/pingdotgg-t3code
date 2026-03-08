import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as sandbox from "./sandbox";

describe("sandbox.validate", () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-test-")));

  it("allows valid relative path", () => {
    const file = path.join(root, "test.txt");
    fs.writeFileSync(file, "hello");
    expect(sandbox.validate("test.txt", root)).toBe(file);
  });

  it("allows nested path", () => {
    const dir = path.join(root, "src");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "app.ts");
    fs.writeFileSync(file, "code");
    expect(sandbox.validate("src/app.ts", root)).toBe(file);
  });

  it("rejects parent traversal", () => {
    expect(() => sandbox.validate("../secret.txt", root)).toThrow(sandbox.SandboxViolation);
  });

  it("rejects deep traversal", () => {
    expect(() => sandbox.validate("src/../../etc/passwd", root)).toThrow(sandbox.SandboxViolation);
  });

  it("allows non-existent file (for file_write)", () => {
    const result = sandbox.validate("new-file.txt", root);
    expect(result).toBe(path.join(root, "new-file.txt"));
  });

  it("allows non-existent nested path", () => {
    const result = sandbox.validate("deep/nested/file.ts", root);
    expect(result).toBe(path.join(root, "deep", "nested", "file.ts"));
  });

  it("rejects symlink pointing outside", () => {
    const link = path.join(root, "evil-link");
    try {
      fs.symlinkSync("/tmp", link);
      expect(() => sandbox.validate("evil-link", root)).toThrow(sandbox.SandboxViolation);
    } finally {
      try { fs.unlinkSync(link); } catch { /* ignore */ }
    }
  });

  it("SandboxViolation has correct properties", () => {
    try {
      sandbox.validate("../escape", root);
    } catch (err) {
      expect(err).toBeInstanceOf(sandbox.SandboxViolation);
      const v = err as sandbox.SandboxViolation;
      expect(v._tag).toBe("SandboxViolation");
      expect(v.requested).toBe("../escape");
      expect(v.root).toBe(root);
    }
  });
});
