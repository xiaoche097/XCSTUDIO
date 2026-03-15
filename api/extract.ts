import { requireAdmin } from "./_utils/auth";

type ExtractRequest = {
  url?: string;
};

const REQUEST_TIMEOUT_MS = 12000;
const MAX_HTML_BYTES = 1_500_000;
const ALLOWED_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return "";
  return stripHtml(titleMatch[1] || "");
}

function isPrivateHostname(hostname: string): boolean {
  const host = String(hostname || "").toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

function isSupportedContentType(value: string | null): boolean {
  const normalized = String(value || "").toLowerCase();
  return ALLOWED_CONTENT_TYPES.some((t) => normalized.includes(t));
}

async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const plain = await response.text();
    return plain.slice(0, maxBytes);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error("content_too_large");
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

export default async function handler(req: any, res: any) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body: ExtractRequest =
    typeof req.body === "string"
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return {};
          }
        })()
      : req.body || {};

  const targetUrl = String(body.url || "").trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ error: "url must be a valid http(s) url" });
  }

  try {
    const parsed = new URL(targetUrl);
    if (isPrivateHostname(parsed.hostname)) {
      return res.status(400).json({ error: "private_network_url_not_allowed" });
    }
  } catch {
    return res.status(400).json({ error: "url_parse_failed" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; XC-Studio-ResearchBot/1.0; +https://xc-studio.vercel.app)",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      return res.status(400).json({
        error: `fetch_failed_${response.status}`,
        status: response.status,
      });
    }

    const finalUrl = response.url || targetUrl;
    try {
      const finalParsed = new URL(finalUrl);
      if (isPrivateHostname(finalParsed.hostname)) {
        return res.status(400).json({ error: "redirected_to_private_network" });
      }
    } catch {
      return res.status(400).json({ error: "final_url_parse_failed" });
    }

    const contentType = response.headers.get("content-type");
    if (!isSupportedContentType(contentType)) {
      return res.status(415).json({
        error: "unsupported_content_type",
        contentType: contentType || "unknown",
      });
    }

    const html = await readTextWithLimit(response, MAX_HTML_BYTES);
    const title = pickTitle(html);
    const cleanedText = stripHtml(html);
    const excerpt = cleanedText.slice(0, 1200);

    return res.status(200).json({
      url: finalUrl,
      title,
      cleanedText,
      excerpt,
      length: cleanedText.length,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return res.status(504).json({ error: "extract_timeout" });
    }

    if (error?.message === "content_too_large") {
      return res.status(413).json({ error: "content_too_large" });
    }

    return res.status(500).json({
      error: error?.message || "extract_failed",
    });
  }
}
