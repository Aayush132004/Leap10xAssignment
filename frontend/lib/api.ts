import type {
  Agent,
  Call,
  Evaluation,
  AgentFormData,
  AgentAnalytics,
  DashboardSummary,
  ConsistencyCheckResponse,
  VapiAssistantConfig,
} from "./types";

const API_BASE = "/api";

class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.error || body.message || `Request failed: ${res.status}`,
      res.status,
      body.details
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Agents ────────────────────────────────────────────────
export const agentApi = {
  list: () => request<Agent[]>("/agents"),

  get: (id: string) => request<Agent>(`/agents/${id}`),

  create: (data: AgentFormData) =>
    request<Agent>("/agents", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<AgentFormData>) =>
    request<Agent>(`/agents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/agents/${id}`, { method: "DELETE" }),
};

// ─── Calls ─────────────────────────────────────────────────
export const callApi = {
  list: (filters?: { agentId?: string; source?: string }) => {
    const params = new URLSearchParams();
    if (filters?.agentId) params.set("agentId", filters.agentId);
    if (filters?.source) params.set("source", filters.source);
    const qs = params.toString();
    return request<Call[]>(`/calls${qs ? `?${qs}` : ""}`);
  },

  get: (id: string) => request<Call>(`/calls/${id}`),

  create: (data: {
    agentId: string;
    source: string;
    transcript: unknown[];
    externalId?: string;
    language?: string;
    durationSeconds?: number;
  }) =>
    request<Call>("/calls", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  bulkCreate: (data: { agentId: string; calls: unknown[] }) =>
    request<{ created: number; calls: Call[] }>("/calls/bulk", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/calls/${id}`, { method: "DELETE" }),

  evaluate: (callId: string) =>
    request<Evaluation>(`/calls/${callId}/evaluate`, { method: "POST" }),

  getEvaluations: (callId: string) =>
    request<Evaluation[]>(`/calls/${callId}/evaluation`),

  checkConsistency: (callId: string, runs = 3) =>
    request<ConsistencyCheckResponse>(`/calls/${callId}/consistency-check?runs=${runs}`, {
      method: "POST",
    }),
};

// ─── Voice (Vapi Web SDK — runs entirely in the browser) ────
export const voiceApi = {
  getAssistantConfig: (agentId: string) =>
    request<VapiAssistantConfig>(`/voice/assistant-config/${agentId}`),
};

export const analyticsApi = {
  dashboard: () => request<DashboardSummary>("/analytics/dashboard"),

  agent: (agentId: string) =>
    request<AgentAnalytics>(`/analytics/agents/${agentId}`),
};

// ─── Validation ────────────────────────────────────────────
export const validationApi = {
  compare: (labels: unknown[]) =>
    request<import("./types").ValidationComparisonResponse>("/validation/compare", {
      method: "POST",
      body: JSON.stringify({ labels }),
    }),
};

export { ApiError };
