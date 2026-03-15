type ResearchEndpoint = 'search' | 'extract' | 'rehost-image';

const ENDPOINT_LABELS: Record<ResearchEndpoint, string> = {
  search: '检索',
  extract: '网页提取',
  'rehost-image': '图片中转',
};

const FRIENDLY_ERROR_MAP: Record<string, string> = {
  unauthorized: '请先登录后台',
  extract_timeout: '网页提取超时，请稍后重试',
  content_too_large: '网页内容过大，暂不支持提取',
  unsupported_content_type: '网页内容类型不支持提取',
  private_network_url_not_allowed: '目标地址不可访问',
  redirected_to_private_network: '目标地址重定向到不可访问区域',
  missing_imgbb_api_key: '图床未配置，已自动使用原始图片地址',
  research_search_failed: '检索失败，请稍后重试',
  extract_failed: '网页提取失败，请稍后重试',
  rehost_failed: '图片中转失败，请稍后重试',
};

export class ResearchApiError extends Error {
  endpoint: ResearchEndpoint;
  status?: number;
  code?: string;
  requestId?: string;
  retryable: boolean;

  constructor(params: {
    endpoint: ResearchEndpoint;
    message: string;
    status?: number;
    code?: string;
    requestId?: string;
    retryable: boolean;
  }) {
    super(params.message);
    this.name = 'ResearchApiError';
    this.endpoint = params.endpoint;
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId;
    this.retryable = params.retryable;
  }
}

const isRetryableStatus = (status?: number): boolean => {
  if (!status) return true;
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
};

export const normalizeResearchApiError = (
  endpoint: ResearchEndpoint,
  status: number,
  payload: any,
): ResearchApiError => {
  const code = String(payload?.error || `http_${status}`);
  const mapped = FRIENDLY_ERROR_MAP[code];
  const message = mapped || `${ENDPOINT_LABELS[endpoint]}失败 (${status})`;
  return new ResearchApiError({
    endpoint,
    status,
    code,
    requestId: payload?.requestId,
    message,
    retryable: isRetryableStatus(status),
  });
};

export const normalizeUnknownResearchError = (
  endpoint: ResearchEndpoint,
  error: unknown,
): ResearchApiError => {
  if (error instanceof ResearchApiError) return error;

  const raw = error instanceof Error ? error.message : String(error || 'unknown_error');
  const mapped = FRIENDLY_ERROR_MAP[raw];
  return new ResearchApiError({
    endpoint,
    code: raw,
    message: mapped || `${ENDPOINT_LABELS[endpoint]}失败，请稍后重试`,
    retryable: true,
  });
};
