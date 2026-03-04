import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { AgentTask, AgentType } from '../types/agent.types';
import { ChatMessage, InputBlock, ImageModel, VideoModel } from '../types';

export type AttachmentSource = 'canvas' | 'upload';

export interface AttachmentItem {
  id: string;
  file: File;
  source: AttachmentSource;
  canvasElId?: string;
}

const ensureAttachmentId = (file: File): string => {
  const fileAny = file as any;
  if (typeof fileAny._attachmentId === 'string' && fileAny._attachmentId) {
    return fileAny._attachmentId;
  }
  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  fileAny._attachmentId = id;
  return id;
};

const collectConfirmedAttachmentsFromBlocks = (blocks: InputBlock[]): AttachmentItem[] => {
  const items: AttachmentItem[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    if (block.type !== 'file' || !block.file) continue;
    const file = block.file;
    const id = ensureAttachmentId(file);
    if (seen.has(id)) continue;
    seen.add(id);

    const fileAny = file as any;
    const source: AttachmentSource = (fileAny._canvasElId || fileAny._canvasAutoInsert) ? 'canvas' : 'upload';
    items.push({
      id,
      file,
      source,
      canvasElId: typeof fileAny._canvasElId === 'string' ? fileAny._canvasElId : undefined,
    });
  }

  return items;
};

const appendFileBlockToInput = (state: any, file: File) => {
  if (state.inputBlocks.length === 0) {
    state.inputBlocks.push({ id: `text-${Date.now()}`, type: 'text', text: '' });
  }

  const fileBlock: InputBlock = { id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type: 'file', file };
  const lastIndex = state.inputBlocks.length - 1;
  const lastBlock = state.inputBlocks[lastIndex];

  if (lastBlock?.type === 'text') {
    const lastText = lastBlock.text || '';

    if (lastText.length > 0) {
      const textBlock: InputBlock = { id: `text-${Date.now() + 1}`, type: 'text', text: '' };
      state.inputBlocks.push(fileBlock, textBlock);
      state.activeBlockId = textBlock.id;
      state.selectionIndex = 0;
      return;
    }

    state.inputBlocks.splice(lastIndex, 0, fileBlock);
    state.activeBlockId = lastBlock.id;
    state.selectionIndex = 0;
  } else {
    const textBlock: InputBlock = { id: `text-${Date.now() + 1}`, type: 'text', text: '' };
    state.inputBlocks.push(fileBlock, textBlock);
    state.activeBlockId = textBlock.id;
    state.selectionIndex = 0;
  }

  state.inputBlocks = normalizeInputBlocks(state.inputBlocks);
};

// ─── Pure helper: normalize input blocks ───
export function normalizeInputBlocks(blocks: InputBlock[]): InputBlock[] {
  if (blocks.length === 0) return [{ id: `text-${Date.now()}`, type: 'text', text: '' }];
  const result: InputBlock[] = [];
  for (const block of blocks) {
    const last = result[result.length - 1];

    if (block.type === 'file' && last?.type === 'file') {
      result.push({ id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type: 'text', text: '' });
    }

    if (block.type === 'text') {
      const currentLast = result[result.length - 1];
      if (currentLast && currentLast.type === 'text') {
        currentLast.text = (currentLast.text || '') + (block.text || '');
        continue;
      }
    }
    result.push({ ...block });
  }
  if (result[result.length - 1]?.type === 'file') {
    result.push({ id: `text-${Date.now()}`, type: 'text', text: '' });
  }
  return result;
}

interface AgentState {
  // 智能体模式
  isAgentMode: boolean;

  // 当前任务
  currentTask: AgentTask | null;

  // 消息和输入
  messages: ChatMessage[];
  inputBlocks: InputBlock[];
  activeBlockId: string;
  selectionIndex: number | null;
  pendingAttachments: AttachmentItem[];
  confirmedAttachments: AttachmentItem[];

  // 聊天状态
  isTyping: boolean;

  // 模型配置
  modelMode: 'thinking' | 'fast';
  webEnabled: boolean;
  imageModelEnabled: boolean;

