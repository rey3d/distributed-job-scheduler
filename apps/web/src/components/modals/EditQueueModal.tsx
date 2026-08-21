import React, { useState } from 'react';
import { Queue } from '../../api/types';
import { api } from '../../api/client';
import { X, Settings, Save } from 'lucide-react';

interface EditQueueModalProps {
  queue: Queue;
  onClose: () => void;
  onQueueUpdated: (msg: string) => void;
}

export const EditQueueModal: React.FC<EditQueueModalProps> = ({
  queue,
  onClose,
  onQueueUpdated,
}) => {
  const [priority, setPriority] = useState(queue.priority);
  const [concurrencyLimit, setConcurrencyLimit] = useState(queue.concurrencyLimit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.updateQueue(queue.id, {
        priority,
        concurrencyLimit,
      });

      onQueueUpdated(`Updated config for queue '${queue.name}'`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update queue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#141414] border border-white/10 rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#4F6EF7]/20 border border-[#4F6EF7]/30 flex items-center justify-center">
              <Settings className="w-4 h-4 text-[#4F6EF7]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Configure Queue</h2>
              <p className="text-[11px] font-mono text-gray-400">{queue.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">
              Priority Level (Higher numbers run first)
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#4F6EF7] outline-none"
            />
          </div>

          <div>
            <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">
              Concurrency Limit (Max simultaneous workers)
            </label>
            <input
              type="number"
              min="1"
              value={concurrencyLimit}
              onChange={(e) => setConcurrencyLimit(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#4F6EF7] outline-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium border border-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 rounded-full bg-[#4F6EF7] hover:bg-[#4F6EF7]/90 text-white text-xs font-medium flex items-center gap-2 shadow-lg shadow-[#4F6EF7]/20"
            >
              <Save className="w-4 h-4" /> {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
