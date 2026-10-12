import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/AppShell";
import { ResourceFilters } from "@/components/screens/ResourceFilters";
import { Badge, Card, EmptyState, Icon, LinkButton } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { buildBrowseResourcesView } from "@/lib/bff/views";

export const metadata: Metadata = { title: "Browse resources" };
export const dynamic = "force-dynamic";

type Query = {
  date?: string;
  from?: string;
  to?: string;
  type?: string;
  location?: string;
  minCapacity?: string;
  amenity?: string;
  q?: string;
  sort?: string;
};

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser();
  const query = await searchParams;
  const view = await buildBrowseResourcesView(user, {
    ...query,
    minCapacity: query.minCapacity ? Number(query.minCapacity) : undefined,
  });

  return (
    <div className="rv-page">
      <PageHeader title="Browse resources" subtitle={view.headline} />

      <ResourceFilters filters={view.filters} />

      {view.cards.length ? (
        <div className="rv-grid rv-grid-3">
          {view.cards.map((card) => (
            <Card key={card.id} className="rv-res-card">
              <div className="rv-inline" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
                <div className="rv-inline" style={{ alignItems: "center" }}>
                  <Icon name={card.icon} tile />
                  <span>
                    <b style={{ font: "600 15px/22px var(--font-sans)" }}>{card.name}</b>
                    <br />
                    <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>{card.meta}</span>
                  </span>
                </div>
                <Badge status={card.status}>{card.statusLabel}</Badge>
              </div>

              {card.tags.length ? (
                <div className="rv-tags">
                  {card.tags.map((tag) => (
                    <span key={tag} className="rv-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              {/* Availability is drawn, so a glance answers "when is it free?". */}
              <div>
                <div className="rv-daybar" role="img" aria-label={`Availability today: ${card.nextFree}`}>
                  {card.todayBar.map((cell, index) => (
                    <i key={index} data-state={cell === "free" ? undefined : cell} />
                  ))}
                </div>
                <div className="rv-daybar-scale">
                  <span>{card.barStartLabel}</span>
                  <span>{card.nextFree}</span>
                  <span>{card.barEndLabel}</span>
                </div>
              </div>

              <div className="rv-inline" style={{ justifyContent: "flex-end" }}>
                <LinkButton href={card.detailHref} variant="secondary" size="sm">
                  Details
                </LinkButton>
                <LinkButton href={card.reserveHref} size="sm">
                  Reserve
                </LinkButton>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon="box"
            title="Nothing to show"
            text={view.emptyMessage ?? undefined}
            action={
              view.filters.isFiltered ? (
                <LinkButton href="/resources" size="sm" variant="ghost">
                  Clear filters
                </LinkButton>
              ) : undefined
            }
          />
        </Card>
      )}
    </div>
  );
}
