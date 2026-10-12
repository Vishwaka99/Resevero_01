"use client";

import Link from "next/link";

import { Button, Toolbar } from "@/components/ui";
import type { BrowseResourcesView } from "@/lib/bff/views";

/**
 * A plain GET form: the filters become the query string, the BFF reads them,
 * and the result is a URL someone can paste into a message.
 */
export function ResourceFilters({ filters }: { filters: BrowseResourcesView["filters"] }) {
  return (
    <form action="/resources" method="get">
      <Toolbar>
        <label className="rv-inline" style={{ gap: "var(--space-2)" }}>
          <span style={{ font: "600 13px/18px var(--font-sans)" }}>Free on</span>
          <input className="rv-input" type="date" name="date" defaultValue={filters.dateISO} style={{ width: 160 }} aria-label="Date" />
          <input className="rv-input" type="time" name="from" defaultValue={filters.from} step={900} style={{ width: 120 }} aria-label="From" />
          <span aria-hidden="true" className="rv-muted">
            –
          </span>
          <input className="rv-input" type="time" name="to" defaultValue={filters.to} step={900} style={{ width: 120 }} aria-label="To" />
        </label>

        <label className="rv-inline" style={{ gap: "var(--space-2)" }}>
          <span className="rv-sr">Type</span>
          <select className="rv-select" name="type" defaultValue={filters.activeType} aria-label="Type">
            {filters.typeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </label>

        <label className="rv-inline" style={{ gap: "var(--space-2)" }}>
          <span className="rv-sr">Location</span>
          <select className="rv-select" name="location" defaultValue={filters.activeLocation} aria-label="Location">
            {filters.locationOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="rv-inline" style={{ gap: "var(--space-2)" }}>
          <span className="rv-sr">Capacity</span>
          <select className="rv-select" name="minCapacity" defaultValue={String(filters.minCapacity)} aria-label="Capacity">
            {filters.capacityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value ? `Seats ${option.label}` : "Any capacity"}
              </option>
            ))}
          </select>
        </label>

        {filters.amenityOptions.length ? (
          <label className="rv-inline" style={{ gap: "var(--space-2)" }}>
            <span className="rv-sr">Has</span>
            <select className="rv-select" name="amenity" defaultValue={filters.amenity} aria-label="Has">
              <option value="">Any features</option>
              {filters.amenityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="rv-inline" style={{ gap: "var(--space-2)" }}>
          <span className="rv-sr">Sort</span>
          <select className="rv-select" name="sort" defaultValue={filters.sort} aria-label="Sort">
            <option value="match">Best match</option>
            <option value="availability">Free first</option>
            <option value="capacity">Largest first</option>
            <option value="name">Name</option>
          </select>
        </label>

        {filters.query ? <input type="hidden" name="q" value={filters.query} /> : null}

        <div className="rv-inline rv-spacer">
          <Button type="submit" size="sm" icon="filter">
            Apply
          </Button>
          {filters.isFiltered ? (
            <Link href="/resources" className="rv-link">
              Clear filters
            </Link>
          ) : null}
        </div>
      </Toolbar>
    </form>
  );
}
