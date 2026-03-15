import { requireAdmin } from "./_utils/auth";

type FetchImageRequest = {
  imageUrl?: string;
};

const REQUEST_TIMEOUT_MS = 15000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

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

function isImageContentType(value: string | null): boolean {
  return /^image\//i.test(String(value || ""));
}

async function readBufferWithLimit(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error("image_too_large");
    }
    return new Uint8Array(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error("image_too_large");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export default async function handler(req: any, res: any) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body: FetchImageRequest =
    typeof req.body === "string"
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return {};
          }
        })()
      : req.body || {};

  const imageUrl = String(body.imageUrl || "").trim();
  if (!/^https?:\/\//i.test(imageUrl)) {
    return res.status(400).json({ error: "imageUrl must be a valid http(s) url" });
  }

  try {
    const parsed = new URL(imageUrl);
    if (isPrivateHostname(parsed.hostname)) {
      return res.status(400).json({ error: "private_network_url_not_allowed" });
    }
  } catch {
    return res.status(400).json({ error: "url_parse_failed" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; XC-Studio-ImageFetcher/1.0; +https://xc-studio.vercel.app)",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      return res.status(400).json({
        error: `fetch_failed_${response.status}`,
        status: response.status,
      });
    }

    const finalUrl = response.url || imageUrl;
    try {
      const finalParsed = new URL(finalUrl);
      if (isPrivateHostname(finalParsed.hostname)) {
        return res.status(400).json({ error: "redirected_to_private_network" });
      }
    } catch {
      return res.status(400).json({ error: "final_url_parse_failed" });
    }

    const contentType = response.headers.get("content-type") || "image/png";
    if (!isImageContentType(contentType)) {
      return res.status(415).json({ error: "unsupported_content_type", contentType });
    }

    const bytes = await readBufferWithLimit(response, MAX_IMAGE_BYTES);
    const base64 = toBase64(bytes);
    return res.status(200).json({
      imageUrl: finalUrl,
      mimeType: contentType,
      dataUrl: `data:${contentType};base64,${base64}`,
      size: bytes.byteLength,
      provider: "server-fetch",
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return res.status(504).json({ error: "fetch_image_timeout" });
    }
    if (error?.message === "image_too_large") {
      return res.status(413).json({ error: "image_too_large" });
    }
    return res.status(500).json({ error: error?.message || "fetch_image_failed" });
  }
}
