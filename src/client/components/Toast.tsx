import { XIcon } from './Icons';

export interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'error' | 'success';
}

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`} role="status">
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss message"
          >
            <XIcon size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
