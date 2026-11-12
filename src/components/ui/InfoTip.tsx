"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { InfoIcon } from "./icons";
import { INFO_TIPS, type InfoTipKey } from "./info-tips";

// A small "i" beside a thing, with a short explanation of it (task 0054). The rules that keep it from disfiguring the page:
//  - It is always a SIBLING of what it explains, never inside it, so the accessible name of a heading, a label or a button (which every test and the walkthrough find things by) is unchanged.
//  - Its own name is the fixed "More information", NOT "More about: <topic>": Playwright matches names by substring, so a name that held the topic ("Show", "Date", "Subjects") would
//    collide with the label or button it sits beside in every existing `getByLabel` and `getByRole("button")`. A test finds an icon by its `data-info-tip` key.
//  - It is 16px and inline; its 44px touch target is an invisible extension, not padding; the popover is absolutely positioned and takes no space. Nothing around it moves.
//  - Design tokens only (light, dark, contrast); no animation; hidden in print.
// Opens on hover, on keyboard focus, and on click or tap (a phone has no hover); closes on Escape, on a click elsewhere, on blur and when the pointer leaves; one is open at a time.

const OPEN_EVENT = "infotip:open";
const HOVER_OPEN_MS = 150;
const HOVER_CLOSE_MS = 120;
const EDGE = 8; // the least gap, in px, between the popover and the edge of the window
const GAP = 6; // the gap, in px, between the icon and the popover

type Place = { left: number; above: boolean };

export function InfoTip({ tip, className = "" }: { tip: InfoTipKey; className?: string }) {
  const id = useId();
  const popoverId = `${id}-tip`;
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const wrapper = useRef<HTMLSpanElement>(null);
  const popover = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointer = useRef<string>("");

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = useCallback(() => {
    clearTimer();
    document.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    setOpen(true);
  }, [id]);
  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
    setPlace(null);
  }, []);

  // one at a time, and a click or a tap anywhere else closes it
  useEffect(() => {
    if (!open) return;
    const onOther = (event: Event) => {
      if ((event as CustomEvent).detail !== id) hide();
    };
    const onOutside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) hide();
    };
    // Escape closes it wherever the focus is (a tip opened by hovering has no focus inside it: WCAG 1.4.13, "dismissible"). It is caught first and cancelled, so inside a dialog the tip closes
    // and the dialog only the next time: the native <dialog> closes on the Escape that nobody cancelled.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      hide();
    };
    document.addEventListener(OPEN_EVENT, onOther);
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener(OPEN_EVENT, onOther);
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, id, hide]);

  useEffect(() => clearTimer, []);

  // Placed when it opens, once its size is known: below the icon unless that does not fit, centred on the icon and kept inside the window (a phone's edges included).
  useLayoutEffect(() => {
    if (!open || !wrapper.current || !popover.current) return;
    const icon = wrapper.current.getBoundingClientRect();
    const box = popover.current.getBoundingClientRect();
    // The room is the document's own client box (it leaves out a desktop scrollbar), read while nothing of ours sticks out: see `style` below.
    const room = document.documentElement;
    const roomBelow = room.clientHeight - icon.bottom - GAP - EDGE;
    const roomAbove = icon.top - GAP - EDGE;
    const above = box.height > roomBelow && roomAbove > roomBelow;
    const centre = icon.left + icon.width / 2;
    const wanted = centre - box.width / 2;
    const clamped = Math.min(Math.max(wanted, EDGE), Math.max(EDGE, room.clientWidth - box.width - EDGE));
    // `left` is relative to the wrapper (the positioned parent)
    setPlace({ left: clamped - icon.left, above });
  }, [open]);

  // Until it is placed it is measured parked far outside the window with `position: fixed`, hidden. Two places were tried first and both were wrong (found by the browser tests, task 0054 and 0055):
  //  - beside the icon: near a phone's right edge it stuck out past the edge of the page for an instant, a phone then widens the page to fit it, the window reads wider, the clamp above clamps
  //    to the wrong edge and the page stays wider (the floating button was cut off);
  //  - at the window's corner (0, 0): no width problem, but with the page scrolled to its end, Chrome then scrolled the page UP by 227 px the moment the popover mounted (the page lurched and
  //    the popover, placed for the old scroll position, ended below the screen). Parked at -9999 nothing scrolls. Why the other two do is not known: it was found by bisecting, not explained.
  // Once placed it is `absolute` (the class) beside the icon.
  const style: CSSProperties = place
    ? { left: place.left, ...(place.above ? { bottom: `calc(100% + ${GAP}px)` } : { top: `calc(100% + ${GAP}px)` }) }
    : { position: "fixed", left: -9999, top: -9999, visibility: "hidden" };

  return (
    <span
      ref={wrapper}
      className={`relative inline-flex shrink-0 align-middle print:hidden ${className}`}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          clearTimer();
          if (!open) timer.current = setTimeout(show, HOVER_OPEN_MS);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          clearTimer();
          if (open) timer.current = setTimeout(hide, HOVER_CLOSE_MS);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hide();
      }}
    >
      <button
        type="button"
        aria-label="More information"
        data-info-tip={tip}
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        onPointerDown={(event) => {
          lastPointer.current = event.pointerType;
        }}
        onFocus={(event) => {
          // keyboard focus opens it; the focus a mouse click gives does not (the click decides)
          if (event.currentTarget.matches(":focus-visible")) show();
        }}
        onClick={() => {
          // a mouse has already opened it by hovering, so a click keeps it open; a finger or the keyboard toggles it
          if (lastPointer.current === "mouse") show();
          else if (open) hide();
          else show();
          lastPointer.current = "";
        }}
        className="relative inline-flex h-4 w-4 items-center justify-center rounded-full text-fg-muted transition-colors after:absolute after:-inset-3.5 after:content-[''] hover:text-fg focus-visible:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <InfoIcon width={16} height={16} />
      </button>
      {open && (
        <span
          ref={popover}
          id={popoverId}
          role="tooltip"
          style={style}
          className="absolute z-50 w-max max-w-64 rounded-xl border border-line bg-surface px-3 py-2 text-left text-xs leading-relaxed font-normal tracking-normal text-fg-2 normal-case shadow-lg"
        >
          {INFO_TIPS[tip]}
        </span>
      )}
    </span>
  );
}
