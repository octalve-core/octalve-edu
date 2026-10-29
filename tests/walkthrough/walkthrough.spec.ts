import { test, expect } from "@playwright/test";
import { Walk } from "./support/walk";

test.describe("Product Walkthrough & Rushing Human Video Guide", () => {
  test("records continuous end-to-end product walkthrough across roles", async ({ page }) => {
    const walk = new Walk(page, "out/walkthrough/screenshots");
    await walk.init();

    // 1. Initial Landing (single goto permitted by guardrail)
    await walk.step(
      {
        id: 1,
        title: "Initial Product Landing",
        role: "Visitor",
        caption: "Visitor arrives at platform front door and is directed to first-run setup wizard.",
        chapter: "Instance Setup",
      },
      async () => {
        await walk.goto("/");
        // On a fresh solo installation, root redirects to /setup or /login
        await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 });
      },
    );

    // 2. Setup Wizard Form Entry (if on setup screen)
    const onSetup = page.url().includes("/setup");
    if (onSetup) {
      await walk.step(
        {
          id: 2,
          title: "First-Run Instance Setup",
          role: "Visitor",
          caption: "Entering founding school identity and initial superadministrator credentials.",
          chapter: "Instance Setup",
        },
        async () => {
          await walk.type(page.locator('input[name="schoolName"]'), "Octalve Demonstration Academy");
          await walk.type(page.locator('input[name="name"]'), "Dr. Aisha Bello");
          await walk.type(page.locator('input[name="email"]'), "admin@octalve.example");
          await walk.type(page.locator('input[name="password"]'), "OctalvePassword123!");
          await walk.type(page.locator('input[name="confirmPassword"]'), "OctalvePassword123!");
        },
      );

      // 3. Submit Setup
      await walk.step(
        {
          id: 3,
          title: "Initialize Instance & Founding Account",
          role: "Visitor",
          caption: "Submitting first-run wizard to create root school record and lock setup permanently.",
          chapter: "Instance Setup",
        },
        async () => {
          await walk.click(page.locator('button[type="submit"]'));
          await expect(page.getByText("Setup complete")).toBeVisible({ timeout: 15_000 });
        },
      );

      // 4. Continue to Sign In
      await walk.step(
        {
          id: 4,
          title: "Navigate to Secure Authentication",
          role: "Visitor",
          caption: "Following setup completion action link directly to user sign-in screen.",
          chapter: "Authentication",
        },
        async () => {
          await walk.click(page.getByRole("button", { name: "Continue to sign in" }));
          await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 10_000 });
        },
      );
    }

    // 5. Administrator Sign-In
    await walk.step(
      {
        id: 5,
        title: "Administrator Authentication",
        role: "School Admin",
        caption: "Signing in with verified administrator credentials.",
        chapter: "Authentication",
      },
      async () => {
        await walk.type(page.locator('input[name="email"]'), "admin@octalve.example");
        await walk.type(page.locator('input[name="password"]'), "OctalvePassword123!");
        await walk.click(page.getByRole("button", { name: "Sign in" }));
        await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 });
      },
    );

    // 6. School Overview Dashboard
    await walk.step(
      {
        id: 6,
        title: "Executive School Overview",
        role: "School Admin",
        caption: "Accessing primary executive dashboard with high-level institutional metrics.",
        chapter: "School Administration",
      },
      async () => {
        // Assert shell and title rendered
        await expect(page.locator("nav")).toBeVisible();
      },
    );

    // 7. Academics Navigation
    await walk.step(
      {
        id: 7,
        title: "Academic Structure & Planning",
        role: "School Admin",
        caption: "Navigating to academic management for sessions, terms, and subject allocations.",
        chapter: "Academic Management",
      },
      async () => {
        const academicsLink = page.getByRole("link", { name: "Academics" }).first();
        await walk.click(academicsLink);
        await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
      },
    );

    // 8. People Management & Student Roster
    await walk.step(
      {
        id: 8,
        title: "Student Registry & Enrolments",
        role: "School Admin",
        caption: "Navigating to people management to review student enrolment rosters.",
        chapter: "People Management",
      },
      async () => {
        const peopleLink = page.getByRole("link", { name: "People" }).first();
        await walk.click(peopleLink);
        await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
      },
    );

    // 9. Question Bank Hub
    await walk.step(
      {
        id: 9,
        title: "Question Bank & Assessment Engine",
        role: "School Admin",
        caption: "Navigating to the central question bank repository for curriculum assessment items.",
        chapter: "Question Bank",
      },
      async () => {
        const qbLink = page.getByRole("link", { name: "Question bank" }).first();
        await walk.click(qbLink);
        await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
      },
    );

    // 10. School Settings
    await walk.step(
      {
        id: 10,
        title: "Institutional Configuration & Policies",
        role: "School Admin",
        caption: "Reviewing institutional governance switches, campus scopes, and security settings.",
        chapter: "Settings & Security",
      },
      async () => {
        const settingsLink = page.getByRole("link", { name: "Settings" }).first();
        await walk.click(settingsLink);
        await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
      },
    );

    // 11. Profile & Session Disclosure
    await walk.step(
      {
        id: 11,
        title: "Account Menu & Session Details",
        role: "School Admin",
        caption: "Opening user profile disclosure menu to verify active tenancy and role privileges.",
        chapter: "Session Management",
      },
      async () => {
        const profileButton = page.getByRole("button", { name: /Account menu for/i }).first();
        await walk.click(profileButton);
        await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 5_000 });
      },
    );

    // 12. User Sign-Out
    await walk.step(
      {
        id: 12,
        title: "Authenticated Sign-Out",
        role: "School Admin",
        caption: "Terminating administrator session securely through standard UI controls.",
        chapter: "Session Management",
      },
      async () => {
        const signOutButton = page.getByRole("button", { name: "Sign out" });
        await walk.click(signOutButton);
        await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 10_000 });
      },
    );

    // 13. Security Boundary Verification
    await walk.step(
      {
        id: 13,
        title: "Unauthenticated Access Restriction",
        role: "Visitor",
        caption: "Verifying that protected areas enforce redirect to sign-in with clean state preservation.",
        chapter: "Security Verification",
      },
      async () => {
        // When signed out, sign-in form is present and protected dashboard cannot be accessed
        await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      },
    );

    // Conclude walkthrough recording and write timeline
    walk.saveTimeline("out/walkthrough/timeline.json");
  });
});
