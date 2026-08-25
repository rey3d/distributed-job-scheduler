import React, { useEffect, useState } from 'react';
import { Worker } from '../../api/types';
import { api } from '../../api/client';
import { SkeletonCardGrid } from '../common/SkeletonLoader';
import { Cpu, Server, RefreshCw } from 'lucide-react';

interface WorkerFleetViewProps {
  projectId: string;
  onToast: (type: 'success' | 'warning' | 'error', title: string, message?: string) => void;
}

function getRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 5) return 'Just now (< 5s)';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

function isStale(lastSeenAt: string): boolean {
  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  return diffMs > 30000; // > 30 seconds since last heartbeat
}

export const WorkerFleetView: React.FC<WorkerFleetViewProps> = ({ projectId, onToast }) => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showStaleWorkers, setShowStaleWorkers] = useState(false);

  const fetchWorkers = async (isManual = false) => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    if (isManual) setRefreshing(true);
    try {
      const data = await api.getWorkers(projectId);
      setWorkers(data);
      setError(null);
      if (isManual) onToast('success', 'Worker Fleet Refreshed', `Loaded ${data.length} registered workers`);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch worker fleet');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchWorkers();
      const timer = setInterval(() => fetchWorkers(), 5000);
      return () => clearInterval(timer);
    }
  }, [projectId]);

  const visibleWorkers = showStaleWorkers
    ? workers
    : workers.filter((worker) => !isStale(worker.lastSeenAt) && worker.status !== 'OFFLINE');
  const staleWorkerCount = workers.length - visibleWorkers.length;

  return (
    <div className="p-8 space-y-6 max-w-7xl w-full mx-auto font-sans">
      {/* View Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-5 h-5 text-[#00C48C]" />
            <h1 className="text-xl font-extrabold text-white tracking-tight">Worker Fleet Service</h1>
          </div>
          <p className="text-xs text-gray-400 font-mono">
            Active daemon processes servicing queues via atomic SELECT FOR UPDATE SKIP LOCKED.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {staleWorkerCount > 0 && (
            <button
              onClick={() => setShowStaleWorkers((current) => !current)}
              className="px-4 py-2.5 rounded-full bg-[#141414] hover:bg-[#1E1E1E] border border-white/10 text-xs font-medium text-gray-300"
            >
              {showStaleWorkers ? 'Hide' : 'Show'} {staleWorkerCount} stale
            </button>
          )}
          <button
            onClick={() => fetchWorkers(true)}
            disabled={refreshing}
            className="px-5 py-2.5 rounded-full bg-[#141414] hover:bg-[#1E1E1E] border border-white/10 text-xs font-medium text-gray-200 flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{' '}
            {refreshing ? 'Refreshing...' : 'Refresh Fleet'}
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonCardGrid />
      ) : error ? (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
          ❌ {error}
        </div>
      ) : visibleWorkers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleWorkers.map((worker) => {
            const stale = isStale(worker.lastSeenAt);
            const isOnline = worker.status === 'ONLINE' || worker.status === 'BUSY';

            return (
              <div
                key={worker.id}
                className={`p-6 rounded-2xl bg-[#141414] border transition-all space-y-4 ${
                  stale || !isOnline
                    ? 'border-rose-500/30 bg-rose-500/[0.02]'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        stale || worker.status === 'OFFLINE'
                          ? 'bg-rose-500'
                          : worker.status === 'BUSY'
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-[#00C48C] animate-pulse'
                      }`}
                    />
                    <h3 className="text-sm font-bold font-mono text-white">{worker.name}</h3>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      stale || worker.status === 'OFFLINE'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : worker.status === 'BUSY'
                        ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                        : 'bg-[#00C48C]/10 text-[#00C48C] border border-[#00C48C]/20'
                    }`}
                  >
                    {stale ? 'STALE / UNRESPONSIVE' : worker.status}
                  </span>
                </div>

                {/* Worker Identity Details */}
                <div className="space-y-2 text-xs font-mono p-3 rounded-xl bg-[#0A0A0A] border border-white/5">
                  <div className="flex items-center justify-between text-gray-400">
                    <span>Hostname:</span>
                    <span className="text-gray-200">{worker.hostname}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-400">
                    <span>PID:</span>
                    <span className="text-gray-200">{worker.processId}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-400">
                    <span>Last Heartbeat:</span>
                    <span
                      className={`font-bold ${
                        stale ? 'text-rose-400' : 'text-gray-200'
                      }`}
                    >
                      {getRelativeTime(worker.lastSeenAt)}
                    </span>
                  </div>
                </div>

                {/* Active Assignment */}
                <div className="text-xs space-y-1">
                  <span className="text-[10px] font-mono text-gray-500 uppercase">
                    Active Executions
                  </span>
                  {worker.activeExecutions && worker.activeExecutions.length > 0 ? (
                    <div className="p-3 rounded-xl bg-[#4F6EF7]/10 border border-[#4F6EF7]/20 text-[#4F6EF7] font-mono">
                      ⚡ Executing Job #{worker.activeExecutions[0].jobId.slice(0, 8)}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-gray-400 font-mono">
                      Idle (Listening for ready jobs)
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-12 rounded-2xl bg-[#141414] border border-white/10 text-center text-gray-500 font-mono text-xs space-y-2">
          <Server className="w-8 h-8 text-gray-600 mx-auto mb-2" />
          <p className="text-gray-300 font-bold">No active worker daemons detected</p>
          <p>Start the local stack (`pnpm dev`) to register three worker nodes.</p>
        </div>
      )}
    </div>
  );
};
