import type { ContentBlockParam, MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { NextResponse } from "next/server";
import { allow } from "@/lib/auth";
import { sameOrigin } from "@/lib/admin";
import { getFlags } from "@/lib/suppliers";
import { providerMode } from "@/lib/providers";
import { ProviderError } from "@/lib/types";
import { systemPrompt } from "@/lib/chat/prompt";
import { runTool, TOOLS, toolStatus, type ToolContext } from "@/lib/chat/tools";
import { callModel, chatProviders } from "@/lib/chat/llm";
import { MAX_USER_MESSAGE, type ChatEvent, type ChatRef, type ChatRequest } from "@/lib/chat/protocol";

// Chat assistant: an AI model (Groq, Gemini, Claude or a self-hosted one, with
// automatic fallback; see lib/chat/llm.ts) with trip27's own search tools. Stateless; the browser
// sends the conversation back each time. It never books or takes payment.

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const MAX_ROUNDS = 6; // model ↔ tools round trips per customer message
const MAX_HISTORY_MESSAGES = 30;
const MAX_HISTORY_CHARS = 60_000;

export async function GET() {
  const flags = await getFlags();
  return NextResponse.json({ enabled: flags.chat === true }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await getFlags()).chat || !chatProviders().length) return NextResponse.json({ error: "The chat assistant is switched off." }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  if (!allow(`chat:${ip}`, 25, 15 * 60_000))
    return NextResponse.json({ error: "You've sent a lot of messages. Please wait a few minutes, or use the search form." }, { status: 429 });

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const message = String(body?.message || "").trim();
  if (!message) return NextResponse.json({ error: "Type a message." }, { status: 400 });
  if (message.length > MAX_USER_MESSAGE) return NextResponse.json({ error: "That message is too long." }, { status: 400 });

  const history = compactOldResults(trimHistory(sanitizeHistory(body.history)));
  const refs = sanitizeRefs(body.refs);
  const messages: MessageParam[] = [...history, { role: "user", content: message }];
  const added: MessageParam[] = []; // what this turn adds after the user message
  const mode = await providerMode();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (e: ChatEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      const ctx: ToolContext = { refs, emit, searches: 0 };
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const last = round === MAX_ROUNDS - 1;
          const turn = await callModel({
            system: systemPrompt(mode),
            tools: TOOLS,
            messages: [...messages, ...added],
            allowTools: !last,
            onText: (delta) => emit({ type: "text", delta }),
            signal: req.signal,
          });
          if (turn.content.length) added.push({ role: "assistant", content: turn.content });
          if (!turn.wantsTools) break;

          const uses = turn.content.filter((b) => b.type === "tool_use");
          const results: ToolResultBlockParam[] = [];
          // Sequential: keeps refs ordered and supplier load predictable.
          for (const u of uses) {
            const input = (u.input || {}) as Record<string, unknown>;
            emit({ type: "status", text: toolStatus(u.name, input) });
            try {
              const out = await runTool(u.name, input, ctx);
              results.push({ type: "tool_result", tool_use_id: u.id, content: out });
            } catch (e) {
              const text = e instanceof ProviderError ? e.message : "The flight supplier didn't respond. Try again in a moment.";
              if (!(e instanceof ProviderError)) console.error("[chat] tool failed", u.name, e);
              results.push({ type: "tool_result", tool_use_id: u.id, content: text, is_error: true });
            }
          }
          added.push({ role: "user", content: results });
        }
        emit({ type: "refs", refs: ctx.refs });
        emit({ type: "done", messages: added });
      } catch (e) {
        if (!req.signal.aborted) {
          console.error("[chat] failed", e);
          const status = (e as { status?: number })?.status;
          if (status === 401 || status === 403) console.error(`[chat] an AI model API key was rejected (${status}). Check the keys in Vercel.`);
          emit({
            type: "error",
            message: status === 429 || status === 503 || status === 529 ? "The assistant is busy right now. Please try again in a minute." : "Sorry, something went wrong. Please try again.",
          });
        }
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

// ---- input hygiene ----------------------------------------------------------
// The history comes from the browser, so keep only the block types and fields
// this route itself produces. A customer can only tamper with their own chat.

function sanitizeBlock(b: unknown): ContentBlockParam | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  if (o.type === "text" && typeof o.text === "string" && o.text) return { type: "text", text: o.text.slice(0, 8000) };
  if (o.type === "tool_use" && typeof o.id === "string" && typeof o.name === "string")
    return {
      type: "tool_use",
      id: o.id,
      name: o.name,
      input: o.input && typeof o.input === "object" ? o.input : {},
      // Gemini's thought signature and whether the call ID came from Gemini (see lib/chat/llm.ts).
      ...(typeof o.signature === "string" && o.signature.length < 20_000 ? { signature: o.signature } : {}),
      ...(o.gid === true ? { gid: true } : {}),
      ...(o.src === "gemini" ? { src: "gemini" } : {}),
    } as ContentBlockParam;
  if (o.type === "tool_result" && typeof o.tool_use_id === "string") {
    const content = typeof o.content === "string" ? o.content.slice(0, 8000) : "";
    return { type: "tool_result", tool_use_id: o.tool_use_id, content, ...(o.is_error === true ? { is_error: true } : {}) };
  }
  return null;
}

function sanitizeHistory(raw: unknown): MessageParam[] {
  if (!Array.isArray(raw)) return [];
  const out: MessageParam[] = [];
  for (const m of raw.slice(-80)) {
    if (!m || typeof m !== "object") continue;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content === "string") {
      if (content.trim()) out.push({ role, content: content.slice(0, MAX_USER_MESSAGE * 2) });
      continue;
    }
    if (!Array.isArray(content)) continue;
    const blocks = content.map(sanitizeBlock).filter((b): b is ContentBlockParam => !!b);
    if (blocks.length) out.push({ role, content: blocks });
  }
  return out;
}

