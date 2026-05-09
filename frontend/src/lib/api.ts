const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

// Auth
export const auth = {
  register: (email: string, password: string, name: string) =>
    request<{ token: string; user: { id: string; email: string; name: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string; name: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () =>
    request<{ user: { id: string; email: string; name: string } }>('/auth/me'),
};

// Company
export const company = {
  generateOrgChart: (companyName: string, industry: string, description: string, vision: string) =>
    request<{ agents: import('../types').OrgChartAgent[] }>('/company/generate-orgchart', {
      method: 'POST',
      body: JSON.stringify({ companyName, industry, description, vision }),
    }),
  setup: (companyName: string, industry: string, description: string, vision: string, agents: import('../types').OrgChartAgent[], mode?: import('../types').CompanyMode) =>
    request<{ company: import('../types').Company }>('/company/setup', {
      method: 'POST',
      body: JSON.stringify({ companyName, industry, description, vision, agents, mode }),
    }),
  get: () => request<{ company: import('../types').Company }>('/company'),
  reset: () => request<{ success: boolean }>('/company', { method: 'DELETE' }),
  update: (data: { companyName?: string; industry?: string; description?: string; vision?: string; mode?: import('../types').CompanyMode }) =>
    request<{ company: import('../types').Company }>('/company', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

// Agents
export const agents = {
  list: () => request<{ agents: import('../types').Agent[] }>('/agents'),
  get: (id: string) => request<{ agent: import('../types').Agent }>(`/agents/${id}`),
  chat: (id: string, message: string, history: import('../types').ChatMessage[]) =>
    request<{ reply: string; agentName: string }>(`/agents/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),
  update: (id: string, data: Partial<import('../types').Agent>) =>
    request<{ agent: import('../types').Agent }>(`/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  create: (data: { name: string; role: string; department?: string; age?: number; background?: string; personality?: string; expertise?: string; communicationStyle?: string; hobby?: string; avatarUrl?: string }) =>
    request<{ agent: import('../types').Agent }>('/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/agents/${id}`, { method: 'DELETE' }),
  briefing: (createTasks = false) =>
    request<{ briefing: string; briefingPoints?: string[]; createdTasks: import('../types').Task[]; agentName: string; agentAvatar: string }>('/agents/briefing', {
      method: 'POST',
      body: JSON.stringify({ createTasks }),
    }),
  suggestions: () =>
    request<{ suggestions: Array<{ emoji: string; text: string; agentId: string; agentName: string; agentRole?: string }> }>('/agents/suggestions'),
  agentTaskSuggestions: (agentId: string) =>
    request<{ suggestions: Array<{ emoji: string; text: string; agentId: string; agentName: string; agentRole?: string }> }>(`/agents/${agentId}/task-suggestions`),
  proactiveCheck: () =>
    request<{ suggestion: string | null; doneCount: number; agentName?: string; agentAvatar?: string }>('/agents/proactive-check'),
};

// Tasks
export const tasks = {
  list: (filters?: { status?: string; agentId?: string; memberId?: string; priority?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.agentId) params.set('agentId', filters.agentId);
    if (filters?.memberId) params.set('memberId', filters.memberId);
    if (filters?.priority) params.set('priority', filters.priority);
    const qs = params.toString();
    return request<{ tasks: import('../types').Task[] }>(`/tasks${qs ? `?${qs}` : ''}`);
  },
  create: (data: { title: string; description: string; assignedAgentId?: string; assignedMemberId?: string; priority?: string; autoExecute?: boolean }) =>
    request<{ task: import('../types').Task }>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  generate: (id: string) =>
    request<{ task: import('../types').Task }>(`/tasks/${id}/generate`, { method: 'POST' }),
  update: (id: string, data: Partial<import('../types').Task>) =>
    request<{ task: import('../types').Task }>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
};

// Meetings
export const meetings = {
  list: () => request<{ meetings: import('../types').Meeting[] }>('/meetings'),
  get: (id: string) => request<{ meeting: import('../types').Meeting }>(`/meetings/${id}`),
  create: (data: { title: string; agenda: string[]; agentIds: string[]; memberIds?: string[]; mode?: string; leadAgentId?: string; scheduledAt?: string }) =>
    request<{ meeting: import('../types').Meeting }>('/meetings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  run: (id: string) =>
    request<{ meeting: import('../types').Meeting }>(`/meetings/${id}/run`, { method: 'POST' }),
  followup: (id: string, agentId: string, question: string) =>
    request<{ reply: string; agentName: string }>(`/meetings/${id}/followup`, {
      method: 'POST',
      body: JSON.stringify({ agentId, question }),
    }),
  summarize: (id: string) =>
    request<{ summary: import('../types').MeetingSummary }>(`/meetings/${id}/summarize`, { method: 'POST' }),
  end: (id: string, transcript?: string[]) =>
    request<{ meeting: import('../types').Meeting }>(`/meetings/${id}/end`, {
      method: 'POST',
      body: JSON.stringify({ transcript }),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/meetings/${id}`, { method: 'DELETE' }),
};

// Dashboard
export const dashboard = {
  get: () => request<import('../types').DashboardData>('/dashboard'),
};

// Members
export const members = {
  list: () => request<{ members: import('../types').CompanyMember[] }>('/members'),
  get: (id: string) => request<{ member: import('../types').CompanyMember }>(`/members/${id}`),
  invite: (data: { name: string; email: string; role: import('../types').CompanyMemberRole; photoUrl?: string }) =>
    request<{ member: import('../types').CompanyMember; resent?: boolean }>('/members', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<{ success: boolean }>(`/members/${id}`, { method: 'DELETE' }),
  getInviteInfo: (token: string) =>
    fetch(`/api/members/invite-info?token=${encodeURIComponent(token)}`)
      .then(r => r.json()) as Promise<{
        name: string; email: string; role: string;
        companyName: string; companyId: string; memberId: string;
        error?: string;
      }>,
  acceptInvite: (token: string, password: string) =>
    request<{ token: string; user: { id: string; email: string; name: string } }>('/members/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
};

// Integrations
export const integrations = {
  status: () => request<{
    jira: { connected: boolean; workspaceName: string | null };
    google: { connected: boolean; email: string | null };
  }>('/integrations/status'),
  jiraConnect: () => {
    const token = localStorage.getItem('token') ?? '';
    window.location.href = `/api/integrations/jira/connect?token=${encodeURIComponent(token)}`;
  },
  jiraDisconnect: () => request<{ success: boolean }>('/integrations/jira/disconnect', { method: 'POST' }),
  googleConnect: () => {
    const token = localStorage.getItem('token') ?? '';
    window.location.href = `/api/integrations/google/connect?token=${encodeURIComponent(token)}`;
  },
  googleDisconnect: () => request<{ success: boolean }>('/integrations/google/disconnect', { method: 'POST' }),
};

// Standup
export const standup = {
  generate: (agentId: string) =>
    request<{ standup: { date: string; completed: string; workingOn: string; blockers: string } }>(`/agents/${agentId}/standup`, { method: 'POST' }),
};

// Chat
export const chat = {
  group: (message: string, agentIds: string[], pickRelevant: boolean) =>
    request<{ responses: Array<{ agentId: string; agentName: string; agentRole: string; agentAvatar: string; reply: string }> }>('/chat/group', {
      method: 'POST',
      body: JSON.stringify({ message, agentIds, pickRelevant }),
    }),
};
