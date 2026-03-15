import { requireAdmin } from "./_utils/auth";

type SearchMode = "web+images" | "web" | "images";

type SearchRequest = {
  query: string;
  mode?: SearchMode;
  locale?: string;
  count?: {
    web?: number;
    images?: number;
  };
  safeSearch?: "off" | "moderate" | "strict";
  timeRange?: "day" | "week" | "month" | "year" | "any";
};

type SearchProviderMeta = {
  web: string;
  images: string;
  fallback?: boolean;
};

const REQUEST_TIMEOUT_MS = 12000;

const DEFAULT_WEB_COUNT = 8;
const DEFAULT_IMAGE_COUNT = 16;

type NormalizedWebItem = {
  id: string;
  title: string;
  url: string;
  displayUrl: string;
  snippet: string;
  publishedTime: string;
  siteName: string;
};

type NormalizedImageItem = {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  sourcePageUrl: string;
  width: number;
  height: number;
  contentType: string;
  siteName: string;
};

function asJson(body: any): SearchRequest {
  if (!body) return { query: "" };
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return { query: "" };
    }
  }
  return body as SearchRequest;
}

function toCount(value: unknown, fallback: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(max, Math.round(num));
}

function toSafeSearch(value: unknown): "Off" | "Moderate" | "Strict" {
  const raw = String(value || "moderate").toLowerCase();
  if (raw === "off") return "Off";
  if (raw === "strict") return "Strict";
  return "Moderate";
}

function mapWebTimeFilter(range: unknown): string {
  const value = String(range || "any").toLowerCase();
  if (value === "day") return "Day";
  if (value === "week") return "Week";
  if (value === "month") return "Month";
  return "";
}

function hostFromUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "";
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`http_${res.status}`);
    }
    return res.json();
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("search_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchBing(
  query: string,
  mkt: string,
  mode: SearchMode,
  webCount: number,
  imageCount: number,
  safeSearch: "Off" | "Moderate" | "Strict",
  freshness: string,
  key: string,
): Promise<{
  provider: SearchProviderMeta;
  web: NormalizedWebItem[];
  images: NormalizedImageItem[];
  suggestedQueries: string[];
}> {
  const headers = {
    "Ocp-Apim-Subscription-Key": key,
  };

  const webPromise =
    mode === "images"
      ? Promise.resolve(null)
      : fetchJson(
          `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&mkt=${encodeURIComponent(mkt)}&count=${webCount}${freshness ? `&freshness=${freshness}` : ""}`,
          { headers },
        );

  const imagePromise =
    mode === "web"
      ? Promise.resolve(null)
      : fetchJson(
          `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(query)}&mkt=${encodeURIComponent(mkt)}&count=${imageCount}&safeSearch=${safeSearch}`,
          { headers },
        );

  const [webRaw, imageRaw] = await Promise.all([webPromise, imagePromise]);

  const web: NormalizedWebItem[] = (webRaw?.webPages?.value || []).map(
    (item: any, idx: number) => ({
      id: `w_${idx + 1}`,
      title: item?.name || "",
      url: item?.url || "",
      displayUrl: item?.displayUrl || "",
      snippet: item?.snippet || "",
      publishedTime: item?.dateLastCrawled || "",
      siteName: item?.siteName || "",
    }),
  );

  const images: NormalizedImageItem[] = (imageRaw?.value || [])
    .map((item: any, idx: number) => ({
      id: `i_${idx + 1}`,
      title: item?.name || "",
      imageUrl: item?.contentUrl || "",
      thumbnailUrl: item?.thumbnailUrl || "",
      sourcePageUrl: item?.hostPageUrl || "",
      width: Number(item?.width || 0),
      height: Number(item?.height || 0),
      contentType: item?.encodingFormat
        ? `image/${String(item.encodingFormat).toLowerCase()}`
        : "",
      siteName: item?.hostPageDomainFriendlyName || "",
    }))
    .filter((item) => /^https?:\/\//i.test(item.imageUrl));

  const suggestedQueries = [
    ...(webRaw?.relatedSearches?.value || [])
      .map((q: any) => q?.text)
      .filter(Boolean),
    ...(imageRaw?.queryExpansions || []).map((q: any) => q?.text).filter(Boolean),
  ].slice(0, 8);

  return {
    provider: {
      web: mode === "images" ? "none" : "bing",
      images: mode === "web" ? "none" : "bing",
    },
    web,
    images,
    suggestedQueries,
  };
}

async function searchWikipediaWeb(
  query: string,
  locale: string,
  webCount: number,
): Promise<NormalizedWebItem[]> {
  const lang = locale.toLowerCase().startsWith("zh") ? "zh" : "en";
  const data = await fetchJson(
    `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=${webCount}`,
  );

  return (data?.pages || []).map((item: any, idx: number) => {
    const url = item?.key
      ? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.key).replace(/%20/g, "_")}`
      : "";
    return {
      id: `w_${idx + 1}`,
      title: item?.title || "",
      url,
      displayUrl: hostFromUrl(url),
      snippet: String(item?.excerpt || "").replace(/<[^>]+>/g, " "),
      publishedTime: "",
      siteName: `${lang}.wikipedia.org`,
    };
  });
}

async function searchWikimediaImages(
  query: string,
  imageCount: number,
): Promise<NormalizedImageItem[]> {
  const raw = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${Math.min(imageCount, 30)}&prop=imageinfo&iiprop=url|size|mime`,
  );

  const pages = Object.values(raw?.query?.pages || {}) as any[];
  return pages.map((item: any, idx: number) => {
    const info = item?.imageinfo?.[0] || {};
    const imageUrl = String(info?.url || "");
    const sourcePageUrl = item?.title
      ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(item.title).replace(/ /g, "_"))}`
      : "";
    return {
      id: `i_wm_${idx + 1}`,
      title: item?.title || "",
      imageUrl,
      thumbnailUrl: imageUrl,
      sourcePageUrl,
      width: Number(info?.width || 0),
      height: Number(info?.height || 0),
      contentType: info?.mime || "",
      siteName: "commons.wikimedia.org",
    };
  });
}

async function searchOpenverseImages(
  query: string,
  imageCount: number,
): Promise<NormalizedImageItem[]> {
  const raw = await fetchJson(
    `https://api.openverse.org/v1/images?q=${encodeURIComponent(query)}&page_size=${Math.min(imageCount, 20)}`,
  );

  return (raw?.results || []).map((item: any, idx: number) => ({
    id: `i_ov_${idx + 1}`,
    title: item?.title || "",
    imageUrl: item?.url || "",
    thumbnailUrl: item?.thumbnail || "",
    sourcePageUrl: item?.foreign_landing_url || item?.detail_url || "",
    width: Number(item?.width || 0),
    height: Number(item?.height || 0),
    contentType: item?.mime_type || "",
    siteName: item?.source || "openverse",
  }));
}

