import "server-only";
import { createClient, parseConnectionString } from "@vercel/global-config";

// ---------------------------------------------------------------------------
// Supplier feature flags.
//
// Which flight suppliers answer searches is decided at runtime from Vercel
// Global Config, formerly Edge Config (key "suppliers"), edited on the admin
// page. Without it
// the flags fall back to which credentials are set, so the site still works.
//
// Credentials always stay in environment variables; the flags only switch
// suppliers on and off. A supplier with no credentials can't be switched on.
// ---------------------------------------------------------------------------

export type JinkoEnv = "sandbox" | "prod";
export type JinkoChoice = "off" | JinkoEnv;

export interface SupplierFlags {
  duffel: boolean;
  /** One Jinko environment at a time, so test and live fares never mix. */
  jinko: JinkoChoice;
  /** Apeirotrip fares, compare only (needs APEIRO_TOKEN). Missing in older saved flags = on. */
  apeiro?: boolean;
  /** The chat assistant on the site (needs ANTHROPIC_API_KEY). Missing in older saved flags = on. */
  chat?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

const KEY = "suppliers";
const TOKEN_KEY = "apeiroToken";
const env = (k: string) => (process.env[k] || "").trim();

// ---- credentials ------------------------------------------------------------

export function duffelToken() {
  return env("DUFFEL_ACCESS_TOKEN") || env("DUFFEL_AccessToken") || env("DUFFEL_TOKEN");
}

/**
 * The Jinko key for one environment. JINKO_API_KEY_SANDBOX / JINKO_API_KEY_PROD
 * are preferred; the older single JINKO_API_KEY counts for the environment
 * JINKO_ENV names (sandbox unless JINKO_ENV=production).
 */
export function jinkoKey(e: JinkoEnv): string {
  const specific = e === "prod" ? env("JINKO_API_KEY_PROD") : env("JINKO_API_KEY_SANDBOX");
  if (specific) return specific;
  const legacyEnv: JinkoEnv = ["production", "prod", "live"].includes(env("JINKO_ENV").toLowerCase()) ? "prod" : "sandbox";
  return legacyEnv === e ? env("JINKO_API_KEY") : "";
}

/**
 * Apeirotrip's token (the `token` header its site sends) from the environment.
 * This is the fallback; a token pasted on the admin page (stored in Global
 * Config) takes priority — see currentApeiroToken().
 */
export function apeiroEnvToken() {
  return env("APEIRO_TOKEN");
}

export function credentials() {
  const d = duffelToken();
  return {
    duffel: !!d,
    duffelMode: !d ? null : d.startsWith("duffel_live") ? ("live" as const) : ("test" as const),
    jinkoSandbox: !!jinkoKey("sandbox"),
    jinkoProd: !!jinkoKey("prod"),
    // "Has a token" means env OR a token pasted on the admin page.
    apeiro: !!apeiroEnvToken() || !!apeiroTokenCache.value,
    // The chat runs on Gemini or Claude (see lib/chat/llm.ts).
    chat: !!(env("GEMINI_API_KEY") || env("GOOGLE_API_KEY") || env("ANTHROPIC_API_KEY")),
  };
}

/** Live bookings (real tickets, real money) also need this env switch. */
export function liveBookingsSwitch() {
  return env("ALLOW_LIVE_BOOKINGS") === "true";
}

// ---- flags --------------------------------------------------------------------

/** What the site does when Global Config has no value: use what's configured, never Jinko production. */
export function defaultFlags(): SupplierFlags {
  const c = credentials();
  return { duffel: c.duffel, jinko: c.jinkoSandbox ? "sandbox" : "off", apeiro: c.apeiro, chat: c.chat };
}

function clean(v: unknown): SupplierFlags | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const jinko = o.jinko === "sandbox" || o.jinko === "prod" ? o.jinko : "off";
  return {
    duffel: o.duffel === true,
    jinko,
    apeiro: typeof o.apeiro === "boolean" ? o.apeiro : undefined,
    chat: typeof o.chat === "boolean" ? o.chat : undefined,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
    updatedBy: typeof o.updatedBy === "string" ? o.updatedBy : undefined,
  };
}

