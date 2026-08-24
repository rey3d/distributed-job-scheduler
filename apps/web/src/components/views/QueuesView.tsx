import React, { useEffect, useState } from 'react';
import { Queue, QueueStats } from '../../api/types';
import { api } from '../../api/client';
import { SkeletonTableRows } from '../common/SkeletonLoader';
import {
  Layers,
  PauseCircle,
  PlayCircle,
  Settings,
  Plus,
  RefreshCw,
  BarChart3,
  CheckCircle2,
  Clock,
  Zap,
  AlertTriangle,
  X,
} from 'lucide-react';

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
  const [queueStatsMap, setQueueStatsMap] = useState<Record<string, QueueStats>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Queue Detail Modal / Drawer State
  const [selectedQueueForStats, setSelectedQueueForStats] = useState<Queue | null>(null);
  const [modalStats, setModalStats] = useState<QueueStats | null>(null);
  const [loadingModalStats, setLoadingModalStats] = useState<boolean>(false);

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

      // Fetch stats for all queues concurrently
      const statsPromises = data.map((q) =>
        api
          .getQueueStats(q.id)
          .then((stats) => ({ id: q.id, stats }))
          .catch(() => null)
      );

      const statsResults = await Promise.all(statsPromises);
      const newMap: Record<string, QueueStats> = {};
      for (const res of statsResults) {
        if (res) {
          newMap[res.id] = res.stats;
        }
      }
      setQueueStatsMap(newMap);
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
      setQueues((prev) =>
        prev.map((q) => (q.id === queue.id ? { ...q, paused: originalPaused } : q))
      );
      onToast('error', 'Action Failed', err.message);
    } finally {
      setTogglingId(null);
    }
  };

  const handleOpenStatsModal = async (queue: Queue) => {
    setSelectedQueueForStats(queue);
    setLoadingModalStats(true);
    try {
      const stats = await api.getQueueStats(queue.id);
      setModalStats(stats);
    } catch (err: any) {
      onToast('error', 'Failed to load queue statistics', err.message);
    } finally {
      setLoadingModalStats(false);
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
            Monitor per-queue latency, success rates, throughput, worker concurrency, and pause controls.
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
            className="px-5 py-2.5 rounded-full bg-[#00C48C] hover:bg-[#00C48C]/90 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#00C48C]/20 transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Queue
          </button>
        </div>
      </div>

      {/* Main Table & Queue Cards */}
      <div className="p-6 rounded-2xl bg-[#141414] border border-white/10 space-y-4 shadow-xl">
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
                  <th className="pb-3">Concurrency</th>
                  <th className="pb-3">Success Rate</th>
                  <th className="pb-3">Avg Latency</th>
                  <th className="pb-3">Throughput</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {queues.map((q) => {
                  const stats = queueStatsMap[q.id];
                  const successRate = stats?.successRate ?? 100;
                  const isSuccessGood = successRate >= 98;
                  const isSuccessOk = successRate >= 90;

                  return (
                    <tr key={q.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 font-mono font-bold text-gray-100 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-[#4F6EF7]" />
                        {q.name}
                      </td>
                      <td className="py-4 text-gray-300 font-mono">P{q.priority}</td>
                      <td className="py-4 text-gray-300 font-mono">{q.concurrencyLimit} max</td>

                      {/* Success Rate */}
                      <td className="py-4 font-mono">
                        {stats ? (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isSuccessGood
                                ? 'bg-[#00C48C]/10 text-[#00C48C] border border-[#00C48C]/20'
                                : isSuccessOk
                                ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {successRate}%
                          </span>
                        ) : (
                          <span className="text-gray-500 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Avg Latency */}
                      <td className="py-4 text-gray-300 font-mono text-[11px]">
                        {stats ? `${stats.avgDurationMs} ms` : '—'}
                      </td>

                      {/* Throughput */}
                      <td className="py-4 text-gray-300 font-mono text-[11px]">
                        {stats ? `${stats.currentThroughput} /min` : '—'}
                      </td>

                      {/* Status */}
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

                      {/* Actions */}
                      <td className="py-4 text-right font-mono flex items-center justify-end gap-2">
                        {/* Stats Button */}
                        <button
                          onClick={() => handleOpenStatsModal(q)}
                          className="px-2.5 py-1 rounded-full bg-[#4F6EF7]/10 hover:bg-[#4F6EF7]/20 text-[#4F6EF7] text-[11px] font-medium border border-[#4F6EF7]/20 flex items-center gap-1 transition-colors"
                        >
                          <BarChart3 className="w-3.5 h-3.5" /> Stats
                        </button>

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

                        {/* Edit Button */}
                        <button
                          onClick={() => onOpenEditQueueModal(q)}
                          className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-medium border border-white/10 flex items-center gap-1.5"
                        >
                          <Settings className="w-3.5 h-3.5" /> Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
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

      {/* Queue Details & Statistics Modal */}
      {selectedQueueForStats && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-white/10 rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#4F6EF7]/10 border border-[#4F6EF7]/20 flex items-center justify-center text-[#4F6EF7]">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {selectedQueueForStats.name} — Metrics & Statistics
                  </h3>
                  <p className="text-[11px] text-gray-400 font-mono">
                    Priority: P{selectedQueueForStats.priority} | Max Concurrency:{' '}
                    {selectedQueueForStats.concurrencyLimit} workers
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedQueueForStats(null);
                  setModalStats(null);
                }}
                className="text-gray-400 hover:text-white p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingModalStats || !modalStats ? (
              <div className="p-8 text-center text-xs font-mono text-gray-400">
                Loading real-time queue aggregate statistics...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-4 space-y-1">
                    <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#00C48C]" /> 24h Success Rate
                    </p>
                    <p className="text-xl font-extrabold text-white font-mono">
                      {modalStats.successRate}%
                    </p>
                    <p className="text-[10px] text-gray-500 font-mono">
                      {modalStats.jobsCompleted24h} completed / {modalStats.jobsFailed24h} failed
                    </p>
                  </div>

                  <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-4 space-y-1">
                    <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#4F6EF7]" /> Avg Execution Latency
                    </p>
                    <p className="text-xl font-extrabold text-white font-mono">
                      {modalStats.avgDurationMs} <span className="text-xs text-gray-400">ms</span>
                    </p>
                    <p className="text-[10px] text-gray-500 font-mono">Average job execution time</p>
                  </div>

                  <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-4 space-y-1">
                    <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" /> Current Throughput
                    </p>
                    <p className="text-xl font-extrabold text-white font-mono">
                      {modalStats.currentThroughput} <span className="text-xs text-gray-400">jobs/min</span>
                    </p>
                    <p className="text-[10px] text-gray-500 font-mono">Based on last 15 minutes</p>
                  </div>

                  <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-4 space-y-1">
                    <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Unresolved DLQ
                    </p>
                    <p className="text-xl font-extrabold text-white font-mono text-rose-400">
                      {modalStats.dlqCount}
                    </p>
                    <p className="text-[10px] text-gray-500 font-mono">Dead Letter Queue entries</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-mono font-bold ${
                      !selectedQueueForStats.paused
                        ? 'bg-[#00C48C]/10 text-[#00C48C] border border-[#00C48C]/20'
                        : 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                    }`}
                  >
                    {!selectedQueueForStats.paused ? 'ACTIVE QUEUE' : 'PAUSED QUEUE'}
                  </span>

                  <button
                    onClick={() => {
                      setSelectedQueueForStats(null);
                      setModalStats(null);
                    }}
                    className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
