/** Tool definitions for Bedrock adapter. Plain objects — passed to AI SDK at call time. */

export type ToolDef = {
  readonly description: string;
  readonly parameters: Record<string, unknown>;
};

export const TOOL_DEFS: Record<string, ToolDef> = {
  file_read: {
    description: "Read the contents of a file at a given path relative to the project root.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Relative file path from project root" } },
      required: ["path"],
    },
  },
  file_write: {
    description: "Create or overwrite a file at a given path relative to the project root.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path to create/overwrite" },
        content: { type: "string", description: "Full file content to write" },
      },
      required: ["path", "content"],
    },
  },
  file_edit: {
    description: "Apply a targeted edit to an existing file. Finds the first occurrence of old_text and replaces it with new_text.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path to edit" },
        old_text: { type: "string", description: "Exact text to find (first occurrence)", minLength: 1 },
        new_text: { type: "string", description: "Replacement text" },
      },
      required: ["path", "old_text", "new_text"],
    },
  },
  shell: {
    description: "Execute a shell command in the project directory.",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "Shell command to execute" } },
      required: ["command"],
    },
  },
  browser: {
    description: "Fetch a URL and extract its text content. Useful for reading documentation or web pages.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", format: "uri", description: "Absolute HTTP/HTTPS URL to fetch" } },
      required: ["url"],
    },
  },
};

export type ToolName = "file_read" | "file_write" | "file_edit" | "shell" | "browser";

export const TOOL_NAMES = Object.keys(TOOL_DEFS) as ToolName[];

export function isToolName(name: string): name is ToolName {
  return name in TOOL_DEFS;
}
