import React, { useEffect, useState } from 'react';
import { DashboardSummary, Queue } from '../../api/types';
import { api } from '../../api/client';
import { SkeletonCardGrid, SkeletonTableRows } from '../common/SkeletonLoader';
import {
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Activity,
} from 'lucide-react';

interface DashboardHomeViewProps {
  projectId: string;
  onOpenEnqueueModal: () => void;
  onSelectQueue: (queueId: string) => void;
  onToast: (type: 'success' | 'warning' | 'error', title: string, message?: string) => void;
}

export const DashboardHomeView: React.FC<DashboardHomeViewProps> = ({
  projectId,
  onOpenEnqueueModal,
  onSelectQueue,
  onToast,
}) => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async (isManual = false) => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    if (isManual) setRefreshing(true);
    try {
      const [summaryData, queuesData] = await Promise.all([
        api.getDashboardSummary(projectId),
        api.getQueues(projectId),
      ]);
      setSummary(summaryData);
      setQueues(Array.isArray(queuesData) ? queuesData : (queuesData as any)?.data || []);
      setError(null);
      if (isManual) onToast('success', 'Dashboard Refreshed', 'Latest KPI metrics and queue statuses loaded');
    } catch (err: any) {
      setError(err.message || 'Failed to connect to API server');
      if (isManual) onToast('error', 'Fetch Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchDashboardData();
      const timer = setInterval(() => fetchDashboardData(), 5000);
      return () => clearInterval(timer);
    }
  }, [projectId]);

  if (loading && !summary && queues.length === 0) {
    return (
      <div className="p-8 space-y-8 max-w-7xl w-full mx-auto font-sans">
        <div className="h-40 bg-[#141414] border border-white/10 rounded-3xl animate-pulse" />
        <SkeletonCardGrid />
        <SkeletonTableRows rows={4} />
      </div>
    );
  }

  const deadLetterCount = summary?.deadLetterJobs ?? summary?.deadLetterCount ?? 0;

  return (
    <div className="p-8 space-y-8 max-w-7xl w-full mx-auto font-sans">
      {/* Error State Alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button
            onClick={() => fetchDashboardData(true)}
            className="px-3 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold"
          >
            Retry API Call
          </button>
        </div>
      )}

      {/* Hero Aurora Greeting Card */}
      <div className="relative overflow-hidden rounded-3xl p-8 bg-[#141414] border border-white/10 shadow-2xl">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-gradient-to-br from-[#4F6EF7]/20 via-[#00C48C]/15 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-[#00C48C] mb-3">
              <Activity className="w-3.5 h-3.5 animate-spin" /> Live Distributed Scheduler Engine
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white mb-2">
              Distributed Job Scheduler
            </h2>
            <p className="text-sm text-gray-400 max-w-xl">
              Real-time monitoring for atomic job claiming, worker fleet heartbeats, retries, and dead letter queue (DLQ) operations.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchDashboardData(true)}
              disabled={refreshing}
              className="px-5 py-2.5 rounded-full bg-[#1E1E1E] hover:bg-[#262626] border border-white/10 text-xs font-medium text-gray-200 flex items-center gap-2 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />{' '}
              {refreshing ? 'Refreshing...' : 'Refresh Fleet'}
            </button>

            <button
              onClick={onOpenEnqueueModal}
              className="px-5 py-2.5 rounded-full bg-[#4F6EF7] hover:bg-[#4F6EF7]/90 text-white text-xs font-medium flex items-center gap-2 shadow-lg shadow-[#4F6EF7]/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Enqueue Test Job
            </button>
          </div>
        </div>
      </div>

      {/* 4-Column Real API KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          {
            label: 'Active Queues',
            value: summary?.activeQueues ?? queues.filter((q) => !q.paused).length ?? 0,
            change: 'Live PostgreSQL Queues',
            icon: Layers,
            color: 'text-[#4F6EF7]',
          },
          {
            label: 'Pending Jobs',
            value: summary?.pendingJobs ?? 0,
            change: 'QUEUED + SCHEDULED',
            icon: Clock,
            color: 'text-amber-400',
          },
          {
            label: 'Completed Today',
            value: summary?.completedToday ?? 0,
            change: 'Processed by Workers',
            icon: CheckCircle2,
            color: 'text-[#00C48C]',
          },
          {
            label: 'Dead Letter Jobs',
            value: deadLetterCount,
            change: deadLetterCount > 0 ? 'Requires Manual Retry' : 'DLQ Empty',
            icon: AlertTriangle,
            color: deadLetterCount > 0 ? 'text-rose-500' : 'text-gray-500',
          },
        ].map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="p-6 rounded-2xl bg-[#141414] border border-white/10 hover:border-white/20 transition-all group"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-gray-400">{kpi.label}</span>
                <div className="p-2 rounded-xl bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
                  <Icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
              </div>
              <div className="text-3xl font-extrabold text-white tracking-tight font-mono">
                {(kpi.value ?? 0).toLocaleString()}
              </div>
              <div className="mt-2 text-[11px] text-gray-500 font-mono">{kpi.change}</div>
            </div>
          );
        })}
      </div>

      {/* Bottom Section: Queue System Overview Table */}
      <div className="p-6 rounded-2xl bg-[#141414] border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Queue System Overview</h3>
          <span className="text-xs text-gray-500 font-mono">5s Auto-Polling Active</span>
        </div>

        {queues && queues.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-gray-500 font-mono uppercase text-[10px]">
                  <th className="pb-3">Queue Name</th>
                  <th className="pb-3">Priority</th>
                  <th className="pb-3">Concurrency</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Backlog Jobs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {queues.map((row) => {
                  const queuedCount = row.liveCounts?.queued ?? 0;
                  const runningCount = row.liveCounts?.running ?? 0;
                  const totalBacklog = queuedCount + runningCount;

                  return (
                    <tr
                      key={row.id}
                      onClick={() => onSelectQueue(row.id)}
                      className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 font-mono font-medium text-gray-200">{row.name}</td>
                      <td className="py-3.5 text-gray-400 font-mono">P{row.priority ?? 0}</td>
                      <td className="py-3.5 text-gray-400 font-mono">{row.concurrencyLimit ?? 5} worker slots</td>
                      <td className="py-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono ${
                            !row.paused
                              ? 'bg-[#00C48C]/10 text-[#00C48C] border border-[#00C48C]/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {!row.paused ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className="py-3.5 text-right font-mono text-gray-200 font-bold">
                        {(totalBacklog ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500 font-mono text-xs">
            No queues found in this project. Click "Enqueue Test Job" or create a queue in the Queues tab.
          </div>
        )}
      </div>
    </div>
  );
};
