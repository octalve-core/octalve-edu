import "../support/env";
import { test, expect } from "@playwright/test";
import { brand } from "@/lib/brand";

// The words of the landing page (task 0041). The page may only say what the product does today, so the copy is held to a few rules a reviewer would otherwise have to remember: what the page offers
// (no sign-up, no price, no trial, no demo: there is none to link to), no figures (a number on a landing page is a claim that goes stale), sentences and not fragments, and a title and a
// description of a length a tab and a search result can show.

const landing = brand.landing;
const everyText = (): string[] => [
  landing.eyebrow,
  landing.headline,
  landing.lead,
  landing.coversHeading,
  ...landing.covers.flatMap((c) => [c.title, c.text]),
  landing.peopleHeading,
  ...landing.people.flatMap((p) => [p.who, p.text]),
  landing.howRun.heading,
  ...landing.howRun.items.flatMap((i) => [i.title, i.text]),
  landing.closingHeading,
  landing.closingText,
];

test.describe("what the page may say", () => {
  test("it offers no sign-up, price, trial, demo or free plan: none of them exists", () => {
    const text =
      `${landing.title} ${landing.description} ${everyText().join(" ")} ${landing.links.map((l) => l.label).join(" ")}`.toLowerCase();
    for (const word of ["sign up", "signup", "register", "free", "trial", "price", "pricing", "plan", "demo", "subscribe", "discount"])
      expect(text, `the copy must not mention "${word}"`).not.toContain(word);
  });

  test("it states no figure: no digit anywhere in the words", () => {
    for (const text of [landing.title, landing.description, ...everyText()]) expect(text, text).not.toMatch(/\d/);
  });

  test("every text is a real piece of writing: trimmed, not empty, no doubled spaces, no placeholder", () => {
    for (const text of [landing.title, landing.description, ...everyText()]) {
      expect(text, text).toBe(text.trim());
      expect(text.length, `"${text}" is empty`).toBeGreaterThan(2);
      expect(text, text).not.toMatch(/ {2}|lorem|todo|tbd|xxx/i);
    }
  });

  test("an item's text is a sentence that ends with a full stop", () => {
    for (const text of [
      landing.lead,
      landing.closingText,
      ...landing.covers.map((c) => c.text),
      ...landing.people.map((p) => p.text),
      ...landing.howRun.items.map((i) => i.text),
    ])
      expect(text, text).toMatch(/[.]$/);
  });
});

test.describe("the shape of the page", () => {
  test("six things it covers, each with its own icon and title", () => {
    expect(landing.covers).toHaveLength(6);
    expect(new Set(landing.covers.map((c) => c.icon)).size).toBe(6);
    expect(new Set(landing.covers.map((c) => c.title)).size).toBe(6);
    expect(landing.covers.map((c) => c.icon).sort()).toEqual(["attendance", "fees", "people", "reportCards", "results", "yearEnd"]);
  });

  test("four kinds of people, and two ways to run it, each said once", () => {
    expect(landing.people).toHaveLength(4);
    expect(new Set(landing.people.map((p) => p.who)).size).toBe(4);
    expect(landing.howRun.items).toHaveLength(2);
    expect(new Set(landing.howRun.items.map((i) => i.title)).size).toBe(2);
  });

  test("the title names the product without repeating it the way the tab's template would; the description is one sentence of a length a search result shows", () => {
    expect(landing.title.startsWith(brand.name)).toBe(true);
    expect(landing.title.length).toBeLessThanOrEqual(60);
    expect(landing.description.length).toBeLessThanOrEqual(160);
    expect(landing.description.split(/[.!?](\s|$)/).filter((s) => s.trim().length > 1)).toHaveLength(1);
  });

  test("the extra links are paths on this site, each with a name that says where it goes, and none is a way to sign up", () => {
    expect(landing.links.length).toBeGreaterThanOrEqual(1);
    expect(new Set(landing.links.map((l) => l.href)).size).toBe(landing.links.length);
    for (const link of landing.links) {
      expect(link.href, link.label).toMatch(/^\/[a-z0-9/_-]*$/); // a path on this site: never an address elsewhere
      expect(link.href, link.label).not.toBe("/login"); // sign-in is always offered and is not one of the extras
      expect(link.label.length, link.label).toBeGreaterThan(5);
      expect(`${link.label} ${link.href}`.toLowerCase(), link.label).not.toMatch(/sign ?up|register|trial|demo/);
    }
  });

  test("the headline is the one the sign-in panel already uses, so the two never drift apart", () => {
    expect(landing.headline).toBe(brand.login.headline);
  });
});
