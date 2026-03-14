import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

type ToolType = 'select' | 'hand' | 'mark';
type CreationMode = 'agent' | 'chat' | 'image' | 'video';

interface UIState {
  // 工具和模式
  activeTool: ToolType;
  creationMode: CreationMode;
  
  // 面板显示状态
  showAssistant: boolean;
  showLayersPanel: boolean;
  isLayersCollapsed: boolean;
  
  // 菜单和弹窗
  showToolMenu: boolean;
  showInsertMenu: boolean;
  showShapeMenu: boolean;
  showFontPicker: boolean;
  showModelPicker: boolean;
  showRatioPicker: boolean;
  showResPicker: boolean;
  showModeSelector: boolean;
  showHistoryPopover: boolean;
  showFileListModal: boolean;
  showTextEditModal: boolean;
  
  // 编辑模式
  showFastEdit: boolean;
  eraserMode: boolean;
  
  // 上下文菜单
  contextMenu: { x: number; y: number } | null;
  
  // 预览
  previewUrl: string | null;
  hoveredMarkerId: number | null;
  hoveredChipId: string | null;
  selectedChipId: string | null;
  
  // 按键状态
  isSpacePressed: boolean;
  
  // Actions
  actions: {
    setActiveTool: (tool: ToolType) => void;
    setCreationMode: (mode: CreationMode) => void;
    
    toggleAssistant: () => void;
    toggleLayersPanel: () => void;
    toggleLayersCollapsed: () => void;
    
    setShowToolMenu: (show: boolean) => void;
    setShowInsertMenu: (show: boolean) => void;
    setShowShapeMenu: (show: boolean) => void;
    setShowFontPicker: (show: boolean) => void;
    setShowModelPicker: (show: boolean) => void;
    setShowRatioPicker: (show: boolean) => void;
    setShowResPicker: (show: boolean) => void;
    setShowModeSelector: (show: boolean) => void;
    setShowHistoryPopover: (show: boolean) => void;
    setShowFileListModal: (show: boolean) => void;
    setShowTextEditModal: (show: boolean) => void;
    
    setShowFastEdit: (show: boolean) => void;
    setEraserMode: (mode: boolean) => void;
    
    setContextMenu: (menu: { x: number; y: number } | null) => void;
    setPreviewUrl: (url: string | null) => void;
    setHoveredMarkerId: (id: number | null) => void;
    setHoveredChipId: (id: string | null) => void;
    setSelectedChipId: (id: string | null) => void;
    
    setIsSpacePressed: (pressed: boolean) => void;
    
    closeAllMenus: () => void;
    reset: () => void;
  };
}

const initialState = {
  activeTool: 'select' as ToolType,
  creationMode: 'agent' as CreationMode,
  
  showAssistant: true,
  showLayersPanel: true,
  isLayersCollapsed: true,
  
  showToolMenu: false,
  showInsertMenu: false,
  showShapeMenu: false,
  showFontPicker: false,
  showModelPicker: false,
  showRatioPicker: false,
  showResPicker: false,
  showModeSelector: false,
  showHistoryPopover: false,
  showFileListModal: false,
  showTextEditModal: false,
  
  showFastEdit: false,
  eraserMode: false,
  
  contextMenu: null,
  previewUrl: null,
  hoveredMarkerId: null,
  hoveredChipId: null,
  selectedChipId: null,
  
  isSpacePressed: false,
};

export const useUIStore = create<UIState>()(
  devtools(
  immer((set) => ({
    ...initialState,
    
    actions: {
      setActiveTool: (tool) => set({ activeTool: tool }),
      setCreationMode: (mode) => set({ creationMode: mode }),
      
      toggleAssistant: () => set((state) => { 
        state.showAssistant = !state.showAssistant;
      }),
      
      toggleLayersPanel: () => set((state) => {
        state.showLayersPanel = !state.showLayersPanel;
      }),
      
      toggleLayersCollapsed: () => set((state) => {
        state.isLayersCollapsed = !state.isLayersCollapsed;
      }),
      
      setShowToolMenu: (show) => set({ showToolMenu: show }),
      setShowInsertMenu: (show) => set({ showInsertMenu: show }),
      setShowShapeMenu: (show) => set({ showShapeMenu: show }),
      setShowFontPicker: (show) => set({ showFontPicker: show }),
      setShowModelPicker: (show) => set({ showModelPicker: show }),
      setShowRatioPicker: (show) => set({ showRatioPicker: show }),
      setShowResPicker: (show) => set({ showResPicker: show }),
      setShowModeSelector: (show) => set({ showModeSelector: show }),
      setShowHistoryPopover: (show) => set({ showHistoryPopover: show }),
      setShowFileListModal: (show) => set({ showFileListModal: show }),
      setShowTextEditModal: (show) => set({ showTextEditModal: show }),
      
      setShowFastEdit: (show) => set({ showFastEdit: show }),
      setEraserMode: (mode) => set({ eraserMode: mode }),
      
      setContextMenu: (menu) => set({ contextMenu: menu }),
      setPreviewUrl: (url) => set({ previewUrl: url }),
      setHoveredMarkerId: (id) => set({ hoveredMarkerId: id }),
      setHoveredChipId: (id) => set({ hoveredChipId: id }),
      setSelectedChipId: (id) => set({ selectedChipId: id }),
      
      setIsSpacePressed: (pressed) => set({ isSpacePressed: pressed }),
      
      closeAllMenus: () => set({
        showToolMenu: false,
        showInsertMenu: false,
        showShapeMenu: false,
        showFontPicker: false,
        showModelPicker: false,
        showRatioPicker: false,
        showResPicker: false,
        showModeSelector: false,
        contextMenu: null,
      }),
      
      reset: () => set(initialState),
    }
  })),
  { name: 'UIStore' })
);
