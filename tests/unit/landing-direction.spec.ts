import "../support/env";
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { ENGLISH_LABELS } from "@/components/landing/LandingPage";

// The landing page component takes its words, language and direction as props (task 0044). AlEemaan draws a right-to-left Arabic page with it, so what keeps it mirrorable and what it says
// when it is given nothing are held here. (The markup itself is held in the browser: a component cannot be rendered in this project, whose loader replaces React's JSX runtime, so the props are
// exercised by the two products' screens specs: Octalve's page with no props, AlEemaan's pages with props.)

const source = (path: string) => readFileSync(path, "utf8");

test.describe("the component can be mirrored", () => {
  // `dir="rtl"` mirrors flex rows, gaps and logical padding on its own; a class that names a side does not move. Spacing here is `gap`, `px`, `py`, `justify-between`, `mx-auto`: keep it so.
  test("it names no side: no left or right margin, padding, position or text alignment, and no float", () => {
    const SIDE =
      /(?:^|[\s:"'`])-?(?:m|p)[lr]-|(?:^|[\s:"'`])(?:left|right)-|(?:^|[\s:"'`])text-(?:left|right)\b|(?:^|[\s:"'`])float-|(?:rounded|border)-(?:[lr]|tl|tr|bl|br)(?:-|\b)/;
    for (const file of ["src/components/landing/LandingPage.tsx", "src/components/ui/ThemeToggle.tsx"]) {
      const code = source(file)
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, ""); // the classes, not the comments about them
      expect(SIDE.exec(code)?.[0], file).toBeUndefined();
    }
  });
});

test.describe("given nothing, it says what the page always said", () => {
  test("the component's own English words", () => {
    expect(ENGLISH_LABELS.signIn).toBe("Sign in");
    expect(ENGLISH_LABELS.footerNav).toBe("Footer");
    expect(ENGLISH_LABELS.rights(2030, "Octalve Edu")).toBe("© 2030 Octalve Edu. All rights reserved.");
    expect(ENGLISH_LABELS.theme).toEqual({ toLight: "Switch to light theme", toDark: "Switch to dark theme" });
  });

  test("the cards' grid follows their number: four sit two by two, anything else keeps the grid the page always had (task 0044, D7)", () => {
    const component = source("src/components/landing/LandingPage.tsx");
    expect(component).toContain('const COVERS_GRID_DEFAULT = "sm:grid-cols-2 lg:grid-cols-3";');
    expect(component).toContain('const COVERS_GRID: Record<number, string> = { 4: "sm:grid-cols-2" };');
    expect(component).toContain("COVERS_GRID[copy.covers.length] ?? COVERS_GRID_DEFAULT");
  });

  test("every prop is optional and the component is called with none by `/`", () => {
    const page = source("src/app/page.tsx");
    expect(page).toMatch(/<LandingPage\s*\/>/);
    const component = source("src/components/landing/LandingPage.tsx");
    expect(component).toMatch(/copy = brand\.landing, name = brand\.name, labels = ENGLISH_LABELS/);
  });

  test("the language and the direction are written only when given (an undefined attribute is not rendered)", () => {
    const component = source("src/components/landing/LandingPage.tsx");
    expect(component).toMatch(/<div lang=\{lang\} dir=\{dir\} className="min-h-screen bg-canvas text-fg">/);
    expect(component).not.toMatch(/lang\s*=\s*"en"|dir\s*=\s*"ltr"/);
  });
});