/** A conversation may only start at a customer's typed message (not a tool result). */
const startsCleanly = (m: MessageParam) =>
  m.role === "user" && (typeof m.content === "string" || m.content.every((b) => b.type === "text"));

function trimHistory(h: MessageParam[]): MessageParam[] {
  let list = h.slice(-MAX_HISTORY_MESSAGES);
  while (list.length && (!startsCleanly(list[0]) || JSON.stringify(list).length > MAX_HISTORY_CHARS)) list = list.slice(1);
  // The new message is a user turn, so the history must end with the assistant.
  while (list.length && list[list.length - 1].role !== "assistant") list = list.slice(0, -1);
  return list;
}

/**
 * Earlier turns' tool results (mostly search listings) are shortened, which
 * keeps every request small: free tiers limit tokens per minute, and the model
 * can always search again. The current turn's results are sent in full.
 */
const OLD_RESULT_CHARS = 1500;
function compactOldResults(h: MessageParam[]): MessageParam[] {
  return h.map((m) =>
    typeof m.content === "string" || m.role !== "user"
      ? m
      : {
          ...m,
          content: m.content.map((b) =>
            b.type === "tool_result" && typeof b.content === "string" && b.content.length > OLD_RESULT_CHARS
              ? { ...b, content: b.content.slice(0, OLD_RESULT_CHARS) + "\n… (older results shortened; search again for the full list)" }
              : b
          ),
        }
  );
}

function sanitizeRefs(raw: unknown): Record<string, ChatRef> {
  const out: Record<string, ChatRef> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(-200)) {
    if (!/^F\d{1,4}$/.test(k) || !v || typeof v !== "object") continue;
    const { id, qs } = v as { id?: unknown; qs?: unknown };
    if (typeof id === "string" && id.length < 20_000 && typeof qs === "string" && qs.length < 500) out[k] = { id, qs };
  }
  return out;
}
