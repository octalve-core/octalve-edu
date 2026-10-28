import type { FormKind } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { loadViewer } from "@/lib/question-bank/viewer";
import { mayAccessForm, type FormAccess } from "@/lib/question-bank/rules";

// The one place the forms module asks "may this person reach this form by its id?" (task 0024, the campus rule for forms). The rule itself is `mayAccessForm` in the question bank's
// rules (a pure function with a table test); this file only loads the facts it needs inside the transaction of the request, so a person removed or moved a moment ago is not trusted
// on a read from before. Every staff service that takes a form's id (or the id of a response or a turn-in, through its form) goes through `reachForm`.

export type ReachedForm = { id: string; kind: FormKind; campusId: string | null; createdById: string };

const FACTS = { id: true, kind: true, campusId: true, createdById: true } as const;

/// The form `formId` of the school when `userId` may reach it as `access` says; null when it does not exist OR the person may not, and the caller answers both the same way ("not
/// found"), so a form's id is never confirmed to someone outside its campus. `kind` narrows to one kind of form.
export async function reachForm(
  tx: Tx,
  params: { tenantId: string; userId: string; formId: string; access: FormAccess; kind?: FormKind },
): Promise<ReachedForm | null> {
  const viewer = await loadViewer(tx, params.tenantId, params.userId);
  const form = await tx.form.findFirst({
    where: { id: params.formId, tenantId: params.tenantId, ...(params.kind ? { kind: params.kind } : {}) },
    select: FACTS,
  });
  return form && mayAccessForm(viewer, form, params.access) ? form : null;
}

/// The `where` of a list of forms for a person whose session is bound to `campusId`: that campus's forms and the whole school's (the latter are viewable by any staff). A person with
/// no campus (the administrator, or a member of the whole school) lists them all.
export function campusFilter(campusId: string | null | undefined): { OR?: Array<{ campusId: string | null }> } {
  return campusId ? { OR: [{ campusId }, { campusId: null }] } : {};
}
