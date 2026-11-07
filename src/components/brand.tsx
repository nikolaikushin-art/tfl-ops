import { ChevronRight, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * TFL globe mark, on its own.
 *
 * Theme-aware: the navy artwork on light backgrounds, the white artwork on
 * dark ones. Both files are square-trimmed so the globe fills its box — the
 * previous assets carried the wordmark baked in, which is why the mark shrank
 * to nothing when the lockup was scaled down to fit a 56px sidebar header.
 */
export function BrandGlobe({
  className,
  variant = "auto",
}: {
  className?: string;
  variant?: "auto" | "navy" | "white";
}) {
  const base = "block h-full w-full object-contain";
  if (variant === "navy") {
    return <img src="/mark-navy.png" alt="" aria-hidden className={cn(base, className)} draggable={false} />;
  }
  if (variant === "white") {
    return <img src="/mark-white.png" alt="" aria-hidden className={cn(base, className)} draggable={false} />;
  }
  return (
    <span className={cn("block h-full w-full", className)}>
      <img src="/mark-navy.png" alt="" aria-hidden className={cn(base, "light-only")} draggable={false} />
      <img src="/mark-white.png" alt="" aria-hidden className={cn(base, "dark-only")} draggable={false} />
    </span>
  );
}

/**
 * The full stacked lockup, as supplied by the brand — globe above the wordmark.
 *
 * Used only where there is real vertical room (the sign-in screen). In the
 * sidebar it is the wrong shape: scaled to fit a 56px header the wordmark
 * renders a few pixels tall, which is what made the old header look broken.
 * There, `BrandMark` below uses the horizontal arrangement instead.
 */
export function BrandLockup({
  className,
  variant = "auto",
}: {
  className?: string;
  variant?: "auto" | "navy" | "white";
}) {
  const base = "block h-full w-auto object-contain";
  if (variant === "navy") {
    return <img src="/logo-blue.png" alt="The Film Location" className={cn(base, className)} draggable={false} />;
  }
  if (variant === "white") {
    return <img src="/logo-white.png" alt="The Film Location" className={cn(base, className)} draggable={false} />;
  }
  return (
    <span className={cn("block", className)}>
      <img src="/logo-blue.png" alt="The Film Location" className={cn(base, "light-only")} draggable={false} />
      <img src="/logo-white.png" alt="The Film Location" className={cn(base, "dark-only")} draggable={false} />
    </span>
  );
}

const LOCKUP_SIZES = {
  sm: { box: "h-7 w-7", word: "h-6", gap: "gap-2" },
  md: { box: "h-9 w-9", word: "h-8", gap: "gap-2.5" },
  lg: { box: "h-12 w-12", word: "h-10", gap: "gap-3" },
  xl: { box: "h-20 w-20", word: "h-[68px]", gap: "gap-4" },
} as const;

/**
 * The wordmark exactly as in the original logo (same typeface, same navy, same
 * letter-spacing on GROUP) — cut from the supplied artwork, so it can never
 * drift from the brand the way live text in another font did.
 */
function BrandWordmarkImage({ variant, className }: { variant: "auto" | "navy" | "white"; className?: string }) {
  const base = "block w-auto select-none object-contain";
  if (variant === "navy") return <img src="/wordmark-navy.png" alt="The Film Location" className={cn(base, className)} draggable={false} />;
  if (variant === "white") return <img src="/wordmark-white.png" alt="The Film Location" className={cn(base, className)} draggable={false} />;
  return (
    <span className="block">
      <img src="/wordmark-navy.png" alt="The Film Location" className={cn(base, "light-only", className)} draggable={false} />
      <img src="/wordmark-white.png" alt="The Film Location" className={cn(base, "dark-only", className)} draggable={false} />
    </span>
  );
}

/**
 * Primary lockup: globe left, wordmark right — both cut from the original logo,
 * navy on light backgrounds and white on dark ones.
 */
export function BrandMark({
  className,
  size = "md",
  variant = "auto",
  showWordmark = true,
}: {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "auto" | "navy" | "white";
  showWordmark?: boolean;
}) {
  const s = LOCKUP_SIZES[size];
  return (
    <span className={cn("inline-flex select-none items-center", s.gap, className)}>
      <span className={cn("shrink-0", s.box)}>
        <BrandGlobe variant={variant} />
      </span>
      {showWordmark ? <BrandWordmarkImage variant={variant} className={s.word} /> : null}
    </span>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight text-accent text-lg", className)}>
      THE FILM LOCATION
    </span>
  );
}

/** Accent rule under section titles. */
export function AccentRule({ className }: { className?: string }) {
  return <span className={cn("block h-[2px] w-7 rounded-full bg-accent-fill", className)} />;
}

export function BrandCard({
  children,
  className,
  padding = "p-[14px]",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
  hover?: boolean;
}) {
  return (
    <div className={cn("brand-card", hover && "card-hover", padding, className)}>
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  trailing,
  action,
}: {
  title: string;
  trailing?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[17px] font-bold leading-tight text-ink">{title}</h2>
        <AccentRule />
      </div>
      {trailing ? (
        <span className="text-[13px] font-medium text-ink-secondary tabular-nums">{trailing}</span>
      ) : null}
      {action}
    </div>
  );
}

export function StatBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-ink-secondary">{label}</div>
      <div className="tnum mt-1 text-[20px] font-bold leading-none tracking-tight text-ink">
        {value}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-ink-tertiary">{hint}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state brand-card min-h-[200px]">
      {Icon ? <Icon className="mb-3 h-10 w-10 text-ink-tertiary" strokeWidth={1.25} /> : null}
      <div className="text-[16px] font-semibold text-ink">{title}</div>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PrimaryButton({
  children,
  icon: Icon,
  onClick,
  disabled = false,
  tone = "accent",
  type = "button",
  className,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "accent" | "success" | "neutral";
  type?: "button" | "submit";
  className?: string;
}) {
  const toneClass = disabled
    ? "bg-elevated text-ink-tertiary"
    : {
        accent: "bg-accent-fill text-white",
        success: "bg-success text-white",
        neutral: "bg-elevated text-ink",
      }[tone];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "brand-focus brand-pressable inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-opacity",
        toneClass,
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="brand-focus relative flex h-9 w-9 items-center justify-center rounded-control text-ink-secondary transition-colors hover:bg-elevated hover:text-ink"
    >
      <Icon className="h-4 w-4" />
      {badge && badge > 0 ? (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-fill px-1 text-[9px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </button>
  );
}

export function SettingsRow({
  icon: Icon,
  iconClass,
  title,
  subtitle,
  onClick,
}: {
  icon: LucideIcon;
  iconClass?: string;
  title: string;
  subtitle?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="row-hover flex w-full items-center gap-3 px-3.5 py-3 text-left"
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-white",
          iconClass || "bg-accent-fill",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-medium tracking-tight text-ink">{title}</div>
        {subtitle ? (
          <div className="truncate text-[13px] text-ink-secondary">{subtitle}</div>
        ) : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-tertiary" />
    </button>
  );
}

export const inputClass =
  "h-11 w-full rounded-control border border-divider bg-canvas px-3 text-[15px] text-ink placeholder:text-ink-tertiary outline-none focus:border-accent";

export function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string; short?: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  // Fixed control, never scrollable and never clipped. Four fit levels, tried in
  // order until the content fits the container: full labels -> short labels ->
  // short labels with tighter padding -> buttons wrap onto a second row. Natural
  // widths are remembered so it steps back up as soon as there is room again.
  const ref = useRef<HTMLDivElement>(null);
  const need = useRef<number[]>([0, 0, 0, 0]);
  const [level, setLevel] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      need.current[level] = el.scrollWidth;
      if (el.scrollWidth > el.clientWidth + 1 && level < 3) {
        setLevel(level + 1);
      } else if (level > 0 && el.clientWidth >= need.current[level - 1] + 2 && need.current[level - 1] > 0) {
        setLevel(level - 1);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [level, options]);

  return (
    <div
      ref={ref}
      className={cn(
        "ios-fill flex w-full min-w-0 gap-0.5 overflow-hidden rounded-[10px] p-0.5",
        level === 3 && "flex-wrap",
      )}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          title={o.label}
          className={cn(
            "brand-focus flex h-8 shrink-0 flex-auto items-center justify-center whitespace-nowrap rounded-[8px] text-[12px] font-semibold transition-colors sm:text-[13px]",
            level >= 2 ? "px-1.5" : "px-3",
            level === 3 && "min-w-[30%]",
            value === o.id ? "bg-surface text-ink shadow-sm" : "text-ink-secondary hover:text-ink",
          )}
        >
          {level > 0 && o.short ? o.short : o.label}
        </button>
      ))}
    </div>
  );
}
