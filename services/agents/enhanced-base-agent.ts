/**
 * 增强型基础智能体
 * 使用Skills系统统一处理任务，提供完善的错误处理和状态管理
 */

import { Chat, Type } from '@google/genai';
import { createChatSession, getApiKey, getClient } from '../gemini';
import {
    AgentTask,
    AgentInfo,
    ProjectContext,
    GeneratedAsset
} from '../../types/agent.types';
import { executeSkill, AVAILABLE_SKILLS } from '../skills';
import { errorHandler, ErrorType, AppError } from '../../utils/error-handler';

// 带指数退避的重试工具（用于 analyzeAndPlan 等内部调用）
const retryAsync = async <T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delay: number = 1500
): Promise<T> => {
    try {
        return await fn();
    } catch (error: any) {
        const code = error.status || error.code || 0;
        const msg = error.message || '';
        const isRetryable = [500, 503, 429].includes(code) ||
            msg.includes('overloaded') || msg.includes('UNAVAILABLE') ||
            msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Internal Server Error') ||
            msg.includes('fetch failed');
        if (retries > 0 && isRetryable) {
            const wait = code === 429 ? Math.max(delay, 3000) : delay;
            console.warn(`[analyzeAndPlan 重试] 错误码=${code}, ${wait}ms 后重试 (剩余 ${retries} 次)`);
            await new Promise(r => setTimeout(r, wait));
            return retryAsync(fn, retries - 1, wait * 2);
        }
        throw error;
    }
};

