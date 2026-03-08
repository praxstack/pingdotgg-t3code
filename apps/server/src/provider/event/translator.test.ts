import { describe, it, expect } from "vitest";
import * as translator from "./translator";

const ctx = { threadId: "thread-1", turnId: "turn-1" };

describe("event translator", () => {
  it("translates text-delta", () => {
    const evt = translator.translate({ type: "text-delta", textDelta: "Hello" }, ctx);
    expect(evt).not.toBeNull();
    expect(evt!.method).toBe("turn.content-part.stream.delta");
    expect(evt!.params.delta).toBe("Hello");
  });

  it("translates text-done", () => {
    const evt = translator.translate({ type: "text-done", text: "Full response" }, ctx);
    expect(evt).not.toBeNull();
    expect(evt!.method).toBe("turn.content-part.stream.done");
    expect(evt!.params.text).toBe("Full response");
  });

  it("translates tool-call", () => {
    const evt = translator.translate({
      type: "tool-call",
      toolCallId: "tc_1",
      toolName: "file_read",
      args: { path: "src/index.ts" },
    }, ctx);
    expect(evt).not.toBeNull();
    expect(evt!.method).toBe("turn.item.created");
    const item = evt!.params.item as Record<string, unknown>;
    expect(item.type).toBe("tool_call");
    expect(item.name).toBe("file_read");
  });

  it("translates finish", () => {
    const evt = translator.translate({ type: "finish", finishReason: "stop" }, ctx);
    expect(evt).not.toBeNull();
    expect(evt!.method).toBe("turn.completed");
    expect(evt!.params.finishReason).toBe("stop");
  });

  it("translates error", () => {
    const evt = translator.translate({ type: "error", error: "Something broke" }, ctx);
    expect(evt).not.toBeNull();
    expect(evt!.method).toBe("error");
    expect(evt!.params.recoverable).toBe(true);
  });

  it("returns null for unknown event type", () => {
    const evt = translator.translate({ type: "unknown-event" }, ctx);
    expect(evt).toBeNull();
  });

  it("toolOutput creates correct event", () => {
    const evt = translator.toolOutput(ctx, "tc_1", "file contents", false);
    expect(evt.method).toBe("turn.item.created");
    const item = evt.params.item as Record<string, unknown>;
    expect(item.type).toBe("tool_output");
    expect(item.output).toBe("file contents");
    expect(item.is_error).toBe(false);
  });

  it("approval creates correct event", () => {
    const evt = translator.approval(ctx, "req_1", "file_write", { path: "test.txt" });
    expect(evt.method).toBe("turn.request.created");
    expect(evt.params.requestType).toBe("approval");
    expect(evt.params.toolName).toBe("file_write");
  });

  it("error helper creates correct event", () => {
    const evt = translator.error(ctx, "rate_limited", "Too many requests", true);
    expect(evt.method).toBe("error");
    expect(evt.params.code).toBe("rate_limited");
    expect(evt.params.recoverable).toBe(true);
  });
});
