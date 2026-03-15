import {
  ImageProvider,
  VideoProvider,
  ImageGenerationRequest,
  VideoGenerationRequest,
} from "./types";
import { geminiImageProvider, geminiVideoProvider } from "./gemini.provider";
import { replicateImageProvider } from "./replicate.provider";
import { klingVideoProvider } from "./kling.provider";
import { ProviderError } from "../../utils/provider-error";

// All registered providers
const imageProviders: Map<string, ImageProvider> = new Map([
  ["gemini", geminiImageProvider],
  ["replicate", replicateImageProvider],
]);

const videoProviders: Map<string, VideoProvider> = new Map([
  ["gemini", geminiVideoProvider],
  ["kling", klingVideoProvider],
]);

// Model → Provider lookup (built from provider registry)
const modelToImageProvider: Record<string, string> = {};
const modelToVideoProvider: Record<string, string> = {};

const registerModels = (
  mapping: Record<string, string>,
  providerId: string,
  models: string[],
) => {
  models.forEach((model) => {
    mapping[model] = providerId;
  });
};

imageProviders.forEach((provider, providerId) =>
  registerModels(modelToImageProvider, providerId, provider.models),
);
videoProviders.forEach((provider, providerId) =>
  registerModels(modelToVideoProvider, providerId, provider.models),
);

// Video model aliases for compatibility with old settings/model ids
const VIDEO_MODEL_ALIASES: Record<string, string> = {
  auto: "Veo 3.1 Fast",
  "veo-3.1-fast": "Veo 3.1 Fast",
  "veo_3_1-fast": "Veo 3.1 Fast",
  "veo-3.1-fast-generate-preview": "Veo 3.1 Fast",
  "veo-3.1": "Veo 3.1",
  "veo-3.1-generate-preview": "Veo 3.1",
  "veo3.1-4k": "Veo 3.1",
  "veo3.1-c": "Veo 3.1",
  "veo 3.1 fast": "Veo 3.1 Fast",
  "veo 3.1 pro": "Veo 3.1",
  "sora-2": "Sora 2",
  "kling-3.0": "Kling Pro",
  "kling 3.0": "Kling Pro",
};

const resolveVideoModel = (model: string): string => {
  const normalized = (model || "").trim();
  if (!normalized) return "Veo 3.1 Fast";
  return VIDEO_MODEL_ALIASES[normalized.toLowerCase()] || normalized;
};

const resolveImageModel = (model: string): string => {
  // 兜底修复：历史错误模型名会触发代理 "No available channels"
  // Default model should be NanoBanana2 (alias: nanobanana2)
  if (!model || model === "Auto") return "NanoBanana2";
  const lower = model.toLowerCase();
  if (lower === "nanobanana2" || lower === "nanobanana 2") return "NanoBanana2";
  if (lower === "gemini-3-pro-image-preview") return "Nano Banana Pro";
  if (lower === "gemini-3.1-flash-image-preview") return "NanoBanana2";
  if (lower === "doubao-seedream-5-0-260128") return "Seedream5.0";
  if (lower.includes("gemini-1.5-pro-image-preview-tok"))
    return "Nano Banana Pro";
  if (
    lower.includes("1.5-pro-image-preview") ||
    lower.includes("1.5-flash-image-preview")
  )
    return "Nano Banana Pro";
  return model;
};

const warnModelFallback = (
  type: "image" | "video",
  requestedModel: string,
  resolvedModel: string,
  fallbackProviderId: string,
) => {
  console.warn(
    `[provider-router] Unknown ${type} model "${requestedModel}" (resolved: "${resolvedModel}") -> fallback provider "${fallbackProviderId}"`,
  );
};

const shouldUseStrictModelRouting = (): boolean => {
  if (typeof window === "undefined") return false;
  const strictFlag = window.localStorage.getItem("strict_model_routing");
  if (strictFlag === "1" || strictFlag === "true") return true;
  return false;
};

const createModelNotFoundError = (
  type: "image" | "video",
  requestedModel: string,
  resolvedModel: string,
) => {
  return new ProviderError({
    provider: "router",
    code: "MODEL_NOT_FOUND",
    retryable: false,
    stage: "config",
    details: `${type}:${requestedModel}->${resolvedModel}`,
    message: `未识别${type === "image" ? "图像" : "视频"}模型: ${requestedModel}`,
  });
};

export function getAvailableImageModels(): string[] {
  return Object.keys(modelToImageProvider);
}

export function getAvailableVideoModels(): string[] {
  return Object.keys(modelToVideoProvider);
}

export async function generateImageWithProvider(
  request: ImageGenerationRequest,
  model: string,
): Promise<string | null> {
  const resolvedModel = resolveImageModel(model);
  const matchedProviderId = modelToImageProvider[resolvedModel];
  if (!matchedProviderId && shouldUseStrictModelRouting()) {
    throw createModelNotFoundError("image", model, resolvedModel);
  }
  const providerId = matchedProviderId || "gemini"; // 默认回落到 Gemini / 云雾中转大管家
  if (!matchedProviderId) {
    warnModelFallback("image", model, resolvedModel, providerId);
  }
  const provider = imageProviders.get(providerId);

  if (!provider) {
    throw new ProviderError({
      provider: providerId,
      code: "PROVIDER_NOT_FOUND",
      retryable: false,
      stage: "config",
      details: `image:${resolvedModel}`,
      message: `未找到提供商: ${providerId}`,
    });
  }

  return provider.generateImage(request, resolvedModel);
}

export async function generateVideoWithProvider(
  request: VideoGenerationRequest,
  model: string,
): Promise<string | null> {
  const resolvedModel = resolveVideoModel(model);

  // 对 Kling 的显式识别，如果是 kling 开头的模型或者指定的关键字
  const isKling = resolvedModel.toLowerCase().includes("kling");
  const matchedProviderId = modelToVideoProvider[resolvedModel];
  if (!matchedProviderId && shouldUseStrictModelRouting()) {
    throw createModelNotFoundError("video", model, resolvedModel);
  }
  const providerId = matchedProviderId || (isKling ? "kling" : "gemini");
  if (!matchedProviderId) {
    warnModelFallback("video", model, resolvedModel, providerId);
  }

  const provider = videoProviders.get(providerId);
  if (!provider) {
    throw new ProviderError({
      provider: providerId,
      code: "PROVIDER_NOT_FOUND",
      retryable: false,
      stage: "config",
      details: `video:${resolvedModel}`,
      message: `未找到提供商: ${providerId}`,
    });
  }

  return provider.generateVideo(request, resolvedModel);
}

export { imageProviders, videoProviders };
