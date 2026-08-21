import React, { useEffect, useState } from 'react';
import { Job } from '../../api/types';
import { api } from '../../api/client';
import { X, Ban, Cpu } from 'lucide-react';

interface JobDetailModalProps {
  jobId: string | null;
  onClose: () => void;
  onJobUpdated?: () => void;
}

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ jobId, onClose, onJobUpdated }) => {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const fetchDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const details = await api.getJobDetails(jobId);
        setJob(details);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch job details');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [jobId]);

  if (!jobId) return null;

  const handleCancel = async () => {
    if (!job) return;
    setCancelling(true);
    try {
      await api.cancelJob(job.id);
      const updated = await api.getJobDetails(job.id);
      setJob(updated);
      if (onJobUpdated) onJobUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel job');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#141414] border border-white/10 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#141414]/90 backdrop-blur-md z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-white/5 border border-white/10 text-gray-300">
                Job ID: {jobId}
              </span>
              {job && (
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
              )}
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {job ? job.type : 'Loading Job Details...'}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-full bg-white/5 border border-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 flex-1">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-16 bg-white/5 rounded-2xl" />
              <div className="h-40 bg-white/5 rounded-2xl" />
              <div className="h-32 bg-white/5 rounded-2xl" />
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
              ❌ {error}
            </div>
          ) : job ? (
            <>
              {/* Job Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-[#0A0A0A] border border-white/5 text-xs">
                <div>
                  <p className="text-gray-500 text-[10px] uppercase font-mono">Queue</p>
                  <p className="font-bold text-gray-200 font-mono mt-0.5">{job.queue?.name || 'Default'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-[10px] uppercase font-mono">Priority</p>
                  <p className="font-bold text-gray-200 font-mono mt-0.5">P{job.priority}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-[10px] uppercase font-mono">Attempts</p>
                  <p className="font-bold text-gray-200 font-mono mt-0.5">
                    {job.attemptCount} / {job.maxAttempts}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-[10px] uppercase font-mono">Worker Lock</p>
                  <p className="font-mono text-gray-300 mt-0.5 truncate">
                    {job.lockedByWorkerId ? job.lockedByWorkerId.slice(0, 12) : 'None'}
                  </p>
                </div>
              </div>

              {/* Payload & Error/Result Viewers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Payload */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-gray-400 uppercase font-mono">
                    Payload Parameters
                  </span>
                  <pre className="p-4 rounded-2xl bg-[#0A0A0A] border border-white/5 text-[11px] font-mono text-gray-300 overflow-x-auto max-h-40">
                    {JSON.stringify(job.payload, null, 2)}
                  </pre>
                </div>

                {/* Execution Output */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-gray-400 uppercase font-mono">
                    Execution Output / Error
                  </span>
                  <pre className="p-4 rounded-2xl bg-[#0A0A0A] border border-white/5 text-[11px] font-mono text-gray-300 overflow-x-auto max-h-40">
                    {job.error
                      ? JSON.stringify(job.error, null, 2)
                      : job.result
                      ? JSON.stringify(job.result, null, 2)
                      : '// No output logged yet'}
                  </pre>
                </div>
              </div>

              {/* Execution Audit Log Timeline */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  State Audit Timeline & Execution History
                </span>

                <div className="space-y-2 relative before:absolute before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-white/10">
                  {job.logs && job.logs.length > 0 ? (
                    job.logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-4 text-xs relative pl-8">
                        <div className="absolute left-1.5 top-1 w-4 h-4 rounded-full bg-[#141414] border border-white/20 flex items-center justify-center">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              log.level === 'ERROR'
                                ? 'bg-rose-500'
                                : log.level === 'WARN'
                                ? 'bg-amber-400'
                                : 'bg-[#00C48C]'
                            }`}
                          />
                        </div>
                        <div className="flex-1 p-3 rounded-xl bg-[#0A0A0A] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-gray-200">{log.message}</p>
                            {log.meta?.actor && (
                              <p className="text-[10px] text-gray-500 font-mono flex items-center gap-1 mt-0.5">
                                <Cpu className="w-3 h-3 text-gray-400" /> Actor: {log.meta.actor}
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-500 font-mono shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500 font-mono pl-8">No audit logs recorded.</p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between bg-[#141414]">
          {job && (job.status === 'QUEUED' || job.status === 'SCHEDULED') ? (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-4 py-2 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-medium flex items-center gap-2 transition-colors"
            >
              <Ban className="w-4 h-4" /> {cancelling ? 'Cancelling...' : 'Cancel Job'}
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={onClose}
            className="px-6 py-2 rounded-full bg-white/5 hover:bg-white/10 text-white text-xs font-medium border border-white/10 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
