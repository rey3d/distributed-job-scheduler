import React, { useEffect, useState } from 'react';
import { Queue } from '../../api/types';
import { api } from '../../api/client';
import { SkeletonTableRows } from '../common/SkeletonLoader';
import { Layers, PauseCircle, PlayCircle, Settings, Plus, RefreshCw } from 'lucide-react';

interface QueuesViewProps {
  projectId: string;
  onOpenCreateQueueModal: () => void;
  onOpenEditQueueModal: (queue: Queue) => void;
  onToast: (type: 'success' | 'warning' | 'error', title: string, message?: string) => void;
}

export const QueuesView: React.FC<QueuesViewProps> = ({
  projectId,
  onOpenCreateQueueModal,
  onOpenEditQueueModal,
  onToast,
}) => {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchQueues = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getQueues(projectId);
      setQueues(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch queues');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchQueues();
    }
  }, [projectId]);

  const handleTogglePause = async (queue: Queue) => {
    const originalPaused = queue.paused;
    setTogglingId(queue.id);

    // Optimistic UI Update
    setQueues((prev) =>
      prev.map((q) => (q.id === queue.id ? { ...q, paused: !originalPaused } : q))
    );

    try {
      if (originalPaused) {
        await api.resumeQueue(queue.id);
        onToast('success', 'Queue Resumed', `Queue '${queue.name}' is now active`);
      } else {
        await api.pauseQueue(queue.id);
        onToast('warning', 'Queue Paused', `Workers will skip queue '${queue.name}'`);
      }
    } catch (err: any) {
      // Rollback on error
      setQueues((prev) =>
        prev.map((q) => (q.id === queue.id ? { ...q, paused: originalPaused } : q))
      );
      onToast('error', 'Action Failed', err.message);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl w-full mx-auto font-sans">
      {/* View Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-[#4F6EF7]" />
            <h1 className="text-xl font-extrabold text-white tracking-tight">Queues & Concurrency</h1>
          </div>
          <p className="text-xs text-gray-400 font-mono">
            Manage worker concurrency limits, priorities, and instant pause/resume controls.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchQueues}
            className="p-2.5 rounded-full bg-[#141414] border border-white/10 text-gray-400 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenCreateQueueModal}
            className="px-5 py-2.5 rounded-full bg-[#00C48C] hover:bg-[#00C48C]/90 text-white text-xs font-medium flex items-center gap-2 shadow-lg shadow-[#00C48C]/20 transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Queue
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="p-6 rounded-2xl bg-[#141414] border border-white/10 space-y-4">
        {loading ? (
          <SkeletonTableRows rows={5} />
        ) : error ? (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
            ❌ {error}
          </div>
        ) : queues.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-gray-500 font-mono uppercase text-[10px]">
                  <th className="pb-3">Queue Name</th>
                  <th className="pb-3">Priority</th>
                  <th className="pb-3">Concurrency Limit</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {queues.map((q) => (
                  <tr key={q.id} className="hover:bg-white/[0.02]">
                    <td className="py-4 font-mono font-bold text-gray-100">{q.name}</td>
                    <td className="py-4 text-gray-300 font-mono">P{q.priority}</td>
                    <td className="py-4 text-gray-300 font-mono">{q.concurrencyLimit} workers</td>
                    <td className="py-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          !q.paused
                            ? 'bg-[#00C48C]/10 text-[#00C48C] border border-[#00C48C]/20'
                            : 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                        }`}
                      >
                        {!q.paused ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </td>
                    <td className="py-4 text-right font-mono flex items-center justify-end gap-2">
                      {/* Pause / Resume Button */}
                      <button
                        disabled={togglingId === q.id}
                        onClick={() => handleTogglePause(q)}
                        className={`px-3 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 transition-colors border ${
                          !q.paused
                            ? 'bg-amber-400/10 hover:bg-amber-400/20 text-amber-400 border-amber-400/20'
                            : 'bg-[#00C48C]/10 hover:bg-[#00C48C]/20 text-[#00C48C] border-[#00C48C]/20'
                        }`}
                      >
                        {!q.paused ? (
                          <>
                            <PauseCircle className="w-3.5 h-3.5" /> Pause
                          </>
                        ) : (
                          <>
                            <PlayCircle className="w-3.5 h-3.5" /> Resume
                          </>
                        )}
                      </button>

                      {/* Configure Button */}
                      <button
                        onClick={() => onOpenEditQueueModal(q)}
                        className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-medium border border-white/10 flex items-center gap-1.5"
                      >
                        <Settings className="w-3.5 h-3.5" /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500 font-mono text-xs space-y-2">
            <Layers className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <p className="text-gray-300 font-bold">No job queues configured</p>
            <p>Click "Create Queue" to configure a new worker queue.</p>
          </div>
        )}
      </div>
    </div>
  );
};
