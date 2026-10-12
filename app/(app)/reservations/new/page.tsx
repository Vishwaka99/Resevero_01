import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shell/AppShell";
import { ReservationForm } from "@/components/screens/ReservationForm";
import { requireUser } from "@/lib/auth/session";
import { buildReservationFormView } from "@/lib/bff/views";

export const metadata: Metadata = { title: "New reservation" };
export const dynamic = "force-dynamic";

type Query = { resourceId?: string; date?: string; from?: string; to?: string; title?: string; attendees?: string; edit?: string };

export default async function NewReservationPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser();
  const query = await searchParams;
  const view = await buildReservationFormView(user, query);

  return (
    <div className="rv-page">
      <Link href={view.backHref} className="rv-link">
        ← Back
      </Link>

      <PageHeader
        title={view.mode === "edit" ? "Edit reservation" : "New reservation"}
        subtitle="We check availability as you type, so a clash shows up before you submit."
      />

      <ReservationForm view={view} />
    </div>
  );
}
