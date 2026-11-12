"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ChevronDownIcon } from "@/components/ui/icons";
import { useShell } from "./ShellProvider";
import { useSidebar } from "./SidebarFrame";
import { SoonTag } from "./SoonTag";
import { FOCUS_RING, groupNav, isActive, navFor, sectionOfPath, type NavItem } from "./nav";

const LINK =
  "flex min-h-11 items-center gap-3 rounded-xl px-2.5 text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg aria-[current=page]:bg-brand-tint aria-[current=page]:font-semibold aria-[current=page]:text-brand-fg";

/// The desktop sidebar's navigation, in sections. The current page is marked with `aria-current="page"` (which is also what the
/// styling keys off, so what sighted and screen-reader users are told can't drift apart); pages that don't exist yet are plain
/// text with a "Soon" tag.
///
/// A section's heading is a button that folds its entries (`aria-expanded`; folded entries are `hidden`, so they leave the tab
/// order and the accessibility tree). In the icon rail the heading shows only its chevron — a divider that is also the handle —
/// and every label is `sr-only` (still each link's name). Icons sit at the same x in the rail and when open, so nothing jumps
/// when the rail opens.
export function SidebarNav() {
  const pathname = usePathname();
  const { home, platform } = useShell();
  const { open, folded, toggleSection, revealSection } = useSidebar();
  const items = navFor(home, platform);
  const groups = groupNav(items);

  // The page you are on is never hidden: arriving on a page opens the section that holds it.
  const currentSection = sectionOfPath(pathname, items);
  useEffect(() => {
    if (currentSection) revealSection(currentSection);
  }, [currentSection, pathname, revealSection]);

  const label = open ? "truncate" : "sr-only";

  // A plain link that comes after a section would read as one of that section's pages, so it gets a rule above it.
  const renderItem = (item: NavItem, apart = false) => (
    <li key={item.label} className={apart ? "mt-2 border-t border-line pt-2" : undefined}>
      {item.href ? (
        <Link href={item.href} aria-current={isActive(pathname, item) ? "page" : undefined} className={`${LINK} ${FOCUS_RING}`}>
          <item.icon className="h-5 w-5 shrink-0" />
          <span className={label}>{item.label}</span>
        </Link>
      ) : (
        <span className="flex min-h-11 items-center gap-3 rounded-xl px-2.5 text-sm font-medium text-fg-muted">
          <item.icon className="h-5 w-5 shrink-0" />
          <span className={label}>{item.label}</span>
          {open && <SoonTag />}
        </span>
      )}
    </li>
  );

  return (
    <nav aria-label="Main" className="px-3 py-2">
      <ul className="space-y-1">
        {groups.map((group, index) => {
          if (!group.section) return group.items.map((item, i) => renderItem(item, index > 0 && i === 0));
          const { id, label: heading } = group.section;
          const isFolded = folded.includes(id);
          return (
            <li key={id} className="pt-2">
              <button
                type="button"
                aria-expanded={!isFolded}
                aria-controls={`sidebar-section-${id}`}
                onClick={() => toggleSection(id)}
                className={`flex h-8 w-full items-center rounded-lg px-2.5 text-xs font-semibold tracking-wide text-fg-muted uppercase transition-colors hover:text-fg ${FOCUS_RING} ${
                  open ? "justify-between" : "justify-center"
                }`}
              >
                <span className={label}>{heading}</span>
                <ChevronDownIcon
                  className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${isFolded ? "-rotate-90" : ""}`}
                />
              </button>
              <ul id={`sidebar-section-${id}`} hidden={isFolded} className="mt-1 space-y-1">
                {group.items.map((item) => renderItem(item))}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
