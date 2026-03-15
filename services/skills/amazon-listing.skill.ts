import { z } from 'zod';
import { imageGenSkill } from './image-gen.skill';
import { ensureWhiteBackground } from '../image-postprocess';
import { analyzeListingProductSkill, type ListingProductAnalysis } from './analyze-listing-product.skill';

const schema = z.object({
  productImages: z.array(z.string()).min(1).max(6),
  brief: z.string().optional(),
  analysis: z.any().optional(),
  // Optional shot plan override (e.g. resume from remaining shots)
  shots: z.array(z.any()).optional(),
  count: z.number().int().min(1).max(8).optional(),
  aspectRatio: z.string().optional(),
  imageSize: z.enum(['1K', '2K', '4K']).optional(),
  model: z.string().optional(),
});

export type AmazonListingResult = {
  images: Array<{ url: string; title: string; shotId?: string }>;
  remainingShots?: any[];
};

const isClothingCategory = (category: string): boolean => {
  const c = String(category || '').toLowerCase();
  return (
    /clothing|apparel|garment|fashion|wear|outfit|shirt|t-?shirt|tee|hoodie|sweater|jacket|coat|pants|trousers|jeans|skirt|dress|blouse|top|bottom/.test(c) ||
    /服|衣|裙|裤|上衣|外套|卫衣|毛衣|衬衫|t恤|连衣裙|半身裙|牛仔/.test(category || '')
  );
};

const NEGATIVE = [
  'text',
  'watermark',
  'logo overlay',
  'QR code',
  'collage',
  'mosaic',
  'split-screen',
  'border',
  'badge',
  'price tag',
  'cartoon',
  'anime',
  'illustration',
  'CGI',
  '3d render',
  'over-stylized',
  'over-processed',
  'low resolution',
  'blurry',
  'deformed',
  'extra fingers',
  'bad anatomy',
].join(', ');

const normalizeAnalysis = (input: any): ListingProductAnalysis => {
  const a = (input || {}) as Partial<ListingProductAnalysis>;
  return {
    category: String(a.category || 'unknown'),
    productNameGuess: String(a.productNameGuess || ''),
    targetAudience: String(a.targetAudience || ''),
    useScenarios: Array.isArray(a.useScenarios) ? a.useScenarios.map((x) => String(x)).filter(Boolean).slice(0, 8) : [],
    priceTier: (a.priceTier === 'budget' || a.priceTier === 'mid' || a.priceTier === 'premium') ? a.priceTier : 'mid',
    keySpecs: Array.isArray(a.keySpecs) ? a.keySpecs.map((x) => String(x)).filter(Boolean).slice(0, 12) : [],
    differentiators: Array.isArray(a.differentiators) ? a.differentiators.map((x) => String(x)).filter(Boolean).slice(0, 12) : [],
    objections: Array.isArray(a.objections) ? a.objections.map((x) => String(x)).filter(Boolean).slice(0, 12) : [],
    recommendedLayoutApproach: String(a.recommendedLayoutApproach || ''),
    recommendedShotPlan: Array.isArray(a.recommendedShotPlan) ? (a.recommendedShotPlan as any[]) : [],
    assumptions: Array.isArray(a.assumptions) ? a.assumptions.map((x) => String(x)).filter(Boolean).slice(0, 12) : [],
  };
};

