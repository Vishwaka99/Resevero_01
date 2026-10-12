import type { Metadata } from "next";

import { Card, EmptyState, LinkButton } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "No access" };
export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  await requireUser();

  return (
    <div className="rv-page">
      <Card>
        <EmptyState
          icon="shield"
          title="That area is for admins"
          text="Approvals, the resource catalogue, users and reports are managed by admins. Ask one of them if you need something changed."
          action={
            <LinkButton href="/dashboard" size="sm">
              Back to the dashboard
            </LinkButton>
          }
        />
      </Card>
    </div>
  );
}
