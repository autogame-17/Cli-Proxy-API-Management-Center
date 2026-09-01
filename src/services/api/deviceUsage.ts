import { apiClient } from './client';

export interface DeviceUsageStatus {
  schema_version: number;
  collection_enabled: boolean;
  storage_available: boolean;
  data_available: boolean;
  storage_error?: string;
  queued_events: number;
  dropped_events: number;
  failed_writes: number;
  retention_days: number;
}

export interface DeviceUsageSummary {
  device_id: string;
  display_id: string;
  name: string;
  automatic_name: string;
  source: string;
  confidence: string;
  first_seen?: string;
  last_seen?: string;
  user_id?: number;
  user_name?: string;
  requests: number;
  successes: number;
  failures: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_tokens: number;
  total_tokens: number;
  average_latency_ms: number;
  success_rate?: number;
}

export interface DeviceUsageTrendPoint {
  period: string;
  requests: number;
  successes: number;
  failures: number;
  total_tokens: number;
}

export interface DeviceUsageDimensionStat {
  name: string;
  requests: number;
  total_tokens: number;
}

export interface DeviceUsageDetail extends DeviceUsageSummary {
  trend: DeviceUsageTrendPoint[];
  by_model: DeviceUsageDimensionStat[];
  by_endpoint: DeviceUsageDimensionStat[];
}

export interface DeviceUsageUser {
  user_id: number;
  name: string;
  created_at: string;
  updated_at: string;
  device_count: number;
  device_ids: string[];
  requests: number;
  successes: number;
  failures: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_tokens: number;
}

export interface DeviceUsagePage<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface DeviceUsageTotals {
  requests: number;
  successes: number;
  failures: number;
  total_tokens: number;
  success_rate?: number;
}

interface DeviceUsageEnvelope<T> {
  schema_version: number;
  status: DeviceUsageStatus;
  totals?: DeviceUsageTotals;
  data: T;
}

export interface DeviceUsageQuery {
  start_time?: string;
  end_time?: string;
  page?: number;
  page_size?: number;
  q?: string;
  user_id?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

const toNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value: unknown): DeviceUsageStatus => {
  const status = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    schema_version: toNumber(status.schema_version),
    collection_enabled: status.collection_enabled === true,
    storage_available: status.storage_available === true,
    data_available: status.data_available === true,
    storage_error: typeof status.storage_error === 'string' ? status.storage_error : undefined,
    queued_events: toNumber(status.queued_events),
    dropped_events: toNumber(status.dropped_events),
    failed_writes: toNumber(status.failed_writes),
    retention_days: toNumber(status.retention_days),
  };
};

const normalizePage = <T>(value: unknown): DeviceUsagePage<T> => {
  const page = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    items: Array.isArray(page.items) ? (page.items as T[]) : [],
    page: Math.max(1, toNumber(page.page)),
    page_size: Math.max(1, toNumber(page.page_size)),
    total: toNumber(page.total),
    total_pages: toNumber(page.total_pages),
  };
};

const normalizeTotals = (value: unknown): DeviceUsageTotals => {
  const totals = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    requests: toNumber(totals.requests),
    successes: toNumber(totals.successes),
    failures: toNumber(totals.failures),
    total_tokens: toNumber(totals.total_tokens),
    success_rate: typeof totals.success_rate === 'number' ? totals.success_rate : undefined,
  };
};

const normalizeSummary = (value: unknown): DeviceUsageSummary => {
  const item = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    device_id: String(item.device_id ?? ''),
    display_id: String(item.display_id ?? item.device_id ?? ''),
    name: String(item.name ?? ''),
    automatic_name: String(item.automatic_name ?? ''),
    source: String(item.source ?? 'none'),
    confidence: String(item.confidence ?? 'none'),
    first_seen: typeof item.first_seen === 'string' ? item.first_seen : undefined,
    last_seen: typeof item.last_seen === 'string' ? item.last_seen : undefined,
    user_id: typeof item.user_id === 'number' ? item.user_id : undefined,
    user_name: typeof item.user_name === 'string' ? item.user_name : undefined,
    requests: toNumber(item.requests),
    successes: toNumber(item.successes),
    failures: toNumber(item.failures),
    input_tokens: toNumber(item.input_tokens),
    output_tokens: toNumber(item.output_tokens),
    reasoning_tokens: toNumber(item.reasoning_tokens),
    cache_tokens: toNumber(item.cache_tokens),
    total_tokens: toNumber(item.total_tokens),
    average_latency_ms: toNumber(item.average_latency_ms),
    success_rate: typeof item.success_rate === 'number' ? item.success_rate : undefined,
  };
};

const unwrap = <T>(payload: DeviceUsageEnvelope<T>): { status: DeviceUsageStatus; data: T } => ({
  status: normalizeStatus(payload?.status),
  data: payload?.data,
});

export const deviceUsageApi = {
  getStatus: async (): Promise<DeviceUsageStatus> => normalizeStatus(await apiClient.get('/device-usage/status')),  listDevices: async (params: DeviceUsageQuery = {}) => {
    const payload = await apiClient.get<DeviceUsageEnvelope<unknown>>('/device-usage/devices', { params });
    const result = unwrap(payload);
    const page = normalizePage<unknown>(result.data);
    return {
      status: result.status,
      totals: normalizeTotals(payload?.totals),
      data: { ...page, items: page.items.map(normalizeSummary) },
    };
  },
  getDevice: async (id: string, params: DeviceUsageQuery = {}) => {
    const payload = await apiClient.get<DeviceUsageEnvelope<DeviceUsageDetail>>(
      `/device-usage/devices/${encodeURIComponent(id)}`,
      { params }
    );
    const result = unwrap(payload);
    const detail = normalizeSummary(result.data);
    return {
      status: result.status,
      data: {
        ...detail,
        trend: Array.isArray(result.data?.trend) ? result.data.trend : [],
        by_model: Array.isArray(result.data?.by_model) ? result.data.by_model : [],
        by_endpoint: Array.isArray(result.data?.by_endpoint) ? result.data.by_endpoint : [],
      } as DeviceUsageDetail,
    };
  },
  listUsers: async (params: DeviceUsageQuery = {}) => {
    const payload = await apiClient.get<DeviceUsageEnvelope<unknown>>('/device-usage/users', { params });
    const result = unwrap(payload);
    const page = normalizePage<unknown>(result.data);
    return {
      status: result.status,
      data: {
        ...page,
        items: page.items.map((item) => item as DeviceUsageUser),
      },
    };
  },
  updateDevice: (id: string, name: string) => apiClient.patch(`/device-usage/devices/${encodeURIComponent(id)}`, { name }),
  createUser: (name: string) => apiClient.post('/device-usage/users', { name }),
  updateUser: (id: number, name: string) => apiClient.patch(`/device-usage/users/${id}`, { name }),
  deleteUser: (id: number) => apiClient.delete(`/device-usage/users/${id}`),
  addDevice: (id: number, deviceId: string) => apiClient.post(`/device-usage/users/${id}/devices`, { device_id: deviceId }),
  removeDevice: (id: number, deviceId: string) => apiClient.delete(`/device-usage/users/${id}/devices/${encodeURIComponent(deviceId)}`),
};