const buildPrompt = (analysis: ListingProductAnalysis, shot: any, brief: string) => {
  const restrictions = `no text, no watermark, no logo overlay, no QR code, no collage, no mosaic, no split-screen`;
  const isClothing = isClothingCategory(analysis.category);
  const amazonLook = `bright clean commercial product photography, accurate color, natural soft studio lighting, clean white balance, realistic materials, no heavy HDR, no dramatic shadows`;
  const amazonComplianceHero = shot?.shotId === 'hero'
    ? `Amazon main image compliance:
- Pure white background (#FFFFFF)
- Keep composition clean and distraction-free
- No props, no extra objects, no text/graphics
- Product is the clear hero and fills the frame appropriately
`
    : '';

  const clothingPolicy = isClothing
    ? `
Clothing policy (on-model):
- Generate a realistic human fashion model wearing the exact garment.
- Full body or 3/4 body framing (unless the shot explicitly asks for close-up detail).
- Keep garment silhouette, fabric texture, seams, neckline/hem/cuffs, and color EXACT.
- Do not invent extra logos/patterns not present in the reference.
`
    : '';
  return `You are an e-commerce commercial photographer and visual director.

Use the FIRST reference image as the product ground truth. Keep the exact product design, shape, materials, colors, and key details.

Platform style (Amazon-ready):
- ${amazonLook}
${amazonComplianceHero}${clothingPolicy}

Product strategy context:
- Category: ${analysis.category}
- Key differentiators: ${(analysis.differentiators || []).slice(0, 5).join('; ')}
- Objections: ${(analysis.objections || []).slice(0, 5).join('; ')}

Shot intent:
- Shot type: ${shot.shotId}
- Title: ${shot.title}
- Marketing goal: ${shot.marketingGoal}
- Key message: ${shot.keyMessage}

Must show:
- ${(shot.mustShow || []).join('\n- ')}

Composition:
${shot.composition}

Styling:
${shot.styling}

Background:
${shot.background}

User brief:
${brief || '(none)'}

Restrictions:
${restrictions}

Negative prompt:
${NEGATIVE}
`;
};

const buildClothingAnchorPrompt = (analysis: ListingProductAnalysis, brief: string) => {
  return `High-end Amazon-ready fashion studio photo.

Task: Generate ONE anchor image that defines a consistent model identity for the whole set.

Use reference[0] as the PRODUCT anchor. The garment must match reference exactly (color, material, construction, key details).

Requirements:
- A realistic fashion model wearing the exact garment
- Full body front view, centered, arms relaxed, no occlusion
- Pure solid white background (#FFFFFF), seamless sweep
- Accurate color, crisp fabric texture, clean edges, natural contact shadow only

User brief:
${brief || '(none)'}

Avoid:
${NEGATIVE}`;
};

