import { getClient } from '../gemini';
import { AgentRegistry, XcaiPackName } from '../agents/registry';

type OneclickOutputsConfig = {
  startup_pack?: boolean;
  p0_strategy?: boolean;
  p1_visual?: boolean;
  p2_copy?: boolean;
  p3_main_image?: boolean;
  p4_secondary_images?: boolean;
  p5_aplus?: boolean;
  final_image_generation?: boolean;
};

type OneclickConfig = {
  mode?: 'standard' | 'fast';
  outputs?: OneclickOutputsConfig;
};

export interface XcaiOneclickParams {
  input: {
    message: string;
    referenceImages?: string[];
    attachments?: string[];
  };
  config?: OneclickConfig;
}

export interface XcaiOneclickResult {
  startup?: string;
  p0?: string;
  p1?: string;
  p2?: string;
  p3?: string;
  p4?: string;
  p5?: string;
}

const DEFAULT_OUTPUTS: Required<OneclickOutputsConfig> = {
  startup_pack: true,
  p0_strategy: true,
  p1_visual: true,
  p2_copy: true,
  p3_main_image: true,
  p4_secondary_images: true,
  p5_aplus: true,
  final_image_generation: false,
};

const tryParseJson = (raw: string): any => {
  const cleaned = raw.trim();
  const block = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const payload = block ? block[1].trim() : cleaned;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

const buildStagePrompt = (
  core: string,
  pack: string,
  stageName: string,
  stageInput: Record<string, unknown>
): string => {
  return [
    core,
    '',
    pack,
    '',
    `【当前阶段】${stageName}`,
    '【输入数据(JSON)】',
    JSON.stringify(stageInput, null, 2),
    '',
    '请严格输出 JSON，结构如下：',
    '{"stage":"string","confirmed":["..."],"pending":["..."],"next":["..."],"content":"markdown"}',
  ].join('\n');
};

const renderStage = (title: string, value?: string): string => {
  if (!value) return '';
  return `## ${title}\n${value.trim()}\n`;
};

async function runStage(packName: XcaiPackName, stageName: string, stageInput: Record<string, unknown>): Promise<string> {
  const skillDef = AgentRegistry['xcai-oneclick'];
  const prompt = buildStagePrompt(skillDef.core, skillDef.packs[packName], stageName, stageInput);

  const client = getClient() as any;
  const model = 'gemini-3-flash-preview';
  const res = await client.models.generateContent({
    model,
    contents: { parts: [{ text: prompt }] },
    config: {
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  });

  const text = (res?.text || '').trim();
  const parsed = tryParseJson(text);
  if (parsed && typeof parsed.content === 'string') {
    return parsed.content;
  }
  return text;
}

export async function runXcAiOneclick(params: XcaiOneclickParams): Promise<XcaiOneclickResult> {
  const outputs = { ...DEFAULT_OUTPUTS, ...(params.config?.outputs || {}) };
  const baseInput = {
    userRequest: params.input.message,
    referenceImages: params.input.referenceImages || params.input.attachments || [],
    mode: params.config?.mode || 'standard',
  };

  const result: XcaiOneclickResult = {};

  if (outputs.startup_pack) {
    result.startup = await runStage('STARTUP_PACK', 'Startup', baseInput);
  }

  if (outputs.p0_strategy) {
    result.p0 = await runStage('P0_PACK', 'P0', { ...baseInput, startup: result.startup || '' });
  }

  if (outputs.p1_visual) {
    result.p1 = await runStage('P1_PACK', 'P1', {
      ...baseInput,
      startup: result.startup || '',
      p0: result.p0 || '',
    });
  }

  if (outputs.p2_copy) {
    result.p2 = await runStage('P2_PACK', 'P2', {
      ...baseInput,
      startup: result.startup || '',
      p0: result.p0 || '',
    });
  }

  if (outputs.p3_main_image) {
    result.p3 = await runStage('P3_PACK', 'P3', {
      ...baseInput,
      p0: result.p0 || '',
      p1: result.p1 || '',
      p2: result.p2 || '',
    });
  }

  if (outputs.p4_secondary_images) {
    result.p4 = await runStage('P4_PACK', 'P4', {
      ...baseInput,
      p0: result.p0 || '',
      p1: result.p1 || '',
      p2: result.p2 || '',
    });
  }

  if (outputs.p5_aplus) {
    result.p5 = await runStage('P5_PACK', 'P5', {
      ...baseInput,
      p0: result.p0 || '',
      p1: result.p1 || '',
      p2: result.p2 || '',
    });
  }

  return result;
}

export function formatXcaiOneclickResult(result: XcaiOneclickResult): string {
  return [
    '# SKYSPER One-Click 结果',
    renderStage('Startup 启动包', result.startup),
    renderStage('P0 策略', result.p0),
    renderStage('P1 视觉', result.p1),
    renderStage('P2 文案', result.p2),
    renderStage('P3 主图', result.p3),
    renderStage('P4 副图', result.p4),
    renderStage('P5 A+', result.p5),
  ]
    .filter(Boolean)
    .join('\n');
}
