import { randomBytes } from "node:crypto";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { writeBankAudit } from "@/lib/question-bank/audit";
import { effectiveSettingsIn } from "@/lib/question-bank/settings-service";
import { loadViewer } from "@/lib/question-bank/viewer";
import { mayDecide, mayEditAsSubmitter, staffMaySee, type BankViewer } from "@/lib/question-bank/rules";
import { ImageRejectedError, processQuestionImage } from "@/lib/question-bank/images";
import {
  ITEM_SELECT,
  NOT_FOUND,
  factsOf,
  fail,
  lockItem,
  snapshotOf,
  viewOf,
  type Fail,
  type ItemRow,
  type ItemView,
  type Tx,
} from "@/lib/question-bank/items-common";
import { ACCESS_OFF, bankOpenFor } from "@/lib/question-bank/items-service";
import { getImageStore, StorageError, StorageNotConfiguredError, STORE_NAMES, type ImageStore, type StoreName } from "@/lib/storage";

// Pictures on question bank items (task 0024 slice D). A picture is part of the question, so adding or removing one is an EDIT: the same people may do it, the version goes up with
// a snapshot, a reviewer's change leaves an EDITED review row, and the audit row names the picture. Nothing the person sent is stored: `processQuestionImage` draws it again.
// The browser is never given a backend address; `readImage` runs the question's own access check and the route streams the bytes.
//
// The school comes first, always: every row is read and written through `tenant.run` (row-level security) AND named by the school's id, the item is looked up before the store is
// asked anything, and the storage key carries the school's id, so a key can only ever be built from a row this school's session has just read.

type TenantCtx = TenantAuthContext["tenant"];

const NO_STORE = fail(503, "STORAGE_NOT_CONFIGURED", "Image storage is not configured.");
/// Where every picture lives in a store: one folder for this project, then the school, then the picture's id.
const keyFor = (tenantId: string, imageId: string) => `octalve/${tenantId}/question-bank/${imageId}`;

type Judged = { ok: true; asReviewer: boolean } | Fail;

/// Who may change a question's pictures: whoever may edit its content now. The caller has already established that the person may SEE the question.
function judge(viewer: BankViewer, row: ItemRow): Judged {
  const facts = factsOf(row);
  const asWriter = mayEditAsSubmitter(viewer, facts);
  const asReviewer = !asWriter && mayDecide(viewer, facts, "edit").ok;
  if (!asWriter && !asReviewer) return fail(403, "FORBIDDEN", "You cannot change the pictures of this question.");
  return { ok: true, asReviewer };
}

function storeOrNull(which?: StoreName): ImageStore | null {
  try {
    return getImageStore(which);
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) return null;
    throw error;
  }
}

/// Records the change to the question itself: a new version with a snapshot, an EDITED review row for a reviewer, the item's time stamp. Returns the question as it now is.
async function recordEdit(tx: Tx, tenantId: string, userId: string, before: ItemRow, asReviewer: boolean): Promise<ItemRow> {
  const version = before.version + 1;
  await tx.questionBankItem.update({ where: { id: before.id }, data: { version } });
  const after = await tx.questionBankItem.findFirstOrThrow({ where: { id: before.id, tenantId }, select: ITEM_SELECT });
  await tx.questionBankItemVersion.create({
    data: { tenantId, itemId: after.id, version, snapshot: snapshotOf(after), actorUserId: userId },
  });
  if (asReviewer)
    await tx.questionBankReview.create({ data: { tenantId, itemId: after.id, version, reviewerId: userId, outcome: "EDITED" } });
  return after;
}

export type ImageResult = { ok: true; item: ItemView; imageId: string } | Fail;

