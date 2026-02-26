
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
    Scan, ZoomIn, Scaling, Wand2
} from 'lucide-react';
import { createChatSession, sendMessage, generateImage, generateVideo, extractTextFromImage, analyzeImageRegion } from '../services/gemini';
import { ChatMessage, Template, CanvasElement, ShapeType, Marker, Project, ConversationSession } from '../types';
import { getProject, saveProject, formatDate } from '../services/storage';
import { Content } from '@google/genai';
import { useAgentOrchestrator } from '../hooks/useAgentOrchestrator';
import { useProjectContext } from '../hooks/useProjectContext';
import { getAgentInfo, executeAgentTask } from '../services/agents';
import { localPreRoute } from '../services/agents/local-router';
import { AgentAvatar } from '../components/agents/AgentAvatar';
import { assetsToCanvasElementsAtCenter } from '../utils/canvas-helpers';
import { AgentSelector } from '../components/agents/AgentSelector';
import { TaskProgress } from '../components/agents/TaskProgress';
import { AgentType } from '../types/agent.types';
import { imageGenSkill } from '../services/skills/image-gen.skill';
import { videoGenSkill } from '../services/skills/video-gen.skill';
import { smartEditSkill } from '../services/skills/smart-edit.skill';
import { touchEditSkill } from '../services/skills/touch-edit.skill';
import { exportSkill } from '../services/skills/export.skill';
const SmartMessageRenderer = ({ text, onGenerate, onAction }: { text: string, onGenerate: (prompt: string) => void, onAction?: (action: string) => void }) => {
    // Simple text renderer - agent structured data handled by agentData in message rendering
    const cleanText = text.replace(/---AGENT_IMAGES---[\s\S]*$/m, '').trim();
    if (!cleanText) return <div className="whitespace-pre-wrap">{text}</div>;
    return <div className="whitespace-pre-wrap">{cleanText}</div>;
};


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
    { label: '21:9', value: '21:9', size: '1568*672' },
    { label: '16:9', value: '16:9', size: '1456*816' },
    { label: '4:3', value: '4:3', size: '1232*928' },
    { label: '3:2', value: '3:2', size: '1344*896' },
    { label: '1:1', value: '1:1', size: '1024*1024' },
    { label: '9:16', value: '9:16', size: '816*1456' },
    { label: '3:4', value: '3:4', size: '928*1232' },
    { label: '2:3', value: '2:3', size: '896*1344' },
    { label: '5:4', value: '5:4', size: '1280*1024' },
    { label: '4:5', value: '4:5', size: '1024*1280' },
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
    const [markers, setMarkers] = useState<Marker[]>([]);
    const [hoveredMarkerId, setHoveredMarkerId] = useState<number | null>(null);
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
    const [fastEditPrompt, setFastEditPrompt] = useState('');
    const [history, setHistory] = useState<HistoryState[]>([{ elements: [], markers: [] }]);
    const [historyStep, setHistoryStep] = useState(0);
    const [prompt, setPrompt] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    // 对话历史管理
    const [conversations, setConversations] = useState<ConversationSession[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string>('');

    // 当项目 id 变化时，如果 project 尚未加载完成，这会在 loadProject 中处理
    // 但如果想单独初始化 activeConversationId，可以在此
    useEffect(() => {
        if (!id) return;
        setActiveConversationId(id);
        const projectConversation = conversations.find(c => c.id === id);
        if (projectConversation) {
            setMessages(projectConversation.messages);
            if (projectConversation.title && projectTitle === '未命名' && projectConversation.title !== '新对话') {
                setProjectTitle(projectConversation.title);
            }
        } else {
            setMessages([]);
        }
    }, [id, conversations.length === 0]);

    const [historySearch, setHistorySearch] = useState('');
    const [showAssistant, setShowAssistant] = useState(true);
    const [isHoveringVideoFrames, setIsHoveringVideoFrames] = useState<{ [id: string]: boolean }>({});
    const [inputBlocks, setInputBlocks] = useState<InputBlock[]>([{ id: 'init', type: 'text', text: '' }]);
    const [activeBlockId, setActiveBlockId] = useState<string>('init');
    const [selectionIndex, setSelectionIndex] = useState<number | null>(null);
    const [selectedChipId, setSelectedChipId] = useState<string | null>(null); // For arrow key chip selection
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [hoveredChipId, setHoveredChipId] = useState<string | null>(null); // For hover preview

    // prompt/attachments legacy states replaced by inputBlocks effectively, 
    // but keeping 'prompt' sync for other potential uses if needed, or simply deriving in handleSend.
    // We will ignore 'prompt' and 'attachments' state for the INPUT area.
    const [modelMode, setModelMode] = useState<'thinking' | 'fast'>('thinking');
    const [webEnabled, setWebEnabled] = useState(false);
    const [imageModelEnabled, setImageModelEnabled] = useState(false);

    const activeBlockIdRef = useRef(activeBlockId);
    const selectionIndexRef = useRef(selectionIndex);

    useEffect(() => { activeBlockIdRef.current = activeBlockId; }, [activeBlockId]);
    useEffect(() => { selectionIndexRef.current = selectionIndex; }, [selectionIndex]);

    // Insert File Logic for Blocks (Moved to top for scope visibility)
    // Uses Refs to ensure event handlers (paste) get current cursor
    const insertInputFile = (file: File) => {
        console.log('insertInputFile called:', file.name, 'Current blocks:', inputBlocks.length, 'Active ID:', activeBlockIdRef.current);
        setInputBlocks(prev => {
            console.log('Prev blocks:', prev.length, 'Block IDs:', prev.map(b => b.id));
            const currentActiveId = activeBlockIdRef.current;
            const currentSelectionIdx = selectionIndexRef.current;

            const activeIndex = prev.findIndex(b => b.id === currentActiveId);
            console.log('Active index:', activeIndex, 'Looking for ID:', currentActiveId);

            if (activeIndex === -1) {
                console.log('Active block not found! Appending to end.');
                return [...prev, { id: `file-${Date.now()}`, type: 'file', file }, { id: `text-${Date.now()}`, type: 'text', text: '' }];
            }

            const activeBlock = prev[activeIndex];
            console.log('Active block found:', activeBlock.type, activeBlock.id);

            if (activeBlock.type === 'text') {
                const text = activeBlock.text || '';
                const idx = currentSelectionIdx !== null ? currentSelectionIdx : text.length;
                const preText = text.slice(0, idx);
                const postText = text.slice(idx);

                console.log('Splitting text block. Pre:', preText, 'Post:', postText);

                const newBlocks: InputBlock[] = [
                    { ...activeBlock, text: preText },
                    { id: `file-${Date.now()}`, type: 'file', file },
                    { id: `text-${Date.now()}`, type: 'text', text: postText }
                ];

                console.log('New blocks created:', newBlocks.length, newBlocks.map(b => `${b.type}:${b.id}`));

                // Auto-focus the post-text block
                const newBlockId = newBlocks[2].id;
                setTimeout(() => {
                    setActiveBlockId(newBlockId);
                    setSelectionIndex(0); // Start of new block
                    // 直接聚焦 DOM 元素
                    const inputEl = document.getElementById(`input-block-${newBlockId}`) as HTMLInputElement;
                    if (inputEl) {
                        inputEl.focus();
                    }
                }, 50);

                const before = prev.slice(0, activeIndex);
                const after = prev.slice(activeIndex + 1);
                const result = [...before, ...newBlocks, ...after];
                console.log('Returning merged blocks:', result.length);
                return result;
            } else {
                console.log('Active block is not text, appending after');
                return [...prev, { id: `file-${Date.now()}`, type: 'file', file }, { id: `text-${Date.now()}`, type: 'text', text: '' }];
            }
        });
    };
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // 创作模式状态: 'agent' | 'image' | 'video'
    type CreationMode = 'agent' | 'image' | 'video';
    const [creationMode, setCreationMode] = useState<CreationMode>('agent');
    const [showModeSelector, setShowModeSelector] = useState(false);

    // 图像生成器相关状态
    const [imageGenRatio, setImageGenRatio] = useState('1:1');
    const [imageGenRes, setImageGenRes] = useState('1K');
    const [imageGenUpload, setImageGenUpload] = useState<File | null>(null);

    // 视频生成器相关状态
    const [videoGenRatio, setVideoGenRatio] = useState('16:9');
    const [videoGenDuration, setVideoGenDuration] = useState('8s');
    const [videoGenQuality, setVideoGenQuality] = useState('1080p');
    const [videoGenModel, setVideoGenModel] = useState<'Veo 3.1' | 'Veo 3.1 Fast' | 'Kling 2.6'>('Veo 3.1 Fast');
    const [videoGenMode, setVideoGenMode] = useState<'startEnd' | 'multiRef'>('startEnd');

    // 视频上传数据状态
    const [videoStartFrame, setVideoStartFrame] = useState<File | null>(null);
    const [videoEndFrame, setVideoEndFrame] = useState<File | null>(null);
    const [videoMultiRefs, setVideoMultiRefs] = useState<File[]>([]);

    // Video bottom toolbar dropdowns
    const [showVideoModelDropdown, setShowVideoModelDropdown] = useState(false);
    const [showVideoSettingsDropdown, setShowVideoSettingsDropdown] = useState(false);

    // 悬停展开与面板状态
    const [isVideoPanelHovered, setIsVideoPanelHovered] = useState(false);
    const [showVideoModelPicker, setShowVideoModelPicker] = useState(false);

    // Legacy agent mode (keeping for compatibility)
    const [agentMode, setAgentMode] = useState(true);

    // Image Toolbar States
    const [upscaleMenuOpen, setUpscaleMenuOpen] = useState(false);
    const [toolbarExpanded, setToolbarExpanded] = useState(false);
    const toolbarExpandTimer = useRef<NodeJS.Timeout | null>(null);
    const [eraserMode, setEraserMode] = useState(false);
    const [brushSize, setBrushSize] = useState(30);

    // Touch Edit States
    const [touchEditMode, setTouchEditMode] = useState(false);
    const [touchEditPopup, setTouchEditPopup] = useState<{
        analysis: string; x: number; y: number; elementId: string;
    } | null>(null);
    const [touchEditInstruction, setTouchEditInstruction] = useState('');
    const [isTouchEditing, setIsTouchEditing] = useState(false);

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
    const [preferredImageModel, setPreferredImageModel] = useState('Nano Banana Pro');
    const [preferredVideoModel, setPreferredVideoModel] = useState('Veo 3.1');
    const [preferred3DModel, setPreferred3DModel] = useState('Auto');

    // Drag-and-drop state
    const [isDragOver, setIsDragOver] = useState(false);

    // Mode switch handler
    const handleModeSwitch = (newMode: 'thinking' | 'fast') => {
        if (newMode === modelMode) return;
        if (doNotAskModeSwitch) {
            setModelMode(newMode);
            setMessages([]);
            return;
        }
        setPendingModelMode(newMode);
        setShowModeSwitchDialog(true);
    };

    const confirmModeSwitch = () => {
        if (pendingModelMode) {
            setModelMode(pendingModelMode);
            setMessages([]);
        }
        setShowModeSwitchDialog(false);
        setPendingModelMode(null);
    };

    // Model preference data
    const MODEL_OPTIONS = {
        image: [
            { id: 'Nano Banana Pro', name: 'Nano Banana Pro', desc: '高质量图像生成，细节丰富', time: '~20s' },
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
        setElements(prev => prev.map(e => e.id === selectedElementId ? { ...e, isGenerating: true } : e));
        try {
            const base64Ref = await urlToBase64(el.url);
            const result = await smartEditSkill({
                sourceUrl: base64Ref,
                editType: 'upscale',
                parameters: { factor }
            });
            if (result) {
                const img = new Image();
                img.src = result;
                img.onload = () => {
                    const updated = elements.map(e => e.id === selectedElementId ? { ...e, isGenerating: false, url: result } : e);
                    setElements(updated);
                    saveToHistory(updated, markers);
                };
            } else {
                setElements(prev => prev.map(e => e.id === selectedElementId ? { ...e, isGenerating: false } : e));
            }
        } catch (e) {
            console.error('Upscale failed:', e);
            setElements(prev => prev.map(e => e.id === selectedElementId ? { ...e, isGenerating: false } : e));
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

    const handleSmartGenerate = async (prompt: string) => {
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
            genModel: 'Nano Banana', // Default model for smart generate
            zIndex: elements.length + 10, // Ensure it's on top
            isGenerating: true
        };
        setElements(prev => [...prev, newEl]);
        setSelectedElementId(id); // Select the newly generated element

        try {
            const resultUrl = await imageGenSkill({
                prompt: prompt,
                model: 'Nano Banana',
                aspectRatio: '1:1'
            });

            if (resultUrl) {
                setElements(prev => prev.map(el => el.id === id ? { ...el, isGenerating: false, url: resultUrl } : el));

                // 同步结果到消息列表，使其出现在已生成文件列表中
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'model',
                    text: `已为您完成智能生成：${prompt.slice(0, 30)}${prompt.length > 30 ? '...' : ''}`,
                    timestamp: Date.now(),
                    agentData: {
                        model: 'Nano Banana',
                        title: '智能生成',
                        imageUrls: [resultUrl]
                    }
                }]);
            } else {
                setElements(prev => prev.map(el => el.id === id ? { ...el, isGenerating: false } : el));
            }
        } catch (e) {
            console.error("Smart gen failed", e);
            setElements(prev => prev.map(el => el.id === id ? { ...el, isGenerating: false } : el));
        }
    };

    // Agent orchestration
    const projectContext = useProjectContext(id || '', projectTitle, elements, messages);
    const { currentTask, isAgentMode, setIsAgentMode, processMessage } = useAgentOrchestrator({
        projectContext,
        canvasState: { elements, pan, zoom, showAssistant },
        onElementsUpdate: setElements,
        onHistorySave: (els) => saveToHistory(els, markers),
        autoAddToCanvas: true
    });

    // Sync agentMode state with isAgentMode
    useEffect(() => {
        console.log('[Workspace] Setting isAgentMode to:', agentMode);
        setIsAgentMode(agentMode);
    }, [agentMode, setIsAgentMode]);

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
            .map(block => (block.file as any).markerId as number);

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
        setInputBlocks(prev => {
            const hasOrphanChip = prev.some(b =>
                b.type === 'file' && b.file && (b.file as any).markerId && !markerIds.includes((b.file as any).markerId)
            );
            if (!hasOrphanChip) return prev;
            // 移除孤立 chip，并重新编号剩余 chip 的 markerId
            const filtered = prev.filter(b =>
                !(b.type === 'file' && b.file && (b.file as any).markerId && !markerIds.includes((b.file as any).markerId))
            );
            let idx = 1;
            filtered.forEach(b => {
                if (b.type === 'file' && b.file && (b.file as any).markerId) {
                    (b.file as any).markerId = idx++;
                }
            });
            return filtered;
        });
    }, [markers]);

    // 选中画布元素时，自动将图片插入输入框（在光标位置插入，用户手动删 chip）
    const prevSelectedIdsRef = useRef<string[]>([]);
    useEffect(() => {
        // 合并单选和多选
        const ids = selectedElementIds.length > 0 ? selectedElementIds : (selectedElementId ? [selectedElementId] : []);
        const prev = prevSelectedIdsRef.current;
        prevSelectedIdsRef.current = ids;

        // 选中列表没变就跳过
        if (JSON.stringify(ids) === JSON.stringify(prev)) return;

        // 取消全部选中时 → 清除自动插入的画布图片 chip（保留标记点 chip 和手动添加的文件）
        if (ids.length === 0 && prev.length > 0) {
            setInputBlocks(prevBlocks => {
                const filtered = prevBlocks.filter(b => {
                    if (b.type !== 'file' || !b.file) return true; // 保留文本块
                    if ((b.file as any)._canvasAutoInsert) return false; // 移除自动插入的画布图片
                    return true; // 保留标记点 chip 和手动添加的文件
                });
                return filtered.length > 0 ? filtered : [{ id: `text-${Date.now()}`, type: 'text' as const, text: '' }];
            });
            return;
        }

        // 找出新增的选中元素（之前没选中，现在选中了）
        const newIds = ids.filter(id => !prev.includes(id));

        // 没有新选中的元素就跳过
        if (newIds.length === 0) return;

        // 只添加新选中的图片（已经在 inputBlocks 里的不重复添加）
        const existingElIds = new Set(
            inputBlocks.filter(b => b.type === 'file' && b.file && (b.file as any)._canvasElId)
                .map(b => (b.file as any)._canvasElId)
        );
        const imageEls = elements.filter(e => newIds.includes(e.id) && !existingElIds.has(e.id) && (e.type === 'image' || e.type === 'gen-image') && e.url);
        if (imageEls.length === 0) return;

        // 用 insertInputFile 在光标位置插入（逐个插入，每个都在当前光标位置）
        (async () => {
            for (const el of imageEls) {
                try {
                    const resp = await fetch(el.url!);
                    const blob = await resp.blob();
                    const file = new File([blob], `canvas-${el.id.slice(-6)}.png`, { type: blob.type || 'image/png' }) as any;
                    file._canvasAutoInsert = true;
                    file._canvasElId = el.id;
                    insertInputFile(file);
                } catch (_) { /* ignore */ }
            }
        })();
    }, [selectedElementIds, selectedElementId]);

    // Text Edit Feature State
    const [showTextEditModal, setShowTextEditModal] = useState(false);
    const [detectedTexts, setDetectedTexts] = useState<string[]>([]);
    const [editedTexts, setEditedTexts] = useState<string[]>([]);
    const [isExtractingText, setIsExtractingText] = useState(false);
    const [showFileListModal, setShowFileListModal] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const refImageInputRef = useRef<HTMLInputElement>(null);
    const chatSessionRef = useRef<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
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
        setInputBlocks(prev => {
            // If removing a file block, we should merge adjacent text blocks
            const idx = prev.findIndex(b => b.id === blockId);
            if (idx === -1) return prev;

            const newBlocks = [...prev];

            // Logic: remove block at idx
            // Check if left and right are text
            const left = newBlocks[idx - 1];
            const right = newBlocks[idx + 1];

            // Also remove corresponding markers from canvas if this file had a markerId
            const block = newBlocks[idx];
            if (block.file && (block.file as any).markerId) {
                const markerId = (block.file as any).markerId;
                const newMarkers = markers.filter(m => m.id !== markerId).map((m, i) => ({ ...m, id: i + 1 }));
                // Need to update markerIds in OTHER blocks too?
                // Since markers state is external, we update it.
                // But the file objects in OTHER blocks still hold old markerIds.
                // We need to update those active file objects.
                // This is tricky with React State immutability inside File objects. But 'insertInputFile' uses references.
                // We should map inputBlocks to update file markerIds.

                // First, update canvas markers
                setMarkers(newMarkers);
                saveToHistory(elements, newMarkers);

                // Then update inputBlocks' files
                newBlocks.forEach(b => {
                    if (b.type === 'file' && b.file && (b.file as any).markerId > markerId) {
                        (b.file as any).markerId -= 1;
                    }
                });
            }

            if (left?.type === 'text' && right?.type === 'text') {
                // Merge
                left.text = (left.text || '') + (right.text || '');
                // Remove current and right
                newBlocks.splice(idx, 2);
                // Focus left
                setActiveBlockId(left.id);
            } else {
                // Just remove
                newBlocks.splice(idx, 1);
                // If we removed the last block and it's empty, ensure at least one text block?
                if (newBlocks.length === 0) newBlocks.push({ id: `text-${Date.now()}`, type: 'text', text: '' });
            }

            return newBlocks;
        });
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
        if (!id) return;
        const save = async () => {
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
                model: 'Nano Banana Pro',
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
                const project = await getProject(id);
                if (project) {
                    if (project.elements) setElements(project.elements);
                    // Note: We intentionally don't restore markers here because
                    // the corresponding File objects in inputBlocks cannot be serialized/restored
                    // Markers are session-specific and should be recreated by user
                    if (project.title) setProjectTitle(project.title);
                    if (project.conversations) {
                        setConversations(project.conversations);
                        // Also try to restore the active conversation's messages
                        const activeC = project.conversations.find(c => c.id === id);
                        if (activeC) setMessages(activeC.messages);
                    }
                    setHistory([{ elements: project.elements || [], markers: [] }]);
                    setHistoryStep(0);
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

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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
    const addGenImage = () => { const containerW = window.innerWidth - (showAssistant ? 480 : 0); const containerH = window.innerHeight; const centerX = (containerW / 2 - pan.x) / (zoom / 100); const centerY = (containerH / 2 - pan.y) / (zoom / 100); const newElement: CanvasElement = { id: Date.now().toString(), type: 'gen-image', x: centerX - 512, y: centerY - 512, width: 1024, height: 1024, zIndex: elements.length + 1, genModel: 'Nano Banana Pro', genAspectRatio: '1:1', genResolution: '1K', genPrompt: '' }; const newElements = [...elements, newElement]; setElements(newElements); saveToHistory(newElements, markers); setSelectedElementId(newElement.id); };
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
        const model: 'Nano Banana' | 'Nano Banana Pro' = (el.genModel === 'Nano Banana' || el.genModel === 'Nano Banana Pro') ? el.genModel : 'Nano Banana Pro';
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

                    // 同步结果到消息列表，将其转为 base64 以保证刷新后不丢失
                    let persistentUrl = resultUrl;
                    if (resultUrl.startsWith('blob:')) {
                        try {
                            const res = await fetch(resultUrl);
                            const blob = await res.blob();
                            persistentUrl = await new Promise<string>((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result as string);
                                reader.readAsDataURL(blob);
                            });
                        } catch (err) {
                            console.error("Failed to convert generated image blob to base64 for chat history", err);
                        }
                    }

                    setMessages(prev => [...prev, {
                        id: Date.now().toString(),
                        role: 'model',
                        text: `已完成图片生成：${el.genPrompt.slice(0, 30)}${el.genPrompt.length > 30 ? '...' : ''}`,
                        timestamp: Date.now(),
                        agentData: {
                            model: el.genModel || 'Nano Banana Pro',
                            title: '生成图片',
                            imageUrls: [persistentUrl]
                        }
                    }]);
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
        try {
            // If Veo 3.1 Fast, we can use startFrame/endFrame directly or map from refImages if that's what UI populated
            // The UI uses `genVideoRefs` for Fast model too (as single ref).
            let startFrame = el.genStartFrame;
            if (!startFrame && el.genModel?.includes('Fast') && el.genVideoRefs?.[0]) {
                startFrame = el.genVideoRefs[0];
            }

            const resultUrl = await videoGenSkill({
                prompt: el.genPrompt,
                aspectRatio: el.genAspectRatio as any || '16:9',
                model: el.genModel as any || 'Veo 3.1 Fast',
                startFrame: startFrame,
                endFrame: el.genEndFrame,
                referenceImages: el.genVideoRefs
            });
            if (resultUrl) {
                const update2 = elements.map(e => e.id === elementId ? { ...e, isGenerating: false, url: resultUrl } : e);
                setElements(update2);
                saveToHistory(update2, markers);

                // Convert video blob to base64 for persistent chat storage
                let persistentUrl = resultUrl;
                if (resultUrl.startsWith('blob:')) {
                    try {
                        const res = await fetch(resultUrl);
                        const blob = await res.blob();
                        persistentUrl = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                        });
                    } catch (err) {
                        console.error("Failed to convert generated video blob to base64 for chat history", err);
                    }
                }

                // 同步结果到消息列表，使其出现在已生成文件列表中
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'model',
                    text: `已完成视频生成：${el.genPrompt.slice(0, 30)}${el.genPrompt.length > 30 ? '...' : ''}`,
                    timestamp: Date.now(),
                    agentData: {
                        model: el.genModel || 'Veo 3.1 Fast',
                        title: '生成视频',
                        videoUrls: [persistentUrl]
                    }
                }]);
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
    const handleMouseDown = (e: React.MouseEvent) => { e.preventDefault(); if (contextMenu) setContextMenu(null); if (activeTool === 'hand' || e.button === 1 || e.buttons === 4 || isSpacePressed) { (document.activeElement as HTMLElement)?.blur(); setIsPanning(true); setDragStart({ x: e.clientX, y: e.clientY }); return; } if (e.target === containerRef.current || e.target === canvasLayerRef.current) { (document.activeElement as HTMLElement)?.blur(); setSelectedElementId(null); setSelectedElementIds([]); setEditingTextId(null); if (activeTool === 'select') { setIsMarqueeSelecting(true); setMarqueeStart({ x: e.clientX, y: e.clientY }); setMarqueeEnd({ x: e.clientX, y: e.clientY }); } else { setIsPanning(true); setDragStart({ x: e.clientX, y: e.clientY }); } setShowFontPicker(false); setShowModelPicker(false); setShowResPicker(false); setShowRatioPicker(false); } };

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
        e.stopPropagation();
        e.preventDefault();

        if (activeTool === 'mark' || e.ctrlKey || e.metaKey) {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            const newMarkerId = markers.length + 1;

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

                        const file = dataURLtoFile(crop, `marker-${newMarkerId}.png`);
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

                        setTimeout(() => {
                            insertInputFile(file);
                        }, 150);

                        // 异步识别裁剪区域内容，识别完成后更新 chip 名称
                        analyzeImageRegion(crop).then(name => {
                            const trimmed = name.trim().slice(0, 10);
                            if (trimmed && trimmed !== 'Could not analyze selection.' && trimmed !== 'Analysis failed.') {
                                (file as any).markerName = trimmed;
                                // 触发 inputBlocks 重新渲染
                                setInputBlocks(prev => [...prev]);
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

    const handleResizeStart = (e: React.MouseEvent, handle: string, elementId: string) => { e.stopPropagation(); e.preventDefault(); const el = elements.find(e => e.id === elementId); if (!el) return; setIsResizing(true); setResizeHandle(handle); setResizeStart({ x: e.clientX, y: e.clientY, width: el.width, height: el.height, left: el.x, top: el.y }); };
    const removeMarker = (id: number) => {
        const newMarkers = markers.filter(m => m.id !== id).map((m, i) => ({ ...m, id: i + 1 }));
        setMarkers(newMarkers);
        saveToHistory(elements, newMarkers);
        // 同步删除对应 chip，并重新编号剩余 chip 的 markerId
        setInputBlocks(prev => {
            const filtered = prev.filter(b => !(b.type === 'file' && b.file && (b.file as any).markerId === id));
            let idx = 1;
            filtered.forEach(b => {
                if (b.type === 'file' && b.file && (b.file as any).markerId) {
                    (b.file as any).markerId = idx++;
                }
            });
            return [...filtered];
        });
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



    const handleSend = async (textOverride?: string, attachmentsOverride?: File[], enableWebSearch: boolean = webEnabled, skillData?: { id: string; name: string; iconName: string }) => {
        // Construct message from blocks
        const derivedText = inputBlocks.filter(b => b.type === 'text').map(b => b.text).join(' ');
        const derivedFiles = inputBlocks.filter(b => b.type === 'file' && b.file).map(b => b.file!) as File[];

        const textToSend = textOverride !== undefined ? textOverride : derivedText;
        let filesToSend = attachmentsOverride !== undefined ? attachmentsOverride : derivedFiles;

        if ((!textToSend.trim() && filesToSend.length === 0 && markers.length === 0) || isTyping) return;

        // Auto-detect Skill Data for manually typed prompts to ensure they render as components
        let finalSkillData = skillData;
        if (!finalSkillData && creationMode === 'agent' && textToSend.trim()) {
            const routedAgent = localPreRoute(textToSend);
            switch (routedAgent) {
                case 'cameron': finalSkillData = { id: 'cameron', name: '分镜故事板', iconName: 'Film' }; break;
                case 'campaign': finalSkillData = { id: 'campaign', name: '营销与电商', iconName: 'Store' }; break;
                case 'poster': finalSkillData = { id: 'poster', name: '视觉海报', iconName: 'FileText' }; break;
                case 'vireo': finalSkillData = { id: 'vireo', name: '品牌视觉', iconName: 'Layout' }; break;
                case 'package': finalSkillData = { id: 'package', name: '包装设计', iconName: 'Box' }; break;
                case 'motion': finalSkillData = { id: 'motion', name: '动效流', iconName: 'Video' }; break;
                default:
                    // Only wrap as a generic tool if it's long enough or looks like a prompt, otherwise let it be a text message?
                    // Actually, treating everything as a task looks cleaner for the "Skill App" vision
                    finalSkillData = { id: 'general', name: '智能分析', iconName: 'Sparkles' };
                    break;
            }
        }

        // Agent mode handling
        if (agentMode && isAgentMode && textToSend.trim()) {
            let agentText = textToSend;
            let attachmentUrls: string[] = [];

            // filesToSend 已经包含了 inputBlocks 里的文件（含自动插入的画布选中图片）
            // 统计其中的图片文件数量
            const imageFiles = filesToSend.filter(f => f.type && f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                agentText += ` [已附带 ${imageFiles.length} 张参考图片，请基于这些产品图片来生成]`;
                // 收集 URL 用于聊天消息显示
                for (const f of imageFiles) {
                    try {
                        const base64 = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(f);
                        });
                        attachmentUrls.push(base64);
                    } catch (_) { /* ignore */ }
                }
            } else if (filesToSend.length === 0) {
                // 没有任何附件时，自动从画布上找图片元素作为产品参考
                const canvasImages = elements.filter(e => (e.type === 'image' || e.type === 'gen-image') && e.url);
                if (canvasImages.length > 0) {
                    const recentImages = canvasImages.slice(-3);
                    agentText += ` [画布上有 ${canvasImages.length} 张图片，已自动附带最近的 ${recentImages.length} 张作为产品参考]`;
                    for (const img of recentImages) {
                        try {
                            const resp = await fetch(img.url!);
                            const blob = await resp.blob();
                            const imgFile = new File([blob], `canvas-${img.id}.${blob.type.split('/')[1] || 'png'}`, { type: blob.type });
                            filesToSend.push(imgFile);

                            // Transform canvas url to base64 if it's not already
                            let base64Url = img.url!;
                            if (base64Url.startsWith('blob:')) {
                                base64Url = await new Promise<string>((resolve) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => resolve(reader.result as string);
                                    reader.readAsDataURL(blob);
                                });
                            }
                            attachmentUrls.push(base64Url);
                        } catch (_) { /* ignore */ }
                    }
                }
            }

            const newUserMsg: ChatMessage = {
                id: Date.now().toString(), role: 'user',
                text: textToSend,
                timestamp: Date.now(),
                attachments: attachmentUrls.length > 0 ? attachmentUrls : undefined,
                skillData: finalSkillData
            };
            setMessages(prev => [...prev, newUserMsg]);
            setInputBlocks([{ id: `text-${Date.now()}`, type: 'text', text: '' }]);
            setIsTyping(true);

            try {
                const agentResult = await processMessage(agentText, filesToSend, { enableWebSearch });

                // Collect generated image and video URLs from assets
                let generatedUrls: string[] = [];
                let generatedVideos: string[] = [];
                if (agentResult?.output?.assets && agentResult.output.assets.length > 0) {
                    for (const asset of agentResult.output.assets) {
                        if (asset.url) {
                            if (asset.type === 'video') generatedVideos.push(asset.url);
                            else generatedUrls.push(asset.url);
                        }
                    }
                }

                // Fallback: check proposals for generatedUrl
                if (generatedUrls.length === 0 && agentResult?.output?.proposals) {
                    for (const proposal of agentResult.output.proposals) {
                        if ((proposal as any).generatedUrl) {
                            generatedUrls.push((proposal as any).generatedUrl);
                        }
                        if ((proposal as any).generatedVideoUrl) {
                            generatedVideos.push((proposal as any).generatedVideoUrl);
                        }
                    }
                }

                // Place generated images on canvas
                if (generatedUrls.length > 0) {
                    const containerW = window.innerWidth - (showAssistant ? 480 : 0);
                    const containerH = window.innerHeight;

                    // If there are markers, place near the marker's source element
                    // Otherwise place at a fixed canvas position and pan to it
                    let targetCX: number;
                    let targetCY: number;

                    const markerEl = markers.length > 0
                        ? elements.find(e => e.id === markers[0].elementId)
                        : null;

                    if (markerEl) {
                        // Place to the right of the marker's source element
                        targetCX = markerEl.x + markerEl.width + 60;
                        targetCY = markerEl.y + markerEl.height / 2;
                    } else {
                        // Place at current viewport center
                        targetCX = (containerW / 2 - pan.x) / (zoom / 100);
                        targetCY = (containerH / 2 - pan.y) / (zoom / 100);
                    }

                    const imgSize = 512;
                    const gap = 24;
                    const totalW = generatedUrls.length * imgSize + (generatedUrls.length - 1) * gap;
                    const startX = targetCX - (markerEl ? 0 : totalW / 2);

                    const newEls: CanvasElement[] = generatedUrls.map((url, idx) => ({
                        id: `agent-gen-${Date.now()}-${idx}`,
                        type: 'image' as const,
                        url,
                        x: startX + idx * (imgSize + gap),
                        y: targetCY - imgSize / 2,
                        width: imgSize, height: imgSize,
                        zIndex: elements.length + 10 + idx
                    }));
                    setElements(prev => [...prev, ...newEls]);
                    if (newEls.length > 0) setSelectedElementId(newEls[0].id);
                    saveToHistory([...elements, ...newEls], markers);

                    // Auto-pan to center the new elements in viewport
                    const groupCenterX = startX + totalW / 2;
                    const groupCenterY = targetCY;
                    const newPanX = containerW / 2 - groupCenterX * (zoom / 100);
                    const newPanY = containerH / 2 - groupCenterY * (zoom / 100);
                    setPan({ x: newPanX, y: newPanY });
                }

                // Get all proposals info for display
                const allProposals = agentResult?.output?.proposals || [];
                const firstProposal = allProposals[0];
                const adjustments = agentResult?.output?.adjustments || ['调整构图', '更换风格', '修改配色', '添加文字', '放大画质'];
                const usedModel = (firstProposal as any)?.model || 'Nano Banana Pro';

                // Extract display message: prefer analysis (agent's reasoning), then message, then fallback
                const analysis = agentResult?.output?.analysis || '';
                const rawMsg = agentResult?.output?.message || '';
                // Use analysis as the main display text (Lovart shows agent's thinking process)
                // Fall back to message if analysis is empty, skip if it looks like raw JSON
                let displayMsg = analysis || rawMsg;
                if (displayMsg.startsWith('{') || displayMsg.startsWith('[')) {
                    displayMsg = generatedUrls.length > 1
                        ? `已为您生成 ${generatedUrls.length} 张设计方案`
                        : firstProposal ? `已为您生成「${(firstProposal as any).title || '设计方案'}」` : '已完成处理';
                }
                // Append proposal titles summary for multi-image sets
                if (allProposals.length > 1 && !displayMsg.includes('张')) {
                    displayMsg += `\n\n共 ${allProposals.length} 张图：` + allProposals.map((p: any, i: number) => `${i + 1}. ${p.title || '方案' + (i + 1)}`).join('、');
                }

                // Build structured agent message (Lovart style)
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'model',
                    text: displayMsg,
                    timestamp: Date.now(),
                    agentData: {
                        model: usedModel,
                        title: allProposals.length > 1
                            ? `${allProposals.length} 张设计方案`
                            : (firstProposal as any)?.title || undefined,
                        description: allProposals.length > 1
                            ? allProposals.map((p: any, i: number) => `${i + 1}. ${p.title}: ${p.description || ''}`).join('\n')
                            : (firstProposal as any)?.description || undefined,
                        imageUrls: generatedUrls.length > 0 ? generatedUrls : undefined,
                        videoUrls: generatedVideos.length > 0 ? generatedVideos : undefined,
                        adjustments,
                    }
                }]);
            } catch (error) {
                setMessages(prev => [...prev, { id: (Date.now() + 2).toString(), role: 'model', text: `Error: ${error instanceof Error ? error.message : 'Unknown'}`, timestamp: Date.now() }]);
            } finally {
                setIsTyping(false);
            }
            return;
        }

        let fullMessage = textToSend;

        // Attach selected element context if an element is selected on canvas
        const selectedEl = selectedElementId ? elements.find(e => e.id === selectedElementId) : null;
        if (selectedEl?.url) {
            fullMessage += ` [Editing selected ${selectedEl.type}: ${Math.round(selectedEl.width || 0)}×${Math.round(selectedEl.height || 0)}]`;
            // Convert selected element to file attachment so AI can see it
            try {
                const resp = await fetch(selectedEl.url);
                const blob = await resp.blob();
                const selFile = new File([blob], `selected-${selectedEl.type}.${blob.type.split('/')[1] || 'png'}`, { type: blob.type });
                filesToSend.push(selFile);
            } catch (e) {
                console.warn('Could not attach selected element image:', e);
            }
        }

        // Check if there are marker attachments and append context
        const markerFiles = filesToSend.filter(f => (f as any).markerId);
        if (markerFiles.length > 0) {
            fullMessage += ` [Analyzing ${markerFiles.length} marked regions]`;
        }

        // Append video configuration if in video mode
        if (creationMode === 'video') {
            fullMessage += ` [🎬 Video Config - Model: ${videoGenModel}, Mode: ${videoGenMode}, Ratio: ${videoGenRatio}, Dur: ${videoGenDuration}, Qual: ${videoGenQuality}]`;
            if (videoGenMode === 'startEnd') {
                if (videoStartFrame) filesToSend.push(videoStartFrame);
                if (videoEndFrame) filesToSend.push(videoEndFrame);
            } else {
                videoMultiRefs.forEach(f => filesToSend.push(f));
            }
            if (filesToSend.length) fullMessage += ` [Attached ${filesToSend.length} video reference frames]`;
        }

        let attachmentUrlsForNormalMode: string[] = [];
        for (const file of filesToSend) {
            try {
                if (file.type && file.type.startsWith('image/')) {
                    const base64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                    });
                    attachmentUrlsForNormalMode.push(base64);
                }
            } catch (e) { console.warn('Failed to parse normal mode image attachment to base64', e); }
        }

        const newUserMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            text: fullMessage + (filesToSend.length > 0 ? ` [${filesToSend.length} files attached]` : ''),
            timestamp: Date.now(),
            attachments: attachmentUrlsForNormalMode.length > 0 ? attachmentUrlsForNormalMode : undefined
        };
        setMessages(prev => [...prev, newUserMsg]);
        setInputBlocks([{ id: `text-${Date.now()}`, type: 'text', text: '' }]);
        setMarkers([]);

        // Reset Video UI state after send
        if (creationMode === 'video') {
            setVideoStartFrame(null);
            setVideoEndFrame(null);
            setVideoMultiRefs([]);
        }
        setIsTyping(true);
        if (chatSessionRef.current) {
            // Inject system instruction for formatting, hidden from user UI
            const systemInjection = `\n\n[SYSTEM NOTE: When providing visual design options, you MUST provide at least 3 distinct style variations. Output EACH option as a separate JSON block using this schema:\n\`\`\`json:generation\n{"title": "Style Name", "description": "Brief description", "prompt": "Detailed generation prompt"}\n\`\`\`\nDo not combine them. Output 3 separate blocks.]`;
            const responseText = await sendMessage(chatSessionRef.current, fullMessage + systemInjection, filesToSend, enableWebSearch);
            setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() }]);
        }
        setIsTyping(false);
    };

    const startNewChat = () => {
        setMessages([]);
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
                                    <div className="absolute bottom-full mb-2 left-0 w-52 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 z-[60] grid grid-cols-1 gap-1">
                                        <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Model</div>
                                        {['Nano Banana', 'Nano Banana Pro'].map(m => (
                                            <button key={m} onClick={() => { updateSelectedElement({ genModel: m as any }); setShowModelPicker(false); }} className={`text-left px-3 py-2.5 hover:bg-gray-50 rounded-lg text-xs font-medium flex items-center justify-between group transition ${el.genModel === m ? 'text-blue-600 bg-blue-50/50' : 'text-gray-700'}`}>
                                                {m}
                                                {el.genModel === m && <Check size={14} />}
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
        const adaptiveScale = Math.max(0.4, Math.min(2.0, zoom / 100));
        const flexibleScale = 1 + ((1 / adaptiveScale) - 1) * 0.6;
        const rightToolbarLeft = elX + el.width + (24 / adaptiveScale);
        const topToolbarTop = elY;
        const bottomButtonTop = elY + el.height + (16 / adaptiveScale);

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
                        className={`flex flex-col bg-white rounded-[16px] p-2 shadow-[0_4px_24px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100/80 items-stretch gap-0.5 transition-all duration-300 ease-out overflow-hidden ${toolbarExpanded ? 'w-[150px]' : 'w-[48px]'}`}
                        onMouseEnter={() => { toolbarExpandTimer.current = setTimeout(() => setToolbarExpanded(true), 800); }}
                        onMouseLeave={() => { if (toolbarExpandTimer.current) clearTimeout(toolbarExpandTimer.current); setToolbarExpanded(false); setUpscaleMenuOpen(false); }}
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
                            <button onClick={() => setUpscaleMenuOpen(!upscaleMenuOpen)} className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors ${toolbarExpanded ? '' : 'justify-center'}`}>
                                <div className="border-[1.5px] border-current rounded-[3px] w-4 h-4 flex items-center justify-center text-[8px] font-black tracking-tighter flex-shrink-0">HD</div>
                                {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">放大</span>}
                            </button>
                            {upscaleMenuOpen && (
                                <div className="absolute top-0 left-full ml-2 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 flex flex-col gap-0.5 w-32 overflow-hidden z-[70] animate-in slide-in-from-left-2">
                                    <button onClick={() => handleUpscaleSelect(2)} className="text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700 rounded-lg flex justify-between items-center group"><span>2x (2K)</span><span className="text-[10px] text-gray-400 group-hover:text-gray-600">Standard</span></button>
                                    <button onClick={() => handleUpscaleSelect(4)} className="text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700 rounded-lg font-medium flex justify-between items-center"><span>4x (4K)</span><Sparkles size={12} className="text-blue-500" /></button>
                                    <button onClick={() => handleUpscaleSelect(8)} className="text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700 rounded-lg font-medium flex justify-between items-center"><span>8x (Ultra)</span><span className="text-[10px] uppercase text-blue-500 border border-blue-200 bg-blue-50 px-1 rounded">Pro</span></button>
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
                            <div className="relative flex-shrink-0"><Box size={16} strokeWidth={2} /><span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full"></span></div>
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">多角度</span>}
                        </button>

                        {/* 扩展 */}
                        <button className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <Expand size={16} strokeWidth={2} className="flex-shrink-0" />
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">扩展</span>}
                        </button>

                        {/* 调整 */}
                        <button className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors relative ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <div className="relative flex-shrink-0"><MonitorUp size={16} strokeWidth={2} className="rotate-90" /><span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full"></span></div>
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">调整</span>}
                        </button>

                        {/* 裁剪 */}
                        <button className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <Crop size={16} strokeWidth={2} className="flex-shrink-0" />
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">裁剪</span>}
                        </button>

                        {/* 矢量 */}
                        <button className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded-[10px] transition-colors relative ${toolbarExpanded ? '' : 'justify-center'}`}>
                            <div className="relative flex-shrink-0"><Scaling size={16} strokeWidth={2} /><span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full"></span></div>
                            {toolbarExpanded && <span className="text-[13px] whitespace-nowrap">矢量</span>}
                        </button>

                        {/* divider */}
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
                                    <div className="p-2 space-y-0.5">
                                        {elements.length === 0 ? (
                                            <div className="py-16 text-center text-xs text-gray-400">暂无图层</div>
                                        ) : (
                                            [...elements].reverse().map(el => (
                                                <div key={el.id} onClick={(e) => handleElementMouseDown(e, el.id)} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition ${selectedElementId === el.id ? 'bg-blue-50 border border-blue-100' : 'hover:bg-gray-50 border border-transparent'}`}>
                                                    <div className="w-8 h-8 bg-gray-50 rounded-md border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                        {el.type === 'text' && <span className="font-serif text-gray-500 text-sm">T</span>}
                                                        {el.type === 'image' && <img src={el.url} className="w-full h-full object-cover" />}
                                                        {(el.type === 'video' || el.type === 'gen-video') && <Video size={14} className="text-gray-500" />}
                                                        {el.type === 'shape' && <Box size={14} className="text-gray-500" />}
                                                        {el.type === 'gen-image' && <ImagePlus size={14} className="text-blue-500" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="truncate text-gray-700 font-medium text-xs">{el.type === 'text' ? (el.text || 'Text') : (el.type === 'gen-image' ? 'Image Gen' : (el.type === 'gen-video' ? 'Video Gen' : (el.type === 'image' ? `Image` : (el.type === 'shape' ? `${el.shapeType || 'Shape'}` : 'Element'))))}</div>
                                                        <div className="truncate text-gray-400 text-[10px]">{el.type === 'text' ? 'Text' : (el.type === 'gen-image' ? 'AI' : (el.type === 'gen-video' ? 'AI Video' : 'Graphic'))}</div>
                                                    </div>
                                                </div>
                                            ))
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
                                            return [...imgs, ...vids];
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
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showAssistant && (
                    <motion.div
                        initial={{ x: 400, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 400, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="absolute top-0 right-0 w-[480px] h-full bg-[#f8f9fc] border-l border-gray-200 shadow-[-10px_0_30px_rgba(0,0,0,0.03)] z-40 flex flex-col overflow-hidden"
                    >
                        {/* Header with Toolbar - Lovart Style */}
                        <div className="px-3 py-2.5 flex items-center justify-between border-b border-gray-100 z-20 shrink-0 select-none">
                            <span className="text-sm font-semibold text-gray-900 pl-1">新对话</span>
                            <div className="flex items-center gap-0.5">
                                <button
                                    className="h-7 px-2.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 flex items-center justify-center rounded-lg transition-all"
                                    onClick={() => { setActiveConversationId(''); setMessages([]); setPrompt(''); setCreationMode('agent'); }}
                                >
                                    <CirclePlus size={15} strokeWidth={1.5} className="mr-1" />
                                    新对话
                                </button>

                                <div className="relative">
                                    <button
                                        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all history-popover-trigger"
                                        onClick={(e) => { e.stopPropagation(); setShowHistoryPopover(!showHistoryPopover); }}
                                    >
                                        <Clock size={15} strokeWidth={1.8} />
                                    </button>

                                    {showHistoryPopover && (
                                        <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-[60] animate-in fade-in zoom-in-95 duration-200 history-popover-content text-left">
                                            <div className="flex items-center justify-between mb-3 px-1">
                                                <h3 className="font-medium text-sm text-gray-900">历史对话</h3>
                                                <div className="relative">
                                                    <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="搜索对话..."
                                                        value={historySearch}
                                                        onChange={e => setHistorySearch(e.target.value)}
                                                        className="w-32 h-7 pl-7 pr-2 text-xs bg-gray-50 border border-transparent rounded-md focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-400"
                                                    />
                                                </div>
                                            </div>

                                            <button
                                                className="w-full flex items-center justify-center h-8 text-xs mb-3 border border-dashed rounded-md hover:bg-gray-50 transition-colors"
                                                onClick={() => { setActiveConversationId(''); setMessages([]); setShowHistoryPopover(false); }}
                                            >
                                                <CirclePlus size={14} strokeWidth={1.5} className="mr-1" />
                                                新对话
                                            </button>

                                            <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1 -mr-1 custom-scrollbar">
                                                {conversations
                                                    .filter(c => !historySearch || c.title.toLowerCase().includes(historySearch.toLowerCase()))
                                                    .sort((a, b) => b.updatedAt - a.updatedAt)
                                                    .map(conversation => (
                                                        <div
                                                            key={conversation.id}
                                                            className={`p-2 rounded-lg cursor-pointer transition flex items-center gap-2 ${activeConversationId === conversation.id ? 'bg-blue-50 border border-blue-100' : 'hover:bg-gray-50'}`}
                                                            onClick={() => {
                                                                if (activeConversationId === conversation.id) return;
                                                                setActiveConversationId(conversation.id);
                                                                setMessages(conversation.messages);
                                                                setShowHistoryPopover(false);
                                                            }}
                                                        >
                                                            <MessageSquare size={13} className="text-gray-400 flex-shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-xs font-medium text-gray-700 truncate">{conversation.title}</div>
                                                                <div className="text-[10px] text-gray-400 mt-0.5">{new Date(conversation.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                                                            </div>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const updated = conversations.filter(c => c.id !== conversation.id);
                                                                    setConversations(updated);
                                                                    if (activeConversationId === conversation.id) { setActiveConversationId(''); setMessages([]); }
                                                                }}
                                                                className="text-gray-300 hover:text-red-400 transition flex-shrink-0"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                {conversations.length === 0 && (
                                                    <div className="text-center text-xs text-gray-400 py-6">暂无历史对话</div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* 3. Share */}
                                <button className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all" title="Share">
                                    <Share2 size={15} strokeWidth={1.5} />
                                </button>

                                {/* 4. File List Popover */}
                                <div className="relative">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowFileListModal(!showFileListModal); }}
                                        className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${showFileListModal ? 'text-gray-700 bg-gray-100' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
                                        title="Files"
                                    >
                                        <FileIcon size={15} strokeWidth={1.5} />
                                    </button>
                                    {/* Popover Content (Inline) */}
                                    {showFileListModal && (
                                        <div className="absolute top-full right-0 mt-2 w-[320px] bg-white rounded-xl shadow-xl border border-gray-200 z-50 animate-in fade-in zoom-in-95 duration-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                            <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 bg-gray-50/50">
                                                <h3 className="font-bold text-gray-900 text-sm">已生成文件列表</h3>
                                                <span className="text-[10px] text-gray-400">{messages.flatMap(m => m.agentData?.imageUrls || []).length} 个文件</span>
                                            </div>
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
                                                    return [...imgs, ...vids];
                                                });
                                                if (allFiles.length === 0) {
                                                    return (
                                                        <div className="h-[250px] flex flex-col items-center justify-center text-gray-400 gap-2">
                                                            <ImageIcon size={28} className="opacity-20" />
                                                            <span className="text-xs text-gray-400">暂无生成文件</span>
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <div className="max-h-[350px] overflow-y-auto no-scrollbar p-2 space-y-1">
                                                        {allFiles.reverse().map((file, i) => (
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
                                                                    <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                                                                        <span>{file.model}</span>
                                                                        <span>·</span>
                                                                        <span>{new Date(file.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                                                                    </div>
                                                                </div>
                                                                <a href={file.url} download={`${file.title}.${file.type === 'image' ? 'png' : 'mp4'}`} onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-700 transition">
                                                                    <Download size={14} />
                                                                </a>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>

                                {/* Divider */}
                                <div className="w-px h-3.5 bg-gray-200 mx-1 opacity-50"></div>

                                {/* 5. Collapse */}
                                <button onClick={() => setShowAssistant(false)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all" title="Collapse">
                                    <PanelRightClose size={15} strokeWidth={1.5} />
                                </button>

                                {/* File List Modal (Global/Portal style but inline for now within this relative container context, usually would be portal but sticking to simple z-index overlay here) */}

                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-5 no-scrollbar relative">
                            {messages.length === 0 ? (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                                    {/* XcAI Studio Logo */}
                                    <div className="flex items-center gap-2.5 mb-6">
                                        <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white font-bold text-[10px] tracking-wide shadow-sm">XC</div>
                                        <span className="font-bold text-base text-gray-900 tracking-tight">XcAI Studio</span>
                                    </div>

                                    <h3 className="text-xl font-bold text-gray-900 leading-tight mb-2">试试这些 XcAI Skills</h3>
                                    <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                                        点击下方技能，即刻开始专业创作
                                    </p>

                                    {/* Skills Pills - Lovart Style */}
                                    <div className="flex flex-wrap gap-2.5">
                                        <button
                                            onClick={() => handleSend("请帮我生成一套亚马逊产品Listing图，包含：白底主图、信息图（卖点标注）、场景图（生活方式）、细节特写图、尺寸对比图。每张图使用1:1比例，2000x2000px，专业电商摄影风格。请根据画布上的产品来生成。", undefined, webEnabled, { id: 'amazon-listing', name: '亚马逊产品套图', iconName: 'Store' })}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:border-gray-400 hover:text-gray-900 hover:shadow-sm transition-all cursor-pointer"
                                        >
                                            <Store size={15} strokeWidth={1.8} />
                                            <span>亚马逊产品套图</span>
                                        </button>
                                        <button
                                            onClick={() => handleSend("请帮我设计一套品牌Logo视觉系统，包含：主Logo设计（纯白背景，居中构图）、品牌色彩应用展示、Logo在不同场景的应用效果（名片、信封、网站）。使用1:1比例，PNG透明格式，现代简约风格。", undefined, webEnabled, { id: 'logo-design', name: 'Logo 与品牌', iconName: 'Layout' })}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:border-gray-400 hover:text-gray-900 hover:shadow-sm transition-all cursor-pointer"
                                        >
                                            <Layout size={15} strokeWidth={1.8} />
                                            <span>Logo 与品牌</span>
                                        </button>
                                        <button
                                            onClick={() => handleSend("请帮我生成一套社交媒体视觉素材，包含：Instagram方形帖子（1:1）、Story/Reel竖版封面（9:16）、横版Banner（16:9）。风格统一，色调一致，适合品牌社交媒体运营。请根据画布上的内容来设计。", undefined, webEnabled, { id: 'social-media', name: '社交媒体', iconName: 'Globe' })}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:border-gray-400 hover:text-gray-900 hover:shadow-sm transition-all cursor-pointer"
                                        >
                                            <Globe size={15} strokeWidth={1.8} />
                                            <span>社交媒体</span>
                                        </button>
                                        <button
                                            onClick={() => handleSend("请帮我设计一套营销宣传册页面，包含：封面（产品Key Visual，高端商业摄影风格）、产品特性页（信息图表风格）、场景应用页（生活方式摄影）、品牌故事页。使用3:4竖版比例，专业出版印刷质量。", undefined, webEnabled, { id: 'brochure', name: '营销宣传册', iconName: 'FileText' })}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:border-gray-400 hover:text-gray-900 hover:shadow-sm transition-all cursor-pointer"
                                        >
                                            <FileText size={15} strokeWidth={1.8} />
                                            <span>营销宣传册</span>
                                        </button>
                                        <button
                                            onClick={() => handleSend("请帮我制作产品九宫格分镜图", undefined, webEnabled, { id: 'cameron', name: '分镜故事板', iconName: 'Film' })}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:border-gray-400 hover:text-gray-900 hover:shadow-sm transition-all cursor-pointer"
                                        >
                                            <Film size={15} strokeWidth={1.8} />
                                            <span>分镜故事板</span>
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="space-y-4 pb-4">
                                    {messages.map(msg => (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            key={msg.id}
                                            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            {msg.role === 'user' ? (
                                                msg.skillData ? (
                                                    <div className="max-w-[85%] rounded-[20px] rounded-tr-sm px-3 py-2 text-[13px] bg-gray-100 text-gray-800 flex flex-col gap-2 relative overflow-hidden group transition">
                                                        <div className="flex items-center gap-2">
                                                            {msg.skillData.iconName === 'Store' && <Store size={15} className="text-gray-500" strokeWidth={2} />}
                                                            {msg.skillData.iconName === 'Layout' && <Layout size={15} className="text-gray-500" strokeWidth={2} />}
                                                            {msg.skillData.iconName === 'Globe' && <Globe size={15} className="text-gray-500" strokeWidth={2} />}
                                                            {msg.skillData.iconName === 'FileText' && <FileText size={15} className="text-gray-500" strokeWidth={2} />}
                                                            {msg.skillData.iconName === 'Film' && <Film size={15} className="text-gray-500" strokeWidth={2} />}
                                                            {msg.skillData.iconName === 'Box' && <Box size={15} className="text-gray-500" strokeWidth={2} />}
                                                            {msg.skillData.iconName === 'Video' && <Video size={15} className="text-gray-500" strokeWidth={2} />}
                                                            {msg.skillData.iconName === 'Sparkles' && <Sparkles size={15} className="text-gray-500" strokeWidth={2} />}
                                                            <span className="font-semibold">{msg.skillData.name}</span>
                                                        </div>
                                                        {/* Preview context */}
                                                        {msg.attachments && msg.attachments.length > 0 && (
                                                            <div className={`grid gap-1.5 ${msg.attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                                                {msg.attachments.map((att, i) => (
                                                                    <img key={i} src={att} className="rounded-lg border border-gray-100 object-cover object-center w-full max-h-20" />
                                                                ))}
                                                            </div>
                                                        )}
                                                        <div className="text-xs text-gray-500 bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis max-w-full" title={msg.text}>
                                                            {msg.text}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="max-w-[85%] rounded-2xl rounded-tr-none px-4 py-3 text-sm shadow-sm bg-blue-600 text-white">
                                                        <div className="whitespace-pre-wrap">{msg.text}</div>
                                                        {msg.attachments && msg.attachments.length > 0 && (
                                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                                {msg.attachments.map((att, i) => (
                                                                    <img key={i} src={att} className="rounded-lg border border-white/20" />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            ) : msg.agentData ? (
                                                /* Lovart-style agent response card */
                                                <div className="w-full max-w-[95%]">
                                                    {/* Message text (short summary, not full analysis) */}
                                                    <div className="text-[13px] text-gray-700 mb-2 leading-relaxed whitespace-pre-wrap">
                                                        {msg.text}
                                                    </div>

                                                    {/* Model badge + Title row */}
                                                    {(msg.agentData.model || msg.agentData.title) && (
                                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                            {msg.agentData.model && (
                                                                <div className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-100/80 rounded-full px-2 py-0.5">
                                                                    <div className="w-3 h-3 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full" />
                                                                    <span className="text-[11px] font-medium text-gray-600">{msg.agentData.model}</span>
                                                                </div>
                                                            )}
                                                            {msg.agentData.title && (
                                                                <span className="text-[13px] font-semibold text-gray-900">{msg.agentData.title}</span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Generated images - grid for multiple */}
                                                    {msg.agentData.imageUrls && msg.agentData.imageUrls.length > 0 && (
                                                        <div className={`mb-2 ${msg.agentData.imageUrls.length === 1 ? '' : msg.agentData.imageUrls.length <= 4 ? 'grid grid-cols-2 gap-1.5' : 'grid grid-cols-3 gap-1'}`}>
                                                            {msg.agentData.imageUrls.map((url, i) => (
                                                                <img
                                                                    key={i}
                                                                    src={url}
                                                                    className="w-full rounded-xl border border-gray-200 cursor-pointer hover:opacity-90 transition object-cover"
                                                                    onClick={() => setPreviewUrl(url)}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Description */}
                                                    {msg.agentData.description && (
                                                        <p className="text-[12px] text-gray-500 mb-2 leading-relaxed">{msg.agentData.description}</p>
                                                    )}

                                                    {/* Adjustment buttons */}
                                                    {msg.agentData.adjustments && msg.agentData.adjustments.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5 mb-2">
                                                            {msg.agentData.adjustments.map((adj, i) => (
                                                                <button
                                                                    key={i}
                                                                    onClick={() => handleSend(adj)}
                                                                    className="px-2.5 py-1 text-[11px] font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-full transition hover:text-gray-900 shadow-sm"
                                                                >
                                                                    {adj}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Feedback buttons */}
                                                    <div className="flex items-center gap-2 pt-1">
                                                        <button className="p-1.5 text-gray-300 hover:text-gray-600 transition rounded-lg hover:bg-gray-50">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                                                        </button>
                                                        <button className="p-1.5 text-gray-300 hover:text-gray-600 transition rounded-lg hover:bg-gray-50">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" /></svg>
                                                        </button>
                                                        <button
                                                            onClick={() => navigator.clipboard.writeText(msg.text)}
                                                            className="p-1.5 text-gray-300 hover:text-gray-600 transition rounded-lg hover:bg-gray-50"
                                                        >
                                                            <Copy size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Regular model message */
                                                <div className="max-w-[85%] rounded-2xl rounded-tl-none px-4 py-3 text-sm shadow-sm bg-white border border-gray-100 text-gray-800">
                                                    <SmartMessageRenderer text={msg.text} onGenerate={handleSmartGenerate} onAction={(action) => handleSend(action)} />
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                    {isTyping && (
                                        <div className="flex justify-start">
                                            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Agent Task Progress */}
                                    {currentTask && (currentTask.status === 'analyzing' || currentTask.status === 'executing') && (
                                        <TaskProgress task={currentTask} />
                                    )}

                                    <div ref={messagesEndRef} />
                                </div>
                            )}
                        </div>



                        <div className="px-3 pb-3 pt-1 z-20">
                            <div
                                className={`bg-white rounded-2xl border shadow-sm transition-all duration-200 relative group focus-within:shadow-md focus-within:border-gray-300 flex flex-col ${isDragOver ? 'border-blue-400 ring-2 ring-blue-100 bg-blue-50/30' : 'border-gray-200'}`}
                                onMouseEnter={() => setIsVideoPanelHovered(true)}
                                onMouseLeave={() => setIsVideoPanelHovered(false)}
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsDragOver(false);
                                    if (e.dataTransfer.files.length > 0) {
                                        Array.from(e.dataTransfer.files).forEach(f => {
                                            if (f.type.startsWith('image/') || f.type.startsWith('video/')) {
                                                insertInputFile(f);
                                            }
                                        });
                                    }
                                }}
                            >
                                {/* Drag overlay */}
                                {isDragOver && (
                                    <div className="absolute inset-0 z-30 rounded-[20px] bg-blue-50/80 border-2 border-dashed border-blue-400 flex items-center justify-center pointer-events-none">
                                        <div className="flex flex-col items-center gap-2">
                                            <ImageIcon size={24} className="text-blue-500" />
                                            <span className="text-sm font-medium text-blue-600">将文件拖拽至此处添加到对话</span>
                                        </div>
                                    </div>
                                )}

                                {/* Image Mode: Upload Area */}
                                {creationMode === 'image' && (
                                    <div className={`transition-all duration-300 overflow-hidden px-4 flex flex-col justify-end`} style={{ maxHeight: isVideoPanelHovered ? '80px' : '0px', opacity: isVideoPanelHovered ? 1 : 0, paddingTop: isVideoPanelHovered ? '16px' : '0px', paddingBottom: isVideoPanelHovered ? '8px' : '0px' }}>
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-14 h-14 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition group/upload"
                                        >
                                            <Plus size={16} className="text-gray-400 group-hover/upload:text-blue-500 transition" />
                                            <span className="text-[10px] text-gray-400 group-hover/upload:text-blue-500 mt-0.5">图片</span>
                                        </div>
                                    </div>
                                )}

                                {/* Video Mode: Hover Expandable Frame Upload Area */}
                                {creationMode === 'video' && (
                                    <div
                                        className="px-4 transition-all duration-300 overflow-hidden flex flex-col justify-end"
                                        style={{
                                            maxHeight: (isVideoPanelHovered || videoStartFrame || videoEndFrame || videoMultiRefs.length > 0) ? '100px' : '0px',
                                            opacity: (isVideoPanelHovered || videoStartFrame || videoEndFrame || videoMultiRefs.length > 0) ? 1 : 0,
                                            paddingTop: (isVideoPanelHovered || videoStartFrame || videoEndFrame || videoMultiRefs.length > 0) ? '16px' : '0px',
                                            paddingBottom: (isVideoPanelHovered || videoStartFrame || videoEndFrame || videoMultiRefs.length > 0) ? '8px' : '0px',
                                        }}
                                    >
                                        {videoGenMode === 'startEnd' ? (
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <label className={`w-14 h-14 border rounded-xl flex flex-col items-center justify-center cursor-pointer transition overflow-hidden group/upload ${videoStartFrame ? 'border-gray-200 border-solid shadow-sm' : 'border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'}`}>
                                                        <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files) setVideoStartFrame(e.target.files[0]); }} />
                                                        {videoStartFrame ? (
                                                            <img src={URL.createObjectURL(videoStartFrame)} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <>
                                                                <Plus size={16} className="text-gray-400 group-hover/upload:text-blue-500 transition" />
                                                                <span className="text-[10px] text-gray-400 group-hover/upload:text-blue-500 mt-0.5">首帧</span>
                                                            </>
                                                        )}
                                                    </label>
                                                    {videoStartFrame && (
                                                        <button onClick={(e) => { e.preventDefault(); setVideoStartFrame(null); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-600 hover:bg-gray-800 text-white rounded-full flex items-center justify-center z-10 shadow border border-white">
                                                            <X size={10} />
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="relative">
                                                    <label className={`w-14 h-14 border rounded-xl flex flex-col items-center justify-center cursor-pointer transition overflow-hidden group/upload ${videoEndFrame ? 'border-gray-200 border-solid shadow-sm' : 'border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'}`}>
                                                        <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files) setVideoEndFrame(e.target.files[0]); }} />
                                                        {videoEndFrame ? (
                                                            <img src={URL.createObjectURL(videoEndFrame)} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <>
                                                                <Plus size={16} className="text-gray-400 group-hover/upload:text-blue-500 transition" />
                                                                <span className="text-[10px] text-gray-400 group-hover/upload:text-blue-500 mt-0.5">尾帧</span>
                                                            </>
                                                        )}
                                                    </label>
                                                    {videoEndFrame && (
                                                        <button onClick={(e) => { e.preventDefault(); setVideoEndFrame(null); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-600 hover:bg-gray-800 text-white rounded-full flex items-center justify-center z-10 shadow border border-white">
                                                            <X size={10} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 overflow-x-auto scroller-hidden">
                                                {videoMultiRefs.map((file, idx) => (
                                                    <div key={idx} className="relative flex-shrink-0">
                                                        <div className="w-14 h-14 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                                            <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                                        </div>
                                                        <button onClick={() => setVideoMultiRefs(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-600 hover:bg-gray-800 text-white rounded-full flex items-center justify-center z-10 shadow border border-white">
                                                            <X size={10} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <label className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition flex-shrink-0 group">
                                                    <input type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) setVideoMultiRefs(prev => [...prev, ...Array.from(e.target.files!)]); }} />
                                                    <Plus size={16} className="group-hover:text-blue-500 transition" />
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Text Input Area - Lovart style: inline mixed chips + text */}
                                <div className={`px-4 pt-3 pb-6 cursor-text transition-all`} onClick={(e) => {
                                    // 仅在点击空白区域时聚焦最后的文本框（不干扰 chip 点击）
                                    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.input-flow-container') === e.currentTarget.querySelector('.input-flow-container')) {
                                        const lastText = inputBlocks.filter(b => b.type === 'text').pop();
                                        const targetId = lastText?.id || inputBlocks[inputBlocks.length - 1].id;
                                        const el = document.getElementById(`input-block-${targetId}`);
                                        el?.focus();
                                    }
                                }}>
                                    {/* Inline flow: chips and text in a single line */}
                                    <div className="input-flow-container flex flex-wrap items-center gap-1.5" style={{ minHeight: '28px', wordBreak: 'break-word', lineHeight: '28px' }}>
                                        {inputBlocks.map((block, blockIndex) => {
                                            if (block.type === 'file' && block.file) {
                                                const file = block.file!;
                                                const markerId = (file as any).markerId;
                                                const isSelected = selectedChipId === block.id;
                                                const isHovered = hoveredChipId === block.id;
                                                const markerInfo = (file as any).markerInfo as {
                                                    fullImageUrl?: string;
                                                    x?: number;
                                                    y?: number;
                                                    width?: number;
                                                    height?: number;
                                                    imageWidth?: number;
                                                    imageHeight?: number;
                                                } | undefined;

                                                if (markerId) {
                                                    return (
                                                        <motion.div
                                                            key={block.id}
                                                            id={`marker-chip-${block.id}`}
                                                            initial={{ scale: 0, opacity: 0 }}
                                                            animate={{ scale: 1, opacity: 1 }}
                                                            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                                                            className={`inline-flex items-center gap-1.5 rounded-lg pl-1 pr-2 cursor-default relative group select-none h-7 transition-all border ${isSelected
                                                                ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-500'
                                                                : 'bg-white border-gray-200 hover:bg-gray-50'
                                                                }`}
                                                            onClick={(e) => { e.stopPropagation(); setSelectedChipId(isSelected ? null : block.id); }}
                                                            onMouseEnter={() => setHoveredChipId(block.id)}
                                                            onMouseLeave={() => setHoveredChipId(null)}
                                                        >
                                                            <div className="flex items-center">
                                                                <div className="w-[22px] h-[22px] rounded-[4px] overflow-hidden border border-gray-200 flex-shrink-0">
                                                                    <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                                                </div>
                                                                <div className="w-[14px] h-[14px] bg-[#3B82F6] rounded-full flex items-center justify-center text-white text-[7px] font-bold shadow-sm flex-shrink-0 border border-white -ml-2 z-10">
                                                                    {markerId}
                                                                </div>
                                                            </div>
                                                            <span className="text-[12px] text-gray-700 font-medium max-w-[80px] truncate ml-0.5">{(file as any).markerName || '区域'}</span>
                                                            <ChevronDown size={14} className="text-gray-400" />
                                                            <button onClick={(e) => { e.stopPropagation(); removeInputBlock(block.id); setSelectedChipId(null); }} className="absolute -top-1.5 -right-1.5 bg-gray-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition shadow-sm z-20 hover:bg-gray-700"><X size={8} /></button>

                                                            {/* Hover Preview Tooltip */}
                                                            {isHovered && markerInfo && (() => {
                                                                const chipEl = document.getElementById(`marker-chip-${block.id}`);
                                                                const chipRect = chipEl?.getBoundingClientRect();
                                                                const tooltipW = 160;
                                                                const tooltipH = 160;
                                                                const ttLeft = chipRect ? chipRect.left + chipRect.width / 2 - tooltipW / 2 : 0;
                                                                const ttTop = chipRect ? chipRect.top - tooltipH - 12 : 0;

                                                                const ox = markerInfo.x !== undefined && markerInfo.imageWidth ? ((markerInfo.x + markerInfo.width! / 2) / markerInfo.imageWidth) * 100 : 50;
                                                                const oy = markerInfo.y !== undefined && markerInfo.imageHeight ? ((markerInfo.y! + markerInfo.height! / 2) / markerInfo.imageHeight!) * 100 : 50;
                                                                const zoomOrigin = `${ox}% ${oy}%`;
                                                                const zoomTransition = { duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] as const, delay: 0.1 };
                                                                const imgSrc = markerInfo.fullImageUrl || URL.createObjectURL(file);

                                                                return ReactDOM.createPortal(
                                                                    <div className="fixed z-[9999] pointer-events-none" style={{ left: ttLeft, top: ttTop, width: tooltipW, height: tooltipH }}>
                                                                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.2 }} className="w-full h-full bg-white rounded-2xl shadow-xl overflow-hidden relative border border-gray-200">
                                                                            <motion.div className="absolute inset-0" initial={{ scale: 1 }} animate={{ scale: 2.5 }} transition={zoomTransition} style={{ transformOrigin: zoomOrigin }}>
                                                                                <img src={imgSrc} className="w-full h-full object-cover" />
                                                                            </motion.div>
                                                                            {markerInfo.x !== undefined && markerInfo.imageWidth && (
                                                                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.7 }} className="absolute inset-0 pointer-events-none">
                                                                                    <motion.div initial={{ scale: 1 }} animate={{ scale: 2.5 }} transition={zoomTransition} className="absolute inset-0" style={{ transformOrigin: zoomOrigin }}>
                                                                                        <div className="absolute flex flex-col items-center" style={{ left: `${ox}%`, top: `${oy}%`, transform: 'translate(-50%, -50%)' }}>
                                                                                            <div className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] border border-white shadow-sm flex items-center justify-center text-white font-bold text-[5px] relative z-10 text-center">
                                                                                                {markerId}
                                                                                            </div>
                                                                                        </div>
                                                                                    </motion.div>
                                                                                </motion.div>
                                                                            )}
                                                                        </motion.div>
                                                                    </div>,
                                                                    document.body
                                                                );
                                                            })()}
                                                        </motion.div>
                                                    );
                                                } else {
                                                    // Regular file chip
                                                    const isCanvasAuto = (file as any)._canvasAutoInsert;
                                                    const chipLabel = isCanvasAuto
                                                        ? `图片${inputBlocks.filter(b => b.type === 'file' && (b.file as any)?._canvasAutoInsert).indexOf(block) + 1}`
                                                        : file.name.replace(/\.[^/.]+$/, '');
                                                    return (
                                                        <div
                                                            key={block.id}
                                                            className={`inline-flex items-center gap-1 rounded-lg pl-1 pr-1.5 select-none relative group h-7 cursor-default transition-all border shrink-0 ${isSelected
                                                                ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-500'
                                                                : isInputFocused ? 'bg-gray-100 border-gray-200' : 'bg-gray-50 border-gray-100'
                                                                }`}
                                                            onClick={(e) => { e.stopPropagation(); setSelectedChipId(isSelected ? null : block.id); }}
                                                        >
                                                            <div className="w-5 h-5 rounded-sm overflow-hidden flex-shrink-0">
                                                                {file.type.startsWith('image/') ? <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" /> : <FileText size={12} className="text-gray-500" />}
                                                            </div>
                                                            <span className="text-[11px] text-gray-600 font-medium max-w-[100px] truncate">{chipLabel}</span>
                                                            <button onClick={(e) => { e.stopPropagation(); removeInputBlock(block.id); setSelectedChipId(null); }} className="w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/10 transition opacity-0 group-hover:opacity-100"><X size={10} /></button>
                                                        </div>
                                                    );
                                                }
                                            }

                                            if (block.type === 'text') {
                                                const textBlocks = inputBlocks.filter(b => b.type === 'text');
                                                const isLastTextBlock = textBlocks[textBlocks.length - 1]?.id === block.id;
                                                const placeholder = isLastTextBlock && textBlocks.length <= 1 ? (
                                                    creationMode === 'agent' ? "请输入你的设计需求" :
                                                        creationMode === 'image' ? "今天我们要创作什么" :
                                                            "今天我们要创作什么"
                                                ) : "";

                                                return (
                                                    <span
                                                        key={block.id}
                                                        id={`input-block-${block.id}`}
                                                        contentEditable
                                                        suppressContentEditableWarning
                                                        className="ce-placeholder outline-none text-sm text-gray-800 inline"
                                                        data-placeholder={placeholder}
                                                        style={{
                                                            display: 'block',
                                                            lineHeight: '28px',
                                                            whiteSpace: 'pre-wrap',
                                                            wordBreak: 'break-word',
                                                            caretColor: '#111827',
                                                            minWidth: '2px',
                                                            flex: isLastTextBlock ? '1 1 auto' : '0 1 auto',
                                                        }}
                                                        ref={el => {
                                                            if (el) {
                                                                if (document.activeElement !== el && el.textContent !== (block.text || '')) {
                                                                    el.textContent = block.text || '';
                                                                }
                                                            }
                                                        }}
                                                        onInput={(e) => {
                                                            const text = e.currentTarget.textContent || '';
                                                            setInputBlocks(prev => prev.map(b => b.id === block.id ? { ...b, text } : b));
                                                        }}
                                                        onFocus={() => { setActiveBlockId(block.id); setIsInputFocused(true); }}
                                                        onBlur={() => setIsInputFocused(false)}
                                                        onSelect={() => {
                                                            const el = document.getElementById(`input-block-${block.id}`);
                                                            if (el) setSelectionIndex(getCECursorPos(el));
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                                e.preventDefault();
                                                                handleSend();
                                                                return;
                                                            }

                                                            const thisIdx = inputBlocks.findIndex(b => b.id === block.id);

                                                            // === When a chip is currently selected ===
                                                            if (selectedChipId) {
                                                                const chipIdx = inputBlocks.findIndex(b => b.id === selectedChipId);
                                                                if (e.key === 'ArrowLeft') {
                                                                    e.preventDefault();
                                                                    // Move to the text block BEFORE the selected chip
                                                                    if (chipIdx > 0) {
                                                                        const prevBlock = inputBlocks[chipIdx - 1];
                                                                        if (prevBlock.type === 'text') {
                                                                            setSelectedChipId(null);
                                                                            setActiveBlockId(prevBlock.id);
                                                                            // Defer focus to after React re-render
                                                                            setTimeout(() => {
                                                                                const el = document.getElementById(`input-block-${prevBlock.id}`);
                                                                                if (el) {
                                                                                    el.focus();
                                                                                    setCECursorPos(el, (prevBlock.text || '').length);
                                                                                }
                                                                            }, 0);
                                                                        } else if (prevBlock.type === 'file') {
                                                                            setSelectedChipId(prevBlock.id);
                                                                        }
                                                                    } else {
                                                                        setSelectedChipId(null);
                                                                    }
                                                                    return;
                                                                }
                                                                if (e.key === 'ArrowRight') {
                                                                    e.preventDefault();
                                                                    // Move to the text block AFTER the selected chip
                                                                    if (chipIdx < inputBlocks.length - 1) {
                                                                        const nextBlock = inputBlocks[chipIdx + 1];
                                                                        if (nextBlock.type === 'text') {
                                                                            setSelectedChipId(null);
                                                                            setActiveBlockId(nextBlock.id);
                                                                            setTimeout(() => {
                                                                                const el = document.getElementById(`input-block-${nextBlock.id}`);
                                                                                if (el) {
                                                                                    el.focus();
                                                                                    setCECursorPos(el, 0);
                                                                                }
                                                                            }, 0);
                                                                        } else if (nextBlock.type === 'file') {
                                                                            setSelectedChipId(nextBlock.id);
                                                                        }
                                                                    } else {
                                                                        setSelectedChipId(null);
                                                                    }
                                                                    return;
                                                                }
                                                                if (e.key === 'Backspace' || e.key === 'Delete') {
                                                                    e.preventDefault();
                                                                    removeInputBlock(selectedChipId);
                                                                    setSelectedChipId(null);
                                                                    return;
                                                                }
                                                                if (e.key === 'Escape') {
                                                                    setSelectedChipId(null);
                                                                    return;
                                                                }
                                                                // Any printable key — deselect chip, let text input proceed
                                                                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                                                                    setSelectedChipId(null);
                                                                }
                                                                return;
                                                            }

                                                            // === Normal mode (no chip selected) ===
                                                            if (e.key === 'ArrowLeft') {
                                                                const curEl = e.currentTarget;
                                                                const pos = getCECursorPos(curEl);
                                                                if (pos === 0 && thisIdx > 0) {
                                                                    const prevBlock = inputBlocks[thisIdx - 1];
                                                                    if (prevBlock.type === 'file') {
                                                                        e.preventDefault();
                                                                        setSelectedChipId(prevBlock.id);
                                                                    }
                                                                }
                                                            }
                                                            if (e.key === 'ArrowRight') {
                                                                const curEl = e.currentTarget;
                                                                const pos = getCECursorPos(curEl);
                                                                const textLen = (block.text || '').length;
                                                                if (pos >= textLen && thisIdx < inputBlocks.length - 1) {
                                                                    const nextBlock = inputBlocks[thisIdx + 1];
                                                                    if (nextBlock.type === 'file') {
                                                                        e.preventDefault();
                                                                        setSelectedChipId(nextBlock.id);
                                                                    }
                                                                }
                                                            }
                                                            if (e.key === 'Backspace') {
                                                                const curEl = e.currentTarget;
                                                                const pos = getCECursorPos(curEl);
                                                                if (pos === 0 && thisIdx > 0) {
                                                                    const prevBlock = inputBlocks[thisIdx - 1];
                                                                    if (prevBlock.type === 'file') {
                                                                        e.preventDefault();
                                                                        setSelectedChipId(prevBlock.id);
                                                                    }
                                                                }
                                                            }
                                                            if (e.key === 'Escape') {
                                                                setSelectedChipId(null);
                                                            }
                                                        }}
                                                        onPaste={(e) => {
                                                            if (e.clipboardData.files.length > 0) {
                                                                e.preventDefault();
                                                                Array.from(e.clipboardData.files).forEach(f => insertInputFile(f as File));
                                                            } else {
                                                                e.preventDefault();
                                                                const text = e.clipboardData.getData('text/plain');
                                                                document.execCommand('insertText', false, text);
                                                            }
                                                        }}
                                                    />
                                                );
                                            }

                                            return null;
                                        })}
                                    </div>
                                </div>

                                {/* Bottom Toolbar - Lovart: left (attach+mode) | right (controls+send) */}
                                <div className="px-3 pb-4 pt-0 flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                        {/* Attachment Button (for Agent mode) */}
                                        {creationMode === 'agent' && (
                                            <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                                                <Paperclip size={17} strokeWidth={1.8} />
                                            </button>
                                        )}

                                        {/* Mode Selector Button with Dropdown */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowModeSelector(!showModeSelector)}
                                                className={`h-[30px] px-3.5 rounded-full flex items-center gap-1.5 text-[13px] font-medium transition-all ${creationMode === 'agent' ? 'bg-blue-50 text-[#3B82F6]' :
                                                    creationMode === 'image' ? 'bg-blue-50 text-[#3B82F6]' :
                                                        'bg-blue-50 text-[#3B82F6]'
                                                    }`}
                                            >
                                                {creationMode === 'agent' && <><Sparkles size={14} strokeWidth={2} /> Agent</>}
                                                {creationMode === 'image' && <><ImageIcon size={14} /> 图像</>}
                                                {creationMode === 'video' && <><Video size={14} /> 视频</>}
                                            </button>

                                            {/* Mode Dropdown */}
                                            {showModeSelector && (
                                                <div className="absolute bottom-full left-0 mb-2 w-36 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50">
                                                    <button
                                                        onClick={() => { setCreationMode('agent'); setShowModeSelector(false); setAgentMode(true); }}
                                                        className={`w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-gray-50 transition ${creationMode === 'agent' ? 'text-[#3B82F6]' : 'text-gray-700'}`}
                                                    >
                                                        <Sparkles size={14} /> Agent
                                                        {creationMode === 'agent' && <Check size={14} className="ml-auto" />}
                                                    </button>
                                                    <button
                                                        onClick={() => { setCreationMode('image'); setShowModeSelector(false); setAgentMode(false); }}
                                                        className={`w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-gray-50 transition ${creationMode === 'image' ? 'text-[#3B82F6]' : 'text-gray-700'}`}
                                                    >
                                                        <ImageIcon size={14} /> 图像生成器
                                                        {creationMode === 'image' && <Check size={14} className="ml-auto" />}
                                                    </button>
                                                    <button
                                                        onClick={() => { setCreationMode('video'); setShowModeSelector(false); setAgentMode(false); }}
                                                        className={`w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-gray-50 transition ${creationMode === 'video' ? 'text-blue-600' : 'text-gray-700'}`}
                                                    >
                                                        <Video size={14} /> 视频生成器
                                                        {creationMode === 'video' && <Check size={14} className="ml-auto" />}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right side controls */}
                                    <div className="flex items-center gap-0.5">
                                        {/* Video: Inline Controls — 图4 style */}
                                        {creationMode === 'video' && (
                                            <div className="flex items-center gap-1">
                                                {/* 首尾帧 toggle */}
                                                <button
                                                    onClick={() => setVideoGenMode(videoGenMode === 'startEnd' ? 'multiRef' : 'startEnd')}
                                                    className={`h-7 px-2.5 rounded-full text-xs font-medium transition whitespace-nowrap ${videoGenMode === 'startEnd' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                                                >
                                                    首尾帧
                                                </button>
                                                {/* 动作控制 */}
                                                <button className="h-7 px-2.5 rounded-full text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition whitespace-nowrap">
                                                    动作控制
                                                </button>
                                                {/* Model Selector */}
                                                <div className="relative" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => { setShowVideoModelDropdown(!showVideoModelDropdown); setShowVideoSettingsDropdown(false); }}
                                                        className="h-7 px-2.5 flex items-center gap-1 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-full transition whitespace-nowrap"
                                                    >
                                                        <span>{videoGenModel}</span>
                                                        <ChevronDown size={12} className={`text-gray-400 transition-transform ${showVideoModelDropdown ? 'rotate-180' : ''}`} />
                                                    </button>
                                                    {showVideoModelDropdown && (
                                                        <div className="absolute bottom-full right-0 mb-2 w-44 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 z-50 animate-in fade-n-95 duration-200">
                                                            <div className="px-2 py-1.5 text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-0.5">视频模型</div>
                                                            {(['Kling 2.6', 'Veo 3.1', 'Veo 3.1 Fast'] as const).map(model => (
                                                                <button
                                                                    key={model}
                                                                    onClick={() => { setVideoGenModel(model); setShowVideoModelDropdown(false); }}
                                                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${videoGenModel === model ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                                                                >
                                                                    <span>{model}</span>
                                                                    {videoGenModel === model && <Check size={14} />}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Ratio + Duration Selector */}
                                                <div className="relative" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => { setShowVideoSettingsDropdown(!showVideoSettingsDropdown); setShowVideoModelDropdown(false); }}
                                                        className="h-7 px-2.5 flex items-center gap-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-full transition whitespace-nowrap"
                                                    >
                                                        <span>{videoGenRatio} · {videoGenDuration}</span>
                                                        <ChevronDown size={12} className={`text-gray-400 transition-transform ${showVideoSettingsDropdown ? 'rotate-180' : ''}`} />
                                                    </button>
                                                    {showVideoSettingsDropdown && (
                                                        <div className="absolute bottom-full right-0 mb-2 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 z-50 animate-in fade-in zoom-in-95 duration-200">
                                                            <div className="mb-3">
                                                                <div className="text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-2">比例</div>
                                                                <div className="flex gap-2">
                                                                    {VIDEO_RATIOS.map(r => (
                                                                        <button key={r.value} onClick={() => setVideoGenRatio(r.value)} className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${videoGenRatio === r.value ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                                                                            {r.label}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-2">时长</div>
                                                                <div className="flex gap-2">
                                                                    {['5s', '8s', '10s'].map(d => (
                                                                        <button key={d} onClick={() => setVideoGenDuration(d)} className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${videoGenDuration === d ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                                                                            {d}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Submit */}
                                                <button
                                                    onClick={() => handleSend()}
                                                    disabled={inputBlocks.every(b => (b.type === 'text' && !b.text) || (b.type === 'file' && !b.file))}
                                                    className="h-7 px-3 rounded-full flex items-center gap-1 text-xs font-medium shadow-sm transition bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 disabled:opacity-50"
                                                >
                                                    <Zap size={12} /> 20
                                                </button>
                                            </div>
                                        )}

                                        {/* Agent Mode: Enhanced Controls */}
                                        {creationMode === 'agent' && (
                                            <>
                                                <div className="h-8 bg-gray-100 rounded-full flex items-center p-1 gap-1 relative">
                                                    <div className="relative group/think">
                                                        <button
                                                            onClick={() => handleModeSwitch('thinking')}
                                                            className={`w-6 h-6 flex items-center justify-center rounded-full transition-all ${modelMode === 'thinking' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                                                        >
                                                            <Lightbulb size={14} strokeWidth={2} />
                                                        </button>
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/think:opacity-100 transition pointer-events-none z-50 shadow-lg">
                                                            <div className="font-medium mb-0.5">思考模式</div>
                                                            <div className="text-gray-400 text-[10px]">制定复杂任务并自主执行</div>
                                                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-900 rotate-45"></div>
                                                        </div>
                                                    </div>
                                                    <div className="relative group/fast">
                                                        <button
                                                            onClick={() => handleModeSwitch('fast')}
                                                            className={`w-6 h-6 flex items-center justify-center rounded-full transition-all ${modelMode === 'fast' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                                                        >
                                                            <Zap size={14} strokeWidth={2} />
                                                        </button>
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/fast:opacity-100 transition pointer-events-none z-50 shadow-lg">
                                                            <div className="font-medium mb-0.5">快速模式</div>
                                                            <div className="text-gray-400 text-[10px]">快速制定和执行任务</div>
                                                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-900 rotate-45"></div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="relative group/web border border-gray-200 rounded-full hover:bg-gray-50 transition">
                                                    <button onClick={() => setWebEnabled(!webEnabled)} className={`w-8 h-8 rounded-full flex items-center justify-center transition ${webEnabled ? 'text-blue-500' : 'text-gray-500'}`}><Globe size={16} strokeWidth={1.8} /></button>
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/web:opacity-100 transition pointer-events-none z-50 shadow-lg">
                                                        <div className="font-medium">联网搜索</div>
                                                        <div className="text-gray-400 text-[10px]">{webEnabled ? '已开启' : '已关闭'}</div>
                                                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-900 rotate-45"></div>
                                                    </div>
                                                </div>
                                                <div className="relative border border-gray-200 rounded-full hover:bg-gray-50 transition">
                                                    <div className="relative group/model">
                                                        <button onClick={() => setShowModelPreference(!showModelPreference)} className={`w-8 h-8 rounded-full flex items-center justify-center transition ${showModelPreference ? 'text-blue-500' : 'text-gray-500'}`}><Box size={16} strokeWidth={2} /></button>
                                                        {!showModelPreference && (
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/model:opacity-100 transition pointer-events-none z-50 shadow-lg">
                                                                <div className="font-medium">模型偏好</div>
                                                                <div className="text-gray-400 text-[10px]">{autoModelSelect ? '自动' : preferredImageModel}</div>
                                                                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-900 rotate-45"></div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Model Preference Panel */}
                                                    {showModelPreference && (
                                                        <div className="absolute bottom-full right-0 mb-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 animate-in fade-in zoom-in-95 duration-150 overflow-hidden" onClick={e => e.stopPropagation()}>
                                                            <div className="p-4 pb-3">
                                                                <div className="flex items-center justify-between mb-3">
                                                                    <span className="text-sm font-semibold text-gray-900">模型偏好</span>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs text-gray-500">自动</span>
                                                                        <div
                                                                            onClick={() => setAutoModelSelect(!autoModelSelect)}
                                                                            className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${autoModelSelect ? 'bg-black' : 'bg-gray-300'}`}
                                                                        >
                                                                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoModelSelect ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-3">
                                                                    {(['image', 'video', '3d'] as const).map(tab => (
                                                                        <button key={tab} onClick={() => setModelPreferenceTab(tab)} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${modelPreferenceTab === tab ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700'}`}>
                                                                            {tab === 'image' ? 'Image' : tab === 'video' ? 'Video' : '3D'}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <div className="px-4 pb-4 space-y-1.5 max-h-48 overflow-y-auto">
                                                                {MODEL_OPTIONS[modelPreferenceTab].map(model => {
                                                                    const isSelected = modelPreferenceTab === 'image' ? preferredImageModel === model.id : modelPreferenceTab === 'video' ? preferredVideoModel === model.id : preferred3DModel === model.id;
                                                                    return (
                                                                        <div
                                                                            key={model.id}
                                                                            onClick={() => {
                                                                                if (modelPreferenceTab === 'image') setPreferredImageModel(model.id);
                                                                                else if (modelPreferenceTab === 'video') setPreferredVideoModel(model.id);
                                                                                else setPreferred3DModel(model.id);
                                                                                setAutoModelSelect(false);
                                                                            }}
                                                                            className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition ${isSelected && !autoModelSelect ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}
                                                                        >
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="text-sm font-medium text-gray-900">{model.name}</div>
                                                                                <div className="text-[11px] text-gray-500">{model.desc}</div>
                                                                            </div>
                                                                            <span className="text-[10px] text-gray-400 shrink-0">{model.time}</span>
                                                                            {isSelected && !autoModelSelect && <Check size={14} className="text-blue-500 shrink-0" />}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <button onClick={() => handleSend()} disabled={inputBlocks.every(b => (b.type === 'text' && !b.text) || (b.type === 'file' && !b.file))} className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${(inputBlocks.every(b => (b.type === 'text' && !b.text) || (b.type === 'file' && !b.file))) ? 'bg-gray-200 text-gray-400' : 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm'}`}><ArrowUp size={15} strokeWidth={2.5} /></button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Hidden file input for selecting files */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                                console.log('File input onChange triggered!', e.target.files);
                                if (e.target.files) {
                                    console.log('Files selected:', e.target.files.length);
                                    Array.from(e.target.files).forEach((f: File, idx: number) => {
                                        console.log(`Processing file ${idx + 1}:`, f.name, f.type, f.size);
                                        insertInputFile(f as File);
                                    });
                                }
                                if (fileInputRef.current) {
                                    console.log('Clearing file input value');
                                    fileInputRef.current.value = '';
                                }
                            }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex-1 relative flex flex-col h-full overflow-hidden">
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

                {/* Bottom Left - Layers/Files Icons + Separator + Zoom Controls (Lovart Style) */}
                <div className="absolute bottom-5 left-5 flex items-center gap-1.5 z-40 pointer-events-auto">
                    {/* Layers Icon */}
                    <button onClick={() => setLeftPanelMode(leftPanelMode === 'layers' ? null : 'layers')} className={`w-7 h-7 flex items-center justify-center rounded-md transition ${leftPanelMode === 'layers' ? 'text-gray-900 bg-gray-200/80' : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'}`} title="图层">
                        <Layers size={15} strokeWidth={1.8} />
                    </button>
                    {/* Files Icon */}
                    <button onClick={() => setLeftPanelMode(leftPanelMode === 'files' ? null : 'files')} className={`w-7 h-7 flex items-center justify-center rounded-md transition ${leftPanelMode === 'files' ? 'text-gray-900 bg-gray-200/80' : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'}`} title="已生成文件列表">
                        <Folder size={15} strokeWidth={1.8} />
                    </button>
                    {/* Separator */}
                    <div className="w-px h-4 bg-gray-300/60 mx-0.5"></div>
                    {/* Zoom Controls */}
                    <div className="flex items-center gap-0.5">
                        <button onClick={() => setZoom(z => Math.max(10, z - 10))} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-black rounded-md hover:bg-white/60 transition"><Minus size={13} /></button>
                        <span className="text-[11px] font-medium w-9 text-center text-gray-600 select-none">{Math.round(zoom)}%</span>
                        <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-black rounded-md hover:bg-white/60 transition"><Plus size={13} /></button>
                    </div>
                </div>

                <div ref={containerRef} className="flex-1 overflow-hidden relative bg-[#E8E8E8] w-full h-full select-none" onContextMenu={handleContextMenu} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={handleCanvasDrop} style={{ cursor: (activeTool === 'hand' || isPanning || isSpacePressed) ? (isPanning ? 'grabbing' : 'grab') : (activeTool === 'mark' ? 'crosshair' : (activeTool === 'select' ? 'default' : 'grab')), WebkitUserSelect: 'none' }}>
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
                        {elements.map((el) => {
                            // Hide children of collapsed (merged) groups
                            if (el.groupId) {
                                const parentGroup = elements.find(e => e.id === el.groupId);
                                if (parentGroup?.isCollapsed) return null;
                            }
                            const isSelected = selectedElementId === el.id || selectedElementIds.includes(el.id);
                            const adaptiveScaleLoop = Math.max(0.4, Math.min(2.0, zoom / 100));
                            const flexibleScale = 1 + ((1 / adaptiveScaleLoop) - 1) * 0.6;

                            // Group element rendering
                            if (el.type === 'group') {
                                return (
                                    <div key={el.id} id={`canvas-el-${el.id}`} className={`absolute ${isSelected ? 'ring-2 ring-blue-500' : ''}`} style={{ left: el.x, top: el.y, width: el.width, height: el.height, zIndex: el.zIndex, cursor: activeTool === 'select' ? 'move' : 'default' }} onMouseDown={(e) => handleElementMouseDown(e, el.id)}>
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
                                <div key={el.id} id={`canvas-el-${el.id}`} className={`absolute group ${isSelected && el.type !== 'text' ? 'ring-2 ring-blue-500' : ''} ${isSelected && el.type === 'text' ? 'ring-1 ring-blue-500 ring-offset-2' : ''}`} style={{ left: el.x, top: el.y, width: el.type === 'text' ? 'auto' : el.width, height: el.type === 'text' ? 'auto' : el.height, zIndex: el.zIndex, cursor: activeTool === 'select' ? 'move' : (activeTool === 'mark' ? 'crosshair' : 'default'), whiteSpace: el.type === 'text' ? 'nowrap' : 'normal' }} onMouseDown={(e) => handleElementMouseDown(e, el.id)} onDoubleClick={() => { if (el.type === 'text') { setEditingTextId(el.id); } else if (el.url) { setPreviewUrl(el.url); } }}>
                                    {(isSelected || isDraggingElement) && editingTextId !== el.id && (<div className="absolute -top-8 right-0 bg-white shadow-md rounded-md p-1 cursor-pointer hover:bg-red-50 hover:text-red-500 z-50"><Trash2 size={14} onClick={(e) => { e.stopPropagation(); deleteSelectedElement(); }} /></div>)}
                                    {/* ... (rest of element rendering remains same) ... */}
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
                                                        {el.isGenerating ? (<div className="flex flex-col items-center gap-3"> <Loader2 size={32} className="animate-spin text-blue-500" /> <span className="text-xs text-blue-400 font-medium">Creating magic...</span> </div>) : (<div className="flex flex-col items-center gap-2 text-blue-200"> <ImageIcon size={48} strokeWidth={1.5} /> </div>)}
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
                                                        {el.isGenerating ? (<div className="flex flex-col items-center gap-3"> <Loader2 size={32} className="animate-spin text-blue-500" /> <span className="text-xs text-blue-400 font-medium">Creating magic...</span> </div>) : (<div className="flex flex-col items-center gap-2 text-blue-200"> <Film size={48} strokeWidth={1.5} /> </div>)}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {/* Alignment Guide Lines */}
                        {alignGuides.map((guide, i) => (
                            guide.type === 'v' ? (
                                <div key={`guide-${i}`} className="absolute pointer-events-none z-[9998]" style={{ left: guide.pos, top: -5000, width: 1, height: 10000, background: 'repeating-linear-gradient(to bottom, #f43f5e 0px, #f43f5e 4px, transparent 4px, transparent 8px)' }} />
                            ) : (
                                <div key={`guide-${i}`} className="absolute pointer-events-none z-[9998]" style={{ left: -5000, top: guide.pos, width: 10000, height: 1, background: 'repeating-linear-gradient(to right, #f43f5e 0px, #f43f5e 4px, transparent 4px, transparent 8px)' }} />
                            )
                        ))}
                        {/* Markers Layer */}
                        {markers.map((marker) => {
                            const el = elements.find(e => e.id === marker.elementId);
                            if (!el) return null;
                            // During drag, use ref positions to stay in sync
                            const dragPos = isDraggingElement ? dragOffsetsRef.current[el.id] : null;
                            const baseX = dragPos ? dragPos.x : el.x;
                            const baseY = dragPos ? dragPos.y : el.y;
                            const pixelX = baseX + (el.width * marker.x / 100);
                            const pixelY = baseY + (el.height * marker.y / 100);
                            const adaptiveMarkerScale = Math.max(0.6, Math.min(1.2, zoom / 100));

                            // Determine if this marker is hovered via chat chip
                            const isHoveredInChat = hoveredChipId && inputBlocks.some(b => b.id === hoveredChipId && b.type === 'file' && b.file && (b.file as any).markerId === marker.id);

                            return (
                                <div key={marker.id} style={{ left: pixelX, top: pixelY, transform: `translate(-50%, -100%) scale(${1 / adaptiveMarkerScale})`, transformOrigin: 'bottom center', pointerEvents: 'auto' }} className={`absolute z-50 group/marker cursor-pointer ${isHoveredInChat ? 'z-[60]' : ''}`} onClick={(e) => { e.stopPropagation(); setZoom(Math.max(100, zoom)); }}>
                                    <motion.div
                                        className="relative flex flex-col items-center"
                                        initial={{ scale: 0, opacity: 0, y: 15 }}
                                        animate={{ scale: isHoveredInChat ? 1.25 : 1, opacity: 1, y: 0 }}
                                        whileHover={{ scale: 1.25 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                        style={{ transformOrigin: 'bottom center' }}
                                    >
                                        <div className={`w-[14px] h-[14px] rounded-full bg-[#3B82F6] border border-white flex items-center justify-center text-white font-bold text-[7px] relative z-10 transition-colors duration-300 ${isHoveredInChat ? 'shadow-[0_0_0_3px_rgba(59,130,246,0.3)]' : 'shadow-sm'}`}>
                                            {marker.id}
                                        </div>
                                        <div className="w-0 h-0 border-l-[2px] border-l-transparent border-r-[2px] border-r-transparent border-t-[3px] border-t-[#3B82F6] -mt-[0.5px]"></div>
                                    </motion.div>

                                    {/* Quick Edit Pill (Dark, 800ms delay on Hover) - positioned to the right of the marker bubble */}
                                    <div
                                        className="absolute left-full top-0 ml-1.5 bg-gray-900/95 backdrop-blur-md rounded-full shadow-[0_8px_20px_rgb(0,0,0,0.15)] border border-gray-700/50 px-2.5 py-1 whitespace-nowrap opacity-0 scale-95 origin-left group-hover/marker:opacity-100 group-hover/marker:scale-100 transition-all duration-300 delay-0 group-hover/marker:delay-[800ms] flex items-center gap-1.5 z-50"
                                    >
                                        <span className="text-[10px] font-bold text-white tracking-wide">快捷编辑</span>
                                        <span className="text-[9px] font-semibold text-gray-300 bg-gray-800 rounded-sm px-1 shadow-inner">Tab</span>
                                    </div>
                                </div>
                            )
                        })}
                        {/* Floating Toolbars — inside transform layer for automatic pan/zoom tracking */}
                        {renderImageToolbar()}
                        {renderGenVideoToolbar()}
                        {renderMultiSelectToolbar()}
                    </div>
                </div>
            </div>

            {/* Touch Edit Mode Indicator */}
            {touchEditMode && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium">
                    <Scan size={16} />
                    <span>Touch Edit 模式 — 点击图片区域进行编辑</span>
                    <button onClick={() => setTouchEditMode(false)} className="ml-2 w-5 h-5 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Touch Edit Popup */}
            {touchEditPopup && (
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
            )}

        </div>
    );
};

export default Workspace;
