/**
 * The historical-import review queue, kept in browser storage (demo) so a
 * half-reviewed import survives a reload. The server build stores it in the database.
 */
import { useCallback, useEffect, useState } from "react";
import { loadValue, saveValue } from "@/lib/storage";
import type { ReviewItem } from "@/lib/historicalImport";

const KEY = "import.queue";
const EVT = "tfl:import-queue";

export function useImportQueue() {
  const [items, setItems] = useState<ReviewItem[]>(() => loadValue<ReviewItem[]>(KEY) ?? []);
  useEffect(() => {
    const on = () => setItems(loadValue<ReviewItem[]>(KEY) ?? []);
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  const save = useCallback((next: ReviewItem[]) => {
    saveValue(KEY, next);
    setItems(next);
    window.dispatchEvent(new Event(EVT));
  }, []);
  return { items, save };
}