export async function addImage(
  tenant: TenantCtx,
  input: { userId: string; itemId: string; bytes: Uint8Array; alt: string; decorative: boolean },
): Promise<ImageResult> {
  const { tenantId } = tenant;
  // 1. Who is asking, and may they. Nothing is decoded for a person who may not.
  const early = await tenant.run(async (tx) => {
    const row = await tx.questionBankItem.findFirst({ where: { id: input.itemId, tenantId }, select: ITEM_SELECT });
    const viewer = await loadViewer(tx, tenantId, input.userId);
    if (!row || !staffMaySee(viewer, factsOf(row), new Date())) return NOT_FOUND;
    const verdict = judge(viewer, row);
    if (!verdict.ok) return verdict;
    if (!(await bankOpenFor(tx, tenantId, viewer, row.campusId))) return fail(403, "BANK_OFF", ACCESS_OFF);
    const settings = await effectiveSettingsIn(tx, tenantId, row.campusId);
    if (row.images.length >= settings["bank.images.max"])
      return fail(409, "IMAGE_LIMIT", `A question can have at most ${settings["bank.images.max"]} pictures.`);
    return { ok: true, limits: { maxBytes: settings["bank.images.maxBytes"], maxLongSide: settings["bank.images.maxLongSide"] } } as const;
  });
  if (!early.ok) return early;

  // 2. A store, then the picture drawn again with the campus's limits.
  const store = storeOrNull();
  if (!store) return NO_STORE;
  let processed;
  try {
    processed = await processQuestionImage(input.bytes, early.limits);
  } catch (error) {
    if (error instanceof ImageRejectedError) return fail(error.reason === "TOO_BIG_UPLOAD" ? 413 : 400, "IMAGE_REJECTED", error.message);
    throw error;
  }

  // 3. The file goes to the store first; the row follows in one transaction that checks the person and the limit again. If the row is refused, the file is removed.
  const imageId = `img_${randomBytes(16).toString("hex")}`;
  const key = keyFor(tenantId, imageId);
  try {
    await store.put(key, processed.bytes, processed.contentType);
  } catch (error) {
    if (error instanceof StorageError || error instanceof StorageNotConfiguredError)
      return fail(502, "STORAGE_FAILED", "The picture could not be saved. Try again in a moment.");
    throw error;
  }

  let result: ImageResult;
  try {
    result = await tenant.run(async (tx): Promise<ImageResult> => {
      const before = await lockItem(tx, tenantId, input.itemId);
      const viewer = await loadViewer(tx, tenantId, input.userId);
      if (!before || !staffMaySee(viewer, factsOf(before), new Date())) return NOT_FOUND;
      const verdict = judge(viewer, before);
      if (!verdict.ok) return verdict;
      if (!(await bankOpenFor(tx, tenantId, viewer, before.campusId))) return fail(403, "BANK_OFF", ACCESS_OFF);
      const settings = await effectiveSettingsIn(tx, tenantId, before.campusId);
      if (before.images.length >= settings["bank.images.max"])
        return fail(409, "IMAGE_LIMIT", `A question can have at most ${settings["bank.images.max"]} pictures.`);

      const sortOrder = before.images.reduce((highest, image) => Math.max(highest, image.sortOrder), -1) + 1;
      await tx.questionBankImage.create({
        data: {
          id: imageId,
          tenantId,
          itemId: before.id,
          storageKey: key,
          store: store.name,
          contentType: processed.contentType,
          alt: input.decorative ? "" : input.alt,
          decorative: input.decorative,
          bytes: processed.bytes.byteLength,
          width: processed.width,
          height: processed.height,
          sortOrder,
        },
      });
      const after = await recordEdit(tx, tenantId, input.userId, before, verdict.asReviewer);
      await writeBankAudit(tx, {
        tenantId,
        campusId: after.campusId,
        itemId: after.id,
        actorUserId: input.userId,
        entity: "ITEM",
        action: "IMAGE_ADDED",
        oldValue: { version: before.version, images: before.images.length },
        newValue: {
          version: after.version,
          images: after.images.length,
          imageId,
          decorative: input.decorative,
          bytes: processed.bytes.byteLength,
          store: store.name,
        },
      });
      return { ok: true, item: await viewOf(tx, viewer, after), imageId };
    });
  } catch (error) {
    await store.remove(key).catch(() => {});
    throw error;
  }
  if (!result.ok) await store.remove(key).catch(() => {});
  return result;
}