  // 图像生成器配置
  imageGenRatio: string;
  imageGenRes: string;
  imageGenUploads: File[];
  isPickingFromCanvas: boolean;

  // 视频生成器配置
  videoGenRatio: string;
  videoGenDuration: string;
  videoGenQuality: string;
  videoGenModel: VideoModel;
  videoGenMode: 'startEnd' | 'multiRef';
  videoStartFrame: File | null;
  videoEndFrame: File | null;
  videoMultiRefs: File[];
  showVideoModelDropdown: boolean;

  // 文本编辑
  detectedTexts: string[];
  editedTexts: string[];
  isExtractingText: boolean;

  // 快捷编辑
  fastEditPrompt: string;

  // 擦除工具
  brushSize: number;
  upscaleMenuOpen: boolean;

  // Actions
  actions: {
    setIsAgentMode: (mode: boolean) => void;

    setCurrentTask: (task: AgentTask | null) => void;

    addMessage: (message: ChatMessage) => void;
    updateMessageAttachments: (messageId: string, attachments: string[]) => void;
    setMessages: (messages: ChatMessage[]) => void;
    clearMessages: () => void;

    setInputBlocks: (blocks: InputBlock[]) => void;
    addInputBlock: (block: InputBlock) => void;
    removeInputBlock: (id: string) => void;
    updateInputBlock: (id: string, updates: Partial<InputBlock>) => void;
    setActiveBlockId: (id: string) => void;
    setSelectionIndex: (index: number | null) => void;
    insertInputFile: (file: File) => void;
    appendInputFile: (file: File) => void;
    setPendingAttachments: (attachments: AttachmentItem[]) => void;
    addPendingAttachment: (attachment: AttachmentItem) => void;
    removePendingAttachment: (id: string) => void;
    confirmPendingAttachments: () => void;
    clearPendingAttachments: () => void;

    setIsTyping: (typing: boolean) => void;

    setModelMode: (mode: 'thinking' | 'fast') => void;
    setWebEnabled: (enabled: boolean) => void;
    setImageModelEnabled: (enabled: boolean) => void;

    setImageGenRatio: (ratio: string) => void;
    setImageGenRes: (res: string) => void;
    setImageGenUploads: (files: File[]) => void;
    setIsPickingFromCanvas: (picking: boolean) => void;

    setVideoGenRatio: (ratio: string) => void;
    setVideoGenDuration: (duration: string) => void;
    setVideoGenQuality: (quality: string) => void;
    setVideoGenModel: (model: VideoModel) => void;
    setVideoGenMode: (mode: 'startEnd' | 'multiRef') => void;
    setVideoStartFrame: (file: File | null) => void;
    setVideoEndFrame: (file: File | null) => void;
    setVideoMultiRefs: (refs: File[]) => void;
    setShowVideoModelDropdown: (show: boolean) => void;

    setDetectedTexts: (texts: string[]) => void;
    setEditedTexts: (texts: string[]) => void;
    setIsExtractingText: (extracting: boolean) => void;

    setFastEditPrompt: (prompt: string) => void;

    setBrushSize: (size: number) => void;
    setUpscaleMenuOpen: (open: boolean) => void;

    reset: () => void;
  };
}

const initialState = {
  isAgentMode: false,

  currentTask: null,

  messages: [],
  inputBlocks: [{ id: 'init', type: 'text' as const, text: '' }],
  activeBlockId: 'init',
  selectionIndex: null,
  pendingAttachments: [] as AttachmentItem[],
  confirmedAttachments: [] as AttachmentItem[],

  isTyping: false,

  modelMode: 'fast' as const,
  webEnabled: false,
  imageModelEnabled: false,

  imageGenRatio: '1:1',
  imageGenRes: '1K',
  imageGenUploads: [] as File[],
  isPickingFromCanvas: false,

  videoGenRatio: '16:9',
  videoGenDuration: '5s',
  videoGenQuality: '1080p',
  videoGenModel: 'veo-3.1-fast-generate-preview' as VideoModel,
  videoGenMode: 'startEnd' as const,
  videoStartFrame: null,
  videoEndFrame: null,
  videoMultiRefs: [] as File[],
  showVideoModelDropdown: false,

  detectedTexts: [],
  editedTexts: [],
  isExtractingText: false,

  fastEditPrompt: '',

  brushSize: 30,
  upscaleMenuOpen: false,
};

