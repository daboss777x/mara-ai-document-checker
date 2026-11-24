"use client";

import { useRef, useState } from "react";
import { Camera, Check, Loader2 } from "lucide-react";
import { Button, DropZone } from "@/components/cs";
import { confirmUploadAction, createUploadAction } from "@/app/c/[token]/actions";
import { cn } from "@/lib/utils";
import type { ClientUploadConfig } from "@/lib/view-models";
import { bytesLabel, isDemoUploadUrl, toUploadInput, validateUpload } from "./format";
import { useClientToast } from "./toast-provider";

type State =
  | { kind: "idle" }
  | { kind: "sending"; name: string; size: number; step: "preparing" | "uploading" | "finishing" }
  | { kind: "failed"; name: string; size: number; error: string; file: File | null }
  | { kind: "done"; name: string; demo: boolean };

const ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png";
const STEP_LABEL = { preparing: "Getting ready", uploading: "Uploading", finishing: "Finishing up" } as const;

/**
 * Upload panel for one checklist item. Three steps, all error-handled:
 * 1) ask the server for an upload slot, 2) PUT the bytes straight to storage (never through
 * Vercel; demo mode skips this), 3) confirm so Mara starts checking.
 */
export function UploadPanel({
  token,
  itemId,
  itemName,
  config,
  fix,
}: {
  token: string;
  itemId: string;
  itemName: string;
  config: ClientUploadConfig;
  /** True when this is a re-upload after a fix request. */
  fix: boolean;
}) {
  const toast = useClientToast();
  const [state, setState] = useState<State>({ kind: "idle" });
  const photo = useRef<HTMLInputElement>(null);

  async function send(file: File) {
    const bad = validateUpload(file, config);
    if (bad) {
      setState({ kind: "failed", name: file.name, size: file.size, error: bad, file: null });
      return;
    }
    const base = { name: file.name, size: file.size };
    try {
      setState({ kind: "sending", ...base, step: "preparing" });
      const slot = await createUploadAction(token, itemId, toUploadInput(file));
      if (!slot.ok) throw new Error(slot.error);

      if (!isDemoUploadUrl(slot.data.uploadUrl)) {
        setState({ kind: "sending", ...base, step: "uploading" });
        const put = await fetch(slot.data.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": toUploadInput(file).mime },
          body: file,
        });
        if (!put.ok) throw new Error("The upload didn't go through. Check your connection and try again.");
      }

      setState({ kind: "sending", ...base, step: "finishing" });
      const done = await confirmUploadAction(token, slot.data.documentId);
      if (!done.ok) throw new Error(done.error);
      setState({ kind: "done", name: file.name, demo: done.mode === "demo" });
      toast({ tone: "success", title: done.message, description: done.mode === "demo" ? "Demo mode. Nothing was uploaded or sent." : undefined });
    } catch (e) {
      const error = e instanceof Error && e.message ? e.message : "The upload didn't go through. Try again.";
      setState({ kind: "failed", ...base, error, file });
      toast({ tone: "error", title: "Upload didn't go through", description: error });
    }
  }

  const pick = (files: File[]) => {
    if (files.length > 1) {
      setState({ kind: "failed", name: `${files.length} files`, size: 0, error: "Upload one file at a time. Put all pages in one PDF, or send them one by one.", file: null });
      return;
    }
    if (files[0]) void send(files[0]);
  };

  const busy = state.kind === "sending";

  return (
    <section aria-labelledby="upload-title" className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold tracking-[2.5px] text-cs-brand uppercase">{fix ? "Upload a fixed copy" : "Upload"}</p>
        <h2 id="upload-title" className="mt-1 font-display text-[30px] leading-none">
          {itemName}
        </h2>
        <p className="mt-2 text-cs-ink-2">Send every page. We check that all pages are there, plus signatures, initials and dates.</p>
      </div>

      {state.kind === "done" ? (
        <div role="status" className="flex items-start gap-2 rounded-2xl bg-cs-ok-bg px-4 py-3 text-[14.5px] text-cs-ok">
          <Check className="mt-0.5 size-4 flex-none" aria-hidden="true" />
          <div className="flex-1">
            <p>
              Got it, <strong className="break-all">{state.name}</strong>. Mara is checking it now. We&apos;ll text you if anything&apos;s missing.
            </p>
            {state.demo ? <p className="mt-1 text-[13px] opacity-80">Demo mode: nothing was uploaded or sent.</p> : null}
          </div>
        </div>
      ) : (
        <>
          <DropZone
            onFiles={pick}
            multiple={false}
            disabled={busy}
            title="Choose a file or drag it here"
            description={config.acceptLabel}
            accept={ACCEPT}
            actionLabel="Choose a file"
            error={state.kind === "failed" ? state.error : undefined}
            className="border-[#9fbdf0] bg-[#f2f7ff]"
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => photo.current?.click()}
              className="mt-3 inline-flex h-11 items-center gap-2 rounded-full border border-cs-line bg-white px-4 text-sm font-medium disabled:opacity-60 min-[900px]:hidden"
            >
              <Camera className="size-4" aria-hidden="true" /> Take a photo
            </button>
          </DropZone>
          <input
            ref={photo}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            tabIndex={-1}
            onChange={(e) => {
              pick(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </>
      )}

      {state.kind === "sending" ? (
        <div role="status" className="flex items-center gap-3 rounded-[18px] border border-[#dbe4f3] bg-white px-[18px] py-4">
          <Loader2 className="size-5 flex-none animate-spin text-cs-brand" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold break-all">{state.name}</p>
            <p className="text-[13px] text-cs-ink-3">
              {STEP_LABEL[state.step]} · {bytesLabel(state.size)}
            </p>
          </div>
        </div>
      ) : null}

      {state.kind === "failed" && state.file ? (
        <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-cs-bad-line bg-[#fff7f7] px-[18px] py-3")}>
          <p className="text-sm text-cs-bad">
            <strong className="break-all">{state.name}</strong> didn&apos;t send.
          </p>
          <Button variant="secondary" className="h-10" onClick={() => void send(state.file!)}>
            Try again
          </Button>
        </div>
      ) : null}

      {state.kind === "done" ? (
        <div>
          <Button variant="secondary" onClick={() => setState({ kind: "idle" })}>
            Upload another file
          </Button>
        </div>
      ) : null}
    </section>
  );
}
