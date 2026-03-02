import { imageGenSkill } from './image-gen.skill';
import { videoGenSkill } from './video-gen.skill';
import { textExtractSkill } from './text-extract.skill';
import { regionAnalyzeSkill } from './region-analyze.skill';
import { copyGenSkill } from './copy-gen.skill';
import { smartEditSkill } from './smart-edit.skill';
import { exportSkill } from './export.skill';
import { touchEditSkill } from './touch-edit.skill';
import { runXcAiOneclick, formatXcaiOneclickResult } from './xcai-oneclick.skill';

export { imageGenSkill, videoGenSkill, textExtractSkill, regionAnalyzeSkill, copyGenSkill, smartEditSkill, exportSkill, touchEditSkill, runXcAiOneclick };

export const AVAILABLE_SKILLS = {
  generateImage: imageGenSkill,
  generateVideo: videoGenSkill,
  extractText: textExtractSkill,
  analyzeRegion: regionAnalyzeSkill,
  generateCopy: copyGenSkill,
  smartEdit: smartEditSkill,
  export: exportSkill,
  touchEdit: touchEditSkill,
  xcaiOneclick: runXcAiOneclick
};

export async function executeSkill(skillName: string, params: any): Promise<any> {
  const skill = AVAILABLE_SKILLS[skillName as keyof typeof AVAILABLE_SKILLS];
  if (!skill) {
    throw new Error(`Skill ${skillName} not found`);
  }
  const result = await skill(params);

  if (skillName === 'xcaiOneclick') {
    return formatXcaiOneclickResult(result as any);
  }

  return result;
}
