/**
 * EventTranslator — Maps AI SDK streaming events to ProviderRuntimeEvent format.
 * The UI does not know which provider is active. All events use existing method names.
 */

export type RuntimeEvent = {
  readonly method: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly params: Record<string, unknown>;
};

type Context = {
  readonly threadId: string;
  readonly turnId: string;
};

function nextItem(): string {
  return `item_${crypto.randomUUID()}`;
}

/** Translate an AI SDK stream part into a ProviderRuntimeEvent. Returns null for unmapped types. */
export function translate(part: Record<string, unknown>, ctx: Context): RuntimeEvent | null {
  const type = part.type as string;

  switch (type) {
    case "text-delta":
      return {
        method: "turn.content-part.stream.delta",
        threadId: ctx.threadId,
        turnId: ctx.turnId,
        params: { contentType: "text", delta: part.textDelta },
      };

    case "text-done":
      return {
        method: "turn.content-part.stream.done",
        threadId: ctx.threadId,
        turnId: ctx.turnId,
        params: { contentType: "text", text: part.text },
      };

    case "tool-call":
      return {
        method: "turn.item.created",
        threadId: ctx.threadId,
        turnId: ctx.turnId,
        params: {
          item: {
            id: part.toolCallId ?? nextItem(),
            type: "tool_call",
            name: part.toolName,
            arguments: JSON.stringify(part.args),
            status: "in_progress",
          },
        },
      };

    case "tool-result":
      return {
        method: "turn.item.created",
        threadId: ctx.threadId,
        turnId: ctx.turnId,
        params: {
          item: {
            id: nextItem(),
            type: "tool_output",
            tool_call_id: part.toolCallId,
            output: typeof part.result === "string" ? part.result : JSON.stringify(part.result),
            is_error: false,
          },
        },
      };

    case "finish":
      return {
        method: "turn.completed",
        threadId: ctx.threadId,
        turnId: ctx.turnId,
        params: {
          finishReason: part.finishReason ?? "stop",
          usage: part.usage ?? {},
        },
      };

    case "error":
      return {
        method: "error",
        threadId: ctx.threadId,
        turnId: ctx.turnId,
        params: {
          code: "service_error",
          message: String(part.error ?? "Unknown error"),
          recoverable: true,
        },
      };

    default:
      // Unknown event type — silently ignore (per SPEC §7.1)
      return null;
  }
}

/** Create a tool-output event for tool execution results. */
export function toolOutput(ctx: Context, callId: string, output: string, error: boolean): RuntimeEvent {
  return {
    method: "turn.item.created",
    threadId: ctx.threadId,
    turnId: ctx.turnId,
    params: {
      item: {
        id: nextItem(),
        type: "tool_output",
        tool_call_id: callId,
        output,
        is_error: error,
      },
    },
  };
}

/** Create an approval request event. */
export function approval(ctx: Context, requestId: string, name: string, args: unknown): RuntimeEvent {
  return {
    method: "turn.request.created",
    threadId: ctx.threadId,
    turnId: ctx.turnId,
    params: {
      requestId,
      requestType: "approval",
      toolName: name,
      args,
    },
  };
}

/** Create an error event from an exception. */
export function error(ctx: Context, code: string, msg: string, recoverable: boolean): RuntimeEvent {
  return {
    method: "error",
    threadId: ctx.threadId,
    turnId: ctx.turnId,
    params: { code, message: msg, recoverable },
  };
}
