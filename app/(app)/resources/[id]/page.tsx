import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AvailabilityTimeline, Badge, Card, Gauge, Icon, LinkButton, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { buildResourceDetailView } from "@/lib/bff/views";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await requireUser();
  const { id } = await params;
  const view = await buildResourceDetailView(user, id, {});
  return { title: view?.resource.name ?? "Resource" };
}

export default async function ResourceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { week } = await searchParams;

  const view = await buildResourceDetailView(user, id, { week });
  if (!view) notFound();

  return (
    <div className="rv-page">
      <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "var(--ink-muted)" }}>
        {view.breadcrumbs.map((crumb, index) => (
          <span key={crumb.label}>
            {index > 0 ? <span aria-hidden="true"> / </span> : null}
            {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span>{crumb.label}</span>}
          </span>
        ))}
      </nav>

      <div className="rv-page-head">
        <div className="rv-inline" style={{ alignItems: "flex-start" }}>
          <Icon name={view.resource.icon} tile="solid" />
          <div>
            <div className="rv-inline">
              <h1 className="rv-page-title">{view.resource.name}</h1>
              <Badge status={view.resource.status}>{view.resource.statusLabel}</Badge>
            </div>
            <p className="rv-page-sub">
              {view.resource.typeName} · {view.resource.locationName}
              {view.resource.capacity > 1 ? ` · up to ${view.resource.capacity} people` : ""}
            </p>
          </div>
        </div>
        <div className="rv-page-actions">
          <LinkButton href={view.reserveHref} icon="calendar-plus">
            Reserve this {view.resource.typeName.toLowerCase()}
          </LinkButton>
        </div>
      </div>

      <div className="rv-grid rv-grid-sidebar">
        <div className="rv-stack">
          <Card title="About">
            <div className="rv-stack">
              <p style={{ margin: 0 }}>{view.resource.description}</p>

              <dl className="rv-dl">
                {view.rules.map((rule) => (
                  <div key={rule.label} style={{ display: "contents" }}>
                    <dt>{rule.label}</dt>
                    <dd>{rule.value}</dd>
                  </div>
                ))}
              </dl>

              {view.resource.amenities.length ? (
                <div className="rv-tags">
                  {view.resource.amenities.map((amenity) => (
                    <span key={amenity} className="rv-tag">
                      {amenity}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </Card>

          <Card
            title="Availability this week"
            meta={view.week.label}
            action={
              <span className="rv-inline">
                <Link href={view.week.previousHref} className="rv-link">
                  ← Previous
                </Link>
                <Link href={view.week.nextHref} className="rv-link">
                  Next →
                </Link>
              </span>
            }
          >
            <AvailabilityTimeline rows={view.week.rows} startHour={view.week.startHour} endHour={view.week.endHour} corner="Day" />
          </Card>

          <Card title="Free slots today" meta="Tap one to book it">
            <div className="rv-slots">
              {view.todaySlots.map((slot) =>
                slot.taken ? (
                  <button key={slot.label} type="button" className="rv-slot" disabled title="Already booked">
                    {slot.label.slice(0, 5)}
                  </button>
                ) : (
                  <a
                    key={slot.label}
                    href={slot.href}
                    className="rv-slot"
                    style={{ display: "grid", placeItems: "center", textDecoration: "none" }}
                  >
                    {slot.label.slice(0, 5)}
                  </a>
                ),
              )}
              {view.todaySlots.length === 0 ? <span className="rv-muted">Closed today.</span> : null}
            </div>
          </Card>
        </div>

        <div className="rv-stack">
          <Card title="Usage" meta="Last 30 days">
            <div className="rv-stack">
              <Gauge
                segments={[
                  { label: "Booked", value: view.usage.utilisationPercent },
                  { label: "Free", value: Math.max(0, 100 - view.usage.utilisationPercent), color: "chart-track" },
                ]}
                label="Booked"
                display={`${view.usage.utilisationPercent}%`}
                max={100}
              />
              <div className="rv-grid rv-grid-3" style={{ gap: "var(--space-4)" }}>
                <Stat label="Reservations" value={view.usage.reservations} />
                <Stat label="Busiest" value={view.usage.busiestHourLabel} />
                <Stat label="No-shows" value={view.usage.noShows} />
              </div>
            </div>
          </Card>

          <Card title="At a glance">
            <dl className="rv-dl">
              {view.specs.map((spec) => (
                <div key={spec.label} style={{ display: "contents" }}>
                  <dt>{spec.label}</dt>
                  <dd>{spec.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
