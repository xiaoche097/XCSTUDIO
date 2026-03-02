import { fetchAvailableModels } from './gemini';

export type ModelCategory = 'script' | 'image' | 'video';
export type ModelBrand =
  | 'Google'
  | 'OpenAI'
  | 'Anthropic'
  | 'DeepSeek'
  | 'Volcengine'
  | 'Bailian'
  | 'ChatGLM'
  | 'Wenxin'
  | 'Minimax'
  | 'Grok'
  | 'Moonshot'
  | 'Flux'
  | 'Ideogram'
  | 'Fal'
  | 'Replicate'
  | 'Midjourney'
  | 'Other';

export interface ModelInfo {
  id: string;
  name: string;
  brand?: ModelBrand;
  category: ModelCategory;
  provider?: string;
}

export interface ApiProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  isCustom?: boolean;
}

export interface LoadedProviderSettings {
  providers: ApiProviderConfig[];
  activeProviderId: string;
  replicateKey: string;
  klingKey: string;
  selectedScriptModels: string[];
  selectedImageModels: string[];
  selectedVideoModels: string[];
  visualContinuity: boolean;
  systemModeration: boolean;
  autoSave: boolean;
  concurrentCount: number;
}

const DEFAULT_VIDEO_MODEL = 'veo-3.1-fast-generate-preview';

const VIDEO_MODEL_ALIASES: Record<string, string> = {
  'veo-3.1-fast': DEFAULT_VIDEO_MODEL,
  'veo-3.1-fast-generate-preview': DEFAULT_VIDEO_MODEL,
  'Veo 3.1 Fast': DEFAULT_VIDEO_MODEL,
  'veo-3.1': 'veo-3.1-generate-preview',
  'Veo 3.1': 'veo-3.1-generate-preview',
  'Veo 3.1 Pro': 'veo-3.1-generate-preview',
  'veo3.1-4k': 'veo-3.1-generate-preview',
  'veo3.1-c': 'veo-3.1-generate-preview',
};

export const getDefaultProviders = (): ApiProviderConfig[] => {
  return [
    { id: 'yunwu', name: '云雾 (OpenAI)', baseUrl: 'https://yunwu.ai', apiKey: '' },
    { id: 'gemini', name: 'Gemini (原生)', baseUrl: 'https://generativelanguage.googleapis.com', apiKey: '' },
  ];
};

const normalizeVideoModels = (models: string[]): string[] => {
  if (!Array.isArray(models) || models.length === 0) return [DEFAULT_VIDEO_MODEL];
  const normalized = models
    .map(m => VIDEO_MODEL_ALIASES[m] || m)
    .filter(Boolean);
  return Array.from(new Set(normalized));
};

const safeJsonArray = (value: string | null, fallback: string[]): string[] => {
  try {
    const parsed = JSON.parse(value || '[]');
    if (Array.isArray(parsed)) {
      return parsed.filter(v => typeof v === 'string');
    }
  } catch {
    // ignore
  }
  return fallback;
};

export const loadProviderSettings = (): LoadedProviderSettings => {
  const storedProviders = localStorage.getItem('api_providers');
  let providers = getDefaultProviders();

  if (storedProviders) {
    try {
      const parsed = JSON.parse(storedProviders);
      if (Array.isArray(parsed) && parsed.length > 0) {
        providers = parsed;
      }
    } catch {
      // keep defaults
    }
  } else {
    const geminiKey = localStorage.getItem('gemini_api_key') || '';
    const yunwuKey = localStorage.getItem('yunwu_api_key') || '';
    providers = [
      { id: 'yunwu', name: '云雾 (OpenAI)', baseUrl: 'https://yunwu.ai', apiKey: yunwuKey },
      { id: 'gemini', name: 'Gemini (原生)', baseUrl: 'https://generativelanguage.googleapis.com', apiKey: geminiKey },
    ];
  }

  const storedActiveProviderId = localStorage.getItem('api_provider');
  const hasStoredActiveProvider = !!storedActiveProviderId;
  const fallbackActiveProviderId = hasStoredActiveProvider
    ? storedActiveProviderId!
    : (providers.find(p => p.id === 'yunwu')?.id || providers[0]?.id || 'yunwu');

  const activeProviderExists = providers.some(p => p.id === fallbackActiveProviderId);
  const activeProviderId = activeProviderExists
    ? fallbackActiveProviderId
    : (providers.find(p => p.id === 'yunwu')?.id || providers[0]?.id || 'yunwu');

  const selectedVideoModels = normalizeVideoModels(
    safeJsonArray(localStorage.getItem('setting_video_models'), [DEFAULT_VIDEO_MODEL])
  );
  localStorage.setItem('setting_video_models', JSON.stringify(selectedVideoModels));

  return {
    providers,
    activeProviderId,
    replicateKey: localStorage.getItem('replicate_api_key') || '',
    klingKey: localStorage.getItem('kling_api_key') || '',
    selectedScriptModels: safeJsonArray(localStorage.getItem('setting_script_models'), ['gemini-3-flash-preview']),
    selectedImageModels: safeJsonArray(localStorage.getItem('setting_image_models'), ['gemini-3-pro-image-preview']),
    selectedVideoModels,
    visualContinuity: localStorage.getItem('setting_visual_continuity') !== 'false',
    systemModeration: localStorage.getItem('setting_system_moderation') === 'true',
    autoSave: localStorage.getItem('setting_auto_save') !== 'false',
    concurrentCount: parseInt(localStorage.getItem('setting_concurrent_count') || '1', 10),
  };
};

