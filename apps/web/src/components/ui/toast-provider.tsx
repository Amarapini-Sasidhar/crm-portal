import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

type ToastVariant = 'success' | 'error' | 'info';

type ToastInput = {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastMessage = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  pushToast: (input: ToastInput) => void;
  dismissToast: (id: string) => void;
};

const DEFAULT_DURATION_MS = 3400;
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Record<string, number>>({});
  const lastToastRef = useRef<{ key: string; at: number } | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((previous) => previous.filter((item) => item.id !== id));
    const timerId = timersRef.current[id];
    if (timerId) {
      window.clearTimeout(timerId);
      delete timersRef.current[id];
    }
  }, []);

  const pushToast = useCallback(
    (input: ToastInput) => {
      const variant = input.variant ?? 'info';
      const dedupeKey = `${variant}:${input.message}`;
      const now = Date.now();
      if (
        lastToastRef.current &&
        lastToastRef.current.key === dedupeKey &&
        now - lastToastRef.current.at < 1200
      ) {
        return;
      }
      lastToastRef.current = {
        key: dedupeKey,
        at: now
      };

      const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const toast: ToastMessage = {
        id,
        message: input.message,
        variant
      };

      setToasts((previous) => [...previous.slice(-3), toast]);

      const duration = input.durationMs ?? DEFAULT_DURATION_MS;
      timersRef.current[id] = window.setTimeout(() => {
        dismissToast(id);
      }, duration);
    },
    [dismissToast]
  );

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      timersRef.current = {};
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      pushToast,
      dismissToast
    }),
    [pushToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-atomic="true" aria-live="polite" className="toast-viewport">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.variant}`} key={toast.id} role="status">
            <p>{toast.message}</p>
            <button
              aria-label="Dismiss notification"
              className="toast-dismiss"
              onClick={() => dismissToast(toast.id)}
              type="button"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return context;
}
