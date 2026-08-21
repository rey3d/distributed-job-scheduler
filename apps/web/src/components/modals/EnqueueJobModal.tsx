import React, { useState } from 'react';
import { Queue } from '../../api/types';
import { api } from '../../api/client';
import { X, Plus, Zap } from 'lucide-react';

interface EnqueueJobModalProps {
  queues: Queue[];
  onClose: () => void;
  onJobEnqueued: (msg: string) => void;
}

export const EnqueueJobModal: React.FC<EnqueueJobModalProps> = ({ queues, onClose, onJobEnqueued }) => {
  const [selectedQueueId, setSelectedQueueId] = useState<string>(queues[0]?.id || '');
  const [jobType, setJobType] = useState<string>('billing.charge');
  const [priority, setPriority] = useState<number>(10);
  const [delaySec, setDelaySec] = useState<number>(0);
  const [payloadText, setPayloadText] = useState<string>(
    JSON.stringify({ userId: 'usr_8921', amount: 149.99, currency: 'USD' }, null, 2)
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQueueId) {
      setError('Please select a queue');
      return;
    }

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch (_) {
      setError('Invalid Payload JSON format');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const job = await api.enqueueJob(selectedQueueId, {
        type: jobType,
        payload: parsedPayload,
        priority,
        delaySec,
      });

      onJobEnqueued(`Enqueued job '${job.type}' (ID: ${job.id.slice(0, 8)})`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to enqueue job');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#141414] border border-white/10 rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#4F6EF7]/20 border border-[#4F6EF7]/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#4F6EF7]" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">Enqueue Job</h2>
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
          {/* Target Queue */}
          <div>
            <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Target Queue</label>
            <select
              value={selectedQueueId}
              onChange={(e) => setSelectedQueueId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#4F6EF7] outline-none"
            >
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name} (P{q.priority})
                </option>
              ))}
            </select>
          </div>

          {/* Job Type & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Job Type</label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#4F6EF7] outline-none"
              >
                <option value="billing.charge">billing.charge</option>
                <option value="email.send">email.send</option>
                <option value="db.backup">db.backup</option>
                <option value="custom.task">custom.task</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Priority</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#4F6EF7] outline-none"
              />
            </div>
          </div>

          {/* Scheduled Delay */}
          <div>
            <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">
              Scheduled Delay (Seconds, 0 for immediate)
            </label>
            <input
              type="number"
              min="0"
              value={delaySec}
              onChange={(e) => setDelaySec(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#4F6EF7] outline-none"
            />
          </div>

          {/* JSON Payload */}
          <div>
            <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Payload JSON</label>
            <textarea
              rows={4}
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              className="w-full p-3.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-gray-200 font-mono text-[11px] focus:border-[#4F6EF7] outline-none"
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
              <Plus className="w-4 h-4" /> {submitting ? 'Enqueuing...' : 'Enqueue Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
