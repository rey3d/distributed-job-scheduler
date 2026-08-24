import React, { useEffect, useState } from 'react';
import { DashboardSummary, Queue, ThroughputChartResponse } from '../../api/types';
import { api } from '../../api/client';
import { SkeletonCardGrid, SkeletonTableRows } from '../common/SkeletonLoader';
import {
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Cpu,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  Zap,
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
  const [throughputData, setThroughputData] = useState<ThroughputChartResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [loadingChart, setLoadingChart] = useState<boolean>(true);
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

  const fetchThroughputChart = async () => {
    if (!projectId) return;
    setLoadingChart(true);
    try {
      const data = await api.getThroughputChart(projectId, 6);
      setThroughputData(data);
    } catch (err) {
      console.error('Failed to load throughput chart:', err);
    } finally {
      setLoadingChart(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchDashboardData();
      fetchThroughputChart();
      const timer = setInterval(() => {
        fetchDashboardData();
        fetchThroughputChart();
      }, 5000);
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
  const health = summary?.systemHealth || 'HEALTHY';
  const isHealthy = health === 'HEALTHY';
  const isDegraded = health === 'DEGRADED';

  // SVG Chart Calculation
  const buckets = throughputData?.buckets || [];
  const maxCount = Math.max(...buckets.map((b) => b.completedCount), 1);

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

      {/* Hero Aurora Greeting & System Health Header */}
      <div className="relative overflow-hidden rounded-3xl p-8 bg-[#141414] border border-white/10 shadow-2xl">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-gradient-to-br from-[#4F6EF7]/20 via-[#00C48C]/15 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {/* System Health Pill */}
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                  isHealthy
                    ? 'bg-[#00C48C]/10 text-[#00C48C] border-[#00C48C]/20'
                    : isDegraded
                    ? 'bg-amber-400/10 text-amber-400 border-amber-400/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}
              >
                {isHealthy ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-[#00C48C]" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5" />
                )}
                System Status: {health}
              </span>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-gray-300">
                <Cpu className="w-3.5 h-3.5 text-[#4F6EF7]" />
                {summary?.onlineWorkers ?? 0} Workers Online
              </span>
            </div>

            <h2 className="text-3xl font-black tracking-tight text-white">
              AetherFlow Operations Console
            </h2>
            <p className="text-xs text-gray-400 font-mono max-w-2xl">
              PostgreSQL-backed atomic job engine. Success Rate:{' '}
              <span className="text-[#00C48C] font-bold">{summary?.successRate24h ?? 100}%</span> | Active Queues:{' '}
              <span className="text-white font-bold">{summary?.activeQueues ?? 0}</span> | Paused Queues:{' '}
              <span className="text-amber-400 font-bold">{summary?.pausedQueues ?? 0}</span>
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => fetchDashboardData(true)}
              disabled={refreshing}
              className="px-5 py-2.5 rounded-full bg-[#1E1E1E] hover:bg-[#262626] border border-white/10 text-xs font-bold text-gray-200 flex items-center gap-2 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />{' '}
              {refreshing ? 'Refreshing...' : 'Refresh Fleet'}
            </button>

            <button
              onClick={onOpenEnqueueModal}
              className="px-5 py-2.5 rounded-full bg-[#4F6EF7] hover:bg-[#4F6EF7]/90 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#4F6EF7]/20 transition-colors"
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
            sub: `${summary?.pausedQueues ?? 0} Paused Queues`,
            icon: Layers,
            color: 'text-[#4F6EF7]',
          },
          {
            label: 'Pending Backlog',
            value: summary?.pendingJobs ?? 0,
            sub: `${summary?.runningJobs ?? 0} Currently Running`,
            icon: Clock,
            color: 'text-amber-400',
          },
          {
            label: 'Completed Today',
            value: summary?.completedToday ?? 0,
            sub: `${summary?.failedToday ?? 0} Failed Today`,
            icon: CheckCircle2,
            color: 'text-[#00C48C]',
          },
          {
            label: 'Dead Letter Queue',
            value: deadLetterCount,
            sub: deadLetterCount > 0 ? 'Requires Manual Intervention' : 'DLQ Clean & Healthy',
            icon: AlertTriangle,
            color: deadLetterCount > 0 ? 'text-rose-500' : 'text-gray-500',
          },
        ].map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="p-6 rounded-3xl bg-[#141414] border border-white/10 hover:border-white/20 transition-all group shadow-xl"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider">
                  {kpi.label}
                </span>
                <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
                  <Icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
              </div>
              <div className="text-3xl font-extrabold text-white tracking-tight font-mono">
                {(kpi.value ?? 0).toLocaleString()}
              </div>
              <div className="mt-2 text-[11px] text-gray-500 font-mono">{kpi.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Task 7d: Throughput Visualization Chart */}
      <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#00C48C]" />
              System Throughput & Completion Trend (Last 6 Hours)
            </h3>
            <p className="text-xs text-gray-400 font-mono mt-1">
              Time-bucketed job completion volume aggregated in 15-minute intervals.
            </p>
          </div>

          <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-gray-400">
            PostgreSQL Aggregate Query
          </span>
        </div>

        {loadingChart ? (
          <div className="h-44 bg-[#0A0A0A] rounded-2xl border border-white/5 animate-pulse flex items-center justify-center text-xs font-mono text-gray-500">
            Computing throughput aggregate metrics...
          </div>
        ) : buckets.length === 0 ? (
          <div className="h-44 bg-[#0A0A0A] rounded-2xl border border-white/5 flex items-center justify-center text-xs font-mono text-gray-500 space-y-2 flex-col">
            <Zap className="w-6 h-6 text-gray-600" />
            <p>No completed jobs recorded in the last 6 hours.</p>
            <p className="text-[11px] text-gray-600">Enqueue test jobs to generate throughput curve.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-48 w-full bg-[#0A0A0A] border border-white/5 rounded-2xl p-4 relative flex items-end justify-between gap-1 overflow-hidden">
              {/* Background Horizontal Grid Lines */}
              <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none opacity-10">
                <div className="border-b border-white w-full" />
                <div className="border-b border-white w-full" />
                <div className="border-b border-white w-full" />
              </div>

              {/* Bar Chart Visualizer */}
              {buckets.map((b, idx) => {
                const heightPct = Math.max((b.completedCount / maxCount) * 100, 4);
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative z-10">
                    {/* Hover Tooltip */}
                    <div className="absolute -top-10 hidden group-hover:flex flex-col items-center bg-[#1E1E1E] border border-white/10 rounded-lg px-2.5 py-1 z-20 text-[10px] font-mono text-white shadow-xl whitespace-nowrap">
                      <span>{b.label}</span>
                      <span className="font-bold text-[#00C48C]">{b.completedCount} jobs</span>
                    </div>

                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full max-w-[24px] bg-gradient-to-t from-[#4F6EF7]/40 to-[#00C48C] rounded-t-sm group-hover:brightness-125 transition-all duration-200"
                    />
                  </div>
                );
              })}
            </div>

            {/* Time Axis Labels */}
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-500 px-2">
              <span>{buckets[0]?.label || '6h ago'}</span>
              <span>Middle Window</span>
              <span>Now ({buckets[buckets.length - 1]?.label})</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Section: Queue System Overview Table */}
      <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#4F6EF7]" />
            Queue System Overview
          </h3>
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
                      <td className="py-3.5 font-mono font-bold text-gray-200 flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-[#4F6EF7]" />
                        {row.name}
                      </td>
                      <td className="py-3.5 text-gray-400 font-mono">P{row.priority ?? 0}</td>
                      <td className="py-3.5 text-gray-400 font-mono">{row.concurrencyLimit ?? 5} worker slots</td>
                      <td className="py-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
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
