/**
 * Mail rules + the list of connected mailboxes, kept in browser storage (demo)
 * and shared between the Mail screen and Settings through one event, so they
 * never disagree. The server build moves this into the database.
 */
import { useCallback, useEffect, useState } from "react";
import { loadValue, saveValue } from "@/lib/storage";
import { EMPTY_RULES, type SenderRules } from "@/lib/senders";

const RULES_KEY = "mail.senderRules";
const BOXES_KEY = "mail.mailboxes";
const EVT = "tfl:mail-rules";

export function useMailRules() {
  const read = () => ({
    rules: { ...EMPTY_RULES, ...(loadValue<SenderRules>(RULES_KEY) ?? {}) } as SenderRules,
    mailboxes: loadValue<string[]>(BOXES_KEY) ?? [],
  });
  const [snap, setSnap] = useState(read);
  useEffect(() => {
    const on = () => setSnap(read());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
     
  }, []);
  const setRules = useCallback((next: SenderRules) => {
    saveValue(RULES_KEY, next);
    window.dispatchEvent(new Event(EVT));
  }, []);
  const setMailboxes = useCallback((next: string[]) => {
    saveValue(BOXES_KEY, next);
    window.dispatchEvent(new Event(EVT));
  }, []);
  return { rules: snap.rules, mailboxes: snap.mailboxes, setRules, setMailboxes };
}
