export default function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 select-none" aria-label="trip27">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill={light ? "#fff" : "#5a2fe0"} />
        <path d="M7 19.5 25 10l-4.2 13.3-4.6-4.1-3.2 3.3.3-4.8L7 19.5Z" fill={light ? "#5a2fe0" : "#fff"} />
        <path d="m13.3 17.7 7.5-6.2-4.6 7.7" fill="#ff6a33" />
      </svg>
      <span className={`text-[22px] font-extrabold tracking-tight ${light ? "text-white" : "text-ink"}`}>
        trip<span className="text-accent-500">27</span>
      </span>
    </span>
  );
}
