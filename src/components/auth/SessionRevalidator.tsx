"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onSignOutElsewhere } from "./authChannel";

/// Renders nothing. Keeps a signed-in page honest about session state in the
/// two situations a server-rendered page can't notice by itself:
///  - the browser restored the page from its back/forward cache after sign-out
///    (`pageshow` with `persisted`) — without this, pressing Back after
///    signing out shows the previous user's dashboard from memory;
///  - another tab signed out.
/// Both simply re-run the server render, whose own session check redirects a
/// signed-out visitor to /login. The server stays the source of truth.
export function SessionRevalidator() {
  const router = useRouter();

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) router.refresh();
    };
    window.addEventListener("pageshow", onPageShow);

    const stopListening = onSignOutElsewhere(() => {
      router.replace("/login");
      router.refresh();
    });

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      stopListening();
    };
  }, [router]);

  return null;
}