export async function amazonListingSkill(raw: unknown): Promise<AmazonListingResult> {
  const params = schema.parse(raw);
  const productImages = params.productImages.slice(0, 6);
  const brief = String(params.brief || '').trim();
  const count = Math.max(1, Math.min(8, Number(params.count ?? 3)));
  const aspectRatio = String(params.aspectRatio || '3:4');
  const imageSize = (params.imageSize || '2K') as '1K' | '2K' | '4K';
  const model = String(params.model || 'nanobanana2');

  let analysis: ListingProductAnalysis;
  if (params.analysis) {
    analysis = normalizeAnalysis(params.analysis);
  } else {
    try {
      analysis = normalizeAnalysis(
        await analyzeListingProductSkill({
          productImages,
          brief,
          platform: 'amazon',
        }),
      );
    } catch (e) {
      console.warn('[amazonListingSkill] analyzeListingProduct failed, using fallback plan', e);
      analysis = normalizeAnalysis({ category: 'unknown', recommendedShotPlan: [] });
    }
  }

  const plan = Array.isArray(analysis?.recommendedShotPlan) ? analysis.recommendedShotPlan : [];
  const isClothing = isClothingCategory(analysis.category);
  const fallbackPlan = isClothing
    ? [
        { shotId: 'hero', title: '白底模特上身主图', marketingGoal: '合规与信任', keyMessage: '上身效果一眼清晰', mustShow: ['full garment silhouette on model', 'true color', 'clean edges'], composition: 'full body front view, centered, product fills frame appropriately', styling: 'minimal, natural pose, no props', background: 'pure white #FFFFFF' },
        { shotId: 'back', title: '背面展示', marketingGoal: '降低退货', keyMessage: '版型与背面细节清晰', mustShow: ['back view fit', 'neckline/hem/cuffs'], composition: 'full body back view, centered, hair not covering garment', styling: 'neutral pose, no props', background: 'pure white #FFFFFF' },
        { shotId: 'detail', title: '面料细节特写', marketingGoal: '证明质感', keyMessage: '面料/走线/细节可视化', mustShow: ['fabric texture', 'stitching', 'key construction detail'], composition: 'mid-shot or close-up detail, crisp focus, natural skin', styling: 'clean studio', background: 'pure white or very light neutral' },
      ]
    : [
        { shotId: 'hero', title: '白底主图', marketingGoal: '快速识别与合规', keyMessage: '核心卖点一眼读懂', mustShow: ['product silhouette', 'key detail'], composition: 'centered hero shot, clean negative space', styling: 'minimal props', background: 'pure white' },
        { shotId: 'detail', title: '细节证明', marketingGoal: '证明一个关键卖点', keyMessage: '材质/结构/功能可视化', mustShow: ['material texture', 'feature close-up'], composition: 'macro detail close-up, crisp focus', styling: 'clean studio', background: 'light neutral' },
        { shotId: 'lifestyle', title: '使用场景', marketingGoal: '回答适不适合我', keyMessage: '在真实场景中更可信', mustShow: ['in-use context', 'scale'], composition: 'natural lifestyle framing, product as hero', styling: 'appropriate scene props', background: 'realistic setting' },
      ];

  const overrideShots = Array.isArray((params as any).shots) ? (params as any).shots : [];
  const shotPool = (overrideShots.length > 0 ? overrideShots : (plan.length > 0 ? plan : fallbackPlan)).slice(0, count);
  const images: Array<{ url: string; title: string; shotId?: string }> = [];
  const producedShotIds = new Set<string>();

  // Clothing: create an on-model identity anchor to improve overall aesthetics and consistency.
  // This avoids the "floating product" look and fits Amazon apparel listing norms.
  const productRef = productImages[0];
  let clothingAnchorUrl: string | null = null;
  if (isClothing && productRef && !overrideShots.length) {
    try {
      const anchorUrlRaw = await imageGenSkill({
        prompt: buildClothingAnchorPrompt(analysis, brief),
        model,
        aspectRatio,
        imageSize,
        referenceImages: [productRef],
        referenceMode: 'product',
        referencePriority: 'first',
        referenceStrength: 0.92,
      } as any);
      clothingAnchorUrl = anchorUrlRaw || null;
    } catch (e) {
      console.warn('[amazonListingSkill] clothing anchor failed, continuing without anchor', e);
      clothingAnchorUrl = null;
    }
  }

  for (let i = 0; i < shotPool.length; i += 1) {
    const shot = shotPool[i];
    const prompt = buildPrompt(analysis, shot, brief);
    const urlRaw = await imageGenSkill({
      prompt,
      model,
      aspectRatio,
      imageSize,
      referenceImages: isClothing && clothingAnchorUrl
        ? [clothingAnchorUrl, productRef]
        : [productImages[0], ...productImages.slice(1)],
      referenceMode: isClothing && clothingAnchorUrl ? 'product-swap' : 'product',
      referencePriority: isClothing && clothingAnchorUrl ? 'all' : 'first',
      referenceStrength: isClothing && clothingAnchorUrl ? 0.92 : 0.88,
    } as any);
    if (!urlRaw) continue;
    let finalUrl = urlRaw;
    // White background post-process is safe for data:/blob: URLs. For remote URLs,
    // CORS/canvas taint can break the pipeline, so we best-effort it.
    try {
      if (typeof urlRaw === 'string' && (/^data:image\//i.test(urlRaw) || /^blob:/i.test(urlRaw))) {
        finalUrl = await ensureWhiteBackground(urlRaw);
      } else {
        finalUrl = urlRaw;
      }
    } catch (e) {
      console.warn('[amazonListingSkill] ensureWhiteBackground failed, using raw url', e);
      finalUrl = urlRaw;
    }
    const shotId = typeof shot?.shotId === 'string' ? shot.shotId : undefined;
    if (shotId) producedShotIds.add(shotId);
    images.push({ url: finalUrl, title: shot.title || `第 ${i + 1} 张`, shotId });
  }

  const remainingShots = shotPool.filter((s: any) => {
    const sid = typeof s?.shotId === 'string' ? s.shotId : '';
    if (!sid) return false;
    return !producedShotIds.has(sid);
  });

  return {
    images,
    remainingShots: remainingShots.length > 0 ? remainingShots : undefined,
  };
}
