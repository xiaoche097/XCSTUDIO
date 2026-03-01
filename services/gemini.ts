
import { GoogleGenAI, Chat, GenerateContentResponse, Part, Content, Type } from "@google/genai";
import { ProviderError } from '../utils/provider-error';

// Helper to get API configurations
export const getProviderConfig = () => {
    const providerId = localStorage.getItem('api_provider') || 'gemini';
    const providersRaw = localStorage.getItem('api_providers');

    if (providersRaw) {
        try {
            const providers = JSON.parse(providersRaw);
            const found = providers.find((p: any) => p.id === providerId);
            if (found) return found;
        } catch (e) {
            console.error("Parse providers error", e);
        }
    }

    // Default Fallbacks for legacy/start
    if (providerId === 'gemini') {
        return {
            id: 'gemini',
            name: 'Gemini',
            baseUrl: 'https://generativelanguage.googleapis.com',
            apiKey: localStorage.getItem('gemini_api_key') || ''
        };
    } else if (providerId === 'yunwu') {
        return {
            id: 'yunwu',
            name: 'Yunwu',
            baseUrl: 'https://yunwu.ai',
            apiKey: localStorage.getItem('yunwu_api_key') || ''
        };
    }

    return { id: 'gemini', apiKey: '' };
};

// Helper to get API Key dynamically
export const getApiKey = (all: boolean = false) => {
    const win = window as any;

    if (win.aistudio && win.aistudio.getKey) {
        const key = win.aistudio.getKey();
        if (key) return all ? [key] : key;
    }

    const config = getProviderConfig();
    const rawKeys = config.apiKey || '';

    if (rawKeys) {
        const keys = rawKeys.split('\n')
            .map(k => k.trim())
            .filter(k => k && !k.startsWith('#'));

        if (keys.length > 0) {
            if (all) return keys;

            const storageKey = `api_poll_index_${config.id}`;
            let currentIndex = parseInt(localStorage.getItem(storageKey) || '0', 10);
            if (currentIndex >= keys.length) currentIndex = 0;
            const selectedKey = keys[currentIndex];
            localStorage.setItem(storageKey, ((currentIndex + 1) % keys.length).toString());
            return selectedKey;
        }
    }
    return all ? [] : 'PLACEHOLDER';
};

/**
 * Normalize and clean Base URL
 */
const normalizeUrl = (baseUrl: string): string => {
    let url = (baseUrl || '').trim().replace(/\/+$/, '');
    if (!url) return 'https://generativelanguage.googleapis.com';
    return url;
};

const shouldTryAlternateAuth = (status: number): boolean => {
    return status === 401 || status === 403 || status === 404;
};

const isNetworkFetchError = (error: unknown): boolean => {
    const msg = ((error as any)?.message || '').toLowerCase();
    return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('cors') || msg.includes('load failed');
};

type OpenAIAuthMode = 'bearer' | 'query';

const buildOpenAIPath = (baseUrl: string, path: string): string => {
    const root = normalizeUrl(baseUrl);
    return path.startsWith('/') ? `${root}${path}` : `${root}/${path}`;
};

const buildOpenAIHeaders = (authMode: OpenAIAuthMode, apiKey: string): Record<string, string> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };
    if (authMode === 'bearer') {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return headers;
};

