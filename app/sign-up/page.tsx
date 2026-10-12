import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthAside, AuthLayout } from "@/components/screens/AuthAside";
import { SignUpForm } from "@/components/screens/SignUpForm";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create an account" };
export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  if (await getSession()) redirect("/dashboard");

  return (
    <AuthLayout
      aside={
        <AuthAside heading="Ask for an account, book from day one.">
          Register with your work email and an admin enables your access. Then every room, projector and van is one search away.
        </AuthAside>
      }
    >
      <SignUpForm />
    </AuthLayout>
  );
}
