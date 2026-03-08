import { editImage, getClient } from '../gemini';
import { TouchEditSkillParams } from '../../types/skill.types';

export async function touchEditSkill(params: TouchEditSkillParams): Promise<{
  analysis: string;
  editedImage: string | null;
}> {
  const matches = params.imageData.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid image data');

  try {
    // Step 1: Analyze the selected region
    const analysisResponse = await getClient().models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: matches[1], data: matches[2] } },
          {
            text: `The user selected a region at (${params.regionX}, ${params.regionY}) with size ${params.regionWidth}x${params.regionHeight}. Analyze what's in this region and describe it briefly.`
          }
        ]
      }
    });

    const analysis = analysisResponse.text || 'Unable to analyze region';

    // Step 2: Apply the edit instruction
    if (!params.editInstruction) {
      return { analysis, editedImage: null };
    }

    const editedImage = await editImage({
      sourceImage: params.imageData,
      prompt: `${params.preservePrompt || 'Preserve overall composition, identity, lighting, materials, text layout, and all untouched regions.'} Edit only the target region at position (${params.regionX}, ${params.regionY}), size ${params.regionWidth}x${params.regionHeight}. Instruction: ${params.editInstruction}`,
      model: 'gemini-3-pro-image-preview',
      aspectRatio: params.aspectRatio || '1:1',
    });

    return { analysis, editedImage: editedImage || null };
  } catch (error) {
    console.error('Touch edit error:', error);
    throw error;
  }
}
