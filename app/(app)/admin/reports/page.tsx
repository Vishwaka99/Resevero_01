import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/AppShell";
import { Alert, Card, EmptyState, Gauge, LinkButton, SegmentedLinks, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { buildReportsView } from "@/lib/bff/views";
import type { ReportRange } from "@/lib/server/reports";

export const metadata: Metadata = { title: "Usage reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: ReportRange }> }) {
  const admin = await requireAdmin();
  const { range } = await searchParams;
  const view = await buildReportsView(admin, { range });
  const report = view.report;

  return (
    <div className="rv-page">
      <PageHeader
        title="Usage reports"
        subtitle="How resources are actually used, so you know what to add, move or retire."
        actions={
          <>
            <SegmentedLinks items={view.rangeOptions} current={view.activeRange} label="Range" />
            <LinkButton href={view.exportHref} variant="secondary" icon="download">
              Export CSV
            </LinkButton>
          </>
        }
      />

      <div className="rv-grid rv-grid-3">
        <Card>
          <Stat label="Reservations" value={report.kpis.totalReservations} icon="calendar-check" />
        </Card>
        <Card>
          <Stat label="Hours booked" value={report.kpis.hoursBooked} icon="clock" />
        </Card>
        <Card>
          <Stat label="Average utilisation" value={`${report.kpis.averageUtilisation}%`} icon="chart" />
        </Card>
      </div>

      <div className="rv-grid rv-grid-sidebar">
        <Card title="Utilisation by resource" meta="% of bookable hours">
          {report.utilisation.length ? (
            <div className="rv-stack">
              {report.utilisation.map((row) => (
                <div key={row.resourceId} className="rv-bar-row">
                  <span>
                    {row.name}
                    <br />
                    <span className="rv-muted" style={{ fontSize: 12 }}>
                      {row.reservations} {row.reservations === 1 ? "booking" : "bookings"}
                    </span>
                  </span>
                  <span className="rv-bar">
                    <i style={{ width: `${Math.min(100, row.percent)}%` }} />
                  </span>
                  <span className="rv-mono" style={{ textAlign: "right" }}>
                    {row.percent}%
                  </span>
                </div>
              ))}
              {report.highlight ? <Alert tone="info" title="What this suggests">{report.highlight}</Alert> : null}
            </div>
          ) : (
            <EmptyState icon="chart" title="No data yet" text="Utilisation appears once resources have been booked in this range." />
          )}
        </Card>

        <div className="rv-stack">
          <Card title="How requests ended" meta={`${report.kpis.noShowRate}% no-shows`}>
            <Gauge
              segments={[
                { label: "Completed", value: report.outcomes.completed },
                { label: "Confirmed", value: report.outcomes.confirmed, color: "chart-2" },
                { label: "Cancelled", value: report.outcomes.cancelled + report.outcomes.rejected + report.outcomes.noShows, color: "chart-3" },
              ]}
              label="Total"
            />
          </Card>

          <Card title="Approval turnaround">
            <div className="rv-stack">
              <Stat label="Median time to a decision" value={view.turnaroundLabel} icon="inbox" />
              <p className="rv-muted" style={{ margin: 0, fontSize: 13 }}>
                {report.approvalTurnaround.decided} {report.approvalTurnaround.decided === 1 ? "request was" : "requests were"} decided in this range.
                {report.approvalTurnaround.expired
                  ? ` ${report.approvalTurnaround.expired} expired before anyone looked at ${report.approvalTurnaround.expired === 1 ? "it" : "them"}.`
                  : " None expired undecided."}
              </p>
              <a href="/admin/approvals" className="rv-link">
                Open approvals →
              </a>
            </div>
          </Card>
        </div>
      </div>

      <Card title="Busiest hours" meta={report.busiestHourLabel}>
        <div className="rv-heat" style={{ ["--cols" as string]: view.hourLabels.length }}>
          <div className="rv-heat-row">
            <span />
            {view.hourLabels.map((hour) => (
              <span key={hour} className="rv-heat-label" style={{ textAlign: "center" }}>
                {hour}
              </span>
            ))}
          </div>
          {view.heatRows.map((row) => (
            <div key={row.label} className="rv-heat-row">
              <span className="rv-heat-label">{row.label}</span>
              {row.cells.map((cell) => (
                <span
                  key={cell.hour}
                  className="rv-heat-cell"
                  title={`${row.label} ${String(cell.hour).padStart(2, "0")}:00 — ${cell.bookings} ${cell.bookings === 1 ? "booking" : "bookings"}`}
                  style={
                    cell.bookings
                      ? { background: "var(--chart-1)", opacity: 0.25 + cell.intensity * 0.75 }
                      : undefined
                  }
                />
              ))}
            </div>
          ))}
        </div>
        <div className="rv-inline" style={{ marginTop: "var(--space-3)", fontSize: 12, color: "var(--ink-muted)" }}>
          <span>Quiet</span>
          <span style={{ display: "inline-flex", gap: 4 }}>
            {[0.25, 0.5, 0.75, 1].map((step) => (
              <i key={step} style={{ width: 20, height: 10, borderRadius: 3, background: "var(--chart-1)", opacity: step }} />
            ))}
          </span>
          <span>Busy</span>
        </div>
      </Card>

      <Card title="By team">
        {report.teams.length ? (
          <div style={{ overflowX: "auto" }}>
            <table className="rv-table">
              <caption className="rv-sr">Reservations by team</caption>
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  <th scope="col">Reservations</th>
                  <th scope="col">Hours</th>
                </tr>
              </thead>
              <tbody>
                {report.teams.map((team) => (
                  <tr key={team.team}>
                    <td>{team.team}</td>
                    <td className="rv-mono">{team.reservations}</td>
                    <td className="rv-mono">{team.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="users" title="No team data" text="Once people book, their teams appear here." />
        )}
      </Card>
    </div>
  );
}
