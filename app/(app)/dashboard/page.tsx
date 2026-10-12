import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shell/AppShell";
import { CheckInButton } from "@/components/screens/ReservationActions";
import { AvailabilityTimeline, Avatar, Badge, Card, EmptyState, Gauge, Icon, LinkButton, SegmentedLinks } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { buildDashboardView } from "@/lib/bff/views";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requireUser();
  const { type } = await searchParams;
  const view = await buildDashboardView(user, { type });

  return (
    <div className="rv-page">
      <PageHeader
        title={`${view.greeting}!`}
        subtitle={view.subtitle}
        actions={
          <>
            <LinkButton href="/schedule" variant="secondary" icon="timeline">
              Open schedule
            </LinkButton>
            <LinkButton href="/reservations/new" icon="calendar-plus">
              New reservation
            </LinkButton>
          </>
        }
      />

      <div className="rv-grid rv-grid-auto">
        {/* Up next — the one thing the user most likely came for. */}
        <Card title="Up next" meta={view.upNext ? undefined : "Nothing booked"}>
          {view.upNext ? (
            <div className="rv-stack">
              <div className="rv-inline" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 18, lineHeight: "26px", fontWeight: 600 }}>{view.upNext.title}</div>
                  <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>
                    {view.upNext.resourceName} · {view.upNext.locationName} · {view.upNext.attendees} attending
                  </div>
                </div>
                <Badge status={view.upNext.badge}>{view.upNext.badgeLabel}</Badge>
              </div>

              <div className="rv-inline">
                <span style={{ padding: "10px 14px", borderRadius: 10, background: "var(--surface-sunken)", font: "500 16px/20px var(--font-mono)" }}>
                  {view.upNext.timeRange}
                </span>
                <span style={{ fontSize: 13, color: "var(--ink-muted)" }}>
                  {view.upNext.day} · starts {view.upNext.startsIn}
                </span>
              </div>

              {view.upNext.checkedIn ? (
                <Badge status="confirmed">Checked in</Badge>
              ) : view.upNext.canCheckIn ? (
                <CheckInButton id={view.upNext.id} block />
              ) : null}

              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                Check in opens at {view.upNext.checkInOpensAt}. Unclaimed rooms are released 15 min after the start.
              </span>
            </div>
          ) : (
            <EmptyState
              icon="calendar-plus"
              title="Nothing booked"
              text="Rooms, equipment and vehicles you reserve will show up here."
              action={<LinkButton href="/resources" size="sm" variant="ghost">Browse resources</LinkButton>}
            />
          )}
        </Card>

        <Card title="My reservations" meta="This month">
          <Gauge segments={view.gauges.mine.segments} label="Total" />
        </Card>

        <Card title="Utilisation today" meta={view.gauges.utilisation.windowLabel}>
          <Gauge segments={view.gauges.utilisation.segments} label="Booked" display={view.gauges.utilisation.display} />
        </Card>
      </div>

      {/* Today at a glance — availability drawn, not listed. */}
      <Card
        title="Today at a glance"
        action={
          <Link href="/schedule" className="rv-link">
            Full schedule →
          </Link>
        }
      >
        <div className="rv-stack">
          <SegmentedLinks
            items={view.timeline.typeTabs.map((tab) => ({ id: tab.id, label: tab.label, href: tab.href, count: tab.count }))}
            current={view.timeline.activeType}
            label="Resource type"
          />
          {view.timeline.rows.length ? (
            <AvailabilityTimeline
              rows={view.timeline.rows}
              startHour={view.timeline.startHour}
              endHour={view.timeline.endHour}
              now={view.timeline.now}
              emptySlotHref={(row) => `/reservations/new?resourceId=${row.id}`}
            />
          ) : (
            <EmptyState icon="timeline" title="Nothing to show" text="No resources of this type are bookable today." />
          )}
        </div>
      </Card>

      <div className="rv-grid rv-grid-auto">
        <Card
          title="Free right now"
          action={
            <Link href="/resources" className="rv-link">
              View all
            </Link>
          }
        >
          {view.freeNow.length ? (
            <div>
              {view.freeNow.map((item, index) => (
                <div
                  key={item.id}
                  className="rv-inline"
                  style={{ padding: "8px 0", borderBottom: index === view.freeNow.length - 1 ? undefined : "1px solid var(--border)" }}
                >
                  <Icon name={item.icon} tile />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 14 }}>{item.name}</b>
                    <br />
                    <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>{item.meta}</span>
                  </span>
                  <LinkButton href={item.reserveHref} variant="ghost" size="sm">
                    Reserve
                  </LinkButton>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="clock" title="Everything is busy" text="Nothing is free at this moment. Check the schedule for the next free slot." />
          )}
        </Card>

        {view.approvalsPreview ? (
          <Card
            title="Waiting for approval"
            action={
              <Link href="/admin/approvals" className="rv-link">
                Review {view.pendingApprovals}
              </Link>
            }
          >
            {view.approvalsPreview.length ? (
              <div>
                {view.approvalsPreview.map((item, index) => (
                  <div
                    key={item.id}
                    className="rv-inline"
                    style={{ padding: "8px 0", borderBottom: index === view.approvalsPreview!.length - 1 ? undefined : "1px solid var(--border)" }}
                  >
                    <Avatar name={item.requester} size="sm" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: 14 }}>{item.resourceName}</b>
                      <br />
                      <span style={{ fontSize: 12, color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>{item.when}</span>
                    </span>
                    <Badge status="pending">Pending</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon="inbox" title="Nothing waiting" text="Requests for resources that need sign-off will appear here." />
            )}
          </Card>
        ) : null}

        <Card title="Notices" meta="This week">
          {view.notices.length ? (
            <div className="rv-stack">
              {view.notices.map((notice) => (
                <div key={notice.id} style={{ padding: 12, borderRadius: 10, background: "var(--surface-sunken)", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div className="rv-inline" style={{ justifyContent: "space-between", gap: 8 }}>
                    <b style={{ fontSize: 14 }}>{notice.title}</b>
                    <Badge status="maintenance" />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>{notice.detail}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="megaphone" title="No notices" text="Maintenance windows and closures for the week ahead will show up here." />
          )}
        </Card>
      </div>
    </div>
  );
}
