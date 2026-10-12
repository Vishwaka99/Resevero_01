import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shell/AppShell";
import { BlockTimeForm, ResourceForm } from "@/components/screens/ResourceAdminForms";
import { Badge, Card, EmptyState, Icon, LinkButton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { buildManageResourcesView } from "@/lib/bff/views";

export const metadata: Metadata = { title: "Manage resources" };
export const dynamic = "force-dynamic";

export default async function ManageResourcesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const admin = await requireAdmin();
  const { edit } = await searchParams;
  const view = await buildManageResourcesView(admin, { edit });

  return (
    <div className="rv-page">
      <PageHeader
        title="Manage resources"
        subtitle="Add what people can book, set the rules, and block time for maintenance."
        actions={
          view.isEditing ? (
            <LinkButton href="/admin/resources" variant="secondary" icon="plus">
              Add a resource
            </LinkButton>
          ) : null
        }
      />

      <div className="rv-grid rv-grid-sidebar">
        <Card title={`Catalogue · ${view.rows.length}`}>
          {view.rows.length ? (
            <div style={{ overflowX: "auto" }}>
              <table className="rv-table">
                <caption className="rv-sr">All resources</caption>
                <thead>
                  <tr>
                    <th scope="col">Resource</th>
                    <th scope="col">Location</th>
                    <th scope="col">Capacity</th>
                    <th scope="col">Rules</th>
                    <th scope="col">Upcoming</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="rv-sr">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="rv-inline" style={{ gap: "var(--space-2)", flexWrap: "nowrap" }}>
                          <Icon name={row.icon} tone="line" />
                          <span>
                            <Link href={`/resources/${row.id}`}>{row.name}</Link>
                            <br />
                            <span className="rv-muted" style={{ fontSize: 12 }}>
                              {row.typeName}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="rv-muted">{row.locationName}</td>
                      <td>{row.capacityLabel}</td>
                      <td className="rv-muted">{row.rulesLabel}</td>
                      <td className="rv-mono">{row.upcoming}</td>
                      <td>
                        <Badge status={row.status}>{row.statusLabel}</Badge>
                      </td>
                      <td>
                        <LinkButton href={row.editHref} variant="ghost" size="sm">
                          Edit
                        </LinkButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="building" title="No resources yet" text="Add the first room, piece of equipment or vehicle with the form beside this." />
          )}
        </Card>

        <div className="rv-stack">
          <Card title={view.isEditing ? "Edit resource" : "Add resource"}>
            <ResourceForm view={view} />
          </Card>

          <Card title="Schedule maintenance">
            <BlockTimeForm view={view} />
          </Card>
        </div>
      </div>
    </div>
  );
}
