/**
 * 电商套图变体定义（共享模块）
 * 被 poster、campaign、package 等智能体复用
 */

export interface EcommerceVariant {
    title: string;
    suffix: string;
}

export const ECOMMERCE_VARIANTS: EcommerceVariant[] = [
    { title: '产品信息图', suffix: ', clean white background, product infographic with feature callout annotations, e-commerce listing style, professional, 8K' },
    { title: '多角度展示', suffix: ', studio product photography, 3/4 angle view, even soft lighting, commercial quality, white gradient background, 8K' },
    { title: '场景应用图', suffix: ', lifestyle photography, product in natural real-use setting, warm natural lighting, editorial quality, aspirational, 8K' },
    { title: '细节特写图', suffix: ', macro product photography, extreme close-up of texture and material detail, sharp focus, studio lighting, premium quality, 8K' },
    { title: '尺寸包装图', suffix: ', product with size reference objects, flat lay composition, what-is-in-the-box layout, clean informative style, 8K' },
];

/**
 * 基于基础 prompt 和 skillCall 参数，生成电商套图 proposals
 */
export function buildEcommerceProposals(
    basePrompt: string,
    baseParams: { aspectRatio?: string; model?: string },
    count: number
): any[] {
    const proposals = [];
    for (let i = 0; i < count && i < ECOMMERCE_VARIANTS.length; i++) {
        proposals.push({
            id: String(i + 1),
            title: ECOMMERCE_VARIANTS[i].title,
            description: ECOMMERCE_VARIANTS[i].title,
            skillCalls: [{
                skillName: 'generateImage',
                params: {
                    prompt: basePrompt + ECOMMERCE_VARIANTS[i].suffix,
                    aspectRatio: baseParams.aspectRatio || '1:1',
                    model: baseParams.model || 'nanobanana2'
                }
            }]
        });
    }
    return proposals;
}
