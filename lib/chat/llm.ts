import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";

// ---------------------------------------------------------------------------
// The chat's model, behind one small interface. Several providers can be set
// up at once; each message tries them in order and falls back to the next one
// when a provider is rate-limited, down or misconfigured:
//
//   groq      Groq (fast, free tier)                         GROQ_API_KEY
//   local     any OpenAI-compatible server, e.g. Ollama      LLM_BASE_URL (+ LLM_MODEL)
//   gemini    Google Gemini (free tier)                      GEMINI_API_KEY
//   anthropic Claude                                         ANTHROPIC_API_KEY
//
// CHAT_PROVIDER sets the order (e.g. "groq,gemini"); empty = every provider
// with a key, in the order above.
//
// The conversation is always kept in Claude's message format (text, tool_use,
// tool_result blocks) and converted for each provider on every call. Gemini's
// thought signatures ride along on its tool_use blocks as `signature`.
// ---------------------------------------------------------------------------

export type ChatProvider = "groq" | "local" | "gemini" | "anthropic";
const ORDER: ChatProvider[] = ["groq", "local", "gemini", "anthropic"];

export interface ModelTurn {
  content: ContentBlockParam[]; // text and tool_use blocks
  wantsTools: boolean;
  provider: ChatProvider;
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
const groqKey = () => env("GROQ_API_KEY");
const localUrl = () => env("LLM_BASE_URL").replace(/\/$/, "");

function configured(p: ChatProvider) {
  if (p === "groq") return !!groqKey();
  if (p === "local") return !!localUrl() && !!env("LLM_MODEL");
  if (p === "gemini") return !!geminiKey();
  return !!anthropicKey();
}

const ALIASES: Record<string, ChatProvider> = {
  groq: "groq",
  local: "local",
  ollama: "local",
  openai: "local",
  gemini: "gemini",
  google: "gemini",
  anthropic: "anthropic",
  claude: "anthropic",
};

/** Providers to try, in order (only those with credentials). */
export function chatProviders(): ChatProvider[] {
  const listed = env("CHAT_PROVIDER")
    .toLowerCase()
    .split(/[\s,>]+/)
    .map((x) => ALIASES[x])
    .filter(Boolean);
  const order = listed.length ? [...new Set(listed)] : ORDER;
  return order.filter(configured);
}

export function chatModel(p: ChatProvider) {
  const m = env("CHAT_MODEL");
  if (p === "groq") return env("GROQ_MODEL") || "openai/gpt-oss-120b";
  if (p === "local") return env("LLM_MODEL");
  // CHAT_MODEL (older setting) only applies to the provider it names.
  if (p === "gemini") return env("GEMINI_MODEL") || (m.startsWith("gemini") ? m : "gemini-3.8-flash");
  return env("ANTHROPIC_MODEL") || (m.startsWith("claude") ? m : "claude-sonnet-5-5");
}

export class ModelError extends Error {
  status: number;
  retryAfter: number | null;
  constructor(message: string, status: number, retryAfter: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// ---- fallback ---------------------------------------------------------------

// Providers that just failed are skipped for a while (per server instance), so
// a rate-limited provider doesn't add a failed round trip to every message.
const g = globalThis as unknown as { __t27Cool?: Map<ChatProvider, number> };
const COOL: Map<ChatProvider, number> = (g.__t27Cool ??= new Map());

function coolDownFor(e: unknown): number {
  const status = (e as { status?: number })?.status ?? 0;
  const msg = String((e as Error)?.message || "");
  const retryAfter = e instanceof ModelError ? e.retryAfter : null;
  if (status === 429) {
    if (/per day|daily|RPD|TPD|quota/i.test(msg)) return 10 * 60_000;
    return Math.min(Math.max((retryAfter ?? 20) * 1000, 5_000), 10 * 60_000);
  }
  if (status === 401 || status === 403) return 10 * 60_000;
  if (status === 400) return 0; // a bad request is about this message, not the provider
  return 30_000; // 5xx, network errors, timeouts
}

/** Calls the first available provider, falling back to the next on failure. */
export async function callModel(call: ModelCall): Promise<ModelTurn> {
  const all = chatProviders();
  if (!all.length) throw new ModelError("No chat model is configured.", 503);
  const now = Date.now();
  const ready = all.filter((p) => (COOL.get(p) ?? 0) <= now);
  // If every provider is cooling down, try them all anyway rather than fail outright.
  const queue = ready.length ? ready : all;

  let lastError: unknown = null;
  for (const p of queue) {
    let streamed = false;
    const onText = (d: string) => {
      streamed = true;
      call.onText(d);
    };
    try {
      const turn = await callOne(p, { ...call, onText });
      COOL.delete(p);
      return turn;
    } catch (e) {
      if (call.signal.aborted) throw e;
      lastError = e;
      const wait = coolDownFor(e);
      if (wait) COOL.set(p, Date.now() + wait);
      console.warn(`[chat] ${p} failed (${(e as { status?: number })?.status ?? "network"}); ${streamed ? "reply already started, not falling back" : "trying the next provider"}`, String((e as Error)?.message || e).slice(0, 400));
      // Text already shown to the customer can't be taken back, so stop here.
      if (streamed) throw e;
    }
  }
  throw lastError;
}

function callOne(p: ChatProvider, call: ModelCall): Promise<ModelTurn> {
  if (p === "groq") return callOpenAICompatible(p, call);
  if (p === "local") return callOpenAICompatible(p, call);
  if (p === "gemini") return callGemini(call);
  return callAnthropic(call);
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
  return { content, wantsTools: msg.stop_reason === "tool_use", provider: "anthropic" };
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
type ToolUseX = { type: "tool_use"; id: string; name: string; input: unknown; signature?: string; gid?: boolean; src?: string };

/**
 * Claude-format history → Gemini contents. Tool calls Gemini made itself go back
 * as function calls (with their thought signatures). Calls another provider made
 * (after a fallback) have no signature, which Gemini 3 rejects, so those are
 * replayed as plain text instead.
 */
function toGemini(messages: MessageParam[]): GContent[] {
  const calls = new Map<string, { name: string; gid: boolean; native: boolean }>();
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
          const native = u.src === "gemini" || !!u.signature;
          calls.set(u.id, { name: u.name, gid: !!u.gid, native });
          if (native)
            parts.push({
              functionCall: { ...(u.gid ? { id: u.id } : {}), name: u.name, args: (u.input || {}) as Record<string, unknown> },
              ...(u.signature ? { thoughtSignature: u.signature } : {}),
            });
          else parts.push({ text: `[Called ${u.name} with ${JSON.stringify(u.input || {})}]` });
        } else if (b.type === "tool_result") {
          const call = calls.get(b.tool_use_id);
          if (!call) continue;
          const text = typeof b.content === "string" ? b.content : "";
          if (call.native)
            parts.push({
              functionResponse: { ...(call.gid ? { id: b.tool_use_id } : {}), name: call.name, response: b.is_error ? { error: text } : { result: text } },
            });
          else parts.push({ text: `[${call.name} ${b.is_error ? "error" : "result"}]\n${text}` });
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

// Gemini 3 thinks at "medium" by default, which made chat replies take 30-45 s.
// Flight search needs little reasoning, so ask for "low" (CHAT_THINKING overrides;
// "default" sends nothing). If the API rejects the setting, retry once without it.
let thinkingRejected = false;
function thinkingConfig() {
  const level = (env("CHAT_THINKING") || "low").toLowerCase();
  if (thinkingRejected || level === "default") return undefined;
  return { thinkingLevel: level };
}

async function callGemini(call: ModelCall): Promise<ModelTurn> {
  try {
    return await callGeminiOnce(call, thinkingConfig());
  } catch (e) {
    if (e instanceof ModelError && e.status === 400 && /thinking/i.test(e.message) && !thinkingRejected) {
      console.warn("[chat] Gemini rejected thinkingConfig; continuing without it", e.message.slice(0, 300));
      thinkingRejected = true;
      return callGeminiOnce(call, undefined);
    }
    throw e;
  }
}

async function callGeminiOnce(call: ModelCall, thinking: Record<string, unknown> | undefined): Promise<ModelTurn> {
  const model = chatModel("gemini");
  const signal = AbortSignal.any([call.signal, AbortSignal.timeout(75_000)]);
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
      generationConfig: { maxOutputTokens: 2048, temperature: 0.4, ...(thinking ? { thinkingConfig: thinking } : {}) },
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new ModelError(`Gemini ${res.status}: ${text.slice(0, 800)}`, res.status, retryAfterSecs(res));
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
            src: "gemini",
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
  return { content, wantsTools: content.some((b) => b.type === "tool_use"), provider: "gemini" };
}

function retryAfterSecs(res: Response): number | null {
  const v = Number(res.headers.get("retry-after"));
  return Number.isFinite(v) && v > 0 ? v : null;
}

// ---- Groq and other OpenAI-compatible servers (Ollama, LM Studio, vLLM…) ----

type OAIToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type OAIMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

function toOpenAI(system: string, messages: MessageParam[]): OAIMessage[] {
  const out: OAIMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push(m.role === "assistant" ? { role: "assistant", content: m.content } : { role: "user", content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const text = m.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n\n");
      const calls: OAIToolCall[] = m.content
        .filter((b) => b.type === "tool_use")
        .map((b) => {
          const u = b as unknown as ToolUseX;
          return { id: u.id, type: "function", function: { name: u.name, arguments: JSON.stringify(u.input || {}) } };
        });
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      // Tool results must directly follow the assistant message that asked for them.
      for (const b of m.content)
        if (b.type === "tool_result") {
          const text = typeof b.content === "string" ? b.content : "";
          out.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.is_error ? `Error: ${text}` : text });
        }
      const text = m.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n\n");
      if (text) out.push({ role: "user", content: text });
    }
  }
  return out;
}

let oaiSeq = 0;

async function callOpenAICompatible(p: "groq" | "local", call: ModelCall, retried = false): Promise<ModelTurn> {
  const model = chatModel(p);
  const base = p === "groq" ? (env("GROQ_API_URL") || "https://api.groq.com/openai/v1").replace(/\/$/, "") : localUrl();
  const key = p === "groq" ? groqKey() : env("LLM_API_KEY");
  const extra: Record<string, unknown> = {};
  if (p === "groq") {
    // Keep reasoning short: replies come back in a few seconds instead of tens.
    if (model.includes("gpt-oss")) Object.assign(extra, { reasoning_effort: env("GROQ_REASONING") || "low", include_reasoning: false });
    else if (model.includes("qwen")) Object.assign(extra, { reasoning_effort: env("GROQ_REASONING") || "none", reasoning_format: "hidden" });
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({
      model,
      messages: toOpenAI(call.system, call.messages),
      tools: call.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })),
      tool_choice: call.allowTools ? "auto" : "none",
      temperature: 0.4,
      max_tokens: 1500,
      ...extra,
    }),
    // A computer at home may be asleep; don't make the customer wait long for it.
    signal: AbortSignal.any([call.signal, AbortSignal.timeout(p === "local" ? 40_000 : 45_000)]),
  });
  const raw = await res.text();
  if (!res.ok) {
    // Groq: the model wrote a malformed tool call. One retry usually fixes it.
    if (res.status === 400 && /tool_use_failed|failed to call a function/i.test(raw) && !retried) return callOpenAICompatible(p, call, true);
    throw new ModelError(`${p} ${res.status}: ${raw.slice(0, 800)}`, res.status, retryAfterSecs(res));
  }
  const j = JSON.parse(raw);
  const msg = j.choices?.[0]?.message || {};
  const content: ContentBlockParam[] = [];
  // Some local models put their reasoning inline in <think> tags.
  const text = String(msg.content || "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
  if (text) {
    content.push({ type: "text", text });
    call.onText(text);
  }
  for (const tc of (msg.tool_calls || []) as OAIToolCall[]) {
    let input: unknown = {};
    try {
      input = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
    } catch {
      input = {};
    }
    content.push({ type: "tool_use", id: tc.id || `oa_${Date.now().toString(36)}_${++oaiSeq}`, name: tc.function?.name, input } as ContentBlockParam);
  }
  if (!content.length) throw new ModelError(`${p} returned an empty reply`, 502);
  return { content, wantsTools: content.some((b) => b.type === "tool_use"), provider: p };
}
