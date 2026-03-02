
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronDown, Minus, Plus, Share2, Maximize2, X, RotateCw,
    ArrowUp, Paperclip, Lightbulb, Zap, Globe, Box, Sparkles,
    MousePointer2, Square, Type, PenTool, Image as ImageIcon,
    History, Settings, Layers, Hand, MapPin, Check, Command,
    Video, Hash, Trash2, Undo2, Redo2, FileText,
    Triangle, Star, MessageSquare, ArrowLeft, ArrowRight, Circle as CircleIcon,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    Bold as BoldIcon, Italic, Underline, Strikethrough,
    Type as TypeIcon, MoreHorizontal, Download, Search, Move,
    ChevronUp, Loader2, ImagePlus, ChevronRight, CornerUpRight, Link2, Link as LinkIcon, Unlink,
    Minimize2, Play, Film, Clock, SquarePen, Folder, PanelRightClose,
    Eraser, Scissors, Shirt, Expand, Crop, MonitorUp, Highlighter,
    Gift, Store, Layout, Copy, Info, MessageSquarePlus, File as FileIcon, CirclePlus,
    Scan, ZoomIn, Scaling, Wand2, Banana,
    Lock, Unlock, Eye, EyeOff, FolderOpen, ChevronLeft
} from 'lucide-react';
import { createChatSession, sendMessage, generateImage, generateVideo, extractTextFromImage, analyzeImageRegion } from '../services/gemini';
import { ChatMessage, Template, CanvasElement, ShapeType, Marker, Project, ConversationSession, ImageModel, VideoModel } from '../types';
import { getProject, saveProject, formatDate } from '../services/storage';
import { Content } from '@google/genai';
import { useAgentOrchestrator } from '../hooks/useAgentOrchestrator';
import { useProjectContext } from '../hooks/useProjectContext';
import { getAgentInfo, executeAgentTask } from '../services/agents';
import { localPreRoute } from '../services/agents/local-router';
import { AgentAvatar } from '../components/agents/AgentAvatar';
import { useAgentStore, normalizeInputBlocks } from '../stores/agent.store';
import { MessageList, AssistantSidebar, InputArea } from './Workspace/components';
import { ToolbarBottom } from './Workspace/components/ToolbarBottom';
import { assetsToCanvasElementsAtCenter } from '../utils/canvas-helpers';
import { AgentSelector } from '../components/agents/AgentSelector';
import { TaskProgress } from '../components/agents/TaskProgress';
import { AgentType } from '../types/agent.types';
import { imageGenSkill } from '../services/skills/image-gen.skill';
import { videoGenSkill } from '../services/skills/video-gen.skill';
import { smartEditSkill } from '../services/skills/smart-edit.skill';
import { touchEditSkill } from '../services/skills/touch-edit.skill';
import { exportSkill } from '../services/skills/export.skill';


const TEMPLATES: Template[] = [
    { id: '1', title: 'Wine List', description: 'Mimic this effect to generate a poster of ...', image: 'https://picsum.photos/80/80?random=10' },
    { id: '2', title: 'Coffee Shop Branding', description: 'you are a brand design expert, generate ...', image: 'https://picsum.photos/80/80?random=11' },
    { id: '3', title: 'Story Board', description: 'I NEED A STORY BOARD FOR THIS...', image: 'https://picsum.photos/80/80?random=12' },
];

const FONTS = [
    'Inter', 'Anonymous Pro', 'Crimson Text', 'Albert Sans',
    'Roboto', 'Roboto Mono', 'Source Serif Pro', 'Pacifico',
    'Helvetica', 'Arial', 'Times New Roman'
];

const ASPECT_RATIOS = [
    { label: '21:9', value: '21:9', size: '1568*672', width: 1568, height: 672 },
    { label: '16:9', value: '16:9', size: '1456*816', width: 1456, height: 816 },
    { label: '4:3', value: '4:3', size: '1232*928', width: 1232, height: 928 },
    { label: '3:2', value: '3:2', size: '1344*896', width: 1344, height: 896 },
    { label: '1:1', value: '1:1', size: '1024*1024', width: 1024, height: 1024 },
    { label: '9:16', value: '9:16', size: '816*1456', width: 816, height: 1456 },
    { label: '3:4', value: '3:4', size: '928*1232', width: 928, height: 1232 },
    { label: '2:3', value: '2:3', size: '896*1344', width: 896, height: 1344 },
    { label: '5:4', value: '5:4', size: '1280*1024', width: 1280, height: 1024 },
    { label: '4:5', value: '4:5', size: '1024*1280', width: 1024, height: 1280 },
];

const renderRatioIcon = (ratioStr: string, isActive: boolean = false) => {
    const [wStr, hStr] = ratioStr.split(':');
    const w = parseFloat(wStr) || 1;
    const h = parseFloat(hStr) || 1;
    const maxDim = 14;
    const scaledW = w > h ? maxDim : maxDim * (w / h);
    const scaledH = h > w ? maxDim : maxDim * (h / w);
    return (
        <div className="flex items-center justify-center w-5 h-5 shrink-0">
            <div className={`border-[1.5px] rounded-[2px] transition-colors ${isActive ? 'border-blue-600' : 'border-gray-400'}`} style={{ width: scaledW, height: scaledH }} />
        </div>
    );
};

const VIDEO_RATIOS = [
    { label: '16:9', value: '16:9', icon: 'rectangle-horizontal' },
    { label: '9:16', value: '9:16', icon: 'rectangle-vertical' },
    { label: '1:1', value: '1:1', icon: 'square' },
];

const DEFAULT_AUTO_IMAGE_MODEL: ImageModel = 'Nano Banana Pro';

const PREFERRED_IMAGE_MODEL_TO_STORAGE_ID: Partial<Record<ImageModel, string>> = {
    'Nano Banana Pro': 'gemini-3-pro-image-preview',
    'NanoBanana2': 'gemini-3.1-flash-image-preview',
    'Seedream5.0': 'doubao-seedream-5-0-260128',
};

const STORAGE_ID_TO_PREFERRED_IMAGE_MODEL: Record<string, ImageModel> = {
    'gemini-3-pro-image-preview': 'Nano Banana Pro',
    'Nano Banana Pro': 'Nano Banana Pro',
    'gemini-3.1-flash-image-preview': 'NanoBanana2',
    'NanoBanana2': 'NanoBanana2',
    'doubao-seedream-5-0-260128': 'Seedream5.0',
    'Seedream5.0': 'Seedream5.0',
    'GPT Image 1.5': 'GPT Image 1.5',
    'Flux.2 Max': 'Flux.2 Max',
};

const UPSCALE_STRATEGIES = {
    standard: {
        name: '标准增强',
        desc: '常规高清放大，保留原始细节',
        prompt: 'Enhance and upscale this image to higher resolution while preserving all details'
    },
    vector: {
        name: '矢量草图',
        desc: '将图像解析为专业级矢量线稿',
        prompt: `【任务】将输入图像解析为专业级矢量线稿\n\n【自适应分析】\n首先识别画面主体类型，动态调整线条策略：\n- 生物类：捕捉毛发走向、皮肤褶皱、肌肉轮廓\n- 建筑/物品：强调结构边缘、材质分界、几何关系\n- 自然景观：表现植被层次、地形起伏、水纹流向\n- 织物/软质：体现垂坠感、褶皱逻辑、编织纹理\n\n【线条层级系统】\nL1 主轮廓：定义物体边界与剪影\nL2 结构线：表达体积转折、内部形态\nL3 细节线：材质特征、微观纹理走向\nL4 氛围线：暗示光影边界、空间深度（可选）\n\n【输出标准】\n✓ 纯黑白、线条闭合流畅、层次分明\n✗ 禁止：灰度填充、渐变、模糊、噪点`
    },
    color: {
        name: '色彩分析',
        desc: '生成专业级平面色彩构成分析图',
        prompt: `【任务】生成专业级平面色彩构成分析图\n\n【动态识别流程】\n\n第一步：智能区域划分\n根据画面内容自适应识别：\n- 主体与背景的边界\n- 不同材质/物体的分界\n- 色彩自然过渡的断点\n- 光影造成的色域变化\n\n第二步：色块提纯与填充\n- 每个识别区域 → 提取代表色 → 均匀填充\n- 保留色彩的层级关系与空间暗示\n- 相邻色块需有足够的明度/色相区分\n\n第三步：全面净化\n移除所有非色彩本质的信息：\n× 光影（高光、阴影、环境光）\n× 材质（纹理、反射、透明度）\n× 噪声（颗粒、杂色、压缩痕迹）\n\n【输出】\n边界清晰的纯色块构成图，\n色彩关系 = 唯一视觉语言，\n可直接用于配色提案或风格化创作`
    },
    detail: {
        name: '超清重绘',
        desc: '深度解析并生成高细节复刻图',
        prompt: `【图像深度解析与提示词生成框架】\n\n根据输入图像，按以下模块输出完整提示词：\n\n══ A. 核心主题 ══\n• 主体识别：[具体是什么——人/物/景/场景]\n• 核心叙事：[画面在表达/传递什么]\n• 构图逻辑：[视觉引导、元素排列、空间层次]\n\n══ B. 风格与质感 ══\n• 艺术风格：[写实/插画/3D/特定流派]\n• 色彩体系：[主色调、配色逻辑、冷暖氛围]\n• 光影设计：[光源、明暗比、光质软硬]\n• 材质表现：[根据主体动态描述]\n\n══ C. 细节层级（核心） ══\n• 宏观细节：[整体形态、大结构特征]\n• 中观细节：[局部特征、材质分界、色彩过渡]\n• 微观细节：[根据主体类型动态捕捉]\n  - 生物：毛发丝缕、皮肤毛孔、眼睛湿润反光、血管纹理\n  - 建筑：砖缝灰浆、锈蚀痕迹、玻璃反射、墙面风化\n  - 自然：叶脉经络、水珠折射、岩石层理、云层厚度\n  - 物品：使用磨损、划痕包浆、接缝工艺、材质颗粒\n  - 织物：编织纹理、纤维走向、褶皱阴影、边缘毛边\n\n══ D. 氛围与情绪 ══\n• 整体氛围：[宁静/紧张/梦幻/史诗/日常等]\n• 时间暗示：[季节、时段、年代感]\n• 故事张力：[画面暗示的前因后果]\n\n══ E. 技术参数 ══\n• 视角：[广角/标准/微距/鸟瞰/平视]\n• 景深：[全景深/选择性虚化/焦点位置]\n• 清晰度：[锐利边缘/柔焦/运动模糊]\n• 渲染品质：[照片级/超写实/风格化]`
    }
};

type ToolType = 'select' | 'hand' | 'mark' | 'insert' | 'shape' | 'text' | 'brush' | 'eraser';

// Utility to compress image to max dimensions to save storage and improve performance
const compressImage = (file: File, maxDim: number = 2048): Promise<string> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const resultUrl = e.target?.result as string;
            // Never compress if the file is < 10MB
            if (file.size <= 10 * 1024 * 1024) {
                resolve(resultUrl);
                return;
            }

            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = (height / width) * maxDim;
                        width = maxDim;
                    } else {
                        width = (width / height) * maxDim;
                        height = maxDim;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.85));
                } else {
                    resolve(resultUrl);
                }
            };
            img.src = resultUrl;
        };
        reader.readAsDataURL(file);
    });
};

// Utility to convert Base64 to File
const dataURLtoFile = (dataUrl: string, filename: string): File => {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
};

const TooltipButton = ({ icon: Icon, label, onClick, active, showTooltipOnHover = true }: { icon: any, label: string, onClick?: () => void, active?: boolean, showTooltipOnHover?: boolean }) => (
    <div className="relative group">
        <button
            onClick={onClick}
            className={`p-2.5 rounded-xl transition ${active ? 'text-white bg-gray-800' : 'text-gray-500 hover:text-black hover:bg-gray-100'}`}
        >
            <Icon size={18} />
        </button>
        {showTooltipOnHover && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-sm">
                {label}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
            </div>
        )}
    </div>
);

const ShapeMenuItem = ({ icon: Icon, onClick }: { icon: any, onClick: () => void }) => (
    <button
        onClick={onClick}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-black transition"
    >
        <Icon size={18} strokeWidth={1.5} />
    </button>
);

interface HistoryState {
    elements: CanvasElement[];
    markers: Marker[];
}

interface InputBlock {
    id: string;
    type: 'text' | 'file';
    text?: string;
    file?: File;
}

// (Removed legacy localStorage conversation logic - now completely handled by IndexedDB within the Project object to prevent QuotaExceeded errors and isolate conversations)

// Using IndexedDB now for saveConversations via saveProject

