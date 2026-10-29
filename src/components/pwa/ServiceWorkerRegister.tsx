"use client";

import { useEffect, useState } from "react";
import { syncPendingPayments } from "@/lib/offline/indexed-db";

interface ServiceWorkerRegisterProps {
  schoolCode?: string;
}

export function ServiceWorkerRegister({ schoolCode }: ServiceWorkerRegisterProps) {
  // Always start "online": the server cannot know (Node 21+ has a global `navigator` WITHOUT `onLine`, so `!navigator.onLine` was true there and the offline banner
  // was in the server HTML, which React 19 reports as hydration error #418 on every full load). The browser decides after mount.
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker in browser
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          // Attempt periodic background sync registration if supported
          if ("sync" in registration) {
            (registration as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync
              .register("sync-pending-payments")
              .catch(() => {
                // Background sync permission not granted or unsupported
              });
          }
        })
        .catch((err) => {
          console.warn("[PWA] Service worker registration ignored:", err);
        });

      // Listen for message from service worker
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "SYNC_PENDING_PAYMENTS" && schoolCode) {
          syncPendingPayments(schoolCode).catch(() => {});
        }
      };

      navigator.serviceWorker.addEventListener("message", handleMessage);

      return () => {
        navigator.serviceWorker.removeEventListener("message", handleMessage);
      };
    }
  }, [schoolCode]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      if (schoolCode) {
        syncPendingPayments(schoolCode).catch(() => {});
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser's connection state is exactly what this effect is for
    setIsOffline(!navigator.onLine);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [schoolCode]);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/90 px-3.5 py-1 text-[11px] font-semibold text-white shadow-md backdrop-blur-sm transition-all"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
      </span>
      <span>Offline Mode — Receipts will sync once connected</span>
    </div>
  );
}