export const saveProviderSettings = (settings: LoadedProviderSettings): void => {
  localStorage.setItem('api_providers', JSON.stringify(settings.providers));
  localStorage.setItem('api_provider', settings.activeProviderId);
  localStorage.setItem('replicate_api_key', settings.replicateKey.trim());
  localStorage.setItem('kling_api_key', settings.klingKey.trim());

  localStorage.setItem('setting_script_models', JSON.stringify(settings.selectedScriptModels));
  localStorage.setItem('setting_image_models', JSON.stringify(settings.selectedImageModels));
  localStorage.setItem('setting_video_models', JSON.stringify(normalizeVideoModels(settings.selectedVideoModels)));

  localStorage.setItem('setting_visual_continuity', settings.visualContinuity ? 'true' : 'false');
  localStorage.setItem('setting_system_moderation', settings.systemModeration ? 'true' : 'false');
  localStorage.setItem('setting_auto_save', settings.autoSave ? 'true' : 'false');
  localStorage.setItem('setting_concurrent_count', settings.concurrentCount.toString());
};

export const classifyModel = (modelId: string): Pick<ModelInfo, 'brand' | 'category'> => {
  const lowerId = modelId.toLowerCase();

  let brand: ModelInfo['brand'] = 'Other';
  if (lowerId.includes('gemini') || lowerId.includes('goog') || lowerId.includes('veo') || lowerId.includes('imagen')) brand = 'Google';
  else if (lowerId.includes('gpt') || lowerId.includes('o1-') || lowerId.includes('o3-')) brand = 'OpenAI';
  else if (lowerId.includes('claude')) brand = 'Anthropic';
  else if (lowerId.includes('deepseek')) brand = 'DeepSeek';
  else if (lowerId.includes('doubao') || lowerId.includes('volc')) brand = 'Volcengine';
  else if (lowerId.includes('qw')) brand = 'Bailian';
  else if (lowerId.includes('glm')) brand = 'ChatGLM';
  else if (lowerId.includes('ernie')) brand = 'Wenxin';
  else if (lowerId.includes('minimax')) brand = 'Minimax';
  else if (lowerId.includes('grok')) brand = 'Grok';
  else if (lowerId.includes('moonshot')) brand = 'Moonshot';
  else if (lowerId.includes('flux')) brand = 'Flux';
  else if (lowerId.includes('ideogram')) brand = 'Ideogram';
  else if (lowerId.includes('fal')) brand = 'Fal';
  else if (lowerId.includes('replicate')) brand = 'Replicate';
  else if (lowerId.includes('midjourney')) brand = 'Midjourney';

  let category: ModelCategory = 'script';
  if (lowerId.includes('vision') || lowerId.includes('dall-e') || lowerId.includes('flux') || lowerId.includes('imagen') || lowerId.includes('image') || lowerId.includes('stable-diffusion') || lowerId.includes('midjourney') || lowerId.includes('sdxl') || lowerId.includes('ideogram') || lowerId.includes('kolors') || lowerId.includes('playground') || lowerId.includes('aura') || lowerId.includes('recraft')) category = 'image';
  else if (lowerId.includes('video') || lowerId.includes('kling') || lowerId.includes('hailuo') || lowerId.includes('veo') || lowerId.includes('luma') || lowerId.includes('sora') || lowerId.includes('pika') || lowerId.includes('gen-2') || lowerId.includes('gen-3') || lowerId.includes('animate') || lowerId.includes('movie')) category = 'video';

  return { brand, category };
};

export const formatModels = (models: string[], providerName: string): ModelInfo[] => {
  return (models || []).map(id => {
    const { brand, category } = classifyModel(id);
    return { id, name: id, brand, category, provider: providerName };
  });
};

export const refreshProviderModels = async (
  providerId: string,
  providers: ApiProviderConfig[]
): Promise<ModelInfo[]> => {
  const provider = providers.find(p => p.id === providerId);
  if (!provider) return [];
  const keys = provider.apiKey.split('\n').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return [];
  const models = await fetchAvailableModels(providerId, keys, provider.baseUrl);
  return formatModels(models || [], provider.name);
};
