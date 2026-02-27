
export type ShapeType = 'square' | 'circle' | 'triangle' | 'star' | 'bubble' | 'arrow-left' | 'arrow-right';

export interface CanvasElement {
  id: string;
  type: 'image' | 'video' | 'shape' | 'text' | 'gen-image' | 'gen-video' | 'group';
  url?: string;
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
  genModel?: 'Nano Banana Pro' | 'Veo 3.1' | 'Veo 3.1 Fast' | 'Kling 2.6';
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

  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;

  // Group support
  groupId?: string;
  children?: string[];
  isCollapsed?: boolean;
  originalChildData?: Record<string, { x: number; y: number; width: number; height: number; zIndex: number }>;
}

export interface Marker {
  id: number;
  x: number; // Relative to the element
  y: number; // Relative to the element
  elementId: string;
  cropUrl?: string; // The zoomed-in image data of the marked area
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
  timestamp: number;
  attachments?: string[]; // Array of base64 images
  relatedMarkerId?: number;
  // Agent structured data (Lovart-style)
    agentData?: {
      model?: string;
      title?: string;
      description?: string;
      imageUrls?: string[];
      videoUrls?: string[];
      assets?: any[];
      adjustments?: string[];
      analysis?: string;
      suggestions?: string[]; // 可点击的建议按钮（如"温馨日常故事"、"科技感风格"）
    };
  // User skill invocation structured data
  skillData?: {
    id: string;
    name: string;
    iconName: string;
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
  brandInfo?: {
    name?: string;
    colors?: string[];
    fonts?: string[];
    style?: string;
  };
  existingAssets: CanvasElement[];
  conversationHistory: ChatMessage[];
}
