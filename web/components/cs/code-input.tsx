"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * One-time-code entry: N single-digit boxes. Controlled string `value` (digits only).
 * Auto-advances, Backspace steps back, arrows move, paste fills all boxes.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  invalid = false,
  disabled = false,
  label = "6-digit code",
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  length?: number;
  invalid?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function commit(next: string, focusIndex: number) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    refs.current[Math.min(focusIndex, length - 1)]?.focus();
  }

  function onInput(i: number, raw: string) {
    const d = raw.replace(/\D/g, "");
    if (!d) return;
    const chars = digits.slice();
    // A multi-char input (autofill) spreads across boxes.
    d.split("").forEach((c, k) => {
      if (i + k < length) chars[i + k] = c;
    });
    commit(chars.join(""), i + d.length);
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const chars = digits.slice();
      if (chars[i]) chars[i] = "";
      else if (i > 0) {
        chars[i - 1] = "";
        refs.current[i - 1]?.focus();
      }
      onChange(chars.join("").replace(/\D/g, ""));
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    commit(e.clipboardData.getData("text"), length);
  }

  return (
    <fieldset className={cn("min-w-0", className)} disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-cs-ink">{label}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1} of ${length}`}
            aria-invalid={invalid || undefined}
            onChange={(e) => onInput(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
            className={cn(
              "h-[58px] min-w-0 rounded-[14px] border bg-white/90 text-center text-[22px] text-cs-ink shadow-[inset_0_1px_2px_rgba(10,40,110,0.06)] disabled:opacity-55",
              invalid ? "border-cs-bad-line bg-cs-bad-bg" : "border-cs-line",
            )}
          />
        ))}
      </div>
    </fieldset>
  );
}
