import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { Project, User } from '../../api/types';
import { SkeletonCardGrid, SkeletonTableRows } from '../common/SkeletonLoader';
import {
  FolderPlus,
  Building2,
  Users,
  Folder,
  ArrowRight,
  X,
  CheckCircle2,
  Shield,
  Layers,
} from 'lucide-react';

interface OrganizationSettingsViewProps {
  onToast: (type: 'success' | 'warning' | 'error', title: string, message?: string) => void;
  onSelectProject?: (project: Project) => void;
}

export const OrganizationSettingsView: React.FC<OrganizationSettingsViewProps> = ({
  onToast,
  onSelectProject,
}) => {
  const { organization, project: currentProject, setProject } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectSlug, setNewProjectSlug] = useState('');
  const [creating, setCreating] = useState(false);

  const orgId = organization?.id || '';

  const fetchData = async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Projects
      const projRes = await api.getProjectsForOrg(orgId);
      const projList = Array.isArray(projRes) ? projRes : projRes.data || [];
      setProjects(projList);

      // 2. Fetch Team Members
      try {
        const usersList = await api.getOrgUsers(orgId);
        setMembers(usersList);
      } catch (_) {
        setMembers([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load organization details');
      onToast('error', 'Failed to load organization settings', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orgId]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const created = await api.createProject(
        orgId,
        newProjectName.trim(),
        newProjectSlug.trim() || undefined
      );

      setProjects((prev) => [created, ...prev]);
      onToast('success', 'Project Created', `Project '${created.name}' created successfully.`);
      
      // Auto switch if no current project
      if (!currentProject) {
        setProject(created);
      }

      setNewProjectName('');
      setNewProjectSlug('');
      setIsCreateModalOpen(false);
    } catch (err: any) {
      onToast('error', 'Project Creation Failed', err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleSwitchProject = (proj: Project) => {
    setProject(proj);
    if (onSelectProject) {
      onSelectProject(proj);
    }
    onToast('success', 'Active Project Switched', `Switched workspace scope to '${proj.name}'`);
  };

  if (loading) {
    return (
      <div className="p-8 space-y-8 max-w-7xl mx-auto">
        <SkeletonCardGrid />
        <SkeletonTableRows rows={4} />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <Building2 className="w-7 h-7 text-[#4F6EF7]" />
            Organization & Workspace Settings
          </h1>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Manage projects, multi-tenant workspace configurations, and access control.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2.5 rounded-full bg-[#4F6EF7] hover:bg-[#4F6EF7]/90 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#4F6EF7]/25 transition-all"
        >
          <FolderPlus className="w-4 h-4" />
          Create Project
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
          ⚠️ {error}
        </div>
      )}

      {/* Organization Overview Card */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#4F6EF7]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#4F6EF7] bg-[#4F6EF7]/10 px-3 py-1 rounded-full border border-[#4F6EF7]/20 uppercase tracking-widest font-bold">
                Tenant Organization
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">
              {organization?.name || 'Acme Operations Corp'}
            </h2>
            <p className="text-xs text-gray-400 font-mono">
              Org ID: <span className="text-gray-200">{orgId}</span> | Slug:{' '}
              <span className="text-gray-200">{organization?.slug || 'acme-ops'}</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl px-5 py-3 text-center">
              <p className="text-xl font-bold text-white font-mono">{projects.length}</p>
              <p className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">Active Projects</p>
            </div>
            <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl px-5 py-3 text-center">
              <p className="text-xl font-bold text-white font-mono">{members.length || 1}</p>
              <p className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">Team Members</p>
            </div>
          </div>
        </div>
      </div>

      {/* Projects List Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2 font-mono">
            <Folder className="w-4 h-4 text-[#4F6EF7]" />
            Projects ({projects.length})
          </h3>
        </div>

        {projects.length === 0 ? (
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-8 text-center space-y-4">
            <Layers className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-sm text-gray-300 font-semibold">No Projects Created Yet</p>
            <p className="text-xs text-gray-500 font-mono max-w-sm mx-auto">
              Create your first project container to group queues, workers, and background jobs.
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 rounded-full bg-[#4F6EF7] text-white text-xs font-bold"
            >
              + Create Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => {
              const isSelected = currentProject?.id === p.id;
              return (
                <div
                  key={p.id}
                  className={`bg-[#141414] border rounded-3xl p-5 space-y-4 transition-all duration-200 relative group hover:border-[#4F6EF7]/50 ${
                    isSelected ? 'border-[#4F6EF7] shadow-lg shadow-[#4F6EF7]/10' : 'border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-[#4F6EF7]/10 border border-[#4F6EF7]/20 flex items-center justify-center text-[#4F6EF7]">
                        <Folder className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white tracking-tight">{p.name}</h4>
                        <p className="text-[11px] text-gray-500 font-mono">slug: {p.slug}</p>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#00C48C]/10 border border-[#00C48C]/20 text-[#00C48C] text-[10px] font-mono font-bold">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-gray-500 font-mono">
                      ID: {p.id.slice(0, 8)}...
                    </span>

                    {!isSelected ? (
                      <button
                        onClick={() => handleSwitchProject(p)}
                        className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-[#4F6EF7] text-gray-300 hover:text-white font-bold text-[11px] flex items-center gap-1.5 transition-colors"
                      >
                        Switch Scope <ArrowRight className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="text-[11px] text-[#00C48C] font-mono font-bold">
                        Selected Workspace
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Team Members Section */}
      <div className="space-y-4 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2 font-mono">
            <Users className="w-4 h-4 text-[#00C48C]" />
            Organization Members ({members.length})
          </h3>
        </div>

        <div className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0A0A0A] border-b border-white/10 text-gray-400 font-mono text-[11px] uppercase">
              <tr>
                <th className="px-6 py-3.5">User Member</th>
                <th className="px-6 py-3.5">Role</th>
                <th className="px-6 py-3.5">Joined Date</th>
                <th className="px-6 py-3.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-gray-300">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#4F6EF7]/20 border border-[#4F6EF7]/30 flex items-center justify-center font-bold text-xs text-[#4F6EF7]">
                      {m.email[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-white">{m.name || m.email.split('@')[0]}</p>
                      <p className="text-[11px] text-gray-500 font-mono">{m.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 font-mono text-[11px] text-gray-300 flex items-center gap-1.5 w-fit">
                      <Shield className="w-3 h-3 text-[#4F6EF7]" />
                      {m.role || 'MEMBER'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-gray-400 text-[11px]">
                    {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : 'Active'}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-[#00C48C] font-semibold text-[11px]">
                    Active
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Project Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-white/10 rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#4F6EF7]/10 border border-[#4F6EF7]/20 flex items-center justify-center text-[#4F6EF7]">
                  <FolderPlus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">Create New Project</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Production Microservices"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white text-xs font-mono focus:border-[#4F6EF7] outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1">
                  Project Slug (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. prod-microservices"
                  value={newProjectSlug}
                  onChange={(e) => setNewProjectSlug(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-white text-xs font-mono focus:border-[#4F6EF7] outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-full border border-white/10 text-gray-300 text-xs font-bold hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-full bg-[#4F6EF7] text-white text-xs font-bold hover:bg-[#4F6EF7]/90 shadow-lg shadow-[#4F6EF7]/20 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
