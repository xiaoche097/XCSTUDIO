type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOnStatuses?: number[];
};

type FetchResilienceOptions = RetryOptions & {
  timeoutMs?: number;
  operation?: string;
};

const DEFAULT_RETRYABLE_STATUSES = [408, 409, 425, 429, 500, 502, 503, 504];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const createTraceId = (): string => {
  const random = Math.random().toString(36).slice(2, 10);
  return `xc_${Date.now().toString(36)}_${random}`;
};

const isRetryableError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('network') || message.includes('fetch') || message.includes('timeout') || message.includes('abort');
};

const computeBackoff = (attempt: number, baseDelayMs: number, maxDelayMs: number): number => {
  const jitter = Math.floor(Math.random() * 250);
  const exponential = baseDelayMs * Math.pow(2, attempt);
  return Math.min(exponential + jitter, maxDelayMs);
};

export async function fetchWithResilience(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchResilienceOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 45000,
    retries = 2,
    baseDelayMs = 500,
    maxDelayMs = 5000,
    retryOnStatuses = DEFAULT_RETRYABLE_STATUSES,
    operation = 'http.request',
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = new Headers(init.headers || {});
      if (!headers.has('x-trace-id')) {
        headers.set('x-trace-id', createTraceId());
      }

      const response = await fetch(input, {
        ...init,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok || !retryOnStatuses.includes(response.status) || attempt === retries) {
        return response;
      }

      const delay = computeBackoff(attempt, baseDelayMs, maxDelayMs);
      console.warn(`[${operation}] retrying status=${response.status}, attempt=${attempt + 1}/${retries + 1}, wait=${delay}ms`);
      await sleep(delay);
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      if (!isRetryableError(error) || attempt === retries) {
        throw error;
      }

      const delay = computeBackoff(attempt, baseDelayMs, maxDelayMs);
      console.warn(`[${operation}] retrying network error, attempt=${attempt + 1}/${retries + 1}, wait=${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed after retries');
}
