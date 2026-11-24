"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast, ToastViewport } from "@/components/cs";
import type { StaffActionResult } from "@/app/(staff)/actions";

/** One toast at a time for staff actions. Demo results say so: nothing left the system. */
export function useActionToast() {
  const [toast, setToast] = useState<StaffActionResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((r: StaffActionResult) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(r);
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const node = toast ? (
    <ToastViewport>
      <Toast
        tone={toast.ok ? "success" : "error"}
        title={toast.ok ? (toast.demo ? `Demo · ${toast.message}` : toast.message) : toast.message}
        description={toast.ok && toast.demo ? "Demo mode: nothing was sent." : undefined}
        onDismiss={() => setToast(null)}
      />
    </ToastViewport>
  ) : null;

  return { show, node };
}
