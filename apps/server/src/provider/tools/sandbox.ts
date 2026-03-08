import * as fs from "node:fs";
import * as path from "node:path";

export class SandboxViolation extends Error {
  readonly _tag = "SandboxViolation" as const;
  constructor(
    readonly requested: string,
    readonly resolved: string,
    readonly root: string,
  ) {
    super(`Access denied: path '${requested}' resolves outside the project directory.`);
  }
}

/** Resolve and validate that a relative path stays within the project directory. */
export function validate(rel: string, root: string): string {
  const resolved = path.resolve(root, rel);
  let canonical: string;
  try {
    canonical = fs.realpathSync.native(resolved);
  } catch {
    // File may not exist yet (file_write). Validate parent instead.
    const parent = path.dirname(resolved);
    try {
      canonical = path.join(fs.realpathSync.native(parent), path.basename(resolved));
    } catch {
      // Parent doesn't exist either — will be created. Use resolved path.
      canonical = resolved;
    }
  }
  const norm = root.endsWith(path.sep) ? root : root + path.sep;
  if (canonical !== root && !canonical.startsWith(norm)) {
    throw new SandboxViolation(rel, canonical, root);
  }
  return canonical;
}
