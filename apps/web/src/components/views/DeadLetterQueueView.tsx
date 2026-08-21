import React, { useEffect, useState } from 'react';
import { DeadLetterJob, PaginatedResponse } from '../../api/types';
import { api } from '../../api/client';
import { SkeletonTableRows } from '../common/SkeletonLoader';
import { AlertTriangle, RefreshCw, RotateCcw, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';

interface DeadLetterQueueViewProps {
  projectId: string;
  onToast: (type: 'success' | 'warning' | 'error', title: string, message?: string) => void;
}

export const DeadLetterQueueView: React.FC<DeadLetterQueueViewProps> = ({ projectId, onToast }) => {
  const [response, setResponse] = useState<PaginatedResponse<DeadLetterJob> | null>(null);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDLQ = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDeadLetterJobs(projectId, page, 15);
      setResponse(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch Dead Letter Queue items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchDLQ();
    }
  }, [projectId, page]);

  const handleRetryJob = async (dlqItem: DeadLetterJob) => {
    setRetryingId(dlqItem.originalJobId);
    try {
      await api.retryJob(dlqItem.originalJobId);
      onToast('success', 'Job Re-queued', `Re-queued original job #${dlqItem.originalJobId.slice(0, 8)} for worker retry`);
      fetchDLQ();
    } catch (err: any) {
      onToast('error', 'Retry Failed', err.message);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl w-full mx-auto font-sans">
      {/* View Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            <h1 className="text-xl font-extrabold text-white tracking-tight">Dead Letter Queue (DLQ)</h1>
          </div>
          <p className="text-xs text-gray-400 font-mono">
            Exhausted jobs requiring manual review and replay capability.
          </p>
        </div>

        <button
          onClick={fetchDLQ}
          className="p-2.5 rounded-full bg-[#141414] border border-white/10 text-gray-400 hover:text-white"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Table */}
      <div className="p-6 rounded-2xl bg-[#141414] border border-white/10 space-y-4">
        {loading ? (
          <SkeletonTableRows rows={6} />
        ) : error ? (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
            ❌ {error}
          </div>
        ) : response && response.data.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-gray-500 font-mono uppercase text-[10px]">
                    <th className="pb-3">Original Job ID</th>
                    <th className="pb-3">Queue</th>
                    <th className="pb-3">Failed At</th>
                    <th className="pb-3">Attempts</th>
                    <th className="pb-3">Last Error</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {response.data.map((item) => {
                    const errString =
                      typeof item.lastError === 'string'
                        ? item.lastError
                        : item.lastError?.message || JSON.stringify(item.lastError);

                    return (
                      <tr key={item.id} className="hover:bg-white/[0.02]">
                        <td className="py-4 font-mono font-bold text-gray-200">
                          {item.originalJobId ? `${item.originalJobId.slice(0, 13)}...` : 'Unknown'}
                        </td>
                        <td className="py-4 font-mono text-gray-400">
                          {item.queue?.name || 'Default'}
                        </td>
                        <td className="py-4 font-mono text-gray-400">
                          {item.failedAt ? new Date(item.failedAt).toLocaleString() : 'N/A'}
                        </td>
                        <td className="py-4 font-mono text-rose-400 font-bold">
                          {item.totalAttempts ?? 0} / {item.totalAttempts ?? 0} (Exhausted)
                        </td>
                        <td className="py-4 font-mono text-gray-400 max-w-xs truncate" title={errString}>
                          {errString}
                        </td>
                        <td className="py-4 text-right font-mono">
                          <button
                            disabled={retryingId === item.originalJobId}
                            onClick={() => handleRetryJob(item)}
                            className="px-4 py-1.5 rounded-full bg-[#4F6EF7]/10 hover:bg-[#4F6EF7]/20 text-[#4F6EF7] border border-[#4F6EF7]/20 text-xs font-bold flex items-center gap-1.5 ml-auto transition-colors"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${retryingId === item.originalJobId ? 'animate-spin' : ''}`} />
                            {retryingId === item.originalJobId ? 'Re-queuing...' : 'Retry Job'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {response.meta && (
              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono text-gray-400">
                <span>
                  Page {response.meta.page} of {response.meta.totalPages} ({response.meta.total} Total Dead Letters)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="p-1.5 rounded-lg bg-white/5 disabled:opacity-30 border border-white/10"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={page >= response.meta.totalPages}
                    onClick={() => setPage(page + 1)}
                    className="p-1.5 rounded-lg bg-white/5 disabled:opacity-30 border border-white/10"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-12 text-center text-gray-500 font-mono text-xs space-y-2">
            <CheckCircle2 className="w-8 h-8 text-[#00C48C] mx-auto mb-2" />
            <p className="text-gray-200 font-bold">Dead Letter Queue Clean</p>
            <p className="text-gray-500">All failed job attempts have been resolved or retried successfully.</p>
          </div>
        )}
      </div>
    </div>
  );
};