/** Removes anything that can't run: a supplier without credentials is off. */
export function effective(f: SupplierFlags): SupplierFlags {
  const c = credentials();
  const jinkoOk = f.jinko === "sandbox" ? c.jinkoSandbox : f.jinko === "prod" ? c.jinkoProd : true;
  return { ...f, duffel: f.duffel && c.duffel, jinko: jinkoOk ? f.jinko : "off", apeiro: (f.apeiro ?? true) && c.apeiro, chat: (f.chat ?? true) && c.chat };
}

/** Vercel now adds GLOBAL_CONFIG when a store is connected; older projects have EDGE_CONFIG. */
function connectionString() {
  return env("GLOBAL_CONFIG") || env("EDGE_CONFIG");
}

export function edgeConfigConnected() {
  return !!connectionString() && !!parseConnectionString(connectionString());
}

/** Vercel access token for writing the switches (VERCEL_API_KEY is accepted too). */
function vercelToken() {
  return env("VERCEL_API_TOKEN") || env("VERCEL_API_KEY");
}

export function edgeConfigWritable() {
  return edgeConfigConnected() && !!vercelToken();
}

// Short per-instance cache: Global Config reads are fast, but search calls this on every request.
const g = globalThis as unknown as { __t27Flags?: { at: number; value: SupplierFlags | null } };
const TTL_MS = 5000;

async function readStored(fresh = false): Promise<SupplierFlags | null> {
  if (!edgeConfigConnected()) return null;
  if (!fresh && g.__t27Flags && Date.now() - g.__t27Flags.at < TTL_MS) return g.__t27Flags.value;
  try {
    const client = createClient(connectionString());
    const value = clean(await client.get(KEY, fresh ? { consistentRead: true } : undefined));
    g.__t27Flags = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error("[suppliers] Global Config read failed; using last known or default flags", (e as Error).message);
    return g.__t27Flags?.value ?? null;
  }
}

/** The flags the site runs with right now. */
export async function getFlags(): Promise<SupplierFlags> {
  // Read the Apeirotrip token too so credentials() (used by effective) sees it.
  const [stored] = await Promise.all([readStored(), readApeiroToken()]);
  return effective(stored ?? defaultFlags());
}

/** For the admin page: what's stored (fresh read) and what's actually running. */
export async function getAdminState() {
  const [stored, apeiroToken] = await Promise.all([readStored(true), apeiroTokenState()]);
  const flags = stored ?? defaultFlags();
  return {
    stored: !!stored,
    flags,
    running: effective(flags),
    credentials: credentials(),
    edgeConfig: { connected: edgeConfigConnected(), writable: edgeConfigWritable() },
    liveBookings: liveBookingsSwitch(),
    apeiroToken,
  };
}

/** Upserts (or deletes) one Global Config key through the Vercel API. */
async function writeGlobalConfig(key: string, value: unknown): Promise<void> {
  const conn = parseConnectionString(connectionString());
  if (!conn || !vercelToken()) throw new Error("Global Config isn't connected for writing. Connect a store (GLOBAL_CONFIG) and set VERCEL_API_TOKEN.");
  const team = env("VERCEL_TEAM_ID");
  const api = (env("VERCEL_API_URL") || "https://api.vercel.com").replace(/\/$/, "");
  const url = `${api}/v1/edge-config/${encodeURIComponent(conn.id)}/items${team ? `?teamId=${encodeURIComponent(team)}` : ""}`;
  const operation = value === undefined ? "delete" : "upsert";
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${vercelToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ operation, key, ...(value === undefined ? {} : { value }) }] }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[suppliers] Global Config write failed", key, res.status, text.slice(0, 500));
    throw new Error(
      res.status === 401 || res.status === 403
        ? "Vercel rejected the token. Check VERCEL_API_TOKEN has access to this Global Config store (and VERCEL_TEAM_ID if the store belongs to a team)."
        : `Couldn't save to Global Config (${res.status}).`
    );
  }
}

