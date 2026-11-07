// File attachments for TFL records (Stage 2h).
// Files live in this browser's IndexedDB, not in localStorage, so big files do not
// fill the 5 MB localStorage quota. They are NOT part of the server snapshot or the
// JSON backup: only the browser that attached them holds them.
import { useCallback, useEffect, useState } from "react";

import { checkFile } from "@/lib/attachments";
const DB = "tfl-files";
const STORE = "files";

export type TflFileMeta = { id: string; owner: string; name: string; size: number; type: string; added: string };
type Row = TflFileMeta & { blob: Blob };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser cannot store files."));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("owner", "owner");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open file storage."));
  });
}

function wrap<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("File storage failed.")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("File storage failed.")); };
  });
}

const meta = ({ blob: _b, ...m }: Row): TflFileMeta => m;
const changed = () => { try { window.dispatchEvent(new Event("tfl:files")); } catch { /* ignore */ } };

export async function listFiles(owner: string): Promise<TflFileMeta[]> {
  const db = await open();
  const rows = await wrap<Row[]>(db, "readonly", (s) => s.index("owner").getAll(owner) as IDBRequest<Row[]>);
  return rows.map(meta).sort((a, b) => b.added.localeCompare(a.added));
}

export async function addFile(owner: string, file: File): Promise<TflFileMeta> {
  const problem = checkFile(file);
  if (problem) throw new Error(problem);
  const row: Row = {
    id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    owner, name: file.name, size: file.size, type: file.type || "application/octet-stream",
    added: new Date().toISOString(), blob: file,
  };
  const db = await open();
  await wrap(db, "readwrite", (s) => s.add(row));
  changed();
  return meta(row);
}

export async function getFileBlob(id: string): Promise<Blob | null> {
  const db = await open();
  const row = await wrap<Row | undefined>(db, "readonly", (s) => s.get(id) as IDBRequest<Row | undefined>);
  return row?.blob ?? null;
}

export async function removeFile(id: string): Promise<void> {
  const db = await open();
  await wrap(db, "readwrite", (s) => s.delete(id));
  changed();
}

/** Delete every file of a record (used when the record itself is deleted). */
export async function removeOwnerFiles(owner: string): Promise<void> {
  try {
    const files = await listFiles(owner);
    await Promise.all(files.map((f) => removeFile(f.id)));
  } catch { /* storage unavailable: nothing to clean */ }
}

export function useFiles(owner: string) {
  const [files, setFiles] = useState<TflFileMeta[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    listFiles(owner).then((f) => { setFiles(f); setError(""); }).catch((e: Error) => setError(e.message));
  }, [owner]);
  useEffect(() => {
    refresh();
    window.addEventListener("tfl:files", refresh);
    return () => window.removeEventListener("tfl:files", refresh);
  }, [refresh]);
  return { files, error, setError, refresh };
}
