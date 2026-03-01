/**
 * 增强型基础智能体
 * 使用Skills系统统一处理任务，提供完善的错误处理和状态管理
 */

import { Chat, Type } from "@google/genai";
import { createChatSession, getApiKey, getClient, getBestModelId } from "../gemini";
import {
  AgentTask,
  AgentInfo,
  ProjectContext,
  GeneratedAsset,
} from "../../types/agent.types";
import { executeSkill, AVAILABLE_SKILLS } from "../skills";
import { errorHandler, ErrorType, AppError } from "../../utils/error-handler";
import { buildEcommerceProposals } from "./shared/ecommerce-variants";
import { useAgentStore } from "../../stores/agent.store";

// 带指数退避的重试工具（用于 analyzeAndPlan 等内部调用）
const retryAsync = async <T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1500,
): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const code = error.status || error.code || 0;
    const msg = error.message || "";
    const isRetryable =
      [500, 502, 503, 429].includes(code) ||
      msg.includes("overloaded") ||
      msg.includes("UNAVAILABLE") ||
      msg.includes("Bad Gateway") ||
      msg.includes("RESOURCE_EXHAUSTED") ||
      msg.includes("Internal Server Error") ||
      msg.includes("fetch failed");
    if (retries > 0 && isRetryable) {
      const wait = code === 429 ? Math.max(delay, 3000) : delay;
      console.warn(
        `[analyzeAndPlan 重试] 错误码=${code}, ${wait}ms 后重试 (剩余 ${retries} 次)`,
      );
      await new Promise((r) => setTimeout(r, wait));
      return retryAsync(fn, retries - 1, wait * 2);
    }
    throw error;
  }
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs),
    ),
  ]);
};

