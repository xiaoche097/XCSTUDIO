import { z } from 'zod';
import type { ImageModel } from '../../types';
import { imageGenSkill } from './image-gen.skill';
import { analyzeClothingProductSkill } from './analyze-clothing-product.skill';
import { generateModelSkill } from './generate-model.skill';
import { ensureWhiteBackground } from '../image-postprocess';
// NOTE: No post-generation QC loops here.
// We rely on strong reference anchoring (model anchor sheet + product anchor)
// to keep costs predictable and avoid repeated charged validations.
import { loadTopicSnapshot, saveTopicAsset, syncClothingTopicMemory } from '../topic-memory';

type Platform = 'amazon' | 'taobao' | 'tmall' | 'unknown';

const schema = z.object({
  productImages: z.array(z.string()).min(1).max(6),
  brief: z.string().optional(),
  platform: z.string().optional(),
  background: z.string().optional(),
  count: z.number().int().min(1).max(10).optional(),
  aspectRatio: z.string().optional(),
  clarity: z.enum(['1K', '2K', '4K']).optional(),
  preferredImageModel: z.string().optional(),
  sessionModelAnchorSheetUrl: z.string().optional(),
  regenerateModel: z.boolean().optional(),
});

const defaultPlatformShots = (productType: string): Array<{ label: string; shotSpec: string }> => {
  // Keep it stable and platform-agnostic for now.
  // Prioritize shots that show construction clearly and avoid occlusion.
  if (productType === 'pants' || productType === 'skirt') {
    return [
      { label: '全身正面主图', shotSpec: 'full body, front view, centered, arms down, no occlusion' },
      { label: '背面展示', shotSpec: 'full body, back view, hair not covering garment, no occlusion' },
      { label: '侧面展示', shotSpec: 'full body, side view, show silhouette, no occlusion' },
    ];
  }
  return [
    { label: '全身正面主图', shotSpec: 'full body, front view, centered, arms down, no occlusion' },
    { label: '背面展示', shotSpec: 'full body, back view, hair not covering neckline, no occlusion' },
    { label: '3/4 正面', shotSpec: 'three-quarter front view, natural pose, no occlusion' },
  ];
};

const normalizePlatform = (raw?: string): Platform => {
  const s = String(raw || '').toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('amazon') || s.includes('亚马逊')) return 'amazon';
  if (s.includes('tmall') || s.includes('天猫')) return 'tmall';
  if (s.includes('taobao') || s.includes('淘宝')) return 'taobao';
  return 'unknown';
};

const parseModelOptionsFromBrief = (brief?: string) => {
  const t = String(brief || '').trim();
  const lower = t.toLowerCase();

  const gender = /男|男性|man|male/.test(t) && !/女|女性|woman|female/.test(t)
    ? '男性'
    : /女|女性|woman|female/.test(t)
      ? '女性'
      : '不限';

  let ageRange = '18-25岁';
  const mRange = t.match(/(\d{2})\s*[-~到至]\s*(\d{2})/);
  if (mRange) ageRange = `${mRange[1]}-${mRange[2]}岁`;
  const mAge = t.match(/(\d{1,2})\s*岁/);
  if (!mRange && mAge) {
    const n = Number(mAge[1]);
    if (n <= 12) ageRange = '7-12岁';
    else if (n <= 17) ageRange = '13-17岁';
    else if (n <= 25) ageRange = '18-25岁';
    else if (n <= 35) ageRange = '26-35岁';
    else if (n <= 50) ageRange = '36-50岁';
    else ageRange = '50岁+';
  }

  const skinTone = /亚洲|东亚|国风|asian/.test(t)
    ? '亚洲人'
    : /欧美|白人|caucasian|european|american/.test(lower)
      ? '白人'
      : /黑人|black/.test(lower)
        ? '黑人'
        : /拉丁|latino|latin/.test(lower)
          ? '拉丁裔'
          : '不限';

  const hairstyle = /短发/.test(t)
    ? '短发'
    : /长发/.test(t)
      ? '长发'
      : /卷发/.test(t)
        ? '卷发'
        : '披肩直发';

  const expression = /冷脸|高冷|冷感/.test(t)
    ? '冷感表情'
    : /微笑|笑/.test(t)
      ? '自然微笑'
      : '自然表情';

  // Keep pose stable for anchor generation.
  const pose = '站立正面';
  const makeup = /浓妆|舞台妆/.test(t) ? '精致妆容' : '日常淡妆';

  return {
    gender,
    ageRange,
    skinTone,
    pose,
    expression,
    hairstyle,
    makeup,
    extra: t || 'clean studio fashion model photo, full body',
    count: 4,
  };
};

const buildBackgroundText = (background?: string) => {
  const bg = String(background || '').trim();
  if (!bg) {
    return 'Pure solid white background #FFFFFF, seamless. Very soft natural contact shadow only.';
  }
  // User specified background; still keep it studio-clean.
  return `Background: ${bg}. Keep it clean and distraction-free (no props, no text).`;
};

