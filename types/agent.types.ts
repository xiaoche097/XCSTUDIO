export type { ProjectContext } from './common';
import type { ProjectContext } from './common';

export type AgentType = 'coco' | 'vireo' | 'cameron' | 'poster' | 'package' | 'motion' | 'campaign';

export interface AgentInfo {
  id: AgentType;
  name: string;
  avatar: string;
  description: string;
  capabilities: string[];
  color: string;
}

export interface AgentRoutingDecision {
  targetAgent: AgentType;
  taskType: string;
  complexity: 'simple' | 'complex';
  handoffMessage: string;
  confidence: number;
}

export type TaskStatus = 'pending' | 'analyzing' | 'executing' | 'completed' | 'failed';

export interface AgentProposal {
  id: string;
  title: string;
  description: string;
  preview?: string;
  skillCalls: SkillCall[];
}

export interface AgentTask {
  id: string;
  agentId: AgentType;
  status: TaskStatus;
  progressMessage?: string;  // 实时进度消息（如"收集灵感..."、"生成图片中..."）
  progressStep?: number;     // 当前步骤 (1-based)
  totalSteps?: number;       // 总步骤数
  input: {
    message: string;
    attachments?: File[];
    context: ProjectContext;
    metadata?: Record<string, any>;
  };
  output?: {
    message: string;
    analysis?: string;
    proposals?: AgentProposal[];
    assets?: GeneratedAsset[];
    imageUrls?: string[];
    skillCalls?: SkillCall[];
    adjustments?: string[];
    error?: { message: string; code?: string; details?: unknown };
  };
  createdAt: number;
  updatedAt: number;
}

export interface GeneratedAsset {
  id: string;
  type: 'image' | 'video' | 'text';
  url: string;
  metadata: {
    prompt?: string;
    model?: string;
    agentId: AgentType;
    width?: number;
    height?: number;
  };
}



export interface SkillCall {
  skillName: string;
  params: Record<string, any>;
  result?: any;
  error?: string;
}
