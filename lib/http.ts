import "server-only";
import { NextResponse } from "next/server";
import { ProviderError } from "./types";

export function fail(e: unknown) {
  if (e instanceof ProviderError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
