import React, { useState } from 'react';
import { api } from '../../api/client';
import { RetryStrategy } from '../../api/types';
import { X, Layers, Plus } from 'lucide-react';

interface CreateQueueModalProps {
  projectId: string;
  onClose: () => void;
  onQueueCreated: (name: string) => void;
}

export const CreateQueueModal: React.FC<CreateQueueModalProps> = ({
  projectId,
  onClose,
  onQueueCreated,
}) => {
  const [name, setName] = useState('');
  const [priority, setPriority] = useState('10');
  const [concurrencyLimit, setConcurrencyLimit] = useState('10');
  const [retryStrategy, setRetryStrategy] = useState<RetryStrategy>('EXPONENTIAL');
  const [baseDelaySec, setBaseDelaySec] = useState('5');
  const [maxAttempts, setMaxAttempts] = useState('3');
  const [maxDelayCapSec, setMaxDelayCapSec] = useState('3600');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Queue name is required');
      return;
    }

    const priorityValue = Number(priority);
    const concurrencyLimitValue = Number(concurrencyLimit);
    const baseDelaySecValue = Number(baseDelaySec);
    const maxAttemptsValue = Number(maxAttempts);
    const maxDelayCapSecValue = Number(maxDelayCapSec);
    if (
      !priority.trim() ||
      !Number.isInteger(priorityValue) ||
      !Number.isInteger(concurrencyLimitValue) || concurrencyLimitValue < 1 ||
      !Number.isInteger(baseDelaySecValue) || baseDelaySecValue < 1 ||
      !Number.isInteger(maxAttemptsValue) || maxAttemptsValue < 1 ||
      !Number.isInteger(maxDelayCapSecValue) || maxDelayCapSecValue < 1
    ) {
      setError('Enter valid values for all numeric fields');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const q = await api.createQueue(projectId, {
        name: name.trim(),
        priority: priorityValue,
        concurrencyLimit: concurrencyLimitValue,
        retryPolicy: {
          strategy: retryStrategy,
          baseDelaySec: baseDelaySecValue,
          maxAttempts: maxAttemptsValue,
          maxDelayCapSec: maxDelayCapSecValue,
        },
      });

      onQueueCreated(q.name);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create queue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#141414] border border-white/10 rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#00C48C]/20 border border-[#00C48C]/30 flex items-center justify-center">
              <Layers className="w-4 h-4 text-[#00C48C]" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">Create Job Queue</h2>
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
            <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Queue Name</label>
            <input
              type="text"
              placeholder="e.g. video-transcoding"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#00C48C] outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Priority</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#00C48C] outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Concurrency Limit</label>
              <input
                type="number"
                min="1"
                value={concurrencyLimit}
                onChange={(e) => setConcurrencyLimit(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#00C48C] outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Retry Strategy</label>
              <select
                value={retryStrategy}
                onChange={(e) => setRetryStrategy(e.target.value as RetryStrategy)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#00C48C] outline-none"
              >
                <option value="FIXED">Fixed delay</option>
                <option value="LINEAR">Linear backoff</option>
                <option value="EXPONENTIAL">Exponential backoff</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Max Attempts</label>
              <input
                type="number"
                min="1"
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#00C48C] outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Base Delay (sec)</label>
              <input
                type="number"
                min="1"
                value={baseDelaySec}
                onChange={(e) => setBaseDelaySec(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#00C48C] outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Max Delay Cap (sec)</label>
              <input
                type="number"
                min="1"
                value={maxDelayCapSec}
                onChange={(e) => setMaxDelayCapSec(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#00C48C] outline-none"
              />
            </div>
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
              className="px-6 py-2 rounded-full bg-[#00C48C] hover:bg-[#00C48C]/90 text-white text-xs font-medium flex items-center gap-2 shadow-lg shadow-[#00C48C]/20"
            >
              <Plus className="w-4 h-4" /> {submitting ? 'Creating...' : 'Create Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
