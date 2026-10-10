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
  updatedAt?: string;
  updatedBy?: string;
}

const KEY = "suppliers";
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

export function credentials() {
  const d = duffelToken();
  return {
    duffel: !!d,
    duffelMode: !d ? null : d.startsWith("duffel_live") ? ("live" as const) : ("test" as const),
    jinkoSandbox: !!jinkoKey("sandbox"),
    jinkoProd: !!jinkoKey("prod"),
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
  return { duffel: c.duffel, jinko: c.jinkoSandbox ? "sandbox" : "off" };
}

function clean(v: unknown): SupplierFlags | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const jinko = o.jinko === "sandbox" || o.jinko === "prod" ? o.jinko : "off";
  return {
    duffel: o.duffel === true,
    jinko,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
    updatedBy: typeof o.updatedBy === "string" ? o.updatedBy : undefined,
  };
}

/** Removes anything that can't run: a supplier without credentials is off. */
export function effective(f: SupplierFlags): SupplierFlags {
  const c = credentials();
  const jinkoOk = f.jinko === "sandbox" ? c.jinkoSandbox : f.jinko === "prod" ? c.jinkoProd : true;
  return { ...f, duffel: f.duffel && c.duffel, jinko: jinkoOk ? f.jinko : "off" };
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
  return effective((await readStored()) ?? defaultFlags());
}

/** For the admin page: what's stored (fresh read) and what's actually running. */
export async function getAdminState() {
  const stored = await readStored(true);
  const flags = stored ?? defaultFlags();
  return {
    stored: !!stored,
    flags,
    running: effective(flags),
    credentials: credentials(),
    edgeConfig: { connected: edgeConfigConnected(), writable: edgeConfigWritable() },
    liveBookings: liveBookingsSwitch(),
  };
}

/** Writes the flags to Global Config through the Vercel API. */
export async function saveFlags(next: SupplierFlags, by: string): Promise<SupplierFlags> {
  const conn = parseConnectionString(connectionString());
  if (!conn || !vercelToken()) throw new Error("Global Config isn't connected for writing. Connect a store (GLOBAL_CONFIG) and set VERCEL_API_TOKEN.");
  const value: SupplierFlags = { duffel: !!next.duffel, jinko: next.jinko, updatedAt: new Date().toISOString(), updatedBy: by };
  const team = env("VERCEL_TEAM_ID");
  const api = (env("VERCEL_API_URL") || "https://api.vercel.com").replace(/\/$/, "");
  const url = `${api}/v1/edge-config/${encodeURIComponent(conn.id)}/items${team ? `?teamId=${encodeURIComponent(team)}` : ""}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${vercelToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ operation: "upsert", key: KEY, value }] }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[suppliers] Global Config write failed", res.status, text.slice(0, 500));
    throw new Error(
      res.status === 401 || res.status === 403
        ? "Vercel rejected the token. Check VERCEL_API_TOKEN has access to this Global Config store (and VERCEL_TEAM_ID if the store belongs to a team)."
        : `Couldn't save to Global Config (${res.status}).`
    );
  }
  g.__t27Flags = { at: Date.now(), value };
  return value;
}

export type AdminState = Awaited<ReturnType<typeof getAdminState>>;
