import { generateImageWithProvider } from '../providers';
import { ImageGenSkillParams } from '../../types/skill.types';

export async function imageGenSkill(params: ImageGenSkillParams): Promise<string | null> {
  let enhancedPrompt = params.prompt;
  const normalizedReferenceImage =
    params.referenceImage ||
    params.referenceImageUrl ||
    params.reference_image_url ||
    params.initImage ||
    params.init_image;

  if (params.brandContext?.colors?.length) {
    enhancedPrompt += `, color palette: ${params.brandContext.colors.join(', ')}`;
  }

  if (params.brandContext?.style) {
    enhancedPrompt += `, style: ${params.brandContext.style}`;
  }

  if (params.consistencyContext?.referenceSummary) {
    enhancedPrompt += `\n\nConsistency anchor: ${params.consistencyContext.referenceSummary}`;
  }

  if (params.consistencyContext?.forbiddenChanges?.length) {
    enhancedPrompt += `\nDo not change: ${params.consistencyContext.forbiddenChanges.join(', ')}`;
  }

  return generateImageWithProvider(
    {
      prompt: enhancedPrompt,
      aspectRatio: params.aspectRatio,
      imageSize: params.imageSize || '2K',
      referenceImage: normalizedReferenceImage,
      referenceImages: params.referenceImages,
      referenceStrength: params.referenceStrength,
      referencePriority: params.referencePriority,
      referenceMode: params.referenceMode,
    },
    params.model
  );
}
