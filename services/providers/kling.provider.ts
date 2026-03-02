import { VideoProvider, VideoGenerationRequest } from './types';
import { fetchWithResilience } from '../http/api-client';

const getKlingKey = (): string => {
  return localStorage.getItem('kling_api_key') || '';
};

const KLING_MODEL_MAP: Record<string, string> = {
  'Kling Standard': 'kling-v1',
  'Kling Pro': 'kling-v1-5',
  'Kling 2.0': 'kling-v2',
  'Kling 2.6': 'kling-v2-6',
};

export const klingVideoProvider: VideoProvider = {
  id: 'kling',
  name: '可灵 AI',
  models: ['Kling Standard', 'Kling Pro', 'Kling 2.0', 'Kling 2.6'],
  capability: {
    authMode: 'bearer',
    apiStyle: 'openai',
    supports: ['video'],
  },

  async generateVideo(request: VideoGenerationRequest, model: string): Promise<string | null> {
    const apiKey = getKlingKey();
    if (!apiKey) throw new Error('请在设置中配置可灵 API Key');

    const isImage2Video = !!request.startFrame;
    const endpoint = isImage2Video
      ? 'https://api.klingai.com/v1/videos/image2video'
      : 'https://api.klingai.com/v1/videos/text2video';

    const body: Record<string, any> = {
      prompt: request.prompt,
      model_name: KLING_MODEL_MAP[model] || 'kling-v1',
      duration: '5',
      aspect_ratio: request.aspectRatio === '9:16' ? '9:16' : '16:9',
    };

    if (isImage2Video && request.startFrame) {
      body.image = request.startFrame;
    }

    const res = await fetchWithResilience(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }, { operation: 'kling.submitVideo', retries: 1 });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `可灵 API 错误: ${res.status}`);
    }

    const data = await res.json();
    const taskId = data.data?.task_id;
    if (!taskId) throw new Error('未获取到任务 ID');

    const pollEndpoint = isImage2Video
      ? `https://api.klingai.com/v1/videos/image2video/${taskId}`
      : `https://api.klingai.com/v1/videos/text2video/${taskId}`;

    const maxAttempts = 120;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetchWithResilience(pollEndpoint, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      }, { operation: 'kling.pollVideo', retries: 1 });
      const pollData = await pollRes.json();
      if (pollData.data?.task_status === 'succeed') {
        const videoUrl = pollData.data?.task_result?.videos?.[0]?.url;
        return videoUrl || null;
      }
      if (pollData.data?.task_status === 'failed') {
        throw new Error(pollData.data?.task_status_msg || '视频生成失败');
      }
    }

    throw new Error('视频生成超时');
  }
};
