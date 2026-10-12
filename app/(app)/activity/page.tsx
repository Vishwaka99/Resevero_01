import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/AppShell";
import { Card, EmptyState, Icon } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { buildActivityView } from "@/lib/bff/views";

export const metadata: Metadata = { title: "Activity log" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await requireUser();
  const view = await buildActivityView(user);

  return (
    <div className="rv-page">
      <PageHeader title="Activity log" subtitle={view.scopeLabel} />

      <Card>
        {view.entries.length ? (
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {view.entries.map((entry, index) => (
              <li
                key={entry.id}
                className="rv-inline"
                style={{
                  alignItems: "flex-start",
                  padding: "var(--space-3) 0",
                  borderBottom: index === view.entries.length - 1 ? undefined : "1px solid var(--border)",
                }}
              >
                <Icon name={entry.icon} tile />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14 }}>{entry.actorName}</b> <span className="rv-muted">{entry.actionLabel}</span>{" "}
                  <b style={{ fontSize: 14 }}>{entry.subject}</b>
                  {entry.detail ? (
                    <>
                      <br />
                      <span className="rv-muted" style={{ fontSize: 12 }}>
                        {entry.detail}
                      </span>
                    </>
                  ) : null}
                </span>
                <span className="rv-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                  {entry.when}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState icon="shield" title="Nothing logged yet" text="Every booking, decision and change is recorded here with who did it and when." />
        )}
      </Card>
    </div>
  );
}