const NEGATIVE_PROMPT = `cartoon, illustration, anime, CGI, 3d render, doll-like, plastic skin, over-smoothed face, beauty filter, AI glow,
uncanny face, deformed hands, extra fingers, bad anatomy, warped proportions,
random patterns, wrong stitching, wrong neckline, wrong hem, wrong buttons, text, watermark, logo`;

export type ClothingStudioQuickResult = {
  images: Array<{ url: string; label?: string }>;
  modelAnchorSheetUrl: string;
  analysis?: any;
};

export async function clothingStudioQuickSkill(raw: unknown): Promise<ClothingStudioQuickResult> {
  const onProgress = typeof (raw as any)?.onProgress === 'function'
    ? ((raw as any).onProgress as (text: string) => void)
    : undefined;

  const params = schema.parse(raw);

  const productImages = params.productImages.slice(0, 6);
  const brief = String(params.brief || '').trim();
  const platform = normalizePlatform(params.platform);
  const count = Math.max(1, Math.min(10, Number(params.count || 3)));
  const aspectRatio = String(params.aspectRatio || '3:4');
  const clarity = (params.clarity || '2K') as '1K' | '2K' | '4K';
  const preferredModel = (params.preferredImageModel || 'nanobanana2') as ImageModel;

  onProgress?.('正在分析产品图（锁定材质/颜色/结构锚点）...');
  const analysis = await analyzeClothingProductSkill({
    productImages,
    brief,
  });
  onProgress?.('产品分析完成，准备生成/复用模特锚点...');

  const productAnchorUrl = productImages[Math.max(0, Math.min(productImages.length - 1, Number(analysis.productAnchorIndex || 0)))] || productImages[0];

  const topicId = String((raw as any)?.topicId || '').trim() || '';
  let modelAnchorSheetUrl = String(params.sessionModelAnchorSheetUrl || '').trim();

  // Recommended behavior: cache one model anchor per topic/session.
  if (!modelAnchorSheetUrl && topicId && !params.regenerateModel) {
    const snap = await loadTopicSnapshot(topicId);
    const cached = snap?.clothingStudio?.modelAnchorSheetRef?.url;
    if (cached) {
      modelAnchorSheetUrl = cached;
      onProgress?.('已复用本会话的模特锚点（确保同一张脸）');
    }
  }

  if (!modelAnchorSheetUrl || params.regenerateModel) {
    onProgress?.('正在生成模特四视图锚点（用于锁脸一致性）...');
    const modelOptions = parseModelOptionsFromBrief(brief);
    const generated = await generateModelSkill({
      options: modelOptions as any,
      preferredImageModel: preferredModel,
    });
    modelAnchorSheetUrl = generated.anchorSheetUrl;
    onProgress?.('模特锚点生成完成，开始生成棚拍组图...');

    if (topicId) {
      const ref = await saveTopicAsset(topicId, 'model_anchor_sheet', {
        url: modelAnchorSheetUrl,
        mime: 'image/png',
      });
      if (ref) {
        await syncClothingTopicMemory(topicId, { modelAnchorSheetRef: ref });
      }
    }
  }

  const backgroundText = buildBackgroundText(params.background);

  const baseShots = defaultPlatformShots(String(analysis.productType || 'unknown'));
  const shotList = Array.from({ length: count }).map((_, i) => baseShots[i % baseShots.length]);

  const images: Array<{ url: string; label?: string }> = [];

  for (let i = 0; i < shotList.length; i += 1) {
    const shot = shotList[i];

    onProgress?.(`正在生成第 ${i + 1}/${shotList.length} 张：${shot.label}`);

    const prompt = `You are a high-end e-commerce fashion photographer.

Use reference[0] as the ONLY MODEL identity anchor sheet (same person across all outputs).
Use reference[1] as the ONLY PRODUCT anchor (garment facts only).

CRITICAL:
- SAME FACE: The model must be the exact same individual as reference[0].
- SAME GARMENT: The garment must match reference[1] exactly (structure, material, color).

CAMERA & LIGHTING:
- Photorealistic catalog studio, 85mm lens, f/8, ISO100, strobe lighting.

BACKGROUND:
- ${backgroundText}

SHOT:
- ${shot.shotSpec}

PRODUCT CONSISTENCY ANCHOR:
- ${analysis.anchorDescription || 'Keep garment construction, color, and material unchanged.'}
- Forbidden changes: ${(analysis.forbiddenChanges || []).join('; ') || 'Do not alter design, color, or material.'}

AVOID:
${NEGATIVE_PROMPT}
`;

    const rawUrl = await imageGenSkill({
      prompt,
      model: preferredModel,
      aspectRatio,
      imageSize: clarity,
      referenceImages: [modelAnchorSheetUrl, productAnchorUrl, ...productImages].filter(Boolean),
      referencePriority: 'all',
      referenceStrength: 0.9,
      referenceMode: 'product-swap',
    } as any);

    if (!rawUrl) {
      continue;
    }

    const finalUrl = await ensureWhiteBackground(rawUrl);
    images.push({ url: finalUrl, label: shot.label });
  }

  return {
    images,
    modelAnchorSheetUrl,
    analysis: { platform, productType: analysis.productType },
  };
}
