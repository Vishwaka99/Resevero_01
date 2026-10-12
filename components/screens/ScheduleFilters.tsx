"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { SegmentedLinks, Toolbar } from "@/components/ui";

/**
 * Filters write to the URL rather than to local state, so a filtered day is
 * shareable, survives a reload and is what the BFF reads on the next request.
 */
export function ScheduleFilters({
  dateISO,
  typeOptions,
  activeType,
  locationOptions,
  activeLocation,
}: {
  dateISO: string;
  typeOptions: Array<{ id: string; label: string; count: number; href: string }>;
  activeType: string;
  locationOptions: Array<{ id: string; label: string }>;
  activeLocation: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const go = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    next.delete("selected");
    router.push(`/schedule?${next.toString()}`);
  };

  return (
    <Toolbar>
      <label className="rv-field" style={{ minWidth: 0 }}>
        <span className="rv-sr">Date</span>
        <input className="rv-input" type="date" value={dateISO} onChange={(event) => go("date", event.target.value)} aria-label="Date" />
      </label>

      <SegmentedLinks items={typeOptions.map((option) => ({ ...option }))} current={activeType} label="Resource type" />

      <label className="rv-inline" style={{ gap: "var(--space-2)" }}>
        <span style={{ font: "600 13px/18px var(--font-sans)" }}>Location</span>
        <select className="rv-select" value={activeLocation} onChange={(event) => go("location", event.target.value)}>
          {locationOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <span className="rv-spacer rv-muted" style={{ fontSize: 13 }}>
        Click an empty lane to start a reservation
      </span>
    </Toolbar>
  );
}
