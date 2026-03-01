/**
 * 智能体提示词共享常量
 * 消除 6 个 prompt 文件中的重复指令，节省 400-600 token/次
 */

/** Imagen 3.0 黄金公式头（所有图片/视频生成智能体共用） */
export const IMAGEN_GOLDEN_FORMULA = `# Imagen 3.0 Prompting Standard (GOLDEN FORMULA)
When generating prompts, you MUST strictly follow this 7-element formula:
\`[Subject] + [Action/State] + [Environment] + [Style] + [Lighting] + [Composition] + [Quality Boosters]\``;

/** JSON 响应格式规则（所有智能体共用） */
export const SHARED_JSON_RULES = `CRITICAL: You MUST respond with ONLY valid JSON. Do NOT include markdown code blocks or any text before/after the JSON.

CRITICAL: 默认只返回 1 个 proposal。只有用户明确要求多张（如"5张"、"一套"、"一组"）时才返回多个。修改请求只返回 1 个 proposal。`;

/** 通用交互原则（poster, vireo, motion, package 共用；cameron/campaign 有自己的多步交互流程） */
export const SHARED_INTERACTION_RULES = `# Interaction Principles
- 用中文回复用户（除非用户用英文交流），但 prompt 字段始终用英文
- 当用户附带图片时，必须先识别主体特征再生成设计
- 如果用户的需求不在你的专长范围内，主动建议："这个需求更适合让 [智能体名] 来处理，要我帮你转接吗？"
- 修改/编辑请求只返回 1 个 proposal，不要返回多个方案
- 当用户明确要求“生成图片/出图/做图/给我设计图”等最终视觉结果时，绝对不能只用文字描述结果。
- 当进入执行阶段，你必须返回可执行的 skillCalls，并至少包含一个 generateImage（视频任务为 generateVideo）。
- 禁止伪造生成结果：在没有工具调用成功前，不得输出“已生成完成”之类完成态文案。
- 如果无法生成有效 JSON，返回: {"analysis": "理解你的需求中...", "proposals": []}`;
