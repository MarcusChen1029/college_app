// The browser's DeviceStorage (device-passwords.ts) on IndexedDB: database "trakur-device-passwords", one per origin.
//   keys    keyPath "userId"            { userId, key }  the account's non-extractable AES-GCM CryptoKey, stored as the object
//   values  keyPath ["userId", "slot"]  { userId, slot, value }  "d1.<...>" sealed values; index "byUser" on userId
// Small on purpose: every call opens one transaction, chains its requests by callback (never by await, which could let
// the transaction close in between) and settles when the transaction completes. Any failure (no IndexedDB in this window,
// a refused open, a blocked upgrade, an aborted transaction) rejects with a plain Error("unavailable") that carries no
// browser detail; device-passwords.ts reports it as "unavailable". Nothing is logged. Only ever called in the browser:
// nothing here touches indexedDB at import time.

import type { DeviceStorage } from "./device-passwords.ts";

const DB_NAME = "trakur-device-passwords";
const DB_VERSION = 1;
const KEYS = "keys";
const VALUES = "values";
const BY_USER = "byUser";
const OPEN_TIMEOUT_MS = 5_000; // an open blocked by another tab's old connection must not hang the page

type KeyRow = { userId: string; key: CryptoKey };
type ValueRow = { userId: string; slot: string; value: string };

const unavailable = () => new Error("unavailable");

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(unavailable());
    }, OPEN_TIMEOUT_MS);
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(unavailable());
    };
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(KEYS)) db.createObjectStore(KEYS, { keyPath: "userId" });
        if (!db.objectStoreNames.contains(VALUES)) db.createObjectStore(VALUES, { keyPath: ["userId", "slot"] }).createIndex(BY_USER, "userId");
      };
      req.onsuccess = () => {
        const db = req.result;
        if (settled) {
          db.close(); // too late: the caller was already told "unavailable"
          return;
        }
        settled = true;
        clearTimeout(timer);
        // A newer version opened in another tab, or the browser closed it: open again next time.
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        db.onclose = () => {
          opening = null;
        };
        resolve(db);
      };
      req.onerror = fail;
    } catch {
      fail();
    }
  });
  opening = p;
  p.catch(() => {
    if (opening === p) opening = null; // try again on the next call
  });
  return p;
}

// One transaction: `start` issues its requests (chaining further ones from their callbacks) and records the answer with
// `set`; the promise settles when the transaction completes, so a write has landed when it resolves.
function inTx<T>(stores: string | string[], mode: IDBTransactionMode, fallback: T, start: (tx: IDBTransaction, set: (v: T) => void) => void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let value = fallback;
        try {
          const tx = db.transaction(stores, mode);
          tx.oncomplete = () => resolve(value);
          tx.onerror = () => reject(unavailable());
          tx.onabort = () => reject(unavailable());
          start(tx, (v) => {
            value = v;
          });
        } catch {
          reject(unavailable());
        }
      }),
  );
}

/** IndexedDB as DeviceStorage, or null when this browser has none (or won't let this page use it). */
export function idbDeviceStorage(): DeviceStorage | null {
  try {
    if (typeof indexedDB === "undefined" || !indexedDB) return null;
  } catch {
    return null; // some sandboxed or cookie-blocked pages throw on merely reading indexedDB
  }
  return {
    getKey: (userId) =>
      inTx<CryptoKey | null>(KEYS, "readonly", null, (tx, set) => {
        const req = tx.objectStore(KEYS).get(userId);
        req.onsuccess = () => set((req.result as KeyRow | undefined)?.key ?? null);
      }),
    addKey: (userId, key) =>
      inTx(KEYS, "readwrite", false, (tx, set) => {
        const store = tx.objectStore(KEYS);
        const req = store.get(userId);
        req.onsuccess = () => {
          if (req.result !== undefined) return; // kept, never replaced
          store.add({ userId, key } satisfies KeyRow);
          set(true);
        };
      }),
    getValue: (userId, slot) =>
      inTx<string | null>(VALUES, "readonly", null, (tx, set) => {
        const req = tx.objectStore(VALUES).get([userId, slot]);
        req.onsuccess = () => {
          const v = (req.result as ValueRow | undefined)?.value;
          set(typeof v === "string" ? v : null);
        };
      }),
    putValue: (userId, slot, value) =>
      inTx<void>(VALUES, "readwrite", undefined, (tx) => {
        tx.objectStore(VALUES).put({ userId, slot, value } satisfies ValueRow);
      }),
    addValue: (userId, slot, value) =>
      inTx(VALUES, "readwrite", false, (tx, set) => {
        const store = tx.objectStore(VALUES);
        const req = store.get([userId, slot]);
        req.onsuccess = () => {
          if (req.result !== undefined) return;
          store.add({ userId, slot, value } satisfies ValueRow);
          set(true);
        };
      }),
    deleteValue: (userId, slot) =>
      inTx<void>(VALUES, "readwrite", undefined, (tx) => {
        tx.objectStore(VALUES).delete([userId, slot]);
      }),
    // Read and delete in the same readwrite transaction: no other write to this store can land between them.
    deleteValueIf: (userId, slot, value) =>
      inTx(VALUES, "readwrite", false, (tx, set) => {
        const store = tx.objectStore(VALUES);
        const req = store.get([userId, slot]);
        req.onsuccess = () => {
          if ((req.result as ValueRow | undefined)?.value !== value) return;
          store.delete([userId, slot]);
          set(true);
        };
      }),
    listSlots: (userId) =>
      inTx<string[]>(VALUES, "readonly", [], (tx, set) => {
        const req = tx.objectStore(VALUES).index(BY_USER).getAll(IDBKeyRange.only(userId));
        req.onsuccess = () => set((req.result as ValueRow[]).map((r) => r?.slot).filter((s): s is string => typeof s === "string"));
      }),
    deleteAccount: (userId) =>
      inTx<void>([KEYS, VALUES], "readwrite", undefined, (tx) => {
        tx.objectStore(KEYS).delete(userId);
        const req = tx.objectStore(VALUES).index(BY_USER).openCursor(IDBKeyRange.only(userId));
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
      }),
  };
}
