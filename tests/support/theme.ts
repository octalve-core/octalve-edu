import type { Page } from "@playwright/test";

// Flipping the theme in a browser spec, the way every accessibility scan has to do it.
//
// The colours are CSS variables, so the toggle (and a test) changes `data-theme` on <html> and nothing reloads. But the colours TRANSITION (`transition-colors`, 150 ms) when the
// theme flips, and axe samples whatever colour is painted at that instant: once it measured #565c6a on #a8acb4, which is neither theme's colour, and failed `color-contrast` on a screen
// that is fine in both. A spec that scans straight after flipping the theme fails now and then, on a different screen each run. So: flip the theme HERE, and this returns only once
// every running colour transition has finished.
//
// Only transitions are waited for. An infinite animation (the loading spinner) never "finishes" and would hang this. `getAnimations()` brings the style up to date first, so the
// transitions that the flip has just started exist by the time it returns; the flip and the wait share one evaluate so no frame can slip between them.
export async function setTheme(page: Page, theme: string): Promise<void> {
  await page.evaluate(async (next) => {
    document.documentElement.dataset.theme = next;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  }, theme);
}

/// The theme the page is in now (the default is dark), to put it back after a scan in both.
export async function currentTheme(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.dataset.theme ?? "dark");
}