/** Writes the flags to Global Config through the Vercel API. */
export async function saveFlags(next: SupplierFlags, by: string): Promise<SupplierFlags> {
  const value: SupplierFlags = { duffel: !!next.duffel, jinko: next.jinko, apeiro: next.apeiro !== false, chat: next.chat !== false, updatedAt: new Date().toISOString(), updatedBy: by };
  await writeGlobalConfig(KEY, value);
  g.__t27Flags = { at: Date.now(), value };
  return value;
}

// ---- Apeirotrip token (pasted on the admin page) ----------------------------
//
// Apeirotrip's search token expires every ~15 minutes, so it can't live in a
// Vercel env var. It's pasted on the admin page and stored in Global Config,
// where the provider reads it on each search. The env var APEIRO_TOKEN still
// works as a fallback when nothing is stored.

interface StoredToken {
  token: string;
  updatedAt: string;
  updatedBy?: string;
}

const apeiroTokenCache: { at: number; value: StoredToken | null } = { at: 0, value: null };

function cleanToken(v: unknown): StoredToken | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.token !== "string" || !o.token.trim()) return null;
  return { token: o.token, updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "", updatedBy: typeof o.updatedBy === "string" ? o.updatedBy : undefined };
}

/** The stored token (fresh read bypasses the short cache). */
export async function readApeiroToken(fresh = false): Promise<StoredToken | null> {
  if (!edgeConfigConnected()) return apeiroTokenCache.value;
  if (!fresh && apeiroTokenCache.at && Date.now() - apeiroTokenCache.at < TTL_MS) return apeiroTokenCache.value;
  try {
    const client = createClient(connectionString());
    const value = cleanToken(await client.get(TOKEN_KEY, fresh ? { consistentRead: true } : undefined));
    apeiroTokenCache.at = Date.now();
    apeiroTokenCache.value = value;
    return value;
  } catch (e) {
    console.error("[suppliers] Apeirotrip token read failed", (e as Error).message);
    return apeiroTokenCache.value;
  }
}

/** The token the Apeirotrip provider uses right now: the pasted one, else the env var. */
export async function currentApeiroToken(): Promise<string> {
  const stored = await readApeiroToken();
  return (stored?.token || "").trim() || apeiroEnvToken();
}

/** Where the active Apeirotrip token comes from, and when the stored one changed. */
export async function apeiroTokenState() {
  const stored = await readApeiroToken(true);
  return {
    source: stored ? ("stored" as const) : apeiroEnvToken() ? ("env" as const) : ("none" as const),
    updatedAt: stored?.updatedAt,
    updatedBy: stored?.updatedBy,
    envFallback: !!apeiroEnvToken(),
  };
}

/** Saves a pasted Apeirotrip token to Global Config. */
export async function saveApeiroToken(token: string, by: string): Promise<StoredToken> {
  const value: StoredToken = { token: token.trim(), updatedAt: new Date().toISOString(), updatedBy: by };
  await writeGlobalConfig(TOKEN_KEY, value);
  apeiroTokenCache.at = Date.now();
  apeiroTokenCache.value = value;
  return value;
}

/** Removes the pasted token, falling back to the env var (if any). */
export async function clearApeiroToken(): Promise<void> {
  await writeGlobalConfig(TOKEN_KEY, undefined);
  apeiroTokenCache.at = Date.now();
  apeiroTokenCache.value = null;
}

export type ApeiroTokenState = Awaited<ReturnType<typeof apeiroTokenState>>;
export type AdminState = Awaited<ReturnType<typeof getAdminState>>;
