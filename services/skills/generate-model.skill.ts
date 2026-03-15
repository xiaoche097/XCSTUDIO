import { z } from 'zod';
import { imageGenSkill } from './image-gen.skill';
import type { ModelGenOptions } from '../../types/workflow.types';
import type { ImageModel } from '../../types';
import { loadProviderSettings } from '../provider-settings';
import { buildModelConstraintsText } from '../../utils/clothing-prompt';
import { ensureWhiteBackground } from '../image-postprocess';
import { composeFourViews } from '../four-views';

const schema = z.object({
  options: z.object({
    gender: z.string().optional(),
    ageRange: z.string().optional(),
    skinTone: z.string().optional(),
    pose: z.string().optional(),
    expression: z.string().optional(),
    hairstyle: z.string().optional(),
    makeup: z.string().optional(),
    extra: z.string().optional(),
    count: z.number().int().min(1).max(4).default(4),
  }),
});

export async function generateModelSkill(params: { options: ModelGenOptions; preferredImageModel?: ImageModel }): Promise<{ images: Array<{ url: string }>; anchorSheetUrl: string }> {
  const parsed = schema.parse(params);
  const count = Math.max(1, Math.min(4, parsed.options.count || 4));
  const providerSettings = loadProviderSettings();
  const activeProvider = providerSettings.providers.find(p => p.id === providerSettings.activeProviderId);
  const hasKey = !!activeProvider?.apiKey?.trim();

  if (!hasKey) {
    throw new Error(`当前提供商(${activeProvider?.name || providerSettings.activeProviderId || '未知'})未配置 API Key，请在设置中填写中转或 Gemini Key`);
  }

  const gender = parsed.options.gender?.trim() || 'adult';
  const ageRange = parsed.options.ageRange?.trim() || '20-30';
  const skinTone = parsed.options.skinTone?.trim() || 'natural skin tone';
  const pose = parsed.options.pose?.trim() || 'natural standing pose';
  const expression = parsed.options.expression?.trim() || 'natural expression';
  const hairstyle = parsed.options.hairstyle?.trim() || 'clean and tidy hairstyle';
  const makeup = parsed.options.makeup?.trim() || 'natural makeup';
  const extra = parsed.options.extra?.trim() || 'clean studio fashion model photo, full body';
  const modelConstraints = buildModelConstraintsText(parsed.options);
  const views = ['front view', 'left side view', 'back view', 'right side view'];

  const outputs: Array<{ url: string }> = [];

  for (let i = 0; i < count; i += 1) {
    const prompt = `Generate a studio model identity anchor image, ${views[i]}. gender: ${gender}; age: ${ageRange}; skin tone: ${skinTone}; pose: ${pose}; expression: ${expression}; hairstyle: ${hairstyle}; makeup: ${makeup}; ${extra}.\nSTRICT OUTFIT: plain white top and plain white long pants only, no logo, no prints, no jewelry, no bag, no hat, no extra accessories.\nSTRICT BACKGROUND: pure white background #FFFFFF, no props, no scene, no gradient.\nPOSE: full body in frame, natural standing, arms down, consistent identity.\n${modelConstraints}`;
    const rawUrl = await imageGenSkill({
      prompt,
      model: params.preferredImageModel || 'nanobanana2',
      aspectRatio: '3:4',
      imageSize: '2K',
    });
    if (rawUrl) {
      const whiteBg = await ensureWhiteBackground(rawUrl);
      outputs.push({ url: whiteBg });
    }
  }

  if (outputs.length < count) {
    throw new Error(`模特视图生成不足 ${count} 张，请重试`);
  }

  const composeSource = {
    front: outputs[0]?.url,
    left: outputs[1]?.url || outputs[0]?.url,
    back: outputs[2]?.url || outputs[0]?.url,
    right: outputs[3]?.url || outputs[1]?.url || outputs[0]?.url,
  };
  const anchorSheetUrl = await composeFourViews(composeSource as {
    front: string;
    left: string;
    back: string;
    right: string;
  });

  return { images: outputs, anchorSheetUrl };
}
