import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";

// ---------------------------------------------------------------------------
// The chat's model, behind one small interface so the site can run on Gemini
// (free tier, to start) or Claude, switched with CHAT_PROVIDER.
//
// The conversation is always kept in Claude's message format (text, tool_use,
// tool_result blocks); the Gemini adapter converts it on every call. Gemini's
// thought signatures ride along on tool_use blocks as `signature`, because
// Gemini requires them back with its function calls.
// ---------------------------------------------------------------------------

export type ChatProvider = "gemini" | "anthropic";

export interface ModelTurn {
  content: ContentBlockParam[]; // text and tool_use blocks
  wantsTools: boolean;
}

export interface ModelCall {
  system: string;
  tools: Tool[];
  messages: MessageParam[];
  allowTools: boolean;
  onText: (delta: string) => void;
  signal: AbortSignal;
}

const env = (k: string) => (process.env[k] || "").trim().replace(/^["']|["']$/g, "");
const anthropicKey = () => env("ANTHROPIC_API_KEY");
const geminiKey = () => env("GEMINI_API_KEY") || env("GOOGLE_API_KEY");

/** CHAT_PROVIDER wins; otherwise whichever key is set (Gemini first, as the free option). */
export function chatProvider(): ChatProvider | null {
  const p = env("CHAT_PROVIDER").toLowerCase();
  if (p === "gemini" || p === "google") return geminiKey() ? "gemini" : null;
  if (p === "anthropic" || p === "claude") return anthropicKey() ? "anthropic" : null;
  if (geminiKey()) return "gemini";
  if (anthropicKey()) return "anthropic";
  return null;
}

export function chatModel(p: ChatProvider) {
  const m = env("CHAT_MODEL");
  // A model name for the other provider is ignored, so switching provider never breaks the chat.
  if (p === "gemini") return m.startsWith("gemini") ? m : "gemini-3.8-flash";
  return m.startsWith("claude") ? m : "claude-sonnet-5-5";
}

export class ModelError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function callModel(p: ChatProvider, call: ModelCall): Promise<ModelTurn> {
  return p === "gemini" ? callGemini(call) : callAnthropic(call);
}

// ---- Claude -----------------------------------------------------------------

/** Our Gemini-only extras must not reach Claude. */
function forClaude(messages: MessageParam[]): MessageParam[] {
  return messages.map((m) =>
    typeof m.content === "string"
      ? m
      : { ...m, content: m.content.map((b) => (b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: b.input } : b)) as ContentBlockParam[] }
  );
}

async function callAnthropic(call: ModelCall): Promise<ModelTurn> {
  const client = new Anthropic({ apiKey: anthropicKey() });
  const s = client.messages.stream(
    {
      model: chatModel("anthropic"),
      max_tokens: 1200,
      system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
      tools: call.tools,
      tool_choice: call.allowTools ? { type: "auto" } : { type: "none" },
      messages: forClaude(call.messages),
    },
    { signal: call.signal }
  );
  s.on("text", call.onText);
  const msg = await s.finalMessage();
  const content = msg.content.filter((b) => b.type === "text" || b.type === "tool_use") as ContentBlockParam[];
  return { content, wantsTools: msg.stop_reason === "tool_use" };
}

// ---- Gemini -----------------------------------------------------------------

type GPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
};
type GContent = { role: "user" | "model"; parts: GPart[] };
type ToolUseX = { type: "tool_use"; id: string; name: string; input: unknown; signature?: string; gid?: boolean };

/** Claude-format history → Gemini contents. */
function toGemini(messages: MessageParam[]): GContent[] {
  const names = new Map<string, { name: string; gid: boolean }>();
  const out: GContent[] = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const parts: GPart[] = [];
    if (typeof m.content === "string") parts.push({ text: m.content });
    else
      for (const b of m.content) {
        if (b.type === "text") parts.push({ text: b.text });
        else if (b.type === "tool_use") {
          const u = b as unknown as ToolUseX;
          names.set(u.id, { name: u.name, gid: !!u.gid });
          parts.push({
            functionCall: { ...(u.gid ? { id: u.id } : {}), name: u.name, args: (u.input || {}) as Record<string, unknown> },
            ...(u.signature ? { thoughtSignature: u.signature } : {}),
          });
        } else if (b.type === "tool_result") {
          const call = names.get(b.tool_use_id);
          if (!call) continue;
          const text = typeof b.content === "string" ? b.content : "";
          parts.push({
            functionResponse: { ...(call.gid ? { id: b.tool_use_id } : {}), name: call.name, response: b.is_error ? { error: text } : { result: text } },
          });
        }
      }
    if (parts.length) out.push({ role, parts });
  }
  return out;
}

/** Gemini takes a JSON Schema per function; drop Claude-only fields. */
function geminiTools(tools: Tool[]) {
  return [
    {
      functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema })),
    },
  ];
}

let callSeq = 0;

async function callGemini(call: ModelCall): Promise<ModelTurn> {
  const model = chatModel("gemini");
  const base = (env("GEMINI_API_URL") || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: call.system }] },
      contents: toGemini(call.messages),
      tools: geminiTools(call.tools),
      toolConfig: { functionCallingConfig: { mode: call.allowTools ? "AUTO" : "NONE" } },
      generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
    }),
    signal: call.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new ModelError(`Gemini ${res.status}: ${text.slice(0, 800)}`, res.status);
  }

  const content: ContentBlockParam[] = [];
  let text = "";
  const flush = () => {
    if (text) content.push({ type: "text", text });
    text = "";
  };
  let blocked = "";

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const events = buf.split(/\r?\n\r?\n/);
    buf = events.pop() || "";
    for (const ev of events) {
      const data = ev
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data) continue;
      const chunk = JSON.parse(data);
      if (chunk.promptFeedback?.blockReason) blocked = chunk.promptFeedback.blockReason;
      const cand = chunk.candidates?.[0];
      for (const part of (cand?.content?.parts || []) as GPart[]) {
        if (part.thought) continue;
        if (part.functionCall) {
          flush();
          const gid = !!part.functionCall.id;
          const block: ToolUseX = {
            type: "tool_use",
            id: part.functionCall.id || `gm_${Date.now().toString(36)}_${++callSeq}`,
            name: part.functionCall.name,
            input: part.functionCall.args || {},
            ...(part.thoughtSignature ? { signature: part.thoughtSignature } : {}),
            ...(gid ? { gid } : {}),
          };
          content.push(block as unknown as ContentBlockParam);
        } else if (typeof part.text === "string" && part.text) {
          text += part.text;
          call.onText(part.text);
        }
      }
    }
  }
  flush();
  if (!content.length && blocked) throw new ModelError(`Gemini blocked the prompt: ${blocked}`, 400);
  return { content, wantsTools: content.some((b) => b.type === "tool_use") };
}
