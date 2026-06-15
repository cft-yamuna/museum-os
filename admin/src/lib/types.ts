export interface User {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'site_admin' | 'content_manager' | 'operator';
  site_ids: string[] | null;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

export interface Site {
  id: string;
  name: string;
  code: string;
  address: string | null;
  timezone: string;
  config: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  must_change_password: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setToken: (token: string, user: User) => void;
}

export interface SiteState {
  sites: Site[];
  activeSiteId: string | null;
  setSites: (sites: Site[]) => void;
  setActiveSite: (id: string) => void;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

export interface ToastState {
  toasts: Toast[];
  addToast: (type: Toast['type'], message: string) => void;
  removeToast: (id: string) => void;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// App types
export interface App {
  id: string;
  site_id: string;
  name: string;
  template_type: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  device_count?: number;
}

// Device types
export interface Device {
  id: string;
  site_id: string;
  floor_id: string | null;
  display_name: string;
  slug: string | null;
  pairing_code: string | null;
  type: string;
  mac_address: string;
  ip_address: string | null;
  hostname: string | null;
  capabilities: Record<string, unknown> | null;
  status: DeviceStatus;
  config: Record<string, unknown> | null;
  last_seen: string | null;
  x_position: number | null;
  y_position: number | null;
  app_id: string | null;
  app_name?: string;
  app_template_type?: string;
  agent_connected?: boolean;
  agent_version?: string | null;
  last_health?: HealthReport | null;
  parent_id?: string | null;
  power_order?: number | null;
  // Populated by GET /api/devices/:id
  children?: DeviceSummary[];
  parent?: DeviceSummary | null;
  created_at: string;
  updated_at: string;
}

export type DeviceStatus = 'online' | 'offline' | 'error' | 'unavailable' | 'restarting';

export interface DeviceSummary {
  id: string;
  display_name: string | null;
  status: DeviceStatus;
  type: string;
}

// Content types
export interface Content {
  id: string;
  site_id: string;
  name: string;
  type: string;
  mime_type: string;
  description: string | null;
  current_version: number;
  is_active: boolean;
  file_path: string;
  file_size: number;
  hash: string;
  metadata: Record<string, unknown> | null;
  url: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ContentVersion {
  id: string;
  content_id: string;
  version_number: number;
  file_path: string;
  file_size: number;
  hash: string;
  metadata: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
}

// Playlist types
export interface Playlist {
  id: string;
  site_id: string;
  name: string;
  description: string | null;
  loop: boolean;
  is_active: boolean;
  item_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PlaylistItem {
  id: string;
  contentId: string;
  content: {
    name: string;
    type: string;
  };
  position: number;
  duration: number;
  transition: 'fade' | 'slide-left' | 'slide-right' | 'dissolve' | 'none';
  url: string;
  config: Record<string, unknown> | null;
}

// Exhibition types
export interface Exhibition {
  id: string;
  site_id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  assignment_count?: number;
  created_at: string;
}

export interface ExhibitionAssignment {
  id: string;
  deviceId: string;
  device: {
    name: string;
    type: string;
    status: Device['status'];
  };
  content: {
    id: string;
    name: string;
    type: string;
  } | null;
  playlist: {
    id: string;
    name: string;
  } | null;
  config: Record<string, unknown> | null;
}

// Schedule types
export type ScheduleType = 'power' | 'content' | 'playlist' | 'maintenance' | 'event';
export type ScheduleTargetType = 'device' | 'group' | 'zone';

export interface Schedule {
  id: string;
  site_id: string;
  name: string;
  type: ScheduleType;
  target_type: ScheduleTargetType;
  target_ids: string[];
  action: string;
  cron_expression: string;
  payload: Record<string, unknown> | null;
  is_enabled: boolean;
  created_by: string;
  created_at: string;
}

export interface DeviceGroup {
  id: string;
  site_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Zone {
  id: string;
  site_id: string;
  name: string;
}

// Alert types
export interface Alert {
  id: string;
  site_id: string;
  device_id: string | null;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  is_acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

// Audit log types
export interface AuditLog {
  id: string;
  site_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  user_name?: string;
  user_email?: string;
}

// Agent types
export interface HealthReport {
  cpuUsage: number;
  memPercent: number;
  diskPercent: number;
  cpuTemp: number | null;
  gpuTemp: number | null;
  uptime: number;
  throttled: boolean | null;
  sdCardReadOnly: boolean | null;
  platform?: string;
  osVersion?: string;
  hostname?: string;
  nodeVersion?: string;
  cpuModel?: string;
  cpuCores?: number;
  systemUptime?: number;
  screenCount?: number;
  screens?: Array<{
    hardwareId: string;
    name: string;
    width: number;
    height: number;
    x: number;
    y: number;
    primary: boolean;
  }>;
}

export interface HealthHistoryEntry {
  cpu_usage: number | null;
  mem_percent: number | null;
  disk_percent: number | null;
  cpu_temp: number | null;
  uptime: number | null;
  recorded_at: string;
}

export interface AgentInfo {
  agent_connected: boolean;
  agent_version: string | null;
  capabilities: Record<string, unknown> | null;
  last_health: HealthReport | null;
}

export interface AgentCommandResult {
  commandId: string;
  command: string;
  delivered: boolean;
  result?: Record<string, unknown>;
}

export interface Screenshot {
  filename: string;
  size: number;
  timestamp: number;
  url: string;
}

export interface AgentStatusDevice {
  id: string;
  slug: string;
  display_name: string;
  agent_connected: boolean;
  status: string;
  platform: string;
  current_version: string | null;
  latest_version: string | null;
  update_status: 'up_to_date' | 'update_available' | 'unknown' | 'no_release';
  last_seen: string | null;
}

export interface AgentStatusResponse {
  latest_versions: Record<string, { version: string; id: string; checksum: string; created_at: string }>;
  devices: AgentStatusDevice[];
}

export interface PushUpdateResponse {
  total: number;
  delivered: number;
  failed: number;
  devices: Array<{ id: string; slug: string; delivered: boolean; error?: string }>;
}

// Floor types
export interface Floor {
  id: string;
  site_id: string;
  name: string;
  level: number;
  background_image: string | null;
  created_at: string;
}

// Analytics types
export interface AnalyticsOverview {
  total: number;
  status: Record<string, number>;
  online_pct: number;
  avg_cpu: number | null;
  avg_mem: number | null;
  avg_temp: number | null;
  alerts: { low: number; medium: number; high: number; critical: number; total: number };
}

export interface HealthBucket {
  bucket: string;
  avg_cpu: number | null;
  avg_mem: number | null;
  avg_temp: number | null;
  samples: number;
}

export interface HealthTimeseries {
  hours: number;
  buckets: HealthBucket[];
}

export interface ZoneHealth {
  id: string;
  name: string;
  color: string | null;
  total: number;
  online: number;
  unavailable: number;
  health_pct: number;
}

// Power / staggered-startup types
export interface PowerPlanStep {
  index: number;
  device_id: string;
  display_name: string | null;
  type: string;
  is_parent: boolean;
  power_order: number | null;
  offset_seconds: number;
  seconds_before_open: number;
  power_on_at: string | null;
}

export interface PowerPlan {
  total: number;
  stagger_sec: number;
  total_seconds: number;
  first_on: string | null;
  last_on: string | null;
  open_time: string | null;
  steps: PowerPlanStep[];
}

export interface PowerRunResult {
  started: boolean;
  device_count: number;
  stagger_sec: number;
  estimated_seconds: number;
}
