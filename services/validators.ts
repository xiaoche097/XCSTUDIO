import { generateJsonResponse, getBestModelId } from './gemini';

type ValidationResult = {
  pass: boolean;
  reasons: string[];
  suggestedFix?: string;
};

export type { ValidationResult };

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
    reader.onerror = () => reject(new Error('image read failed'));
    reader.readAsDataURL(blob);
  });
  const m = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!m) throw new Error('convert image failed');
  return { inlineData: { mimeType: m[1], data: m[2] } };
};

function parseValidation(text: string): ValidationResult {
  try {
    const json = JSON.parse(text || '{}');
    return {
      pass: !!json.pass,
      reasons: Array.isArray(json.reasons) ? json.reasons : [],
      suggestedFix: typeof json.suggestedFix === 'string' ? json.suggestedFix : undefined,
    };
  } catch {
    return {
      pass: false,
      reasons: ['质检响应解析失败'],
      suggestedFix: '请在 prompt 中强调一致性并重试',
    };
  }
}

export async function validateModelIdentity(anchorSheetUrl: string, generatedUrl: string): Promise<ValidationResult> {
  const [anchor, generated] = await Promise.all([toInlinePart(anchorSheetUrl), toInlinePart(generatedUrl)]);
  const result = await generateJsonResponse({
    model: getBestModelId('text'),
    operation: 'validateModelIdentity',
    temperature: 0.1,
    parts: [
      { text: '你是图像一致性质检器。比较两张图人物是否为同一模特，仅返回 JSON: {"pass":boolean,"reasons":string[],"suggestedFix":string}。重点看脸部骨相、五官比例、肤色和发型。' },
      anchor,
      { text: '上面是模特锚点板。' },
      generated,
      { text: '上面是待检图片。若有明显差异则 pass=false，并给出简短修正建议。' },
    ],
  });
  return parseValidation(result.text);
}

export async function validateProductConsistency(
  productAnchorUrl: string,
  generatedUrl: string,
  anchorDescription: string,
  forbiddenChanges: string[],
): Promise<ValidationResult> {
  const [anchor, generated] = await Promise.all([toInlinePart(productAnchorUrl), toInlinePart(generatedUrl)]);
  const result = await generateJsonResponse({
    model: getBestModelId('text'),
    operation: 'validateProductConsistency',
    temperature: 0.1,
    parts: [
      {
        text:
          `你是电商服装一致性质检器。比较产品锚点图与待检图，严格判断产品是否一致。\n锚点描述: ${anchorDescription}\n禁止变化: ${forbiddenChanges.join('；')}\n仅返回 JSON: {"pass":boolean,"reasons":string[],"suggestedFix":string}`,
      },
      anchor,
      { text: '上面是产品锚点图。' },
      generated,
      { text: '上面是待检图。若版型、结构线、颜色块、材质纹理有变化则 pass=false。' },
    ],
  });
  return parseValidation(result.text);
}

export async function validateApprovedAnchorConsistency(
  approvedUrl: string,
  candidateUrl: string,
  summaryText: string,
  forbiddenChanges: string[],
): Promise<ValidationResult> {
  const [anchor, generated] = await Promise.all([toInlinePart(approvedUrl), toInlinePart(candidateUrl)]);
  const result = await generateJsonResponse({
    model: getBestModelId('text'),
    operation: 'validateApprovedAnchorConsistency',
    temperature: 0.1,
    parts: [
      {
        text:
          `你是通用设计一致性质检器。比较已批准锚点图与待检图，判断是否仍属于同一设计连续版本。\n锚点摘要: ${summaryText || '无'}\n禁止变化: ${(forbiddenChanges || []).join('；') || '无'}\n仅返回 JSON: {"pass":boolean,"reasons":string[],"suggestedFix":string}`,
      },
      anchor,
      { text: '上面是已批准的设计锚点图。' },
      generated,
      { text: '上面是待检图。若主体身份、logo位置、关键配色、结构或文案布局明显偏离，则 pass=false。' },
    ],
  });
  return parseValidation(result.text);
}
