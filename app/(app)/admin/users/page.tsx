import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/AppShell";
import { InviteUserForm, UserRowControls } from "@/components/screens/UserAdminForms";
import { Avatar, Badge, Card, Icon, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { buildUsersView } from "@/lib/bff/views";

export const metadata: Metadata = { title: "Users & roles" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const admin = await requireAdmin();
  const view = await buildUsersView(admin);

  return (
    <div className="rv-page">
      <PageHeader title="Users & roles" subtitle="Who can book, and who can approve and manage. Two roles keep it simple." />

      <div className="rv-grid rv-grid-3">
        <Card>
          <Stat label="Admins" value={view.counts.admins} icon="shield" />
        </Card>
        <Card>
          <Stat label="Members" value={view.counts.members} icon="users" />
        </Card>
        <Card>
          <Stat label="Deactivated" value={view.counts.inactive} icon="logout" />
        </Card>
      </div>

      <div className="rv-grid rv-grid-sidebar">
        <Card title={`People · ${view.rows.length}`}>
          <div style={{ overflowX: "auto" }}>
            <table className="rv-table">
              <caption className="rv-sr">Users and their roles</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Team</th>
                  <th scope="col">Bookings (30 d)</th>
                  <th scope="col">Status</th>
                  <th scope="col">Role</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="rv-inline" style={{ gap: "var(--space-2)", flexWrap: "nowrap" }}>
                        <Avatar name={row.name} size="sm" />
                        <span>
                          {row.name}
                          {row.isSelf ? <span className="rv-muted"> (you)</span> : null}
                          <br />
                          <span className="rv-muted" style={{ fontSize: 12 }}>
                            {row.email}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="rv-muted">{row.team}</td>
                    <td className="rv-mono">{row.bookings}</td>
                    <td>
                      <Badge status={row.status}>{row.statusLabel}</Badge>
                    </td>
                    <td>
                      <UserRowControls userId={row.id} role={row.role} isActive={row.status === "available"} isSelf={row.isSelf} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Invite user">
          <InviteUserForm departmentOptions={view.departmentOptions} />
        </Card>
      </div>

      <Card title="Role permissions">
        <div className="rv-stack">
          <div style={{ overflowX: "auto" }}>
            <table className="rv-table">
              <caption className="rv-sr">What each role may do</caption>
              <thead>
                <tr>
                  <th scope="col">Module</th>
                  <th scope="col">Member</th>
                  <th scope="col">Admin</th>
                </tr>
              </thead>
              <tbody>
                {view.permissionMatrix.map((entry) => (
                  <tr key={entry.module}>
                    <td>
                      {entry.module}
                      <br />
                      <span className="rv-muted" style={{ fontSize: 12 }}>
                        {entry.note}
                      </span>
                    </td>
                    <td>
                      <PermissionCells access={entry.member} />
                    </td>
                    <td>
                      <PermissionCells access={entry.admin} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rv-field-hint">
            The BFF enforces these on every request. Hiding a button is never the only check.
          </p>
        </div>
      </Card>
    </div>
  );
}

function PermissionCells({ access }: { access: { view: boolean; create: boolean; manage: boolean } }) {
  const entries: Array<[string, boolean]> = [
    ["View", access.view],
    ["Create", access.create],
    ["Manage", access.manage],
  ];

  return (
    <div className="rv-inline" style={{ gap: "var(--space-3)" }}>
      {entries.map(([label, allowed]) => (
        <span key={label} className="rv-inline" style={{ gap: 4, fontSize: 12, color: allowed ? "var(--success)" : "var(--ink-muted)" }}>
          <Icon name={allowed ? "check" : "x"} size="sm" tone="line" />
          {label}
        </span>
      ))}
    </div>
  );
}
