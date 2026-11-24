"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Toast, ToastViewport, type ToastTone } from "@/components/cs";

type ToastInput = { tone?: ToastTone; title: string; description?: string };
type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/** Queue for kit Toasts on the client portal.  */
export function ClientToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), t.tone === "error" ? 8000 : 5000),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <ToastViewport className="bottom-6">
        {items.map((t) => (
          <Toast key={t.id} tone={t.tone} title={t.title} description={t.description} onDismiss={() => dismiss(t.id)} />
        ))}
      </ToastViewport>
    </ToastContext.Provider>
  );
}

export const useClientToast = () => useContext(ToastContext);
