"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function MyReservationsFilters({
  typeOptions,
  activeType,
  windowOptions,
  activeWindow,
}: {
  typeOptions: Array<{ id: string; label: string }>;
  activeType: string;
  windowOptions: Array<{ id: string; label: string }>;
  activeWindow: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const go = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== fallback) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    const search = next.toString();
    router.push(search ? `/reservations?${search}` : "/reservations");
  };

  return (
    <div className="rv-inline">
      <label>
        <span className="rv-sr">Resource type</span>
        <select className="rv-select" value={activeType} onChange={(event) => go("type", event.target.value, "all")}>
          {typeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="rv-sr">Time window</span>
        <select className="rv-select" value={activeWindow} onChange={(event) => go("window", event.target.value, "30d")}>
          {windowOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