// 限流并发执行器：限制最多 concurrency 个任务同时执行
const runWithConcurrency = async <T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<PromiseSettledResult<T>[]> => {
    const results: PromiseSettledResult<T>[] = new Array(tasks.length);
    let index = 0;

    const worker = async () => {
        while (index < tasks.length) {
            const i = index++;
            try {
                results[i] = { status: 'fulfilled', value: await tasks[i]() };
            } catch (error: any) {
                results[i] = { status: 'rejected', reason: error };
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
    return results;
};

/**
 * 任务执行配置
 */
interface ExecutionConfig {
    maxRetries: number;
    timeout: number;
    enableCache: boolean;
}

const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
    maxRetries: 0,
    timeout: 600000,  // 10 分钟（图片生成 + 分析可能需要较长时间）
    enableCache: true
};

const SKILL_TIMEOUT = 120_000; // 单个 skill 最多 120 秒

export abstract class EnhancedBaseAgent {
    protected chat: Chat | null = null;
    protected executionCache: Map<string, any> = new Map();

    abstract get agentInfo(): AgentInfo;
    abstract get systemPrompt(): string;
    abstract get preferredSkills(): string[]; // 智能体偏好的技能

    /**
     * 初始化智能体
     */
    async initialize(context: ProjectContext): Promise<void> {
        try {
            this.chat = createChatSession(
                'gemini-3-pro-preview',
                [],
                this.systemPrompt
            );
            console.log(`[${this.agentInfo.id}] Initialized successfully`);
        } catch (error) {
            throw errorHandler.handleError(error, {
                agent: this.agentInfo.id,
                function: 'initialize'
            });
        }
    }

    /**
     * 执行任务（核心方法）
     */
    async execute(
        task: AgentTask,
        config: Partial<ExecutionConfig> = {}
    ): Promise<AgentTask> {
        const finalConfig = { ...DEFAULT_EXECUTION_CONFIG, ...config };
        const taskId = task.id;

        try {
            console.log(`[${this.agentInfo.id}] Starting task execution:`, taskId);

            // 更新任务状态
            task = this.updateTaskStatus(task, 'analyzing');

            // 验证输入
            this.validateInput(task);

            // 检查缓存
            if (finalConfig.enableCache) {
                const cached = this.getCachedResult(task);
                if (cached) {
                    console.log(`[${this.agentInfo.id}] Using cached result`);
                    return this.updateTaskStatus(cached, 'completed');
                }
            }

            // 使用错误处理包装器执行
            const result = await errorHandler.withRetry(
                () => this.executeWithTimeout(task, finalConfig.timeout),
                {
                    maxRetries: finalConfig.maxRetries,
                    delay: 1000,
                    backoff: false,
                    context: {
                        agent: this.agentInfo.id,
                        taskId,
                        taskType: task.input.message.substring(0, 50)
                    }
                }
            );

            // 缓存结果
            if (finalConfig.enableCache && result.status === 'completed') {
                this.cacheResult(task, result);
            }

            console.log(`[${this.agentInfo.id}] Task completed:`, taskId);
            return result;
        } catch (error) {
            const appError = error as AppError;
            console.error(`[${this.agentInfo.id}] Task failed:`, appError.message);

            return {
                ...task,
                status: 'failed',
                output: {
                    message: `执行失败: ${appError.message}`,
                    error: appError
                },
                updatedAt: Date.now()
            };
        }
    }

    /**
     * 带超时的执行
     */
    private async executeWithTimeout(
        task: AgentTask,
        timeout: number
    ): Promise<AgentTask> {
        return Promise.race([
            this.executeInternal(task),
            new Promise<AgentTask>((_, reject) =>
                setTimeout(
                    () => reject(
                        errorHandler.createError(
                            ErrorType.AGENT,
                            '任务执行超时',
                            undefined,
                            { taskId: task.id, timeout },
                            true
                        )
                    ),
                    timeout
                )
            )
        ]);
    }

    /**
     * 内部执行逻辑（使用Skills）
     */
    private async executeInternal(task: AgentTask): Promise<AgentTask> {
        const { message, context } = task.input;

        // 1. 分析任务并生成执行计划
        const plan = await this.analyzeAndPlan(message, context, task.input.attachments, task.input.metadata);

        console.log(`[${this.agentInfo.id}] Plan received:`, {
            hasProposals: !!(plan.proposals && plan.proposals.length),
            proposalCount: plan.proposals?.length || 0,
            hasSkillCalls: !!(plan.skillCalls && plan.skillCalls.length),
            skillCallCount: plan.skillCalls?.length || 0,
            proposalSkillCalls: plan.proposals?.map((p: any) => p.skillCalls?.length || 0)
        });

        // 2. 检测用户是否请求了多张图
        const multiImageMatch = message.match(/(\d+)\s*张|(\d+)\s*images?|一套|一组|系列/i);
        const requestedCount = multiImageMatch ? (parseInt(multiImageMatch[1] || multiImageMatch[2]) || 5) : 0;

        // 3. 如果有 proposals 且 proposals 内含 skillCalls，自动执行
        let effectiveProposals = plan.proposals && plan.proposals.length > 0 ? [...plan.proposals] : [];

        // 3.5 修复: AI 可能用不同的字段名返回 skillCalls（如 skills, calls, actions 等）
        for (const p of effectiveProposals) {
            if (!p.skillCalls || p.skillCalls.length === 0) {
                // 尝试常见的别名
                const aliases = ['skills', 'calls', 'actions', 'skill_calls', 'skillCall', 'tool_calls'];
                for (const alias of aliases) {
                    if (p[alias] && Array.isArray(p[alias]) && p[alias].length > 0) {
                        console.log(`[${this.agentInfo.id}] Fixed proposal "${p.title}": renamed "${alias}" -> "skillCalls"`);
                        p.skillCalls = p[alias];
                        break;
                    }
                }
            }
        }

        // 4. 如果 proposals 为空或 proposals 内没有 skillCalls，但顶层有 skillCalls，尝试修复
        const proposalsHaveSkills = effectiveProposals.some((p: any) => p.skillCalls && p.skillCalls.length > 0);

        if (!proposalsHaveSkills && plan.skillCalls && plan.skillCalls.length > 0) {
            console.log(`[${this.agentInfo.id}] Proposals missing skillCalls, restructuring from top-level skillCalls`);

            if (requestedCount > 1 && plan.skillCalls.length === 1 && !['cameron', 'vireo', 'motion'].includes(this.agentInfo.id)) {
                // 用户要求多张图但只有1个 skillCall — 需要基于原始 prompt 生成多个变体（仅限产品设计类智能体）
                const baseCall = plan.skillCalls[0];
                const basePrompt = baseCall.params?.prompt || '';
                const ecommerceVariants = [
                    { title: '产品信息图', suffix: ', clean white background, product infographic with feature callout annotations, e-commerce listing style, professional, 8K' },
                    { title: '多角度展示', suffix: ', studio product photography, 3/4 angle view, even soft lighting, commercial quality, white gradient background, 8K' },
                    { title: '场景应用图', suffix: ', lifestyle photography, product in natural real-use setting, warm natural lighting, editorial quality, aspirational, 8K' },
                    { title: '细节特写图', suffix: ', macro product photography, extreme close-up of texture and material detail, sharp focus, studio lighting, premium quality, 8K' },
                    { title: '尺寸包装图', suffix: ', product with size reference objects, flat lay composition, what-is-in-the-box layout, clean informative style, 8K' },
                ];

                effectiveProposals = [];
                for (let i = 0; i < requestedCount && i < ecommerceVariants.length; i++) {
                    effectiveProposals.push({
                        id: String(i + 1),
                        title: ecommerceVariants[i].title,
                        description: ecommerceVariants[i].title,
                        skillCalls: [{
                            skillName: 'generateImage',
                            params: {
                                prompt: basePrompt + ecommerceVariants[i].suffix,
                                aspectRatio: baseCall.params?.aspectRatio || '1:1',
                                model: baseCall.params?.model || 'Nano Banana Pro'
                            }
                        }]
                    });
                }
                console.log(`[${this.agentInfo.id}] Created ${effectiveProposals.length} variant proposals from single skillCall`);
            } else {
                // 将每个顶层装成一个 proposal
                effectiveProposals = plan.skillCalls.map((call: any, idx: number) => ({
                    id: String(idx + 1),
                    title: `方案 ${idx + 1}`,
                    description: call.params?.prompt?.substring(0, 80) || '',
                    skillCalls: [call]
                }));
            }
        }

        // 4.5 最后的兜底: proposals 有数据但 skillCalls 仍然为空 — 从 proposal 的 prompt 字段自动构建
        const stillNoSkills = !effectiveProposals.some((p: any) => p.skillCalls && p.skillCalls.length > 0);
        if (stillNoSkills && effectiveProposals.length > 0) {
            console.warn(`[${this.agentInfo.id}] Proposals exist but ALL lack skillCalls — auto-building from proposal data`);
            console.log(`[${this.agentInfo.id}] Raw proposal keys:`, effectiveProposals.map((p: any) => Object.keys(p)));

            for (const p of effectiveProposals) {
                // 尝试从 proposal 内提取 prompt（AI 可能把 prompt 直接放到 proposal 顶层）
                const prompt = p.prompt || p.imagePrompt || p.image_prompt || p.params?.prompt || '';
                const model = p.model || p.params?.model || 'Nano Banana Pro';
                const ratio = p.aspectRatio || p.aspect_ratio || p.ratio || p.params?.aspectRatio || '1:1';

                if (prompt) {
                    p.skillCalls = [{
                        skillName: 'generateImage',
                        params: { prompt, model, aspectRatio: ratio }
                    }];
                    console.log(`[${this.agentInfo.id}] Auto-built skillCall for "${p.title}" from prompt field`);
                }
            }

            // 如果连 prompt 字段也没有，从 description 或 title 生成
            const stillEmpty = !effectiveProposals.some((p: any) => p.skillCalls && p.skillCalls.length > 0);
            if (stillEmpty) {
                console.warn(`[${this.agentInfo.id}] No prompt field found — building from description`);
                for (const p of effectiveProposals) {
                    const fallbackPrompt = p.description || p.title || message;
                    if (fallbackPrompt) {
                        p.skillCalls = [{
                            skillName: 'generateImage',
                            params: {
                                prompt: fallbackPrompt,
                                model: 'Nano Banana Pro',
                                aspectRatio: '1:1'
                            }
                        }];
                    }
                }
            }
        }

        // 5.5 如果 AI 选择对话而非直接生成（proposals 为空但有 message，且不是被强制补充skillCall的），返回对话响应
        if (effectiveProposals.length === 0 && plan.message && !plan.skillCalls?.length && !task.input.metadata?.forceSkills) {
            return {
                ...task,
                status: 'completed',
                output: {
                    message: plan.message,
                    analysis: plan.analysis,
                    proposals: [],
                    assets: [],
                    adjustments: plan.suggestions || []
                },
                updatedAt: Date.now()
            };
        }

        // 5. 并行执行所有 proposals 的 skillCalls（大幅提速）
        if (effectiveProposals.length > 0) {
            const generatedAssets: GeneratedAsset[] = [];

            // 更新状态为 executing（让 UI 显示"生成中"而非"分析中"）
            task = this.updateTaskStatus(task, 'executing');

            const proposalsWithSkills = effectiveProposals.filter(
                (p: any) => p.skillCalls && Array.isArray(p.skillCalls) && p.skillCalls.length > 0
            );

            console.log(`[${this.agentInfo.id}] Executing ${proposalsWithSkills.length} proposals (max 2 concurrent)`);

            // 限流并发执行（最多 2 个同时请求，避免触发 API 限流）
            const taskFns = proposalsWithSkills.map((proposal: any) => async () => {
                console.log(`[${this.agentInfo.id}] Executing proposal "${proposal.title}" with ${proposal.skillCalls.length} skill calls`);
                const results = await this.executeSkills(proposal.skillCalls, task);
                const assets = this.extractAssets(results);
                if (assets.length > 0) {
                    proposal.generatedUrl = assets[0].url;
                }
                return assets;
            });
            const allResults = await runWithConcurrency(taskFns, 2);

            // 收集所有成功的结果
            for (const result of allResults) {
                if (result.status === 'fulfilled') {
                    generatedAssets.push(...(result.value as GeneratedAsset[]));
                } else {
                    console.warn(`[${this.agentInfo.id}] Proposal execution failed:`, result.reason);
                }
            }

            console.log(`[${this.agentInfo.id}] Total generated assets: ${generatedAssets.length}`);

            return {
                ...task,
                status: 'completed',
                output: {
                    message: plan.analysis || '已为您生成设计方案',
                    analysis: plan.analysis,
                    proposals: effectiveProposals,
                    assets: generatedAssets,
                    adjustments: this.getAdjustments(message, effectiveProposals)
                },
                updatedAt: Date.now()
            };
        }

        // 5.5 如果 AI 选择对话而非直接生成（proposals 为空但有 message），返回对话响应
        // 这允许智能体（如 Cameron）先询问用户偏好，而不是直接跳入生成
        if (effectiveProposals.length === 0 && plan.message && (!plan.skillCalls || plan.skillCalls.length === 0)) {
            return {
                ...task,
                status: 'completed',
                output: {
                    message: plan.message,
                    analysis: plan.analysis,
                    proposals: [],
                    assets: []
                },
                updatedAt: Date.now()
            };
        }

        // 6. Fallback: 执行顶层 Skills（无 proposals 的情况）
        let fallbackSkillCalls = plan.skillCalls || [];

        // 6.5 Fallback 兜底: 如果 Plan 中有 prompt 但没有 skillCalls，自动构建
        if (fallbackSkillCalls.length === 0) {
            const planPrompt = plan.prompt || plan.imagePrompt || plan.image_prompt || '';
            if (planPrompt) {
                console.log(`[${this.agentInfo.id}] Fallback: building skillCall from plan.prompt`);
                fallbackSkillCalls = [{
                    skillName: 'generateImage',
                    params: {
                        prompt: planPrompt,
                        model: plan.model || 'Nano Banana Pro',
                        aspectRatio: plan.aspectRatio || plan.aspect_ratio || '1:1'
                    }
                }];
            } else {
                console.warn(`[${this.agentInfo.id}] No skillCalls, no proposals with skills, no prompt found. Plan keys:`, Object.keys(plan));
            }
        }

        const skillResults = await this.executeSkills(fallbackSkillCalls, task);

        // 7. 提取生成的资产
        const assets = this.extractAssets(skillResults);

        // 8. 组装最终输出
        return {
            ...task,
            status: 'completed',
            output: {
                message: plan.message || plan.concept || '任务已完成',
                analysis: plan.analysis,
                proposals: effectiveProposals,
                assets,
                skillCalls: skillResults
            },
            updatedAt: Date.now()
        };
    }

    /**
     * 分析任务并制定执行计划
     */
    private async analyzeAndPlan(
        message: string,
        context: ProjectContext,
        attachments?: File[],
        metadata?: Record<string, any>
    ): Promise<any> {
        try {
            const ai = getClient();

            const fullPrompt = `${this.systemPrompt}

【语言要求】你必须用中文回复所有内容（analysis、message、title、description 等字段全部用中文）。只有 prompt 字段用英文（因为图片生成模型需要英文 prompt）。

项目信息:
- 项目名称: ${context.projectTitle}
- 品牌信息: ${JSON.stringify(context.brandInfo || {})}
- 已有素材数量: ${context.existingAssets.length}

附件列表:
${(attachments || []).map((file, index) => {
                const info = (file as any).markerInfo;
                if (info) {
                    const ratio = (info.width / info.height).toFixed(2);
                    return `- 附件 ${index + 1}: [画布选区] (尺寸: ${info.width}x${info.height}, 比例: ${ratio})。这是用户的产品图片，必须作为参考图使用。设置 referenceImage 为 'ATTACHMENT_${index}'。`;
                }
                return `- 附件 ${index + 1}: ${file.name} (${file.type})。引用方式: 'ATTACHMENT_${index}'`;
            }).join('\n')}

可用技能: ${this.preferredSkills.join(', ')}

特殊技能 smartEdit（图片编辑）:
- 删除物体: editType='object-remove', parameters: {"object": "目标名称"}
- 去除背景: editType='background-remove'
- 更换颜色: editType='recolor', parameters: {"object": "目标", "color": "颜色"}
- 替换物体: editType='replace', parameters: {"object": "原物体", "replacement": "新物体"}
- 放大画质: editType='upscale'
- sourceUrl 设为 "ATTACHMENT_X"

用户请求: ${message}

${['cameron'].includes(this.agentInfo.id) ? '' : `【产品识别 - 最高优先级】
- 如果用户附带了图片（附件），这些图片就是用户的产品/素材。你必须仔细观察每张图片，识别出产品的具体类型、颜色、材质、形状、品牌元素等细节。
- 在每个 generateImage 的 prompt 中，必须以产品的精确英文描述开头（例如 "A matte black stainless steel water bottle with bamboo lid and minimalist logo" 而不是 "a water bottle"）。
- 所有生成的图片必须围绕这些具体产品，不能生成无关的随机产品。
- 如果没有附件图片，根据用户的文字描述来理解产品。
- 重要：每个 generateImage 的 params 中必须包含 "referenceImage": "ATTACHMENT_N"（N 是附件索引，从0开始）。如果只有1张附件，所有 proposal 都用 "ATTACHMENT_0"；如果有多张附件，每个 proposal 可以引用不同的附件（如 ATTACHMENT_0, ATTACHMENT_1, ATTACHMENT_2...）。

【输出数量规则 — 最重要】
- 默认只返回 1 个 proposal（1张图/1个视频）。用户说"做个海报"、"设计一个logo"、"帮我做张图" → 只返回 1 个 proposal。
- 只有用户明确要求多张时才返回多个 proposals：
  - "5张副图" → 5 个 proposals
  - "一套图" / "一组" / "系列" → 3-5 个 proposals
  - "3张海报" → 3 个 proposals
- 修改/编辑请求（用户标记了区域 + 说"改成XX"/"换成XX"/"去掉XX"）→ 只返回 1 个 proposal，使用 smartEdit 技能。
- 绝对不要在用户没要求多张的情况下返回多个 proposals。1个请求 = 1张图，这是默认行为。

【多图规则（仅当用户明确要求时）】
- 每个 proposal 必须包含自己的 skillCalls 数组，内容/角度/用途各不相同。
- 电商套图（亚马逊副图）应包含：白底主图、信息图、场景图、细节特写、尺寸包装图等。
- 不能返回少于用户要求数量的 proposals。
`}
请分析用户需求，返回以下 JSON 格式:
{
  "analysis": "用中文简要分析用户需求",
  "proposals": [{"id": "1", "title": "中文标题", "description": "中文描述", "skillCalls": [{"skillName": "generateImage", "params": {"prompt": "...", "referenceImage": "ATTACHMENT_0", "aspectRatio": "1:1", "model": "Nano Banana Pro"}}]}],
  "message": "用中文回复用户",
  "suggestions": ["可选：如果需要用户提供更多信息或选择项，可在此提供1-4个建议短语供用户快速点击，例如'温馨日常故事'"]
}`;

            // Build content parts - text + image attachments for visual understanding
            const parts: any[] = [{ text: fullPrompt }];

            // Add image attachments so Gemini can SEE the product
            if (attachments && attachments.length > 0) {
                for (const file of attachments) {
                    try {
                        if (file.type && file.type.startsWith('image/')) {
                            // 使用 FileReader + readAsDataURL 替代慢的 btoa(String.fromCharCode(...))
                            const base64 = await new Promise<string>((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = () => {
                                    const dataUrl = reader.result as string;
                                    // 提取纯 base64 部分（去掉 data:image/xxx;base64, 前缀）
                                    const base64Data = dataUrl.split(',')[1];
                                    resolve(base64Data);
                                };
                                reader.onerror = reject;
                                reader.readAsDataURL(file);
                            });
                            parts.push({
                                inlineData: {
                                    mimeType: file.type || 'image/png',
                                    data: base64
                                }
                            });
                        }
                    } catch (e) {
                        console.warn(`[${this.agentInfo.id}] Failed to attach file:`, e);
                    }
                }
            }

            const toolConfig: any = {};
            if (metadata?.enableWebSearch) {
                toolConfig.tools = [{ googleSearch: {} }];
            }

            const response = await retryAsync(() => ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: { parts },
                config: {
                    temperature: 0.7,
                    responseMimeType: 'application/json'
                },
                ...toolConfig
            }), 1);  // 1 次重试即可，减少超时风险

            const parsedPlan = this.parseResponse(response.text || '{}');

            // Handle Grounding Metadata (Sources)
            const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (groundingChunks && groundingChunks.length > 0) {
                const sources = groundingChunks
                    .map((chunk: any) => {
                        if (chunk.web) {
                            return `[${chunk.web.title}](${chunk.web.uri})`;
                        }
                        return null;
                    })
                    .filter((s: any) => s) as string[];

                if (sources.length > 0) {
                    const sourceText = `\n\n**参考来源:**\n${sources.map((s: string) => `- ${s}`).join('\n')}`;
                    if (parsedPlan.message) {
                        parsedPlan.message += sourceText;
                    }
                    if (parsedPlan.analysis) {
                        parsedPlan.analysis += sourceText;
                    }
                }
            }

            return parsedPlan;
        } catch (error) {
            throw errorHandler.handleError(error, {
                agent: this.agentInfo.id,
                function: 'analyzeAndPlan'
            });
        }
    }

    /**
     * 执行Skills（带完善错误处理）
     */
    protected async executeSkills(skillCalls: any[], task: AgentTask): Promise<any[]> {
        const results: any[] = [];

        // Skill name alias mapping (Gemini may return old-style names)
        const SKILL_ALIASES: Record<string, string> = {
            'imageGenSkill': 'generateImage',
            'videoGenSkill': 'generateVideo',
            'copyGenSkill': 'generateCopy',
            'textExtractSkill': 'extractText',
            'regionAnalyzeSkill': 'analyzeRegion',
            'smartEditSkill': 'smartEdit',
            'exportSkill': 'export',
            'touchEditSkill': 'touchEdit',
        };

        for (const call of skillCalls) {
            try {
                // Normalize skill name via alias
                if (SKILL_ALIASES[call.skillName]) {
                    call.skillName = SKILL_ALIASES[call.skillName];
                }

                // 验证技能存在
                if (!AVAILABLE_SKILLS[call.skillName as keyof typeof AVAILABLE_SKILLS]) {
                    throw new Error(`Skill ${call.skillName} not found`);
                }

                // 解析 attachment引用
                if (call.skillName === 'generateImage' || call.skillName === 'generateVideo' || call.skillName === 'smartEdit') {
                    // Check for referenceImage (gen) or sourceUrl (edit)
                    const paramKey = call.skillName === 'smartEdit' ? 'sourceUrl' : 'referenceImage';

                    // 自动注入产品参考图：如果有附件但 Gemini 没设置 referenceImage，自动注入
                    if (call.skillName === 'generateImage' && !call.params[paramKey] && task.input.attachments && task.input.attachments.length > 0) {
                        const imageAttachments = task.input.attachments.filter(f => f.type && f.type.startsWith('image/'));
                        if (imageAttachments.length > 0) {
                            // 如果只有一张图，所有 proposal 都用它；多张图时按 proposal 索引分配
                            const callIndex = skillCalls.indexOf(call);
                            const attachIdx = imageAttachments.length === 1 ? 0 : Math.min(callIndex, imageAttachments.length - 1);
                            const actualIdx = task.input.attachments.indexOf(imageAttachments[attachIdx]);
                            call.params[paramKey] = `ATTACHMENT_${actualIdx}`;
                            console.log(`[${this.agentInfo.id}] Auto-injected referenceImage=ATTACHMENT_${actualIdx} for proposal #${callIndex}`);
                        }
                    }

                    if (call.params[paramKey] && typeof call.params[paramKey] === 'string' && call.params[paramKey].startsWith('ATTACHMENT_')) {
                        const index = parseInt(call.params[paramKey].split('_')[1]);
                        const availableAttachments = task.input.attachments || [];
                        if (availableAttachments[index]) {
                            const file = availableAttachments[index];
                            const reader = new FileReader();
                            const base64 = await new Promise<string>((resolve) => {
                                reader.onload = () => {
                                    const res = reader.result as string;
                                    resolve(res);
                                };
                                reader.readAsDataURL(file);
                            });
                            call.params[paramKey] = base64;

                            // For smartEdit, inject aspect ratio if available
                            if (call.skillName === 'smartEdit' && (file as any).markerInfo) {
                                const info = (file as any).markerInfo;
                                // Simple ratio mapping
                                const ratio = info.width / info.height;
                                let aspect = '1:1';
                                if (ratio > 1.5) aspect = '16:9';
                                else if (ratio < 0.7) aspect = '9:16';
                                else if (ratio > 1.2) aspect = '4:3';
                                else if (ratio < 0.8) aspect = '3:4';

                                call.params.aspectRatio = aspect;
                            }
                        }
                    }
                }

                const result = await Promise.race([
                    executeSkill(call.skillName, call.params),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error(`Skill ${call.skillName} 执行超时(120s)`)), SKILL_TIMEOUT)
                    )
                ]);
                results.push({ ...call, result, success: true });
            } catch (error) {
                const appError = errorHandler.handleError(error, {
                    skill: call.skillName,
                    agent: this.agentInfo.id
                });
                results.push({
                    ...call,
                    error: appError.message,
                    success: false
                });
            }
        }

        return results;
    }

    /**
     * 从技能结果中提取资产
     */
    protected extractAssets(skillCalls: any[]): GeneratedAsset[] {
        // 记录失败的 skillCalls 以便调试
        const failed = skillCalls.filter(s => !s.success);
        if (failed.length > 0) {
            console.warn(`[${this.agentInfo.id}] ${failed.length} skill calls failed:`,
                failed.map(s => `${s.skillName}: ${s.error}`));
        }

        return skillCalls
            .filter(s => s.success && s.result && (
                s.skillName === 'generateImage' ||
                s.skillName === 'generateVideo' ||
                s.skillName === 'smartEdit' ||
                s.skillName === 'touchEdit'
            ))
            .map(s => ({
                id: `asset-${Date.now()}-${Math.random()}`,
                type: (s.skillName === 'generateVideo') ? 'video' as const : 'image' as const,
                url: s.result,
                metadata: {
                    prompt: s.params?.prompt || s.params?.editType || '',
                    model: s.params?.model || 'edit',
                    agentId: this.agentInfo.id
                }
            }));
    }

    /**
     * 根据任务类型动态生成快捷操作按钮
     */
    private getAdjustments(message: string, proposals: any[]): string[] {
        const isEdit = /换成|改成|改为|替换|修改|调整|去掉|删除|移除|去除|去背景|换背景|换颜色|改颜色|recolor|remove|replace/i.test(message);
        if (isEdit) {
            return ['继续调整', '放大画质', '去除背景', '重新生成'];
        }
        return ['换个风格', '换个构图', '换个配色', '重新生成'];
    }

    /**
     * 解析响应
     */
    protected parseResponse(response: string): any {
        try {
            // 移除markdown代码块
            let cleaned = response.trim();
            const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
            if (codeBlockMatch) {
                cleaned = codeBlockMatch[1].trim();
            }

            cleaned = cleaned.replace(/,\s*([\]}])/g, '$1'); // Fix common trailing comma json errors

            const parsed = JSON.parse(cleaned);

            if (Array.isArray(parsed)) {
                return { proposals: parsed, message: "为您生成了以下方案" };
            }

            return parsed;
        } catch (error) {
            console.warn('[Agent] JSON parse failed, trying more aggressive extraction');

            try {
                const matchObject = response.match(/\{[\s\S]*\}/);
                const matchArray = response.match(/\[[\s\S]*\]/);

                if (matchObject && (!matchArray || matchObject[0].length > matchArray[0].length)) {
                    let cleanedData = matchObject[0].replace(/,\s*([\]}])/g, '$1');
                    return JSON.parse(cleanedData);
                } else if (matchArray) {
                    let cleanedData = matchArray[0].replace(/,\s*([\]}])/g, '$1');
                    const parsed = JSON.parse(cleanedData);
                    if (Array.isArray(parsed)) {
                        return { proposals: parsed, message: "为您生成了以下方案" };
                    }
                }
            } catch (e2) {
                console.warn('[Agent] Deep JSON extraction failed too', e2);
            }

            return { message: response, skillCalls: [] };
        }
    }

    /**
     * 输入验证
     */
    private validateInput(task: AgentTask): void {
        if (!task.input.message || !task.input.message.trim()) {
            throw errorHandler.createError(
                ErrorType.VALIDATION,
                '任务消息不能为空',
                undefined,
                { taskId: task.id },
                false
            );
        }

        if (!task.input.context) {
            throw errorHandler.createError(
                ErrorType.VALIDATION,
                '任务上下文缺失',
                undefined,
                { taskId: task.id },
                false
            );
        }
    }

    /**
     * 更新任务状态
     */
    private updateTaskStatus(task: AgentTask, status: AgentTask['status']): AgentTask {
        return {
            ...task,
            status,
            updatedAt: Date.now()
        };
    }

    /**
     * 缓存结果（带TTL）
     */
    private cacheResult(task: AgentTask, result: AgentTask): void {
        const key = this.getCacheKey(task);
        this.executionCache.set(key, { result, timestamp: Date.now() });
    }

    /**
     * 获取缓存结果（带TTL检查）
     */
    private getCachedResult(task: AgentTask): AgentTask | null {
        const key = this.getCacheKey(task);
        const cached = this.executionCache.get(key);
        if (!cached) return null;

        // TTL: 5分钟过期
        const CACHE_TTL = 5 * 60 * 1000;
        if (Date.now() - cached.timestamp > CACHE_TTL) {
            this.executionCache.delete(key);
            return null;
        }

        return cached.result;
    }

    /**
     * 生成缓存键（考虑附件和上下文）
     * 带附件的请求不缓存（每次都是新的创作意图）
     */
    private getCacheKey(task: AgentTask): string {
        // 带附件的请求不缓存
        if (task.input.attachments && task.input.attachments.length > 0) {
            return `nocache-${Date.now()}-${Math.random()}`;
        }
        const contextHash = task.input.context?.projectTitle || '';
        return `${this.agentInfo.id}:${task.input.message}:${contextHash}`;
    }

    /**
     * 重置智能体
     */
    reset(): void {
        this.chat = null;
        this.executionCache.clear();
    }
}