const buildOpenAIUrl = (baseUrl: string, path: string, authMode: OpenAIAuthMode, apiKey: string): string => {
    const base = buildOpenAIPath(baseUrl, path);
    if (authMode === 'query') {
        return `${base}${base.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
    }
    return base;
};

const fetchOpenAIJsonWithFallback = async <T>(
    baseUrl: string,
    path: string,
    apiKey: string,
    body: unknown,
    contextTag: string
): Promise<T> => {
    const plans: OpenAIAuthMode[] = ['bearer', 'query'];
    let lastError: any = null;

    for (const authMode of plans) {
        const url = buildOpenAIUrl(baseUrl, path, authMode, apiKey);
        const headers = buildOpenAIHeaders(authMode, apiKey);
        console.log(`[${contextTag}] POST [${authMode}] ${url.replace(apiKey, '***')}`);
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (res.ok) {
            return res.json();
        }

        const errBody = await res.text().catch(() => '');
        const err: any = new Error(`${contextTag} API error: ${res.status} [${authMode}] ${errBody}`);
        err.status = res.status;
        err.authMode = authMode;
        lastError = err;

        if (!shouldTryAlternateAuth(res.status)) {
            throw err;
        }
    }

    throw lastError || new Error(`${contextTag} API failed on all auth strategies`);
};

/**
 * Fetch available models from the provider, attempting all provided keys
 */
export const fetchAvailableModels = async (provider: string, keys: string[], baseUrl?: string) => {
    if (keys.length === 0) return [];

    const isGoogle = !baseUrl || baseUrl.includes('googleapis.com');
    const rootUrl = normalizeUrl(baseUrl || '');
    const allModels = new Set<string>();

    // 1. Special Handling: MemeFast Pricing API (Public list, high accuracy)
    const isMemeFast = rootUrl.includes('memefast.top'); /* cspell:disable-line */
    if (isMemeFast) {
        try {
            const pricingUrl = `${rootUrl}/api/pricing_new`;
            console.log(`[fetchAvailableModels] [MemeFast] Fetching pricing metadata: ${pricingUrl}`);
            const res = await fetch(pricingUrl);
            if (res.ok) {
                const json = await res.json();
                const data = json.data || [];
                if (Array.isArray(data)) {
                    data.forEach(m => {
                        if (m.model_name) allModels.add(m.model_name);
                    });
                }
            }
        } catch (e) {
            console.warn(`[fetchAvailableModels] [MemeFast] Pricing fetch failed, falling back to /v1/models`, e);
        }
    }

    // 2. Standard Logic: Iterate through all keys to find all accessible models
    const modelsPath = /\/v\d+(beta)?$/.test(rootUrl) ? `${rootUrl}/models` : `${rootUrl}/v1/models`;
    const getGoogleUrl = (k: string) => `${rootUrl}/v1/models?key=${encodeURIComponent(k)}`;

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i].trim();
        if (!key) continue;

        try {
            const plans = isGoogle
                ? [{
                    url: getGoogleUrl(key),
                    headers: {}
                }]
                : [
                    {
                        url: modelsPath,
                        headers: {
                            'Authorization': `Bearer ${key}`,
                            'Content-Type': 'application/json'
                        }
                    },
                    {
                        url: `${modelsPath}?key=${encodeURIComponent(key)}`,
                        headers: { 'Content-Type': 'application/json' }
                    }
                ];

            let keySucceeded = false;
            for (const plan of plans) {
                console.log(`[fetchAvailableModels] [${provider}] Key #${i + 1} checking: ${plan.url}`);
                const res = await fetch(plan.url, { headers: plan.headers });

                if (res.ok) {
                    const data = await res.json();
                    const list = data.models || data.data || (Array.isArray(data) ? data : []);
                    list.forEach((m: any) => {
                        const id = typeof m === 'string' ? m : (m.id || m.name || m.model);
                        if (id) allModels.add(id);
                    });
                    console.log(`[fetchAvailableModels] [${provider}] Key #${i + 1} found ${list.length} items.`);
                    keySucceeded = true;
                    break;
                }

                console.warn(`[fetchAvailableModels] [${provider}] Key #${i + 1} returned ${res.status} for ${plan.url}`);
                if (!shouldTryAlternateAuth(res.status)) {
                    break;
                }
            }

            if (!keySucceeded) {
                console.warn(`[fetchAvailableModels] [${provider}] Key #${i + 1} no model list available.`);
            }
        } catch (error) {
            console.error(`[fetchAvailableModels] [${provider}] Key #${i + 1} failed:`, error);
        }
    }

    const cleaned = Array.from(allModels).filter(Boolean);
    console.log(`[fetchAvailableModels] [${provider}] Total unique models found: ${cleaned.length}`);
    return cleaned;
};

// Helper to get API Base URL dynamically
const getApiUrl = () => {
    const config = getProviderConfig();
    return config.baseUrl;
};

// Initialize the GenAI client with dynamic key and url
// 统一模型获取助手：锁定云雾 API 的高阶预览模型 ID
export const getBestModelId = (type: 'text' | 'image' | 'video' | 'thinking' = 'text'): string => {
    const config = getProviderConfig();
    const isProxy = config.id !== 'gemini' || (config.baseUrl && !config.baseUrl.includes('googleapis.com'));

    if (type === 'image') {
        const s = localStorage.getItem('setting_image_models');
        const selected = JSON.parse(s || '[]');
        // 用户指定：自动选择模式下默认首选 Nano Banana Pro (gemini-3-pro-image-preview)
        if (selected.length === 0 || selected.includes('Auto')) return IMAGE_PRO_MODEL;
        
        const first = selected[0];
        if (first === 'Nano Banana Pro') return IMAGE_PRO_MODEL;
        if (first === 'NanoBanana2') return IMAGE_NANOBANANA_2_MODEL;
        if (isProxy && (first.includes('1.5-flash'))) return IMAGE_PRO_MODEL;
        return first;
    }

    if (type === 'video') {
        const s = localStorage.getItem('setting_video_models');
        const selected = JSON.parse(s || '[]');
        // 用户要求视频首选 veo3.1fast
        if (selected.length === 0 || selected.includes('Auto')) return VEO_FAST_MODEL;
        return selected[0];
    }

    if (type === 'thinking') {
        // 用户要求思考模型用 gemini-3.1-pro-preview
        return THINKING_MODEL;
    }

    // 常规对话/分析 (text)：用户要求用 gemini-3-flash-preview
    return FLASH_MODEL;
};

export const getClient = () => {
    const config: any = { apiKey: getApiKey() };
    let baseUrl = getApiUrl();
    if (baseUrl) {
        // 核心修复：SDK 内部会自动拼装 v1/v1beta，这里必须移除任何结尾的版本路径
        // 否则会产生 /v1beta/v1beta 的双重路径导致中转站 404
        baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/v\d+(beta)?$/i, '');
        config.httpOptions = { baseUrl };
        console.log(`[GenAI] Using Cleaned Proxy: ${baseUrl}`);
    }
    const client = new GoogleGenAI(config);
    (client as any).getBestModelId = getBestModelId;
    return client;
};;

