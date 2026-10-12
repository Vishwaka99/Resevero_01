import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shell/AppShell";
import { CancelReservationButton, CheckInButton } from "@/components/screens/ReservationActions";
import { MyReservationsFilters } from "@/components/screens/MyReservationsFilters";
import { Alert, Badge, Card, EmptyState, Icon, LinkButton, TabLinks } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { buildMyReservationsView, type MyReservationsTab } from "@/lib/bff/views";
import { formatWhen } from "@/lib/domain/time";

export const metadata: Metadata = { title: "My reservations" };
export const dynamic = "force-dynamic";

type Query = {
  tab?: MyReservationsTab;
  type?: string;
  window?: string;
  cursor?: string;
  /** Set by the booking form's redirect, so the confirmation lands beside the row. */
  booked?: string;
  updated?: string;
  created?: string;
  skipped?: string;
};

/** The banner after a successful booking, built from the reservation itself. */
async function confirmation(query: Query) {
  const code = query.booked ?? query.updated;
  if (!code) return null;

  const reservation = await getDataStore().reservations.findByCode(code);
  if (!reservation) return null;

  const when = formatWhen(reservation.startsAt, reservation.endsAt);
  const created = Number(query.created ?? 0);
  const skipped = Number(query.skipped ?? 0);

  const lead = query.updated
    ? `${reservation.code} moved to ${when}.`
    : reservation.status === "pending"
      ? `Request sent: ${reservation.resource.name}, ${when}.`
      : `Reserved: ${reservation.resource.name}, ${when}.`;

  const tail = query.updated
    ? "Everyone on the invite has been told."
    : reservation.status === "pending"
      ? "We'll email you as soon as an admin decides."
      : "A calendar invite is on its way to your email.";

  const repeat = created > 1 ? ` ${created} dates booked.` : "";
  const missed = skipped
    ? ` ${skipped} ${skipped === 1 ? "date was" : "dates were"} skipped because the slot was already taken.`
    : "";

  return { tone: reservation.status === "pending" ? ("warning" as const) : ("success" as const), title: lead, body: `${tail}${repeat}${missed}` };
}

export default async function MyReservationsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser();
  const query = await searchParams;
  const banner = await confirmation(query);
  const view = await buildMyReservationsView(user, {
    tab: query.tab,
    type: query.type,
    window: query.window,
    cursor: query.cursor ? Number(query.cursor) : 0,
  });

  return (
    <div className="rv-page">
      <PageHeader
        title="My reservations"
        subtitle="Everything you've booked. You can cancel up to the start time."
        actions={
          <LinkButton href="/reservations/new" icon="calendar-plus">
            New reservation
          </LinkButton>
        }
      />

      {banner ? (
        <Alert tone={banner.tone} title={banner.title}>
          {banner.body}
        </Alert>
      ) : null}

      <div className="rv-inline" style={{ justifyContent: "space-between" }}>
        <TabLinks items={view.tabs} current={view.activeTab} label="Reservation status" />
        <MyReservationsFilters
          typeOptions={view.typeOptions}
          activeType={view.activeType}
          windowOptions={view.windowOptions}
          activeWindow={view.activeWindow}
        />
      </div>

      <Card>
        {view.rows.length ? (
          <div style={{ overflowX: "auto" }}>
            <table className="rv-table">
              <caption className="rv-sr">Your reservations</caption>
              <thead>
                <tr>
                  <th scope="col">Ref</th>
                  <th scope="col">Resource</th>
                  <th scope="col">When</th>
                  <th scope="col">Purpose</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="rv-mono">{row.code}</td>
                    <td>
                      <div className="rv-inline" style={{ gap: "var(--space-2)", flexWrap: "nowrap" }}>
                        <Icon name={row.resourceIcon} tone="line" />
                        <span>
                          <Link href={row.resourceHref}>{row.resourceName}</Link>
                          <br />
                          <span className="rv-muted" style={{ fontSize: 12 }}>
                            {row.locationName}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="rv-mono">
                      {row.when}
                      {row.repeatLabel ? (
                        <>
                          <br />
                          <span className="rv-muted" style={{ fontFamily: "var(--font-sans)", fontSize: 12 }}>
                            <Icon name="repeat" size="sm" tone="line" /> {row.repeatLabel}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {row.title}
                      <br />
                      <span className="rv-muted" style={{ fontSize: 12 }}>
                        {row.attendees} {row.attendees === 1 ? "person" : "people"} · {row.duration}
                      </span>
                    </td>
                    <td>
                      <Badge status={row.badge}>{row.badgeLabel}</Badge>
                      {row.note ? (
                        <div className="rv-muted" style={{ fontSize: 12, maxWidth: 220 }}>
                          {row.note}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="rv-inline" style={{ gap: "var(--space-2)" }}>
                        {row.canCheckIn && !row.checkedIn ? <CheckInButton id={row.id} size="sm" /> : null}
                        {row.checkedIn ? <span className="rv-muted" style={{ fontSize: 12 }}>Checked in</span> : null}
                        {row.canEdit ? (
                          <LinkButton href={`/reservations/new?edit=${row.id}`} variant="ghost" size="sm">
                            Edit
                          </LinkButton>
                        ) : null}
                        {row.canCancel ? <CancelReservationButton id={row.id} label="Cancel" size="sm" /> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="calendar"
            title={view.emptyTitle}
            text={view.emptyText}
            action={
              <LinkButton href="/resources" size="sm" variant="ghost">
                Browse resources
              </LinkButton>
            }
          />
        )}
      </Card>

      {view.page.total > 0 ? (
        <div className="rv-inline" style={{ justifyContent: "space-between" }}>
          <span className="rv-muted" style={{ fontSize: 13 }}>
            Showing {view.page.shown} of {view.page.total}
          </span>
          <div className="rv-inline">
            {view.page.previousHref ? (
              <LinkButton href={view.page.previousHref} variant="secondary" size="sm">
                Previous
              </LinkButton>
            ) : null}
            {view.page.nextHref ? (
              <LinkButton href={view.page.nextHref} variant="secondary" size="sm">
                Next
              </LinkButton>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
