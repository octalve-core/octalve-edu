import type { Prisma, Role } from "@prisma/client";

// The sign-in account of a pupil or a guardian, as a record's view carries it (task 0065). A staff record has the same idea with one more state (an open invitation, `StaffAccount`); a pupil's or a
// guardian's account is made on the Users page (an invitation with the role Student or Parent) and then linked to the record, so a record has an account or it has none.

/// What the account's membership tells: the person (name and address), the role, and whether the school switched their access off on the Users page.
export const ACCOUNT_SELECT = {
  role: true,
  deactivatedAt: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.TenantMembershipSelect;
type MembershipRow = Prisma.TenantMembershipGetPayload<{ select: typeof ACCOUNT_SELECT }>;

export type PersonAccount =
  | { state: "none" }
  | {
      state: "linked";
      userId: string;
      name: string | null;
      email: string | null;
      role: Role;
      /// Deactivated on the Users page: the link remains, the person cannot sign in.
      deactivated: boolean;
      /// The member's role no longer matches the record's kind (the Users page changed it): shown, not forbidden.
      roleDiffers: boolean;
    };

/// The role a person must hold to sign in as this kind of record.
export const ACCOUNT_ROLE = { student: "STUDENT", guardian: "PARENT" } as const satisfies Record<string, Role>;
export type AccountKind = keyof typeof ACCOUNT_ROLE;

export function toPersonAccount(kind: AccountKind, userId: string | null, membership: MembershipRow | null): PersonAccount {
  if (!userId || !membership) return { state: "none" };
  return {
    state: "linked",
    userId,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    deactivated: membership.deactivatedAt !== null,
    roleDiffers: membership.role !== ACCOUNT_ROLE[kind],
  };
}
