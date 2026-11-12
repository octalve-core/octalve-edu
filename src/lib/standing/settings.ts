import { ceilingSwitch } from "@/lib/settings/ceiling-switch";

// The one setting of standing (task 0028, design 4.7): may an administrator of a campus suspend there? The school's value is the ceiling; a campus can only turn it off. It holds
// campus administrators, never the school's administrator. The mechanism is the shared ceiling switch over `TenantSetting`.

export const MAY_SUSPEND_KEY = "standing.campusAdminMaySuspend";

export const maySuspendSwitch = ceilingSwitch({ key: MAY_SUSPEND_KEY, auditAction: "STANDING_SETTING_CHANGED" });
