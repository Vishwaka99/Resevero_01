import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shell/AppShell";
import { CancelReservationButton } from "@/components/screens/ReservationActions";
import { ScheduleFilters } from "@/components/screens/ScheduleFilters";
import { AvailabilityTimeline, Badge, Card, EmptyState, Icon, LinkButton, SegmentedLinks } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { buildScheduleView } from "@/lib/bff/views";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; type?: string; location?: string; selected?: string; view?: "full" | "compact" }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const view = await buildScheduleView(user, query);

  return (
    <div className="rv-page">
      <PageHeader
        title="Schedule"
        subtitle={`${view.dateLabel}${view.isToday ? " · today" : ""}. Click an empty lane to start a reservation.`}
        actions={
          <>
            <div className="rv-segmented">
              <Link href={view.previousHref} aria-label="Previous day">
                <Icon name="chevron-left" />
              </Link>
              <Link href={view.todayHref} aria-current={view.isToday ? "true" : undefined}>
                Today
              </Link>
              <Link href={view.nextHref} aria-label="Next day">
                <Icon name="chevron-right" />
              </Link>
            </div>
            <LinkButton href="/reservations/new" icon="calendar-plus">
              New reservation
            </LinkButton>
          </>
        }
      />

      <ScheduleFilters
        dateISO={view.dateISO}
        typeOptions={view.typeOptions}
        activeType={view.activeType}
        locationOptions={view.locationOptions}
        activeLocation={view.activeLocation}
      />

      <div className={view.selected ? "rv-grid rv-grid-sidebar" : "rv-grid"}>
        <Card>
          {view.rows.length ? (
            <AvailabilityTimeline
              rows={view.rows}
              startHour={view.startHour}
              endHour={view.endHour}
              now={view.now}
              emptySlotHref={(row) => `/reservations/new?resourceId=${row.id}&date=${view.dateISO}`}
            />
          ) : (
            <EmptyState
              icon="filter"
              title="Nothing matches these filters"
              text={view.emptyMessage ?? undefined}
              action={
                <LinkButton href="/schedule" size="sm" variant="ghost">
                  Clear filters
                </LinkButton>
              }
            />
          )}
        </Card>

        {view.selected ? (
          <aside className="rv-drawer">
            <div className="rv-inline" style={{ justifyContent: "space-between" }}>
              <span className="rv-mono" style={{ fontSize: 13, color: "var(--ink-muted)" }}>
                {view.selected.code}
              </span>
              <Badge status={view.selected.badge}>{view.selected.badgeLabel}</Badge>
            </div>

            <div>
              <h2 style={{ margin: 0, font: "600 18px/26px var(--font-sans)" }}>{view.selected.title}</h2>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--ink-muted)" }}>
                <Link href={view.selected.resourceHref}>{view.selected.resourceName}</Link> · {view.selected.locationName}
              </p>
            </div>

            <dl className="rv-dl">
              <dt>When</dt>
              <dd className="rv-mono">
                {view.selected.day} {view.selected.timeRange}
              </dd>
              <dt>Booked by</dt>
              <dd>{view.selected.owner}</dd>
              <dt>Attendees</dt>
              <dd>{view.selected.attendees}</dd>
              {view.selected.repeatLabel ? (
                <>
                  <dt>Repeats</dt>
                  <dd>{view.selected.repeatLabel}</dd>
                </>
              ) : null}
              {view.selected.note ? (
                <>
                  <dt>Note</dt>
                  <dd>{view.selected.note}</dd>
                </>
              ) : null}
            </dl>

            {view.selected.canEdit || view.selected.canCancel ? (
              <div className="rv-inline">
                {view.selected.canEdit ? (
                  <LinkButton href={`/reservations/new?edit=${view.selected.id}`} variant="secondary" size="sm" icon="clock">
                    Edit
                  </LinkButton>
                ) : null}
                {view.selected.canCancel ? <CancelReservationButton id={view.selected.id} size="sm" /> : null}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "var(--ink-muted)" }}>
                This reservation belongs to {view.selected.owner.toLowerCase()}, so it is read-only for you.
              </p>
            )}

            <Link href={`/schedule?date=${view.dateISO}`} className="rv-link">
              Close
            </Link>
          </aside>
        ) : null}
      </div>

      {view.compactGroups?.length ? (
        <Card title="Slots">
          <div className="rv-stack">
            {view.compactGroups.map((group) => (
              <div key={group.resourceId} className="rv-stack-sm">
                <b style={{ fontSize: 14 }}>{group.resourceName}</b>
                <div className="rv-slots">
                  {group.slots.map((slot) => (
                    <a key={slot.label} href={slot.href} className="rv-slot" aria-disabled={slot.taken} style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>
                      {slot.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <SegmentedLinks
        items={[
          { id: "day", label: "Day", href: `/schedule?date=${view.dateISO}` },
          { id: "resources", label: "Browse resources", href: "/resources" },
        ]}
        current="day"
        label="View"
      />
    </div>
  );
}