export async function removeImage(
  tenant: TenantCtx,
  input: { userId: string; itemId: string; imageId: string },
): Promise<{ ok: true; item: ItemView } | Fail> {
  const { tenantId } = tenant;
  const done = await tenant.run(async (tx) => {
    const before = await lockItem(tx, tenantId, input.itemId);
    const viewer = await loadViewer(tx, tenantId, input.userId);
    if (!before || !staffMaySee(viewer, factsOf(before), new Date())) return NOT_FOUND;
    const verdict = judge(viewer, before);
    if (!verdict.ok) return verdict;
    if (!(await bankOpenFor(tx, tenantId, viewer, before.campusId))) return fail(403, "BANK_OFF", ACCESS_OFF);
    const image = await tx.questionBankImage.findFirst({
      where: { id: input.imageId, itemId: before.id, tenantId },
      select: { id: true, storageKey: true, store: true },
    });
    if (!image) return NOT_FOUND;

    await tx.questionBankImage.delete({ where: { id: image.id } });
    const after = await recordEdit(tx, tenantId, input.userId, before, verdict.asReviewer);
    await writeBankAudit(tx, {
      tenantId,
      campusId: after.campusId,
      itemId: after.id,
      actorUserId: input.userId,
      entity: "ITEM",
      action: "IMAGE_REMOVED",
      oldValue: { version: before.version, images: before.images.length, imageId: image.id },
      newValue: { version: after.version, images: after.images.length },
    });
    return { ok: true, item: await viewOf(tx, viewer, after), file: { key: image.storageKey, store: image.store } } as const;
  });
  if (!done.ok) return done;
  // The row is gone. A store that fails now leaves an unreferenced file, not a row pointing at nothing; nobody can reach it.
  const which = (STORE_NAMES as readonly string[]).includes(done.file.store) ? (done.file.store as StoreName) : undefined;
  const store = which ? storeOrNull(which) : null;
  if (store) {
    await store.remove(done.file.key).catch((error) =>
      console.error("question bank: a removed picture's file was left in the store", {
        imageId: input.imageId,
        store: done.file.store,
        error: String(error?.name ?? error),
      }),
    );
  } else {
    console.error("question bank: a removed picture's file was left in the store (store not configured)", {
      imageId: input.imageId,
      store: done.file.store,
    });
  }
  return { ok: true, item: done.item };
}

export type ServedImage = { ok: true; bytes: Uint8Array; contentType: string } | Fail;

/// The picture's bytes, if the person may see the question it belongs to. The same "Not found" for a picture that does not exist, one on a question they may not see, one of
/// another school, and one whose file the store no longer has. The school's own row is read FIRST; the store is asked only for a key that row holds.
export async function readImage(tenant: TenantCtx, input: { userId: string; itemId: string; imageId: string }): Promise<ServedImage> {
  const { tenantId } = tenant;
  const found = await tenant.run(async (tx) => {
    const viewer = await loadViewer(tx, tenantId, input.userId);
    const image = await tx.questionBankImage.findFirst({
      where: { id: input.imageId, itemId: input.itemId, tenantId },
      select: {
        storageKey: true,
        store: true,
        contentType: true,
        bytes: true,
        item: { select: { campusId: true, subjectKey: true, status: true, visibility: true, visibleFrom: true, submittedById: true } },
      },
    });
    return image && staffMaySee(viewer, image.item, new Date()) ? image : null;
  });
  if (!found) return NOT_FOUND;
  const which = (STORE_NAMES as readonly string[]).includes(found.store) ? (found.store as StoreName) : undefined;
  const store = which ? storeOrNull(which) : null;
  if (!store) return NO_STORE;
  try {
    // our own record says how big it is: a store that returns more is wrong
    const stored = await store.get(found.storageKey, found.bytes * 2 + 1024);
    if (!stored) return NOT_FOUND;
    return { ok: true, bytes: stored.bytes, contentType: found.contentType };
  } catch (error) {
    if (error instanceof StorageError || error instanceof StorageNotConfiguredError)
      return fail(502, "STORAGE_FAILED", "The picture could not be loaded. Try again in a moment.");
    throw error;
  }
}
