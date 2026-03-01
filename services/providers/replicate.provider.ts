import { ImageProvider, ImageGenerationRequest } from './types';

const getReplicateKey = (): string => {
  return localStorage.getItem('replicate_api_key') || '';
};

const ASPECT_RATIO_MAP: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1344, height: 768 },
  '9:16': { width: 768, height: 1344 },
  '4:3': { width: 1152, height: 896 },
  '3:4': { width: 896, height: 1152 },
};

async function pollPrediction(id: string, apiKey: string): Promise<any> {
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const data = await res.json();
    if (data.status === 'succeeded') return data;
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(data.error || 'Prediction failed');
    }
  }
  throw new Error('Prediction timed out');
}

async function imageUrlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const replicateImageProvider: ImageProvider = {
  id: 'replicate',
  name: 'Replicate',
  models: ['Flux Schnell', 'SDXL'],
  capability: {
    authMode: 'bearer',
    apiStyle: 'custom',
    supports: ['image'],
  },

  async generateImage(request: ImageGenerationRequest, model: string): Promise<string | null> {
    const apiKey = getReplicateKey();
    if (!apiKey) throw new Error('请在设置中配置 Replicate API Key');

    const dims = ASPECT_RATIO_MAP[request.aspectRatio] || ASPECT_RATIO_MAP['1:1'];

    const modelVersions: Record<string, string> = {
      'Flux Schnell': 'black-forest-labs/flux-schnell',
      'SDXL': 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
    };

    const version = modelVersions[model];
    if (!version) throw new Error(`Unknown model: ${model}`);

    const input: Record<string, any> = {
      prompt: request.prompt,
      width: dims.width,
      height: dims.height,
    };

    if (model === 'Flux Schnell') {
      input.num_outputs = 1;
      input.go_fast = true;
    } else {
      input.num_inference_steps = 30;
      input.guidance_scale = 7.5;
    }

    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version: version.includes(':') ? version.split(':')[1] : undefined, model: version.includes(':') ? undefined : version, input }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `Replicate API error: ${res.status}`);
    }

    const prediction = await res.json();
    const result = await pollPrediction(prediction.id, apiKey);

    const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
    if (!outputUrl) return null;

    return imageUrlToBase64(outputUrl);
  }
};
