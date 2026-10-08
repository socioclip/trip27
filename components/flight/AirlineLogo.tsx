"use client";
import { useState } from "react";
import type { Carrier } from "@/lib/types";

export default function AirlineLogo({ carrier, size = 36 }: { carrier: Carrier; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-grid place-items-center rounded-lg bg-white border border-line overflow-hidden shrink-0" style={{ width: size, height: size }}>
      {!failed && carrier.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={carrier.logo} alt={carrier.name} width={size - 8} height={size - 8} className="object-contain" style={{ width: size - 8, height: size - 8 }} onError={() => setFailed(true)} loading="lazy" />
      ) : (
        <span className="text-[11px] font-extrabold text-brand-700">{carrier.code}</span>
      )}
    </span>
  );
}
