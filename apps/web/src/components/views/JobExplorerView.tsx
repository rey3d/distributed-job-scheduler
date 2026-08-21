import React, { useEffect, useState } from 'react';
import { Job, Queue, PaginatedResponse } from '../../api/types';
import { api } from '../../api/client';
import { SkeletonTableRows } from '../common/SkeletonLoader';
import { Search, RefreshCw, ChevronLeft, ChevronRight, ListTodo } from 'lucide-react';

interface JobExplorerViewProps {
  projectId: string;
  selectedQueueId?: string | null;
  onSelectJob: (jobId: string) => void;
  onToast: (type: 'success' | 'warning' | 'error', title: string, message?: string) => void;
}

export const JobExplorerView: React.FC<JobExplorerViewProps> = ({
  projectId,
  selectedQueueId,
  onSelectJob,
  onToast,
}) => {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [activeQueueId, setActiveQueueId] = useState<string>(selectedQueueId || '');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [response, setResponse] = useState<PaginatedResponse<Job> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch Queues for project
  useEffect(() => {
    const fetchQueues = async () => {
      try {
        const qList = await api.getQueues(projectId);
        setQueues(qList);
        if (!activeQueueId && qList.length > 0) {
          setActiveQueueId(qList[0].id);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch queues');
      }
    };
    fetchQueues();
  }, [projectId]);

  // Fetch Jobs for selected queue
  const fetchJobs = async () => {
    if (!activeQueueId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getJobs(activeQueueId, {
        status: statusFilter,
        page,
        limit: 15,
      });
      setResponse(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch jobs');
      onToast('error', 'Fetch Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [activeQueueId, statusFilter, page]);

  const filteredJobs = (response?.data || []).filter((j) => {
    if (!searchTerm) return true;
    return (
      j.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      j.type.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="p-8 space-y-6 max-w-7xl w-full mx-auto font-sans">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ListTodo className="w-5 h-5 text-[#4F6EF7]" />
            <h1 className="text-xl font-extrabold text-white tracking-tight">Job Explorer</h1>
          </div>
          <p className="text-xs text-gray-400 font-mono">
            Inspect execution history, payload data, worker assignments, and audit logs.
          </p>
        </div>

        {/* Queue Selector */}
        {queues.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-mono">Queue:</span>
            <select
              value={activeQueueId}
              onChange={(e) => {
                setActiveQueueId(e.target.value);
                setPage(1);
              }}
              className="px-3.5 py-2 rounded-full bg-[#141414] border border-white/10 text-white text-xs font-mono focus:border-[#4F6EF7] outline-none"
            >
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name} (P{q.priority})
                </option>
              ))}
            </select>
            <button
              onClick={fetchJobs}
              className="p-2 rounded-full bg-[#141414] border border-white/10 text-gray-400 hover:text-white"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Search & Status Filter Controls */}
      <div className="p-4 rounded-2xl bg-[#141414] border border-white/10 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by Job ID or Job Type (e.g. billing.charge)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-full bg-[#0A0A0A] border border-white/10 text-gray-200 text-xs font-mono focus:border-[#4F6EF7] outline-none"
            />
          </div>

          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {['ALL', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'SCHEDULED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-full text-[10px] font-mono transition-all ${
                  statusFilter === st
                    ? 'bg-[#4F6EF7] text-white shadow-md shadow-[#4F6EF7]/20 font-bold'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Jobs Table */}
      <div className="p-6 rounded-2xl bg-[#141414] border border-white/10 space-y-4">
        {loading ? (
          <SkeletonTableRows rows={8} />
        ) : error ? (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
            ❌ {error}
          </div>
        ) : filteredJobs.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-gray-500 font-mono uppercase text-[10px]">
                    <th className="pb-3">Job ID</th>
                    <th className="pb-3">Job Type</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Priority</th>
                    <th className="pb-3">Attempts</th>
                    <th className="pb-3">Scheduled At</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredJobs.map((job) => (
                    <tr
                      key={job.id}
                      onClick={() => onSelectJob(job.id)}
                      className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 font-mono text-gray-300">
                        {job.id ? `${job.id.slice(0, 13)}...` : 'Unknown'}
                      </td>
                      <td className="py-3.5 font-mono font-bold text-gray-100">{job.type}</td>
                      <td className="py-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                            job.status === 'COMPLETED'
                              ? 'bg-[#00C48C]/10 text-[#00C48C] border border-[#00C48C]/20'
                              : job.status === 'FAILED'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : job.status === 'RUNNING'
                              ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                              : 'bg-white/10 text-gray-300 border border-white/10'
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="py-3.5 text-gray-400 font-mono">P{job.priority ?? 0}</td>
                      <td className="py-3.5 text-gray-400 font-mono">
                        {job.attemptCount ?? 0} / {job.maxAttempts ?? 3}
                      </td>
                      <td className="py-3.5 text-gray-400 font-mono">
                        {job.scheduledAt ? new Date(job.scheduledAt).toLocaleTimeString() : 'Immediate'}
                      </td>
                      <td className="py-3.5 text-right font-mono">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectJob(job.id);
                          }}
                          className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-medium border border-white/10"
                        >
                          Inspect Timeline →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {response?.meta && (
              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono text-gray-400">
                <span>
                  Page {response.meta.page} of {response.meta.totalPages} ({response.meta.total} Total Jobs)
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
            <ListTodo className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <p className="text-gray-300 font-bold">No jobs matching filter criteria</p>
            <p>Try switching status filter or selecting another queue.</p>
          </div>
        )}
      </div>
    </div>
  );
};
