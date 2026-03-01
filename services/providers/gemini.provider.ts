import { ImageProvider, VideoProvider, ImageGenerationRequest, VideoGenerationRequest } from './types';
import { generateImage, generateVideo } from '../gemini';

export const geminiImageProvider: ImageProvider = {
  id: 'gemini',
  name: 'Gemini',
  models: ['Nano Banana Pro', 'NanoBanana2', 'Seedream5.0'],
  capability: {
    authMode: 'both',
    apiStyle: 'google',
    supports: ['modelList', 'chat', 'image', 'video'],
  },

  async generateImage(request: ImageGenerationRequest, model: string): Promise<string | null> {
    return generateImage({
      prompt: request.prompt,
      model: model as any,
      aspectRatio: request.aspectRatio,
      imageSize: request.imageSize,
      referenceImage: request.referenceImage,
      referenceImages: request.referenceImages,
    });
  }
};

export const geminiVideoProvider: VideoProvider = {
  id: 'gemini',
  name: 'Gemini Veo',
  models: ['Veo 3.1', 'Veo 3.1 Pro', 'Veo 3.1 Fast'],
  capability: {
    authMode: 'both',
    apiStyle: 'google',
    supports: ['modelList', 'chat', 'image', 'video'],
  },

  async generateVideo(request: VideoGenerationRequest, model: string): Promise<string | null> {
    return generateVideo({
      prompt: request.prompt,
      model: model as 'Veo 3.1' | 'Veo 3.1 Pro' | 'Veo 3.1 Fast',
      aspectRatio: request.aspectRatio,
      startFrame: request.startFrame,
      endFrame: request.endFrame,
      referenceImages: request.referenceImages,
    });
  }
};
