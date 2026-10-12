import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shell/AppShell";
import { DecisionForm } from "@/components/screens/ReservationActions";
import { Alert, Avatar, Badge, Card, EmptyState, Icon, LinkButton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { buildApprovalsView } from "@/lib/bff/views";
import { formatWhen } from "@/lib/domain/time";

export const metadata: Metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

type Query = { selected?: string; decided?: string; outcome?: "approved" | "rejected"; autoRejected?: string };

/** The outcome of the decision just made, built from the reservation itself. */
async function decisionBanner(query: Query) {
  if (!query.decided) return null;

  const reservation = await getDataStore().reservations.findByCode(query.decided);
  if (!reservation) return null;

  const when = formatWhen(reservation.startsAt, reservation.endsAt);
  const autoRejected = Number(query.autoRejected ?? 0);

  if (query.outcome === "rejected") {
    return {
      tone: "info" as const,
      title: `Rejected ${reservation.code}.`,
      body: `${reservation.user.name} has been told why, and the slot is free for someone else.`,
    };
  }

  const tail = autoRejected
    ? ` ${autoRejected} clashing ${autoRejected === 1 ? "request was" : "requests were"} rejected automatically, and ${
        autoRejected === 1 ? "its requester was" : "their requesters were"
      } told why.`
    : "";

  return {
    tone: "success" as const,
    title: `Approved ${reservation.code} for ${reservation.user.name}, ${when}.`,
    body: `${reservation.resource.name} is now confirmed.${tail}`,
  };
}

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const banner = await decisionBanner(query);
  const view = await buildApprovalsView(admin, { selected: query.selected });

  return (
    <div className="rv-page">
      <PageHeader
        title="Approvals"
        subtitle="Requests for resources that need sign-off. Oldest first; a request expires if nobody decides before its start time."
      />

      {banner ? (
        <Alert tone={banner.tone} title={banner.title}>
          {banner.body}
        </Alert>
      ) : null}

      {view.queue.length === 0 ? (
        <Card>
          <EmptyState
            icon="inbox"
            title={view.emptyTitle}
            text={view.emptyText}
            action={
              <LinkButton href="/schedule" size="sm" variant="ghost">
                Open the schedule
              </LinkButton>
            }
          />
        </Card>
      ) : (
        <div className="rv-grid rv-grid-sidebar">
          <Card title={`Queue · ${view.queue.length}`}>
            <div>
              {view.queue.map((item, index) => (
                <Link
                  key={item.id}
                  href={item.href}
                  style={{
                    display: "flex",
                    gap: "var(--space-3)",
                    alignItems: "center",
                    padding: "var(--space-3)",
                    margin: "0 calc(var(--space-3) * -1)",
                    borderRadius: "var(--radius-md)",
                    borderBottom: index === view.queue.length - 1 ? undefined : "1px solid var(--border)",
                    background: item.isSelected ? "var(--primary-soft)" : undefined,
                    color: item.isSelected ? "var(--primary-ink)" : "var(--ink)",
                    textDecoration: "none",
                  }}
                  aria-current={item.isSelected ? "true" : undefined}
                >
                  <Icon name={item.resourceIcon} tile={item.isSelected ? "solid" : true} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 14 }}>{item.resourceName}</b>
                    <br />
                    <span className="rv-mono" style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                      {item.when}
                    </span>
                    <br />
                    <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                      {item.requester} · {item.title}
                    </span>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    {item.hasClash ? <Badge status="conflict">Clash</Badge> : <Badge status="pending">Pending</Badge>}
                    <br />
                    <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>{item.age}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Card>

          {view.selected ? (
            <aside className="rv-drawer">
              <div className="rv-inline" style={{ justifyContent: "space-between" }}>
                <span className="rv-mono" style={{ fontSize: 13, color: "var(--ink-muted)" }}>
                  {view.selected.code}
                </span>
                <Badge status="pending" />
              </div>

              <div>
                <h2 style={{ margin: 0, font: "600 18px/26px var(--font-sans)" }}>{view.selected.resourceName}</h2>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--ink-muted)" }}>{view.selected.resourceTypeLabel}</p>
              </div>

              <div className="rv-inline">
                <Avatar name={view.selected.requester} subtitle="Requester" />
              </div>

              <dl className="rv-dl">
                <dt>When</dt>
                <dd className="rv-mono">
                  {view.selected.dayLabel} {view.selected.timeLabel}
                </dd>
                <dt>Length</dt>
                <dd className="rv-mono">{view.selected.durationLabel}</dd>
                <dt>Purpose</dt>
                <dd>{view.selected.title}</dd>
                <dt>People</dt>
                <dd>{view.selected.attendeesLabel}</dd>
                <dt>Their usage</dt>
                <dd>{view.selected.usageLabel}</dd>
              </dl>

              <DecisionForm id={view.selected.id} clashWarning={view.selected.clashWarning} />

              <Link href={view.selected.suggestHref} className="rv-link">
                Suggest another time instead →
              </Link>
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}
