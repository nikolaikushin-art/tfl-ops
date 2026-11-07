/**
 * Choose a real file for a document. The text inside it (PDF, Excel, CSV, text) is read in the
 * browser so deal capture can use the contents, not just the file name. Nothing is uploaded anywhere.
 */
import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { readDocumentText } from "@/lib/readFile";

export interface PickedFile {
  originalName: string;
  mimeType: string;
  size: number;
  extractedText?: string;
}

export function DocFilePicker({ onPicked }: { onPicked: (f: PickedFile | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const choose = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setStatus("Reading…");
    const r = await readDocumentText(file);
    onPicked({ originalName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, extractedText: r.text || undefined });
    setStatus(r.text ? `${file.name}: read ${r.text.length.toLocaleString()} characters of text` : `${file.name}: ${r.problem ?? "no text found"}`);
    setBusy(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-2 rounded-xl border border-divider px-3 py-2 text-[13px] font-medium text-ink hover:bg-elevated disabled:opacity-50"
      >
        <FileUp className="h-4 w-4" /> Choose file (PDF, Excel, CSV or text)
      </button>
      <input
        ref={ref}
        type="file"
        accept=".pdf,.xlsx,.xlsm,.csv,.tsv,.txt,.eml,.md"
        className="hidden"
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {status ? <span className="text-[12px] text-ink-secondary" role="status">{status}</span> : <span className="text-[12px] text-ink-tertiary">Optional. The contents are read here in your browser and used to spot the deal.</span>}
    </div>
  );
}
