import { sendJson } from "@/components/auth/postJson";

export interface PendingPaymentRecord {
  id: string;
  schoolCode: string;
  invoiceId: string;
  studentId: string;
  studentName: string;
  invoiceNo: string;
  amount: number;
  channel: "CASH" | "POS" | "BANK_TRANSFER";
  receiptNo: string;
  note?: string;
  createdAt: number;
  status: "pending" | "syncing" | "failed";
  errorMessage?: string;
}

const DB_NAME = "octalve_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "pending_payments";

export function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("schoolCode", "schoolCode", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function notifySyncChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("octalve-offline-sync-changed"));
  }
}

export async function queueOfflinePayment(
  data: Omit<PendingPaymentRecord, "id" | "createdAt" | "status">,
): Promise<PendingPaymentRecord> {
  const db = await openDb();
  const record: PendingPaymentRecord = {
    ...data,
    id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    createdAt: Date.now(),
    status: "pending",
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(record);

    req.onsuccess = () => {
      notifySyncChanged();
      resolve(record);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingPayments(schoolCode?: string): Promise<PendingPaymentRecord[]> {
  if (!isIndexedDbAvailable()) return [];
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const results = (req.result as PendingPaymentRecord[]) || [];
        if (schoolCode) {
          resolve(results.filter((r) => r.schoolCode === schoolCode));
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function removePendingPayment(id: string): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);

    req.onsuccess = () => {
      notifySyncChanged();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updatePendingPaymentStatus(
  id: string,
  status: "pending" | "syncing" | "failed",
  errorMessage?: string,
): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);

    req.onsuccess = () => {
      const record = req.result as PendingPaymentRecord | undefined;
      if (record) {
        record.status = status;
        if (errorMessage !== undefined) {
          record.errorMessage = errorMessage;
        }
        const putReq = store.put(record);
        putReq.onsuccess = () => {
          notifySyncChanged();
          resolve();
        };
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function syncPendingPayments(
  schoolCode: string,
): Promise<{ synced: number; failed: number }> {
  if (!navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  const items = await getPendingPayments(schoolCode);
  if (items.length === 0) {
    return { synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await updatePendingPaymentStatus(item.id, "syncing");
      const res = await sendJson(
        `/api/v1/schools/${schoolCode}/finance/invoices/${item.invoiceId}/manual-payment`,
        "POST",
        {
          amount: item.amount,
          channel: item.channel,
          receiptNo: item.receiptNo,
          note: item.note ? `${item.note} [Synced from offline receipt]` : "[Synced from offline receipt]",
        },
      );

      if (res.ok) {
        await removePendingPayment(item.id);
        synced++;
      } else {
        await updatePendingPaymentStatus(item.id, "failed", res.message || "Failed to sync payment");
        failed++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error during sync";
      await updatePendingPaymentStatus(item.id, "failed", message);
      failed++;
    }
  }

  notifySyncChanged();
  return { synced, failed };
}
