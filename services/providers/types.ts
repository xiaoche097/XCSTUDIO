export interface ImageGenerationRequest {
  prompt: string;
  aspectRatio: string;
  imageSize?: '1K' | '2K' | '4K';
  referenceImage?: string; // base64
  referenceImages?: string[];
}

export interface VideoGenerationRequest {
  prompt: string;
  aspectRatio: string;
  startFrame?: string; // base64
  endFrame?: string; // base64
  referenceImages?: string[];
}

export type ProviderAuthMode = 'bearer' | 'apiKeyQuery' | 'both';
export type ProviderApiStyle = 'google' | 'openai' | 'custom';

export interface ProviderCapability {
  authMode: ProviderAuthMode;
  apiStyle: ProviderApiStyle;
  supports: Array<'modelList' | 'chat' | 'image' | 'video'>;
}

export interface ImageProvider {
  id: string;
  name: string;
  models: string[];
  capability: ProviderCapability;
  generateImage(request: ImageGenerationRequest, model: string): Promise<string | null>;
}

export interface VideoProvider {
  id: string;
  name: string;
  models: string[];
  capability: ProviderCapability;
  generateVideo(request: VideoGenerationRequest, model: string): Promise<string | null>;
}

export type ProviderType = 'image' | 'video';
