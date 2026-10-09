"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost !py-2 text-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(api("/api/auth/logout"), { method: "POST" }).catch(() => {});
        router.push("/");
        router.refresh();
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
