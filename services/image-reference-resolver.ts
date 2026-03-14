import { ProviderError } from '../utils/provider-error';
import { fetchWithResilience } from './http/api-client';
import { getProviderConfig } from './provider-config';
import { useImageHostStore } from '../stores/imageHost.store';

const isNetworkFetchError = (error: unknown): boolean => {
  const msg = ((error as any)?.message || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('cors') ||
    msg.includes('load failed') ||
    msg.includes('loadfailed') ||
    msg.includes('fetch_image_timeout') ||
    msg.includes('timeout')
  );
};

const blobToDataUrl = async (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const fetchReferenceViaServer = async (imageUrl: string): Promise<string | null> => {
  console.log('[reference-resolver] Using CORS fallback strategies for:', imageUrl);
  
  // Strategy 1: Bypass fetch() OPTIONS preflight via Image + Canvas
  try {
    const canvasDataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Important for preventing tainted canvas
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('No 2d context available');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Image load failed'));
      // Add cache buster to force clean CORS response
      img.src = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}corsbuster=${Date.now()}`;
    });
    console.log('[reference-resolver] Canvas strategy success!');
    return canvasDataUrl;
  } catch (err) {
    console.warn('[reference-resolver] Canvas bypass strategy failed:', err);
  }

  // Strategy 2: Proxy APIs
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`
  ];

  for (const proxyUrl of proxies) {
    try {
      console.log('[reference-resolver] Trying Proxy:', proxyUrl);
      const response = await fetch(proxyUrl);
      if (response.ok) {
        const blob = await response.blob();
        return await blobToDataUrl(blob);
      }
    } catch (e) {
      console.warn('[reference-resolver] Proxy strategy failed for', proxyUrl, e);
    }
  }

  return null;
};

export const normalizeReferenceToDataUrl = async (input: string): Promise<string | null> => {
  if (!input || typeof input !== 'string') return null;
  if (/^data:image\/.+;base64,/.test(input)) return input;

  // Debug: make it obvious when we silently drop references.
  // Keep logs lightweight; do not print full data URLs.
  const logPrefix = '[reference-resolver]';
  const safePreview = (value: string) => {
    const v = String(value || '').trim();
    if (!v) return '';
    if (v.startsWith('data:image/')) return `data:image/...(${v.length} chars)`;
    return v.length > 160 ? `${v.slice(0, 160)}...` : v;
  };

  const selectedProvider = useImageHostStore.getState().selectedProvider;
  const preferHostedUrls = selectedProvider !== 'none';

  if (/^blob:/i.test(input)) {
    try {
      console.log(`${logPrefix} resolving blob reference:`, safePreview(input));
      const res = await fetchWithResilience(
        input,
        {},
        { operation: 'generateImage.resolveBlobReference', retries: 0, timeoutMs: 20000 },
      );
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) return null;
      return await blobToDataUrl(blob);
    } catch {
      console.warn(`${logPrefix} blob reference failed, dropping:`, safePreview(input));
      return null;
    }
  }

  if (/^https?:\/\//i.test(input)) {
    console.log(`${logPrefix} resolving url reference:`, safePreview(input));
    if (preferHostedUrls && /(^https?:\/\/i\.ibb\.co\/)|(^https?:\/\/ibb\.co\/)/i.test(input)) {
      const serverDataUrl = await fetchReferenceViaServer(input);
      if (serverDataUrl) {
        return serverDataUrl;
      }
    }

    try {
      const res = await fetchWithResilience(
        input,
        {},
        { operation: 'generateImage.resolveReferenceUrl', retries: 1, timeoutMs: 30000 },
      );
      if (!res.ok) {
        console.warn(`${logPrefix} url fetch not ok (${res.status}), will try fallback:`, safePreview(input));
        if ([401, 403, 404, 408, 429, 500, 502, 503, 504].includes(res.status)) {
          const serverDataUrl = await fetchReferenceViaServer(input);
          if (serverDataUrl) return serverDataUrl;
        }
        return null;
      }

      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) return null;
      return await blobToDataUrl(blob);
    } catch (error) {
      if (!isNetworkFetchError(error)) {
        return null;
      }

      const serverDataUrl = await fetchReferenceViaServer(input);
      if (serverDataUrl) {
        return serverDataUrl;
      }

      console.warn(`${logPrefix} All attempts failed, continuing without reference:`, safePreview(input));
      return null;
    }
  }

  return null;
};
