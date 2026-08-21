import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'error';
  title: string;
  message?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-3 max-w-sm w-full">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isWarning = toast.type === 'warning';

        const borderColor = isSuccess
          ? 'border-l-[#00C48C]'
          : isWarning
          ? 'border-l-amber-400'
          : 'border-l-rose-500';

        const Icon = isSuccess
          ? CheckCircle2
          : isWarning
          ? AlertTriangle
          : XCircle;

        const iconColor = isSuccess
          ? 'text-[#00C48C]'
          : isWarning
          ? 'text-amber-400'
          : 'text-rose-500';

        return (
          <div
            key={toast.id}
            className={`p-4 rounded-2xl bg-[#141414] border border-white/10 border-l-4 ${borderColor} shadow-2xl flex items-start justify-between gap-3 animate-in slide-in-from-bottom-5 duration-200`}
          >
            <div className="flex items-start gap-3">
              <Icon className={`w-5 h-5 ${iconColor} shrink-0 mt-0.5`} />
              <div>
                <p className="text-xs font-bold text-gray-100">{toast.title}</p>
                {toast.message && (
                  <p className="text-[11px] text-gray-400 font-mono mt-0.5">{toast.message}</p>
                )}
              </div>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              className="text-gray-500 hover:text-gray-300 p-1 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
