import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthView } from './components/views/AuthView';
import { DashboardHomeView } from './components/views/DashboardHomeView';
import { JobExplorerView } from './components/views/JobExplorerView';
import { WorkerFleetView } from './components/views/WorkerFleetView';
import { QueuesView } from './components/views/QueuesView';
import { DeadLetterQueueView } from './components/views/DeadLetterQueueView';
import { OrganizationSettingsView } from './components/views/OrganizationSettingsView';
import { ProjectSwitcher } from './components/layout/ProjectSwitcher';

import { JobDetailModal } from './components/modals/JobDetailModal';
import { EnqueueJobModal } from './components/modals/EnqueueJobModal';
import { CreateQueueModal } from './components/modals/CreateQueueModal';
import { EditQueueModal } from './components/modals/EditQueueModal';
import { ToastContainer, ToastMessage } from './components/common/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';

import { Queue } from './api/types';
import { api } from './api/client';
import {
  LayoutDashboard,
  Cpu,
  Layers,
  ListTodo,
  AlertTriangle,
  Bell,
  Server,
  Zap,
  LogOut,
  Settings,
} from 'lucide-react';

function DashboardApp() {
  const { user, organization, project, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'queues' | 'jobs' | 'workers' | 'dlq' | 'settings'
  >('dashboard');
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);

  // Modal States
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isEnqueueOpen, setIsEnqueueOpen] = useState(false);
  const [isCreateQueueOpen, setIsCreateQueueOpen] = useState(false);
  const [editingQueue, setEditingQueue] = useState<Queue | null>(null);
  const [availableQueues, setAvailableQueues] = useState<Queue[]>([]);

  // Toast System State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'warning' | 'error', title: string, message?: string) => {
    const newToast: ToastMessage = {
      id: String(Date.now() + Math.random()),
      type,
      title,
      message,
    };
    setToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
    }, 4000);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (!user) {
    return <AuthView />;
  }

  const projectId = project?.id || '';

  const handleOpenEnqueue = async () => {
    if (!projectId) return;
    try {
      const qList = await api.getQueues(projectId);
      setAvailableQueues(qList);
      setIsEnqueueOpen(true);
    } catch (err: any) {
      addToast('error', 'Failed to load queues', err.message);
    }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-gray-200 overflow-hidden font-sans">
      {/* Left Sidebar */}
      <aside className="w-64 bg-[#0D0D0D] border-r border-white/10 flex flex-col justify-between p-4 shrink-0">
        <div>
          {/* Logo / Brand Header */}
          <div className="flex items-center gap-3 px-3 py-4 mb-6">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#4F6EF7] to-[#00C48C] flex items-center justify-center shadow-lg shadow-[#4F6EF7]/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wide text-white uppercase">AetherFlow</h1>
              <p className="text-[11px] text-gray-400 font-mono">Job Engine v1.0</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'queues', label: 'Queues & Concurrency', icon: Layers },
              { id: 'jobs', label: 'Job Explorer', icon: ListTodo },
              { id: 'workers', label: 'Worker Fleet', icon: Cpu },
              { id: 'dlq', label: 'Dead Letter Queue', icon: AlertTriangle },
              { id: 'settings', label: 'Organization & Settings', icon: Settings },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-full text-xs font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-[#4F6EF7] text-white shadow-lg shadow-[#4F6EF7]/25 font-bold'
                      : 'text-gray-400 hover:text-gray-100 hover:bg-[#141414]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer / Health Status & User Profile */}
        <div className="space-y-3">
          <div className="p-3 rounded-2xl bg-[#141414] border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#00C48C] animate-pulse" />
              <div className="text-[11px]">
                <p className="text-gray-200 font-medium">PostgreSQL Connected</p>
                <p className="text-gray-500 font-mono">NestJS API :3001</p>
              </div>
            </div>
            <Server className="w-4 h-4 text-gray-500" />
          </div>

          <div className="p-3 rounded-2xl bg-[#141414] border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#4F6EF7]/20 border border-[#4F6EF7]/30 flex items-center justify-center font-bold text-xs text-[#4F6EF7]">
                {user.name ? user.name[0] : 'U'}
              </div>
              <div className="text-xs truncate max-w-[110px]">
                <p className="font-semibold text-gray-200 truncate">{user.name}</p>
                <p className="text-gray-500 text-[10px] truncate">{user.email}</p>
              </div>
            </div>

            <button
              onClick={logout}
              title="Logout"
              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Top Header */}
        <header className="h-16 border-b border-white/10 px-8 flex items-center justify-between bg-[#0A0A0A]/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-gray-300">
              Org: {organization?.name || 'Acme Operations'}
            </span>
            <span className="text-gray-600">/</span>
            <ProjectSwitcher onOpenCreateProject={() => setActiveTab('settings')} />
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('settings')}
              title="Settings"
              className={`p-2 rounded-full text-gray-400 hover:text-gray-100 hover:bg-[#141414] transition-colors ${
                activeTab === 'settings' ? 'text-[#4F6EF7] bg-[#4F6EF7]/10' : ''
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-full text-gray-400 hover:text-gray-100 hover:bg-[#141414] transition-colors relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#4F6EF7]" />
            </button>
          </div>
        </header>

        {/* View Routing Body with Safety ErrorBoundary */}
        <div className="flex-1">
          <ErrorBoundary fallbackTitle="Dashboard View Error">
            {activeTab === 'dashboard' && (
              <DashboardHomeView
                projectId={projectId}
                onOpenEnqueueModal={handleOpenEnqueue}
                onSelectQueue={(queueId) => {
                  setSelectedQueueId(queueId);
                  setActiveTab('jobs');
                }}
                onToast={addToast}
              />
            )}

            {activeTab === 'jobs' && (
              <JobExplorerView
                projectId={projectId}
                selectedQueueId={selectedQueueId}
                onSelectJob={(jobId) => setSelectedJobId(jobId)}
                onToast={addToast}
              />
            )}

            {activeTab === 'workers' && (
              <WorkerFleetView projectId={projectId} onToast={addToast} />
            )}

            {activeTab === 'queues' && (
              <QueuesView
                projectId={projectId}
                onOpenCreateQueueModal={() => setIsCreateQueueOpen(true)}
                onOpenEditQueueModal={(queue) => setEditingQueue(queue)}
                onToast={addToast}
              />
            )}

            {activeTab === 'dlq' && (
              <DeadLetterQueueView projectId={projectId} onToast={addToast} />
            )}

            {activeTab === 'settings' && (
              <OrganizationSettingsView
                onToast={addToast}
                onSelectProject={() => {
                  setActiveTab('dashboard');
                }}
              />
            )}
          </ErrorBoundary>
        </div>
      </main>

      {/* Global Modals */}
      {selectedJobId && (
        <JobDetailModal
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onJobUpdated={() => addToast('success', 'Job Updated')}
        />
      )}

      {isEnqueueOpen && (
        <EnqueueJobModal
          queues={availableQueues}
          onClose={() => setIsEnqueueOpen(false)}
          onJobEnqueued={(msg) => addToast('success', 'Job Enqueued', msg)}
        />
      )}

      {isCreateQueueOpen && (
        <CreateQueueModal
          projectId={projectId}
          onClose={() => setIsCreateQueueOpen(false)}
          onQueueCreated={(qName) => {
            addToast('success', 'Queue Created', `Created queue '${qName}'`);
            setActiveTab('queues');
          }}
        />
      )}

      {editingQueue && (
        <EditQueueModal
          queue={editingQueue}
          onClose={() => setEditingQueue(null)}
          onQueueUpdated={(msg) => {
            addToast('success', 'Queue Updated', msg);
            setActiveTab('queues');
          }}
        />
      )}

      {/* Global Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DashboardApp />
    </AuthProvider>
  );
}
