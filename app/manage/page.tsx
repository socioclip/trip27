"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ManagePage() {
  const router = useRouter();
  const [id, setId] = useState("");
  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      <div className="card p-6">
        <h1 className="text-2xl font-extrabold">Find your booking</h1>
        <p className="text-sm text-muted mt-1">Enter the order number from your confirmation email.</p>
        <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); if (id.trim()) router.push(`/booking/${encodeURIComponent(id.trim())}`); }}>
          <input className="field" placeholder="e.g. ord_0000A3tQSmKyqOrcySrGbo" value={id} onChange={(e) => setId(e.target.value)} aria-label="Order number" />
          <button className="btn-primary w-full" type="submit">Find booking</button>
        </form>
      </div>
    </div>
  );
}
