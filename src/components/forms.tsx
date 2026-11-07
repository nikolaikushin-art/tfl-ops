import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/brand";

/** Section card used to group related fields inside a data-entry form. */
export function FormSection({
  title,
  description,
  children,
  cols = 2,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  cols?: 1 | 2;
}) {
  return (
    <div className="brand-card p-5 sm:p-6 space-y-4">
      <div>
        <div className="text-[13px] font-semibold uppercase tracking-wide text-ink-secondary">{title}</div>
        {description ? <p className="mt-0.5 text-[12px] text-ink-tertiary">{description}</p> : null}
      </div>
      <div className={cn("grid gap-4", cols === 2 ? "sm:grid-cols-2" : "grid-cols-1")}>{children}</div>
    </div>
  );
}

/** A single labeled input/select/textarea field for use inside FormSection. */
export function Field({
  label,
  required,
  hint,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", full && "sm:col-span-2")}>
      <label className="flex items-baseline gap-1 text-[13px] font-medium text-ink-secondary">
        {label}
        {required ? <span className="text-accent">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-ink-tertiary">{hint}</p> : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, "h-11", props.className)} />;
}

export function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputClass, "h-11 appearance-none")}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      rows={props.rows ?? 3}
      className={cn(
        "w-full rounded-control border border-divider bg-canvas px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-tertiary outline-none focus:border-accent resize-none",
        props.className,
      )}
    />
  );
}
