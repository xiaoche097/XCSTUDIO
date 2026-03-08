/**
 * 本地关键词预路由
 * 不依赖API，0延迟，作为API路由的降级方案
 * 当Gemini API不可用时，仍能将用户请求路由到正确的智能体
 */

import { AgentType } from '../../types/agent.types';
import { detectOptimizeOnlyIntent } from './prompt-optimizer/intent';
import { AGENT_ROUTE_RULES, CHAT_PATTERNS, EDIT_KEYWORDS, VAGUE_PATTERNS } from './routing-rules';

/**
 * 检测是否为修改/编辑类请求
 */
export function isEditRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return EDIT_KEYWORDS.some(k => lower.includes(k));
}

/**
 * 本地关键词路由
 * 注意：修改/编辑类请求不走本地路由，返回 null 让 API 路由处理
 * @returns 匹配到的智能体类型，未匹配返回 null
 */
export function localPreRoute(message: string): AgentType | null {
  if (detectOptimizeOnlyIntent(message)) {
    return 'prompt-optimizer';
  }

  // 修改/编辑类请求需要更精确的意图分析，不走本地路由
  if (isEditRequest(message)) {
    return null;
  }

  // 闲聊类消息也不走本地路由
  if (isChatMessage(message)) {
    return null;
  }

  const lower = message.toLowerCase();

  // 复合意图检测（优先于通用关键词匹配）
  const hasVideoKeyword = /视频|video|动画|animation|片头|转场/.test(lower);
  const hasStoryboardKeyword = /分镜|故事板|九宫格|storyboard|镜头|shot list/.test(lower);
  const hasEcommerceKeyword = /电商|亚马逊|amazon|listing|副图|主图|详情图|shopify|淘宝|天猫/.test(lower);

  if (hasVideoKeyword && hasStoryboardKeyword) return 'cameron';
  if (hasVideoKeyword && hasEcommerceKeyword) return 'campaign';

  let bestMatch: { agent: AgentType; priority: number; matchCount: number } | null = null;

  for (const rule of AGENT_ROUTE_RULES) {
    const matchCount = rule.keywords.filter(k => lower.includes(k)).length;
    if (matchCount > 0) {
      // 优先选择优先级高的（数字越小越高），同优先级再比匹配数量
      if (!bestMatch || rule.priority < bestMatch.priority ||
        (rule.priority === bestMatch.priority && matchCount > bestMatch.matchCount)) {
        bestMatch = { agent: rule.agent, priority: rule.priority, matchCount };
      }
    }
  }

  // 未匹配到任何规则时返回 null，让消息流入 LLM 路由做语义分析
  // poster fallback 仅在 Hook 层作为最终兜底
  return bestMatch?.agent || null;
}

/**
 * 检测是否为闲聊/问候类消息（不需要路由到设计智能体）
 */
export function isChatMessage(message: string): boolean {
  return CHAT_PATTERNS.some(p => p.test(message.trim()));
}

/**
 * 检测是否为模糊/不明确的请求
 */
export function isVagueRequest(message: string): boolean {
  return VAGUE_PATTERNS.some(p => p.test(message.trim()));
}
