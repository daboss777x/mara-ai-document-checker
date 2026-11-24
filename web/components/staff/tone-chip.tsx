import { StatusChip, type ChipTone } from "@/components/cs";
import type { Chip, Tone } from "@/lib/view-models";

const TONE_TO_CHIP: Record<Tone, ChipTone> = { ok: "done", warn: "fix", bad: "block", info: "check", neutral: "todo" };

export const chipTone = (tone: Tone): ChipTone => TONE_TO_CHIP[tone];

/** A view-model chip (label + tone) rendered with the kit's StatusChip (icon + text + colour). */
export function ToneChip({ chip, className }: { chip: Chip; className?: string }) {
  return (
    <StatusChip tone={chipTone(chip.tone)} className={className}>
      {chip.label}
    </StatusChip>
  );
}
