import { generateImage, refineImagePrompt } from '../gemini';

export interface SmartEditParams {
  sourceUrl: string;
  editType: 'background-remove' | 'object-remove' | 'upscale' | 'style-transfer' | 'extend';
  parameters?: Record<string, any>;
}

export async function smartEditSkill(params: SmartEditParams): Promise<string | null> {
  const editPrompts: Record<string, string> = {
    'background-remove': 'Remove the background from this image, keep only the main subject with transparent background',
    'object-remove': `Remove ${params.parameters?.object || 'the specified object'} from this image seamlessly`,
    'upscale': 'Enhance and upscale this image to higher resolution while preserving all details',
    'style-transfer': `Apply ${params.parameters?.style || 'artistic'} style to this image`,
    'extend': `Extend this image ${params.parameters?.direction || 'outward'} naturally`
  };

  const promptTemplate = params.parameters?.prompt || editPrompts[params.editType] || 'Edit this image';

  try {
    let finalPrompt = promptTemplate;

    // Determine the model to use - upscale usually works best with the Pro image model
    const generationModel = params.parameters?.model || 'Nano Banana Pro';

    // 2-Step Generation: If the prompt looks like a framework (meta-prompt), refine it first via Flash
    const isMetaPrompt = promptTemplate.includes('【') || promptTemplate.includes('══');
    if (isMetaPrompt) {
      console.log(`[smartEditSkill] Detected meta-prompt framework, refining with Flash...`);
      try {
        const refined = await refineImagePrompt(params.sourceUrl, promptTemplate);
        if (refined) {
          finalPrompt = refined;
          console.log(`[smartEditSkill] Prompt refined successfully.`);
        }
      } catch (refineErr) {
        console.warn(`[smartEditSkill] Prompt refinement failed, using raw template:`, refineErr);
      }
    }

    // Use the robust generateImage helper instead of raw SDK call
    const result = await generateImage({
      prompt: finalPrompt,
      model: generationModel,
      aspectRatio: '1:1', // Default for smart edit results, unless specified
      imageSize: params.editType === 'upscale' ? (params.parameters?.factor >= 4 ? '4K' : '2K') : '1K',
      referenceImage: params.sourceUrl
    });

    return result;
  } catch (error) {
    console.error('Smart edit error:', error);
    return null;
  }
}
