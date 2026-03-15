import { z } from 'zod';
import { getBestModelId, generateJsonResponse } from '../gemini';

const toInlinePart = async (url: string): Promise<{ inlineData: { mimeType: string; data: string } }> => {
  if (/^data:image\/.+;base64,/.test(url)) {
    const m = url.match(/^data:(.+);base64,(.+)$/);
    if (!m) throw new Error('invalid data url');
    return { inlineData: { mimeType: m[1], data: m[2] } };
  }
  const res = await fetch(url);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('file reader failed'));
    reader.readAsDataURL(blob);
  });
  const m = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!m) throw new Error('convert image failed');
  return { inlineData: { mimeType: m[1], data: m[2] } };
};

const schema = z.object({
  productImages: z.array(z.string()).min(1).max(6),
  brief: z.string().optional(),
  platform: z.enum(['amazon']).default('amazon'),
});

export type ListingProductAnalysis = {
  category: string;
  productNameGuess: string;
  targetAudience: string;
  useScenarios: string[];
  priceTier: 'budget' | 'mid' | 'premium';
  keySpecs: string[];
  differentiators: string[];
  objections: string[];
  recommendedLayoutApproach: string;
  recommendedShotPlan: Array<{
    shotId: string;
    title: string;
    marketingGoal: string;
    keyMessage: string;
    mustShow: string[];
    composition: string;
    styling: string;
    background: string;
  }>;
  assumptions: string[];
};

// Lightweight analysis step: returns structured JSON for later generation.
// Uses only the first product image as the main visual anchor.
export async function analyzeListingProductSkill(raw: unknown): Promise<ListingProductAnalysis> {
  const params = schema.parse(raw);
  const brief = String(params.brief || '').trim();
  const productImages = params.productImages.slice(0, 6);

  const prompt = `You are an e-commerce listing strategist.

Analyze the product from the provided image(s) and the user's brief.

Return ONLY valid JSON with fields:
{
  "category": "",
  "productNameGuess": "",
  "targetAudience": "",
  "useScenarios": ["", ""],
  "priceTier": "budget|mid|premium",
  "keySpecs": ["", ""],
  "differentiators": ["", "", ""],
  "objections": ["", ""],
  "recommendedLayoutApproach": "",
  "recommendedShotPlan": [
    {
      "shotId": "hero|detail|lifestyle|infographic|comparison|howto",
      "title": "",
      "marketingGoal": "",
      "keyMessage": "",
      "mustShow": ["", ""],
      "composition": "",
      "styling": "",
      "background": ""
    }
  ],
  "assumptions": ["", ""]
}

Platform: Amazon.
User brief: ${brief || '(none)'}

Guidelines:
- The shot plan must be adaptive (do NOT use a fixed template).
- Include at least 5 shotPlan items if possible.
`;

  const inline = await Promise.all(productImages.slice(0, 2).map((u) => toInlinePart(u)));
  const parts: any[] = [{ text: prompt }];
  inline.forEach((p, idx) => {
    parts.push({ text: `Product image #${idx}` });
    parts.push(p);
  });

  const model = getBestModelId('text');
  const res = await generateJsonResponse({
    model,
    parts,
    temperature: 0.2,
    operation: 'analyzeListingProduct',
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(String(res.text || '{}'));
  } catch {
    parsed = {};
  }
  return parsed as ListingProductAnalysis;
}
