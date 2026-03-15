import { normalizeResearchApiError, normalizeUnknownResearchError } from './research-errors';
import { logResearchTelemetry } from './research-telemetry';
import { ROUTES } from '../../utils/routes';

function redirectToLoginIfNeeded(status: number) {
  if (status !== 401) return;
  if (typeof window === 'undefined') return;
  if (window.location.pathname === ROUTES.login) return;
  window.location.assign(ROUTES.login);
}

export type ResearchSearchMode = "web+images" | "web" | "images";

export type SearchWebItem = {
  id: string;
  title: string;
  url: string;
  displayUrl?: string;
  snippet?: string;
  siteName?: string;
};

export type SearchImageItem = {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl?: string;
  sourcePageUrl?: string;
  width?: number;
  height?: number;
  siteName?: string;
};

export type SearchResponse = {
  requestId: string;
  query: string;
  mode: ResearchSearchMode;
  provider?: { web?: string; images?: string; fallback?: boolean };
  web: SearchWebItem[];
  images: SearchImageItem[];
  hints?: { suggestedQueries?: string[] };
};

export type ExtractResponse = {
  url: string;
  title: string;
  cleanedText: string;
  excerpt: string;
  length: number;
};

export type RehostResponse = {
  imageUrl: string;
  hostedUrl: string;
  provider: string;
};

export async function runResearchSearch(
  query: string,
  mode: ResearchSearchMode = "web+images",
): Promise<SearchResponse> {
  logResearchTelemetry('search.request', { mode, queryLength: query.length });

  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        mode,
        locale: "zh-CN",
        count: {
          web: 8,
          images: 16,
        },
        safeSearch: "moderate",
        timeRange: "any",
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      redirectToLoginIfNeeded(response.status);
      throw normalizeResearchApiError('search', response.status, payload);
    }

    logResearchTelemetry('search.success', {
      requestId: payload?.requestId,
      fallback: Boolean(payload?.provider?.fallback),
      webCount: Array.isArray(payload?.web) ? payload.web.length : 0,
      imageCount: Array.isArray(payload?.images) ? payload.images.length : 0,
    });
    return payload as SearchResponse;
  } catch (error) {
    const normalized = normalizeUnknownResearchError('search', error);
    logResearchTelemetry('search.fail', {
      code: normalized.code,
      status: normalized.status,
      message: normalized.message,
    });
    throw normalized;
  }
}

export function pickUsableReferenceImages(items: SearchImageItem[], max: number = 8): string[] {
  return items
    .map((item) => item.imageUrl)
    .filter((url) => {
      if (typeof url !== "string") return false;
      const normalized = url.trim();
      if (!/^https?:\/\//i.test(normalized)) return false;
      if (/^https?:\/\/ibb\.co\//i.test(normalized)) return false;
      return true;
    })
    .slice(0, max);
}

export async function extractWebPage(url: string): Promise<ExtractResponse> {
  logResearchTelemetry('extract.request', { url });

  try {
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });
    const payload = await response.json();
    if (!response.ok) {
      redirectToLoginIfNeeded(response.status);
      throw normalizeResearchApiError('extract', response.status, payload);
    }
    logResearchTelemetry('extract.success', {
      url: payload?.url || url,
      length: payload?.length || 0,
    });
    return payload as ExtractResponse;
  } catch (error) {
    const normalized = normalizeUnknownResearchError('extract', error);
    logResearchTelemetry('extract.fail', {
      code: normalized.code,
      status: normalized.status,
      message: normalized.message,
      url,
    });
    throw normalized;
  }
}

export async function rehostImageUrl(imageUrl: string): Promise<RehostResponse> {
  logResearchTelemetry('rehost.request', { imageUrl });

  try {
    const response = await fetch("/api/rehost-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageUrl }),
    });
    const payload = await response.json();
    if (!response.ok) {
      redirectToLoginIfNeeded(response.status);
      throw normalizeResearchApiError('rehost-image', response.status, payload);
    }
    const result = {
      imageUrl,
      hostedUrl: String(payload?.hostedUrl || imageUrl),
      provider: String(payload?.provider || "passthrough"),
    };
    logResearchTelemetry('rehost.success', {
      provider: result.provider,
      fallback: Boolean(payload?.fallback),
    });
    return result;
  } catch (error) {
    const normalized = normalizeUnknownResearchError('rehost-image', error);
    logResearchTelemetry('rehost.fail', {
      code: normalized.code,
      status: normalized.status,
      message: normalized.message,
      imageUrl,
    });
    throw normalized;
  }
}