// Get base URL for video REST API (bypasses SDK's predictLongRunning endpoint)
const getVideoBaseUrl = () => {
    const baseUrl = getApiUrl();
    return (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
};

// Models
const PRO_MODEL = 'gemini-3-pro-preview';
const FLASH_MODEL = 'gemini-3-flash-preview';
const THINKING_MODEL = 'gemini-3.1-pro-preview';
// Image Gen models
const IMAGE_PRO_MODEL = 'gemini-3-pro-image-preview';
const IMAGE_FLASH_MODEL = 'gemini-3-pro-image-preview';
const IMAGE_NANOBANANA_2_MODEL = 'gemini-3.1-flash-image-preview';
const IMAGE_SEEDREAM_MODEL = 'doubao-seedream-5-0-260128';
// Video Gen models
const VEO_FAST_MODEL = 'veo-3.1-fast-generate-preview';
const VEO_PRO_MODEL = 'veo-3.1-generate-preview';

type VideoApiVersion = 'v1beta' | 'v1';
type VideoAuthMode = 'bearer' | 'query';

const LEGACY_VIDEO_MODEL_MAP: Record<string, string> = {
    'veo-3.1-fast': VEO_FAST_MODEL,
    'veo-3.1': VEO_PRO_MODEL,
    'veo3.1-4k': VEO_PRO_MODEL,
    'veo3.1-c': VEO_PRO_MODEL,
};

const normalizeVideoModelId = (modelId: string): string => {
    const normalized = (modelId || '').trim();
    if (!normalized) return VEO_FAST_MODEL;

    if (normalized === 'Veo 3.1 Fast') return VEO_FAST_MODEL;
    if (normalized === 'Veo 3.1' || normalized === 'Veo 3.1 Pro') return VEO_PRO_MODEL;

    const lower = normalized.toLowerCase();
    if (LEGACY_VIDEO_MODEL_MAP[lower]) return LEGACY_VIDEO_MODEL_MAP[lower];

    return normalized;
};

const getNormalizedSelectedVideoModels = (): string[] => {
    const key = 'setting_video_models';
    const raw = localStorage.getItem(key);

    let parsed: string[] = [];
    try {
        const data = JSON.parse(raw || '[]');
        parsed = Array.isArray(data) ? data.filter(v => typeof v === 'string') : [];
    } catch {
        parsed = [];
    }

    const source = parsed.length > 0 ? parsed : [VEO_FAST_MODEL];
    const normalized = source.map(normalizeVideoModelId).filter(Boolean);
    const deduped = Array.from(new Set(normalized));

    if (deduped.length === 0) {
        const fallback = [VEO_FAST_MODEL];
        localStorage.setItem(key, JSON.stringify(fallback));
        return fallback;
    }

    const originalSerialized = JSON.stringify(source);
    const normalizedSerialized = JSON.stringify(deduped);
    if (originalSerialized !== normalizedSerialized) {
        localStorage.setItem(key, normalizedSerialized);
        console.log('[generateVideo] Migrated legacy video model ids to canonical ids');
    }

    return deduped;
};

const shouldFallbackVideoAuth = (status: number): boolean => {
    return status === 401 || status === 403 || status === 404;
};

const buildVideoGenerateUrl = (
    baseUrl: string,
    version: VideoApiVersion,
    modelId: string,
    authMode: VideoAuthMode,
    apiKey: string
): string => {
    const cleanBase = normalizeUrl(baseUrl);
    const baseWithoutVersion = cleanBase.replace(/\/v1(?:beta)?$/i, '');
    const versionBase = cleanBase.endsWith(`/${version}`) ? cleanBase : `${baseWithoutVersion}/${version}`;
    const path = `${versionBase}/models/${modelId}:generateVideos`;
    if (authMode === 'query') {
        return `${path}?key=${encodeURIComponent(apiKey)}`;
    }
    return path;
};

const buildVideoPollUrl = (
    baseUrl: string,
    version: VideoApiVersion,
    operationName: string,
    authMode: VideoAuthMode,
    apiKey: string
): string => {
    const cleanBase = normalizeUrl(baseUrl);
    const baseWithoutVersion = cleanBase.replace(/\/v1(?:beta)?$/i, '');
    const versionBase = cleanBase.endsWith(`/${version}`) ? cleanBase : `${baseWithoutVersion}/${version}`;
    const path = `${versionBase}/${operationName}`;
    if (authMode === 'query') {
        return `${path}?key=${encodeURIComponent(apiKey)}`;
    }
    return path;
};

const buildVideoHeaders = (authMode: VideoAuthMode, apiKey: string): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authMode === 'bearer') {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return headers;
};

const parseVideoUrlFromAnyPayload = (payload: any): string | null => {
    return payload?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
        || payload?.response?.generatedVideos?.[0]?.video?.uri
        || payload?.data?.[0]?.url
        || payload?.data?.[0]?.video?.url
        || payload?.output?.[0]?.url
        || payload?.video?.url
        || payload?.url
        || null;
};

