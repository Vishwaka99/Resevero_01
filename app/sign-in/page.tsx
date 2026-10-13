import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthAside, AuthLayout } from "@/components/screens/AuthAside";
import { SignInForm } from "@/components/screens/SignInForm";
import { getSession } from "@/lib/auth/session";
import { DEV_PASSWORD } from "@/lib/data/memory/seed";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/dashboard");
  const { next } = await searchParams;

  return (
    <AuthLayout
      aside={
        <AuthAside heading="Every room, projector and van, booked once.">
          See what&apos;s free, reserve it in seconds, and let the system catch overlaps before they happen.
        </AuthAside>
      }
    >
      <SignInForm redirectTo={next} demoPassword={DEV_PASSWORD} />
    </AuthLayout>
  );
}
