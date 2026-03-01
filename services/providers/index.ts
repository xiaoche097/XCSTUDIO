import { ImageProvider, VideoProvider, ImageGenerationRequest, VideoGenerationRequest } from './types';
import { geminiImageProvider, geminiVideoProvider } from './gemini.provider';
import { replicateImageProvider } from './replicate.provider';
import { klingVideoProvider } from './kling.provider';
import { ProviderError } from '../../utils/provider-error';

// All registered providers
const imageProviders: Map<string, ImageProvider> = new Map([
  ['gemini', geminiImageProvider],
  ['replicate', replicateImageProvider],
]);

const videoProviders: Map<string, VideoProvider> = new Map([
  ['gemini', geminiVideoProvider],
  ['kling', klingVideoProvider],
]);

// Model → Provider lookup (built from provider registry)
const modelToImageProvider: Record<string, string> = {};
const modelToVideoProvider: Record<string, string> = {};

const registerModels = (mapping: Record<string, string>, providerId: string, models: string[]) => {
  models.forEach(model => {
    mapping[model] = providerId;
  });
};

imageProviders.forEach((provider, providerId) => registerModels(modelToImageProvider, providerId, provider.models));
videoProviders.forEach((provider, providerId) => registerModels(modelToVideoProvider, providerId, provider.models));

// Video model aliases for compatibility with old settings/model ids
const VIDEO_MODEL_ALIASES: Record<string, string> = {
  'Auto': 'Veo 3.1 Fast',
  'veo-3.1-fast': 'Veo 3.1 Fast',
  'veo-3.1-fast-generate-preview': 'Veo 3.1 Fast',
  'veo-3.1': 'Veo 3.1',
  'veo-3.1-generate-preview': 'Veo 3.1',
  'veo3.1-4k': 'Veo 3.1',
  'veo3.1-c': 'Veo 3.1',
};

const resolveVideoModel = (model: string): string => {
  return VIDEO_MODEL_ALIASES[model] || model;
};

const resolveImageModel = (model: string): string => {
  return model;
};

export function getAvailableImageModels(): string[] {
  return Object.keys(modelToImageProvider);
}

export function getAvailableVideoModels(): string[] {
  return Object.keys(modelToVideoProvider);
}

export async function generateImageWithProvider(
  request: ImageGenerationRequest,
  model: string
): Promise<string | null> {
  const resolvedModel = resolveImageModel(model);
  const providerId = modelToImageProvider[resolvedModel];
  if (!providerId) {
    throw new ProviderError({
      provider: 'router',
      code: 'MODEL_NOT_FOUND',
      retryable: false,
      stage: 'modelResolve',
      details: `image:${model}`,
      message: `未知图像模型: ${model}`,
    });
  }

  const provider = imageProviders.get(providerId);
  if (!provider) {
    throw new ProviderError({
      provider: providerId,
      code: 'PROVIDER_NOT_FOUND',
      retryable: false,
      stage: 'config',
      details: `image:${resolvedModel}`,
      message: `未找到提供商: ${providerId}`,
    });
  }

  return provider.generateImage(request, resolvedModel);
}

export async function generateVideoWithProvider(
  request: VideoGenerationRequest,
  model: string
): Promise<string | null> {
  const resolvedModel = resolveVideoModel(model);
  const providerId = modelToVideoProvider[resolvedModel];
  if (!providerId) {
    throw new ProviderError({
      provider: 'router',
      code: 'MODEL_NOT_FOUND',
      retryable: false,
      stage: 'modelResolve',
      details: `video:${model}`,
      message: `未知视频模型: ${model}`,
    });
  }

  const provider = videoProviders.get(providerId);
  if (!provider) {
    throw new ProviderError({
      provider: providerId,
      code: 'PROVIDER_NOT_FOUND',
      retryable: false,
      stage: 'config',
      details: `video:${resolvedModel}`,
      message: `未找到提供商: ${providerId}`,
    });
  }

  return provider.generateVideo(request, resolvedModel);
}

export { imageProviders, videoProviders };
