// The fictional people and school of the walkthrough, and the throwaway password they share. Nothing here is real: the names, the addresses (.test is reserved and never delivers) and the password
// are made up for the recording, and the run's database is thrown away.

export const PASSWORD = "Heron-Lantern-Quartz-2026";

export const cast = {
  // The first administrator of the school. In Solo the wizard makes them (C01); in SaaS the platform superadministrator onboards the school and invites them.
  schoolAdmin: { name: "Amina Yusuf", email: "amina.yusuf@walkthrough.test" },
  // The people the school administrator invites in C03. Each accepts through the link in the dev inbox and chooses the name typed there.
  campusAdmin: { name: "Bola Adeyemi", email: "bola.adeyemi@walkthrough.test" },
  teacher: { name: "Chidi Okafor", email: "chidi.okafor@walkthrough.test" },
  staff: { name: "Dayo Lawal", email: "dayo.lawal@walkthrough.test" },
  // An address typed wrongly on purpose: its invitation is revoked.
  mistyped: { email: "bola.adeyem@walkthrough.test" },
};

/// The setup token of this run: made by the runner (scripts/walkthrough-run/run.mjs), handed over in the environment, never printed. The journey types it, as a person would.
export const setupToken = (): string => process.env.WALKTHROUGH_SETUP_TOKEN ?? "";

/// The dev inbox's unlock token of this run: made by the runner, handed over in the environment, never printed. The journey types it into the inbox's own field, as a person would.
export const devToolsToken = (): string => process.env.WALKTHROUGH_DEV_TOOLS_TOKEN ?? "";

/// The fictional school of the walkthrough: its name (typed in the wizard), its campuses (typed on the Settings page, C02) and the one setting the chapter changes.
export const school = {
  name: "Demonstration School",
  campuses: { north: "North Campus", south: "South Campus" },
  timeZone: { from: "UTC", to: "Africa/Lagos" },
};
