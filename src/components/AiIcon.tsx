import type { SVGProps } from "react";

/** Assistant mark (same as unique-ops): thin rounded stroke, a chat bubble with a small spark. */
export function AiIcon({ size = 20, ...p }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <path d="M20.5 11.5a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1.4-4.6A8.5 8.5 0 1 1 20.5 11.5Z" />
      <path d="M12 7.9l.95 2.55 2.55.95-2.55.95L12 14.9l-.95-2.55-2.55-.95 2.55-.95L12 7.9Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
