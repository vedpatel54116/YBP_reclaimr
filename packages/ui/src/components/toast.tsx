"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn";
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from "../icons";

export type ToastVariant = "info" | "success" | "error";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Pass 0 for a sticky toast. */
  duration?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, "title" | "variant">> {
  id: number;
  description?: string;
}

interface ToastContextValue {
  /** Enqueue a toast; returns nothing — toasts are fire-and-forget. */
  toast: (options: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within <ToastProvider>");
  return context;
}

/**
 * Toast notifications, monochrome: variants differ by fill, border style, and
 * icon — never color. Rendered in a polite live region; errors additionally
 * use role="alert" for assertive announcement.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const counter = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => setMounted(true), []);
  // Clear any pending timers on unmount so dismissed providers never leak.
  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
    },
    [],
  );

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    ({ duration = 5000, variant = "info", ...rest }: ToastOptions) => {
      const id = (counter.current += 1);
      setToasts((current) => [...current, { id, variant, ...rest }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              aria-live="polite"
              aria-atomic="false"
              className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
            >
              {toasts.map((item) => (
                <ToastCard key={item.id} toast={item} onDismiss={dismiss} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

const VARIANT_CLASS: Record<ToastVariant, string> = {
  info: "border border-foreground bg-background text-foreground",
  // Inverted fill marks success — the strongest monochrome emphasis.
  success: "border border-foreground bg-foreground text-background",
  // A dashed double border marks errors — distinct without color.
  error: "border-2 border-dashed border-foreground bg-background text-foreground",
};

const VARIANT_ICON: Record<ToastVariant, typeof InfoIcon> = {
  info: InfoIcon,
  success: CheckIcon,
  error: AlertIcon,
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const Icon = VARIANT_ICON[toast.variant];
  return (
    <li
      role={toast.variant === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg p-4 shadow-lg animate-slide-up",
        VARIANT_CLASS[toast.variant],
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.description ? <p className="text-sm opacity-75">{toast.description}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="ml-auto inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100"
      >
        <XIcon className="size-3.5" />
      </button>
    </li>
  );
}
