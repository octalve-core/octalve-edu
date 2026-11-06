"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { brand } from "@/lib/brand";
import {
  SHELL_PREFS_MAX_AGE_SECONDS,
  SIDEBAR_COOKIE,
  SIDEBAR_SECTIONS_COOKIE,
  serializeFoldedSections,
  serializeSidebarCollapsed,
} from "@/lib/shell-prefs";
import { BrandMark } from "./BrandMark";
import { FOCUS_RING, type SectionId } from "./nav";

/// How long the pointer may be outside the sidebar before an open-by-hover rail closes again: long
/// enough that a diagonal move toward a label does not make it flicker, short enough to feel immediate.
const CLOSE_DELAY_MS = 120;

type SidebarContextValue = {
  /// The person's choice (a cookie): the sidebar is folded to a rail of icons.
  collapsed: boolean;
  /// Collapsed, but opened for now by the pointer or the keyboard being on it. Never moves the page.
  peek: boolean;
  /// Labels are shown: not collapsed, or collapsed and peeking.
  open: boolean;
  setPeek: (peek: boolean) => void;
  /// Flips the pinned choice (and remembers it). Always ends a peek.
  pin: () => void;
  folded: readonly SectionId[];
  toggleSection: (id: SectionId) => void;
  /// Opens a folded section without remembering it (the section of the page you arrived on).
  revealSection: (id: SectionId) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider> (the app shell mounts it).");
  return ctx;
}

function writeCookie(name: string, value: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Path=/; Max-Age=${SHELL_PREFS_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

/// The shell's root element and the sidebar's state. The root carries `data-sidebar`, which the page's
/// left padding keys off (the PINNED choice only, so a hover never shifts the page).
export function SidebarProvider({
  initialCollapsed,
  initialFolded,
  children,
}: {
  initialCollapsed: boolean;
  initialFolded: readonly SectionId[];
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [peek, setPeek] = useState(false);
  const [folded, setFolded] = useState<readonly SectionId[]>(initialFolded);

  const pin = useCallback(() => {
    writeCookie(SIDEBAR_COOKIE, serializeSidebarCollapsed(!collapsed));
    setCollapsed(!collapsed);
    setPeek(false);
  }, [collapsed]);

  const toggleSection = useCallback(
    (id: SectionId) => {
      const next = folded.includes(id) ? folded.filter((other) => other !== id) : [...folded, id];
      writeCookie(SIDEBAR_SECTIONS_COOKIE, serializeFoldedSections(next));
      setFolded(next);
    },
    [folded],
  );

  const revealSection = useCallback(
    (id: SectionId) => setFolded((current) => (current.includes(id) ? current.filter((other) => other !== id) : current)),
    [],
  );

  const value = useMemo<SidebarContextValue>(
    () => ({ collapsed, peek, open: !collapsed || peek, setPeek, pin, folded, toggleSection, revealSection }),
    [collapsed, peek, pin, folded, toggleSection, revealSection],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div data-sidebar={collapsed ? "collapsed" : "expanded"} className="group/shell min-h-screen bg-canvas text-fg-2">
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

/// The desktop sidebar: brand, `top` (the school switcher), the navigation (`children`), then `foot` (the
/// signed-in person), which is pinned to the bottom edge whatever the length of the list. Below `lg` it is
/// not shown at all (the phone has its own bar).
///
/// Folded to a rail it is 64 px wide and shows icons only; while a mouse or pen is over the icons (or
/// focus is in them) it opens over the page as an overlay. The toggle is a small round arrow on the
/// sidebar's right edge, near the top, solid brand colour with a white arrow so it is easy to see in
/// both themes: it points left to fold and right to open. It is 28 px and sits a little outside the
/// edge's centre line, because a larger circle centred on the 64 px rail would run into the brand mark.
/// It, the brand and the empty space are not triggers: hovering the toggle does nothing, on purpose.
///
/// Two boxes: the outer one is the frame (it must not clip, so the arrow can overhang the edge); the
/// inner one clips the labels while the width is changing.
export function SidebarFrame({ top, foot, children }: { top: ReactNode; foot: ReactNode; children: ReactNode }) {
  const { collapsed, peek, open, setPeek, pin } = useSidebar();
  const closeTimer = useRef<number | undefined>(undefined);

  const cancelClose = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  }, []);
  useEffect(() => cancelClose, [cancelClose]);

  // Only the pointers that hover: a finger tap would "enter" and open it under the finger.
  const hoverOpens = (event: PointerEvent) => {
    if (event.pointerType === "touch" || !collapsed) return;
    cancelClose();
    setPeek(true);
  };
  const focusOpens = () => {
    if (!collapsed) return;
    cancelClose();
    setPeek(true);
  };

  const label = open ? "" : "sr-only";
  const Arrow = collapsed ? ChevronRightIcon : ChevronLeftIcon;
  const triggers = { onPointerEnter: hoverOpens, onFocus: focusOpens };

  return (
    <div
      id="app-sidebar"
      data-state={collapsed ? (peek ? "peek" : "rail") : "open"}
      onPointerEnter={cancelClose}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        cancelClose();
        closeTimer.current = window.setTimeout(() => setPeek(false), CLOSE_DELAY_MS);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPeek(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && peek) setPeek(false);
      }}
      // z-30: above the top bar (z-20), so the half of the arrow that overhangs the edge is not painted over; below dialogs (z-50).
      className={`fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 motion-reduce:transition-none lg:block print:hidden ${
        open ? "w-62" : "w-16"
      } ${collapsed && peek ? "shadow-menu" : ""}`}
    >
      <div className="flex h-full flex-col overflow-hidden border-r border-line bg-surface">
        <div data-part="brand" className="flex h-15 shrink-0 items-center gap-3 px-3">
          <BrandMark size="md" />
          <span className={`truncate text-lg font-bold tracking-tight text-fg ${label}`}>{brand.name}</span>
        </div>

        <div data-part="top" {...triggers}>
          {top}
        </div>

        <div {...triggers} className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>

        <div data-part="foot" {...triggers} className="mt-auto shrink-0 border-t border-line">
          {foot}
        </div>
      </div>

      <button
        type="button"
        onClick={pin}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`absolute top-4 -right-[18px] flex h-7 w-7 items-center justify-center rounded-full border-2 border-canvas bg-brand-strong text-white shadow-card transition-colors hover:bg-brand-strong-hover ${FOCUS_RING}`}
      >
        <Arrow className="h-4 w-4" strokeWidth={2.75} />
      </button>
    </div>
  );
}