const generateVideoOpenAICompatible = async (
    baseUrl: string,
    apiKey: string,
    modelId: string,
    config: VideoGenerationConfig
): Promise<string | null> => {
    const size = config.aspectRatio === '9:16' ? '720x1280' : '1280x720';
    const requestBody: Record<string, any> = {
        model: modelId,
        prompt: config.prompt,
        n: 1,
        size,
    };

    if (config.startFrame) {
        requestBody.image = config.startFrame;
        requestBody.input_image = config.startFrame;
    }

    const submitPlans: OpenAIAuthMode[] = ['bearer', 'query'];
    let lastError: any = null;

    for (const authMode of submitPlans) {
        try {
            const submitUrl = buildOpenAIUrl(baseUrl, '/v1/videos/generations', authMode, apiKey);
            const submitHeaders = buildOpenAIHeaders(authMode, apiKey);
            console.log(`[generateVideo/openai] POST [${authMode}] ${submitUrl.replace(apiKey, '***')}`);

            const submitRes = await fetch(submitUrl, {
                method: 'POST',
                headers: submitHeaders,
                body: JSON.stringify(requestBody),
            });

            if (!submitRes.ok) {
                const errText = await submitRes.text().catch(() => '');
                const err: any = new Error(`openai video submit ${submitRes.status} [${authMode}]: ${errText}`);
                err.status = submitRes.status;
                lastError = err;
                if (shouldTryAlternateAuth(submitRes.status)) {
                    continue;
                }
                throw err;
            }

            const submitData = await submitRes.json();
            const directUrl = parseVideoUrlFromAnyPayload(submitData);
            if (directUrl) return directUrl;

            const taskId = submitData?.id || submitData?.task_id || submitData?.data?.[0]?.id;
            if (!taskId) {
                lastError = new Error(`openai video submit succeeded but no task id: ${JSON.stringify(submitData).slice(0, 200)}`);
                continue;
            }

            const pollPaths = [
                `/v1/videos/${taskId}`,
                `/v1/videos/generations/${taskId}`,
                `/v1/tasks/${taskId}`,
            ];

            for (let i = 0; i < 60; i++) {
                await new Promise(resolve => setTimeout(resolve, 5000));

                for (const pollPath of pollPaths) {
                    try {
                        const pollUrl = buildOpenAIUrl(baseUrl, pollPath, authMode, apiKey);
                        const pollHeaders = buildOpenAIHeaders(authMode, apiKey);
                        const pollRes = await fetch(pollUrl, { headers: pollHeaders });
                        if (!pollRes.ok) continue;
                        const pollData = await pollRes.json();

                        const doneUrl = parseVideoUrlFromAnyPayload(pollData);
                        if (doneUrl) return doneUrl;

                        const status = (pollData?.status || pollData?.state || pollData?.data?.[0]?.status || '').toLowerCase();
                        if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled') {
                            throw new Error(`openai video polling failed: ${JSON.stringify(pollData).slice(0, 200)}`);
                        }
                    } catch (pollError) {
                        lastError = pollError;
                    }
                }
            }

            lastError = new Error('openai video polling timeout');
        } catch (error) {
            lastError = error;
            if (!isNetworkFetchError(error)) {
                const status = (error as any)?.status;
                if (status && !shouldTryAlternateAuth(status)) {
                    break;
                }
            }
        }
    }

    if (lastError) throw lastError;
    return null;
};

// Helper for retry logic
const retryWithBackoff = async <T>(
    fn: () => Promise<T>,
    retries: number = 4,
    delay: number = 1000,
    factor: number = 2
): Promise<T> => {
    try {
        return await fn();
    } catch (error: any) {
        const statusCode = error.status || error.code || error.httpCode;
        const msg = error.message || '';

        // 可重试的错误：503（过载）、500（服务器错误）、429（限流）、网络错误
        const isRetryable =
            statusCode === 503 ||
            statusCode === 500 ||
            statusCode === 429 ||
            msg.includes('overloaded') ||
            msg.includes('UNAVAILABLE') ||
            msg.includes('503') ||
            msg.includes('500') ||
            msg.includes('429') ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('rate limit') ||
            msg.includes('Too Many Requests') ||
            msg.includes('Internal Server Error') ||
            msg.includes('fetch failed') ||
            msg.includes('network');

        if (retries > 0 && isRetryable) {
            // 429 限流时使用更长的延迟
            const actualDelay = (statusCode === 429 || msg.includes('429') || msg.includes('rate limit'))
                ? Math.max(delay, 3000)
                : delay;
            console.warn(`[API重试] 错误码=${statusCode || 'unknown'}, ${actualDelay}ms 后重试... (剩余 ${retries} 次)`);
            await new Promise(resolve => setTimeout(resolve, actualDelay));
            return retryWithBackoff(fn, retries - 1, actualDelay * factor, factor);
        }
        throw error;
    }
};

const extractStatusCode = (error: any): number | undefined => {
    return error?.status || error?.code || error?.httpCode;
};

export const createChatSession = (model: string = PRO_MODEL, history: Content[] = [], systemInstruction?: string): Chat => {
    return getClient().chats.create({
        model: model,
        history: history,
        config: {
            systemInstruction: systemInstruction || `You are XcAISTUDIO, an expert AI design assistant. You help users create posters, branding, and design elements.
      
      CRITICAL OUTPUT RULE:
      When you suggest visual designs or when the user asks for a design plan, YOU MUST provide specific actionable generation options.
      Do not just describe them in text. You MUST output a structured JSON block for each option so the user can click to generate it.
      
      Format:
      \`\`\`json:generation
      {
        "title": "Design Style Name (e.g. Minimalist Blue)",
        "description": "Short explanation of this style",
        "prompt": "The full detailed prompt for image generation..."
      }
      \`\`\`
      
      You can output multiple blocks. Keep the "title" short.`,
            temperature: 0.7
        },
    });
};