// 限流并发执行器：限制最多 concurrency 个任务同时执行
const runWithConcurrency = async <T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> => {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let index = 0;

  const worker = async () => {
    while (index < tasks.length) {
      const i = index++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (error: any) {
        results[i] = { status: "rejected", reason: error };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );
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
  timeout: 600000, // 10 分钟（图片生成 + 分析可能需要较长时间）
  enableCache: true,
};

const SKILL_TIMEOUTS: Record<string, number> = {
  generateImage: 45_000, // 图片生成 15-30s 典型
  smartEdit: 45_000,
  touchEdit: 45_000,
  generateVideo: 180_000, // 视频生成可能很慢
  generateCopy: 15_000, // 文本生成很快
  extractText: 15_000,
  analyzeRegion: 15_000,
  export: 30_000,
};
const DEFAULT_SKILL_TIMEOUT = 60_000;

export abstract class EnhancedBaseAgent {
  protected chat: Chat | null = null;
  protected executionCache: Map<string, any> = new Map();

  abstract get agentInfo(): AgentInfo;
  abstract get systemPrompt(): string;
  abstract get preferredSkills(): string[]; // 智能体偏好的技能

  /** 最大并发数（子类可覆盖：图片密集型=3，视频密集型=1，混合=2） */
  get maxConcurrency(): number {
    return 2;
  }

  // 增强生图意图识别：如果消息明确要求视觉产出，则强制调用生图工具
  private shouldForceImageToolCall(
    message: string,
    metadata?: Record<string, any>,
  ): boolean {
    // 上游可显式强制
    if (
      metadata?.forceToolCall === true ||
      metadata?.forceGenerateImage === true
    )
      return true;

    // 基础意图识别：明确要产出视觉内容（海报、头图、Banner、Logo、画图等）
    const imageIntent =
      /(生成|出图|做图|画图|画一个|画一张|海报|poster|banner|封面|配图|图片|图像|视觉设计|头部|头图|设计一张|图解|插图|绘图|design a|generate image|create poster|draw)/i.test(
        message,
      );

    // 排除纯咨询或文案类场景
    const consultOnly =
      /(解释|原理|教程|怎么做|如何做|为什么|文字版|仅文案|不需要图|告诉我)/i.test(
        message,
      );

    const result = imageIntent && !consultOnly;
    if (result) {
      console.log(`[${this.agentInfo.id}] Detect Image Intent: Forced tool call activated.`);
    }
    return result;
  }

  private buildForcedGenerateImageCall(
    message: string,
    attachments?: File[],
    metadata?: Record<string, any>,
  ) {
    // 智能提取比例关键词
    let aspectRatio = (metadata?.preferredAspectRatio as string) || "3:4";
    if (/(横版|横屏|宽屏|16:9|landscape)/i.test(message)) {
      aspectRatio = "16:9";
    } else if (/(竖版|竖屏|手机屏|9:16|portrait)/i.test(message)) {
      aspectRatio = "9:16";
    } else if (/(方图|正方形|1:1|square)/i.test(message)) {
      aspectRatio = "1:1";
    } else if (/(4:3)/i.test(message)) {
      aspectRatio = "4:3";
    }

    // 智能注入布局描述，强化模型对参数的遵循度
    let layoutDescriptor = "";
    if (aspectRatio === "16:9") layoutDescriptor = "ultra-wide cinematic 2k masterpiece, 16:9 landscape orientation, expansive detailed view, ";
    else if (aspectRatio === "9:16") layoutDescriptor = "vertical smartphone 2k wallpaper, 9:16 portrait orientation, vertical detailed composition, ";
    else if (aspectRatio === "4:3") layoutDescriptor = "high-resolution 2k professional 4:3 presentation layout, ";
    else if (aspectRatio === "3:4") layoutDescriptor = "high-definition 2k portrait photography, 3:4 orientation, ";
    else if (aspectRatio === "1:1") layoutDescriptor = "hi-res 2k square format, 1:1 ratio, ";

    const forcedCall: any = {
      skillName: "generateImage",
      params: {
        prompt: `${layoutDescriptor}${message}, high-impact visual design, clean composition, studio lighting, professional 2k digital art, 8k resolution details`,
        aspectRatio,
        quality: "hd", // 默认高清
        resolution: "2048x2048", // 默认 2K 级别
        model: "Nano Banana Pro",
      },
    };

    // 有附件时默认绑定首张参考图，确保不会空跑
    if (attachments && attachments.length > 0) {
      forcedCall.params.referenceImage = "ATTACHMENT_0";
    }

    return forcedCall;
  }

  /**
   * 初始化智能体
   */
  async initialize(context: ProjectContext): Promise<void> {
    try {
      this.chat = createChatSession(
        "gemini-3-pro-preview",
        [],
        this.systemPrompt,
      );
      console.log(`[${this.agentInfo.id}] Initialized successfully`);
    } catch (error) {
      throw errorHandler.handleError(error, {
        agent: this.agentInfo.id,
        function: "initialize",
      });
    }
  }

  /**
   * 执行任务（核心方法）
   */
  async execute(
    task: AgentTask,
    config: Partial<ExecutionConfig> = {},
  ): Promise<AgentTask> {
    const finalConfig = { ...DEFAULT_EXECUTION_CONFIG, ...config };
    const taskId = task.id;

    try {
      console.log(`[${this.agentInfo.id}] Starting task execution:`, taskId);

      // 更新任务状态
      task = this.updateTaskStatus(task, "analyzing");

      // 验证输入
      this.validateInput(task);

      // 检查缓存
      if (finalConfig.enableCache) {
        const cached = this.getCachedResult(task);
        if (cached) {
          console.log(`[${this.agentInfo.id}] Using cached result`);
          return this.updateTaskStatus(cached, "completed");
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
            taskType: task.input.message.substring(0, 50),
          },
        },
      );

      // 缓存结果
      if (finalConfig.enableCache && result.status === "completed") {
        this.cacheResult(task, result);
      }

      console.log(`[${this.agentInfo.id}] Task completed:`, taskId);
      return result;
    } catch (error) {
      const appError = error as AppError;
      console.error(`[${this.agentInfo.id}] Task failed:`, appError.message);

      return {
        ...task,
        status: "failed",
        output: {
          message: `执行失败: ${appError.message}`,
          error: appError,
        },
        updatedAt: Date.now(),
      };
    }
  }

  /**
   * 带超时的执行
   */
  private async executeWithTimeout(
    task: AgentTask,
    timeout: number,
  ): Promise<AgentTask> {
    return Promise.race([
      this.executeInternal(task),
      new Promise<AgentTask>((_, reject) =>
        setTimeout(
          () =>
            reject(
              errorHandler.createError(
                ErrorType.AGENT,
                "任务执行超时",
                undefined,
                { taskId: task.id, timeout },
                true,
              ),
            ),
          timeout,
        ),
      ),
    ]);
  }

  /**
   * 内部执行逻辑（使用Skills）
   */
  private async executeInternal(task: AgentTask): Promise<AgentTask> {
    const { message, context } = task.input;
    const store = useAgentStore.getState();
    const forceImageToolCall = this.shouldForceImageToolCall(
      message,
      task.input.metadata,
    );

    // Step 1: 接受任务
    store.actions.setCurrentTask({
      ...task,
      status: "analyzing",
      progressMessage: `好的，我来为您处理这个请求`,
      progressStep: 1,
      totalSteps: 4,
    });

    // 1. 分析任务并生成执行计划
    // Step 2: 分析需求
    store.actions.setCurrentTask({
      ...task,
      status: "analyzing",
      progressMessage: "正在分析您的需求，制定创作方案...",
      progressStep: 2,
      totalSteps: 4,
    });

    // 1.5 定义字段名容错修复函数
    const fixSkillCalls = (obj: any) => {
      if (!obj || typeof obj !== "object") return;
      const keys = Object.keys(obj);
      for (const key of keys) {
        const lowerKey = key.toLowerCase();
        const isSkillKey = [
          "skillcalls",
          "skills",
          "calls",
          "actions",
          "tool_calls",
          "skill_calls",
        ].includes(lowerKey);
        if (isSkillKey && Array.isArray(obj[key]) && obj[key].length > 0) {
          if (!obj.skillCalls || obj.skillCalls.length === 0) {
            obj.skillCalls = obj[key];
          }
        }
      }
    };

    let plan: any;

    // Patch v14/15: 快速生图通道 — 如果检测到明确生图意图且非深度思考模式，直接构造计划，跳过 LLM 分析
    // Patch v16: 进入分析确认与方案推荐模式
    const isThinkingMode = useAgentStore.getState().modelMode === 'thinking';
    if (forceImageToolCall && !isThinkingMode) {
      console.log(`[${this.agentInfo.id}] Analyzing intent and preparing proposals...`);
      const landscapeCall = this.buildForcedGenerateImageCall(message + " (landscape 16:9)", task.input.attachments, { ...task.input.metadata, preferredAspectRatio: "16:9" });
      const portraitCall = this.buildForcedGenerateImageCall(message + " (portrait 9:16)", task.input.attachments, { ...task.input.metadata, preferredAspectRatio: "9:16" });
      const squareCall = this.buildForcedGenerateImageCall(message + " (square 1:1)", task.input.attachments, { ...task.input.metadata, preferredAspectRatio: "1:1" });

      plan = {
        analysis: `用户请求生成图片，我分析后为您准备了三个不同比例的设计方案：横版（16:9）适合电影感视觉，竖版（9:16）适合手机壁纸，正方形（1:1）适合社交媒体。`,
        message: "好的，我已经分析了您的需求。为了达到最佳效果，我为您准备了三个不同比例的创作方案，您可以选择最满意的一个开始生成。",
        skillCalls: [], // 顶层为空，引导用户选择 proposal
        proposals: [
          { id: "p1", title: "电影感横版 (16:9)", description: "采用宽荧幕比例，适合表现宏大的场景和电影质感。", skillCalls: [landscapeCall] },
          { id: "p2", title: "手机壁纸竖版 (9:16)", description: "长竖屏比例，画面主体更突出，适合作为手机壁纸或海报。", skillCalls: [portraitCall] },
          { id: "p3", title: "经典方图 (1:1)", description: "构图紧凑平稳，适合社交媒体头像或精致插画。", skillCalls: [squareCall] }
        ],
        suggestions: ["按照我的描述直接生成", "尝试换个艺术风格"]
      };
    } else {
      try {
        plan = await this.analyzeAndPlan(
          message,
          context,
          task.input.attachments,
          task.input.uploadedAttachments,
          {
            ...(task.input.metadata || {}),
            forceImageToolCall,
          },
        );
      } catch (error) {
        console.error(`[${this.agentInfo.id}] analyzeAndPlan failed:`, error);
        if (forceImageToolCall) {
          console.warn(`[${this.agentInfo.id}] Analysis failed but Image Intent detected. Using hardcoded fallback.`);
          plan = {
            analysis: "分析超时，已为您启用快速生图通道。",
            message: "分析稍微慢了一点，但我这就直接为您开始生成图片...",
            skillCalls: [this.buildForcedGenerateImageCall(message, task.input.attachments, task.input.metadata)],
          };
        } else {
          throw error;
        }
      }
    }

    // 修复顶层和 proposals 内部的字段名
    fixSkillCalls(plan);
    if (Array.isArray(plan.proposals)) {
      plan.proposals.forEach(fixSkillCalls);
    }

    console.log(`[${this.agentInfo.id}] Plan received:`, {
      hasProposals: !!(plan.proposals && plan.proposals.length),
      proposalCount: plan.proposals?.length || 0,
      hasSkillCalls: !!(plan.skillCalls && plan.skillCalls.length),
      skillCallCount: plan.skillCalls?.length || 0,
      forceImageToolCall,
    });

    // 2. 检测用户是否请求了多张图
    const multiImageMatch = message.match(
      /(\d+)\s*张|(\d+)\s*images?|一套|一组|系列/i,
    );
    const requestedCount = multiImageMatch
      ? parseInt(multiImageMatch[1] || multiImageMatch[2]) || 5
      : 0;

    let effectiveProposals =
      plan.proposals && plan.proposals.length > 0 ? [...plan.proposals] : [];

    // 3.5 修复: AI 可能用不同的字段名返回 skillCalls（如 skills, calls, actions 等）
    for (const p of effectiveProposals) {
      if (!p.skillCalls || p.skillCalls.length === 0) {
        // 尝试常见的别名和不同的大小写
        const keys = Object.keys(p);
        for (const key of keys) {
          const lowerKey = key.toLowerCase();
          if (
            [
              "skillcalls",
              "skills",
              "calls",
              "actions",
              "skill_calls",
              "tool_calls",
            ].includes(lowerKey)
          ) {
            if (p[key] && Array.isArray(p[key]) && p[key].length > 0) {
              console.log(
                `[${this.agentInfo.id}] Fixed proposal "${p.title}": renamed "${key}" -> "skillCalls"`,
              );
              p.skillCalls = p[key];
              break;
            }
          }
        }
      }
    }

    // 4. 如果 proposals 为空或 proposals 内没有 skillCalls，但顶层有 skillCalls，尝试修复
    const proposalsHaveSkills = effectiveProposals.some(
      (p: any) => p.skillCalls && p.skillCalls.length > 0,
    );

    if (!proposalsHaveSkills && plan.skillCalls && plan.skillCalls.length > 0) {
      console.log(
        `[${this.agentInfo.id}] Proposals missing skillCalls, restructuring from top-level skillCalls`,
      );

      if (
        requestedCount > 1 &&
        plan.skillCalls.length === 1 &&
        !["cameron", "vireo", "motion"].includes(this.agentInfo.id)
      ) {
        // 用户要求多张图但只有1个 skillCall — 使用共享电商套图模块生成变体（仅限产品设计类智能体）
        const baseCall = plan.skillCalls[0];
        const basePrompt = baseCall.params?.prompt || "";
        effectiveProposals = buildEcommerceProposals(
          basePrompt,
          {
            aspectRatio: baseCall.params?.aspectRatio,
            model: baseCall.params?.model,
          },
          requestedCount,
        );
        console.log(
          `[${this.agentInfo.id}] Created ${effectiveProposals.length} variant proposals from single skillCall`,
        );
      } else {
        // 将每个顶层装成一个 proposal
        effectiveProposals = plan.skillCalls.map((call: any, idx: number) => ({
          id: String(idx + 1),
          title: `方案 ${idx + 1}`,
          description: call.params?.prompt?.substring(0, 80) || "",
          skillCalls: [call],
        }));
      }
    }

    // 4.5 最后的兜底: proposals 有数据但 skillCalls 仍然为空 — 从 proposal 的 prompt 字段自动构建
    const stillNoSkills = !effectiveProposals.some(
      (p: any) => p.skillCalls && p.skillCalls.length > 0,
    );
    if (stillNoSkills && effectiveProposals.length > 0) {
      console.warn(
        `[${this.agentInfo.id}] Proposals exist but ALL lack skillCalls — auto-building from proposal data`,
      );
      console.log(
        `[${this.agentInfo.id}] Raw proposal keys:`,
        effectiveProposals.map((p: any) => Object.keys(p)),
      );

      for (const p of effectiveProposals) {
        // 尝试从 proposal 内提取 prompt（AI 可能把 prompt 直接放到 proposal 顶层）
        const prompt =
          p.prompt || p.imagePrompt || p.image_prompt || p.params?.prompt || "";
        const model = p.model || p.params?.model || "Nano Banana Pro";
        const ratio =
          p.aspectRatio ||
          p.aspect_ratio ||
          p.ratio ||
          p.params?.aspectRatio ||
          "1:1";

        if (prompt) {
          // 注入布局描述词：模型更倾向于听 Prompt 里的描述而非参数
          const layoutMap: Record<string, string> = {
            '1:1': 'square format, centered composition, 1:1 aspect ratio',
            '16:9': 'wide screen cinematic, 16:9 landscape orientation',
            '9:16': 'vertical smartphone screen, 9:16 portrait orientation',
            '4:3': 'standard traditional photography, 4:3 landscape',
            '3:4': 'classic portrait photography, 3:4 orientation'
          };
          const layoutDesc = layoutMap[ratio] || '';
          const finalPrompt = layoutDesc ? `${layoutDesc}, ${prompt}` : prompt;

          p.skillCalls = [
            {
              skillName: "generateImage",
              params: {
                prompt: finalPrompt,
                aspect_ratio: ratio,
                model: model,
              },
              explanation: `正在按要求制作一张 ${ratio === '16:9' ? '横版' : (ratio === '9:16' ? '竖版' : '指定比例')} 的图片...`
            },
          ];
          console.log(
            `[${this.agentInfo.id}] Auto-built skillCall for "${p.title}" from prompt field`,
          );
        }
      }

      // 如果连 prompt 字段也没有，从 description 或 title 生成
      const stillEmpty = !effectiveProposals.some(
        (p: any) => p.skillCalls && p.skillCalls.length > 0,
      );
      if (stillEmpty) {
        console.warn(
          `[${this.agentInfo.id}] No prompt field found — building from description`,
        );
        for (const p of effectiveProposals) {
          const fallbackPrompt = p.description || p.title || message;
          if (fallbackPrompt) {
            p.skillCalls = [
              {
                skillName: "generateImage",
                params: {
                  prompt: fallbackPrompt,
                  model: "Nano Banana Pro",
                  aspectRatio: "1:1",
                },
              },
            ];
          }
        }
      }
    }

    // 5.5 如果 AI 选择对话而非直接生成（proposals 为空但有 message，且不是被强制补充skillCall的），返回对话响应
    if (
      effectiveProposals.length === 0 &&
      plan.message &&
      !plan.skillCalls?.length &&
      !task.input.metadata?.forceSkills &&
      !forceImageToolCall
    ) {
      return {
        ...task,
        status: "completed",
        output: {
          message: plan.message,
          analysis: plan.analysis,
          proposals: [],
          assets: [],
          adjustments: plan.suggestions || [],
        },
        updatedAt: Date.now(),
      };
    }

    // 6. 执行顶层 Skills（无 proposals 的情况）
    // 如果已经有了 proposals，默认进入“预览 -> 选择”流程，除非 metadata.forceSkills 明确要求立即执行。
    let fallbackSkillCalls = [];
    if (effectiveProposals.length === 0) {
      fallbackSkillCalls = plan.skillCalls || [];

      // Poster 强制出图兜底：如果模型未给出 skillCalls，直接注入 generateImage。
      if (forceImageToolCall && fallbackSkillCalls.length === 0) {
        console.warn(
          `[${this.agentInfo.id}] forceImageToolCall active: injecting fallback generateImage call.`,
        );
        fallbackSkillCalls = [
          this.buildForcedGenerateImageCall(
            message,
            task.input.attachments,
            task.input.metadata,
          ),
        ];
      }

      // 6.5 Fallback 兜底: 如果 Plan 中有 prompt 但没有 skillCalls，自动构建
      if (fallbackSkillCalls.length === 0) {
        const planPrompt =
          plan.prompt || plan.imagePrompt || plan.image_prompt || "";
        if (planPrompt) {
          console.log(
            `[${this.agentInfo.id}] Fallback: building skillCall from plan.prompt`,
          );
          fallbackSkillCalls = [
            {
              skillName: "generateImage",
              params: {
                prompt: planPrompt,
                model: plan.model || "Nano Banana Pro",
                aspectRatio: plan.aspectRatio || plan.aspect_ratio || "1:1",
              },
            },
          ];
        } else {
          console.warn(
            `[${this.agentInfo.id}] No skillCalls, no proposals with skills, no prompt found. Plan keys:`,
            Object.keys(plan),
          );
        }
      }
    } else {
      console.log(
        `[${this.agentInfo.id}] Proposals exist. Skipping fallback skill execution.`,
      );
    }

    // 6.8 方案预览阶段：有 proposals 且未强制执行时，直接返回方案供用户选择
    // Patch v16: 即使识别到生图意图 (forceImageToolCall)，也返回方案进行“确认环节”
    if (effectiveProposals.length > 0 && !task.input.metadata?.forceSkills) {
      const previewMessage = 
        plan.message || "我已为您准备好方案，请选择一个继续生成。";
      
      const finishedTask: AgentTask = {
        ...task,
        status: "completed",
        output: {
          message: previewMessage,
          analysis: plan.analysis,
          proposals: effectiveProposals,
          assets: [],
          adjustments: plan.suggestions || [],
        },
        updatedAt: Date.now(),
      };
      
      // 关键：清空当前任务状态，防止 UI 进度条卡住
      store.actions.setCurrentTask(null);
      
      return finishedTask;
    }

    // 7. 执行技能：优先执行用户选中的 proposal skillCalls
    const selectedSkillCalls = Array.isArray(
      task.input.metadata?.selectedSkillCalls,
    )
      ? task.input.metadata.selectedSkillCalls
      : [];

    let activeSkillCalls = [...fallbackSkillCalls];

    if (selectedSkillCalls.length > 0) {
      console.log(
        `[${this.agentInfo.id}] Executing selected proposal skillCalls: ${selectedSkillCalls.length}`,
      );
      activeSkillCalls = selectedSkillCalls;
    } else if (
      effectiveProposals.length > 0 &&
      task.input.metadata?.forceSkills
    ) {
      console.log(
        `[${this.agentInfo.id}] forceSkills enabled, executing all proposal skillCalls.`,
      );
      for (const p of effectiveProposals) {
        if (p.skillCalls && p.skillCalls.length > 0) {
          activeSkillCalls = [...activeSkillCalls, ...p.skillCalls];
        }
      }
    }

    let skillResults = [];
    if (activeSkillCalls.length > 0) {
      // Step 3: 生成中
      const imageCount = activeSkillCalls.filter(
        (c) =>
          c.skillName === "generateImage" || c.skillName === "imageGenSkill",
      ).length;
      const videoCount = activeSkillCalls.filter(
        (c) =>
          c.skillName === "generateVideo" || c.skillName === "videoGenSkill",
      ).length;
      const genDesc =
        imageCount > 0
          ? `${imageCount} 张图片`
          : videoCount > 0
            ? `${videoCount} 个视频`
            : "内容";

      store.actions.setCurrentTask({
        ...task,
        status: "executing",
        progressMessage: `方案已就绪，正在生成${genDesc}...`,
        progressStep: 3,
        totalSteps: 4,
      });

      skillResults = await this.executeSkills(activeSkillCalls, task);
    }

    // 7. 提取生成的资产
    const assets = this.extractAssets(skillResults);
    const assetUrls = assets.map((a) => a.url);

    // Step 4: 完成
    if (assets.length > 0) {
      store.actions.setCurrentTask({
        ...task,
        status: "executing",
        progressMessage: `已生成 ${assets.length} 张图片，正在添加到画布...`,
        progressStep: 4,
        totalSteps: 4,
      });
    }

    // 8. 组装最终输出
    // 如果资产生成成功，message 应该是完成反馈；否则使用分析信息
    let finalMessage =
      assets.length > 0
        ? plan.message ||
          `我已根据方案为您生成了 ${assets.length} 张图片并添加至画布。`
        : plan.message || plan.analysis || "任务已完成";

    // 彻底清理文本中的 json:generation 块（支持多行和代码块语法），防止前端渲染多余按钮
    finalMessage = finalMessage
      .replace(/```json:generation\s*[\s\S]*?```/g, "")
      .trim();

    // 最终清理环节：重置任务状态，确保进度 UI 彻底消失
    store.actions.setCurrentTask(null);

    return {
      ...task,
      status: "completed",
      output: {
        message: finalMessage,
        analysis: plan.analysis,
        // 全自动执行后，清除 proposals 以隐藏 UI 中的方案卡片和“立即生成”按钮
        proposals: assets.length > 0 ? [] : effectiveProposals,
        assets,
        imageUrls: assetUrls, // 同步到 imageUrls 供 AgentMessage 列表渲染
        skillCalls: skillResults,
        adjustments:
          assets.length > 0
            ? this.getAdjustments(message, effectiveProposals)
            : plan.suggestions || [],
      },
      updatedAt: Date.now(),
    };
  }

  /**
   * 分析任务并制定执行计划
   */
  private async analyzeAndPlan(
    message: string,
    context: ProjectContext,
    attachments?: File[],
    uploadedAttachments?: string[],
    metadata?: Record<string, any>,
  ): Promise<any> {
    try {
      const ai = getClient();
      const forceImageToolCall = this.shouldForceImageToolCall(
        message,
        metadata,
      );

      // 按需构建提示词段落，减少不必要的 token 消耗
      const hasAttachments = attachments && attachments.length > 0;
      const isEdit =
        /换成|改成|改为|替换|修改|调整|变成|去掉|删除|移除|去背景|换背景|换颜色|改颜色|抠图|高清|放大画质|upscale|remove|replace|recolor|edit/i.test(
          message,
        );
      const isMultiImage = /(\d+)\s*张|一套|一组|系列|套图/i.test(message);

      const smartEditSection = isEdit
        ? `
特殊技能 smartEdit（图片编辑）:
- 删除物体: editType='object-remove', parameters: {"object": "目标名称"}
- 去除背景: editType='background-remove'
- 更换颜色: editType='recolor', parameters: {"object": "目标", "color": "颜色"}
- 替换物体: editType='replace', parameters: {"object": "原物体", "replacement": "新物体"}
- 放大画质: editType='upscale'
- sourceUrl 设为 "ATTACHMENT_X"
`
        : "";

      const productSection =
        hasAttachments && !["cameron"].includes(this.agentInfo.id)
          ? `
【产品识别 - 最高优先级】
- 如果用户附带了图片（附件），这些图片就是用户的产品/素材。你必须仔细观察每张图片，识别出产品的具体类型、颜色、材质、形状、品牌元素等细节。
- 在每个 generateImage 的 prompt 中，必须以产品的精确英文描述开头（例如 "A matte black stainless steel water bottle with bamboo lid and minimalist logo" 而不是 "a water bottle"）。
- 所有生成的图片必须围绕这些具体产品，不能生成无关的随机产品。
- 重要：每个 generateImage 的 params 中必须包含 "referenceImage": "ATTACHMENT_N"（N 是附件索引，从0开始）。如果只有1张附件，所有 proposal 都用 "ATTACHMENT_0"；如果有多张附件，每个 proposal 可以引用不同的附件（如 ATTACHMENT_0, ATTACHMENT_1, ATTACHMENT_2...）。
`
          : "";

      const quantitySection = `
【输出数量规则 — 最重要】
- 默认只返回 1 个 proposal（1张图/1个视频）。用户说"做个海报"、"设计一个logo"、"帮我做张图" → 只返回 1 个 proposal。
- 只有用户明确要求多张时才返回多个 proposals：
  - "5张副图" → 5 个 proposals
  - "一套图" / "一组" / "系列" → 3-5 个 proposals
  - "3张海报" → 3 个 proposals
- 修改/编辑请求说"改成XX"/"换成XX"/"去掉XX"）→ 只返回 1 个 proposal，使用 smartEdit 技能。
- 绝对不要在用户没要求多张的情况下返回多个 proposals。1个请求 = 1张图，这是默认行为。
`;

      const multiImageSection = isMultiImage
        ? `
【多图规则（仅当用户明确要求时）】
- 每个 proposal 必须包含自己的 skillCalls 数组，内容/角度/用途各不相同。
- 电商套图（亚马逊副图）应包含：白底主图、信息图、场景图、细节特写、尺寸包装图等。
- 不能返回少于用户要求数量的 proposals。
`
        : "";

      const forcedToolSection = forceImageToolCall
        ? `
【强制工具调用规则（绝对必须）】
- 本次请求已判定为“必须出图”任务。
- 你不能只返回 message/analysis。
- 你必须返回可执行的 skillCalls，并且至少包含 1 个 skillName="generateImage"。
- 若未返回 generateImage skillCalls，本次输出将被系统判定为失败。
`
        : "";

      const fullPrompt = `${this.systemPrompt}

【语言要求】你必须用中文回复所有内容（analysis、message、title、description 等字段全部用中文）。只有 prompt 字段用英文（因为图片生成模型需要英文 prompt）。

项目信息:
- 项目名称: ${context.projectTitle}
- 品牌信息: ${JSON.stringify(context.brandInfo || {})}
- 已有素材数量: ${context.existingAssets.length}

附件列表:
${(attachments || [])
  .map((file, index) => {
    const info = (file as any).markerInfo;
    const uploadedUrl =
      uploadedAttachments && uploadedAttachments[index]
        ? `\n- 🌐 公网预览图: ${uploadedAttachments[index]}`
        : "";

    if (info) {
      const ratio = (info.width / info.height).toFixed(2);
      return `- 附件 ${index + 1}: [画布选区] (尺寸: ${info.width}x${info.height}, 比例: ${ratio})。这是用户的产品图片，必须作为参考图使用。设置 referenceImage 为 'ATTACHMENT_${index}'。${uploadedUrl}`;
    }
    return `- 附件 ${index + 1}: ${file.name} (${file.type})。引用方式: 'ATTACHMENT_${index}'${uploadedUrl}`;
  })
  .join("\n")}

对话历史 (Context):
${(context.conversationHistory || [])
  .map((msg) => {
    const roleName = msg.role === "user" ? "用户" : "智能助手";
    const attachmentsText =
      msg.attachments && msg.attachments.length > 0
        ? ` [附图/素材: ${msg.attachments.join(", ")}]`
        : "";
    return `${roleName}: ${msg.text}${attachmentsText}`;
  })
  .join("\n")}

可用技能: ${this.preferredSkills.join(", ")}
${smartEditSection}
用户请求: ${message}
${productSection}${quantitySection}${multiImageSection}${forcedToolSection}
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
            if (file.type && file.type.startsWith("image/")) {
              // 使用 FileReader + readAsDataURL 替代慢的 btoa(String.fromCharCode(...))
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const dataUrl = reader.result as string;
                  // 提取纯 base64 部分（去掉 data:image/xxx;base64, 前缀）
                  const base64Data = dataUrl.split(",")[1];
                  resolve(base64Data);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
              parts.push({
                inlineData: {
                  mimeType: file.type || "image/png",
                  data: base64,
                },
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

      const forcedSchema = forceImageToolCall
        ? {
            type: Type.OBJECT,
            properties: {
              analysis: { type: Type.STRING },
              message: { type: Type.STRING },
              proposals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    skillCalls: {
                      type: Type.ARRAY,
                      minItems: 1,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          skillName: {
                            type: Type.STRING,
                            enum: ["generateImage"],
                          },
                          params: { type: Type.OBJECT },
                        },
                        required: ["skillName", "params"],
                      },
                    },
                  },
                  required: ["id", "title", "description", "skillCalls"],
                },
              },
              skillCalls: {
                type: Type.ARRAY,
                minItems: 1,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    skillName: { type: Type.STRING, enum: ["generateImage"] },
                    params: { type: Type.OBJECT },
                  },
                  required: ["skillName", "params"],
                },
              },
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          }
        : undefined;

      const response = await withTimeout(
        retryAsync(
          async () => {
            const mode = useAgentStore.getState().modelMode || 'fast';
            const bestModel = getBestModelId(mode === 'thinking' ? "thinking" : "text");
            console.log(`[analyzeAndPlan] [${mode}] 发起分析请求，选用模型: ${bestModel}`);
            return ai.models.generateContent({
              model: bestModel,
              contents: { parts },
              config: {
                temperature: forceImageToolCall ? 0.2 : 0.7,
                responseMimeType: "application/json",
                ...(forcedSchema ? { responseSchema: forcedSchema } : {}),
              },
              ...toolConfig,
            });
          },
          3, // 增加到 3 次重试，应付中转站波动
        ),
        120000, // 120 秒超时
        "analyzeAndPlan 超时",
      ) as any;
      console.log(`[${this.agentInfo.id}] [analyzeAndPlan] 收到模型回复`);

      const parsedPlan = this.parseResponse(response.text || "{}");

      // 最终兜底：强制出图时不允许只返回文本。
      if (forceImageToolCall) {
        const topCalls = Array.isArray(parsedPlan.skillCalls)
          ? parsedPlan.skillCalls
          : [];
        const proposalCalls = Array.isArray(parsedPlan.proposals)
          ? parsedPlan.proposals.flatMap((p: any) =>
              Array.isArray(p.skillCalls) ? p.skillCalls : [],
            )
          : [];
        const hasGenerateImage = [...topCalls, ...proposalCalls].some(
          (c: any) => /^generateImage$/i.test(c?.skillName || ""),
        );

        if (!hasGenerateImage) {
          parsedPlan.skillCalls = [
            this.buildForcedGenerateImageCall(message, attachments, metadata),
          ];
          parsedPlan.message = "已触发强制出图流程，正在为您生成图像。";
        }
      }

      // Handle Grounding Metadata (Sources)
      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks;
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
          const sourceText = `\n\n**参考来源:**\n${sources.map((s: string) => `- ${s}`).join("\n")}`;
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
        function: "analyzeAndPlan",
      });
    }
  }

  /**
   * 执行Skills（带完善错误处理）
   */
  protected async executeSkills(
    skillCalls: any[],
    task: AgentTask,
  ): Promise<any[]> {
    const results: any[] = [];

    // Skill name alias mapping (Gemini may return old-style names)
    const SKILL_ALIASES: Record<string, string> = {
      imageGenSkill: "generateImage",
      videoGenSkill: "generateVideo",
      copyGenSkill: "generateCopy",
      textExtractSkill: "extractText",
      regionAnalyzeSkill: "analyzeRegion",
      smartEditSkill: "smartEdit",
      exportSkill: "export",
      touchEditSkill: "touchEdit",
    };
    
    // --- 进度反馈增强逻辑 (Patch v16) ---
    const progressSteps = [
      "正在连接 Nano Banana Pro 模型...",
      "正在分析视觉元素与构图构思...",
      "正在渲染高动态范围光影细节...",
      "正在进行 2K 超清分辨率优化...",
      "正在执行最后的像素级精修...",
      "正在为您将作品同步至画布..."
    ];
    
    let pIdx = 0;
    const pInterval = setInterval(() => {
      if (pIdx < progressSteps.length) {
        useAgentStore.getState().actions.setCurrentTask({
          ...task,
          status: "executing",
          progressMessage: progressSteps[pIdx],
          progressStep: 3,
          totalSteps: 4,
        });
        pIdx++;
      }
    }, 3000);

    try {
      for (const call of skillCalls) {
      try {
        // Normalize skill name via alias
        if (SKILL_ALIASES[call.skillName]) {
          call.skillName = SKILL_ALIASES[call.skillName];
        }

        console.log(
          `[${this.agentInfo.id}] [executeSkills] 解析技能参数: ${call.skillName}`,
        );

        // 安全解析：某些模型会返回字符串化 JSON 或 markdown 包裹的参数
        if (typeof call.params === "string") {
          try {
            let cleanedParams = call.params.trim();
            const codeBlockMatch = cleanedParams.match(
              /```(?:json)?\s*\n?([\s\S]*?)\n?```/,
            );
            if (codeBlockMatch) {
              cleanedParams = codeBlockMatch[1].trim();
            }
            call.params = JSON.parse(cleanedParams);
          } catch (parseError) {
            console.error(
              `[${this.agentInfo.id}] 参数 JSON 解析失败:`,
              parseError,
            );
            call.params = {};
          }
        }

        if (!call.params || typeof call.params !== "object") {
          call.params = {};
        }

        // 验证技能存在
        if (
          !AVAILABLE_SKILLS[call.skillName as keyof typeof AVAILABLE_SKILLS]
        ) {
          throw new Error(`Skill ${call.skillName} not found`);
        }

        // 注入前端显式选择的比例，确保请求参数使用用户所选值
        const preferredAspectRatio = task.input.metadata?.preferredAspectRatio;
        const creationMode = task.input.metadata?.creationMode;
        if (
          typeof preferredAspectRatio === "string" &&
          preferredAspectRatio &&
          ((creationMode === "image" && call.skillName === "generateImage") ||
            (creationMode === "video" && call.skillName === "generateVideo"))
        ) {
          call.params = call.params || {};
          call.params.aspectRatio = preferredAspectRatio;
        }

        if (
          (call.skillName === "generateImage" ||
            call.skillName === "generateVideo" ||
            call.skillName === "smartEdit") &&
          task.input.metadata?.forceSkills
        ) {
          const refKey =
            call.skillName === "smartEdit" ? "sourceUrl" : "referenceImage";
          const refVal = call.params?.[refKey];
          const requiresAttachment =
            (typeof refVal === "string" && refVal.startsWith("ATTACHMENT_")) ||
            call.skillName === "smartEdit";

          if (
            requiresAttachment &&
            (!task.input.attachments || task.input.attachments.length === 0)
          ) {
            throw new Error(
              "执行方案时缺少参考附件，请先在输入区保留产品图/标记图后再执行。",
            );
          }
        }

        // 解析 attachment引用
        if (
          call.skillName === "generateImage" ||
          call.skillName === "generateVideo" ||
          call.skillName === "smartEdit"
        ) {
          // Check for referenceImage (gen) or sourceUrl (edit)
          const paramKey =
            call.skillName === "smartEdit" ? "sourceUrl" : "referenceImage";

          // 自动注入产品参考图：如果有附件但 Gemini 没设置 referenceImage，自动注入
          if (
            call.skillName === "generateImage" &&
            !call.params[paramKey] &&
            task.input.attachments &&
            task.input.attachments.length > 0
          ) {
            const imageAttachments = task.input.attachments.filter(
              (f) => f.type && f.type.startsWith("image/"),
            );
            if (imageAttachments.length > 0) {
              // 如果只有一张图，所有 proposal 都用它；多张图时按 proposal 索引分配
              const callIndex = skillCalls.indexOf(call);
              const attachIdx =
                imageAttachments.length === 1
                  ? 0
                  : Math.min(callIndex, imageAttachments.length - 1);
              const actualIdx = task.input.attachments.indexOf(
                imageAttachments[attachIdx],
              );
              call.params[paramKey] = `ATTACHMENT_${actualIdx}`;
              console.log(
                `[${this.agentInfo.id}] Auto-injected referenceImage=ATTACHMENT_${actualIdx} for proposal #${callIndex}`,
              );
            }
          }

          if (
            call.params[paramKey] &&
            typeof call.params[paramKey] === "string" &&
            call.params[paramKey].startsWith("ATTACHMENT_")
          ) {
            const index = parseInt(call.params[paramKey].split("_")[1]);
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
              if (call.skillName === "smartEdit" && (file as any).markerInfo) {
                const info = (file as any).markerInfo;
                // Simple ratio mapping
                const ratio = info.width / info.height;
                let aspect = "1:1";
                if (ratio > 1.5) aspect = "16:9";
                else if (ratio < 0.7) aspect = "9:16";
                else if (ratio > 1.2) aspect = "4:3";
                else if (ratio < 0.8) aspect = "3:4";

                call.params.aspectRatio = aspect;
              }
            }
          }
        }

        const skillTimeout =
          SKILL_TIMEOUTS[call.skillName] || DEFAULT_SKILL_TIMEOUT;
        const result = await Promise.race([
          executeSkill(call.skillName, call.params),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Skill ${call.skillName} 执行超时(${skillTimeout / 1000}s)`,
                  ),
                ),
              skillTimeout,
            ),
          ),
        ]);
        results.push({ ...call, result, success: true });
      } catch (error) {
        const appError = errorHandler.handleError(error, {
          skill: call.skillName,
          agent: this.agentInfo.id,
        });
        results.push({
          ...call,
          error: appError.message,
          success: false,
        });
      }
    }

    } finally {
      clearInterval(pInterval);
    }

    return results;
  }

  /**
   * 从技能结果中提取资产
   */
  protected extractAssets(skillCalls: any[]): GeneratedAsset[] {
    // 记录失败的 skillCalls 以便调试
    const failed = skillCalls.filter((s) => !s.success);
    if (failed.length > 0) {
      console.warn(
        `[${this.agentInfo.id}] ${failed.length} skill calls failed:`,
        failed.map((s) => `${s.skillName}: ${s.error}`),
      );
    }

    return skillCalls
      .filter(
        (s) =>
          s.success &&
          s.result &&
          (s.skillName === "generateImage" ||
            s.skillName === "generateVideo" ||
            s.skillName === "smartEdit" ||
            s.skillName === "touchEdit"),
      )
      .map((s) => ({
        id: `asset-${Date.now()}-${Math.random()}`,
        type:
          s.skillName === "generateVideo"
            ? ("video" as const)
            : ("image" as const),
        url: s.result,
        metadata: {
          prompt: s.params?.prompt || s.params?.editType || "",
          model: s.params?.model || "edit",
          agentId: this.agentInfo.id,
        },
      }));
  }

  /**
   * 根据任务类型动态生成快捷操作按钮
   */
  private getAdjustments(message: string, proposals: any[]): string[] {
    const isEdit =
      /换成|改成|改为|替换|修改|调整|去掉|删除|移除|去除|去背景|换背景|换颜色|改颜色|recolor|remove|replace/i.test(
        message,
      );
    
    if (isEdit) {
      return ["继续微调", "一键抠图", "提升画质", "尝试不同配色"];
    }

    const isLandscape = /(横版|横屏|宽屏|16:9|landscape)/i.test(message);
    const isPortrait = /(竖版|竖屏|手机屏|9:16|portrait)/i.test(message);
    const isSquare = /(方图|1:1|正方形|square)/i.test(message);
    
    const suggestions = [];
    if (isLandscape) suggestions.push("换成竖版");
    else if (isPortrait) suggestions.push("换成横版");
    else suggestions.push("尝试横版", "尝试竖版");

    suggestions.push("换个风格", "换个配色", "重新生成");
    
    return suggestions.slice(0, 4);
  }

  /**
   * 解析响应
   */
  protected parseResponse(response: string): any {
    try {
      // 移除markdown代码块
      let cleaned = response.trim();
      const codeBlockMatch = cleaned.match(
        /```(?:json)?\s*\n?([\s\S]*?)\n?```/,
      );
      if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim();
      }

      cleaned = cleaned.replace(/,\s*([\]}])/g, "$1"); // Fix common trailing comma json errors

      const parsed = JSON.parse(cleaned);

      if (Array.isArray(parsed)) {
        return { proposals: parsed, message: "为您生成了以下方案" };
      }

      return parsed;
    } catch (error) {
      console.warn(
        "[Agent] JSON parse failed, trying more aggressive extraction",
      );

      try {
        const matchObject = response.match(/\{[\s\S]*\}/);
        const matchArray = response.match(/\[[\s\S]*\]/);

        if (
          matchObject &&
          (!matchArray || matchObject[0].length > matchArray[0].length)
        ) {
          let cleanedData = matchObject[0].replace(/,\s*([\]}])/g, "$1");
          return JSON.parse(cleanedData);
        } else if (matchArray) {
          let cleanedData = matchArray[0].replace(/,\s*([\]}])/g, "$1");
          const parsed = JSON.parse(cleanedData);
          if (Array.isArray(parsed)) {
            return { proposals: parsed, message: "为您生成了以下方案" };
          }
        }
      } catch (e2) {
        console.warn("[Agent] Deep JSON extraction failed too", e2);
      }

      // 彻底移除所有 json:generation 块，并清理多余空行，确保最终文案纯净
      const cleanedResponse = response
        .replace(/```json:generation\s*[\s\S]*?```/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return { message: cleanedResponse, skillCalls: [] };
    }
  }

  /**
   * 输入验证
   */
  private validateInput(task: AgentTask): void {
    if (!task.input.message || !task.input.message.trim()) {
      throw errorHandler.createError(
        ErrorType.VALIDATION,
        "任务消息不能为空",
        undefined,
        { taskId: task.id },
        false,
      );
    }

    if (!task.input.context) {
      throw errorHandler.createError(
        ErrorType.VALIDATION,
        "任务上下文缺失",
        undefined,
        { taskId: task.id },
        false,
      );
    }
  }

  /**
   * 更新任务状态
   */
  private updateTaskStatus(
    task: AgentTask,
    status: AgentTask["status"],
  ): AgentTask {
    return {
      ...task,
      status,
      updatedAt: Date.now(),
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
    const meta = task.input.metadata || {};
    const metaKey = `web:${!!meta.enableWebSearch}|force:${!!meta.forceSkills}`;
    const contextHash = task.input.context?.projectTitle || "";
    return `${this.agentInfo.id}:${task.input.message}:${contextHash}:${metaKey}`;
  }

  /**
   * 重置智能体
   */
  reset(): void {
    this.chat = null;
    this.executionCache.clear();
  }
}
