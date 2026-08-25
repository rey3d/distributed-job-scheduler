import {
  User,
  AuthResponse,
  Organization,
  Project,
  Queue,
  QueueStats,
  Job,
  Worker,
  DeadLetterJob,
  DashboardSummary,
  ThroughputChartResponse,
  PaginatedResponse,
} from './types';

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && !endpoint.startsWith('/auth/')) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_org');
    localStorage.removeItem('auth_project');
    window.dispatchEvent(new Event('auth:unauthorized'));
  }

  if (!response.ok) {
    let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
    try {
      const errData = await response.json();
      if (errData.message) {
        errorMessage = Array.isArray(errData.message)
          ? errData.message.join(', ')
          : errData.message;
      }
    } catch (_) {}
    throw new Error(errorMessage);
  }

  // Return json if content exists
  const text = await response.text();
  return text ? JSON.parse(text) : ({} as T);
}

export const api = {
  // Auth
  login: (email: string, password = 'password123') =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (
    email: string,
    organizationName: string,
    password = 'password123',
    organizationSlug?: string
  ) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        organizationName,
        password,
        organizationSlug,
      }),
    }),

  // Organizations
  createOrg: (name: string, slug?: string) =>
    request<Organization>('/organizations', {
      method: 'POST',
      body: JSON.stringify({ name, slug }),
    }),

  getOrg: (id: string) => request<Organization>(`/organizations/${id}`),

  getOrgUsers: (id: string) => request<User[]>(`/organizations/${id}/users`),

  // Projects
  createProject: (organizationId: string, name: string, slug?: string) =>
    request<Project>(`/organizations/${organizationId}/projects`, {
      method: 'POST',
      body: JSON.stringify({ name, slug }),
    }),

  getProjectsForOrg: (organizationId: string) =>
    request<PaginatedResponse<Project>>(`/organizations/${organizationId}/projects`),

  getProject: (id: string) => request<Project>(`/projects/${id}`),

  // Dashboard Summary & Charts
  getDashboardSummary: (projectId: string) =>
    request<DashboardSummary>(`/projects/${projectId}/dashboard-summary`),

  getThroughputChart: (projectId: string, hours = 6) =>
    request<ThroughputChartResponse>(`/projects/${projectId}/throughput-chart?hours=${hours}`),

  // Queues
  getQueues: async (projectId: string): Promise<Queue[]> => {
    const res = await request<PaginatedResponse<Queue>>(`/projects/${projectId}/queues`);
    if (res && Array.isArray(res.data)) {
      return res.data;
    }
    if (Array.isArray(res)) {
      return res;
    }
    return [];
  },

  getQueueStats: (queueId: string) =>
    request<QueueStats>(`/queues/${queueId}/stats`),

  createQueue: (
    projectId: string,
    data: {
      name: string;
      priority?: number;
      concurrencyLimit?: number;
      retryPolicy?: {
        strategy: string;
        baseDelaySec?: number;
        maxAttempts?: number;
        maxDelayCapSec?: number;
      };
    }
  ) =>
    request<Queue>(`/projects/${projectId}/queues`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateQueue: (
    queueId: string,
    data: {
      priority?: number;
      concurrencyLimit?: number;
      retryPolicy?: {
        strategy: string;
        baseDelaySec?: number;
        maxAttempts?: number;
        maxDelayCapSec?: number;
      };
    }
  ) =>
    request<Queue>(`/queues/${queueId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  pauseQueue: (queueId: string) =>
    request<Queue>(`/queues/${queueId}/pause`, {
      method: 'POST',
    }),

  resumeQueue: (queueId: string) =>
    request<Queue>(`/queues/${queueId}/resume`, {
      method: 'POST',
    }),

  // Jobs
  enqueueJob: async (
    queueId: string,
    data: { type: string; payload?: any; priority?: number; delaySec?: number; maxAttempts?: number }
  ): Promise<Job> => {
    const res = await request<any>(`/queues/${queueId}/jobs`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res?.job || res;
  },

  enqueueScheduledJob: (
    queueId: string,
    data: {
      name: string;
      jobType: string;
      payload: any;
      runAt?: string;
      cronExpression?: string;
    }
  ) =>
    request<any>(`/queues/${queueId}/jobs/scheduled`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  enqueueBatchJobs: (
    queueId: string,
    data: { jobs: Array<{ type: string; payload: any; priority?: number }> }
  ) =>
    request<any>(`/queues/${queueId}/jobs/batch`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getJobs: (queueId: string, params: { status?: string; page?: number; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.status && params.status !== 'ALL') query.append('status', params.status);
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));
    const qs = query.toString();
    return request<PaginatedResponse<Job>>(`/queues/${queueId}/jobs${qs ? `?${qs}` : ''}`);
  },

  getJobDetails: (jobId: string) => request<Job>(`/jobs/${jobId}`),

  cancelJob: (jobId: string) =>
    request<Job>(`/jobs/${jobId}/cancel`, {
      method: 'POST',
    }),

  retryJob: (jobId: string) =>
    request<Job>(`/jobs/${jobId}/retry`, {
      method: 'POST',
    }),

  // Workers
  getWorkers: (projectId: string) =>
    request<Worker[]>(`/projects/${projectId}/workers`),

  // DLQ
  getDeadLetterJobs: (projectId: string, page = 1, limit = 20) =>
    request<PaginatedResponse<DeadLetterJob>>(`/projects/${projectId}/dead-letter?page=${page}&limit=${limit}`),
};
