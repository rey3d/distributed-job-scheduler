import React, { useState, useEffect } from 'react';
import { Queue } from '../../api/types';
import { api } from '../../api/client';
import { X, Plus, Zap, RefreshCw, Layers } from 'lucide-react';

interface EnqueueJobModalProps {
  queues: Queue[];
  loading?: boolean;
  error?: string | null;
  onRetryQueues?: () => void;
  onOpenCreateQueueModal?: () => void;
  onClose: () => void;
  onJobEnqueued: (msg: string) => void;
}

type EnqueueMode = 'immediate' | 'delayed' | 'cron' | 'batch';

export const EnqueueJobModal: React.FC<EnqueueJobModalProps> = ({
  queues,
  loading = false,
  error: fetchError = null,
  onRetryQueues,
  onOpenCreateQueueModal,
  onClose,
  onJobEnqueued,
}) => {
  const [mode, setMode] = useState<EnqueueMode>('immediate');
  const [selectedQueueId, setSelectedQueueId] = useState<string>('');
  const [jobType, setJobType] = useState<string>('billing.charge');
  const [priority, setPriority] = useState('10');
  const [delaySec, setDelaySec] = useState('30');
  const [cronExpression, setCronExpression] = useState<string>('*/5 * * * *');
  const [scheduleName, setScheduleName] = useState<string>('Recurring job');
  const [batchCount, setBatchCount] = useState('5');
  const [maxAttempts, setMaxAttempts] = useState('3');
  const [payloadText, setPayloadText] = useState<string>(
    JSON.stringify({ userId: 'usr_8921', amount: 149.99, currency: 'USD' }, null, 2)
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (Array.isArray(queues) && queues.length > 0 && !selectedQueueId) {
      setSelectedQueueId(queues[0].id);
    }
  }, [queues, selectedQueueId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQueueId) {
      setSubmitError('Please select a target queue');
      return;
    }

    const priorityValue = Number(priority);
    const maxAttemptsValue = Number(maxAttempts);
    const delaySecValue = Number(delaySec);
    const batchCountValue = Number(batchCount);

    if (
      !priority.trim() ||
      !Number.isInteger(priorityValue) ||
      !Number.isInteger(maxAttemptsValue) ||
      maxAttemptsValue < 1 ||
      (mode === 'delayed' && (!Number.isInteger(delaySecValue) || delaySecValue < 1)) ||
      (mode === 'batch' && (!Number.isInteger(batchCountValue) || batchCountValue < 1 || batchCountValue > 500))
    ) {
      setSubmitError('Enter valid values for all numeric fields');
      return;
    }

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch (_) {
      setSubmitError('Invalid Payload JSON format');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (mode === 'cron') {
        await api.enqueueScheduledJob(selectedQueueId, {
          name: scheduleName || `${jobType} schedule`,
          jobType,
          payload: parsedPayload,
          cronExpression,
        });
        onJobEnqueued(`Created recurring cron job '${jobType}' (${cronExpression})`);
      } else if (mode === 'batch') {
        const count = batchCountValue;
        const jobs = Array.from({ length: count }, () => ({
          type: jobType,
          payload: parsedPayload,
          priority: priorityValue,
        }));
        const result = await api.enqueueBatchJobs(selectedQueueId, { jobs });
        onJobEnqueued(`Enqueued batch of ${result.totalJobs || count} '${jobType}' jobs`);
      } else {
        const job = await api.enqueueJob(selectedQueueId, {
          type: jobType,
          payload: parsedPayload,
          priority: priorityValue,
          delaySec: mode === 'delayed' ? delaySecValue : 0,
          maxAttempts: maxAttemptsValue,
        });
        const jobId = job?.id ? job.id.slice(0, 8) : 'submitted';
        const typeStr = job?.type || jobType;
        onJobEnqueued(
          mode === 'delayed'
            ? `Scheduled '${typeStr}' (ID: ${jobId}) in ${delaySecValue}s`
            : `Enqueued job '${typeStr}' (ID: ${jobId})`
        );
      }
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to enqueue job');
    } finally {
      setSubmitting(false);
    }
  };

  const activeError = submitError || fetchError;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#141414] border border-white/10 rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl max-h-[92vh] overflow-y-auto">
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

        {activeError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono flex items-center justify-between">
            <span>⚠️ {activeError}</span>
            {fetchError && onRetryQueues && (
              <button
                type="button"
                onClick={onRetryQueues}
                className="px-3 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-xs font-mono text-gray-400 space-y-3">
            <RefreshCw className="w-6 h-6 text-[#4F6EF7] animate-spin mx-auto" />
            <p>Loading project queues...</p>
          </div>
        ) : !loading && (!Array.isArray(queues) || queues.length === 0) ? (
          <div className="py-8 text-center text-xs font-mono space-y-4">
            <Layers className="w-8 h-8 text-gray-600 mx-auto" />
            <div>
              <p className="text-gray-200 font-bold text-sm">No Queues Available</p>
              <p className="text-gray-500 mt-1">
                You need at least one configured queue in this project to enqueue jobs.
              </p>
            </div>
            {onOpenCreateQueueModal && (
              <button
                type="button"
                onClick={onOpenCreateQueueModal}
                className="px-5 py-2.5 rounded-full bg-[#00C48C] hover:bg-[#00C48C]/90 text-white font-bold text-xs inline-flex items-center gap-2 shadow-lg shadow-[#00C48C]/20"
              >
                <Plus className="w-4 h-4" /> Create Queue
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-[#0A0A0A] border border-white/10">
              {([
                ['immediate', 'Now'],
                ['delayed', 'Delayed'],
                ['cron', 'Cron'],
                ['batch', 'Batch'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={`py-2 rounded-xl text-[11px] font-bold ${
                    mode === id ? 'bg-[#4F6EF7] text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Target Queue</label>
              <select
                value={selectedQueueId}
                onChange={(e) => setSelectedQueueId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#4F6EF7] outline-none"
              >
                {queues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name} (P{q.priority} — {q.concurrencyLimit} workers)
                  </option>
                ))}
              </select>
            </div>

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
                  <option value="data.process">data.process</option>
                  <option value="payment.process">payment.process</option>
                  <option value="db.backup">db.backup</option>
                  <option value="custom.task">custom.task</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Priority</label>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#4F6EF7] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Max Attempts</label>
              <input
                type="number"
                min="1"
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#4F6EF7] outline-none"
              />
              <p className="text-[10px] text-gray-500 mt-1 font-mono">
                Use 1 plus simulateFailure:true to send a job straight to the Dead Letter Queue.
              </p>
            </div>

            {mode === 'delayed' && (
              <div>
                <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">
                  Delay (seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  value={delaySec}
                  onChange={(e) => setDelaySec(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#4F6EF7] outline-none"
                />
              </div>
            )}

            {mode === 'cron' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Schedule name</label>
                  <input
                    type="text"
                    value={scheduleName}
                    onChange={(e) => setScheduleName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#4F6EF7] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">Cron expression</label>
                  <input
                    type="text"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#4F6EF7] outline-none"
                  />
                </div>
              </div>
            )}

            {mode === 'batch' && (
              <div>
                <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">
                  Batch size (1–500)
                </label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={batchCount}
                  onChange={(e) => setBatchCount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white font-mono focus:border-[#4F6EF7] outline-none"
                />
              </div>
            )}

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
                className="px-6 py-2 rounded-full bg-[#4F6EF7] hover:bg-[#4F6EF7]/90 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#4F6EF7]/20"
              >
                <Plus className="w-4 h-4" /> {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
