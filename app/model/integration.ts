export type HealthStatus =
    "Healthy" | "Partial" | "Degraded" | "Login Required" | "Expired" | "Error" | "Unavailable" | "Unknown" | "Disabled";

export interface EndpointConfig {
    requires_auth?: boolean;
    key: string;
    name: string;
    path: string;
    platform?: string | null;
    enabled: boolean;
    probe_enabled: boolean;
    probe_params: Record<string, string | number | boolean>;
}

export interface ServiceConfig {
    name: string;
    kind: string;
    transport?: "http" | "python";
    platform?: string | null;
    options?: Record<string, string>;
    base_url: string;
    enabled: boolean;
    interval_seconds: number;
    timeout_seconds: number;
    endpoints: EndpointConfig[];
    api_key?: string | null;
    auth_type: "none" | "login";
    credential_expires_at: string | null;
    auth_check_endpoint: string | null;
}

export interface RequestStats {
    status: HealthStatus;
    total: number;
    successful: number;
    failed: number;
    success_rate: number | null;
    average_latency_ms: number | null;
    latency_ms?: number | null;
    last_check?: string | null;
    last_success?: string | null;
    last_request?: string | null;
    most_recent_error?: string | null;
    error?: string | null;
}

export interface IdentityPoolStatus {
    health: "Healthy" | "Degraded" | "Unavailable";
    total?: number;
    active?: number;
    available?: number;
    cooling?: number;
    unusable?: number;
    minimum_size?: number;
    target_size?: number;
    replenishment?: string;
    last_success_at?: string | null;
    next_attempt_at?: string | null;
    recent_errors?: { at: string; message: string }[];
    error?: string | null;
}

export interface IntegrationService extends ServiceConfig, RequestStats {
    identity_pool?: IdentityPoolStatus | null;
    guest_status?: HealthStatus;
    authenticated_status?: HealthStatus;
    accounts?: AuthenticatedAccount[];
    uid: number;
    adapter_key?: string | null;
    has_api_key: boolean;
    auth_status: HealthStatus | "Not required" | "Missing";
    auth_checked_at: string | null;
    auth_error: string | null;
    reauthenticated_at: string | null;
    endpoints: (EndpointConfig & RequestStats)[];
}

export interface HistoryBucket {
    time: string;
    total: number;
    successful: number;
    failed: number;
    average_latency_ms: number | null;
}

export interface AuthenticatedAccount {
    uid: string;
    account_id: string | null;
    account_name: string | null;
    state: string;
    health: HealthStatus;
    total_requests: number;
    success_rate: number | null;
    last_success_at: string | null;
    cooldown_until: string | null;
    last_error: string | null;
    reauthentication_recommended: boolean;
}