const LayerItem = ({ el, isSelected, onSelect, onToggleLock, onToggleHide, onToggleCollapse, onEnterGroup, depth = 0 }: {
    el: any, isSelected: boolean, onSelect: (e: React.MouseEvent, id: string) => void,
    onToggleLock: (id: string) => void, onToggleHide: (id: string) => void,
    onToggleCollapse?: (id: string) => void,
    onEnterGroup?: (id: string) => void, depth?: number
}) => (
    <div
        onClick={(e) => onSelect(e, el.id)}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition group/item ${isSelected ? 'bg-blue-50 border border-blue-100' : 'hover:bg-gray-50 border border-transparent'}`}
        style={{ marginLeft: depth * 12 }}
    >
        <div className="w-8 h-8 bg-gray-50 rounded-md border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
            {el.type === 'text' && <span className="font-serif text-gray-500 text-[10px]">T</span>}
            {el.type === 'image' && el.url && <img src={el.url} className="w-full h-full object-cover" />}
            {(el.type === 'video' || el.type === 'gen-video') && <Video size={14} className="text-gray-500" />}
            {el.type === 'shape' && <Box size={14} className="text-gray-500" />}
            {el.type === 'gen-image' && <ImagePlus size={14} className="text-blue-500" />}
            {el.type === 'group' && <Folder size={14} className="text-amber-500" />}
        </div>
        {el.type === 'group' && (
            <button
                onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(el.id); }}
                className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 transition"
            >
                {el.isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
        )}
        <div className="flex-1 min-w-0">
            <div className={`truncate font-medium text-[11px] ${el.isHidden ? 'text-gray-300' : 'text-gray-700'}`}>
                {el.type === 'text' ? (el.text || 'Text') : (el.type === 'gen-image' ? 'Image Gen' : (el.type === 'gen-video' ? 'Video Gen' : (el.type === 'image' ? `Image` : (el.type === 'shape' ? `${el.shapeType || 'Shape'}` : (el.type === 'group' ? 'Group' : 'Element')))))}
            </div>
            <div className="truncate text-gray-400 text-[9px] uppercase tracking-tighter">
                {el.type === 'text' ? 'Text' : (el.type === 'gen-image' || el.type === 'gen-video' ? 'AI Generated' : (el.type === 'group' ? `${el.children?.length || 0} items` : 'Graphic'))}
            </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
            {el.type === 'group' && (
                <button onClick={(e) => { e.stopPropagation(); onEnterGroup?.(el.id); }} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="进入组">
                    <FolderOpen size={12} />
                </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onToggleLock(el.id); }} className={`w-6 h-6 flex items-center justify-center rounded transition ${el.isLocked ? 'text-amber-500 bg-amber-50 opacity-100' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'}`} title={el.isLocked ? "解锁" : "锁定"}>
                {el.isLocked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onToggleHide(el.id); }} className={`w-6 h-6 flex items-center justify-center rounded transition ${el.isHidden ? 'text-blue-500 bg-blue-50 opacity-100' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'}`} title={el.isHidden ? "显示" : "隐藏"}>
                {el.isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
        </div>
    </div>
);

const Workspace: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams<{ id: string }>();

    const [zoom, setZoom] = useState(30);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const zoomRef = useRef(30);
    const panRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        zoomRef.current = zoom;
        panRef.current = pan;
    }, [zoom, pan]);
    const [elements, setElements] = useState<CanvasElement[]>([]);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [projectTitle, setProjectTitle] = useState('未命名');
    const [activeTool, setActiveTool] = useState<ToolType>('select');
    const [isPanning, setIsPanning] = useState(false);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [isDraggingElement, setIsDraggingElement] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [elementStartPos, setElementStartPos] = useState({ x: 0, y: 0 });
    const groupDragStartRef = useRef<Record<string, { x: number, y: number }>>({});
    // 框选 (marquee selection)
    const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
    const [marqueeStart, setMarqueeStart] = useState({ x: 0, y: 0 });
    const [marqueeEnd, setMarqueeEnd] = useState({ x: 0, y: 0 });
    const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
    // 智能对齐线
    const [alignGuides, setAlignGuides] = useState<{ type: 'h' | 'v', pos: number }[]>([]);
    const [isResizing, setIsResizing] = useState(false);
    const [resizeHandle, setResizeHandle] = useState<string | null>(null);
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, left: 0, top: 0 });
    const [showToolMenu, setShowToolMenu] = useState(false);
    const [showInsertMenu, setShowInsertMenu] = useState(false);
    const [showShapeMenu, setShowShapeMenu] = useState(false);
    const [focusedGroupId, setFocusedGroupId] = useState<string | null>(null);
    const [markers, setMarkers] = useState<Marker[]>([]);
    const [isCtrlPressed, setIsCtrlPressed] = useState(false);
    const [hoveredMarkerId, setHoveredMarkerId] = useState<number | null>(null);
    const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
    const [editingMarkerLabel, setEditingMarkerLabel] = useState('');

    const [leftPanelMode, setLeftPanelMode] = useState<'layers' | 'files' | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
    const [showHistoryPopover, setShowHistoryPopover] = useState(false);
    const [showFontPicker, setShowFontPicker] = useState(false);
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [showRatioPicker, setShowRatioPicker] = useState(false);
    const [showResPicker, setShowResPicker] = useState(false);
    const [videoToolbarTab, setVideoToolbarTab] = useState<'frames' | 'motion' | 'multi'>('frames');
    const [showFramePanel, setShowFramePanel] = useState(false);
    const [showFastEdit, setShowFastEdit] = useState(false);
    const fastEditPrompt = useAgentStore(s => s.fastEditPrompt);
    const [history, setHistory] = useState<HistoryState[]>([{ elements: [], markers: [] }]);
    const [historyStep, setHistoryStep] = useState(0);
    const [prompt, setPrompt] = useState('');
    const messages = useAgentStore(s => s.messages);
    const isTyping = useAgentStore(s => s.isTyping);
    // 对话历史管理
    const [conversations, setConversations] = useState<ConversationSession[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string>('');
    const isLoadingRecord = useRef(false);


    const [historySearch, setHistorySearch] = useState('');
    const [showAssistant, setShowAssistant] = useState(true);
    const [isHoveringVideoFrames, setIsHoveringVideoFrames] = useState<{ [id: string]: boolean }>({});
    const inputBlocks = useAgentStore(s => s.inputBlocks);
    const activeBlockId = useAgentStore(s => s.activeBlockId);
    const selectionIndex = useAgentStore(s => s.selectionIndex);
    const [selectedChipId, setSelectedChipId] = useState<string | null>(null); // For arrow key chip selection
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [hoveredChipId, setHoveredChipId] = useState<string | null>(null); // For hover preview

    // prompt/attachments legacy states replaced by inputBlocks effectively,
    // but keeping 'prompt' sync for other potential uses if needed, or simply deriving in handleSend.
    // We will ignore 'prompt' and 'attachments' state for the INPUT area.
    const modelMode = useAgentStore(s => s.modelMode);
    const webEnabled = useAgentStore(s => s.webEnabled);
    const imageModelEnabled = useAgentStore(s => s.imageModelEnabled);

    // ─── Store actions ───
    const {
        setMessages, addMessage, clearMessages,
        setInputBlocks, setActiveBlockId, setSelectionIndex,
        setIsTyping, setModelMode, setWebEnabled, setImageModelEnabled,
        setImageGenRatio, setImageGenRes, setImageGenUpload, setIsPickingFromCanvas,
        setVideoGenRatio, setVideoGenDuration, setVideoGenQuality,
        setVideoGenModel, setVideoGenMode, setVideoStartFrame, setVideoEndFrame,
        setVideoMultiRefs, setShowVideoModelDropdown,
        setDetectedTexts, setEditedTexts, setIsExtractingText,
        setFastEditPrompt, setBrushSize, setUpscaleMenuOpen,
        setIsAgentMode, insertInputFile, setPendingAttachment,
    } = useAgentStore(s => s.actions);

    // Reactive focus: when activeBlockId changes (e.g. after insertInputFile), focus the new block
    useEffect(() => {
        const el = document.getElementById(`input-block-${activeBlockId}`) as HTMLInputElement;
        if (el) el.focus();
    }, [activeBlockId]);

    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // 创作模式状态: 'agent' | 'image' | 'video'
    type CreationMode = 'agent' | 'image' | 'video';
    const [creationMode, setCreationMode] = useState<CreationMode>('agent');
    const [showModeSelector, setShowModeSelector] = useState(false);

    // 图像生成器相关状态 (from store)
    const imageGenRatio = useAgentStore(s => s.imageGenRatio);
    const imageGenRes = useAgentStore(s => s.imageGenRes);
    const imageGenUpload = useAgentStore(s => s.imageGenUpload);
    const isPickingFromCanvas = useAgentStore(s => s.isPickingFromCanvas);

    // 视频生成器相关状态 (from store)
    const videoGenRatio = useAgentStore(s => s.videoGenRatio);
    const videoGenDuration = useAgentStore(s => s.videoGenDuration);
    const videoGenQuality = useAgentStore(s => s.videoGenQuality);
    const videoGenModel = useAgentStore(s => s.videoGenModel);
    const videoGenMode = useAgentStore(s => s.videoGenMode);

    // 视频上传数据状态 (from store)
    const videoStartFrame = useAgentStore(s => s.videoStartFrame);
    const videoEndFrame = useAgentStore(s => s.videoEndFrame);
    const videoMultiRefs = useAgentStore(s => s.videoMultiRefs);

    // Video bottom toolbar dropdowns
    const showVideoModelDropdown = useAgentStore(s => s.showVideoModelDropdown);
    const [showVideoSettingsDropdown, setShowVideoSettingsDropdown] = useState(false);

    // 悬停展开与面板状态
    const [isVideoPanelHovered, setIsVideoPanelHovered] = useState(false);
    const [showVideoModelPicker, setShowVideoModelPicker] = useState(false);

    // Agent mode (from store)
    const agentMode = useAgentStore(s => s.isAgentMode);

    // Image Toolbar States (from store)
    const upscaleMenuOpen = useAgentStore(s => s.upscaleMenuOpen);
    const [toolbarExpanded, setToolbarExpanded] = useState(false);
    const toolbarExpandTimer = useRef<NodeJS.Timeout | null>(null);
    const [eraserMode, setEraserMode] = useState(false);
    const brushSize = useAgentStore(s => s.brushSize);

    // Touch Edit States
    const [touchEditMode, setTouchEditMode] = useState(false);
    const [touchEditPopup, setTouchEditPopup] = useState<{
        analysis: string; x: number; y: number; elementId: string;
    } | null>(null);
    const [touchEditInstruction, setTouchEditInstruction] = useState('');
    const [isTouchEditing, setIsTouchEditing] = useState(false);

    // Upscale States
    // Upscale States
    const [showUpscalePanel, setShowUpscalePanel] = useState(false);
    const [selectedUpscaleRes, setSelectedUpscaleRes] = useState<'2K' | '4K' | '8K'>('2K');
    const [showUpscaleResDropdown, setShowUpscaleResDropdown] = useState(false);

    // Export States
    const [showExportMenu, setShowExportMenu] = useState(false);

    // Mode Switch Confirmation Dialog
    const [showModeSwitchDialog, setShowModeSwitchDialog] = useState(false);
    const [pendingModelMode, setPendingModelMode] = useState<'thinking' | 'fast' | null>(null);
    const [doNotAskModeSwitch, setDoNotAskModeSwitch] = useState(false);

    // Model Preference Panel
    const [showModelPreference, setShowModelPreference] = useState(false);
    const [modelPreferenceTab, setModelPreferenceTab] = useState<'image' | 'video' | '3d'>('image');
    const [autoModelSelect, setAutoModelSelect] = useState(true);
    const [preferredImageModel, setPreferredImageModel] = useState<ImageModel>(DEFAULT_AUTO_IMAGE_MODEL);
    const [preferredVideoModel, setPreferredVideoModel] = useState<VideoModel>('Veo 3.1');
    const [preferred3DModel, setPreferred3DModel] = useState('Auto');
    const activeImageModel: ImageModel = autoModelSelect ? DEFAULT_AUTO_IMAGE_MODEL : preferredImageModel;

    useEffect(() => {
        try {
            const raw = localStorage.getItem('setting_image_models');
            const parsed = JSON.parse(raw || '[]');
            const selected = Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : [];
            const first = (selected[0] || '').trim();

            if (!first || first === 'Auto' || first === 'gemini-3-pro-image-preview' || first === 'Nano Banana Pro') {
                setAutoModelSelect(true);
                setPreferredImageModel(DEFAULT_AUTO_IMAGE_MODEL);
                return;
            }

            const mapped = STORAGE_ID_TO_PREFERRED_IMAGE_MODEL[first];
            if (mapped) {
                setPreferredImageModel(mapped);
                setAutoModelSelect(false);
            }
        } catch {
            setAutoModelSelect(true);
            setPreferredImageModel(DEFAULT_AUTO_IMAGE_MODEL);
        }
    }, []);

    useEffect(() => {
        const selectedImageModels = autoModelSelect
            ? ['Auto']
            : [PREFERRED_IMAGE_MODEL_TO_STORAGE_ID[preferredImageModel] || preferredImageModel];
        localStorage.setItem('setting_image_models', JSON.stringify(selectedImageModels));
    }, [autoModelSelect, preferredImageModel]);

    // Drag-and-drop state
    const [isDragOver, setIsDragOver] = useState(false);

    // Mode switch handler
    const handleModeSwitch = (newMode: 'thinking' | 'fast') => {
        if (newMode === modelMode) return;
        if (doNotAskModeSwitch) {
            setModelMode(newMode);
            clearMessages();
            return;
        }
        setPendingModelMode(newMode);
        setShowModeSwitchDialog(true);
    };
    const confirmModeSwitch = () => {
        if (pendingModelMode) {
            setModelMode(pendingModelMode);
            clearMessages();
        }
        setShowModeSwitchDialog(false);
        setPendingModelMode(null);
    };

    // 全局点击解选逻辑：仅点击画布空白时才解选
    useEffect(() => {
        const handleGlobalMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // 只处理画布容器内点击；输入框/技能区/侧栏点击不应触发解选
            if (!containerRef.current?.contains(target)) {
                return;
            }

            // 排除所有非画布覆盖层 UI：侧边栏、对话框、各种 Modal、Popovers、输入框、工具栏以及历史记录
            const isSidebar = target.closest('.assistant-sidebar') || target.closest('.right-sidebar');
            const isInputArea = target.closest('.input-flow-container') || target.closest('.message-list') || target.closest('[class*="InputArea"]');
            const isPopupUI = target.closest('.history-popover-content') ||
                target.closest('.file-list-modal') ||
                target.closest('.settings-modal') ||
                target.closest('.dialog-overlay') ||
                target.closest('[class*="Modal"]') ||
                target.closest('[class*="Dialog"]');

            if (isSidebar || isInputArea || isPopupUI) {
                return;
            }

            const isCanvasBackgroundClick =
                target === containerRef.current ||
                target === canvasLayerRef.current ||
                target.classList.contains('canvas-background');

            if (!isCanvasBackgroundClick) return;

            // 如果是中间键或右键，交给 contextMenu 处理
            if (e.button !== 0) return;

            // 点击画布空白时，才解除选中与相关浮层
            setSelectedElementId(null);
            setSelectedElementIds([]);
            setSelectedChipId(null);
            setEditingTextId(null);
            setShowFontPicker(false);
            setShowModelPicker(false);
            setShowResPicker(false);
            setShowRatioPicker(false);
            setShowUpscalePanel(false);
            setShowUpscaleResDropdown(false);
            setPendingAttachment(null);
        };

        window.addEventListener('mousedown', handleGlobalMouseDown, true);
        return () => window.removeEventListener('mousedown', handleGlobalMouseDown, true);
    }, [activeTool, isSpacePressed]);

    // Model preference data
    const MODEL_OPTIONS: {
        image: { id: ImageModel, name: string, desc: string, time: string }[];
        video: { id: VideoModel, name: string, desc: string, time: string }[];
        '3d': { id: string, name: string, desc: string, time: string }[];
    } = {
        image: [
            { id: 'Nano Banana Pro', name: 'Nano Banana Pro', desc: '高质量图像生成，细节丰富', time: '~20s' },
            { id: 'NanoBanana2', name: 'Nano Banana 2', desc: '新一代极速图像生成', time: '~5s' },
            { id: 'Seedream5.0', name: 'Seedream 5.0', desc: '深度审美，电影级画质', time: '~15s' },
            { id: 'GPT Image 1.5', name: 'GPT Image 1.5', desc: '创意图像生成，风格多样', time: '~120s' },
            { id: 'Flux.2 Max', name: 'Flux.2 Max', desc: '快速图像生成，效率优先', time: '~10s' },
        ],
        video: [
            { id: 'Veo 3.1', name: 'Veo 3.1', desc: '高质量视频生成', time: '~60s' },
            { id: 'Veo 3.1 Fast', name: 'Veo 3.1 Fast', desc: '快速视频生成', time: '~30s' },
            { id: 'Kling 2.0', name: 'Kling 2.0', desc: '运动流畅的视频生成', time: '~45s' },
        ],
        '3d': [
            { id: 'Auto', name: 'Auto', desc: '自动选择最佳3D模型', time: '~30s' },
        ]
    };

    const handleUpscaleSelect = async (factor: number) => {
        setUpscaleMenuOpen(false);
        if (!selectedElementId) return;
        const el = elements.find(e => e.id === selectedElementId);
        if (!el || !el.url) return;

        const newId = `upscale-${Date.now()}`;
        const newEl: CanvasElement = {
            ...el,
            id: newId,
            x: el.x + el.width + 20,
            isGenerating: true,
            generatingType: 'upscale',
            url: undefined,
            zIndex: elements.length + 10
        };
        setElements(prev => [...prev, newEl]);
        setSelectedElementId(newId);

        try {
            const base64Ref = await urlToBase64(el.url);
            const prompt = `【图像深度解析与提示词生成框架】\n\n根据输入图像，按以下模块输出完整提示词：\n\n══ A. 核心主题 ══\n• 主体识别：[具体是什么——人/物/景/场景]\n• 核心叙事：[画面在表达/传递什么]\n• 构图逻辑：[视觉引导、元素排列、空间层次]\n\n══ B. 风格与质感 ══\n• 艺术风格：[写实/插画/3D/特定流派]\n• 色彩体系：[主色调、配色逻辑、冷暖氛围]\n• 光影设计：[光源、明暗比、光质软硬]\n• 材质表现：[根据主体动态描述]\n\n══ C. 细节层级（核心） ══\n• 宏观细节：[整体形态、大结构特征]\n• 中观细节：[局部特征、材质分界、色彩过渡]\n• 微观细节：[根据主体类型动态捕捉]\n  - 生物：毛发丝缕、皮肤毛孔、眼睛湿润反光、血管纹理\n  - 建筑：砖缝灰浆、锈蚀痕迹、玻璃反射、墙面风化\n  - 自然：叶脉经络、水珠折射、岩石层理、云层厚度\n  - 物品：使用磨损、划痕包浆、接缝工艺、材质颗粒\n  - 织物：编织纹理、纤维走向、褶皱阴影、边缘毛边\n\n══ D. 氛围与情绪 ══\n• 整体氛围：[宁静/紧张/梦幻/史诗/日常等]\n• 时间暗示：[季节、时段、年代感]\n• 故事张力：[画面暗示的前因后果]\n\n══ E. 技术参数 ══\n• 视角：[广角/标准/微距/鸟瞰/平视]\n• 景深：[全景深/选择性虚化/焦点位置]\n• 清晰度：[锐利边缘/柔焦/运动模糊]\n• 渲染品质：[照片级/超写实/风格化]`;

            const result = await smartEditSkill({
                sourceUrl: base64Ref,
                editType: 'upscale',
                parameters: {
                    factor,
                    prompt
                }
            });
            if (result) {
                const img = new Image();
                img.src = result;
                img.onload = () => {
                    setElements(prev => prev.map(e => e.id === newId ? {
                        ...e,
                        isGenerating: false,
                        url: result,
                        width: el.width * factor,
                        height: el.height * factor
                    } : e));
                    saveToHistory(elements, markers);
                };
            } else {
                setElements(prev => prev.filter(e => e.id !== newId));
            }
        } catch (e) {
            console.error('Upscale failed:', e);
            setElements(prev => prev.filter(e => e.id !== newId));
        }
    };

    const handleUndoEraser = () => {
        console.log('Undo eraser');
    };

    const handleClearEraser = () => {
        console.log('Clear eraser path');
    };

    const handleExecuteEraser = () => {
        setEraserMode(false);
        console.log('Execute erase');
    };

    const handleVectorRedraw = async () => {
        if (!selectedElementId) return;
        const el = elements.find(e => e.id === selectedElementId);
        if (!el || !el.url) return;

        const newId = `vector-${Date.now()}`;
        const newEl: CanvasElement = {
            ...el,
            id: newId,
            x: el.x + el.width + 20,
            isGenerating: true,
            generatingType: 'vector',
            url: undefined,
            zIndex: elements.length + 10
        };
        setElements(prev => [...prev, newEl]);
        setSelectedElementId(newId);

        try {
            const base64Ref = await urlToBase64(el.url);
            const prompt = `【任务】将输入图像解析为专业级矢量线稿\n\n【自适应分析】\n首先识别画面主体类型，动态调整线条策略：\n- 生物类：捕捉毛发走向、皮肤褶皱、肌肉轮廓\n- 建筑/物品：强调结构边缘、材质分界、几何关系\n- 自然景观：表现植被层次、地形起伏、水纹流向\n- 织物/软质：体现垂坠感、褶皱逻辑、编织纹理\n\n【线条层级系统】\nL1 主轮廓：定义物体边界与剪影\nL2 结构线：表达体积转折、内部形态\nL3 细节线：材质特征、微观纹理走向\nL4 氛围线：暗示光影边界、空间深度（可选）\n\n【输出标准】\n✓ 纯黑白、线条闭合流畅、层次分明\n✗ 禁止：灰度填充、渐变、模糊、噪点`;

            const result = await smartEditSkill({
                sourceUrl: base64Ref,
                editType: 'upscale', // Using upscale engine for redraw
                parameters: {
                    factor: 2,
                    prompt
                }
            });
            if (result) {
                const img = new Image();
                img.src = result;
                img.onload = () => {
                    setElements(prev => prev.map(e => e.id === newId ? { ...e, isGenerating: false, url: result } : e));
                    saveToHistory(elements, markers);
                };
            } else {
                setElements(prev => prev.filter(e => e.id !== newId));
            }
        } catch (e) {
            console.error('Vector redraw failed:', e);
            setElements(prev => prev.filter(e => e.id !== newId));
        }
    };

    // Touch Edit Handler
    const handleTouchEditClick = async (elementId: string, clickX: number, clickY: number, screenX: number, screenY: number) => {
        const el = elements.find(e => e.id === elementId);
        if (!el || !el.url || !touchEditMode) return;
        setIsTouchEditing(true);
        try {
            const base64Ref = await urlToBase64(el.url);
            const result = await touchEditSkill({
                imageData: base64Ref,
                regionX: clickX,
                regionY: clickY,
                regionWidth: 128,
                regionHeight: 128,
                editInstruction: ''
            });
            setTouchEditPopup({
                analysis: result.analysis,
                x: screenX,
                y: screenY,
                elementId
            });
        } catch (e) {
            console.error('Touch edit analysis failed:', e);
        } finally {
            setIsTouchEditing(false);
        }
    };

    const handleTouchEditExecute = async () => {
        if (!touchEditPopup || !touchEditInstruction.trim()) return;
        const el = elements.find(e => e.id === touchEditPopup.elementId);
        if (!el || !el.url) return;
        setIsTouchEditing(true);
        setElements(prev => prev.map(e => e.id === touchEditPopup.elementId ? { ...e, isGenerating: true } : e));
        try {
            const base64Ref = await urlToBase64(el.url);
            const result = await touchEditSkill({
                imageData: base64Ref,
                regionX: 0, regionY: 0, regionWidth: el.width, regionHeight: el.height,
                editInstruction: touchEditInstruction
            });
            if (result.editedImage) {
                const updated = elements.map(e => e.id === touchEditPopup.elementId ? { ...e, isGenerating: false, url: result.editedImage! } : e);
                setElements(updated);
                saveToHistory(updated, markers);
            } else {
                setElements(prev => prev.map(e => e.id === touchEditPopup.elementId ? { ...e, isGenerating: false } : e));
            }
        } catch (e) {
            console.error('Touch edit execute failed:', e);
            setElements(prev => prev.map(e => e.id === touchEditPopup.elementId ? { ...e, isGenerating: false } : e));
        } finally {
            setIsTouchEditing(false);
            setTouchEditPopup(null);
            setTouchEditInstruction('');
        }
    };

    // Export Handler
    const handleExport = async (format: 'png' | 'jpg' | 'pdf' | 'svg' | 'json') => {
        setShowExportMenu(false);
        try {
            const dataUrl = await exportSkill({ elements, format, scale: 2 });
            const link = document.createElement('a');
            link.download = `xc-studio-${projectTitle || 'export'}.${format}`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error('Export failed:', e);
        }
    };

    const handleSmartGenerate = async (prompt: string, proposalId?: string) => {
        if (proposalId) {
            try {
                setIsTyping(true);
                await executeProposal(proposalId);
                const latestTask = useAgentStore.getState().currentTask;
                if (latestTask && latestTask.output) {
                    const derivedImageUrls =
                        (latestTask.output.imageUrls && latestTask.output.imageUrls.length > 0)
                            ? latestTask.output.imageUrls
                            : [
                                ...(latestTask.output.assets || [])
                                    .filter((a: any) => a?.type === 'image' && a?.url)
                                    .map((a: any) => a.url),
                                ...(latestTask.output.skillCalls || [])
                                    .filter((s: any) => s?.success && typeof s?.result === 'string')
                                    .map((s: any) => s.result),
                            ];

                    addMessage({
                        id: `proposal-${latestTask.id}-${Date.now()}`,
                        role: 'model',
                        text: latestTask.output.message || '方案执行完成。',
                        timestamp: Date.now(),
                        agentData: {
                            model: latestTask.agentId,
                            title: '方案执行结果',
                            imageUrls: Array.from(new Set(derivedImageUrls)),
                            analysis: latestTask.output.analysis,
                            suggestions: latestTask.output.adjustments || [],
                        }
                    });
                }
            } catch (error) {
                console.error('[Workspace] executeProposal failed:', error);
                addMessage({
                    id: `proposal-err-${Date.now()}`,
                    role: 'model',
                    text: '方案执行失败，请重试。',
                    timestamp: Date.now(),
                });
            } finally {
                setIsTyping(false);
            }
            return;
        }

        const id = `gen-${Date.now()}`;
        // Calculate center of visible canvas area
        const containerW = window.innerWidth - (showAssistant ? 480 : 0);
        const containerH = window.innerHeight;
        const centerX = (containerW / 2 - pan.x) / (zoom / 100);
        const centerY = (containerH / 2 - pan.y) / (zoom / 100);

        const newEl: CanvasElement = {
            id,
            type: 'gen-image',
            x: centerX - 256, // 512 width
            y: centerY - 256, // 512 height
            width: 512,
            height: 512,
            genPrompt: prompt,
            genModel: activeImageModel,
            zIndex: elements.length + 10, // Ensure it's on top
            isGenerating: true
        };
        setElements(prev => [...prev, newEl]);
        setSelectedElementId(id); // Select the newly generated element

        try {
            // Find reference images from context (InputBlocks or Canvas)
            let referenceImages: string[] = [];

            // 1. From InputBlocks
            const currentBlocks = useAgentStore.getState().inputBlocks;
            const blockFiles = currentBlocks.filter(b => b.type === 'file' && b.file).map(b => b.file!) as File[];
            for (const f of blockFiles) {
                try {
                    const base64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(f);
                    });
                    referenceImages.push(base64);
                } catch (_) { }
            }

            // 2. From Canvas if no blocks
            if (referenceImages.length === 0) {
                const canvasImages = elements.filter(e => (e.type === 'image' || e.type === 'gen-image') && e.url);
                if (canvasImages.length > 0) {
                    referenceImages = canvasImages.slice(-3).map(e => e.url!);
                }
            }

            const resultUrl = await imageGenSkill({
                prompt: prompt,
                model: activeImageModel,
                aspectRatio: '1:1',
                referenceImages: referenceImages.length > 0 ? referenceImages : undefined
            });

            if (resultUrl) {
                setElements(prev => prev.map(el => el.id === id ? { ...el, isGenerating: false, url: resultUrl } : el));
            } else {
                setElements(prev => prev.map(el => el.id === id ? { ...el, isGenerating: false } : el));
            }
        } catch (e) {
            console.error("Smart gen failed", e);
            setElements(prev => prev.map(el => el.id === id ? { ...el, isGenerating: false } : e));
        }
    };

    // Agent orchestration
    const projectContext = useProjectContext(id || '', projectTitle, elements);
    const { currentTask, isUploadingAttachments, processMessage, executeProposal } = useAgentOrchestrator({
        projectContext,
        canvasState: { elements, pan, zoom, showAssistant },
        onElementsUpdate: setElements,
        onHistorySave: (els) => saveToHistory(els, markers),
        autoAddToCanvas: true
    });

    const handleSend = async (overridePrompt?: string, overrideAttachments?: File[], overrideWeb?: boolean, skillData?: any) => {
        if (isUploadingAttachments) {
            addMessage({
                id: `upload-wait-${Date.now()}`,
                role: 'model',
                text: '图片正在上传，请稍候',
                timestamp: Date.now(),
                error: true,
            });
            return;
        }

        if (isTyping) {
            return;
        }

        // 1. 取出当前输入块
        const currentBlocks = useAgentStore.getState().inputBlocks;
        const text = overridePrompt ?? currentBlocks.filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
        const attachments = overrideAttachments ?? currentBlocks.filter(b => b.type === 'file' && b.file).map(b => b.file!) as File[];
        const isWeb = overrideWeb ?? webEnabled;

        if (!text && attachments.length === 0) return;

        // 首次发送时初始化会话 ID，确保消息能关联到正确的会话
        if (!activeConversationId) {
            setActiveConversationId(`session-${Date.now()}`);
        }

        const attachmentPreviews = attachments.map(f => URL.createObjectURL(f));

        // 2. 构造并将用户消息添加至 Store
        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            text,
            attachments: attachmentPreviews,
            timestamp: Date.now(),
            skillData
        };
        addMessage(userMsg);

        // 3. 进入打字/思考状态，并重置输入区域
        setIsTyping(true);
        setInputBlocks([{ id: 'init', type: 'text', text: '' }]); // 仅清空输入框，不清空对话消息历史
        // 强制清空 contentEditable DOM（React 不会自动同步 contentEditable）
        document.querySelectorAll('[id^="input-block-"]').forEach(el => {
            (el as HTMLElement).textContent = '';
        });

        try {
            const requestMetadata = {
                enableWebSearch: isWeb,
                creationMode,
                preferredAspectRatio: creationMode === 'video' ? videoGenRatio : imageGenRatio,
                skillData,
            };

            // 4. 调用 Orchestrator 处理任务
            console.log('[Workspace] handleSend: calling processMessage with text:', text.substring(0, 50));
            const result = await processMessage(text, attachments, requestMetadata, userMsg.id);
            console.log('[Workspace] handleSend: processMessage returned:', result?.status, result?.output?.message?.substring(0, 50));

            if (result && result.output) {
                const derivedImageUrls =
                    (result.output.imageUrls && result.output.imageUrls.length > 0)
                        ? result.output.imageUrls
                        : [
                            ...(result.output.assets || [])
                                .filter((a: any) => a?.type === 'image' && a?.url)
                                .map((a: any) => a.url),
                            ...(result.output.skillCalls || [])
                                .filter((s: any) => s?.success && typeof s?.result === 'string')
                                .map((s: any) => s.result),
                        ];

                // 5. 构造并添加 Agent 消息
                const agentMsg: ChatMessage = {
                    id: result.id,
                    role: 'model',
                    text: result.output.message || '已完成任务。',
                    timestamp: Date.now(),
                    error: result.status === 'failed',
                    agentData: {
                        model: result.agentId,
                        title: '智能助理',
                        imageUrls: Array.from(new Set(derivedImageUrls)),
                        proposals: result.output.proposals,
                        skillCalls: result.output.skillCalls,
                        analysis: result.output.analysis,
                        preGenerationMessage: result.output.preGenerationMessage,
                        postGenerationSummary: result.output.postGenerationSummary,
                        suggestions: result.output.adjustments || [],
                    }
                };
                addMessage(agentMsg);
            }
        } catch (error) {
            console.error('[Workspace] handleSend failed:', error);
            const rawError = error instanceof Error ? error.message : String(error || '');
            const isImageError = /图片|image|upload|base64|attachment|mime|格式/i.test(rawError);
            addMessage({
                id: `err-${Date.now()}`,
                role: 'model',
                text: isImageError ? '图片处理失败，请检查网络或重新上传' : '处理请求时遇到问题，请稍后重试。',
                timestamp: Date.now(),
                error: true,
            });
        } finally {
            setIsTyping(false);
        }
    };

    // Close video dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = () => {
            setShowVideoModelDropdown(false);
            setShowVideoSettingsDropdown(false);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // Sync markers with inputBlocks - remove markers that don't have corresponding chips in inputBlocks
    // Only sync when inputBlocks has at least one marker file (meaning user is actively working with markers)
    useEffect(() => {
        const hasMarkerFiles = inputBlocks.some(block =>
            block.type === 'file' && block.file && (block.file as any).markerId
        );

        // Only sync if user has marker files in input (active session)
        // Skip sync if inputBlocks is just the initial empty state
        if (!hasMarkerFiles && inputBlocks.length === 1 && inputBlocks[0].type === 'text' && !inputBlocks[0].text) {
            // Initial state or clean state - don't clear markers from loaded project
            return;
        }

        const markerIdsInInput = inputBlocks
            .filter(block => block.type === 'file' && block.file && (block.file as any).markerId)
            .map(block => (block.file as any).markerId as string);

        setMarkers(prev => {
            // If there are no marker files in input but there are markers, clear them
            // This handles the case when user removes all marker chips
            if (!hasMarkerFiles && prev.length > 0) {
                return [];
            }

            const filtered = prev.filter(m => markerIdsInInput.includes(m.id));
            if (filtered.length !== prev.length) {
                return filtered;
            }
            return prev;
        });
    }, [inputBlocks]);

    // 反向同步：markers 变化时，清理 inputBlocks 中已不存在的 marker chip
    useEffect(() => {
        const markerIds = markers.map(m => m.id);
        const currentBlocks = useAgentStore.getState().inputBlocks;
        const hasOrphanChip = currentBlocks.some(b =>
            b.type === 'file' && b.file && (b.file as any).markerId && !markerIds.includes((b.file as any).markerId)
        );
        if (!hasOrphanChip) return;
        let filtered = currentBlocks.filter(b =>
            !(b.type === 'file' && b.file && (b.file as any).markerId && !markerIds.includes((b.file as any).markerId))
        );
        filtered = normalizeInputBlocks(filtered);
        // 修复：不再重排 markerId，保持其作为稳定唯一标识
        setInputBlocks(filtered);
    }, [markers]);

    // 选中画布元素时，自动将图片插入输入框（在光标位置插入，用户手动删 chip）
    const prevSelectedIdsRef = useRef<string[]>([]);
    const pendingPickRequestRef = useRef(0);
    useEffect(() => {
        // 合并单选和多选
        const ids = selectedElementIds.length > 0 ? selectedElementIds : (selectedElementId ? [selectedElementId] : []);
        const prev = prevSelectedIdsRef.current;

        // 只有 Agent 模式下才执行画布图片自动插入/清除逻辑
        if (creationMode !== 'agent') {
            pendingPickRequestRef.current += 1;
            setPendingAttachment(null);
            prevSelectedIdsRef.current = ids;
            return;
        }

        // 选中列表没变就跳过 (只有在 ID 列表真正变化时才执行)
        if (JSON.stringify(ids) === JSON.stringify(prev)) return;

        // 取消全部选中时 → 清除自动插入的画布图片 chip
        if (ids.length === 0 && prev.length > 0) {
            pendingPickRequestRef.current += 1;
            const currentBlocks = useAgentStore.getState().inputBlocks;
            const filtered = currentBlocks.filter(b => {
                if (b.type !== 'file' || !b.file) return true;
                if ((b.file as any)._canvasAutoInsert) return false;
                return true;
            });
            setInputBlocks(normalizeInputBlocks(filtered));
            setPendingAttachment(null);
            prevSelectedIdsRef.current = ids;
            return;
        }

        // 记录当前 ID 列表
        prevSelectedIdsRef.current = ids;

        // 找出新增的选中元素（之前没选中，现在选中了）
        const newIds = ids.filter(id => !prev.includes(id));
        if (newIds.length === 0) return;

        // 软选中：只保留最后一个 pending，点击新图时替换
        const imageEls = elements.filter(e => newIds.includes(e.id) && (e.type === 'image' || e.type === 'gen-image') && e.url);
        if (imageEls.length === 0) return;

        const targetEl = imageEls[imageEls.length - 1];
        const requestId = pendingPickRequestRef.current + 1;
        pendingPickRequestRef.current = requestId;

        // 画布软选中预览（pending），不直接插入输入流
        (async () => {
            try {
                const resp = await fetch(targetEl.url!);
                const blob = await resp.blob();
                if (pendingPickRequestRef.current !== requestId) return;
                const file = new File([blob], `canvas-${targetEl.id.slice(-6)}.png`, { type: blob.type || 'image/png' }) as any;
                file._canvasAutoInsert = true;
                file._canvasElId = targetEl.id;
                file._canvasWidth = targetEl.width;
                file._canvasHeight = targetEl.height;
                file._attachmentId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

                if (pendingPickRequestRef.current !== requestId) return;
                setPendingAttachment({
                    id: file._attachmentId,
                    file,
                    source: 'canvas',
                    canvasElId: targetEl.id,
                });
            } catch (_) {
                // ignore
            }
        })();
    }, [selectedElementIds, selectedElementId, creationMode, elements, setPendingAttachment]);

    // Text Edit Feature State
    const [showTextEditModal, setShowTextEditModal] = useState(false);
    const detectedTexts = useAgentStore(s => s.detectedTexts);
    const editedTexts = useAgentStore(s => s.editedTexts);
    const isExtractingText = useAgentStore(s => s.isExtractingText);
    const [showFileListModal, setShowFileListModal] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const refImageInputRef = useRef<HTMLInputElement>(null);
    const chatSessionRef = useRef<any>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasLayerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const closeToolMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeShapeMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initialPromptProcessedRef = useRef(false);
    // Performance: store drag positions in ref to avoid re-renders during drag
    const dragOffsetsRef = useRef<Record<string, { x: number, y: number }>>({});
    const rafIdRef = useRef<number>(0);

    const saveToHistory = (newElements: CanvasElement[], newMarkers: Marker[]) => {
        const newHistory = history.slice(0, historyStep + 1);
        newHistory.push({ elements: newElements, markers: newMarkers });
        setHistory(newHistory);
        setHistoryStep(newHistory.length - 1);
    };

    const undo = () => {
        if (historyStep > 0) {
            const prevStep = historyStep - 1;
            setHistoryStep(prevStep);
            setElements(history[prevStep].elements);
            setMarkers(history[prevStep].markers);
        }
    };

    const redo = () => {
        if (historyStep < history.length - 1) {
            const nextStep = historyStep + 1;
            setHistoryStep(nextStep);
            setElements(history[nextStep].elements);
            setMarkers(history[nextStep].markers);
        }
    };

    const removeInputBlock = (blockId: string) => {
        const currentBlocks = useAgentStore.getState().inputBlocks;
        const idx = currentBlocks.findIndex(b => b.id === blockId);
        if (idx === -1) return;

        const newBlocks = [...currentBlocks];
        const block = newBlocks[idx];

        // Also remove corresponding markers from canvas if this file had a markerId
        if (block.file && (block.file as any).markerId) {
            const markerId = (block.file as any).markerId;
            // 修复：仅过滤掉被删除的标记，不再重排剩余标记的 ID，以保持 React key 的稳定性
            const newMarkers = markers.filter(m => m.id !== markerId);
            setMarkers(newMarkers);
            saveToHistory(elements, newMarkers);
        }

        // Remove the block
        newBlocks.splice(idx, 1);

        // Normalize and determine new core focus
        const normalized = normalizeInputBlocks(newBlocks);

        // Set active block to the text block nearest to removal point if possible
        const newActiveIdx = Math.min(idx, normalized.length - 1);
        const targetBlock = normalized.find((b, i) => i >= newActiveIdx && b.type === 'text')
            || [...normalized].reverse().find(b => b.type === 'text');

        if (targetBlock) {
            setActiveBlockId(targetBlock.id);
        }

        setInputBlocks(normalized);
    };

    // contentEditable 光标辅助函数
    const getCECursorPos = (el: HTMLElement): number => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        const range = sel.getRangeAt(0);
        const pre = range.cloneRange();
        pre.selectNodeContents(el);
        pre.setEnd(range.startContainer, range.startOffset);
        return pre.toString().length;
    };
    const setCECursorPos = (el: HTMLElement, pos: number) => {
        el.focus();
        const sel = window.getSelection();
        if (!sel) return;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let cur = 0;
        let node = walker.nextNode();
        while (node) {
            const len = (node.textContent || '').length;
            if (cur + len >= pos) {
                const range = document.createRange();
                range.setStart(node, pos - cur);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                return;
            }
            cur += len;
            node = walker.nextNode();
        }
        // fallback: 放到末尾
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    };
    useEffect(() => {
        if (!id || isLoadingRecord.current) return;
        const save = async () => {
            if (isLoadingRecord.current) return;
            const firstImage = elements.find(el => el.type === 'image' || el.type === 'gen-image');
            const thumbnail = firstImage?.url || '';
            await saveProject({ id, title: projectTitle, updatedAt: formatDate(Date.now()), elements, markers, thumbnail, conversations });
        };
        const timeout = setTimeout(save, 1000);
        return () => clearTimeout(timeout);
    }, [elements, markers, conversations, id, projectTitle]);

    const updateSelectedElement = (updates: Partial<CanvasElement>) => {
        if (!selectedElementId) return;
        const newElements = elements.map(el => {
            if (el.id === selectedElementId) {
                let updatedEl = { ...el, ...updates };
                if (updates.genAspectRatio && updates.genAspectRatio !== el.genAspectRatio) {
                    const [w, h] = updates.genAspectRatio.split(':').map(Number);
                    const ratio = w / h;
                    if (el.width && el.height) {
                        const area = el.width * el.height;
                        updatedEl.width = Math.sqrt(area * ratio);
                        updatedEl.height = Math.sqrt(area / ratio);
                    }
                }
                if (el.aspectRatioLocked && !updates.genAspectRatio) {
                    if (updates.width && !updates.height) {
                        const ratio = el.height / el.width;
                        updates.height = updates.width * ratio;
                    } else if (updates.height && !updates.width) {
                        const ratio = el.width / el.height;
                        updates.width = updates.height * ratio;
                    }
                }
                return updatedEl;
            }
            return el;
        });
        setElements(newElements);
        saveToHistory(newElements, markers);
    };

    const deleteSelectedElement = () => {
        if (selectedElementId) {
            const newElements = elements.filter(el => el.id !== selectedElementId);
            const newMarkers = markers.filter(m => m.elementId !== selectedElementId);
            setElements(newElements);
            setMarkers(newMarkers);
            setSelectedElementId(null);
            saveToHistory(newElements, newMarkers);
        }
    };

    useEffect(() => {
        setShowFastEdit(false);
        setFastEditPrompt('');
        setShowTextEditModal(false);
    }, [selectedElementId]);

    const fitToScreen = () => {
        if (elements.length === 0) {
            setPan({ x: 0, y: 0 });
            setZoom(100);
            return;
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        elements.forEach(el => {
            minX = Math.min(minX, el.x);
            minY = Math.min(minY, el.y);
            maxX = Math.max(maxX, el.x + el.width);
            maxY = Math.max(maxY, el.y + el.height);
        });
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const padding = 100;
        const containerW = window.innerWidth - (showAssistant ? 480 : 0);
        const containerH = window.innerHeight;
        if (contentWidth <= 0 || contentHeight <= 0) return;
        const zoomW = (containerW - padding * 2) / contentWidth;
        const zoomH = (containerH - padding * 2) / contentHeight;
        const newZoom = Math.min(zoomW, zoomH) * 100;
        const finalZoom = Math.min(Math.max(newZoom, 10), 200);
        const centerX = minX + contentWidth / 2;
        const centerY = minY + contentHeight / 2;
        const newPanX = (containerW / 2) - (centerX * (finalZoom / 100));
        const newPanY = (containerH / 2) - (centerY * (finalZoom / 100));
        setZoom(finalZoom);
        setPan({ x: newPanX, y: newPanY });
    };

    const handleManualPaste = async () => {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                if (item.types.includes('image/png') || item.types.includes('image/jpeg')) {
                    const blob = await item.getType(item.types.find(t => t.startsWith('image/'))!);
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const result = event.target?.result as string;
                        const img = new Image();
                        img.onload = () => {
                            let w = img.width;
                            let h = img.height;
                            const maxDim = 800; // Increased default size
                            if (w > maxDim || h > maxDim) {
                                const ratio = w / h;
                                if (w > h) { w = maxDim; h = maxDim / ratio; }
                                else { h = maxDim; w = maxDim * ratio; }
                            }
                            addElement('image', result, { width: w, height: h });
                        };
                        img.src = result;
                    };
                    reader.readAsDataURL(blob);
                }
            }
        } catch (err) {
            console.error("Clipboard access failed", err);
        }
    };

    const handleDownload = () => {
        if (!selectedElementId) return;
        const el = elements.find(e => e.id === selectedElementId);
        if (!el || !el.url) return;
        const link = document.createElement('a');
        link.href = el.url;
        link.download = `xc-image-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setContextMenu(null);
    };

    const urlToBase64 = async (url: string): Promise<string> => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Conversion failed", e);
            return url;
        }
    };

    // --- Image Processing Handlers ---

    const handleUpscale = async () => {
        if (!selectedElementId) return;
        const el = elements.find(e => e.id === selectedElementId);
        if (!el || !el.url) return;

        const update1 = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: true } : e);
        setElements(update1);

        try {
            const base64Ref = await urlToBase64(el.url);
            const resultUrl = await smartEditSkill({
                sourceUrl: base64Ref,
                editType: 'upscale',
                parameters: { factor: 4 }
            });

            if (resultUrl) {
                const img = new Image();
                img.src = resultUrl;
                img.onload = () => {
                    const update2 = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: false, url: resultUrl } : e);
                    setElements(update2);
                    saveToHistory(update2, markers);
                };
            } else {
                throw new Error("No result");
            }
        } catch (e) {
            console.error(e);
            const updateFail = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: false } : e);
            setElements(updateFail);
        }
    };

    const handleRemoveBg = async () => {
        if (!selectedElementId) return;
        const el = elements.find(e => e.id === selectedElementId);
        if (!el || !el.url) return;

        const update1 = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: true } : e);
        setElements(update1);

        try {
            const base64Ref = await urlToBase64(el.url);
            const resultUrl = await smartEditSkill({
                sourceUrl: base64Ref,
                editType: 'background-remove',
            });

            if (resultUrl) {
                const img = new Image();
                img.src = resultUrl;
                img.onload = () => {
                    const update2 = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: false, url: resultUrl } : e);
                    setElements(update2);
                    saveToHistory(update2, markers);
                };
            } else {
                throw new Error("No result");
            }
        } catch (e) {
            console.error(e);
            const updateFail = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: false } : e);
            setElements(updateFail);
        }
    };

    const handleEditTextClick = async () => {
        if (!selectedElementId) return;
        const el = elements.find(e => e.id === selectedElementId);
        if (!el || !el.url) return;

        setIsExtractingText(true);
        try {
            const base64Ref = await urlToBase64(el.url);
            const extractedTexts = await extractTextFromImage(base64Ref);
            setDetectedTexts(extractedTexts);
            setEditedTexts([...extractedTexts]); // Initialize editable texts
            setShowTextEditModal(true);
        } catch (e) {
            console.error("Text extraction failed", e);
        } finally {
            setIsExtractingText(false);
        }
    };

    const handleApplyTextEdits = async () => {
        if (!selectedElementId || detectedTexts.length === 0) return;
        const el = elements.find(e => e.id === selectedElementId);
        if (!el || !el.url) return;

        setShowTextEditModal(false);
        const update1 = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: true } : e);
        setElements(update1);

        // Construct prompt for text replacement
        let editPrompt = "Edit the text in the image. ";
        let changes = [];
        for (let i = 0; i < detectedTexts.length; i++) {
            if (detectedTexts[i] !== editedTexts[i]) {
                changes.push(`Replace text "${detectedTexts[i]}" with "${editedTexts[i]}"`);
            }
        }

        if (changes.length === 0) {
            // No changes, just revert loading state
            const updateRevert = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: false } : e);
            setElements(updateRevert);
            return;
        }

        editPrompt += changes.join(". ") + ". Maintain the original font style and color as much as possible.";

        try {
            const base64Ref = await urlToBase64(el.url);
            const resultUrl = await imageGenSkill({
                prompt: editPrompt,
                model: (el.genModel as any) || 'Nano Banana Pro',
                aspectRatio: el.genAspectRatio || '1:1',
                referenceImage: base64Ref,
            });

            if (resultUrl) {
                const img = new Image();
                img.src = resultUrl;
                img.onload = () => {
                    const update2 = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: false, url: resultUrl } : e);
                    setElements(update2);
                    saveToHistory(update2, markers);
                };
            } else {
                throw new Error("No result");
            }
        } catch (e) {
            console.error(e);
            const updateFail = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: false } : e);
            setElements(updateFail);
        }
    };

    const handleFastEditRun = async () => {
        if (!selectedElementId || !fastEditPrompt) return;
        const el = elements.find(e => e.id === selectedElementId);
        if (!el || !el.url) return;
        const update1 = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: true } : e);
        setElements(update1);
        try {
            const base64Ref = await urlToBase64(el.url);
            const resultUrl = await imageGenSkill({
                prompt: fastEditPrompt,
                model: (el.genModel as any) || 'Nano Banana Pro',
                aspectRatio: el.genAspectRatio || '1:1',
                referenceImage: base64Ref,
            });
            if (resultUrl) {
                const img = new Image();
                img.src = resultUrl;
                img.onload = () => {
                    const update2 = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: false, url: resultUrl } : e);
                    setElements(update2);
                    saveToHistory(update2, markers);
                    setShowFastEdit(false);
                    setFastEditPrompt('');
                };
            } else {
                throw new Error("No result");
            }
        } catch (e) {
            console.error(e);
            const updateFail = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: false } : e);
            setElements(updateFail);
        }
    };

    // Handle Model Mode Switching
    useEffect(() => {
        // 'thinking' -> gemini-3-pro-preview
        // 'fast' -> gemini-3-flash-preview
        const modelName = modelMode === 'thinking' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

        // Preserve history when switching models if possible, but basic recreation here
        const historyContent: Content[] = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
        chatSessionRef.current = createChatSession(modelName, historyContent);
    }, [modelMode]);

    useEffect(() => {
        if (id) {
            const load = async () => {
                isLoadingRecord.current = true;
                console.log('[Workspace] Loading project:', id);

                // 1. 立即同步清空当前项目的本地状态，防止 UI 闪烁旧数据
                // 不使用 prev => ... 以确保绝对的清空
                setElements([]);
                setMarkers([]);
                setConversations([]);
                setProjectTitle('未命名');
                setHistory([{ elements: [], markers: [] }]);
                setHistoryStep(0);
                setSelectedElementId(null);
                setSelectedElementIds([]);
                setActiveConversationId(''); // 必须清空活跃对话ID，防止保存到旧ID

                // 2. 重置 AI 助手相关的全局 Store 状态 (消息、任务等)
                useAgentStore.getState().actions.reset();

                try {
                    const project = await getProject(id);
                    if (project) {
                        console.log('[Workspace] Project found, restoring state');
                        if (project.elements) setElements(project.elements);
                        if (project.title) setProjectTitle(project.title);
                        if (project.conversations) {
                            setConversations(project.conversations);
                            const activeC = project.conversations.find(c => c.id === id);
                            if (activeC) {
                                // 深度持久化消息到 store
                                useAgentStore.getState().actions.setMessages(activeC.messages);
                            }
                        }
                        setHistory([{ elements: project.elements || [], markers: [] }]);
                        setHistoryStep(0);
                    } else {
                        // New project: save initial record to IndexedDB immediately
                        // so it appears in the recent projects list
                        console.log('[Workspace] New project, saving initial record');
                        await saveProject({
                            id,
                            title: '未命名',
                            updatedAt: formatDate(Date.now()),
                            elements: [],
                            markers: [],
                            thumbnail: '',
                            conversations: [],
                        });
                    }
                } catch (err) {
                    console.error('[Workspace] Load failed:', err);
                } finally {
                    // 延迟释放标识位，确保所有 React 状态变更已排队
                    setTimeout(() => {
                        isLoadingRecord.current = false;
                        console.log('[Workspace] Load complete, persistence enabled');
                    }, 300);
                }
            };
            load();
        }
        if (location.state?.initialPrompt || location.state?.initialAttachments) {
            if (!initialPromptProcessedRef.current) {
                initialPromptProcessedRef.current = true;
                const blocks: InputBlock[] = [];
                if (location.state.initialAttachments) {
                    (location.state.initialAttachments as File[]).forEach((f, i) => {
                        blocks.push({ id: `file-${Date.now()}-${i}`, type: 'file', file: f });
                        blocks.push({ id: `text-${Date.now()}-${i}`, type: 'text', text: '' });
                    });
                }
                if (location.state.initialPrompt) {
                    if (blocks.length > 0 && blocks[blocks.length - 1].type === 'text') {
                        blocks[blocks.length - 1].text = location.state.initialPrompt;
                    } else {
                        blocks.push({ id: `text-${Date.now()}`, type: 'text', text: location.state.initialPrompt });
                    }
                }
                if (blocks.length === 0) blocks.push({ id: 'init', type: 'text', text: '' });
                setInputBlocks(blocks);

                if (location.state.initialModelMode) setModelMode(location.state.initialModelMode);
                if (location.state.initialWebEnabled) setWebEnabled(location.state.initialWebEnabled);
                if (location.state.initialImageModel) setImageModelEnabled(true);
                handleSend(location.state.initialPrompt, location.state.initialAttachments, location.state.initialWebEnabled);
            }
        }
        if (location.state?.backgroundUrl) {
            const type = location.state.backgroundType || 'image';
            const url = location.state.backgroundUrl;
            const containerW = window.innerWidth - 400;
            const containerH = window.innerHeight;
            const newElement: CanvasElement = {
                id: Date.now().toString(), type, url, x: containerW / 2 - 200, y: containerH / 2 - 150, width: 400, height: 300, zIndex: 1
            };
            setElements(prev => { const next = [...prev, newElement]; setHistory([{ elements: next, markers: [] }]); return next; });
        }
        if (!chatSessionRef.current) {
            // Default to PRO_MODEL (thinking)
            chatSessionRef.current = createChatSession('gemini-3-pro-preview');
        }
    }, [id, location.state]);



    // Ctrl 键监听：用于切换自定义光标
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Control') setIsCtrlPressed(true);
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Control') setIsCtrlPressed(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // 对话持久化：messages 变化时自动保存到当前会话
    useEffect(() => {
        if (messages.length === 0 || !id) return;
        setConversations(prev => {
            const conversationId = activeConversationId || id;
            let updated = [...prev];
            const idx = updated.findIndex(c => c.id === conversationId);

            if (idx === -1) {
                // If it's a new conversation, create it
                const firstUserMessage = messages.find(m => m.role === 'user');
                let curTitle = '新对话';
                if (firstUserMessage) {
                    curTitle = firstUserMessage.text.slice(0, 15) + (firstUserMessage.text.length > 15 ? '...' : '');
                } else if (projectTitle !== '未命名') {
                    curTitle = projectTitle;
                }
                updated.push({
                    id: conversationId,
                    title: curTitle,
                    messages: messages,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                });
            } else {
                updated[idx] = {
                    ...updated[idx],
                    messages: messages,
                    updatedAt: Date.now()
                };
            }

            return updated;
        });
    }, [messages, id, activeConversationId, projectTitle]);

    useEffect(() => {
        const handleGlobalClick = (e: MouseEvent) => {
            setContextMenu(null);
            const target = e.target as HTMLElement;
            if (!target.closest('.history-popover-trigger') && !target.closest('.history-popover-content')) {
                setShowHistoryPopover(false);
            }
            if (!target.closest('.relative')) {
                setShowResPicker(false);
                setShowRatioPicker(false);
                setShowModelPicker(false);
                setShowFileListModal(false);
            }
        };
        const handleWindowPaste = (e: ClipboardEvent) => {
            if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT' || document.activeElement?.getAttribute('contenteditable')) return;
            if (e.clipboardData?.files.length) {
                e.preventDefault();
                const file = e.clipboardData.files[0];
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const result = event.target?.result as string;
                        const img = new Image();
                        img.onload = () => {
                            addElement('image', result, { width: img.width, height: img.height });
                        };
                        img.src = result;
                    };
                    reader.readAsDataURL(file);
                }
            }
        };
        window.addEventListener('click', handleGlobalClick);
        window.addEventListener('paste', handleWindowPaste);

        // Native wheel listener for non-passive behavior (Prevent Browser Zoom and enable Pan)
        const onWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const container = containerRef.current;
                if (!container) return;
                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                const oldZoom = zoomRef.current;
                const oldPan = panRef.current;

                // Dynamic zoom step for both trackpads (small deltaY) and mice (large deltaY)
                let step = Math.max(1, Math.min(20, Math.abs(e.deltaY) * 0.1));
                const delta = e.deltaY > 0 ? -step : step;
                const newZoom = Math.max(10, Math.min(500, oldZoom + delta));

                // The mathematical offset to keep the mouse stationary under the document is:
                // NewPan = MouseCoord - (MouseCoord - OldPan) * (NewZoom / OldZoom)
                const zoomFactor = newZoom / oldZoom;

                const newPan = {
                    x: mouseX - (mouseX - oldPan.x) * zoomFactor,
                    y: mouseY - (mouseY - oldPan.y) * zoomFactor
                };

                zoomRef.current = newZoom;
                panRef.current = newPan;

                setZoom(newZoom);
                setPan(newPan);
            } else {
                if (e.ctrlKey) { e.preventDefault(); return; }
                const target = e.target as HTMLElement | null;
                // Allow scrolling in popovers/modals/textareas/sidebars
                if (target?.closest('.overflow-y-auto, textarea, input, .history-popover-content, .sidebar, .right-sidebar')) {
                    return;
                }
                e.preventDefault();

                const oldPan = panRef.current;
                const newPan = {
                    x: oldPan.x - e.deltaX,
                    y: oldPan.y - e.deltaY
                };

                panRef.current = newPan;
                setPan(newPan);
            }
        };

        // Attach to window to catch all scrolls and prevent browser zoom
        window.addEventListener('wheel', onWheel, { passive: false });

        return () => {
            window.removeEventListener('click', handleGlobalClick);
            window.removeEventListener('paste', handleWindowPaste);
            window.removeEventListener('wheel', onWheel);
        };
    }, [elements, zoom, pan]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
            if ((e.metaKey || e.ctrlKey) && e.key === 'y') { e.preventDefault(); redo(); return; }
            if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(z => Math.min(200, z + 10)); return; }
            if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); setZoom(z => Math.max(10, z - 10)); return; }
            if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); setZoom(100); return; }
            if (e.shiftKey && e.key === '1') { e.preventDefault(); fitToScreen(); return; }
            if (e.code === 'Space' && !e.repeat) { const ae = document.activeElement as HTMLElement | null; const isTyping = ae?.tagName === 'TEXTAREA' || ae?.tagName === 'INPUT' || ae?.getAttribute('contenteditable') === 'true'; if (!isTyping) { e.preventDefault(); if (ae?.tagName === 'BUTTON') ae.blur(); setIsSpacePressed(true); } }

            if (e.key === 'Tab') {
                e.preventDefault();
                if (selectedElementId) {
                    const el = elements.find(e => e.id === selectedElementId);
                    if (el && (el.type === 'gen-image' || el.type === 'image') && el.url) {
                        setShowFastEdit(prev => !prev);
                        return;
                    }
                }
                textareaRef.current?.focus();
            }

            // Check for selected Chip deletion first to avoid deleting canvas elements
            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedChipId) {
                e.preventDefault();
                e.stopPropagation();
                removeInputBlock(selectedChipId);
                setSelectedChipId(null);
                return;
            }

            const ae = document.activeElement as HTMLElement | null;
            const isInTextInput = ae?.tagName === 'TEXTAREA' || ae?.tagName === 'INPUT' || ae?.getAttribute('contenteditable') === 'true';
            // Allow Delete/Backspace when focused textarea is empty (e.g. gen-node prompt)
            if (isInTextInput && (e.key === 'Backspace' || e.key === 'Delete') && selectedElementId) {
                const textContent = (ae as HTMLTextAreaElement | HTMLInputElement)?.value ?? ae?.textContent ?? '';
                if (!textContent) {
                    e.preventDefault();
                    (ae as HTMLElement)?.blur();
                    deleteSelectedElement();
                }
                return;
            }
            if (!isInTextInput) {
                // Multi-select alignment shortcuts (Alt + key)
                if (e.altKey && selectedElementIds.length > 1) {
                    const k = e.key.toLowerCase();
                    if (k === 'a') { e.preventDefault(); alignSelectedElements('left'); return; }
                    if (k === 'd') { e.preventDefault(); alignSelectedElements('right'); return; }
                    if (k === 'h') { e.preventDefault(); alignSelectedElements('center'); return; }
                    if (k === 'w') { e.preventDefault(); alignSelectedElements('top'); return; }
                    if (k === 's') { e.preventDefault(); alignSelectedElements('bottom'); return; }
                    if (k === 'v') { e.preventDefault(); alignSelectedElements('middle'); return; }
                }
                // Multi-select spacing shortcuts (Shift + key, not ctrl/meta)
                if (e.shiftKey && !e.ctrlKey && !e.metaKey && selectedElementIds.length > 1) {
                    const k = e.key.toUpperCase();
                    if (k === 'H') { e.preventDefault(); distributeSelectedElements('horizontal'); return; }
                    if (k === 'V') { e.preventDefault(); distributeSelectedElements('vertical'); return; }
                    if (k === 'A') { e.preventDefault(); distributeSelectedElements('auto'); return; }
                }
                // Group / Merge / Ungroup shortcuts
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        // Ctrl+Shift+G: merge or ungroup
                        const sel = elements.find(el => el.id === selectedElementId);
                        if (sel?.type === 'group') { handleUngroupSelected(); }
                        else if (selectedElementIds.length > 1) { handleMergeSelected(); }
                    } else {
                        // Ctrl+G: group
                        if (selectedElementIds.length > 1) { handleGroupSelected(); }
                    }
                    return;
                }
                if (e.key.toLowerCase() === 'v' && !(e.metaKey || e.ctrlKey)) setActiveTool('select');
                if (e.key.toLowerCase() === 'h' && !e.altKey) setActiveTool('hand');
                if (e.key.toLowerCase() === 'm') setActiveTool('mark');
                if (e.key === 'Backspace' || e.key === 'Delete') deleteSelectedElement();
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpacePressed(false); };
        window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
        return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
    }, [selectedElementId, history, historyStep, elements, markers, selectedChipId]);

    const addElement = (type: 'image' | 'video', url: string, dims?: { width: number, height: number }) => {
        const containerW = window.innerWidth - (showAssistant ? 480 : 0);
        const containerH = window.innerHeight;
        const centerX = (containerW / 2 - pan.x) / (zoom / 100);
        const centerY = (containerH / 2 - pan.y) / (zoom / 100);
        const width = dims?.width || 400;
        const height = dims?.height || 300;
        const newElement: CanvasElement = { id: Date.now().toString(), type, url, x: centerX - (width / 2), y: centerY - (height / 2), width, height, zIndex: elements.length + 1 };
        const newElements = [...elements, newElement];
        setElements(newElements);
        saveToHistory(newElements, markers);
    };

    const addShape = (shapeType: ShapeType) => {
        const containerW = window.innerWidth - (showAssistant ? 480 : 0);
        const containerH = window.innerHeight;
        const centerX = (containerW / 2 - pan.x) / (zoom / 100);
        const centerY = (containerH / 2 - pan.y) / (zoom / 100);
        const size = 100;
        const newElement: CanvasElement = {
            id: Date.now().toString(),
            type: 'shape',
            shapeType,
            x: centerX - (size / 2),
            y: centerY - (size / 2),
            width: size,
            height: size,
            fillColor: '#9CA3AF',
            strokeColor: 'transparent',
            strokeWidth: 2,
            cornerRadius: 0,
            aspectRatioLocked: false,
            zIndex: elements.length + 1
        };
        const newElements = [...elements, newElement];
        setElements(newElements);
        saveToHistory(newElements, markers);
        setSelectedElementId(newElement.id);
        setShowShapeMenu(false);
    };

    const addText = () => { const containerW = window.innerWidth - (showAssistant ? 480 : 0); const containerH = window.innerHeight; const centerX = (containerW / 2 - pan.x) / (zoom / 100); const centerY = (containerH / 2 - pan.y) / (zoom / 100); const newElement: CanvasElement = { id: Date.now().toString(), type: 'text', text: 'Type something...', x: centerX - 100, y: centerY - 25, width: 200, height: 50, fontSize: 90, fontFamily: 'Inter', fontWeight: 400, fillColor: '#000000', strokeColor: 'transparent', textAlign: 'left', zIndex: elements.length + 1 }; const newElements = [...elements, newElement]; setElements(newElements); saveToHistory(newElements, markers); setSelectedElementId(newElement.id); };
    const addGenImage = () => { const containerW = window.innerWidth - (showAssistant ? 480 : 0); const containerH = window.innerHeight; const centerX = (containerW / 2 - pan.x) / (zoom / 100); const centerY = (containerH / 2 - pan.y) / (zoom / 100); const newElement: CanvasElement = { id: Date.now().toString(), type: 'gen-image', x: centerX - 512, y: centerY - 512, width: 1024, height: 1024, zIndex: elements.length + 1, genModel: activeImageModel, genAspectRatio: '1:1', genResolution: '1K', genPrompt: '' }; const newElements = [...elements, newElement]; setElements(newElements); saveToHistory(newElements, markers); setSelectedElementId(newElement.id); };
    const addGenVideo = () => {
        const containerW = window.innerWidth - (showAssistant ? 480 : 0);
        const containerH = window.innerHeight;
        const centerX = (containerW / 2 - pan.x) / (zoom / 100);
        const centerY = (containerH / 2 - pan.y) / (zoom / 100);

        // Initial logical size depending on aspect ratio
        let startW = 1920;
        let startH = 1080;
        if (videoGenRatio === '9:16') { startW = 1080; startH = 1920; }
        else if (videoGenRatio === '1:1') { startW = 1080; startH = 1080; }

        const newElement: CanvasElement = {
            id: Date.now().toString(), type: 'gen-video',
            x: centerX - startW / 2, y: centerY - startH / 2,
            width: startW, height: startH,
            zIndex: elements.length + 1, genModel: videoGenModel, genAspectRatio: videoGenRatio,
            genQuality: videoGenQuality as any, genPrompt: '', genDuration: videoGenDuration as any,
            genStartFrame: videoStartFrame ? URL.createObjectURL(videoStartFrame) : undefined,
            genEndFrame: videoEndFrame ? URL.createObjectURL(videoEndFrame) : undefined,
            genVideoRefs: videoMultiRefs.map(f => URL.createObjectURL(f))
        };
        const newElements = [...elements, newElement];
        setElements(newElements);
        saveToHistory(newElements, markers);
        setSelectedElementId(newElement.id);
    };

    const getClosestAspectRatio = (width: number, height: number): string => { const ratio = width / height; let closest = '1:1'; let minDiff = Infinity; for (const ar of ASPECT_RATIOS) { const [w, h] = ar.value.split(':').map(Number); const r = w / h; const diff = Math.abs(ratio - r); if (diff < minDiff) { minDiff = diff; closest = ar.value; } } return closest; };

    const handleGenImage = async (elementId: string) => {
        const el = elements.find(e => e.id === elementId);
        if (!el || !el.genPrompt) return;
        const update1 = elements.map(e => e.id === elementId ? { ...e, isGenerating: true } : e);
        setElements(update1);
        const currentAspectRatio = getClosestAspectRatio(el.width, el.height);
        const model = (el.genModel as any) || 'Nano Banana Pro';
        try {
            const resultUrl = await imageGenSkill({
                prompt: el.genPrompt,
                model: model,
                aspectRatio: currentAspectRatio,
                imageSize: el.genResolution,
                referenceImages: el.genRefImages || (el.genRefImage ? [el.genRefImage] : [])
            });
            if (resultUrl) {
                const img = new Image();
                img.src = resultUrl;
                img.onload = async () => {
                    const update2 = elements.map(e => e.id === elementId ? { ...e, isGenerating: false, url: resultUrl } : e);
                    setElements(update2);
                    saveToHistory(update2, markers);
                };
            } else {
                const updateFail = elements.map(e => e.id === elementId ? { ...e, isGenerating: false } : e);
                setElements(updateFail);
            }
        } catch (e) {
            console.error(e);
            const updateFail = elements.map(e => e.id === elementId ? { ...e, isGenerating: false } : e);
            setElements(updateFail);
        }
    };

    const handleGenVideo = async (elementId: string) => {
        const el = elements.find(e => e.id === elementId);
        if (!el || !el.genPrompt) return;
        const update1 = elements.map(e => e.id === elementId ? { ...e, isGenerating: true } : e);
        setElements(update1);

        // Helper: convert blob URL to base64 data URI
        const blobToBase64 = async (url: string): Promise<string> => {
            if (!url || url.startsWith('data:')) return url;
            const res = await fetch(url);
            const blob = await res.blob();
            return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        };

        try {
            // Convert blob URLs to base64 before passing to provider
            let startFrame = el.genStartFrame;
            if (!startFrame && el.genModel?.includes('Fast') && el.genVideoRefs?.[0]) {
                startFrame = el.genVideoRefs[0];
            }
            if (startFrame) startFrame = await blobToBase64(startFrame);

            let endFrame = el.genEndFrame;
            if (endFrame) endFrame = await blobToBase64(endFrame);

            let refImages: string[] | undefined;
            if (el.genVideoRefs && el.genVideoRefs.length > 0) {
                refImages = await Promise.all(el.genVideoRefs.map(blobToBase64));
            }

            const resultUrl = await videoGenSkill({
                prompt: el.genPrompt,
                aspectRatio: el.genAspectRatio as any || '16:9',
                model: el.genModel as VideoModel || 'Veo 3.1 Fast',
                startFrame: startFrame,
                endFrame: endFrame,
                referenceImages: refImages
            });
            if (resultUrl) {
                const update2 = elements.map(e => e.id === elementId ? { ...e, isGenerating: false, url: resultUrl } : e);
                setElements(update2);
                saveToHistory(update2, markers);
            } else {
                const updateFail = elements.map(e => e.id === elementId ? { ...e, isGenerating: false } : e);
                setElements(updateFail);
                addMessage({ id: Date.now().toString(), role: 'model', text: '视频生成未返回结果，请检查模型配置或稍后重试。', timestamp: Date.now() });
            }
        } catch (e: any) {
            console.error(e);
            const updateFail = elements.map(e2 => e2.id === elementId ? { ...e2, isGenerating: false } : e2);
            setElements(updateFail);
            const errMsg = e?.message || '未知错误';
            addMessage({ id: Date.now().toString(), role: 'model', text: `视频生成失败：${errMsg}`, timestamp: Date.now() });
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
        const files = Array.from(e.target.files || []).slice(0, 10); // Limit to 10 files
        if (files.length === 0) return;

        let addedCount = 0;
        const newElementsToAppend: CanvasElement[] = [];

        const checkDone = () => {
            addedCount++;
            if (addedCount === files.length) {
                if (newElementsToAppend.length > 0) {
                    const finalElements = [...elements, ...newElementsToAppend];
                    setElements(finalElements);
                    saveToHistory(finalElements, markers);
                }
            }
        };

        files.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result as string;
                if (type === 'image') {
                    const img = new Image();
                    img.onload = () => {
                        const containerW = window.innerWidth - (showAssistant ? 480 : 0);
                        const containerH = window.innerHeight;
                        const centerX = (containerW / 2 - pan.x) / (zoom / 100);
                        const centerY = (containerH / 2 - pan.y) / (zoom / 100);

                        let width = img.width;
                        let height = img.height;

                        // Offset multiple images slightly
                        const offset = index * 20;

                        const newElement: CanvasElement = {
                            id: Date.now().toString() + index,
                            type: 'image',
                            url: result,
                            x: centerX - (width / 2) + offset,
                            y: centerY - (height / 2) + offset,
                            width,
                            height,
                            zIndex: elements.length + index + 1
                        };
                        newElementsToAppend.push(newElement);
                        checkDone();
                    };
                    img.src = result;
                } else {
                    const containerW = window.innerWidth - (showAssistant ? 480 : 0);
                    const containerH = window.innerHeight;
                    const centerX = (containerW / 2 - pan.x) / (zoom / 100);
                    const centerY = (containerH / 2 - pan.y) / (zoom / 100);
                    const width = 800;
                    const height = 450;
                    const offset = index * 20;
                    const newElement: CanvasElement = {
                        id: Date.now().toString() + index,
                        type: 'video',
                        url: result,
                        x: centerX - (width / 2) + offset,
                        y: centerY - (height / 2) + offset,
                        width,
                        height,
                        zIndex: elements.length + index + 1
                    };
                    newElementsToAppend.push(newElement);
                    checkDone();
                }
            };
            reader.readAsDataURL(file);
        });

        setShowInsertMenu(false);
        if (e.target) e.target.value = ''; // Reset input
    };

    const handleCanvasDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/')).slice(0, 10);
        if (files.length === 0) return;

        // Calculate drop point in canvas coordinates
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dropX = e.clientX - rect.left;
        const dropY = e.clientY - rect.top;
        const canvasDropX = (dropX - pan.x) / (zoom / 100);
        const canvasDropY = (dropY - pan.y) / (zoom / 100);

        let addedCount = 0;
        const newElementsToAppend: CanvasElement[] = [];
        const checkDone = () => {
            addedCount++;
            if (addedCount === files.length && newElementsToAppend.length > 0) {
                const finalElements = [...elements, ...newElementsToAppend];
                setElements(finalElements);
                saveToHistory(finalElements, markers);
            }
        };

        files.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result as string;
                if (file.type.startsWith('image/')) {
                    const img = new Image();
                    img.onload = () => {
                        let width = img.width;
                        let height = img.height;
                        const offset = index * 20;
                        newElementsToAppend.push({
                            id: Date.now().toString() + index,
                            type: 'image',
                            url: result,
                            x: canvasDropX - (width / 2) + offset,
                            y: canvasDropY - (height / 2) + offset,
                            width,
                            height,
                            zIndex: elements.length + index + 1
                        });
                        checkDone();
                    };
                    img.src = result;
                } else {
                    const width = 800;
                    const height = 450;
                    const offset = index * 20;
                    newElementsToAppend.push({
                        id: Date.now().toString() + index,
                        type: 'video',
                        url: result,
                        x: canvasDropX - (width / 2) + offset,
                        y: canvasDropY - (height / 2) + offset,
                        width,
                        height,
                        zIndex: elements.length + index + 1
                    });
                    checkDone();
                }
            };
            reader.readAsDataURL(file);
        });
    };
    const handleRefImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, elementId: string) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const el = elements.find(e => e.id === elementId);
        if (!el) return;

        const currentImages = el.genRefImages || (el.genRefImage ? [el.genRefImage] : []);
        if (currentImages.length >= 6) return; // Hard limit

        const remainingSlots = 6 - currentImages.length;
        const filesToProcess = Array.from(files).slice(0, remainingSlots);

        const newImages = [...currentImages];
        for (const file of filesToProcess) {
            const compressedBase64 = await compressImage(file);
            newImages.push(compressedBase64);
        }

        updateSelectedElement({
            genRefImages: newImages,
            genRefImage: newImages[0] // sync first image for legacy support
        });
    };


    const handleVideoRefUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'start' | 'end' | 'ref', index?: number) => {
        const file = e.target.files?.[0];
        if (!file || !selectedElementId) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            const el = elements.find(e => e.id === selectedElementId);
            if (!el) return;
            if (type === 'start') {
                updateSelectedElement({ genStartFrame: result });
            } else if (type === 'end') {
                updateSelectedElement({ genEndFrame: result });
            } else if (type === 'ref') {
                const currentRefs = el.genVideoRefs || [];
                if (index !== undefined) {
                    const newRefs = [...currentRefs];
                    newRefs[index] = result;
                    updateSelectedElement({ genVideoRefs: newRefs });
                } else {
                    updateSelectedElement({ genVideoRefs: [...currentRefs, result] });
                }
            }
        };
        reader.readAsDataURL(file);
    };

    const handleContextMenu = (e: React.MouseEvent) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); };
    // Wheel handled by native listener in useEffect
    const handleMouseDown = (e: React.MouseEvent) => {
        if (contextMenu) setContextMenu(null);
        const target = e.target as HTMLElement;
        // 冗余解选逻辑已移动到 handleGlobalMouseDown (捕获阶段)
        // 此处不再进行强制解选，以免干扰 handleMouseMove 中的框选逻辑

        // 处理平移 (Pan) 逻辑
        if (activeTool === 'hand' || e.button === 1 || (e.button === 0 && isSpacePressed)) {
            e.preventDefault();
            (document.activeElement as HTMLElement)?.blur();
            setIsPanning(true);
            setDragStart({ x: e.clientX, y: e.clientY });
            return;
        }

        // 如果点击的是背景容器或画布层
        if (target === containerRef.current || target === canvasLayerRef.current || target.classList.contains('canvas-background')) {
            // 背景点击的“取消选中”逻辑现在由 useEffect 中的 handleGlobalMouseDown (捕获阶段) 统一处理
            // 此处仅保留处理 平移 (Pan) 和 框选 (Marquee) 的初始化
            e.preventDefault();
            (document.activeElement as HTMLElement)?.blur();
            if (activeTool === 'select') {
                setIsMarqueeSelecting(true);
                setMarqueeStart({ x: e.clientX, y: e.clientY });
                setMarqueeEnd({ x: e.clientX, y: e.clientY });
            } else {
                setIsPanning(true);
                setDragStart({ x: e.clientX, y: e.clientY });
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isResizing && selectedElementId) {
            const dx = (e.clientX - resizeStart.x) / (zoom / 100);
            const dy = (e.clientY - resizeStart.y) / (zoom / 100);
            let newWidth = resizeStart.width;
            let newHeight = resizeStart.height;
            let newX = resizeStart.left;
            let newY = resizeStart.top;
            if (resizeHandle?.includes('e')) newWidth = Math.max(20, resizeStart.width + dx);
            if (resizeHandle?.includes('s')) newHeight = Math.max(20, resizeStart.height + dy);
            if (resizeHandle?.includes('w')) {
                const widthDiff = Math.min(resizeStart.width - 20, dx);
                newWidth = resizeStart.width - widthDiff;
                newX = resizeStart.left + widthDiff;
            }
            if (resizeHandle?.includes('n')) {
                const heightDiff = Math.min(resizeStart.height - 20, dy);
                newHeight = resizeStart.height - heightDiff;
                newY = resizeStart.top + heightDiff;
            }
            const el = elements.find(e => e.id === selectedElementId);
            if (el?.aspectRatioLocked) {
                const ratio = resizeStart.width / resizeStart.height;
                if (resizeHandle?.includes('e') || resizeHandle?.includes('w')) { newHeight = newWidth / ratio; } else if (resizeHandle?.includes('n') || resizeHandle?.includes('s')) { newWidth = newHeight * ratio; } else { newHeight = newWidth / ratio; }
            }
            setElements(prev => prev.map(el => {
                if (el.id === selectedElementId) {
                    const ar = getClosestAspectRatio(newWidth, newHeight);
                    return { ...el, x: newX, y: newY, width: newWidth, height: newHeight, genAspectRatio: el.type === 'gen-image' ? ar : el.genAspectRatio };
                }
                return el;
            }));
            return;
        }
        if (isPanning) {
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            setDragStart({ x: e.clientX, y: e.clientY });
        } else if (isMarqueeSelecting) {
            // 限制框选范围在画布容器内
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                const clampedX = Math.max(rect.left, Math.min(e.clientX, rect.right));
                const clampedY = Math.max(rect.top, Math.min(e.clientY, rect.bottom));
                setMarqueeEnd({ x: clampedX, y: clampedY });
                // 实时计算框选范围内的元素
                const sx = (Math.min(marqueeStart.x, clampedX) - rect.left - pan.x) / (zoom / 100);
                const sy = (Math.min(marqueeStart.y, clampedY) - rect.top - pan.y) / (zoom / 100);
                const sw = Math.abs(clampedX - marqueeStart.x) / (zoom / 100);
                const sh = Math.abs(clampedY - marqueeStart.y) / (zoom / 100);
                const hits = elements.filter(el => {
                    return el.x < sx + sw && el.x + el.width > sx && el.y < sy + sh && el.y + el.height > sy;
                }).map(el => el.id);
                setSelectedElementIds(hits);
                if (hits.length === 1) setSelectedElementId(hits[0]);
                else if (hits.length === 0) setSelectedElementId(null);
            }
        } else if (isDraggingElement && selectedElementId) {
            const dx = (e.clientX - dragStart.x) / (zoom / 100);
            const dy = (e.clientY - dragStart.y) / (zoom / 100);
            const dragEl = elements.find(el => el.id === selectedElementId);
            if (!dragEl) return;

            let newX = elementStartPos.x + dx;
            let newY = elementStartPos.y + dy;

            // 智能对齐线计算（排除所有选中元素）
            const SNAP_THRESHOLD = 6;
            const guides: { type: 'h' | 'v', pos: number }[] = [];
            let draggingIds = selectedElementIds.length > 1 ? [...selectedElementIds] : [selectedElementId];
            // Expand group children into draggingIds
            for (const did of [...draggingIds]) {
                const dEl = elements.find(e => e.id === did);
                if (dEl?.type === 'group' && dEl.children) {
                    for (const cid of dEl.children) {
                        if (!draggingIds.includes(cid)) draggingIds.push(cid);
                    }
                }
            }
            const others = elements.filter(el => !draggingIds.includes(el.id));
            const dragCX = newX + dragEl.width / 2;
            const dragCY = newY + dragEl.height / 2;
            const dragR = newX + dragEl.width;
            const dragB = newY + dragEl.height;

            for (const other of others) {
                const oCX = other.x + other.width / 2;
                const oCY = other.y + other.height / 2;
                const oR = other.x + other.width;
                const oB = other.y + other.height;

                // 垂直对齐 (V lines)
                if (Math.abs(newX - other.x) < SNAP_THRESHOLD) { newX = other.x; guides.push({ type: 'v', pos: other.x }); }
                else if (Math.abs(dragR - oR) < SNAP_THRESHOLD) { newX = oR - dragEl.width; guides.push({ type: 'v', pos: oR }); }
                else if (Math.abs(dragCX - oCX) < SNAP_THRESHOLD) { newX = oCX - dragEl.width / 2; guides.push({ type: 'v', pos: oCX }); }
                else if (Math.abs(newX - oR) < SNAP_THRESHOLD) { newX = oR; guides.push({ type: 'v', pos: oR }); }
                else if (Math.abs(dragR - other.x) < SNAP_THRESHOLD) { newX = other.x - dragEl.width; guides.push({ type: 'v', pos: other.x }); }

                // 水平对齐 (H lines)
                if (Math.abs(newY - other.y) < SNAP_THRESHOLD) { newY = other.y; guides.push({ type: 'h', pos: other.y }); }
                else if (Math.abs(dragB - oB) < SNAP_THRESHOLD) { newY = oB - dragEl.height; guides.push({ type: 'h', pos: oB }); }
                else if (Math.abs(dragCY - oCY) < SNAP_THRESHOLD) { newY = oCY - dragEl.height / 2; guides.push({ type: 'h', pos: oCY }); }
                else if (Math.abs(newY - oB) < SNAP_THRESHOLD) { newY = oB; guides.push({ type: 'h', pos: oB }); }
                else if (Math.abs(dragB - other.y) < SNAP_THRESHOLD) { newY = other.y - dragEl.height; guides.push({ type: 'h', pos: other.y }); }
            }
            setAlignGuides(guides);

            // 基于初始位置计算总偏移（避免累加漂移）
            const primaryStart = groupDragStartRef.current[selectedElementId];
            const totalDx = newX - (primaryStart?.x ?? elementStartPos.x);
            const totalDy = newY - (primaryStart?.y ?? elementStartPos.y);

            // Performance: store positions in ref, update DOM directly via rAF
            const newOffsets: Record<string, { x: number, y: number }> = {};
            for (const elId of draggingIds) {
                const start = groupDragStartRef.current[elId];
                if (start) {
                    newOffsets[elId] = { x: start.x + totalDx, y: start.y + totalDy };
                } else if (elId === selectedElementId) {
                    newOffsets[elId] = { x: newX, y: newY };
                }
            }
            dragOffsetsRef.current = newOffsets;

            // Direct DOM update via rAF (no React re-render)
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = requestAnimationFrame(() => {
                for (const [elId, pos] of Object.entries(newOffsets)) {
                    const dom = document.getElementById(`canvas-el-${elId}`);
                    if (dom) {
                        dom.style.left = `${pos.x}px`;
                        dom.style.top = `${pos.y}px`;
                    }
                }
                // Toolbar position is handled by React re-renders using dragOffsetsRef
            });
        }
    };

    const handleMouseUp = () => {

        if (isResizing) {
            setIsResizing(false);
            setResizeHandle(null);
            saveToHistory(elements, markers);
        }
        if (isDraggingElement && selectedElementId) {
            // Commit drag positions from ref to React state
            const offsets = dragOffsetsRef.current;
            if (Object.keys(offsets).length > 0) {
                setElements(prev => prev.map(el => {
                    const pos = offsets[el.id];
                    if (pos) return { ...el, x: pos.x, y: pos.y };
                    return el;
                }));
                dragOffsetsRef.current = {};
                // Save to history if position actually changed
                const el = elements.find(e => e.id === selectedElementId);
                if (el && (offsets[selectedElementId]?.x !== elementStartPos.x || offsets[selectedElementId]?.y !== elementStartPos.y)) {
                    // Use setTimeout to ensure setElements has committed
                    setTimeout(() => saveToHistory(elements, markers), 0);
                }
            } else {
                const el = elements.find(e => e.id === selectedElementId);
                if (el && (el.x !== elementStartPos.x || el.y !== elementStartPos.y)) {
                    saveToHistory(elements, markers);
                }
            }
        }
        if (isMarqueeSelecting) {
            setIsMarqueeSelecting(false);
        }
        setAlignGuides([]);
        setIsPanning(false);
        setIsDraggingElement(false);
    };

    // Crop Image Utility
    const cropImageRegion = async (imageUrl: string, xPct: number, yPct: number, width: number = 200, height: number = 200): Promise<string | null> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.src = imageUrl;
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { resolve(null); return; }

                    const sourceX = (xPct / 100) * img.naturalWidth - (width / 2);
                    const sourceY = (yPct / 100) * img.naturalHeight - (height / 2);

                    // Draw zoomed crop
                    ctx.drawImage(img, sourceX, sourceY, width, height, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    console.warn('cropImageRegion: canvas tainted or draw failed', e);
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
        });
    };

    const handleElementMouseDown = async (e: React.MouseEvent, id: string) => {
        if (isSpacePressed || activeTool === 'hand') return;

        // 图像模式：从画布选择参考图（不影响 Agent 模式输入链路）
        if (creationMode === 'image' && isPickingFromCanvas) {
            const pickedEl = elements.find(el => el.id === id);
            if (pickedEl && (pickedEl.type === 'image' || pickedEl.type === 'gen-image') && pickedEl.url) {
                e.stopPropagation();
                e.preventDefault();
                try {
                    const resp = await fetch(pickedEl.url);
                    const blob = await resp.blob();
                    const file = new File([blob], `canvas-ref-${pickedEl.id.slice(-6)}.png`, { type: blob.type || 'image/png' });
                    setImageGenUpload(file);
                } catch (err) {
                    console.warn('Pick image from canvas failed:', err);
                } finally {
                    setIsPickingFromCanvas(false);
                }
                return;
            }
        }

        // Locked element protection
        const elObj = elements.find(el => el.id === id);
        if (elObj?.isLocked) return;
        e.stopPropagation();
        e.preventDefault();

        if (activeTool === 'mark' || e.ctrlKey || e.metaKey) {
            // 精准定位：优先使用图片 <img> 元素的 rect，而非外层容器（容器可能有溢出子元素导致 rect 偏移）
            const imgEl = (e.currentTarget as HTMLElement).querySelector('img');
            const rect = imgEl ? imgEl.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

            // 修复：生成持久且唯一的稳定 ID，避免删除时重排导致动画重置
            const newMarkerId = (Date.now() + Math.random()).toString();

            // Crop and Add to Input Box logic
            const el = elements.find(e => e.id === id);
            let cropUrl: string | undefined = undefined;

            try {
                if (el && (el.type === 'image' || el.type === 'gen-image') && el.url) {
                    const cropWidth = 300;
                    const cropHeight = 300;

                    const crop = await cropImageRegion(el.url, x, y, cropWidth, cropHeight);
                    if (crop) {
                        cropUrl = crop;

                        if (!showAssistant) {
                            setShowAssistant(true);
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }

                        const file = dataURLtoFile(crop, `marker-${markers.length + 1}.png`);
                        (file as any).markerId = newMarkerId;
                        (file as any).markerName = '识别中...';
                        (file as any).markerInfo = {
                            fullImageUrl: el.url,
                            x: (x / 100) * el.width - cropWidth / 2,
                            y: (y / 100) * el.height - cropHeight / 2,
                            width: cropWidth,
                            height: cropHeight,
                            imageWidth: el.width,
                            imageHeight: el.height
                        };

                        if (creationMode === 'agent') {
                            setTimeout(() => {
                                insertInputFile(file);
                            }, 150);
                        }

                        // 异步识别裁剪区域内容，识别完成后更新 chip 名称
                        analyzeImageRegion(crop).then(name => {
                            const trimmed = name.trim().slice(0, 10);
                            if (trimmed && trimmed !== 'Could not analyze selection.' && trimmed !== 'Analysis failed.') {
                                (file as any).markerName = trimmed;
                                (file as any).lastAiAnalysis = trimmed;
                                // 触发 inputBlocks 重新渲染
                                setInputBlocks([...useAgentStore.getState().inputBlocks]);
                                // 同步更新 markers 状态中的 analysis
                                setMarkers(prev => prev.map(m => m.id === newMarkerId ? { ...m, analysis: trimmed } : m));
                            }
                        }).catch(() => { });

                    }
                }
            } catch (err) {
                console.warn('Mark crop failed, continuing with marker placement', err);
            }

            const newMarkers = [...markers, { id: newMarkerId, x, y, elementId: id, cropUrl }];
            setMarkers(newMarkers);
            saveToHistory(elements, newMarkers);

            // 缩放聚焦动画 — 平滑缩放到标记位置（Lovart style）
            if (el && containerRef.current) {
                const containerRect = containerRef.current.getBoundingClientRect();
                const targetZoom = 100; // 放大到100%（不超过100%以保持全局视野）
                const scale = targetZoom / 100;
                // 标记在画布坐标系中的位置
                const markerCanvasX = el.x + (el.width * x / 100);
                const markerCanvasY = el.y + (el.height * y / 100);
                // 计算让标记居中所需的 pan
                const targetPanX = containerRect.width / 2 - markerCanvasX * scale;
                const targetPanY = containerRect.height / 2 - markerCanvasY * scale;

                // 平滑动画
                const startZoom = zoom;
                const startPanX = pan.x;
                const startPanY = pan.y;
                const duration = 400;
                const startTime = performance.now();

                const animate = (now: number) => {
                    const elapsed = now - startTime;
                    const t = Math.min(elapsed / duration, 1);
                    // ease-out cubic
                    const ease = 1 - Math.pow(1 - t, 3);
                    setZoom(startZoom + (targetZoom - startZoom) * ease);
                    setPan({
                        x: startPanX + (targetPanX - startPanX) * ease,
                        y: startPanY + (targetPanY - startPanY) * ease
                    });
                    if (t < 1) requestAnimationFrame(animate);
                };
                requestAnimationFrame(animate);
            }

            return;
        }

        if (id !== selectedElementId) setEditingTextId(null);
        // If clicking a child of a non-collapsed group, select the group instead
        let effectiveId = id;
        const clickedEl = elements.find(e => e.id === id);
        if (clickedEl?.groupId) {
            const parentGroup = elements.find(e => e.id === clickedEl.groupId);
            if (parentGroup && !parentGroup.isCollapsed) {
                effectiveId = parentGroup.id;
            }
        }
        // 如果点击的元素已在多选列表中，保持多选状态（群拖）
        if (selectedElementIds.length > 1 && selectedElementIds.includes(effectiveId)) {
            setSelectedElementId(effectiveId);
            // 不重置 selectedElementIds
        } else {
            setSelectedElementId(effectiveId);
            setSelectedElementIds([effectiveId]);
        }
        setIsDraggingElement(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        const el = elements.find(e => e.id === effectiveId);
        if (el) setElementStartPos({ x: el.x, y: el.y });
        // 记录所有选中元素的初始位置（群拖用），展开 group children
        let draggingIds = (selectedElementIds.length > 1 && selectedElementIds.includes(effectiveId)) ? [...selectedElementIds] : [effectiveId];
        for (const did of [...draggingIds]) {
            const dEl = elements.find(e => e.id === did);
            if (dEl?.type === 'group' && dEl.children) {
                for (const cid of dEl.children) {
                    if (!draggingIds.includes(cid)) draggingIds.push(cid);
                }
            }
        }
        const startMap: Record<string, { x: number, y: number }> = {};
        for (const did of draggingIds) {
            const d = elements.find(e => e.id === did);
            if (d) startMap[did] = { x: d.x, y: d.y };
        }
        groupDragStartRef.current = startMap;
    };

    const handleResizeStart = (e: React.MouseEvent, handle: string, elementId: string) => {
        e.stopPropagation();
        e.preventDefault();
        const el = elements.find(e => e.id === elementId);
        if (!el) return;

        // Locked element protection (including inheritance)
        const isLocked = el.isLocked || (el.groupId ? elements.find(g => g.id === el.groupId)?.isLocked : false);
        if (isLocked) return;

        setIsResizing(true);
        setResizeHandle(handle);
        setResizeStart({ x: e.clientX, y: e.clientY, width: el.width, height: el.height, left: el.x, top: el.y });
    };
    const handleSaveMarkerLabel = (markerId: string, label: string) => {
        const newMarkers = markers.map(m => m.id === markerId ? { ...m, label } : m);
        setMarkers(newMarkers);
        saveToHistory(elements, newMarkers);
        setEditingMarkerId(null);

        // 同步更新侧边栏 Chip名称
        const currentBlocks = useAgentStore.getState().inputBlocks;
        const newBlocks = currentBlocks.map(b => {
            if (b.type === 'file' && b.file && (b.file as any).markerId === markerId) {
                (b.file as any).markerName = label || (b.file as any).lastAiAnalysis || '识别中...';
            }
            return b;
        });
        setInputBlocks([...newBlocks]);
    };

    const removeMarker = (id: string) => {

        const newMarkers = markers.filter(m => m.id !== id);
        setMarkers(newMarkers);
        saveToHistory(elements, newMarkers);
        // 同步删除对应 chip
        const currentBlocks = useAgentStore.getState().inputBlocks;
        const filtered = currentBlocks.filter(b => !(b.type === 'file' && b.file && (b.file as any).markerId === id));
        // 修复：不再对 markerId 重新编号，以保持稳定
        setInputBlocks([...filtered]);
    };

    const handleToolMenuMouseEnter = () => { if (closeToolMenuTimerRef.current) clearTimeout(closeToolMenuTimerRef.current); setShowInsertMenu(false); setShowShapeMenu(false); setShowToolMenu(true); };
    const handleToolMenuMouseLeave = () => { closeToolMenuTimerRef.current = setTimeout(() => { setShowToolMenu(false); }, 100); };
    const handleMenuMouseEnter = () => { if (closeMenuTimerRef.current) { clearTimeout(closeMenuTimerRef.current); closeMenuTimerRef.current = null; } setShowToolMenu(false); setShowShapeMenu(false); setShowInsertMenu(true); };
    const handleMenuMouseLeave = () => { closeMenuTimerRef.current = setTimeout(() => { setShowInsertMenu(false); }, 100); };
    const handleShapeMenuMouseEnter = () => { if (closeShapeMenuTimerRef.current) { clearTimeout(closeShapeMenuTimerRef.current); closeShapeMenuTimerRef.current = null; } setShowToolMenu(false); setShowInsertMenu(false); setShowShapeMenu(true); };
    const handleShapeMenuMouseLeave = () => { closeShapeMenuTimerRef.current = setTimeout(() => { setShowShapeMenu(false); }, 100); };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files!);
            files.forEach(f => insertInputFile(f as File));
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const startNewChat = () => {
        setActiveConversationId('');
        clearMessages();
        setInputBlocks([{ id: 'init', type: 'text', text: '' }]);
        setMarkers([]);
        setWebEnabled(false);
        setHistoryStep(0);
        chatSessionRef.current = createChatSession('gemini-3-pro-preview');
        setShowHistoryPopover(false);
    };

    const renderToolbar = () => {
        let NavIcon = MousePointer2;
        if (activeTool === 'hand') NavIcon = Hand;

        return (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-[0_2px_20px_rgba(0,0,0,0.08)] border border-gray-200/60 px-2 py-1.5 flex flex-row gap-0.5 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 items-center" style={{ marginLeft: showAssistant ? '-240px' : '0' }}>
                {/* 1. Select / Hand */}
                <div className="relative group/nav">
                    <button className={`p-2.5 rounded-xl transition ${['select', 'hand'].includes(activeTool) ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-black hover:bg-gray-100'}`}><NavIcon size={18} /></button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-2 z-50 hidden group-hover/nav:block">
                        <div className="w-44 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 flex flex-col gap-0.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <button onClick={() => setActiveTool('select')} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${activeTool === 'select' ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50'}`}><div className="flex items-center gap-3"><MousePointer2 size={16} /> Select</div><span className="text-xs text-gray-400 font-medium">V</span></button>
                            <button onClick={() => setActiveTool('hand')} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${activeTool === 'hand' ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50'}`}><div className="flex items-center gap-3"><Hand size={16} /> Hand Tool</div><span className="text-xs text-gray-400 font-medium">H</span></button>
                        </div>
                    </div>
                </div>

                {/* 2. Mark (Independent Pin) */}
                <TooltipButton icon={MapPin} label="Mark (M)" onClick={() => setActiveTool('mark')} active={activeTool === 'mark'} />

                {/* 3. Upload (Image / Video) */}
                <div className="relative group/ins">
                    <button className={`p-2.5 rounded-xl transition ${activeTool === 'insert' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-black hover:bg-gray-100'}`}><ImagePlus size={18} /></button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-2 z-50 hidden group-hover/ins:block">
                        <div className="w-44 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 flex flex-col gap-0.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <label className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer transition text-left w-full"><ImageIcon size={16} /> 上传图片 <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFileUpload(e, 'image')} /></label>
                            <label className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer transition text-left w-full"><Film size={16} /> 上传视频 <input type="file" accept="video/*" multiple className="hidden" onChange={(e) => handleFileUpload(e, 'video')} /></label>
                        </div>
                    </div>
                </div>

                {/* 4. Artboard (#) */}
                <TooltipButton icon={Hash} label="Artboard (#)" onClick={() => { }} />

                {/* 5. Shape */}
                <div className="relative group/shp">
                    <button className={`p-2.5 rounded-xl transition ${activeTool === 'shape' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-black hover:bg-gray-100'}`}><Square size={18} /></button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-2 z-50 hidden group-hover/shp:block">
                        <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-3 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200 w-48">
                            <div className="text-[11px] font-medium text-gray-400">形状</div>
                            <div className="grid grid-cols-5 gap-1">
                                <ShapeMenuItem icon={Square} onClick={() => addShape('square')} />
                                <ShapeMenuItem icon={CircleIcon} onClick={() => addShape('circle')} />
                                <ShapeMenuItem icon={Triangle} onClick={() => addShape('triangle')} />
                                <ShapeMenuItem icon={Star} onClick={() => addShape('star')} />
                                <ShapeMenuItem icon={MessageSquare} onClick={() => addShape('bubble')} />
                            </div>
                            <div className="text-[11px] font-medium text-gray-400 mt-1">箭头</div>
                            <div className="grid grid-cols-5 gap-1">
                                <ShapeMenuItem icon={ArrowLeft} onClick={() => addShape('arrow-left')} />
                                <ShapeMenuItem icon={ArrowRight} onClick={() => addShape('arrow-right')} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 6. Pencil */}
                <TooltipButton icon={PenTool} label="Draw (P)" onClick={() => { }} />

                {/* 7. Text */}
                <TooltipButton icon={Type} label="Text (T)" onClick={addText} />

                {/* Separator / Gap */}
                <div className="w-px h-6 bg-gray-200/80 mx-1.5" />

                {/* 8. AI Image Gen */}
                <TooltipButton icon={ImagePlus} label="AI 图像生成" onClick={() => addGenImage()} />

                {/* 9. AI Video Gen */}
                <TooltipButton icon={Video} label="AI 视频生成" onClick={() => addGenVideo()} />
            </div>
        );
    };

    const renderContextMenu = () => {
        if (!contextMenu) return null;
        const el = selectedElementId ? elements.find(e => e.id === selectedElementId) : null;
        const isImage = el && (el.type === 'image' || (el.type === 'gen-image' && el.url));
        return (
            <div
                className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200/80 py-1.5 w-52 text-sm backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onClick={(e) => e.stopPropagation()}
            >
                <button onClick={() => { handleManualPaste(); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 flex justify-between items-center group">
                    <span>粘贴</span><span className="text-xs text-gray-400 font-sans group-hover:text-gray-500">Ctrl + V</span>
                </button>
                {isImage && (
                    <button onClick={handleDownload} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 flex justify-between items-center group">
                        <span>下载图片</span><Download size={14} className="text-gray-400 group-hover:text-gray-500" />
                    </button>
                )}
                <div className="h-px bg-gray-100 my-1"></div>
                <button onClick={() => { setZoom(z => Math.min(200, z + 10)); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 flex justify-between items-center group">
                    <span>放大</span><span className="text-xs text-gray-400 font-sans group-hover:text-gray-500">Ctrl + +</span>
                </button>
                <button onClick={() => { setZoom(z => Math.max(10, z - 10)); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 flex justify-between items-center group">
                    <span>缩小</span><span className="text-xs text-gray-400 font-sans group-hover:text-gray-500">Ctrl + -</span>
                </button>
                <button onClick={() => { fitToScreen(); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 flex justify-between items-center group">
                    <span>显示画布所有图片</span><span className="text-xs text-gray-400 font-sans group-hover:text-gray-500">Shift + 1</span>
                </button>
                <button onClick={() => { setZoom(100); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 flex justify-between items-center group">
                    <span>缩放至100%</span><span className="text-xs text-gray-400 font-sans group-hover:text-gray-500">Ctrl + 0</span>
                </button>
            </div>
        );
    };

    const renderTextToolbar = () => { if (!selectedElementId || selectedElementIds.length > 1) return null; const el = elements.find(e => e.id === selectedElementId); if (!el || el.type !== 'text') return null; return (<div className="absolute top-24 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-lg border border-gray-200 p-1.5 flex items-center gap-1 z-40 animate-in fade-in slide-in-from-top-2"> <div className="relative"><button onClick={() => setShowFontPicker(!showFontPicker)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 rounded-lg text-sm font-medium w-32 justify-between"><span className="truncate">{el.fontFamily}</span><ChevronDown size={12} /></button>{showFontPicker && (<div className="absolute top-full left-0 mt-1 w-48 max-h-60 overflow-y-auto bg-white rounded-xl shadow-xl border border-gray-100 p-1 z-50">{FONTS.map(font => (<button key={font} onClick={() => { updateSelectedElement({ fontFamily: font }); setShowFontPicker(false); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-lg text-sm" style={{ fontFamily: font }}>{font}</button>))}</div>)}</div><div className="w-px h-4 bg-gray-200 mx-1"></div><button onClick={() => updateSelectedElement({ fontWeight: el.fontWeight === 700 ? 400 : 700 })} className={`p-1.5 rounded-lg ${el.fontWeight === 700 ? 'bg-gray-200 text-black' : 'hover:bg-gray-100 text-gray-600'}`}><BoldIcon size={16} /></button><button onClick={() => updateSelectedElement({ textDecoration: el.textDecoration === 'underline' ? 'none' : 'underline' })} className={`p-1.5 rounded-lg ${el.textDecoration === 'underline' ? 'bg-gray-200 text-black' : 'hover:bg-gray-100 text-gray-600'}`}><Underline size={16} /></button><div className="w-px h-4 bg-gray-200 mx-1"></div><div className="flex items-center gap-2 px-2"><div className="relative w-5 h-5 rounded-full overflow-hidden border border-gray-200 cursor-pointer shadow-sm"><input type="color" value={el.fillColor} onChange={(e) => updateSelectedElement({ fillColor: e.target.value })} className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer p-0 border-0" /></div></div></div>); };

    const renderShapeToolbar = () => {
        if (!selectedElementId || selectedElementIds.length > 1) return null;
        const el = elements.find(e => e.id === selectedElementId);
        if (!el || el.type !== 'shape') return null;
        return (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-lg border border-gray-200 p-1.5 flex items-center gap-3 z-40 animate-in fade-in slide-in-from-top-2 px-3 whitespace-nowrap">
                <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-300 shadow-sm cursor-pointer hover:ring-2 hover:ring-gray-200 transition">
                    <div className="w-full h-full" style={{ backgroundColor: el.fillColor }}></div>
                    <input type="color" value={el.fillColor} onChange={(e) => updateSelectedElement({ fillColor: e.target.value })} className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
                <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-300 shadow-sm cursor-pointer hover:ring-2 hover:ring-gray-200 transition bg-white flex items-center justify-center">
                    <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: el.strokeColor === 'transparent' ? '#E5E7EB' : el.strokeColor }}></div>
                    {el.strokeColor === 'transparent' && <div className="absolute w-full h-0.5 bg-red-400 rotate-45"></div>}
                    <input type="color" value={el.strokeColor === 'transparent' ? '#ffffff' : el.strokeColor} onChange={(e) => updateSelectedElement({ strokeColor: e.target.value })} className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
                <div className="w-px h-6 bg-gray-200"></div>
                <div className="flex items-center gap-2 text-gray-500">
                    <CornerUpRight size={16} />
                    <input type="number" value={el.cornerRadius || 0} onChange={(e) => updateSelectedElement({ cornerRadius: Number(e.target.value) })} className="w-12 h-7 bg-gray-50 border border-gray-200 rounded-md text-xs px-1 text-center focus:outline-none focus:border-gray-400" min="0" />
                </div>
                <div className="w-px h-6 bg-gray-200"></div>
                <div className="flex items-center gap-2"><span className="text-xs font-medium text-gray-400">W</span><input type="number" value={Math.round(el.width)} onChange={(e) => updateSelectedElement({ width: Number(e.target.value) })} className="w-14 h-8 bg-gray-50 border border-gray-200 rounded-lg text-sm px-2 text-center focus:outline-none focus:border-gray-400" /></div>
                <button onClick={() => updateSelectedElement({ aspectRatioLocked: !el.aspectRatioLocked })} className={`p-1 rounded-md transition ${el.aspectRatioLocked ? 'text-blue-500 bg-blue-50' : 'text-gray-400 hover:text-black hover:bg-gray-100'}`} >{el.aspectRatioLocked ? <Link2 size={14} /> : <Unlink size={14} />}</button>
                <div className="flex items-center gap-2"><span className="text-xs font-medium text-gray-400">H</span><input type="number" value={Math.round(el.height)} onChange={(e) => updateSelectedElement({ height: Number(e.target.value) })} className="w-14 h-8 bg-gray-50 border border-gray-200 rounded-lg text-sm px-2 text-center focus:outline-none focus:border-gray-400" /></div>
                <div className="w-px h-6 bg-gray-200"></div>
                <button className="p-2 text-gray-500 hover:text-black hover:bg-gray-100 rounded-lg transition"><Download size={16} /></button>
            </div>
        );
    };

    const renderImageToolbar = () => {
        if (!selectedElementId || selectedElementIds.length > 1 || isDraggingElement) return null;
        const el = elements.find(e => e.id === selectedElementId);
        if (!el || (el.type !== 'gen-image' && el.type !== 'image')) return null;

        // Canvas-space coordinates (toolbar lives inside the CSS transform layer)
        const elX = el.x;
        const elY = el.y;
        const canvasCenterX = elX + el.width / 2;
        const counterScale = 100 / zoom;

        // Configuration Toolbar for Empty Gen-Image
        if (!el.url && el.type === 'gen-image') {
            const toolbarTop = elY + el.height + 16;
            const toolbarDesignWidth = 440;
            // Strict inverse scale: makes the toolbar stay pixel-perfect regardless of canvas zoom
            const inverseScale = 100 / zoom;

            return (
                <div id="active-floating-toolbar" className="absolute bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-gray-100 p-4 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top" style={{ left: canvasCenterX, top: toolbarTop, width: `${toolbarDesignWidth}px`, transform: `translateX(-50%) scale(${inverseScale})`, pointerEvents: 'auto' }} onMouseDown={(e) => e.stopPropagation()}>
                    <textarea
                        placeholder="今天我们要创作什么..."
                        className="w-full text-sm font-medium text-gray-700 placeholder:text-gray-300 bg-transparent border-none outline-none resize-none h-20 mb-4 p-1 leading-relaxed"
                        value={el.genPrompt || ''}
                        onChange={(e) => updateSelectedElement({ genPrompt: e.target.value })}
                        onKeyDown={(e) => e.stopPropagation()}
                    />

                    {/* Multiple Ref Images Preview */}
                    {(el.genRefImages && el.genRefImages.length > 0) ? (
                        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 max-w-full no-scrollbar">
                            {el.genRefImages.map((img, idx) => (
                                <div key={idx} className="relative w-14 h-14 shrink-0 group/ref">
                                    <img src={img} className="w-full h-full object-cover rounded-xl border border-gray-100 shadow-sm" />
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newImages = [...(el.genRefImages || [])];
                                            newImages.splice(idx, 1);
                                            updateSelectedElement({
                                                genRefImages: newImages,
                                                genRefImage: newImages[0] || undefined
                                            });
                                        }}
                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white border border-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 shadow-sm transition-all hover:scale-110 active:scale-95 z-10"
                                    >
                                        <X size={10} strokeWidth={3} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : el.genRefImage ? (
                        <div className="relative w-14 h-14 mb-4 group/ref ml-1">
                            <img src={el.genRefImage} className="w-full h-full object-cover rounded-xl border border-gray-100 shadow-sm" />
                            <button
                                onClick={(e) => { e.stopPropagation(); updateSelectedElement({ genRefImage: undefined, genRefImages: [] }); }}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white border border-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 shadow-sm transition-all hover:scale-110 active:scale-95 z-10"
                            >
                                <X size={10} strokeWidth={3} />
                            </button>
                        </div>
                    ) : null}

                    <div className="flex items-center justify-between border-t border-gray-100/80 pt-4">
                        <div className="flex items-center gap-2">
                            {/* Model Picker */}
                            <div className="relative">
                                <button
                                    onClick={() => { setShowModelPicker(!showModelPicker); setShowResPicker(false); setShowRatioPicker(false); }}
                                    className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-black transition px-3 py-2 hover:bg-gray-50 rounded-full border border-gray-200 hover:border-gray-300"
                                >
                                    <Box size={14} strokeWidth={2} className="text-gray-500" />
                                    <span className="truncate max-w-[100px]">{el.genModel || 'Nano Banana Pro'}</span>
                                    <ChevronDown size={12} className="opacity-40" />
                                </button>
                                {showModelPicker && (
                                    <div className="absolute bottom-full mb-2 left-0 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 p-1.5 z-[60]">
                                        <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-gray-50 mb-1">模型选择</div>
                                        {MODEL_OPTIONS.image.map(m => (
                                            <button key={m.id} onClick={() => { updateSelectedElement({ genModel: m.id as any }); setShowModelPicker(false); }} className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 rounded-xl text-xs transition flex items-center justify-between ${(el.genModel || 'Nano Banana Pro') === m.id ? 'text-blue-600 bg-blue-50/50 font-semibold' : 'text-gray-700'}`}>
                                                <div>
                                                    <div className="font-medium">{m.name}</div>
                                                    <div className="text-[9px] font-normal text-gray-400 opacity-80">{m.desc}</div>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <span className="text-[9px] text-gray-400">{m.time}</span>
                                                    {(el.genModel || 'Nano Banana Pro') === m.id && <Check size={12} />}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Ref Image Button */}
                            <label className={`p-2 rounded-full transition border border-transparent hover:border-gray-200 cursor-pointer relative ${((el.genRefImages?.length || 0) >= 6) ? 'opacity-30 cursor-not-allowed' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`} title="Reference Image">
                                <ImagePlus size={18} strokeWidth={1.5} />
                                <input type="file" accept="image/*" multiple className="hidden" disabled={(el.genRefImages?.length || 0) >= 6} onChange={(e) => handleRefImageUpload(e, el.id)} />
                            </label>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Resolution */}
                            <div className="relative">
                                <button
                                    onClick={() => { setShowResPicker(!showResPicker); setShowModelPicker(false); setShowRatioPicker(false); }}
                                    className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-black transition px-2 py-1.5 hover:bg-gray-50 rounded-lg"
                                >
                                    {el.genResolution || '1K'} <ChevronDown size={10} className="opacity-50" />
                                </button>
                                {showResPicker && (
                                    <div className="absolute bottom-full mb-2 right-0 w-28 bg-white rounded-xl shadow-xl border border-gray-100 p-1 z-[60]">
                                        {['1K', '2K', '4K'].map((r) => (
                                            <button key={r} onClick={() => { updateSelectedElement({ genResolution: r as '1K' | '2K' | '4K' }); setShowResPicker(false); }} className={`w-full text-left px-3 py-2 hover:bg-gray-50 rounded-lg text-xs transition ${el.genResolution === r ? 'text-blue-600 font-bold bg-blue-50/30' : 'text-gray-600'}`}>
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Ratio */}
                            <div className="relative">
                                <button
                                    onClick={() => { setShowRatioPicker(!showRatioPicker); setShowModelPicker(false); setShowResPicker(false); }}
                                    className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-black transition px-2 py-1.5 hover:bg-gray-50 rounded-lg"
                                >
                                    {el.genAspectRatio || '1:1'} <ChevronDown size={10} className="opacity-50" />
                                </button>
                                {showRatioPicker && (
                                    <div className="absolute bottom-full mb-2 right-0 w-48 bg-white rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] border border-gray-100/80 p-1.5 z-[60] max-h-72 overflow-y-auto custom-scrollbar">
                                        <div className="px-2 py-1.5 text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">格式</div>
                                        {ASPECT_RATIOS.map(r => {
                                            const isActive = el.genAspectRatio === r.value;
                                            return (
                                                <button key={r.value} onClick={() => { updateSelectedElement({ genAspectRatio: r.value }); setShowRatioPicker(false); }} className={`w-full text-left px-2 py-1.5 hover:bg-gray-50 rounded-lg text-xs transition flex items-center justify-between group ${isActive ? 'text-blue-600 bg-blue-50/50 font-bold' : 'text-gray-700 font-medium'}`}>
                                                    <div className="flex items-center gap-2">
                                                        <div className={`text-gray-400 ${isActive ? 'text-blue-600' : 'group-hover:text-gray-600'}`}>
                                                            {renderRatioIcon(r.value, isActive)}
                                                        </div>
                                                        <span>{r.label}</span>
                                                    </div>
                                                    <span className={`text-[10px] font-mono ${isActive ? 'text-blue-400/80' : 'text-gray-400/80'}`}>{r.size}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Generate Button */}
                            <button
                                onClick={() => handleGenImage(el.id)}
                                disabled={!el.genPrompt || el.isGenerating}
                                className={`h-8 px-3 rounded-xl flex items-center gap-1.5 transition-all font-bold text-[11px] ${!el.genPrompt || el.isGenerating ? 'bg-gray-100 text-gray-400' : 'bg-[#CBD5E1] hover:bg-black text-white'}`}
                            >
                                {el.isGenerating ? <Loader2 size={14} className="animate-spin" /> : (
                                    <Zap size={14} fill="currentColor" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        // Only show if it has a URL (actual image)
        // if (!el.url && el.type === 'gen-image') return null; // This line is replaced by the above block

        // Calculate scaling logic (cap the scaling to avoid huge toolbars when zoomed in, keep them reasonable sized)
        // Adjust baseline scale depending on viewport zoom
        const adaptiveScale = Math.max(0.1, Math.min(2.0, zoom / 100));
        const flexibleScale = 1 + ((1 / adaptiveScale) - 1) * 0.85;
        const rightToolbarLeft = elX + el.width + (16 / adaptiveScale);
        const topToolbarTop = elY;
        const bottomButtonTop = elY + el.height + (12 / adaptiveScale);

        // Text Edit Modal logic
        if (showTextEditModal) {
            const modalLeft = elX + el.width + (30 / adaptiveScale);
            const modalTop = elY;
            return (
                <div
                    className="absolute bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-[60] w-64 animate-in fade-in slide-in-from-left-2 duration-200 flex flex-col gap-2"
                    style={{ left: modalLeft, top: modalTop, transform: `scale(${1 / adaptiveScale})`, transformOrigin: 'top left', pointerEvents: 'auto' }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-semibold text-gray-800">编辑图片文字</span>
                        <button onClick={() => setShowTextEditModal(false)} className="text-gray-400 hover:text-black transition"><X size={14} /></button>
                    </div>
                    {el.detectedTexts && el.detectedTexts.length > 0 ? (
                        <>
                            <div className="max-h-48 overflow-y-auto pr-1 flex flex-col gap-2">
                                {el.detectedTexts.map((dt, idx) => (
                                    <div key={idx} className="flex flex-col gap-1">
                                        <span className="text-[10px] text-gray-500 font-medium tracking-wide truncate">{dt.original}</span>
                                        <input
                                            value={dt.edited || dt.original}
                                            onChange={(e) => {
                                                const newTexts = [...(el.detectedTexts || [])];
                                                newTexts[idx] = { ...newTexts[idx], edited: e.target.value };
                                                updateSelectedElement({ detectedTexts: newTexts });
                                            }}
                                            className="w-full text-sm bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder={dt.original}
                                        />
                                    </div>
                                ))}
                            </div>
                            <button className="w-full mt-2 py-1.5 bg-black text-white text-sm rounded-lg hover:bg-gray-900 transition font-medium">应用修改</button>
                        </>
                    ) : (
                        <div className="py-4 flex flex-col items-center justify-center text-gray-400">
                            <Type size={24} className="mb-2 opacity-50" />
                            <span className="text-xs">未检测到可编辑文字</span>
                        </div>
                    )}
                </div>
            );
        }

        // ERASER MODE UI
        if (eraserMode) {
            return (
                <>
                    {/* Top Hint */}
                    <div className="absolute bg-white px-4 py-2 rounded-full shadow-lg border border-gray-100 flex items-center gap-2 text-sm text-gray-600 z-50 whitespace-nowrap animate-in slide-in-from-bottom-2 fade-in" style={{ left: canvasCenterX, top: topToolbarTop - (50 / adaptiveScale), transform: `translateX(-50%) scale(${1 / adaptiveScale})`, transformOrigin: 'bottom center', pointerEvents: 'auto' }}>
                        <span>在图片上绘制选区，</span>
                        <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs border border-gray-200 font-sans">Alt</kbd> <span>擦除，</span>
                        <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs border border-gray-200 font-sans">Esc</kbd> <span>退出</span>
                    </div>

                    {/* Eraser Toolbar */}
                    <div className="absolute bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100 p-2 flex items-center gap-3 z-50 animate-in zoom-in-95 fade-in duration-200" style={{ left: canvasCenterX, top: topToolbarTop, transform: `translateX(-50%) scale(${1 / adaptiveScale})`, transformOrigin: 'bottom center', pointerEvents: 'auto' }}>
                        <div className="flex items-center gap-2 px-2 border-r border-gray-100">
                            <Eraser size={18} className="text-blue-500 fill-blue-500/20" />
                            <span className="text-sm font-medium text-gray-900">擦除</span>
                        </div>

                        <div className="flex items-center gap-3 px-2">
                            <div className={`w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center`}>
                                <div className="bg-gray-800 rounded-full" style={{ width: Math.max(4, brushSize / 4), height: Math.max(4, brushSize / 4) }}></div>
                            </div>
                            <input
                                type="range"
                                min="5" max="100"
                                value={brushSize}
                                onChange={(e) => setBrushSize(Number(e.target.value))}
                                className="w-32 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900 hover:accent-black"
                            />
                            <div className="w-8 text-xs text-gray-500 text-right">{brushSize}px</div>
                        </div>

                        <div className="w-px h-6 bg-gray-200"></div>

                        <button onClick={handleUndoEraser} className="p-2 text-gray-500 hover:text-black hover:bg-gray-50 rounded-lg transition" title="Undo">
                            <RotateCw className="-scale-x-100" size={16} />
                        </button>

                        <button onClick={handleClearEraser} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition mr-1" title="Reset/Clear">
                            <Trash2 size={16} />
                        </button>

                        <button
                            onClick={handleExecuteEraser}
                            className="px-4 py-1.5 bg-gray-900 text-white shadow-md shadow-gray-200 font-medium text-xs rounded-lg hover:bg-black hover:scale-105 transition"
                        >
                            执行擦除
                        </button>

                        <button onClick={() => setEraserMode(false)} className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 border shadow-sm text-gray-400 hover:text-black">
                            <X size={12} />
                        </button>
                    </div>
                </>
            );
        }

        return (
            <>
                <div id="active-floating-toolbar" className={`absolute z-50 ${isDraggingElement ? '' : 'animate-in fade-in zoom-in-95 duration-200'} pointer-events-auto origin-top-left`} style={{ left: rightToolbarLeft, top: topToolbarTop, transform: `scale(${flexibleScale})` }} onMouseDown={(e) => e.stopPropagation()}>
                    <div
                        className={`flex flex-col bg-white rounded-[16px] p-2 shadow-[0_4px_24px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100/80 items-stretch gap-0.5 transition-all duration-300 ease-out ${toolbarExpanded ? 'w-[150px]' : 'w-[48px]'}`}
                        onMouseEnter={() => { toolbarExpandTimer.current = setTimeout(() => setToolbarExpanded(true), 800); }}
                        onMouseLeave={() => { if (toolbarExpandTimer.current) clearTimeout(toolbarExpandTimer.current); setToolbarExpanded(false); }}
                    >
                        {/* 快捷编辑 - XC logo */}
                        <div onClick={() => setShowFastEdit(true)} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-[10px] cursor-pointer transition-all hover:bg-gray-50 ${toolbarExpanded ? 'justify-between' : 'justify-center'}`}>
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center text-[8px] font-black tracking-tighter leading-none flex-shrink-0">XC</span>
                                {toolbarExpanded && <span className="text-[13px] font-medium text-gray-800 whitespace-nowrap">快捷编辑</span>}
                            </div>
                            {toolbarExpanded && <span className="text-[11px] text-gray-400 font-medium flex-shrink-0">Tab</span>}
                        </div>

                        {/* 放大 HD */}
                        <div className="relative">
                            <button
                                onClick={() => {
                                    setShowUpscalePanel(!showUpscalePanel);
                                    setToolbarExpanded(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors ${toolbarExpanded ? '' : 'justify-center'} ${showUpscalePanel ? 'bg-gray-100 text-black' : ''}`}
                            >
                                <div className="border-[1.5px] border-current rounded-[3px] w-4 h-4 flex items-center justify-center text-[8px] font-black tracking-tighter flex-shrink-0">HD</div>
                                {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">放大</span>}
                            </button>

                            {showUpscalePanel && (
                                <div
                                    className="absolute top-0 left-full ml-2 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-gray-100 p-4 z-[70] w-64 animate-in slide-in-from-left-2 duration-200 flex flex-col gap-4"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-gray-900">高清放大</span>
                                        <button onClick={() => setShowUpscalePanel(false)} className="text-gray-400 hover:text-black transition">
                                            <X size={14} />
                                        </button>
                                    </div>

                                    {/* 分辨率选择 */}
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1">生成尺寸</span>
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowUpscaleResDropdown(!showUpscaleResDropdown)}
                                                className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold">{selectedUpscaleRes}</span>
                                                    <span className="text-[10px] text-gray-400 font-normal">
                                                        {(() => {
                                                            const factor = selectedUpscaleRes === '2K' ? 2 : selectedUpscaleRes === '4K' ? 4 : 8;
                                                            return `${Math.round(el.width * factor)}x${Math.round(el.height * factor)}`;
                                                        })()}
                                                    </span>
                                                </div>
                                                <ChevronDown size={14} className={`text-gray-400 transition-transform ${showUpscaleResDropdown ? 'rotate-180' : ''}`} />
                                            </button>

                                            {showUpscaleResDropdown && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 p-1 z-10 overflow-hidden">
                                                    {(['2K', '4K', '8K'] as const).map((res) => (
                                                        <button
                                                            key={res}
                                                            onClick={() => {
                                                                setSelectedUpscaleRes(res);
                                                                setShowUpscaleResDropdown(false);
                                                            }}
                                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${selectedUpscaleRes === res ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span>{res}</span>
                                                                <span className="text-[10px] text-gray-400 font-normal">
                                                                    {(() => {
                                                                        const factor = res === '2K' ? 2 : res === '4K' ? 4 : 8;
                                                                        return `${Math.round(el.width * factor)}x${Math.round(el.height * factor)}`;
                                                                    })()}
                                                                </span>
                                                            </div>
                                                            {selectedUpscaleRes === res && <Check size={14} />}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2 mt-1">
                                            <button
                                                onClick={() => setShowUpscalePanel(false)}
                                                className="flex-1 py-2 text-xs font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition border border-gray-100"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const factor = selectedUpscaleRes === '2K' ? 2 : selectedUpscaleRes === '4K' ? 4 : 8;
                                                    handleUpscaleSelect(factor);
                                                    setShowUpscalePanel(false);
                                                }}
                                                className="flex-1 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-black transition shadow-sm"
                                            >
                                                Run
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 去背景 */}
                        <button onClick={handleRemoveBg} className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <Wand2 size={16} strokeWidth={2} className="flex-shrink-0" />
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">去背景</span>}
                        </button>

                        {/* Mockup */}
                        <button className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <Shirt size={16} strokeWidth={2} className="flex-shrink-0" />
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">Mockup</span>}
                        </button>

                        {/* 橡皮工具 */}
                        <button onClick={() => setEraserMode(true)} className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <Eraser size={16} strokeWidth={2} className="flex-shrink-0" />
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">橡皮工具</span>}
                        </button>

                        {/* 编辑元素 */}
                        <button className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <Layers size={16} strokeWidth={2} className="flex-shrink-0" />
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">编辑元素</span>}
                        </button>

                        {/* 编辑文字 */}
                        <button onClick={handleEditTextClick} className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <Type size={16} strokeWidth={2} className="flex-shrink-0" />
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">编辑文字</span>}
                        </button>

                        {/* 多角度 */}
                        <button className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors relative ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <div className="relative flex-shrink-0"><Box size={16} strokeWidth={2} /></div>
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">多角度</span>}
                        </button>

                        {/* 扩展 */}
                        <button className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <Expand size={16} strokeWidth={2} className="flex-shrink-0" />
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">扩展</span>}
                        </button>

                        {/* 调整 */}
                        <button className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors relative ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <div className="relative flex-shrink-0"><MonitorUp size={16} strokeWidth={2} className="rotate-90" /></div>
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">调整</span>}
                        </button>

                        {/* 裁剪 */}
                        <button className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <Crop size={16} strokeWidth={2} className="flex-shrink-0" />
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">裁剪</span>}
                        </button>

                        {/* 矢量 */}
                        <button onClick={handleVectorRedraw} className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors relative ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <div className="relative flex-shrink-0"><Scaling size={16} strokeWidth={2} /></div>
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">矢量</span>}
                        </button>

                        <div className="h-px bg-gray-100 mx-1 my-0.5"></div>

                        {/* 下载 */}
                        <button onClick={handleDownload} className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <Download size={16} strokeWidth={2} className="flex-shrink-0" />
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">下载</span>}
                        </button>
                    </div>
                </div>

                {/* Bottom Center Fast Edit Mode Tool when active */}
                {showFastEdit && (
                    <div id="active-floating-toolbar-fast-edit" className="absolute bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 p-2 z-50 animate-in fade-in zoom-in-95 duration-200 w-[320px]" style={{ left: canvasCenterX, top: bottomButtonTop, transform: `translateX(-50%) scale(${1 / adaptiveScale})`, transformOrigin: 'top center', pointerEvents: 'auto' }} onMouseDown={(e) => e.stopPropagation()}>
                        <textarea autoFocus className="w-full text-[13px] text-gray-800 placeholder:text-gray-400 bg-transparent border-none outline-none resize-none h-14 mb-2 p-1" placeholder="Describe your edit here..." value={fastEditPrompt} onChange={(e) => setFastEditPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFastEditRun(); } e.stopPropagation(); }} />
                        <div className="flex justify-between items-center px-1">
                            <span className="text-[11px] text-gray-400 pointer-events-none">Hit Return to generate</span>
                            <div className="flex gap-2">
                                <button onClick={() => setShowFastEdit(false)} className="px-3 py-1.5 rounded-lg text-gray-500 text-xs font-medium hover:bg-gray-50 transition">Cancel</button>
                                <button onClick={handleFastEditRun} disabled={!fastEditPrompt || el.isGenerating} className="bg-gray-900 hover:bg-black text-white text-xs font-medium px-4 py-1.5 rounded-lg flex items-center gap-1.5 transition disabled:opacity-50">
                                    {el.isGenerating ? <Loader2 size={12} className="animate-spin" /> : null}
                                    生成 {el.isGenerating ? '' : <span className="opacity-60 font-normal">↵</span>}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </>);
    };

    const renderGenVideoToolbar = () => {
        if (!selectedElementId || selectedElementIds.length > 1 || isDraggingElement) return null;
        const el = elements.find(e => e.id === selectedElementId);
        if (!el || (el.type !== 'gen-video' && el.type !== 'video')) return null;

        // Canvas-space coordinates (toolbar lives inside the CSS transform layer)
        const dragPos = false as any;
        const elX = dragPos ? dragPos.x : el.x;
        const elY = dragPos ? dragPos.y : el.y;
        const canvasCenterX = elX + el.width / 2;
        // Calculate adaptive scaling logic for video toolbar
        const adaptiveScale = Math.max(0.4, Math.min(2.0, zoom / 100));
        const flexibleScale = 1 + ((1 / adaptiveScale) - 1) * 0.6;

        if (el.url) {
            // Generated state
            const topToolbarTop = elY - (60 / adaptiveScale);
            return (
                <div id="active-floating-toolbar" className={`absolute bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100/50 px-2 py-1.5 flex items-center gap-1 z-50 ${isDraggingElement ? '' : 'animate-in fade-in zoom-in-95 duration-200'} whitespace-nowrap backdrop-blur-sm`} style={{ left: canvasCenterX, top: topToolbarTop, transform: `translateX(-50%) scale(${flexibleScale})`, transformOrigin: 'bottom center', pointerEvents: 'auto' }} onMouseDown={(e) => e.stopPropagation()}>
                    <button className="px-2.5 py-1.5 text-gray-600 hover:text-black hover:bg-gray-50 rounded-lg flex items-center gap-2 text-[13px] font-medium transition-colors group">
                        <div className="border-[1.5px] border-current rounded-[3px] px-0.5 text-[9px] font-bold opacity-70 group-hover:opacity-100 transition-opacity">HD</div>
                        放大
                    </button>
                    <button className="px-2.5 py-1.5 text-gray-600 hover:text-black hover:bg-gray-50 rounded-lg flex items-center gap-2 text-[13px] font-medium transition-colors group">
                        <div className="relative"><Eraser size={14} className="opacity-70 group-hover:opacity-100 transition-opacity" /><div className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-white border border-gray-600 rounded-full"></div></div>
                        移除背景
                    </button>
                    <div className="w-px h-4 bg-gray-200 mx-1"></div>
                    <a href={el.url} download={`video-${el.id}.mp4`} className="p-1.5 text-gray-500 hover:text-black hover:bg-gray-50 rounded-lg transition-colors" target="_blank" rel="noreferrer">
                        <Download size={16} strokeWidth={2} />
                    </a>
                </div>
            );
        } else {
            // Config state
            const toolbarTop = elY + el.height + 16;
            const toolbarDesignWidth = 420;
            const inverseScale = 100 / zoom;

            return (
                <div id="active-floating-toolbar" className="absolute bg-white rounded-[24px] shadow-[0_12px_40px_rgba(0,0,0,0.12)] border border-gray-100/80 z-[100] animate-in fade-in zoom-in-95 duration-200 overflow-visible origin-top" style={{ left: canvasCenterX, top: toolbarTop, width: `${toolbarDesignWidth}px`, transform: `translateX(-50%) scale(${inverseScale})`, pointerEvents: 'auto' }} onMouseDown={(e) => e.stopPropagation()}>
                    {/* Prompt textarea */}
                    <div className="px-4 pt-4 pb-0">
                        <textarea placeholder="今天我们要创作什么" className="w-full text-sm text-gray-700 placeholder:text-gray-300 bg-transparent border-none outline-none resize-none h-16 p-1 mb-0" value={el.genPrompt || ''} onChange={(e) => updateSelectedElement({ genPrompt: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
                    </div>

                    {/* Collapsible Frame Upload Panel */}
                    {(showFramePanel || isHoveringVideoFrames[el.id]) && videoToolbarTab === 'frames' && (
                        <div
                            className="px-5 pb-2 animate-in slide-in-from-bottom-2 fade-in duration-200"
                            onMouseEnter={() => setIsHoveringVideoFrames(prev => ({ ...prev, [el.id]: true }))}
                            onMouseLeave={() => setIsHoveringVideoFrames(prev => ({ ...prev, [el.id]: false }))}
                        >
                            <div className="flex items-center gap-0 w-max pl-1">
                                {/* 首帧 Card */}
                                <div className="relative group/startframe w-11 h-11 transform -rotate-[4deg] origin-bottom-left transition-transform hover:-translate-y-1 hover:rotate-0 z-10 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.04)]" onClick={() => document.getElementById(`start-frame-${el.id}`)?.click()}>
                                    {el.genStartFrame ? (
                                        <div className="w-full h-full rounded-[10px] overflow-hidden border border-gray-200 bg-white relative">
                                            <img src={el.genStartFrame} className="w-full h-full object-cover" />
                                            <div className="absolute -top-1.5 -right-1.5 bg-gray-600/90 text-white rounded-full p-0.5 cursor-pointer hover:bg-red-500 opacity-0 group-hover/startframe:opacity-100 transition-opacity z-10" onClick={(ev) => { ev.stopPropagation(); updateSelectedElement({ genStartFrame: undefined }); }}><X size={10} /></div>
                                        </div>
                                    ) : (
                                        <div className="w-full h-full border border-gray-200 bg-white rounded-[10px] flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
                                            <Plus size={14} className="text-gray-400" />
                                        </div>
                                    )}
                                    <input type="file" id={`start-frame-${el.id}`} className="hidden" accept="image/*" onChange={(e) => handleVideoRefUpload(e, 'start')} />
                                </div>

                                {/* 尾帧 Card */}
                                <div className="relative group/endframe w-11 h-11 transform rotate-[4deg] origin-bottom-right transition-transform hover:-translate-y-1 hover:rotate-0 z-0 -ml-1.5 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.04)]" onClick={() => document.getElementById(`end-frame-${el.id}`)?.click()}>
                                    {el.genEndFrame ? (
                                        <div className="w-full h-full rounded-[10px] overflow-hidden border border-gray-200 bg-white relative">
                                            <img src={el.genEndFrame} className="w-full h-full object-cover" />
                                            <div className="absolute -top-1.5 -right-1.5 bg-gray-600/90 text-white rounded-full p-0.5 cursor-pointer hover:bg-red-500 opacity-0 group-hover/endframe:opacity-100 transition-opacity z-10" onClick={(ev) => { ev.stopPropagation(); updateSelectedElement({ genEndFrame: undefined }); }}><X size={10} /></div>
                                        </div>
                                    ) : (
                                        <div className="w-full h-full border border-gray-200 bg-white rounded-[10px] flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
                                            <Plus size={14} className="text-gray-400" />
                                        </div>
                                    )}
                                    <input type="file" id={`end-frame-${el.id}`} className="hidden" accept="image/*" onChange={(e) => handleVideoRefUpload(e, 'end')} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Multi-Ref Upload Panel */}
                    {showFramePanel && videoToolbarTab === 'multi' && (
                        <div className="px-3 pb-2 animate-in slide-in-from-top-2 duration-200 overflow-x-auto">
                            <div className="flex items-center gap-3 py-2 w-max">
                                {(el.genVideoRefs || []).map((refImage, index) => (
                                    <div key={index} className="relative group/multiref shrink-0">
                                        <div className="w-14 h-14 rounded-xl overflow-hidden border border-gray-200 relative cursor-pointer shadow-sm" onClick={() => document.getElementById(`multi-frame-${el.id}-${index}`)?.click()}>
                                            <img src={refImage} className="w-full h-full object-cover" />
                                            <div className="absolute -top-1.5 -right-1.5 bg-gray-600 text-white rounded-full p-0.5 cursor-pointer hover:bg-red-500 opacity-0 group-hover/multiref:opacity-100 transition z-10" onClick={(ev) => { ev.stopPropagation(); const newRefs = [...(el.genVideoRefs || [])]; newRefs.splice(index, 1); updateSelectedElement({ genVideoRefs: newRefs }); }}><X size={8} /></div>
                                        </div>
                                        <input type="file" id={`multi-frame-${el.id}-${index}`} className="hidden" accept="image/*" onChange={(e) => handleVideoRefUpload(e, 'ref', index)} />
                                    </div>
                                ))}
                                {(el.genVideoRefs || []).length < 5 && (
                                    <div className="relative group/upload shrink-0 w-14 h-14">
                                        {/* Back stacked cards */}
                                        <div className="absolute inset-0 bg-white border border-gray-200 rounded-xl transform rotate-[8deg] translate-x-1.5 translate-y-0.5 transition-transform group-hover/upload:rotate-[12deg] group-hover/upload:translate-x-2 z-0"></div>
                                        <div className="absolute inset-0 bg-white border border-gray-200 rounded-xl transform rotate-[4deg] translate-x-1 translate-y-0.5 transition-transform group-hover/upload:rotate-[6deg] group-hover/upload:translate-x-1 z-0"></div>

                                        <div onClick={() => document.getElementById(`multi-frame-new-${el.id}`)?.click()} className="relative w-full h-full bg-white border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition z-10">
                                            <Plus size={16} className="text-gray-400 group-hover/upload:text-blue-500 transition" />
                                            <span className="text-[10px] text-gray-400 group-hover/upload:text-blue-500 mt-0.5">多图参考</span>
                                        </div>
                                        <input type="file" id={`multi-frame-new-${el.id}`} className="hidden" accept="image/*" onChange={(e) => handleVideoRefUpload(e, 'ref')} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Bottom Controls Bar */}
                    <div className="flex items-center justify-between px-4 pb-4 pt-1 bg-white relative rounded-b-[24px]">
                        {/* Left: Tabs (Pill style) */}
                        <div
                            className="flex items-center gap-0 bg-[#F5F5F7] rounded-full p-[3px] relative z-20"
                            onMouseEnter={() => setIsHoveringVideoFrames(prev => ({ ...prev, [el.id]: true }))}
                            onMouseLeave={() => setIsHoveringVideoFrames(prev => ({ ...prev, [el.id]: false }))}
                        >
                            <button
                                onClick={() => { updateSelectedElement({ genFirstLastMode: 'startEnd' }); setVideoToolbarTab('frames'); }}
                                className={`px-4 py-1 text-[11px] font-bold tracking-widest rounded-full transition-all duration-300 z-10 border ${videoToolbarTab === 'frames' ? 'bg-white text-gray-800 shadow-sm border-gray-100' : 'text-gray-400 hover:text-gray-600 border-transparent bg-transparent'}`}
                                tabIndex={-1}
                            >
                                首尾帧
                            </button>
                            {el.genModel === 'Veo 3.1' && (
                                <button
                                    onClick={() => { updateSelectedElement({ genFirstLastMode: 'multiRef' }); setVideoToolbarTab('multi'); }}
                                    className={`px-4 py-1 text-[11px] font-bold tracking-widest rounded-full transition-all duration-300 border ${videoToolbarTab === 'multi' ? 'bg-white text-gray-800 shadow-sm border-gray-100' : 'text-gray-400 hover:text-gray-600 border-transparent bg-transparent'}`}
                                    tabIndex={-1}
                                >
                                    多图参考
                                </button>
                            )}
                        </div>

                        {/* Right: Model, Ratio, Generate */}
                        <div className="flex items-center gap-1.5 relative z-20">
                            {/* Model Dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowVideoModelPicker(!showVideoModelPicker)}
                                    className="h-8 px-2 flex items-center gap-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-100 rounded-full transition whitespace-nowrap"
                                    tabIndex={-1}
                                >
                                    <Box size={13} className="text-gray-600" />
                                    <span>{el.genModel || 'Veo 3.1 Fast'}</span>
                                    <ChevronDown size={12} className={`text-gray-400 transition-transform ${showVideoModelPicker ? 'rotate-180' : ''}`} />
                                </button>
                                {showVideoModelPicker && (
                                    <div className="absolute bottom-full right-0 mb-3 w-48 bg-white rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] border border-gray-100/80 p-1.5 z-[9999] animate-in fade-in slide-in-from-bottom-2 duration-200 custom-scrollbar">
                                        <div className="px-2 py-1.5 text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">选择视频模型</div>
                                        <button
                                            onClick={() => { updateSelectedElement({ genModel: 'Kling 2.6', genFirstLastMode: 'startEnd' }); setShowVideoModelPicker(false); setVideoToolbarTab('motion'); }}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors ${el.genModel === 'Kling 2.6' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-700 hover:bg-gray-50 font-medium'}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className={`w-5 h-5 flex items-center justify-center rounded-md ${el.genModel === 'Kling 2.6' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}><Box size={12} /></div>
                                                <span>Kling 2.6</span>
                                            </div>
                                            {el.genModel === 'Kling 2.6' && <Check size={14} />}
                                        </button>
                                        <button
                                            onClick={() => { updateSelectedElement({ genModel: 'Veo 3.1', genFirstLastMode: 'startEnd' }); setShowVideoModelPicker(false); setVideoToolbarTab('frames'); }}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors ${el.genModel === 'Veo 3.1' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-700 hover:bg-gray-50 font-medium'}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className={`w-5 h-5 flex items-center justify-center rounded-md ${el.genModel === 'Veo 3.1' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}><Box size={12} /></div>
                                                <span>Veo 3.1</span>
                                            </div>
                                            {el.genModel === 'Veo 3.1' && <Check size={14} />}
                                        </button>
                                        <button
                                            onClick={() => { updateSelectedElement({ genModel: 'Veo 3.1 Fast', genFirstLastMode: 'startEnd' }); setShowVideoModelPicker(false); setVideoToolbarTab('frames'); }}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors ${el.genModel === 'Veo 3.1 Fast' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-700 hover:bg-gray-50 font-medium'}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className={`w-5 h-5 flex items-center justify-center rounded-md ${el.genModel === 'Veo 3.1 Fast' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}><Box size={12} /></div>
                                                <span>Veo 3.1 Fast</span>
                                            </div>
                                            {el.genModel === 'Veo 3.1 Fast' && <Check size={14} />}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Ratio / Duration / Quality Settings Popover */}
                            <div className="relative flex items-center">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowRatioPicker(!showRatioPicker); setShowVideoModelPicker(false); }}
                                    className={`h-8 px-2 rounded-full border text-[11px] transition flex items-center gap-1.5 font-bold ${showRatioPicker ? 'border-transparent bg-gray-100 text-black' : 'border-transparent text-gray-600 hover:bg-gray-100'}`}
                                    tabIndex={-1}
                                >
                                    {el.genAspectRatio || '16:9'} • {el.genDuration || '8s'} • {el.genQuality || '1080p'}
                                    <ChevronDown size={12} className={`text-gray-400 transition-transform ${showRatioPicker ? 'rotate-180' : ''}`} />
                                </button>
                                {showRatioPicker && (
                                    <div className="absolute bottom-full right-0 mb-3 w-[260px] bg-white rounded-[20px] shadow-[0_12px_40px_rgba(0,0,0,0.12)] border border-gray-100/80 p-4 z-[9999] animate-in fade-in slide-in-from-bottom-2 duration-200">
                                        {/* Size section */}
                                        <div className="mb-5">
                                            <div className="text-[11px] text-gray-400 uppercase tracking-widest font-bold mb-3 flex items-center justify-between">
                                                <span>比例</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => updateSelectedElement({ genAspectRatio: '16:9' })}
                                                    className={`flex-1 flex flex-col items-center justify-center py-3 rounded-[12px] border transition-all ${(el.genAspectRatio || '16:9') === '16:9' ? 'border-blue-500 bg-blue-50/50' : 'border-gray-100 hover:border-gray-300 bg-white'} gap-2`}
                                                >
                                                    <div className={`w-8 h-4 border-[1.5px] rounded-[3px] ${(el.genAspectRatio || '16:9') === '16:9' ? 'border-blue-500' : 'border-gray-400'}`}></div>
                                                    <span className={`text-xs font-bold ${(el.genAspectRatio || '16:9') === '16:9' ? 'text-blue-600' : 'text-gray-600'}`}>16:9</span>
                                                </button>
                                                <button
                                                    onClick={() => updateSelectedElement({ genAspectRatio: '9:16' })}
                                                    className={`flex-1 flex flex-col items-center justify-center py-3 rounded-[12px] border transition-all ${(el.genAspectRatio || '16:9') === '9:16' ? 'border-blue-500 bg-blue-50/50' : 'border-gray-100 hover:border-gray-300 bg-white'} gap-2`}
                                                >
                                                    <div className={`w-4 h-8 border-[1.5px] rounded-[3px] ${(el.genAspectRatio || '16:9') === '9:16' ? 'border-blue-500' : 'border-gray-400'}`}></div>
                                                    <span className={`text-xs font-bold ${(el.genAspectRatio || '16:9') === '9:16' ? 'text-blue-600' : 'text-gray-600'}`}>9:16</span>
                                                </button>
                                                <button
                                                    onClick={() => updateSelectedElement({ genAspectRatio: '1:1' })}
                                                    className={`flex-1 flex flex-col items-center justify-center py-3 rounded-[12px] border transition-all ${(el.genAspectRatio || '16:9') === '1:1' ? 'border-blue-500 bg-blue-50/50' : 'border-gray-100 hover:border-gray-300 bg-white'} gap-2`}
                                                >
                                                    <div className={`w-5 h-5 border-[1.5px] rounded-[3px] ${(el.genAspectRatio || '16:9') === '1:1' ? 'border-blue-500' : 'border-gray-400'}`}></div>
                                                    <span className={`text-xs font-bold ${(el.genAspectRatio || '16:9') === '1:1' ? 'text-blue-600' : 'text-gray-600'}`}>1:1</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Duration section */}
                                        <div className="mb-5">
                                            <div className="text-[11px] text-gray-400 uppercase tracking-widest font-bold mb-3">时长</div>
                                            <div className="flex bg-[#F5F5F7] rounded-[10px] p-1">
                                                {['4s', '6s', '8s'].map(dur => (
                                                    <button
                                                        key={dur}
                                                        onClick={() => updateSelectedElement({ genDuration: dur as any })}
                                                        className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${(el.genDuration || '8s') === dur ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-800'}`}
                                                    >
                                                        {dur}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Quality section */}
                                        <div>
                                            <div className="text-[11px] text-gray-400 uppercase tracking-widest font-bold mb-3">画质</div>
                                            <div className="flex bg-[#F5F5F7] rounded-[10px] p-1">
                                                {['720p', '1080p', '4k'].map(quality => (
                                                    <button
                                                        key={quality}
                                                        onClick={() => updateSelectedElement({ genQuality: quality as any })}
                                                        className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${(el.genQuality || '1080p') === quality ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-800'}`}
                                                    >
                                                        {quality}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => handleGenVideo(el.id)}
                                disabled={!el.genPrompt || el.isGenerating}
                                className={`h-7 w-10 ml-1 rounded-[10px] flex items-center justify-center transition-all ${!el.genPrompt || el.isGenerating ? 'bg-gray-100 text-gray-400' : 'bg-[#E5E7EB] hover:bg-[#D1D5DB] text-gray-500 shadow-sm'}`}
                                tabIndex={-1}
                            >
                                {el.isGenerating ? <Loader2 size={14} className="animate-spin text-gray-500" /> : (
                                    <Sparkles size={14} fill="currentColor" className="opacity-80" strokeWidth={1} />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
    };

    // ===== Multi-select Alignment & Spacing Functions =====
    const [showAlignMenu, setShowAlignMenu] = useState(false);
    const [showSpacingMenu, setShowSpacingMenu] = useState(false);

    const alignSelectedElements = (direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        const ids = selectedElementIds.length > 1 ? selectedElementIds : [];
        if (ids.length < 2) return;
        const els = elements.filter(el => ids.includes(el.id));
        const minX = Math.min(...els.map(el => el.x));
        const maxX = Math.max(...els.map(el => el.x + el.width));
        const minY = Math.min(...els.map(el => el.y));
        const maxY = Math.max(...els.map(el => el.y + el.height));
        const cX = (minX + maxX) / 2;
        const cY = (minY + maxY) / 2;

        const newElements = elements.map(el => {
            if (!ids.includes(el.id)) return el;
            switch (direction) {
                case 'left': return { ...el, x: minX };
                case 'right': return { ...el, x: maxX - el.width };
                case 'center': return { ...el, x: cX - el.width / 2 };
                case 'top': return { ...el, y: minY };
                case 'bottom': return { ...el, y: maxY - el.height };
                case 'middle': return { ...el, y: cY - el.height / 2 };
                default: return el;
            }
        });
        setElements(newElements);
        saveToHistory(newElements, markers);
    };

    const distributeSelectedElements = (direction: 'horizontal' | 'vertical' | 'auto') => {
        const ids = selectedElementIds.length > 1 ? selectedElementIds : [];
        if (ids.length < 2) return;
        const els = elements.filter(el => ids.includes(el.id));

        if (direction === 'auto') {
            const count = els.length;
            const cols = Math.ceil(Math.sqrt(count));
            const sorted = [...els].sort((a, b) => a.y - b.y || a.x - b.x);
            const gap = 20;
            const maxW = Math.max(...sorted.map(e => e.width));
            const maxH = Math.max(...sorted.map(e => e.height));
            const startX = sorted[0].x;
            const startY = sorted[0].y;
            const newElements = elements.map(el => {
                const idx = sorted.findIndex(s => s.id === el.id);
                if (idx === -1) return el;
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                return { ...el, x: startX + col * (maxW + gap), y: startY + row * (maxH + gap) };
            });
            setElements(newElements);
            saveToHistory(newElements, markers);
            return;
        }

        if (direction === 'horizontal') {
            const sorted = [...els].sort((a, b) => a.x - b.x);
            const totalWidth = sorted.reduce((sum, el) => sum + el.width, 0);
            const minX = sorted[0].x;
            const maxRight = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
            const totalSpace = maxRight - minX - totalWidth;
            const gap = ids.length > 2 ? totalSpace / (ids.length - 1) : 20;
            let curX = minX;
            const posMap: Record<string, number> = {};
            for (const el of sorted) { posMap[el.id] = curX; curX += el.width + gap; }
            const newElements = elements.map(el => posMap[el.id] !== undefined ? { ...el, x: posMap[el.id] } : el);
            setElements(newElements);
            saveToHistory(newElements, markers);
        } else {
            const sorted = [...els].sort((a, b) => a.y - b.y);
            const totalHeight = sorted.reduce((sum, el) => sum + el.height, 0);
            const minY = sorted[0].y;
            const maxBottom = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
            const totalSpace = maxBottom - minY - totalHeight;
            const gap = ids.length > 2 ? totalSpace / (ids.length - 1) : 20;
            let curY = minY;
            const posMap: Record<string, number> = {};
            for (const el of sorted) { posMap[el.id] = curY; curY += el.height + gap; }
            const newElements = elements.map(el => posMap[el.id] !== undefined ? { ...el, y: posMap[el.id] } : el);
            setElements(newElements);
            saveToHistory(newElements, markers);
        }
    };

    // Group / Merge / Ungroup handlers
    const handleGroupSelected = () => {
        if (selectedElementIds.length < 2) return;
        const ids = [...selectedElementIds];
        saveToHistory(elements, markers);
        const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const targets = elements.filter(el => ids.includes(el.id));
        const minX = Math.min(...targets.map(el => el.x));
        const minY = Math.min(...targets.map(el => el.y));
        const maxX = Math.max(...targets.map(el => el.x + el.width));
        const maxY = Math.max(...targets.map(el => el.y + el.height));
        const maxZ = Math.max(...targets.map(el => el.zIndex));
        const originalChildData: Record<string, { x: number; y: number; width: number; height: number; zIndex: number }> = {};
        for (const t of targets) {
            originalChildData[t.id] = { x: t.x, y: t.y, width: t.width, height: t.height, zIndex: t.zIndex };
        }
        const newElements = elements.map(el => ids.includes(el.id) ? { ...el, groupId } : el);
        const groupEl: CanvasElement = {
            id: groupId, type: 'group' as const,
            x: minX, y: minY, width: maxX - minX, height: maxY - minY,
            zIndex: maxZ + 1, children: ids, isCollapsed: false, originalChildData,
        };
        setElements([...newElements, groupEl]);
        setSelectedElementId(groupId);
        setSelectedElementIds([groupId]);
    };

    const handleMergeSelected = () => {
        if (selectedElementIds.length < 2) return;
        const ids = [...selectedElementIds];
        saveToHistory(elements, markers);
        const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const targets = elements.filter(el => ids.includes(el.id));
        const minX = Math.min(...targets.map(el => el.x));
        const minY = Math.min(...targets.map(el => el.y));
        const maxX = Math.max(...targets.map(el => el.x + el.width));
        const maxY = Math.max(...targets.map(el => el.y + el.height));
        const maxZ = Math.max(...targets.map(el => el.zIndex));
        const originalChildData: Record<string, { x: number; y: number; width: number; height: number; zIndex: number }> = {};
        for (const t of targets) {
            originalChildData[t.id] = { x: t.x, y: t.y, width: t.width, height: t.height, zIndex: t.zIndex };
        }
        const newElements = elements.map(el => ids.includes(el.id) ? { ...el, groupId } : el);
        const groupEl: CanvasElement = {
            id: groupId, type: 'group' as const,
            x: minX, y: minY, width: maxX - minX, height: maxY - minY,
            zIndex: maxZ + 1, children: ids, isCollapsed: true, originalChildData,
        };
        setElements([...newElements, groupEl]);
        setSelectedElementId(groupId);
        setSelectedElementIds([groupId]);
    };

    const handleUngroupSelected = () => {
        const el = elements.find(e => e.id === selectedElementId);
        if (!el || el.type !== 'group') return;
        saveToHistory(elements, markers);
        const childIds = el.children || [];
        const originalData = el.originalChildData || {};
        const newElements = elements
            .filter(e => e.id !== el.id)
            .map(e => {
                if (!childIds.includes(e.id)) return e;
                const orig = originalData[e.id];
                return orig
                    ? { ...e, groupId: undefined, x: orig.x, y: orig.y, width: orig.width, height: orig.height, zIndex: orig.zIndex }
                    : { ...e, groupId: undefined };
            });
        setElements(newElements);
        setSelectedElementIds(childIds);
        setSelectedElementId(childIds[0] || null);
    };

    const renderMultiSelectToolbar = () => {
        if (selectedElementIds.length < 2) return null;
        const els = elements.filter(el => selectedElementIds.includes(el.id));
        if (els.length === 0) return null;
        // During drag, use ref positions to stay in sync
        const getPos = (el: CanvasElement) => {
            const dragPos = isDraggingElement ? dragOffsetsRef.current[el.id] : null;
            return { x: dragPos ? dragPos.x : el.x, y: dragPos ? dragPos.y : el.y };
        };
        const minX = Math.min(...els.map(el => getPos(el).x));
        const minY = Math.min(...els.map(el => getPos(el).y));
        const maxX = Math.max(...els.map(el => getPos(el).x + el.width));

        // Canvas-space coordinates (toolbar lives inside the CSS transform layer)
        const canvasCenterX = (minX + maxX) / 2;
        const counterScale = 100 / zoom;
        const topToolbarTop = minY - (52 * counterScale);

        return (
            <div
                id="active-floating-toolbar"
                className={`absolute bg-white rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.1)] border border-gray-100 px-2 py-1.5 flex items-center gap-1 z-50 ${isDraggingElement ? '' : 'animate-in fade-in zoom-in-95 duration-200'} whitespace-nowrap`}
                style={{ left: canvasCenterX, top: topToolbarTop, transform: `translateX(-50%) scale(${counterScale})`, transformOrigin: 'bottom center', pointerEvents: 'auto' }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* Auto Layout */}
                <button onClick={() => distributeSelectedElements('auto')} className="px-2 py-1.5 text-gray-600 hover:text-black hover:bg-gray-50 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors" title="自动排列 Shift+A">
                    <Layout size={14} /> 自动布局
                </button>

                <div className="w-px h-5 bg-gray-200"></div>

                {/* Alignment Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => { setShowAlignMenu(!showAlignMenu); setShowSpacingMenu(false); }}
                        className={`px-2 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors ${showAlignMenu ? 'bg-gray-100 text-black' : 'text-gray-600 hover:text-black hover:bg-gray-50'}`}
                    >
                        <AlignLeft size={14} /> 对齐 <ChevronDown size={10} />
                    </button>
                    {showAlignMenu && (
                        <div className="absolute top-full mt-2 left-0 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[60] animate-in fade-in zoom-in-95 duration-150">
                            <button onClick={() => { alignSelectedElements('left'); setShowAlignMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm text-gray-700 transition">
                                <span className="flex items-center gap-2"><AlignLeft size={14} /> 左对齐</span>
                                <span className="text-xs text-gray-400">Alt + A</span>
                            </button>
                            <button onClick={() => { alignSelectedElements('center'); setShowAlignMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm text-gray-700 transition">
                                <span className="flex items-center gap-2"><AlignCenter size={14} /> 水平居中</span>
                                <span className="text-xs text-gray-400">Alt + H</span>
                            </button>
                            <button onClick={() => { alignSelectedElements('right'); setShowAlignMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm text-gray-700 transition">
                                <span className="flex items-center gap-2"><AlignRight size={14} /> 右对齐</span>
                                <span className="text-xs text-gray-400">Alt + D</span>
                            </button>
                            <div className="h-px bg-gray-100 my-1"></div>
                            <button onClick={() => { alignSelectedElements('top'); setShowAlignMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm text-gray-700 transition">
                                <span className="flex items-center gap-2"><ArrowUp size={14} /> 顶部对齐</span>
                                <span className="text-xs text-gray-400">Alt + W</span>
                            </button>
                            <button onClick={() => { alignSelectedElements('middle'); setShowAlignMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm text-gray-700 transition">
                                <span className="flex items-center gap-2"><Minus size={14} /> 垂直居中</span>
                                <span className="text-xs text-gray-400">Alt + V</span>
                            </button>
                            <button onClick={() => { alignSelectedElements('bottom'); setShowAlignMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm text-gray-700 transition">
                                <span className="flex items-center gap-2"><ArrowUp size={14} className="rotate-180" /> 底部对齐</span>
                                <span className="text-xs text-gray-400">Alt + S</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Spacing Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => { setShowSpacingMenu(!showSpacingMenu); setShowAlignMenu(false); }}
                        className={`px-2 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors ${showSpacingMenu ? 'bg-gray-100 text-black' : 'text-gray-600 hover:text-black hover:bg-gray-50'}`}
                    >
                        <Minus size={14} /> 间距 <ChevronDown size={10} />
                    </button>
                    {showSpacingMenu && (
                        <div className="absolute top-full mt-2 left-0 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[60] animate-in fade-in zoom-in-95 duration-150">
                            <button onClick={() => { distributeSelectedElements('horizontal'); setShowSpacingMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm text-gray-700 transition">
                                <span className="flex items-center gap-2"><Minus size={14} /> 水平间距</span>
                                <span className="text-xs text-gray-400">Shift + H</span>
                            </button>
                            <button onClick={() => { distributeSelectedElements('vertical'); setShowSpacingMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm text-gray-700 transition">
                                <span className="flex items-center gap-2"><Minus size={14} className="rotate-90" /> 垂直间距</span>
                                <span className="text-xs text-gray-400">Shift + V</span>
                            </button>
                            <button onClick={() => { distributeSelectedElements('auto'); setShowSpacingMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm text-gray-700 transition">
                                <span className="flex items-center gap-2"><Layout size={14} /> 自动排列</span>
                                <span className="text-xs text-gray-400">Shift + A</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="w-px h-5 bg-gray-200"></div>

                {/* Download */}
                <button onClick={handleDownload} className="p-1.5 text-gray-600 hover:text-black hover:bg-gray-50 rounded-lg flex items-center justify-center transition-colors" title="下载">
                    <Download size={14} />
                </button>

                <div className="w-px h-5 bg-gray-200"></div>

                {/* Group */}
                <button onClick={handleGroupSelected} className="px-2 py-1.5 text-gray-600 hover:text-black hover:bg-gray-50 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors" title="创建编组 Ctrl+G">
                    <Box size={14} /> 编组
                </button>

                {/* Merge Layers */}
                <button onClick={handleMergeSelected} className="px-2 py-1.5 text-gray-600 hover:text-black hover:bg-gray-50 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors" title="合并图层 Ctrl+Shift+G">
                    <Layers size={14} /> 合并
                </button>
            </div>
        );
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-[#E8E8E8] font-sans">
            {renderContextMenu()}
            {previewUrl && (
                <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-10 cursor-pointer backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setPreviewUrl(null)}>
                    <button className="absolute top-4 right-4 text-white hover:text-gray-300 p-2 bg-white/10 rounded-full transition"><X size={24} /></button>
                    <img src={previewUrl} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl cursor-default" onClick={(e) => e.stopPropagation()} />
                </div>
            )}

            {/* Mode Switch Confirmation Dialog */}
            {showModeSwitchDialog && (
                <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-150" onClick={() => { setShowModeSwitchDialog(false); setPendingModelMode(null); }}>
                    <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[360px] p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">新建对话?</h3>
                        <p className="text-sm text-gray-500 mb-5">切换模式会新建对话。您可以随时从历史列表中访问此对话。</p>
                        <label className="flex items-center gap-2 mb-5 cursor-pointer select-none">
                            <div
                                onClick={() => setDoNotAskModeSwitch(!doNotAskModeSwitch)}
                                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${doNotAskModeSwitch ? 'bg-black' : 'bg-gray-300'}`}
                            >
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${doNotAskModeSwitch ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </div>
                            <span className="text-sm text-gray-600">不再询问</span>
                        </label>
                        <div className="flex gap-3">
                            <button onClick={() => { setShowModeSwitchDialog(false); setPendingModelMode(null); }} className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">取消</button>
                            <button onClick={confirmModeSwitch} className="flex-1 h-10 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 transition">新建</button>
                        </div>
                    </div>
                </div>
            )}
            <AnimatePresence>
                {leftPanelMode && (
                    <motion.div
                        initial={{ opacity: 0, x: -280 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -280 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="absolute top-0 left-0 bottom-0 w-[220px] bg-white/98 backdrop-blur-xl border-r border-gray-200/60 z-50 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.04)]"
                    >
                        {/* Panel Header */}
                        <div className="px-4 py-3.5 flex items-center justify-between border-b border-gray-100 shrink-0">
                            <span className="font-semibold text-sm text-gray-900">{leftPanelMode === 'layers' ? '图层' : '已生成文件列表'}</span>
                            <button onClick={() => setLeftPanelMode(null)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition"><X size={14} /></button>
                        </div>

                        {/* Panel Content */}
                        <div className="flex-1 overflow-y-auto no-scrollbar">
                            {leftPanelMode === 'layers' ? (
                                <div className="flex flex-col">
                                    {/* 历史记录 Section */}
                                    <div className="border-b border-gray-100">
                                        <div className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition" onClick={() => { }}>
                                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">历史记录</span>
                                            <ChevronUp size={14} className="text-gray-400" />
                                        </div>
                                        <div className="px-4 pb-4">
                                            <div className="h-24 bg-gray-50/80 rounded-lg flex flex-col items-center justify-center text-gray-400 text-xs border border-dashed border-gray-200">
                                                <ImageIcon size={24} className="opacity-15 mb-1.5" />
                                                暂无历史记录
                                            </div>
                                        </div>
                                    </div>
                                    {/* 图层列表 */}
                                    <div className="p-1.5 space-y-0.5">
                                        {elements.length === 0 ? (
                                            <div className="py-16 text-center text-xs text-gray-400">暂无图层</div>
                                        ) : (
                                            (() => {
                                                const rootElements = elements.filter(el => !el.groupId);
                                                return [...rootElements].reverse().map(el => (
                                                    <React.Fragment key={el.id}>
                                                        <LayerItem
                                                            el={el}
                                                            isSelected={selectedElementId === el.id || selectedElementIds.includes(el.id)}
                                                            onSelect={handleElementMouseDown}
                                                            onToggleLock={(id) => setElements(prev => prev.map(e => e.id === id ? { ...e, isLocked: !e.isLocked } : e))}
                                                            onToggleHide={(id) => {
                                                                const el = elements.find(e => e.id === id);
                                                                const newHidden = !el?.isHidden;
                                                                setElements(prev => prev.map(e => {
                                                                    if (e.id === id) return { ...e, isHidden: newHidden };
                                                                    if (e.groupId === id) return { ...e, isHidden: newHidden };
                                                                    return e;
                                                                }));
                                                            }}
                                                            onToggleCollapse={(id) => setElements(prev => prev.map(e => e.id === id ? { ...e, isCollapsed: !e.isCollapsed } : e))}
                                                            onEnterGroup={(id) => setFocusedGroupId(id)}
                                                        />
                                                        {el.type === 'group' && !el.isCollapsed && el.children?.map(childId => {
                                                            const child = elements.find(c => c.id === childId);
                                                            if (!child) return null;
                                                            return (
                                                                <LayerItem
                                                                    key={child.id}
                                                                    el={child}
                                                                    depth={1}
                                                                    isSelected={selectedElementId === child.id || selectedElementIds.includes(child.id)}
                                                                    onSelect={handleElementMouseDown}
                                                                    onToggleLock={(id) => setElements(prev => prev.map(e => e.id === id ? { ...e, isLocked: !e.isLocked } : e))}
                                                                    onToggleHide={(id) => setElements(prev => prev.map(e => e.id === id ? { ...e, isHidden: !e.isHidden } : e))}
                                                                />
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                ));
                                            })()
                                        )}
                                    </div>
                                </div>
                            ) : (
                                /* 已生成文件列表 */
                                <div className="p-2">
                                    {(() => {
                                        const allFiles = messages.flatMap((m, mi) => {
                                            const imgs = (m.agentData?.imageUrls || []).map((url, fi) => ({
                                                url,
                                                type: 'image' as const,
                                                title: m.agentData?.title || `生成图片 ${mi + 1}-${fi + 1}`,
                                                time: m.timestamp,
                                                model: m.agentData?.model || 'AI'
                                            }));
                                            const vids = (m.agentData?.videoUrls || []).map((url, fi) => ({
                                                url,
                                                type: 'video' as const,
                                                title: m.agentData?.title || `生成视频 ${mi + 1}-${fi + 1}`,
                                                time: m.timestamp,
                                                model: m.agentData?.model || 'AI'
                                            }));
                                            // Ensure any URL mentioned in agentData that isn't already included is caught
                                            const messageContentUrls: any[] = [];
                                            return [...imgs, ...vids, ...messageContentUrls];
                                        });
                                        if (allFiles.length === 0) {
                                            return <div className="py-16 text-center text-xs text-gray-400">暂无文件</div>;
                                        }
                                        return allFiles.reverse().map((file, i) => (
                                            <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition group" onClick={() => file.type === 'image' ? setPreviewUrl(file.url) : window.open(file.url)}>
                                                <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 border border-gray-100 bg-gray-50 flex items-center justify-center">
                                                    {file.type === 'image' ? (
                                                        <img src={file.url} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <Video size={16} className="text-gray-400" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-medium text-gray-700 truncate">{file.title}</div>
                                                    <div className="text-[10px] text-gray-400 mt-0.5">{file.model} · {new Date(file.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
                                                </div>
                                                <a href={file.url} download={`${file.title}.${file.type === 'image' ? 'png' : 'mp4'}`} onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-700 transition"><Download size={13} /></a>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            )}

                            {/* Focused Group Breadcrumb */}
                            {focusedGroupId && (
                                <div className="absolute top-[52px] left-0 right-0 px-2 py-1.5 bg-blue-50/90 backdrop-blur-md border-b border-blue-100/50 z-[45] flex items-center justify-between">
                                    <button
                                        onClick={() => setFocusedGroupId(null)}
                                        className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium text-xs transition"
                                    >
                                        <ChevronLeft size={14} /> 退出组视图
                                    </button>
                                    <span className="text-[10px] text-blue-400 truncate max-w-[100px]">
                                        正在编辑: {elements.find(e => e.id === focusedGroupId)?.id.slice(0, 8)}...
                                    </span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showAssistant && (
                    <AssistantSidebar
                        showAssistant={showAssistant}
                        setShowAssistant={setShowAssistant}
                        conversations={conversations}
                        setConversations={setConversations}
                        activeConversationId={activeConversationId}
                        setActiveConversationId={setActiveConversationId}
                        handleSend={handleSend}
                        handleSmartGenerate={handleSmartGenerate}
                        setPreviewUrl={setPreviewUrl}
                        creationMode={creationMode}
                        setCreationMode={setCreationMode}
                        setPrompt={setPrompt}
                        handleModeSwitch={handleModeSwitch}
                        fileInputRef={fileInputRef}
                        selectedChipId={selectedChipId}
                        setSelectedChipId={setSelectedChipId}
                        hoveredChipId={hoveredChipId}
                        setHoveredChipId={setHoveredChipId}
                        showModeSelector={showModeSelector}
                        setShowModeSelector={setShowModeSelector}
                        showModelPreference={showModelPreference}
                        setShowModelPreference={setShowModelPreference}
                        modelPreferenceTab={modelPreferenceTab}
                        setModelPreferenceTab={setModelPreferenceTab}
                        autoModelSelect={autoModelSelect}
                        setAutoModelSelect={setAutoModelSelect}
                        preferredImageModel={preferredImageModel}
                        setPreferredImageModel={setPreferredImageModel}
                        preferredVideoModel={preferredVideoModel}
                        setPreferredVideoModel={setPreferredVideoModel}
                        preferred3DModel={preferred3DModel}
                        setPreferred3DModel={setPreferred3DModel}
                        showRatioPicker={showRatioPicker}
                        setShowRatioPicker={setShowRatioPicker}
                        showModelPicker={showModelPicker}
                        setShowModelPicker={setShowModelPicker}
                        isInputFocused={isInputFocused}
                        setIsInputFocused={setIsInputFocused}
                        isDragOver={isDragOver}
                        setIsDragOver={setIsDragOver}
                        isVideoPanelHovered={isVideoPanelHovered}
                        setIsVideoPanelHovered={setIsVideoPanelHovered}
                        showVideoSettingsDropdown={showVideoSettingsDropdown}
                        setShowVideoSettingsDropdown={setShowVideoSettingsDropdown}
                        markers={markers}
                        onSaveMarkerLabel={handleSaveMarkerLabel}
                    />
                )}
            </AnimatePresence>

            <div className={`flex-1 relative flex flex-col h-full overflow-hidden ${isCtrlPressed ? 'cursor-none' : ''}`}>
                {/* 
                  按住 Ctrl 时的自定义光标：
                  样式为一个外圈圆框内含一个精准定位的小蓝点 
                */}
                {isCtrlPressed && (
                    <div
                        className="fixed pointer-events-none z-[99999] w-[24px] h-[24px] -ml-[12px] -mt-[12px] border-2 border-blue-500 rounded-full flex items-center justify-center transition-transform duration-75"
                        style={{
                            left: 'var(--mouse-x, 0)',
                            top: 'var(--mouse-y, 0)',
                            background: 'rgba(59, 130, 246, 0.1)'
                        }}
                    >
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                    </div>
                )}

                {/* Top Bar - Lovart Style: minimal, transparent */}
                <div className="absolute top-4 left-5 right-5 flex justify-between items-center z-30 pointer-events-none transition-all duration-300" style={{ paddingRight: showAssistant ? '500px' : '0' }}>
                    <div className="flex items-center gap-3 pointer-events-auto">
                        <button onClick={() => navigate('/')} className="w-9 h-9 bg-black rounded-full flex items-center justify-center text-white font-bold text-[10px] tracking-wide shadow-sm hover:scale-105 transition">XC</button>
                        <div className="flex items-center gap-1.5 cursor-pointer hover:bg-white/60 px-2.5 py-1 rounded-full transition backdrop-blur-sm">
                            <input className="font-medium text-sm text-gray-900 bg-transparent border-none focus:outline-none w-20 focus:w-40 transition-all" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} />
                            <ChevronDown size={12} className="text-gray-400" />
                        </div>
                    </div>

                    {/* Top Right - Minimal: assistant toggle (Lovart “💬 对话” style matching user reference) */}
                    <div className="pointer-events-auto flex items-center gap-2">
                        {!showAssistant && (
                            <button onClick={() => setShowAssistant(true)} className="h-8 px-3.5 bg-gray-100/90 backdrop-blur-sm rounded-full flex items-center gap-1.5 text-gray-700 hover:text-gray-900 hover:bg-gray-200/90 transition text-xs font-medium border border-transparent shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                                <MessageSquare size={13} className="text-gray-500 fill-gray-500" />
                                对话
                            </button>
                        )}
                    </div>
                </div>

                <ToolbarBottom leftPanelMode={leftPanelMode} setLeftPanelMode={setLeftPanelMode} zoom={zoom} setZoom={setZoom} />

                <div
                    ref={containerRef}
                    className="flex-1 overflow-hidden relative bg-[#E8E8E8] w-full h-full select-none"
                    onContextMenu={handleContextMenu}
                    onMouseDown={handleMouseDown}
                    onMouseMove={(e) => {
                        handleMouseMove(e);
                        document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
                        document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
                    }}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                    onDrop={handleCanvasDrop}
                    style={{
                        cursor: (creationMode === 'image' && isPickingFromCanvas)
                            ? 'crosshair'
                            : (isCtrlPressed || activeTool === 'mark')
                                ? 'none'
                                : ((activeTool === 'hand' || isPanning || isSpacePressed) ? (isPanning ? 'grabbing' : 'grab') : 'default'),
                        WebkitUserSelect: 'none'
                    }}
                >
                    {renderToolbar()}
                    {/* 框选矩形 */}
                    {isMarqueeSelecting && (
                        <div className="absolute border border-blue-400/60 bg-blue-400/5 pointer-events-none z-[9999] rounded-sm" style={{
                            left: Math.min(marqueeStart.x, marqueeEnd.x) - (containerRef.current?.getBoundingClientRect().left || 0),
                            top: Math.min(marqueeStart.y, marqueeEnd.y) - (containerRef.current?.getBoundingClientRect().top || 0),
                            width: Math.abs(marqueeEnd.x - marqueeStart.x),
                            height: Math.abs(marqueeEnd.y - marqueeStart.y),
                        }} />
                    )}
                    {renderTextToolbar()}
                    {renderShapeToolbar()}
                    <div ref={canvasLayerRef} className="absolute top-0 left-0 w-0 h-0 overflow-visible" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`, transformOrigin: '0 0', willChange: isPanning ? 'transform' : 'auto', WebkitFontSmoothing: 'antialiased', textRendering: 'optimizeLegibility' }}>
                        {(() => {
                            // Filter elements based on focused group and visibility
                            const visibleElements = focusedGroupId
                                ? elements.filter(el => (el.groupId === focusedGroupId || el.id === focusedGroupId) && !el.isHidden)
                                : elements.filter(el => !el.isHidden);

                            return visibleElements.map((el) => {
                                // Hide children of collapsed (merged) or hidden groups if we are not in focused mode for that group
                                if (el.groupId && focusedGroupId !== el.groupId) {
                                    const parentGroup = elements.find(e => e.id === el.groupId);
                                    if (parentGroup?.isCollapsed || parentGroup?.isHidden) return null;
                                }
                                const isSelected = selectedElementId === el.id || selectedElementIds.includes(el.id);
                                const isLocked = el.isLocked || (el.groupId ? elements.find(g => g.id === el.groupId)?.isLocked : false);
                                const adaptiveScaleLoop = Math.max(0.4, Math.min(2.0, zoom / 100));
                                const flexibleScale = 1 + ((1 / adaptiveScaleLoop) - 1) * 0.6;

                                // Group element rendering
                                if (el.type === 'group') {
                                    return (
                                        <div key={el.id} id={`canvas-el-${el.id}`} className={`absolute ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isLocked ? 'pointer-events-none' : ''}`} style={{ left: el.x, top: el.y, width: el.width, height: el.height, zIndex: el.zIndex, cursor: activeTool === 'select' ? (isLocked ? 'default' : 'move') : 'default' }} onMouseDown={(e) => !isLocked && handleElementMouseDown(e, el.id)}>
                                            {el.isCollapsed ? (
                                                <div className="w-full h-full bg-gray-50/80 border-2 border-gray-300 rounded-lg flex items-center justify-center backdrop-blur-sm">
                                                    <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
                                                        <Layers size={16} />
                                                        <span>已合并 · {el.children?.length || 0} 个图层</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="w-full h-full border-2 border-dashed border-blue-300 rounded-lg pointer-events-none" />
                                            )}
                                            {isSelected && (
                                                <div className="absolute -top-8 right-0 flex items-center gap-1 z-50">
                                                    <button className="bg-white shadow-md rounded-md p-1 cursor-pointer hover:bg-blue-50 hover:text-blue-600 text-gray-500 text-xs flex items-center gap-1 px-2" onClick={(e) => { e.stopPropagation(); handleUngroupSelected(); }}>
                                                        <Unlink size={12} /> 拆分
                                                    </button>
                                                    <div className="bg-white shadow-md rounded-md p-1 cursor-pointer hover:bg-red-50 hover:text-red-500">
                                                        <Trash2 size={14} onClick={(e) => { e.stopPropagation(); deleteSelectedElement(); }} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={el.id}
                                        id={`canvas-el-${el.id}`}
                                        className={`absolute group ${isSelected && el.type !== 'text' ? 'ring-2 ring-blue-500' : ''} ${isSelected && el.type === 'text' ? 'ring-1 ring-blue-500 ring-offset-2' : ''} ${isLocked ? 'pointer-events-none' : ''}`}
                                        style={{
                                            left: el.x,
                                            top: el.y,
                                            width: el.type === 'text' ? 'auto' : el.width,
                                            height: el.type === 'text' ? 'auto' : el.height,
                                            zIndex: el.zIndex,
                                            cursor: (isCtrlPressed || activeTool === 'mark') ? 'none' : (activeTool === 'select' ? (isLocked ? 'default' : 'move') : 'default'),
                                            whiteSpace: el.type === 'text' ? 'nowrap' : 'normal'
                                        }}
                                        onMouseDown={(e) => !isLocked && handleElementMouseDown(e, el.id)}
                                        onDoubleClick={() => { if (el.type === 'text') { setEditingTextId(el.id); } else if (el.url) { setPreviewUrl(el.url); } }}
                                    >
                                        {(isSelected || isDraggingElement) && editingTextId !== el.id && (<div className="absolute -top-8 right-0 bg-white shadow-md rounded-md p-1 cursor-pointer hover:bg-red-50 hover:text-red-500 z-50"><Trash2 size={14} onClick={(e) => { e.stopPropagation(); deleteSelectedElement(); }} /></div>)}
                                        {el.type === 'text' && (
                                            <div className="w-full h-full flex items-center justify-center p-2">
                                                {editingTextId === el.id ? (
                                                    <textarea
                                                        autoFocus
                                                        className="w-full h-full bg-transparent border-none outline-none resize-none text-center overflow-hidden"
                                                        style={{
                                                            color: el.fillColor,
                                                            fontSize: `${el.fontSize}px`,
                                                            fontWeight: el.fontWeight,
                                                            fontFamily: el.fontFamily,
                                                            lineHeight: 1.2
                                                        }}
                                                        value={el.text}
                                                        onChange={(e) => {
                                                            setElements(prev => prev.map(item =>
                                                                item.id === el.id ? { ...item, text: e.target.value } : item
                                                            ));
                                                        }}
                                                        onBlur={() => setEditingTextId(null)}
                                                    />
                                                ) : (
                                                    <div
                                                        className="w-full h-full text-center"
                                                        style={{
                                                            color: el.fillColor,
                                                            fontSize: `${el.fontSize}px`,
                                                            fontWeight: el.fontWeight,
                                                            fontFamily: el.fontFamily,
                                                            lineHeight: 1.2
                                                        }}
                                                    >
                                                        {el.text || 'Text'}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {el.type === 'shape' && (
                                            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="overflow-visible">
                                                {el.shapeType === 'square' && (<rect x="0" y="0" width="100" height="100" rx={el.cornerRadius ? (el.cornerRadius / Math.min(el.width, el.height)) * 100 : 0} fill={el.fillColor} stroke={el.strokeColor} strokeWidth={el.strokeColor === 'transparent' ? 0 : (el.strokeWidth || 2)} vectorEffect="non-scaling-stroke" />)}
                                                {el.shapeType === 'circle' && (<circle cx="50" cy="50" r="50" fill={el.fillColor} stroke={el.strokeColor} strokeWidth={el.strokeColor === 'transparent' ? 0 : (el.strokeWidth || 2)} vectorEffect="non-scaling-stroke" />)}
                                                {el.shapeType === 'triangle' && (<polygon points="50,0 100,100 0,100" fill={el.fillColor} stroke={el.strokeColor} strokeWidth={el.strokeColor === 'transparent' ? 0 : (el.strokeWidth || 2)} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}
                                                {el.shapeType === 'star' && (<polygon points="50 2 61 35 98 35 68 57 79 91 50 70 21 91 32 57 2 35 39 35" fill={el.fillColor} stroke={el.strokeColor} strokeWidth={el.strokeColor === 'transparent' ? 0 : (el.strokeWidth || 2)} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}
                                                {el.shapeType === 'arrow-right' && (<polygon points="0,30 60,30 60,10 100,50 60,90 60,70 0,70" fill={el.fillColor} stroke={el.strokeColor} strokeWidth={el.strokeColor === 'transparent' ? 0 : (el.strokeWidth || 2)} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}
                                                {el.shapeType === 'arrow-left' && (<polygon points="100,30 40,30 40,10 0,50 40,90 40,70 100,70" fill={el.fillColor} stroke={el.strokeColor} strokeWidth={el.strokeColor === 'transparent' ? 0 : (el.strokeWidth || 2)} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}
                                                {el.shapeType === 'bubble' && (<path d="M10,10 Q90,10 90,50 Q90,90 50,90 L30,100 L40,85 Q10,80 10,50 Q10,10 50,10" fill={el.fillColor} stroke={el.strokeColor} strokeWidth={el.strokeColor === 'transparent' ? 0 : (el.strokeWidth || 2)} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}
                                            </svg>
                                        )}
                                        {(el.type === 'image' || el.type === 'gen-image') && (
                                            <div className={`w-full h-full flex flex-col relative transition-all ${el.url && el.type === 'image' ? '' : (el.url ? 'bg-white' : 'bg-[#F0F9FF]')} ${el.type === 'gen-image' && !el.url ? 'border border-blue-100' : ''} ${el.type === 'gen-image' ? `rounded-lg ${el.url ? 'overflow-hidden' : ''}` : ''}`}>
                                                {el.url ? (
                                                    <>
                                                        <img src={el.url} className={`w-full h-full ${el.type === 'image' ? 'w-full h-full' : 'object-cover'}`} draggable={false} />
                                                        {/* Resize Handles - Only for Image & Selected */}
                                                        {isSelected && (
                                                            <>
                                                                <div className="absolute top-0 left-0 w-3 h-3 bg-white border-2 border-blue-500 rounded-full -translate-x-1/2 -translate-y-1/2 z-20 cursor-nw-resize hover:scale-125 transition" onMouseDown={(e) => handleResizeStart(e, 'nw', el.id)}></div>
                                                                <div className="absolute top-0 right-0 w-3 h-3 bg-white border-2 border-blue-500 rounded-full translate-x-1/2 -translate-y-1/2 z-20 cursor-ne-resize hover:scale-125 transition" onMouseDown={(e) => handleResizeStart(e, 'ne', el.id)}></div>
                                                                <div className="absolute bottom-0 left-0 w-3 h-3 bg-white border-2 border-blue-500 rounded-full -translate-x-1/2 translate-y-1/2 z-20 cursor-sw-resize hover:scale-125 transition" onMouseDown={(e) => handleResizeStart(e, 'sw', el.id)}></div>
                                                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-white border-2 border-blue-500 rounded-full translate-x-1/2 translate-y-1/2 z-20 cursor-se-resize hover:scale-125 transition" onMouseDown={(e) => handleResizeStart(e, 'se', el.id)}></div>
                                                                {/* Side Handles */}
                                                                <div className="absolute top-1/2 left-0 w-1.5 h-6 bg-white border border-blue-500 rounded-full -translate-x-1/2 -translate-y-1/2 z-20 cursor-ew-resize hover:scale-110 transition hidden group-hover:block" onMouseDown={(e) => handleResizeStart(e, 'w', el.id)}></div>
                                                                <div className="absolute top-1/2 right-0 w-1.5 h-6 bg-white border border-blue-500 rounded-full translate-x-1/2 -translate-y-1/2 z-20 cursor-ew-resize hover:scale-110 transition hidden group-hover:block" onMouseDown={(e) => handleResizeStart(e, 'e', el.id)}></div>
                                                                {/* Top Selection Info Bar (Clean Text Style) */}
                                                                {/* Left: Name */}
                                                                <div
                                                                    className="absolute top-0 left-0 flex items-center gap-1.5 text-xs font-semibold text-gray-700 whitespace-nowrap pointer-events-none select-none opacity-0 group-hover:opacity-100 transition-opacity delay-75 duration-200 origin-bottom-left z-50"
                                                                    style={{
                                                                        transform: `scale(${100 / zoom}) translateY(calc(-100% - 4px))`
                                                                    }}
                                                                >
                                                                    <ImageIcon size={12} className="opacity-80" />
                                                                    <span>{el.id.includes('unnamed') ? 'unnamed' : '图像'}</span>
                                                                </div>

                                                                {/* Right: Dimensions */}
                                                                <div
                                                                    className="absolute top-0 right-0 font-mono text-[10px] font-medium text-gray-500 whitespace-nowrap pointer-events-none select-none opacity-0 group-hover:opacity-100 transition-opacity delay-75 duration-200 origin-bottom-right z-50"
                                                                    style={{
                                                                        transform: `scale(${100 / zoom}) translateY(calc(-100% - 6px))`
                                                                    }}
                                                                >
                                                                    {Math.round(el.width)} × {Math.round(el.height)}
                                                                </div>
                                                            </>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        {/* Floating label above node — only when selected */}
                                                        {isSelected && (
                                                            <>
                                                                <div
                                                                    className="absolute top-0 left-0 flex items-center gap-1.5 text-xs font-semibold text-gray-700 whitespace-nowrap pointer-events-none select-none z-50"
                                                                    style={{ transform: `scale(${100 / zoom}) translateY(calc(-100% - 4px))` }}
                                                                >
                                                                    <ImageIcon size={12} className="opacity-80" />
                                                                    <span>图像生成器</span>
                                                                </div>
                                                                <div
                                                                    className="absolute top-0 right-0 font-mono text-[10px] font-medium text-gray-500 whitespace-nowrap pointer-events-none select-none z-50"
                                                                    style={{ transform: `scale(${100 / zoom}) translateY(calc(-100% - 6px))` }}
                                                                >
                                                                    {Math.round(el.width)} × {Math.round(el.height)}
                                                                </div>
                                                            </>
                                                        )}
                                                        <div className="flex-1 flex items-center justify-center relative group-hover:bg-blue-50/50 transition-colors">
                                                            {el.isGenerating ? (
                                                                <div className="flex flex-col items-center gap-4" style={{ transform: `scale(${100 / zoom})` }}>
                                                                    <div className="relative">
                                                                        <Loader2 size={48} className="animate-spin text-blue-500" />
                                                                        {el.generatingType === 'upscale' && (
                                                                            <div className="absolute inset-0 flex items-center justify-center">
                                                                                <ImageIcon size={20} className="text-blue-500 opacity-50" />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex flex-col items-center gap-1">
                                                                        <span className="text-sm text-blue-500 font-bold whitespace-nowrap">
                                                                            {el.generatingType === 'upscale' ? '高清放大中' :
                                                                                el.generatingType === 'vector' ? '矢量线稿中' :
                                                                                    el.generatingType === 'remove-bg' ? '背景移除中' : '正在处理中'}
                                                                        </span>
                                                                        <span className="text-[10px] text-blue-400 opacity-70 animate-pulse">Creating magic...</span>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col items-center gap-2 text-blue-200" style={{ transform: `scale(${100 / zoom})` }}>
                                                                    <ImageIcon size={48} strokeWidth={1.5} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        {(el.type === 'gen-video' || el.type === 'video') && (
                                            <div className={`w-full h-full flex flex-col relative transition-all ${el.url ? 'bg-black' : 'bg-[#F0FAFF]'} ${isSelected ? 'ring-1 ring-blue-500' : ((el.type === 'gen-video' || el.type === 'video') && !el.url ? 'border border-blue-100' : '')} ${(el.type === 'gen-video' || el.type === 'video') ? `rounded-lg ${el.url ? 'overflow-hidden' : ''}` : ''}`}>
                                                {el.url ? (
                                                    <>
                                                        <div className="w-full h-full relative flex items-center justify-center">
                                                            <video src={el.url} className="w-full h-full object-contain" controls />
                                                        </div>
                                                        {/* Resize Handles - Only for Selected */}
                                                        {isSelected && (
                                                            <>
                                                                <div className="absolute top-0 left-0 w-3 h-3 bg-white border-2 border-blue-500 rounded-full -translate-x-1/2 -translate-y-1/2 z-20 cursor-nw-resize hover:scale-125 transition" onMouseDown={(e) => handleResizeStart(e, 'nw', el.id)}></div>
                                                                <div className="absolute top-0 right-0 w-3 h-3 bg-white border-2 border-blue-500 rounded-full translate-x-1/2 -translate-y-1/2 z-20 cursor-ne-resize hover:scale-125 transition" onMouseDown={(e) => handleResizeStart(e, 'ne', el.id)}></div>
                                                                <div className="absolute bottom-0 left-0 w-3 h-3 bg-white border-2 border-blue-500 rounded-full -translate-x-1/2 translate-y-1/2 z-20 cursor-sw-resize hover:scale-125 transition" onMouseDown={(e) => handleResizeStart(e, 'sw', el.id)}></div>
                                                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-white border-2 border-blue-500 rounded-full translate-x-1/2 translate-y-1/2 z-20 cursor-se-resize hover:scale-125 transition" onMouseDown={(e) => handleResizeStart(e, 'se', el.id)}></div>
                                                                {/* Side Handles */}
                                                                <div className="absolute top-1/2 left-0 w-1.5 h-6 bg-white border border-blue-500 rounded-full -translate-x-1/2 -translate-y-1/2 z-20 cursor-ew-resize hover:scale-110 transition hidden group-hover:block" onMouseDown={(e) => handleResizeStart(e, 'w', el.id)}></div>
                                                                <div className="absolute top-1/2 right-0 w-1.5 h-6 bg-white border border-blue-500 rounded-full translate-x-1/2 -translate-y-1/2 z-20 cursor-ew-resize hover:scale-110 transition hidden group-hover:block" onMouseDown={(e) => handleResizeStart(e, 'e', el.id)}></div>

                                                                {/* Top Selection Info Bar (Counter-Scaled) */}
                                                                {/* Left: Name */}
                                                                <div
                                                                    className="absolute top-0 left-0 flex items-center gap-1.5 text-xs font-semibold text-gray-700 whitespace-nowrap pointer-events-none select-none opacity-0 group-hover:opacity-100 transition-opacity delay-75 duration-200 origin-bottom-left z-50 mix-blend-difference text-white"
                                                                    style={{
                                                                        transform: `scale(${100 / zoom}) translateY(calc(-100% - 4px))`
                                                                    }}
                                                                >
                                                                    <Video size={12} className="opacity-80" />
                                                                    <span>视频</span>
                                                                </div>

                                                                {/* Right: Dimensions */}
                                                                <div
                                                                    className="absolute top-0 right-0 font-mono text-[10px] font-medium text-gray-500 whitespace-nowrap pointer-events-none select-none opacity-0 group-hover:opacity-100 transition-opacity delay-75 duration-200 origin-bottom-right z-50 mix-blend-difference text-white"
                                                                    style={{
                                                                        transform: `scale(${100 / zoom}) translateY(calc(-100% - 6px))`
                                                                    }}
                                                                >
                                                                    {Math.round(el.width)} × {Math.round(el.height)}
                                                                </div>
                                                            </>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        {/* Floating label above node — only when selected */}
                                                        {isSelected && (
                                                            <>
                                                                <div
                                                                    className="absolute top-0 left-0 flex items-center gap-1.5 text-xs font-semibold text-gray-700 whitespace-nowrap pointer-events-none select-none z-50"
                                                                    style={{ transform: `scale(${100 / zoom}) translateY(calc(-100% - 4px))` }}
                                                                >
                                                                    <Video size={12} className="opacity-80" />
                                                                    <span>视频生成器</span>
                                                                </div>
                                                                <div
                                                                    className="absolute top-0 right-0 font-mono text-[10px] font-medium text-gray-500 whitespace-nowrap pointer-events-none select-none z-50"
                                                                    style={{ transform: `scale(${100 / zoom}) translateY(calc(-100% - 6px))` }}
                                                                >
                                                                    {Math.round(el.width)} × {Math.round(el.height)}
                                                                </div>
                                                            </>
                                                        )}
                                                        <div className="flex-1 flex items-center justify-center relative group-hover:bg-blue-50/50 transition-colors">
                                                            {el.isGenerating ? (<div className="flex flex-col items-center gap-4" style={{ transform: `scale(${100 / zoom})` }}> <Loader2 size={48} className="animate-spin text-blue-500" /> <span className="text-sm text-blue-400 font-medium whitespace-nowrap">Creating magic...</span> </div>) : (<div className="flex flex-col items-center gap-2 text-blue-200" style={{ transform: `scale(${100 / zoom})` }}> <Film size={48} strokeWidth={1.5} /> </div>)}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        })()}
                        {/* Alignment Guide Lines */}
                        {alignGuides.map((guide, i) => (
                            guide.type === 'v' ? (
                                <div key={`guide-${i}`} className="absolute pointer-events-none z-[9998]" style={{ left: guide.pos, top: -5000, width: 1, height: 10000, background: 'repeating-linear-gradient(to bottom, #f43f5e 0px, #f43f5e 4px, transparent 4px, transparent 8px)' }} />
                            ) : (
                                <div key={`guide-${i}`} className="absolute pointer-events-none z-[9998]" style={{ left: -5000, top: guide.pos, width: 10000, height: 1, background: 'repeating-linear-gradient(to right, #f43f5e 0px, #f43f5e 4px, transparent 4px, transparent 8px)' }} />
                            )
                        ))}
                        {/* Markers Layer */}
                        <AnimatePresence mode="popLayout">
                            {markers.map((marker, i) => {
                                const el = elements.find(e => e.id === marker.elementId);
                                if (!el) return null;
                                const dragPos = isDraggingElement ? dragOffsetsRef.current[el.id] : null;
                                const baseX = dragPos ? dragPos.x : el.x;
                                const baseY = dragPos ? dragPos.y : el.y;
                                const pixelX = baseX + (el.width * marker.x / 100);
                                const pixelY = baseY + (el.height * marker.y / 100);

                                const isIdMatch = (b: any) => b.type === 'file' && b.file && (b.file as any).markerId === marker.id;
                                const isHoveredInChat = hoveredChipId && inputBlocks.some(b => b.id === hoveredChipId && isIdMatch(b));

                                // 反向补偿画布缩放倍率，保持标记在屏幕上恒定大小
                                const inverseScale = 100 / zoom;

                                return (
                                    // 外层 div：负责定位 + 反向缩放（不受 framer-motion 控制）
                                    <div
                                        key={marker.id}
                                        style={{
                                            left: pixelX,
                                            top: pixelY,
                                            position: 'absolute',
                                            zIndex: editingMarkerId === marker.id ? 2000 : (isHoveredInChat ? 600 : 500),
                                            transform: `translate(-50%, -100%) scale(${inverseScale})`,
                                            transformOrigin: 'bottom center',
                                            pointerEvents: 'auto',
                                        }}
                                        className="group/marker cursor-pointer"
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setZoom(Math.max(100, zoom));
                                            setEditingMarkerId(marker.id);
                                            setEditingMarkerLabel(marker.label || '');
                                        }}
                                    >
                                        {/* 内层 motion.div：负责进入/退出/悬浮动画 */}
                                        <motion.div
                                            initial={{ scale: 3, opacity: 0 }}
                                            animate={{
                                                scale: isHoveredInChat ? 1.2 : 1,
                                                opacity: 1,
                                            }}
                                            exit={{ scale: 0, opacity: 0 }}
                                            whileHover={{ scale: 1.2 }}
                                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                            style={{ transformOrigin: 'bottom center' }}
                                            className="relative flex flex-col items-center"
                                        >
                                            <div className={`w-[28px] h-[28px] rounded-full bg-[#3B82F6] border-2 border-white flex items-center justify-center text-white font-bold text-[12px] relative z-10 transition-shadow duration-300 ${isHoveredInChat ? 'shadow-[0_0_0_5px_rgba(59,130,246,0.35)]' : 'shadow-lg'}`}>
                                                {i + 1}
                                            </div>
                                            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-[#3B82F6] -mt-[1px]"></div>
                                        </motion.div>

                                        {/* Hover Tooltip (Clean Label) */}
                                        <div
                                            className="absolute left-1/2 bottom-[110%] -translate-x-1/2 mb-1 bg-gray-900/90 backdrop-blur-sm px-2.5 py-1.5 rounded-xl shadow-2xl border border-white/10 opacity-0 group-hover/marker:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap z-[60] scale-90 group-hover/marker:scale-100 origin-bottom"
                                        >
                                            <span className="text-[12px] font-bold text-white tracking-wide">
                                                {marker.label || marker.analysis || '识别中...'}
                                            </span>
                                        </div>

                                        {/* Marker Edit Popover */}
                                        <AnimatePresence>
                                            {editingMarkerId === marker.id && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.9, y: 5 }}
                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.9, y: 5 }}
                                                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 z-[100]"
                                                    onClick={(e) => e.stopPropagation()}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    <div className="bg-white rounded-[24px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.2)] border border-gray-100 p-4 min-w-[260px] flex flex-col gap-3.5">
                                                        {/* Header */}
                                                        <div className="flex items-center justify-between px-1">
                                                            <span className="text-[12px] font-bold text-gray-400/80 tracking-tight">Object Marked</span>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setEditingMarkerId(null); }}
                                                                className="text-gray-300 hover:text-gray-500 transition p-1 hover:bg-gray-100 rounded-full"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>

                                                        {/* Preview Row */}
                                                        <div className="flex items-center gap-3.5 bg-gray-50/80 rounded-[20px] p-2 pr-4 border border-gray-100/30">
                                                            {marker.cropUrl ? (
                                                                <img src={marker.cropUrl} className="w-12 h-12 rounded-[14px] object-cover shadow-sm border border-white" draggable={false} />
                                                            ) : (
                                                                <div className="w-12 h-12 rounded-[14px] bg-gray-200 flex items-center justify-center">
                                                                    <ImageIcon size={20} className="text-gray-400" />
                                                                </div>
                                                            )}
                                                            <div className="flex flex-col">
                                                                <span className="text-[15px] font-extrabold text-gray-800 leading-tight">
                                                                    {marker.analysis || '识别中...'}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Input Row */}
                                                        <div className="flex items-center gap-2.5 px-0.5">
                                                            <div className="w-10 h-10 flex items-center justify-center bg-gray-100/80 rounded-[14px] text-gray-400 shrink-0">
                                                                <MapPin size={20} className="opacity-50" />
                                                                <div className="absolute w-[8px] h-[1.5px] bg-gray-400/40 bottom-2.5 rounded-full"></div>
                                                            </div>
                                                            <div className="flex-1 relative">
                                                                <input
                                                                    autoFocus
                                                                    className="w-full h-10 pl-3.5 pr-10 bg-white border border-gray-200/80 rounded-[14px] text-[14px] font-bold text-gray-700 outline-none focus:ring-[5px] focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-gray-300"
                                                                    placeholder={marker.analysis || "自定义名称..."}
                                                                    value={editingMarkerLabel}
                                                                    onChange={(e) => setEditingMarkerLabel(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            handleSaveMarkerLabel(marker.id, editingMarkerLabel);
                                                                        } else if (e.key === 'Escape') {
                                                                            setEditingMarkerId(null);
                                                                        }
                                                                    }}
                                                                />
                                                                <button
                                                                    onClick={() => handleSaveMarkerLabel(marker.id, editingMarkerLabel)}
                                                                    className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors"
                                                                >
                                                                    <Check size={20} strokeWidth={2.5} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* Arrow */}
                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[12px] border-t-white drop-shadow-[0_8px_8px_rgba(0,0,0,0.05)]"></div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )
                            })}
                        </AnimatePresence>
                        {/* Floating Toolbars — inside transform layer for automatic pan/zoom tracking */}
                        {renderImageToolbar()}
                        {renderGenVideoToolbar()}
                        {renderMultiSelectToolbar()}
                    </div>
                </div>
            </div>

            {/* Touch Edit Mode Indicator */}
            {
                touchEditMode && (
                    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium">
                        <Scan size={16} />
                        <span>Touch Edit 模式 — 点击图片区域进行编辑</span>
                        <button onClick={() => setTouchEditMode(false)} className="ml-2 w-5 h-5 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition">
                            <X size={12} />
                        </button>
                    </div>
                )
            }

            {/* Touch Edit Popup */}
            {
                touchEditPopup && (
                    <div
                        className="fixed bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-72 z-[60] animate-in fade-in duration-200"
                        style={{ left: Math.min(touchEditPopup.x, window.innerWidth - 300), top: Math.min(touchEditPopup.y, window.innerHeight - 250) }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-gray-700 font-medium text-sm">
                                <Scan size={14} /> 区域分析
                            </div>
                            <button onClick={() => { setTouchEditPopup(null); setTouchEditInstruction(''); }} className="text-gray-400 hover:text-gray-600 transition">
                                <X size={14} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mb-3 leading-relaxed">{touchEditPopup.analysis}</p>
                        <input
                            value={touchEditInstruction}
                            onChange={(e) => setTouchEditInstruction(e.target.value)}
                            placeholder="输入编辑指令，如：换成红色"
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 mb-2"
                            onKeyDown={(e) => { if (e.key === 'Enter') handleTouchEditExecute(); }}
                        />
                        <button
                            onClick={handleTouchEditExecute}
                            disabled={!touchEditInstruction.trim() || isTouchEditing}
                            className="w-full py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isTouchEditing ? <><Loader2 size={14} className="animate-spin" /> 处理中...</> : '执行编辑'}
                        </button>
                    </div>
                )
            }

        </div >
    );
};

export default Workspace;