export const useAgentStore = create<AgentState>()(
  devtools(
    immer((set) => ({
      ...initialState,

      actions: {
        setIsAgentMode: (mode) => set({ isAgentMode: mode }),

        setCurrentTask: (task) => set({ currentTask: task }),

        addMessage: (message) => set((state) => {
          state.messages.push(message);
        }),

        updateMessageAttachments: (messageId, attachments) => set((state) => {
          const msg = state.messages.find(m => m.id === messageId);
          if (msg) {
            msg.attachments = attachments;
          }
        }),

        setMessages: (messages) => set({ messages }),

        clearMessages: () => set({ messages: [], inputBlocks: [{ id: 'init', type: 'text', text: '' }], pendingAttachments: [], confirmedAttachments: [] }),

        setInputBlocks: (blocks) => {
          const normalized = normalizeInputBlocks(blocks);
          set({ inputBlocks: normalized, confirmedAttachments: collectConfirmedAttachmentsFromBlocks(normalized) });
        },

        addInputBlock: (block) => set((state) => {
          state.inputBlocks.push(block);
          state.confirmedAttachments = collectConfirmedAttachmentsFromBlocks(state.inputBlocks);
        }),

        removeInputBlock: (id) => set((state) => {
          const idx = state.inputBlocks.findIndex(b => b.id === id);
          if (idx === -1) return;

          const left = state.inputBlocks[idx - 1];
          const right = state.inputBlocks[idx + 1];

          if (left?.type === 'text' && right?.type === 'text') {
            left.text = (left.text || '') + (right.text || '');
            state.inputBlocks.splice(idx, 2);
          } else {
            state.inputBlocks.splice(idx, 1);
            if (state.inputBlocks.length === 0) {
              state.inputBlocks.push({ id: `text-${Date.now()}`, type: 'text', text: '' });
            }
          }

          state.confirmedAttachments = collectConfirmedAttachmentsFromBlocks(state.inputBlocks);
        }),

        updateInputBlock: (id, updates) => set((state) => {
          const block = state.inputBlocks.find(b => b.id === id);
          if (block) {
            Object.assign(block, updates);
            state.confirmedAttachments = collectConfirmedAttachmentsFromBlocks(state.inputBlocks);
          }
        }),

        setActiveBlockId: (id) => set({ activeBlockId: id }),
        setSelectionIndex: (index) => set({ selectionIndex: index }),

        insertInputFile: (file) => set((state) => {
          const activeIndex = state.inputBlocks.findIndex(b => b.id === state.activeBlockId);

          if (activeIndex === -1) {
            const fileBlock: InputBlock = { id: `file-${Date.now()}`, type: 'file', file };
            const textBlock: InputBlock = { id: `text-${Date.now() + 1}`, type: 'text', text: '' };
            state.inputBlocks.push(fileBlock, textBlock);
            state.activeBlockId = textBlock.id;
            state.selectionIndex = 0;
            return;
          }

          const activeBlock = state.inputBlocks[activeIndex];

          if (activeBlock.type === 'text') {
            const text = activeBlock.text || '';
            const idx = state.selectionIndex !== null ? state.selectionIndex : text.length;
            const preText = text.slice(0, idx);
            const postText = text.slice(idx);
            const newTextBlockId = `text-${Date.now() + 1}`;

            const newBlocks: InputBlock[] = [
              { ...activeBlock, text: preText },
              { id: `file-${Date.now()}`, type: 'file', file },
              { id: newTextBlockId, type: 'text', text: postText }
            ];

            state.inputBlocks.splice(activeIndex, 1, ...newBlocks);
            state.activeBlockId = newTextBlockId;
            state.selectionIndex = 0;
            // Focus is handled reactively via useEffect on activeBlockId in the UI
          } else {
            const fileBlock: InputBlock = { id: `file-${Date.now()}`, type: 'file', file };
            const textBlock: InputBlock = { id: `text-${Date.now() + 1}`, type: 'text', text: '' };
            state.inputBlocks.push(fileBlock, textBlock);
            state.activeBlockId = textBlock.id;
            state.selectionIndex = 0;
          }

          state.confirmedAttachments = collectConfirmedAttachmentsFromBlocks(state.inputBlocks);
        }),

        appendInputFile: (file) => set((state) => {
          appendFileBlockToInput(state, file);
          state.confirmedAttachments = collectConfirmedAttachmentsFromBlocks(state.inputBlocks);
        }),

        setPendingAttachments: (attachments) => set((state) => {
          state.pendingAttachments = attachments;
        }),

        addPendingAttachment: (attachment) => set((state) => {
          if (!state.pendingAttachments.find(a => a.id === attachment.id)) {
            state.pendingAttachments.push(attachment);
          }
        }),

        removePendingAttachment: (id) => set((state) => {
          state.pendingAttachments = state.pendingAttachments.filter(a => a.id !== id);
        }),

        confirmPendingAttachments: () => set((state) => {
          const pendings = state.pendingAttachments;
          if (pendings.length === 0) return;

          for (const pending of pendings) {
            (pending.file as any)._canvasAutoInsert = false;
            appendFileBlockToInput(state, pending.file);
          }

          state.confirmedAttachments = collectConfirmedAttachmentsFromBlocks(state.inputBlocks);
          state.pendingAttachments = [];
        }),

        clearPendingAttachments: () => set({ pendingAttachments: [] }),

        setIsTyping: (typing) => set({ isTyping: typing }),

        setModelMode: (mode) => set({ modelMode: mode }),
        setWebEnabled: (enabled) => set({ webEnabled: enabled }),
        setImageModelEnabled: (enabled) => set({ imageModelEnabled: enabled }),

        setImageGenRatio: (ratio) => set({ imageGenRatio: ratio }),
        setImageGenRes: (res) => set({ imageGenRes: res }),
        setImageGenUploads: (files) => set({ imageGenUploads: files }),
        setIsPickingFromCanvas: (picking) => set({ isPickingFromCanvas: picking }),

        setVideoGenRatio: (ratio) => set({ videoGenRatio: ratio }),
        setVideoGenDuration: (duration) => set({ videoGenDuration: duration }),
        setVideoGenQuality: (quality) => set({ videoGenQuality: quality }),
        setVideoGenModel: (model) => set({ videoGenModel: model }),
        setVideoGenMode: (mode) => set({ videoGenMode: mode }),
        setVideoStartFrame: (file) => set({ videoStartFrame: file }),
        setVideoEndFrame: (file) => set({ videoEndFrame: file }),
        setVideoMultiRefs: (refs) => set({ videoMultiRefs: refs }),
        setShowVideoModelDropdown: (show) => set({ showVideoModelDropdown: show }),

        setDetectedTexts: (texts) => set({ detectedTexts: texts }),
        setEditedTexts: (texts) => set({ editedTexts: texts }),
        setIsExtractingText: (extracting) => set({ isExtractingText: extracting }),

        setFastEditPrompt: (prompt) => set({ fastEditPrompt: prompt }),

        setBrushSize: (size) => set({ brushSize: size }),
        setUpscaleMenuOpen: (open) => set({ upscaleMenuOpen: open }),

        reset: () => set(initialState),
      }
    })),
    { name: 'AgentStore' })
);

// ─── Selectors（避免组件订阅整个 store 导致不必要的重渲染）───
export const useAgentMode = () => useAgentStore(s => s.isAgentMode);
export const useAgentMessages = () => useAgentStore(s => s.messages);
export const useAgentTyping = () => useAgentStore(s => s.isTyping);
export const useCurrentTask = () => useAgentStore(s => s.currentTask);
export const useInputBlocks = () => useAgentStore(s => s.inputBlocks);
export const useModelMode = () => useAgentStore(s => s.modelMode);
export const useAgentActions = () => useAgentStore(s => s.actions);
