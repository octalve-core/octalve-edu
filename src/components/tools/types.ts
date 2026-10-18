import type { ComponentType } from "react";
import type { Role } from "@prisma/client";

export type QuickToolId = "calculator" | "payment-recorder" | "payment-link" | "broadcast" | "scratchpad";

export interface QuickToolDefinition {
  id: QuickToolId;
  name: string;
  shortName: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  requiredRoles?: Role[];
  badge?: string;
}
