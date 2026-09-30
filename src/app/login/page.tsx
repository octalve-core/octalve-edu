import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isSetupComplete, isSoloMode } from "@/lib/setup/status";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };
// Depends on the request's cookies and the database — never statically cached.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in: nothing to do here.
  if (await getSession()) redirect("/dashboard");

  // A fresh Solo install has no accounts yet — sending the deployer to a
  // sign-in form that can never succeed is a dead end; send them to setup.
  if (isSoloMode() && (await isSetupComplete()) === false) redirect("/setup");

  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
