
export type ImageModel = string;
export type VideoModel = string;

export type DesignTaskMode =
  | 'generate'
  | 'edit'
  | 'touch-edit'
  | 'text-edit'
  | 'layout-edit'
  | 'research'
  | 'clarify'
  | 'respond'
  | 'workflow-step';

export interface BrandInfo {
  name?: string;
  colors?: string[];
  fonts?: string[];
  style?: string;
}

export interface DesignSessionState {
  taskMode: DesignTaskMode;
  brand: BrandInfo;
  styleHints: string[];
  subjectAnchors: string[];
  referenceSummary?: string;
  constraints: string[];
  forbiddenChanges: string[];
  approvedAssetIds: string[];
  researchSummary?: string;
  referenceWebPages?: Array<{ title: string; url: string }>;
}

export type ShapeType = 'square' | 'circle' | 'triangle' | 'star' | 'bubble' | 'arrow-left' | 'arrow-right';

export interface CanvasElement {
  id: string;
  type: 'image' | 'video' | 'shape' | 'text' | 'gen-image' | 'gen-video' | 'group';
  url?: string;
  originalUrl?: string;
  proxyUrl?: string;
  shapeType?: ShapeType;
  // Text specific properties
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  letterSpacing?: number;
  lineHeight?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textDecoration?: 'none' | 'underline' | 'line-through';
  opacity?: number;

  // Shape specific
  cornerRadius?: number;
  aspectRatioLocked?: boolean;

  // Gen Image/Video specific
  genPrompt?: string;
  genModel?: ImageModel | VideoModel;
  genAspectRatio?: string;
  genResolution?: '1K' | '2K' | '4K';
  detectedTexts?: { original: string, edited?: string }[];

  // Image Gen Reference
  genRefImage?: string;
  genRefImages?: string[];

  // Video Gen Specifics
  genStartFrame?: string;
  genEndFrame?: string;
  genVideoRefs?: string[];
  genDuration?: '4s' | '6s' | '8s' | '5s' | '10s'; // keeping 5s/10s for legacy
  genQuality?: '720p' | '1080p' | '4k';
  genFirstLastMode?: 'startEnd' | 'multiRef'; // Toggle for "Start/End Frame" vs "Multi Ref" in Veo 3.1

  isGenerating?: boolean;
  generatingType?: 'upscale' | 'vector' | 'remove-bg' | 'gen-image' | 'gen-video' | 'product-swap' | 'text-edit' | 'eraser';

  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  isLocked?: boolean;
  isHidden?: boolean;

  // Group support
  groupId?: string;
  children?: string[];
  isCollapsed?: boolean;
  originalChildData?: Record<string, { x: number; y: number; width: number; height: number; zIndex: number }>;
}

export interface Marker {
  id: string;
  x: number; // Relative to the element
  y: number; // Relative to the element
  elementId: string;
  cropUrl?: string; // The zoomed-in image data of the marked area
  label?: string; // User defined label
  analysis?: string; // AI analysis result
  width?: number; // Optional width of the marked region
  height?: number; // Optional height of the marked region
}


export interface ConversationSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  title: string;
  updatedAt: string;
  thumbnail?: string;
  elements?: CanvasElement[];
  markers?: Marker[];
  conversations?: ConversationSession[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  kind?: 'text' | 'workflow_ui';
  workflowUi?: WorkflowUiMessage;
  timestamp: number;
  attachments?: string[]; // Array of base64 images
  error?: boolean;
  relatedMarkerId?: string;
  // Agent structured data (Lovart-style)
  agentData?: {
    model?: string;
    title?: string;
    description?: string;
    imageUrls?: string[];
    videoUrls?: string[];
    assets?: any[];
    proposals?: Array<{
      id: string;
      title: string;
      description: string;
      skillCalls?: Array<{
        skillName: string;
        params: Record<string, any>;
      }>;
      prompt?: string;
      previewUrl?: string;
      concept_image?: string;
    }>;
    skillCalls?: Array<{
      skillName: string;
      success?: boolean;
      description?: string;
      title?: string;
      result?: any;
      params?: Record<string, any>;
      error?: string;
    }>;
    adjustments?: string[];
    analysis?: string;
    preGenerationMessage?: string;
    postGenerationSummary?: string;
    suggestions?: string[]; // 可点击的建议按钮（如"温馨日常故事"、"科技感风格"）
  };
  // User skill invocation structured data
  skillData?: {
    id: string;
    name: string;
    iconName: string;
    config?: Record<string, any>;
  };
}

export interface Template {
  id: string;
  title: string;
  description: string;
  image: string;
}

export interface InputBlock {
  id: string;
  type: 'text' | 'file';
  text?: string;
  file?: File;
}

// Agent System Types
export interface AgentChatMessage extends ChatMessage {
  agentId?: string;
  taskId?: string;
  skillCalls?: Array<{
    skillName: string;
    params: Record<string, any>;
    result?: any;
    error?: string;
  }>;
}

export interface ProjectContext {
  projectId: string;
  projectTitle: string;
  conversationId: string;
  brandInfo?: BrandInfo;
  designSession?: DesignSessionState;
  existingAssets: CanvasElement[];
  conversationHistory: ChatMessage[];
}
import type { WorkflowUiMessage } from './workflow.types';
