import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthAside, AuthLayout } from "@/components/screens/AuthAside";
import { SignInForm } from "@/components/screens/SignInForm";
import { getSession } from "@/lib/auth/session";
import { DEV_PASSWORD } from "@/lib/data/memory/seed";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

/** Set by `/auth/confirm` after it has read the link in Supabase's email. */
const NOTICES: Record<string, { tone: "success" | "danger"; title: string; body: string }> = {
  confirmed: {
    tone: "success",
    title: "Email confirmed",
    body: "Your address is verified. An admin enables new accounts, so sign in once yours is approved.",
  },
  "link-invalid": {
    tone: "danger",
    title: "That link didn't work",
    body: "Confirmation links expire and can only be used once. Register again to get a fresh one.",
  },
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; notice?: string }> }) {
  if (await getSession()) redirect("/dashboard");
  const { next, notice } = await searchParams;

  return (
    <AuthLayout
      aside={
        <AuthAside heading="Every room, projector and van, booked once.">
          See what&apos;s free, reserve it in seconds, and let the system catch overlaps before they happen.
        </AuthAside>
      }
    >
      <SignInForm redirectTo={next} demoPassword={DEV_PASSWORD} notice={notice ? NOTICES[notice] : undefined} />
    </AuthLayout>
  );
}