export const fileToPart = async (file: File): Promise<Part> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        // Determine mime type manually if missing (common for some windows configs)
        let mimeType = file.type;
        const ext = file.name.split('.').pop()?.toLowerCase();

        if (!mimeType) {
            if (ext === 'pdf') mimeType = 'application/pdf';
            else if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            else if (ext === 'doc') mimeType = 'application/msword';
            else if (ext === 'md') mimeType = 'text/markdown';
            else if (ext === 'txt') mimeType = 'text/plain';
            else if (ext === 'png') mimeType = 'image/png';
            else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
            else if (ext === 'webp') mimeType = 'image/webp';
        }

        // Treat markdown and text as text parts
        if (mimeType === 'text/markdown' || mimeType === 'text/plain' || ext === 'md') {
            reader.onloadend = () => {
                resolve({ text: reader.result as string });
            };
            reader.readAsText(file);
        } else {
            // Treat others (images, pdf, docx) as inlineData (base64)
            reader.onloadend = () => {
                const base64String = (reader.result as string).split(',')[1];
                resolve({
                    inlineData: {
                        data: base64String,
                        mimeType: mimeType || 'application/octet-stream'
                    }
                });
            };
            reader.readAsDataURL(file);
        }
        reader.onerror = reject;
    });
};

export const sendMessage = async (
    chat: Chat,
    message: string,
    attachments: File[] = [],
    enableWebSearch: boolean = false
): Promise<string> => {
    try {
        const parts: Part[] = [];

        // Add text if present
        if (message.trim()) {
            parts.push({ text: message });
        }

        // Add attachments
        for (const file of attachments) {
            const part = await fileToPart(file);
            parts.push(part);
        }

        if (parts.length === 0) return "";

        const config: any = {};
        if (enableWebSearch) {
            config.tools = [{ googleSearch: {} }];
        }

        const result: GenerateContentResponse = await retryWithBackoff(() => chat.sendMessage({
            message: parts,
            config
        }));

        let text = result.text || "I processed your request.";

        // Handle Grounding Metadata (Sources)
        const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (groundingChunks && groundingChunks.length > 0) {
            const sources = groundingChunks
                .map((chunk: any) => {
                    if (chunk.web) {
                        return `[${chunk.web.title}](${chunk.web.uri})`;
                    }
                    return null;
                })
                .filter(Boolean);

            if (sources.length > 0) {
                text += `\n\n**Sources:**\n${sources.map((s: string) => `- ${s}`).join('\n')}`;
            }
        }

        return text;
    } catch (error) {
        console.error("Gemini API Error:", error);
        return "Sorry, I encountered an error while processing your request. Please ensure the file types are supported.";
    }
};

export const analyzeImageRegion = async (imageBase64: string): Promise<string> => {
    try {
        const matches = imageBase64.match(/^data:(.+);base64,(.+)$/);
        if (!matches) throw new Error("Invalid base64 image");

        const response = await retryWithBackoff<GenerateContentResponse>(() => getClient().models.generateContent({
            model: FLASH_MODEL,
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: matches[1],
                            data: matches[2]
                        }
                    },
                    {
                        text: "请用中文简要描述这个画面区域的主体（例如：一只猫、红色杯子）。只输出主体名称，不要任何废话，不超过5个字。"
                    }
                ]
            }
        }));

        return response.text || "Analysis failed.";
    } catch (error) {
        console.error("Analysis Error:", error);
        return "Could not analyze selection.";
    }
};

export const extractTextFromImage = async (imageBase64: string): Promise<string[]> => {
    try {
        const matches = imageBase64.match(/^data:(.+);base64,(.+)$/);
        if (!matches) throw new Error("Invalid base64 image");

        const response = await retryWithBackoff<GenerateContentResponse>(() => getClient().models.generateContent({
            model: FLASH_MODEL,
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: matches[1],
                            data: matches[2]
                        }
                    },
                    {
                        text: "Identify all the visible text in this image. Return the result as a JSON array of strings. If there is no text, return an empty array."
                    }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        }));

        if (response.text) {
            return JSON.parse(response.text);
        }
        return [];
    } catch (error) {
        console.error("Extract Text Error:", error);
        return [];
    }
};

export interface ImageGenerationConfig {
    prompt: string;
    model: 'Nano Banana Pro' | 'NanoBanana2' | 'Seedream5.0' | 'GPT Image 1.5' | 'Flux.2 Max';
    aspectRatio: string;
    imageSize?: '1K' | '2K' | '4K';
    referenceImage?: string; // base64 (legacy)
    referenceImages?: string[]; // Multiple base64 images
}