function dedupeImages(items: NormalizedImageItem[], max: number): NormalizedImageItem[] {
  const seen = new Set<string>();
  const result: NormalizedImageItem[] = [];
  for (const item of items) {
    const key = item.imageUrl.trim();
    if (!/^https?:\/\//i.test(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

async function searchFree(
  query: string,
  locale: string,
  mode: SearchMode,
  webCount: number,
  imageCount: number,
): Promise<{
  provider: SearchProviderMeta;
  web: NormalizedWebItem[];
  images: NormalizedImageItem[];
  suggestedQueries: string[];
}> {
  const webPromise =
    mode === "images"
      ? Promise.resolve([] as NormalizedWebItem[])
      : searchWikipediaWeb(query, locale, webCount).catch(() => []);

  const imagePromise =
    mode === "web"
      ? Promise.resolve([] as NormalizedImageItem[])
      : Promise.all([
          searchWikimediaImages(query, imageCount).catch(() => []),
          searchOpenverseImages(query, imageCount).catch(() => []),
        ]).then(([wm, ov]) => dedupeImages([...wm, ...ov], imageCount));

  const [web, images] = await Promise.all([webPromise, imagePromise]);

  return {
    provider: {
      web: mode === "images" ? "none" : "wikipedia",
      images: mode === "web" ? "none" : "wikimedia+openverse",
      fallback: true,
    },
    web,
    images,
    suggestedQueries: [
      `${query} 风格参考`,
      `${query} 构图`,
      `${query} 文案`,
    ].slice(0, 8),
  };
}

export default async function handler(req: any, res: any) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = process.env.BING_SEARCH_API_KEY;

  const body = asJson(req.body);
  const query = String(body.query || "").trim();
  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  const mode: SearchMode =
    body.mode === "images" || body.mode === "web" ? body.mode : "web+images";
  const locale = String(body.locale || "zh-CN");
  const mkt = locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
  const webCount = toCount(body.count?.web, DEFAULT_WEB_COUNT, 20);
  const imageCount = toCount(body.count?.images, DEFAULT_IMAGE_COUNT, 50);
  const safeSearch = toSafeSearch(body.safeSearch);
  const freshness = mapWebTimeFilter(body.timeRange);

  const requestId = `srch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const searchResult = key
      ? await searchBing(
          query,
          mkt,
          mode,
          webCount,
          imageCount,
          safeSearch,
          freshness,
          key,
        )
      : await searchFree(query, locale, mode, webCount, imageCount);

    return res.status(200).json({
      requestId,
      query,
      mode,
      provider: searchResult.provider,
      web: searchResult.web,
      images: searchResult.images,
      hints: {
        suggestedQueries: searchResult.suggestedQueries,
        groups: [],
      },
      limits: {
        webReturned: searchResult.web.length,
        imagesReturned: searchResult.images.length,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || "search_failed",
      requestId,
      provider: {
        web: "none",
        images: "none",
        fallback: Boolean(key),
      },
    });
  }
}
