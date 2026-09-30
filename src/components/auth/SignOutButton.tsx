"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { LogOutIcon } from "@/components/ui/icons";
import { broadcastSignOut } from "./authChannel";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!res.ok) throw new Error(`logout failed: ${res.status}`);
      broadcastSignOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setPending(false);
      setError("Couldn't sign you out. Please try again.");
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && (
        <span role="alert" className="text-xs font-medium text-rose-400">
          {error}
        </span>
      )}
      <Button variant="secondary" className="px-3.5 py-2" loading={pending} onClick={signOut}>
        {!pending && <LogOutIcon className="h-4 w-4" />}
        Sign out
      </Button>
    </div>
  );
}