// Seedream 使用 dall-e-3 格式 (OpenAI 兼容的 /v1/images/generations 端点)
const generateImageDallE3 = async (
    model: string,
    prompt: string,
    aspectRatio: string
): Promise<string | null> => {
    const baseUrl = normalizeUrl(getApiUrl() || 'https://yunwu.ai');
    const apiKey = getApiKey();

    // 将宽高比转换为 dall-e-3 支持的尺寸
    let size = '1024x1024';
    if (aspectRatio === '16:9') size = '1792x1024';
    else if (aspectRatio === '9:16') size = '1024x1792';
    else if (aspectRatio === '4:3') size = '1024x768';
    else if (aspectRatio === '3:4') size = '768x1024';

    console.log(`[generateImageDallE3] model=${model}, size=${size}`);

    let response: any;
    try {
        response = await retryWithBackoff(async () => {
            return fetchOpenAIJsonWithFallback<any>(
                baseUrl,
                '/v1/images/generations',
                apiKey,
                {
                    model,
                    prompt,
                    n: 1,
                    size,
                    response_format: 'b64_json',
                },
                'generateImageDallE3'
            );
        });
    } catch (error: any) {
        const status = extractStatusCode(error);
        throw new ProviderError({
            provider: getProviderConfig().id || 'unknown',
            code: status === 401 || status === 403 ? 'AUTH_FAILED' : 'IMAGE_GENERATION_FAILED',
            status,
            retryable: status === 429 || status === 500 || status === 503,
            stage: 'generateRequest',
            details: error?.message,
            message: status === 401 || status === 403
                ? '图像生成鉴权失败，请检查 API Key。'
                : '图像生成请求失败，请稍后重试。'
        });
    }

    const b64 = response?.data?.[0]?.b64_json;
    if (b64) {
        console.log(`[generateImageDallE3] Success with model: ${model}`);
        return `data:image/png;base64,${b64}`;
    }

    // 如果返回的是 url 格式
    const url = response?.data?.[0]?.url;
    if (url) {
        console.log(`[generateImageDallE3] Got URL result from model: ${model}`);
        return url;
    }

    return null;
};

export const generateImage = async (config: ImageGenerationConfig): Promise<string | null> => {
    // Seedream 使用 dall-e-3 格式，走单独的路径
    if (config.model === 'Seedream5.0') {
        try {
            const result = await generateImageDallE3(IMAGE_SEEDREAM_MODEL, config.prompt, config.aspectRatio);
            if (result) return result;
        } catch (error: any) {
            console.warn(`[generateImage] Seedream dall-e-3 failed:`, error.message || error);
        }
        // Seedream 失败后 fallback 到 Gemini 模型
        console.log(`[generateImage] Seedream failed, falling back to Gemini model`);
    }

    // Get selected models from settings (multi-select)
    const selectedModels = JSON.parse(localStorage.getItem('setting_image_models') || '[]');
    let targetModels = selectedModels.length > 0 ? selectedModels : [IMAGE_PRO_MODEL];

    const storageKeyIdx = `service_poll_index_image`;
    let currentIdx = parseInt(localStorage.getItem(storageKeyIdx) || '0', 10);
    if (currentIdx >= targetModels.length) currentIdx = 0;

    let targetModelId = targetModels[currentIdx];
    // Update index for next time (Round Robin across service nodes)
    localStorage.setItem(storageKeyIdx, ((currentIdx + 1) % targetModels.length).toString());

    // Map high-level model names to internal IDs if needed
    if (targetModelId === 'Nano Banana Pro' || targetModelId === 'Auto' || !targetModelId) {
        targetModelId = IMAGE_PRO_MODEL;
    } else if (targetModelId === 'NanoBanana2') {
        targetModelId = IMAGE_NANOBANANA_2_MODEL;
    } else if (targetModelId.includes('1.5-flash')) {
        // 强制防止回退到云雾不支持的旧 ID
        targetModelId = IMAGE_PRO_MODEL;
    }

    // Concurrency check: If user has multi-key, the getApiKey() will handle its own poll.
    // Here we focus on model rotation.

    const modelsToTry = [...new Set([targetModelId, IMAGE_FLASH_MODEL])];

    let validAspectRatio = config.aspectRatio;
    const supported = ["1:1", "3:4", "4:3", "9:16", "16:9"];
    if (!supported.includes(validAspectRatio)) {
        if (validAspectRatio === '21:9') validAspectRatio = '16:9';
        else if (validAspectRatio === '3:2') validAspectRatio = '16:9';
        else if (validAspectRatio === '2:3') validAspectRatio = '9:16';
        else if (validAspectRatio === '5:4') validAspectRatio = '4:3';
        else if (validAspectRatio === '4:5') validAspectRatio = '3:4';
        else validAspectRatio = '1:1';
    }

    const parts: any[] = [{ text: config.prompt }];

    // Handle multiple references (preferred) or single reference
    const imagesToProcess = config.referenceImages || (config.referenceImage ? [config.referenceImage] : []);

    for (const imgBase64 of imagesToProcess) {
        const matches = imgBase64.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
            parts.push({
                inlineData: {
                    mimeType: matches[1],
                    data: matches[2]
                }
            });
        }
    }

    const imageConfig: any = {
        aspectRatio: validAspectRatio,
    };

    if (config.model === 'Nano Banana Pro' && config.imageSize) {
        imageConfig.imageSize = config.imageSize;
    }

    let lastError: any = null;

    for (const modelToUse of modelsToTry) {
        try {
            console.log(`[generateImage] Trying model: ${modelToUse}`);
            const response = await retryWithBackoff<GenerateContentResponse>(() => getClient().models.generateContent({
                model: modelToUse,
                contents: { parts },
                config: {
                    responseModalities: ['TEXT', 'IMAGE'],
                    imageConfig
                }
            }));

            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    console.log(`[generateImage] Success with model: ${modelToUse}`);
                    return `data:image/png;base64,${part.inlineData.data}`;
                }
            }
            // 没有图片数据但没报错 — 尝试下一个模型
            console.warn(`[generateImage] No image data from ${modelToUse}, trying next model`);
        } catch (error: any) {
            lastError = error;
            console.warn(`[generateImage] Model ${modelToUse} failed:`, error.message || error);
            // 继续尝试下一个模型
        }
    }

    console.error("Image Generation Error: all models failed", lastError);
    throw lastError || new Error('所有图片生成模型均不可用');
};

export interface VideoGenerationConfig {
    prompt: string;
    model: 'Veo 3.1' | 'Veo 3.1 Pro' | 'Veo 3.1 Fast';
    aspectRatio: string;
    startFrame?: string; // base64
    endFrame?: string; // base64
    referenceImages?: string[]; // array of base64
}

export const generateVideo = async (config: VideoGenerationConfig): Promise<string | null> => {
    try {
        const win = window as any;
        if (win.aistudio) {
            const hasKey = await win.aistudio.hasSelectedApiKey();
            if (!hasKey) {
                await win.aistudio.openSelectKey();
            }
        }

        let validAspectRatio = config.aspectRatio;
        if (validAspectRatio !== '16:9' && validAspectRatio !== '9:16') {
            validAspectRatio = '16:9';
        }

        // 1. Determine the target model ID
        let targetModelId = '';
        if (config.model === 'Veo 3.1' || config.model === 'Veo 3.1 Pro') targetModelId = VEO_PRO_MODEL;
        else if (config.model === 'Veo 3.1 Fast') targetModelId = VEO_FAST_MODEL;

        if (!targetModelId) {
            const candidates = getNormalizedSelectedVideoModels();
            const storageKeyIdx = `service_poll_index_video`;
            let currentIdx = parseInt(localStorage.getItem(storageKeyIdx) || '0', 10);
            if (currentIdx >= candidates.length) currentIdx = 0;
            targetModelId = candidates[currentIdx];
            localStorage.setItem(storageKeyIdx, ((currentIdx + 1) % candidates.length).toString());
        }

        const modelId = normalizeVideoModelId(targetModelId || VEO_FAST_MODEL);
        const baseUrl = getVideoBaseUrl();
        const apiKey = getApiKey();
        console.log(`[generateVideo] model=${modelId}, baseUrl=${baseUrl}, prompt=${config.prompt.slice(0, 50)}...`);

        // 2. Build request body
        const genConfig: any = { numberOfVideos: 1, aspectRatio: validAspectRatio };
        const body: any = { model: `models/${modelId}`, prompt: config.prompt, config: genConfig };
        const isFastModel = modelId.includes('fast');

        if (config.startFrame) {
            const matches = config.startFrame.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
                body.image = { mimeType: matches[1], imageBytes: matches[2] };
            }
        }
        if (config.endFrame) {
            const matches = config.endFrame.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
                genConfig.lastFrame = { mimeType: matches[1], imageBytes: matches[2] };
            }
        }
        if (config.referenceImages && config.referenceImages.length > 0 && !isFastModel) {
            const refPayload: any[] = [];
            for (const imgStr of config.referenceImages) {
                const matches = imgStr.match(/^data:(.+);base64,(.+)$/);
                if (matches) {
                    refPayload.push({
                        image: { mimeType: matches[1], imageBytes: matches[2] },
                        referenceType: 'ASSET'
                    });
                }
            }
            if (refPayload.length > 0) genConfig.referenceImages = refPayload;
        }

        // 3. POST via fetch — uses generateVideos endpoint (not SDK's predictLongRunning)
        const isGoogleDirect = baseUrl.includes('googleapis.com');
        const directGoogleUrl = `${baseUrl}/v1beta/models/${modelId}:generateVideos?key=${encodeURIComponent(apiKey)}`;
        let generateContext: { version: VideoApiVersion; authMode: VideoAuthMode } = { version: 'v1beta', authMode: 'query' };

        const genRes = await retryWithBackoff(async () => {
            if (isGoogleDirect) {
                console.log(`[generateVideo] POST ${directGoogleUrl.replace(apiKey, '***')}`);
                const r = await fetch(directGoogleUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (!r.ok) {
                    const errBody = await r.text();
                    const err: any = new Error(`generateVideos ${r.status}: ${errBody}`);
                    err.status = r.status;
                    throw err;
                }
                return r.json();
            }

            const plans: Array<{ version: VideoApiVersion; authMode: VideoAuthMode }> = [
                { version: 'v1beta', authMode: 'bearer' },
                { version: 'v1beta', authMode: 'query' },
                { version: 'v1', authMode: 'bearer' },
                { version: 'v1', authMode: 'query' },
            ];

            let lastError: any = null;

            for (const plan of plans) {
                try {
                    const generateUrl = buildVideoGenerateUrl(baseUrl, plan.version, modelId, plan.authMode, apiKey);
                    const headers = buildVideoHeaders(plan.authMode, apiKey);
                    console.log(`[generateVideo] POST [${plan.version}/${plan.authMode}] ${generateUrl.replace(apiKey, '***')}`);

                    const r = await fetch(generateUrl, { method: 'POST', headers, body: JSON.stringify(body) });
                    if (r.ok) {
                        generateContext = plan;
                        return r.json();
                    }

                    const errBody = await r.text();
                    const err: any = new Error(`generateVideos ${r.status} [${plan.version}/${plan.authMode}]: ${errBody}`);
                    err.status = r.status;
                    err.version = plan.version;
                    err.authMode = plan.authMode;
                    lastError = err;

                    if (!shouldFallbackVideoAuth(r.status)) {
                        throw err;
                    }
                } catch (networkErr) {
                    lastError = networkErr;
                    if (!isNetworkFetchError(networkErr)) {
                        throw networkErr;
                    }
                }
            }

            console.warn('[generateVideo] Google-style generateVideos failed, trying OpenAI-compatible video endpoint fallback');
            const openAiUrl = await generateVideoOpenAICompatible(baseUrl, apiKey, modelId, config);
            if (openAiUrl) {
                return { __openaiVideoUrl: openAiUrl } as any;
            }

            throw lastError || new Error('generateVideos failed on all auth/version strategies');
        });

        const openAiDirectUrl = (genRes as any)?.__openaiVideoUrl;
        if (openAiDirectUrl) {
            return openAiDirectUrl;
        }

        const operationName = genRes.name;
        if (!operationName) {
            throw new Error(`生成请求未返回 operation name: ${JSON.stringify(genRes).slice(0, 200)}`);
        }
        console.log(`[generateVideo] Operation created: ${operationName}`);

        // 4. Poll for completion
        let pollCount = 0;
        const MAX_POLLS = 60;

        while (pollCount < MAX_POLLS) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            pollCount++;

            const pollPlans: Array<{ version: VideoApiVersion; authMode: VideoAuthMode }> = isGoogleDirect
                ? [{ version: 'v1beta', authMode: 'query' }]
                : [
                    generateContext,
                    { version: 'v1beta', authMode: 'bearer' },
                    { version: 'v1beta', authMode: 'query' },
                    { version: 'v1', authMode: 'bearer' },
                    { version: 'v1', authMode: 'query' },
                ];

            let pollData: any = null;
            let lastPollError: any = null;

            try {
                for (const plan of pollPlans) {
                    const pollUrl = buildVideoPollUrl(baseUrl, plan.version, operationName, plan.authMode, apiKey);
                    const pollHeaders = buildVideoHeaders(plan.authMode, apiKey);
                    const pollRes = await fetch(pollUrl, { headers: pollHeaders });

                    if (!pollRes.ok) {
                        const errBody = await pollRes.text().catch(() => '');
                        const err: any = new Error(`poll ${pollRes.status} [${plan.version}/${plan.authMode}]: ${errBody}`);
                        err.status = pollRes.status;
                        lastPollError = err;
                        if (shouldFallbackVideoAuth(pollRes.status)) continue;
                        break;
                    }

                    pollData = await pollRes.json();
                    break;
                }

                if (!pollData) {
                    if (lastPollError) throw lastPollError;
                    throw new Error('轮询失败：无可用响应');
                }

                console.log(`[generateVideo] Poll #${pollCount}: done=${pollData.done}`);

                if (pollData.done) {
                    if (pollData.error) {
                        throw new Error(`生成失败: ${pollData.error.message || JSON.stringify(pollData.error)}`);
                    }
                    const uri = pollData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
                        || pollData.response?.generatedVideos?.[0]?.video?.uri;
                    if (uri) {
                        if (isGoogleDirect) {
                            return `${uri}${uri.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
                        }
                        return uri;
                    }
                    throw new Error(`未获取到视频资源: ${JSON.stringify(pollData.response || pollData).slice(0, 300)}`);
                }
            } catch (pollErr: any) {
                if (pollErr.message?.startsWith('生成失败') || pollErr.message?.startsWith('未获取到')) throw pollErr;
                console.warn(`[generateVideo] Poll #${pollCount} error:`, pollErr.message);
            }
        }

        throw new Error("视频生成超时，请稍后在项目中查看。");

    } catch (error: any) {
        console.error("Video Generation Detailed Error:", error);
        const status = extractStatusCode(error);
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('requested entity was not found')) {
            throw new ProviderError({
                provider: getProviderConfig().id || 'unknown',
                code: 'MODEL_NOT_FOUND',
                status,
                retryable: false,
                stage: 'modelResolve',
                details: error?.message,
                message: "模型无法在当前节点找到，请检查设置中的模型映射。"
            });
        } else if (msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable')) {
            throw new ProviderError({
                provider: getProviderConfig().id || 'unknown',
                code: 'PROVIDER_OVERLOADED',
                status: status || 503,
                retryable: true,
                stage: 'generateRequest',
                details: error?.message,
                message: "服务商节点当前过载 (503)，请稍后重试或切换 API 节点。"
            });
        } else if (msg.includes('403') || msg.includes('permission') || msg.includes('401')) {
            throw new ProviderError({
                provider: getProviderConfig().id || 'unknown',
                code: 'AUTH_FAILED',
                status: status || 401,
                retryable: false,
                stage: 'generateRequest',
                details: error?.message,
                message: "API 密钥权限不足或已失效，请检查设置。"
            });
        }

        if (error instanceof ProviderError) {
            throw error;
        }

        throw new ProviderError({
            provider: getProviderConfig().id || 'unknown',
            code: 'VIDEO_GENERATION_FAILED',
            status,
            retryable: status === 429 || status === 500 || status === 503,
            stage: 'unknown',
            details: error?.message,
            message: error?.message || '视频生成失败，请稍后重试。'
        });
    }
}
