import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronDown, Plus, X, ArrowUp, Paperclip, Lightbulb, Zap, Globe, Box, Sparkles,
    Image as ImageIcon, Check, Video, FileText, Banana, ChevronLeft, ChevronRight,
    Activity, Layers, Cloud, ShieldCheck, Monitor, MapPin
} from 'lucide-react';
import { useAgentStore } from '../../../stores/agent.store';
import { useCanvasStore } from '../../../stores/canvas.store';
import { ImageModel, VideoModel, Marker } from '../../../types';

const VIDEO_RATIOS = [
    { label: '16:9', value: '16:9', icon: 'rectangle-horizontal' },
    { label: '9:16', value: '9:16', icon: 'rectangle-vertical' },
    { label: '1:1', value: '1:1', icon: 'square' },
];

const MODEL_OPTIONS: Record<string, { id: string; name: string; desc: string; time?: string; icon: React.ElementType; badge?: string }[]> = {
    image: [
        { id: 'Nano Banana Pro', name: 'Nano Banana Pro', desc: "Professional's choice for advanced outputs.", time: '20s', icon: Banana },
        { id: 'NanoBanana2', name: 'Nano Banana 2', desc: 'Generalist fast image generation model.', time: '15s', icon: Zap },
        { id: 'dall-e-3', name: 'DALL·E 3', desc: "OpenAI's most advanced image model.", time: '120s', icon: Sparkles },
        { id: 'Seedream5.0', name: 'Seedream 5.0 Lite', desc: "Bytedance's latest image generation model.", time: '120s', icon: Activity },
        { id: 'flux-schnell', name: 'Flux Schnell', desc: "BFL's fast image generation model.", time: '10s', icon: Layers },
        { id: 'flux-pro', name: 'Flux.1 Pro', desc: "BFL's image generation model.", time: '10s', icon: Layers },
        { id: 'gemini-1.5-pro', name: 'Gemini Imagen 4', desc: "Google's most advanced image model.", time: '10s', icon: Sparkles },
        { id: 'midjourney', name: 'Midjourney', desc: 'A model that transforms text into artistic visuals.', time: '20s', icon: Globe },
    ],
    video: [
        { id: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast', desc: "Google's ultra-fast video generation model.", time: '10s', icon: Cloud, badge: '极速版' },
        { id: 'veo-3.1-generate-preview', name: 'Veo 3.1 Pro', desc: "Google's high-quality video generation model.", time: '180s', icon: Cloud, badge: '专业版' },
        { id: 'kling-3.0', name: 'Kling 3.0', desc: "Kling's latest video model.", time: '300s', icon: Video, badge: '蓝海5型' },
        { id: 'sora-2', name: 'Sora 2', desc: "OpenAI's flagship video generation model.", time: '300s', icon: Sparkles, badge: '通联专网' },
        { id: 'runway-gen3', name: 'Runway Gen-3', desc: 'Video generation model with built-in audio.', time: '600s', icon: Activity },
    ],
    '3d': [
        { id: 'Tripo', name: 'Tripo', desc: 'High-quality 3D model generator.', icon: Box },
    ]
};

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
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
};

interface InputAreaProps {
    creationMode: 'agent' | 'image' | 'video';
    setCreationMode: (mode: 'agent' | 'image' | 'video') => void;
    handleSend: (overridePrompt?: string, overrideAttachments?: File[], overrideWeb?: boolean, skillData?: any) => Promise<void>;
    handleModeSwitch: (mode: 'thinking' | 'fast') => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    selectedChipId: string | null;
    setSelectedChipId: (id: string | null) => void;
    hoveredChipId: string | null;
    setHoveredChipId: (id: string | null) => void;
    // New props from Workspace
    showModeSelector: boolean;
    setShowModeSelector: (v: boolean) => void;
    showModelPreference: boolean;
    setShowModelPreference: (v: boolean) => void;
    modelPreferenceTab: 'image' | 'video' | '3d';
    setModelPreferenceTab: (tab: 'image' | 'video' | '3d') => void;
    autoModelSelect: boolean;
    setAutoModelSelect: (v: boolean) => void;
    preferredImageModel: ImageModel;
    setPreferredImageModel: (v: ImageModel) => void;
    preferredVideoModel: VideoModel;
    setPreferredVideoModel: (v: VideoModel) => void;
    preferred3DModel: string;
    setPreferred3DModel: (v: string) => void;
    showRatioPicker: boolean;
    setShowRatioPicker: (v: boolean) => void;
    showModelPicker: boolean;
    setShowModelPicker: (v: boolean) => void;
    isInputFocused: boolean;
    setIsInputFocused: (v: boolean) => void;
    isDragOver: boolean;
    setIsDragOver: (v: boolean) => void;
    isVideoPanelHovered: boolean;
    setIsVideoPanelHovered: (v: boolean) => void;
    showVideoSettingsDropdown: boolean;
    setShowVideoSettingsDropdown: (v: boolean) => void;
    markers: any[];
    onSaveMarkerLabel?: (markerId: string, label: string) => void;
}

export const InputArea: React.FC<InputAreaProps> = ({
    creationMode, setCreationMode, handleSend, handleModeSwitch, fileInputRef,
    selectedChipId, setSelectedChipId, hoveredChipId, setHoveredChipId,
    showModeSelector, setShowModeSelector,
    showModelPreference, setShowModelPreference,
    modelPreferenceTab, setModelPreferenceTab,
    autoModelSelect, setAutoModelSelect,
    preferredImageModel, setPreferredImageModel,
    preferredVideoModel, setPreferredVideoModel,
    preferred3DModel, setPreferred3DModel,
    showRatioPicker, setShowRatioPicker,
    showModelPicker, setShowModelPicker,
    isInputFocused, setIsInputFocused,
    isDragOver, setIsDragOver,
    isVideoPanelHovered, setIsVideoPanelHovered,
    showVideoSettingsDropdown, setShowVideoSettingsDropdown,
    markers, onSaveMarkerLabel,
}) => {
    const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
    const [editingMarkerLabel, setEditingMarkerLabel] = useState('');
    const [isAllInputSelected, setIsAllInputSelected] = useState(false);
    const inputBlocks = useAgentStore(s => s.inputBlocks);
    const activeBlockId = useAgentStore(s => s.activeBlockId);
    const videoGenRatio = useAgentStore(s => s.videoGenRatio);
    const videoGenDuration = useAgentStore(s => s.videoGenDuration);
    const videoGenModel = useAgentStore(s => s.videoGenModel);
    const videoGenMode = useAgentStore(s => s.videoGenMode);
    const videoStartFrame = useAgentStore(s => s.videoStartFrame);
    const videoEndFrame = useAgentStore(s => s.videoEndFrame);
    const videoMultiRefs = useAgentStore(s => s.videoMultiRefs);
    const showVideoModelDropdown = useAgentStore(s => s.showVideoModelDropdown);
    const modelMode = useAgentStore(s => s.modelMode);
    const webEnabled = useAgentStore(s => s.webEnabled);
    const imageGenUploads = useAgentStore(s => s.imageGenUploads);
    const isPickingFromCanvas = useAgentStore(s => s.isPickingFromCanvas);
    const pendingAttachments = useAgentStore(s => s.pendingAttachments);

    const {
        setInputBlocks, removeInputBlock, appendInputFile,
        setActiveBlockId, setSelectionIndex,
        setVideoGenRatio, setVideoGenDuration, setVideoGenModel, setVideoGenMode,
        setVideoStartFrame, setVideoEndFrame, setVideoMultiRefs,
        setShowVideoModelDropdown, setWebEnabled, setIsAgentMode,
        setImageGenUploads, setIsPickingFromCanvas,
        confirmPendingAttachments, removePendingAttachment,
    } = useAgentStore(s => s.actions);

    const imageGenRatio = useAgentStore(s => s.imageGenRatio);
    const imageGenRes = useAgentStore(s => s.imageGenRes);
    const { setImageGenRatio, setImageGenRes } = useAgentStore(s => s.actions);

    const selectLatestCanvasChip = () => {
        if (selectedChipId) return;
        const autoCanvasBlocks = inputBlocks.filter(b => b.type === 'file' && b.file && (b.file as any)._canvasAutoInsert);
        const lastAutoBlock = autoCanvasBlocks[autoCanvasBlocks.length - 1];
        if (lastAutoBlock) {
            setSelectedChipId(lastAutoBlock.id);
        }
    };

    const commitPendingAttachments = () => {
        if (pendingAttachments.length > 0) {
            confirmPendingAttachments();
        }
    };

    const handlePickedFiles = (files: File[]) => {
        if (!files || files.length === 0) return;

        if (creationMode === 'image') {
            const images = files.filter(f => f.type.startsWith('image/')).slice(0, 10);
            if (images.length > 0) {
                const current = Array.isArray(imageGenUploads) ? imageGenUploads : [];
                setImageGenUploads([...current, ...images].slice(0, 10));
            }
            return;
        }

        files.forEach((f) => {
            if (f.type.startsWith('image/') || f.type.startsWith('video/')) {
                appendInputFile(f);
            }
        });
    };

    const clearAllInputBlocks = () => {
        const textId = `text-${Date.now()}`;
        setInputBlocks([{ id: textId, type: 'text', text: '' }]);
        setActiveBlockId(textId);
        setSelectedChipId(null);
        setIsAllInputSelected(false);
    };

    const moveCaretToLeftOfFirstChip = () => {
        const textId = `text-${Date.now()}`;
        const currentBlocks = useAgentStore.getState().inputBlocks;
        setInputBlocks([{ id: textId, type: 'text', text: '' }, ...currentBlocks]);
        setActiveBlockId(textId);
        setSelectedChipId(null);
        setIsAllInputSelected(false);
        requestAnimationFrame(() => {
            const leftEl = document.getElementById(`input-block-${textId}`);
            if (leftEl) {
                setCECursorPos(leftEl, 0);
            }
        });
    };

    const insertPlainTextAtCursor = (text: string) => {
        if (!text) return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    };

    const handleEditorPaste = (e: React.ClipboardEvent<HTMLSpanElement>, blockId: string) => {
        const clipboardData = e.clipboardData;
        if (!clipboardData) return;

        const items = Array.from(clipboardData.items || []);
        const imageFiles: File[] = [];

        for (const item of items) {
            if (item.type && item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) imageFiles.push(file);
            }
        }

        if (imageFiles.length === 0) return;

        e.preventDefault();
        handlePickedFiles(imageFiles);

        const plainText = clipboardData.getData('text/plain');
        if (plainText) {
            insertPlainTextAtCursor(plainText);
        }

        const nextText = e.currentTarget.textContent || '';
        setInputBlocks(
            useAgentStore.getState().inputBlocks.map((b) =>
                b.id === blockId ? { ...b, text: nextText } : b
            )
        );
    };

    return (
        <div className="px-3 py-2 z-20 flex-shrink-0">
            <div
                className={`bg-white rounded-2xl border border-gray-200 shadow-sm transition-all duration-200 relative group focus-within:shadow-md focus-within:border-gray-300 flex flex-col overflow-visible ${isDragOver ? 'border-blue-400 ring-2 ring-blue-100 bg-blue-50/30' : ''}`}
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
                                appendInputFile(f);
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
                            <span className="text-sm font-medium text-blue-600">将文件拖拽至此处添加至对话</span>
                        </div>
                    </div>
                )}

                {/* Image Mode: Upload Area */}
                {creationMode === 'image' && (
                    <div className="transition-all duration-300 overflow-visible px-4 flex flex-col justify-end" style={{ maxHeight: isVideoPanelHovered ? '92px' : '0px', opacity: isVideoPanelHovered ? 1 : 0, paddingTop: isVideoPanelHovered ? '16px' : '0px', paddingBottom: isVideoPanelHovered ? '4px' : '0px' }}>
                        <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                                <div
                                    onClick={() => {
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = 'image/*';
                                        input.multiple = true;
                                        input.onchange = (e) => {
                                            const files = Array.from((e.target as HTMLInputElement).files || []);
                                            if (files.length > 0) {
                                                const current = Array.isArray(imageGenUploads) ? imageGenUploads : [];
                                                setImageGenUploads([...current, ...files].slice(0, 10));
                                            }
                                        };
                                        input.click();
                                    }}
                                    className={`w-[72px] h-[72px] border border-dashed border-gray-200 rounded-[14px] flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition group/upload bg-gray-50/50 ${isPickingFromCanvas ? 'border-blue-400 bg-blue-50/40' : ''}`}
                                >
                                    <Plus size={20} strokeWidth={1.5} className="text-gray-300 group-hover/upload:text-blue-500 transition mb-1" />
                                    <span className="text-[12px] font-bold text-gray-400 group-hover/upload:text-blue-500 transition">图片</span>
                                </div>

                            </div>

                            {Array.isArray(imageGenUploads) && imageGenUploads.map((file, idx) => (
                                <div key={idx} className="relative w-[72px] h-[72px] border border-gray-200 rounded-[14px] overflow-visible shadow-sm shrink-0 bg-white">
                                    <img src={URL.createObjectURL(file)} className="w-full h-full object-cover rounded-[14px]" />
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setImageGenUploads(imageGenUploads.filter((_, i) => i !== idx)); setIsPickingFromCanvas(false); }}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-black/80 hover:bg-black text-white rounded-full flex items-center justify-center z-10 shadow-sm border border-white/20"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}

                            {isPickingFromCanvas && (
                                <div className="text-[11px] text-blue-600 font-medium bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                                    请在画布中点击一张图片
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Video Mode: Hover Expandable Frame Upload Area */}
                {creationMode === 'video' && (
                    <div
                        className="px-4 transition-all duration-300 overflow-hidden flex flex-col justify-end"
                        style={{
                            maxHeight: (isVideoPanelHovered || videoStartFrame || videoEndFrame || videoMultiRefs.length > 0) ? '140px' : '0px',
                            opacity: (isVideoPanelHovered || videoStartFrame || videoEndFrame || videoMultiRefs.length > 0) ? 1 : 0,
                            paddingTop: (isVideoPanelHovered || videoStartFrame || videoEndFrame || videoMultiRefs.length > 0) ? '20px' : '0px',
                            paddingBottom: (isVideoPanelHovered || videoStartFrame || videoEndFrame || videoMultiRefs.length > 0) ? '10px' : '0px',
                        }}
                    >
                        {videoGenMode === 'startEnd' ? (
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <label className={`w-[72px] h-[72px] border rounded-[14px] flex flex-col items-center justify-center cursor-pointer transition overflow-hidden group/upload ${videoStartFrame ? 'border-gray-200 border-solid shadow-sm' : 'border border-dashed border-gray-200 bg-gray-50/50 hover:border-blue-400 hover:bg-blue-50/30'}`}>
                                        <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files) setVideoStartFrame(e.target.files[0]); }} />
                                        {videoStartFrame ? (
                                            <img src={URL.createObjectURL(videoStartFrame)} className="w-full h-full object-cover" />
                                        ) : (
                                            <>
                                                <Plus size={20} strokeWidth={1.5} className="text-gray-300 group-hover/upload:text-blue-500 transition mb-1" />
                                                <span className="text-[12px] font-bold text-gray-400 group-hover/upload:text-blue-500 transition">首帧</span>
                                            </>
                                        )}
                                    </label>
                                    {videoStartFrame && (
                                        <button onClick={(e) => { e.preventDefault(); setVideoStartFrame(null); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-black/80 hover:bg-black text-white rounded-full flex items-center justify-center z-10 shadow-sm border border-white/20">
                                            <X size={10} />
                                        </button>
                                    )}
                                </div>
                                <div className="relative">
                                    <label className={`w-[72px] h-[72px] border rounded-[14px] flex flex-col items-center justify-center cursor-pointer transition overflow-hidden group/upload ${videoEndFrame ? 'border-gray-200 border-solid shadow-sm' : 'border border-dashed border-gray-200 bg-gray-50/50 hover:border-blue-400 hover:bg-blue-50/30'}`}>
                                        <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files) setVideoEndFrame(e.target.files[0]); }} />
                                        {videoEndFrame ? (
                                            <img src={URL.createObjectURL(videoEndFrame)} className="w-full h-full object-cover" />
                                        ) : (
                                            <>
                                                <Plus size={20} strokeWidth={1.5} className="text-gray-300 group-hover/upload:text-blue-500 transition mb-1" />
                                                <span className="text-[12px] font-bold text-gray-400 group-hover/upload:text-blue-500 transition">尾帧</span>
                                            </>
                                        )}
                                    </label>
                                    {videoEndFrame && (
                                        <button onClick={(e) => { e.preventDefault(); setVideoEndFrame(null); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-black/80 hover:bg-black text-white rounded-full flex items-center justify-center z-10 shadow-sm border border-white/20">
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
                                        <button onClick={() => setVideoMultiRefs(useAgentStore.getState().videoMultiRefs.filter((_, i) => i !== idx))} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-600 hover:bg-gray-800 text-white rounded-full flex items-center justify-center z-10 shadow border border-white">
                                            <X size={10} />
                                        </button>
                                    </div>
                                ))}
                                <label className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition flex-shrink-0 group">
                                    <input type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) setVideoMultiRefs([...useAgentStore.getState().videoMultiRefs, ...Array.from(e.target.files!)]); }} />
                                    <Plus size={16} className="group-hover:text-blue-500 transition" />
                                </label>
                            </div>
                        )}
                    </div>
                )}

                {/* Text Input Area - Lovart style: inline mixed chips + text */}
                <div
                    className={`px-3 pt-1.5 pb-1.5 cursor-text transition-all`}
                    onKeyDownCapture={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                            e.preventDefault();
                            const selection = window.getSelection();
                            if (selection) selection.removeAllRanges();
                            setIsAllInputSelected(true);
                            setSelectedChipId(null);
                            return;
                        }

                        if (isAllInputSelected && (e.key === 'Backspace' || e.key === 'Delete')) {
                            e.preventDefault();
                            clearAllInputBlocks();
                            return;
                        }
                    }}
                    onMouseDown={(e) => {
                        if (isAllInputSelected) setIsAllInputSelected(false);
                        commitPendingAttachments();
                        const target = e.target as HTMLElement;
                        if (target.closest('[id^="file-chip-"]') || target.closest('[id^="marker-chip-"]')) return;
                        selectLatestCanvasChip();
                    }}
                    onClick={(e) => {
                        if (isAllInputSelected) setIsAllInputSelected(false);
                        const target = e.target as HTMLElement;
                        if (target.closest('[id^="input-block-"]')) return;
                        if (target.closest('[id^="file-chip-"]') || target.closest('[id^="marker-chip-"]')) return;

                        const clickedContainer = target === e.currentTarget;
                        const clickedFlowBackground = target.classList.contains('input-flow-container');
                        if (!clickedContainer && !clickedFlowBackground) return;

                        const lastText = inputBlocks.filter(b => b.type === 'text').pop();
                        const targetId = lastText?.id || inputBlocks[inputBlocks.length - 1].id;
                        const el = document.getElementById(`input-block-${targetId}`);
                        el?.focus();
                    }}>
                    <div
                        className="input-flow-container flex flex-wrap items-start content-start gap-[2px] pt-2 min-h-[80px] max-h-[200px] overflow-y-auto pr-1"
                        style={{ minHeight: '80px', maxHeight: '200px', overflowY: 'auto', wordBreak: 'break-word', lineHeight: '22px' }}
                    >
                        {inputBlocks.map((block) => {
                            if (block.type === 'file' && block.file) {
                                const file = block.file!;
                                const markerId = (file as any).markerId;
                                const isSelected = selectedChipId === block.id;
                                const isHovered = hoveredChipId === block.id;
                                const markerInfo = (file as any).markerInfo;

                                if (markerId) {
                                    return (
                                        <motion.div
                                            key={block.id}
                                            id={`marker-chip-${block.id}`}
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            className={`inline-flex items-center gap-0 rounded-full pl-[2px] pr-1 cursor-default relative group select-none h-6 transition-all border ${isAllInputSelected || isSelected ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-400' : 'bg-gray-50/50 border-gray-100 hover:bg-gray-100'}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsAllInputSelected(false);
                                                const markerId = (file as any).markerId;
                                                if (isSelected) {
                                                    setEditingMarkerId(markerId);
                                                    setEditingMarkerLabel((file as any).markerName || "");
                                                } else {
                                                    setSelectedChipId(block.id);
                                                }
                                            }}
                                            onMouseEnter={() => setHoveredChipId(block.id)}
                                            onMouseLeave={() => setHoveredChipId(null)}
                                        >
                                            <div className="flex items-center -space-x-1.5 flex-shrink-0">
                                                <div className="w-5 h-5 rounded-full overflow-hidden border border-gray-100 flex-shrink-0 shadow-sm">
                                                    <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                                </div>
                                                <div className="w-3.5 h-3.5 bg-[#3B82F6] rounded-full flex items-center justify-center text-white text-[8px] font-black shadow-sm flex-shrink-0 border border-white z-10">
                                                    {markers.findIndex(m => m.id === markerId) + 1 || '?'}
                                                </div>
                                            </div>
                                            <span className="text-[11px] text-gray-700 font-bold max-w-[80px] truncate ml-1">{(file as any).markerName || '区域'}</span>
                                            <button onClick={(e) => { e.stopPropagation(); removeInputBlock(block.id); setSelectedChipId(null); }} className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100"><X size={10} /></button>

                                            {isHovered && markerInfo && (() => {
                                                const MAX_SIZE = 220;
                                                const ratio = markerInfo.imageWidth / markerInfo.imageHeight;
                                                let renderWidth = MAX_SIZE;
                                                let renderHeight = MAX_SIZE;

                                                if (ratio > 1) {
                                                    renderHeight = MAX_SIZE / ratio;
                                                } else {
                                                    renderWidth = MAX_SIZE * ratio;
                                                }

                                                return ReactDOM.createPortal(
                                                    <div className="fixed z-[9999] pointer-events-none" style={{
                                                        left: (document.getElementById(`marker-chip-${block.id}`)?.getBoundingClientRect().left || 0) + (document.getElementById(`marker-chip-${block.id}`)?.getBoundingClientRect().width || 0) / 2 - (renderWidth / 2),
                                                        top: (document.getElementById(`marker-chip-${block.id}`)?.getBoundingClientRect().top || 0) - renderHeight - 12,
                                                        width: renderWidth, height: renderHeight
                                                    }}>
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.9, y: 8 }}
                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                            transition={{ duration: 0.2 }}
                                                            className="w-full h-full bg-white rounded-2xl shadow-xl overflow-hidden relative border border-gray-200"
                                                        >
                                                            {/* 先显示完整原图（scale=1），再动画缩放到标记区域（scale=3） */}
                                                            <motion.div
                                                                className="absolute inset-0"
                                                                initial={{ scale: 1 }}
                                                                animate={{ scale: 3 }}
                                                                transition={{
                                                                    delay: 0.5,
                                                                    duration: 0.8,
                                                                    ease: [0.25, 0.1, 0.25, 1]
                                                                }}
                                                                style={{
                                                                    transformOrigin: `${(markerInfo.x + markerInfo.width / 2) / markerInfo.imageWidth * 100}% ${(markerInfo.y + markerInfo.height / 2) / markerInfo.imageHeight * 100}%`
                                                                }}
                                                            >
                                                                <img src={markerInfo.fullImageUrl || URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                                                {/* 在图片上覆盖绘制对应的标记点 */}
                                                                <div
                                                                    className="absolute"
                                                                    style={{
                                                                        left: `${(markerInfo.x + markerInfo.width / 2) / markerInfo.imageWidth * 100}%`,
                                                                        top: `${(markerInfo.y + markerInfo.height / 2) / markerInfo.imageHeight * 100}%`,
                                                                        transform: 'translate(-50%, -100%)',
                                                                        transformOrigin: 'bottom center'
                                                                    }}
                                                                >
                                                                    <motion.div
                                                                        className="relative flex flex-col items-center"
                                                                        // 因为外层最终会放大到 scale=3，我们让标记反向缩小到 scale: 0.33，这样它在放大状态下刚好是正常大小
                                                                        initial={{ scale: 1, opacity: 0 }}
                                                                        animate={{ scale: 0.333, opacity: 1 }}
                                                                        transition={{ delay: 0.5, duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
                                                                        style={{ transformOrigin: 'bottom center' }}
                                                                    >
                                                                        <div className="w-[28px] h-[28px] rounded-full bg-[#3B82F6] border-2 border-white flex items-center justify-center text-white font-bold text-[12px] relative z-10 shadow-lg">
                                                                            {markers.findIndex(m => m.id === markerId) + 1}
                                                                        </div>
                                                                        <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-[#3B82F6] -mt-[1px]"></div>
                                                                    </motion.div>
                                                                </div>
                                                            </motion.div>
                                                        </motion.div>
                                                    </div>,
                                                    document.body
                                                );
                                            })()}
                                        </motion.div>
                                    );
                                } else {
                                    const isCanvasAuto = (file as any)._canvasAutoInsert;
                                    const chipLabel = isCanvasAuto ? `图片${inputBlocks.filter(b => b.type === 'file' && (b.file as any)?._canvasAutoInsert).indexOf(block) + 1}` : file.name.replace(/\.[^/.]+$/, '');
                                    const fileAny = file as any;
                                    const imageWidth = Number(fileAny._canvasWidth || fileAny._canvasW || 0);
                                    const imageHeight = Number(fileAny._canvasHeight || fileAny._canvasH || 0);
                                    const hasValidAspect = imageWidth > 0 && imageHeight > 0;
                                    const chipPreviewUrl = fileAny._chipPreviewUrl || (fileAny._chipPreviewUrl = URL.createObjectURL(file));
                                    return (
                                        <div
                                            key={block.id}
                                            id={`file-chip-${block.id}`}
                                            className={`inline-flex items-center gap-1 rounded-full pl-[2px] pr-1.5 select-none relative group h-6 cursor-default transition-all border shrink-0 ${isAllInputSelected || isSelected ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-400' : isInputFocused ? 'bg-blue-50/30 border-blue-100' : 'bg-gray-50/50 border-gray-100 hover:bg-gray-100'}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsAllInputSelected(false);
                                                const markerId = (file as any).markerId;
                                                if (isSelected) {
                                                    setEditingMarkerId(markerId);
                                                    setEditingMarkerLabel((file as any).markerName || "");
                                                } else {
                                                    setSelectedChipId(block.id);
                                                }
                                            }}
                                            onMouseEnter={() => setHoveredChipId(block.id)}
                                            onMouseLeave={() => setHoveredChipId(null)}
                                        >
                                            <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0 border border-gray-100 shadow-sm">
                                                {file.type.startsWith('image/') ? <img src={chipPreviewUrl} className="w-full h-full object-cover" /> : <FileText size={10} className="text-gray-500" />}
                                            </div>
                                            <span className="text-[11px] text-gray-700 font-bold max-w-[100px] truncate ml-0.5">{chipLabel}</span>
                                            <button onClick={(e) => { e.stopPropagation(); removeInputBlock(block.id); setSelectedChipId(null); }} className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 ml-0.5"><X size={10} /></button>

                                            {isHovered && file.type.startsWith('image/') && (() => {
                                                const chipRect = document.getElementById(`file-chip-${block.id}`)?.getBoundingClientRect();
                                                if (!chipRect) return null;

                                                const maxSize = 220;
                                                const ratio = hasValidAspect ? imageWidth / imageHeight : 1;
                                                const renderWidth = ratio > 1 ? maxSize : Math.max(120, maxSize * ratio);
                                                const renderHeight = ratio > 1 ? Math.max(120, maxSize / ratio) : maxSize;

                                                return ReactDOM.createPortal(
                                                    <div
                                                        className="fixed z-[9999] pointer-events-none"
                                                        style={{
                                                            left: chipRect.left + chipRect.width / 2 - renderWidth / 2,
                                                            top: chipRect.top - renderHeight - 12,
                                                            width: renderWidth,
                                                            height: renderHeight,
                                                        }}
                                                    >
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.94, y: 8 }}
                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                            transition={{ duration: 0.18 }}
                                                            className="w-full h-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200"
                                                        >
                                                            <img src={chipPreviewUrl} className="w-full h-full object-cover" />
                                                        </motion.div>
                                                    </div>,
                                                    document.body
                                                );
                                            })()}
                                        </div>
                                    );
                                }
                            }

                            if (block.type === 'text') {
                                const textBlocks = inputBlocks.filter(b => b.type === 'text');
                                const isLastTextBlock = textBlocks[textBlocks.length - 1]?.id === block.id;
                                const hasText = (block.text || '').trim().length > 0;
                                const placeholder = isLastTextBlock && textBlocks.length <= 1 && pendingAttachments.length === 0
                                    ? (creationMode === 'agent' ? "请输入你的设计需求" : "今天我们要创作什么")
                                    : "";

                                return (
                                    <span
                                        key={block.id}
                                        id={`input-block-${block.id}`}
                                        contentEditable
                                        suppressContentEditableWarning
                                        className={`ce-placeholder border-none outline-none text-sm ${isAllInputSelected && hasText ? 'bg-blue-100 text-blue-900 rounded px-0.5' : 'bg-transparent text-gray-800'}`}
                                        data-placeholder={placeholder}
                                        style={{ display: 'inline-block', verticalAlign: 'top', lineHeight: '22px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', caretColor: '#111827', minWidth: '4px', margin: '0 2px', flex: isLastTextBlock ? (pendingAttachments.length > 0 ? '0 1 auto' : '1 1 auto') : '0 1 auto' }}
                                        ref={el => { if (el && document.activeElement !== el && el.textContent !== (block.text || '')) el.textContent = block.text || ''; }}
                                        onInput={(e) => {
                                            if (isAllInputSelected) setIsAllInputSelected(false);
                                            setInputBlocks(useAgentStore.getState().inputBlocks.map(b => b.id === block.id ? { ...b, text: e.currentTarget.textContent || '' } : b));
                                            if (selectedChipId) setSelectedChipId(null);
                                        }}
                                        onPaste={(e) => handleEditorPaste(e, block.id)}
                                        onFocus={() => { commitPendingAttachments(); setActiveBlockId(block.id); setIsInputFocused(true); }}
                                        onBlur={() => setIsInputFocused(false)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); return; }

                                            // 任何普通按键输入都取消选中
                                            if (selectedChipId && !['ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
                                                setSelectedChipId(null);
                                            }

                                            const pos = getCECursorPos(e.currentTarget);
                                            const textLen = (e.currentTarget.textContent || '').length;
                                            const blockIndex = inputBlocks.findIndex(b => b.id === block.id);

                                            if (e.key === 'ArrowLeft' && pos === 0) {
                                                if (isAllInputSelected) setIsAllInputSelected(false);
                                                const prevBlock = inputBlocks[blockIndex - 1];
                                                if (prevBlock && prevBlock.type === 'file') {
                                                    e.preventDefault();
                                                    if (selectedChipId === prevBlock.id) {
                                                        const prevPrev = inputBlocks[blockIndex - 2];
                                                        if (prevPrev?.type === 'text') {
                                                            const prevEl = document.getElementById(`input-block-${prevPrev.id}`);
                                                            if (prevEl) {
                                                                setCECursorPos(prevEl, (prevEl.textContent || '').length);
                                                            }
                                                            setSelectedChipId(null);
                                                        } else if (prevPrev?.type === 'file') {
                                                            setSelectedChipId(prevPrev.id);
                                                        }
                                                    } else {
                                                        setSelectedChipId(prevBlock.id);
                                                    }
                                                }
                                            }

                                            if (e.key === 'ArrowRight' && pos === textLen) {
                                                if (isAllInputSelected) setIsAllInputSelected(false);
                                                const nextBlock = inputBlocks[blockIndex + 1];
                                                if (nextBlock && nextBlock.type === 'file') {
                                                    e.preventDefault();
                                                    if (selectedChipId === nextBlock.id) {
                                                        const nextNext = inputBlocks[blockIndex + 2];
                                                        if (nextNext?.type === 'text') {
                                                            const nextEl = document.getElementById(`input-block-${nextNext.id}`);
                                                            if (nextEl) {
                                                                setCECursorPos(nextEl, 0);
                                                            }
                                                            setSelectedChipId(null);
                                                        } else if (nextNext?.type === 'file') {
                                                            setSelectedChipId(nextNext.id);
                                                        }
                                                    } else {
                                                        setSelectedChipId(nextBlock.id);
                                                    }
                                                }
                                            }

                                            if (e.key === 'Backspace' && pos === 0) {
                                                const prevBlock = inputBlocks[blockIndex - 1];
                                                if (prevBlock && prevBlock.type === 'file') {
                                                    e.preventDefault();
                                                    if (selectedChipId === prevBlock.id) {
                                                        removeInputBlock(prevBlock.id);
                                                        setSelectedChipId(null);
                                                    } else {
                                                        setSelectedChipId(prevBlock.id);
                                                    }
                                                }
                                            }

                                            if (e.key === 'Delete' && pos === textLen) {
                                                const nextBlock = inputBlocks[blockIndex + 1];
                                                if (nextBlock && nextBlock.type === 'file') {
                                                    e.preventDefault();
                                                    if (selectedChipId === nextBlock.id) {
                                                        removeInputBlock(nextBlock.id);
                                                        setSelectedChipId(null);
                                                    } else {
                                                        setSelectedChipId(nextBlock.id);
                                                    }
                                                }
                                            }

                                            if (selectedChipId && e.key === 'ArrowLeft') {
                                                if (isAllInputSelected) setIsAllInputSelected(false);
                                                e.preventDefault();
                                                const chipIndex = inputBlocks.findIndex(b => b.id === selectedChipId);
                                                if (chipIndex === -1) return;
                                                const prevBlock = inputBlocks[chipIndex - 1];
                                                if (prevBlock?.type === 'text') {
                                                    const prevEl = document.getElementById(`input-block-${prevBlock.id}`);
                                                    if (prevEl) {
                                                        setCECursorPos(prevEl, (prevEl.textContent || '').length);
                                                    }
                                                    setSelectedChipId(null);
                                                    return;
                                                }
                                                if (prevBlock?.type === 'file') {
                                                    setSelectedChipId(prevBlock.id);
                                                    return;
                                                }

                                                moveCaretToLeftOfFirstChip();
                                            }

                                            if (selectedChipId && e.key === 'ArrowRight') {
                                                if (isAllInputSelected) setIsAllInputSelected(false);
                                                e.preventDefault();
                                                const chipIndex = inputBlocks.findIndex(b => b.id === selectedChipId);
                                                if (chipIndex === -1) return;
                                                const nextBlock = inputBlocks[chipIndex + 1];
                                                if (nextBlock?.type === 'text') {
                                                    const nextEl = document.getElementById(`input-block-${nextBlock.id}`);
                                                    if (nextEl) {
                                                        setCECursorPos(nextEl, 0);
                                                    }
                                                    setSelectedChipId(null);
                                                    return;
                                                }
                                                if (nextBlock?.type === 'file') {
                                                    setSelectedChipId(nextBlock.id);
                                                }
                                            }

                                            if (selectedChipId && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); removeInputBlock(selectedChipId); setSelectedChipId(null); }
                                        }}
                                    />
                                );
                            }
                            return null;
                        })}

                        {pendingAttachments.map((pending) => (
                            <div
                                key={pending.id}
                                className="inline-flex items-center gap-1 rounded-full pl-[2px] pr-1 select-none relative h-6 cursor-default transition-all border border-dashed border-blue-300 bg-blue-50/50 shrink-0 opacity-60 hover:opacity-100 group/pending"
                            >
                                <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0 border border-blue-200 shadow-sm">
                                    {pending.file.type.startsWith('image/')
                                        ? <img src={URL.createObjectURL(pending.file)} className="w-full h-full object-cover" />
                                        : <FileText size={10} className="text-blue-500" />}
                                </div>
                                <span className="text-[11px] text-blue-700 font-bold max-w-[100px] truncate ml-0.5">待确认</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); removePendingAttachment(pending.id); }}
                                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-blue-400 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover/pending:opacity-100"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom Toolbar */}
                <div className="px-3 py-1.5 flex items-center justify-between relative border-t border-gray-100/80">
                    <div className="flex items-center gap-1">
                        {creationMode === 'agent' && (
                            <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                                <Paperclip size={17} strokeWidth={1.8} />
                            </button>
                        )}

                        <div className="relative">
                            <button
                                onClick={() => setShowModeSelector(!showModeSelector)}
                                className="h-8 px-3.5 rounded-full flex items-center justify-center gap-1.5 text-[13px] font-medium transition-all bg-white border border-blue-200 text-blue-500 hover:bg-blue-50/50 hover:border-blue-300 shadow-sm"
                            >
                                {creationMode === 'agent' && <><Sparkles size={15} /> Agent</>}
                                {creationMode === 'image' && <><ImageIcon size={15} /> 图像</>}
                                {creationMode === 'video' && <><Video size={15} /> 视频</>}
                            </button>
                            {showModeSelector && (
                                <div className="absolute bottom-full left-0 mb-3 w-[160px] bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 overflow-hidden">
                                    <button onClick={() => { setCreationMode('agent'); setShowModeSelector(false); setIsAgentMode(true); }} className={`w-full px-4 py-2.5 flex items-center justify-between text-sm font-medium hover:bg-gray-50 transition ${creationMode === 'agent' ? 'text-blue-500' : 'text-gray-600'}`}><div className="flex items-center gap-2.5"><Sparkles size={14} className={creationMode === 'agent' ? 'text-blue-500' : 'text-gray-400'} /> Agent</div>{creationMode === 'agent' && <Check size={14} strokeWidth={2.5} />}</button>
                                    <button onClick={() => { setCreationMode('image'); setShowModeSelector(false); setIsAgentMode(false); }} className={`w-full px-4 py-2.5 flex items-center justify-between text-sm font-medium hover:bg-gray-50 transition ${creationMode === 'image' ? 'text-blue-500' : 'text-gray-600'}`}><div className="flex items-center gap-2.5"><ImageIcon size={14} className={creationMode === 'image' ? 'text-blue-500' : 'text-gray-400'} /> 图像生成器</div>{creationMode === 'image' && <Check size={14} strokeWidth={2.5} />}</button>
                                    <button onClick={() => { setCreationMode('video'); setShowModeSelector(false); setIsAgentMode(false); }} className={`w-full px-4 py-2.5 flex items-center justify-between text-sm font-medium hover:bg-gray-50 transition ${creationMode === 'video' ? 'text-blue-500' : 'text-gray-600'}`}><div className="flex items-center gap-2.5"><Video size={14} className={creationMode === 'video' ? 'text-blue-500' : 'text-gray-400'} /> 视频生成器</div>{creationMode === 'video' && <Check size={14} strokeWidth={2.5} />}</button>
                                </div>
                            )}
                        </div>

                        {/* Status Sections (Resolution / Video Specs) */}
                        {creationMode === 'image' && (
                            <div className="relative">
                                <button
                                    onClick={() => { setShowRatioPicker(!showRatioPicker); setShowModelPicker(false); setShowVideoSettingsDropdown(false); }}
                                    className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-gray-50 rounded-lg transition-colors group"
                                >
                                    <span className="text-[13px] font-bold text-gray-800">{imageGenRes} · {imageGenRatio}</span>
                                    <ChevronDown size={14} className={`text-gray-400 group-hover:text-gray-600 transition-transform ${showRatioPicker ? 'rotate-180' : ''}`} />
                                </button>
                                {showRatioPicker && (
                                    <div className="absolute bottom-full left-0 mb-3 w-[260px] bg-white rounded-[24px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] border border-gray-100 p-5 z-[70] animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-4">分辨率</div>
                                        <div className="flex gap-2 mb-6">
                                            {['1K', '2K', '4K'].map(res => (
                                                <button key={res} onClick={() => setImageGenRes(res)} className={`flex-1 py-1.5 text-[12px] font-bold rounded-xl transition-all ${imageGenRes === res ? 'bg-gray-200 text-black shadow-inner' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                                                    {res}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-4">Size</div>
                                        <div className="grid grid-cols-4 gap-2.5">
                                            {[
                                                { r: '21:9', i: 'w-5 h-2' }, { r: '16:9', i: 'w-5 h-3' }, { r: '4:3', i: 'w-5 h-3.5' }, { r: '3:2', i: 'w-5 h-3.5' },
                                                { r: '1:1', i: 'w-4 h-4' }, { r: '9:16', i: 'w-3 h-5' }, { r: '3:4', i: 'w-3.5 h-5' }, { r: '2:3', i: 'w-3.5 h-5' },
                                                { r: '5:4', i: 'w-4.5 h-4' }, { r: '4:5', i: 'w-4 h-4.5' }
                                            ].map(item => (
                                                <button
                                                    key={item.r}
                                                    onClick={() => { setImageGenRatio(item.r); setShowRatioPicker(false); }}
                                                    className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border transition-all ${imageGenRatio === item.r ? 'bg-gray-100 border-gray-300 ring-1 ring-gray-300' : 'border-gray-100 hover:border-gray-300 bg-white'}`}
                                                >
                                                    <div className={`border-[1.5px] border-gray-400 rounded-[2px] ${item.i} ${imageGenRatio === item.r ? 'bg-gray-400' : 'bg-transparent'}`} />
                                                    <span className="text-[10px] font-bold text-gray-600">{item.r}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {creationMode === 'video' && (
                            <div className="relative">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowVideoSettingsDropdown(!showVideoSettingsDropdown); setShowRatioPicker(false); setShowModelPicker(false); }}
                                    className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-gray-50 rounded-lg transition-colors group"
                                >
                                    <span className="text-[13px] font-bold text-gray-800">Frames · {videoGenRatio} · {videoGenDuration}</span>
                                    <ChevronDown size={14} className={`text-gray-400 group-hover:text-gray-600 transition-transform ${showVideoSettingsDropdown ? 'rotate-180' : ''}`} />
                                </button>
                                {showVideoSettingsDropdown && (
                                    <div onClick={(e) => e.stopPropagation()} className="absolute bottom-full left-0 mb-3 w-[300px] bg-white rounded-[24px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] border border-gray-100 p-5 z-[70] animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col gap-5">
                                        <div className="flex flex-col gap-2.5">
                                            <div className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Generate method</div>
                                            <div className="flex bg-gray-100 p-1 rounded-xl">
                                                {[{ id: 'startEnd', label: '首尾帧' }, { id: 'multiRef', label: '多图参考' }].map(m => (
                                                    <button key={m.id} onClick={() => setVideoGenMode(m.id as any)} className={`flex-1 py-1.5 text-[12px] font-bold rounded-lg transition-all ${videoGenMode === m.id ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}>
                                                        {m.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2.5">
                                            <div className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Size</div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {(videoGenModel === 'kling-3.0' ? [{ r: '16:9', i: 'w-6 h-3.5' }, { r: '9:16', i: 'w-3.5 h-6' }, { r: '1:1', i: 'w-4 h-4' }] : [{ r: '16:9', i: 'w-6 h-3.5' }, { r: '9:16', i: 'w-3.5 h-6' }, { r: '1:1', i: 'w-4 h-4' }, { r: '4:3', i: 'w-5 h-4' }, { r: '3:4', i: 'w-4 h-5' }, { r: '21:9', i: 'w-6 h-2.5' }]).map(item => (
                                                    <button key={item.r} onClick={() => setVideoGenRatio(item.r)} className={`flex flex-col items-center justify-center gap-2 py-3.5 rounded-xl border transition-all h-20 ${videoGenRatio === item.r ? 'bg-gray-100 border-gray-200' : 'border-gray-100 hover:border-gray-200 bg-white'}`}>
                                                        <div className={`border-[1.5px] border-gray-400 rounded-[2px] ${item.i} ${videoGenRatio === item.r ? 'bg-gray-400' : 'bg-transparent'}`} />
                                                        <span className="text-[11px] font-bold text-gray-600">{item.r}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2.5">
                                            <div className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Duration</div>
                                            <div className="flex gap-2">
                                                {(videoGenModel === 'kling-3.0' ? ['5s', '10s'] : videoGenModel === 'sora-2' ? ['4s', '8s', '12s'] : ['4s', '6s', '8s']).map(sec => (
                                                    <button key={sec} onClick={() => setVideoGenDuration(sec)} className={`flex-1 py-2 text-[12px] font-bold rounded-xl border transition-all ${videoGenDuration === sec ? 'bg-gray-100 border-gray-200 text-black' : 'bg-white border-gray-100 text-gray-400'}`}>
                                                        {sec}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3">

                        {/* Model / Send Controls */}
                        {(creationMode === 'image' || creationMode === 'video') && (
                            <>
                                <div className="relative">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowModelPicker(!showModelPicker); setShowRatioPicker(false); setShowVideoSettingsDropdown(false); }}
                                        className={`w-9 h-9 flex items-center justify-center rounded-full transition-all border ${showModelPicker ? 'bg-black text-white border-black shadow-lg' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300 shadow-sm'}`}
                                    >
                                        {creationMode === 'video' ? <Activity size={18} strokeWidth={2} /> : <Banana size={18} strokeWidth={2} />}
                                    </button>
                                    {showModelPicker && (
                                        <div className="absolute bottom-full right-0 mb-3 w-[260px] bg-white rounded-[24px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] border border-gray-100 p-4 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <div className="px-1 mb-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                默认生成模型
                                            </div>
                                            <div className="flex flex-col gap-2.5">
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={creationMode === 'video' ? videoGenModel : preferredImageModel}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        if (creationMode === 'video') setVideoGenModel(val as any);
                                                        else setPreferredImageModel(val as any);
                                                        setAutoModelSelect(false);
                                                    }}
                                                    placeholder="亦可直接输入自定义模型标识符"
                                                    className="w-full px-4 py-2.5 bg-gray-50/50 border border-gray-200 hover:bg-white focus:bg-white rounded-xl text-[13px] font-bold text-gray-800 outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all placeholder:font-medium placeholder:text-gray-400"
                                                />
                                                
                                                {/* Preset List */}
                                                <div className="flex flex-col gap-1 mt-1 max-h-[160px] overflow-y-auto pr-1 select-none custom-scrollbar">
                                                    {(creationMode === 'video' ? MODEL_OPTIONS.video : MODEL_OPTIONS.image).map(preset => {
                                                        const isSelected = (creationMode === 'video' && videoGenModel === preset.id) || 
                                                                           (creationMode === 'image' && preferredImageModel === preset.id);
                                                        
                                                        return (
                                                            <button 
                                                                key={preset.id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (creationMode === 'video') setVideoGenModel(preset.id as any);
                                                                    else setPreferredImageModel(preset.id as any);
                                                                    setAutoModelSelect(false);
                                                                    setShowModelPicker(false);
                                                                }}
                                                                className={`text-left px-3 py-2.5 rounded-xl transition-all w-full flex items-center justify-between group ${
                                                                    isSelected ? 'bg-black text-white' : 'hover:bg-gray-100 text-gray-700'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2.5">
                                                                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isSelected ? 'bg-white/10 text-white' : 'bg-white shadow-sm border border-gray-100 text-gray-600'}`}>
                                                                        <preset.icon size={13} strokeWidth={2.5} />
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className={`text-[13px] font-bold ${isSelected ? 'text-white' : 'text-gray-900 group-hover:text-black'}`}>{preset.name}</span>
                                                                            {preset.badge && (
                                                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${
                                                                                    isSelected ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-500 border border-blue-100/50'
                                                                                }`}>
                                                                                    {preset.badge}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {isSelected && <Check size={14} className="text-white shrink-0" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                <div className="text-[10px] text-gray-400 font-medium px-1 leading-relaxed mt-1">
                                                    选择快捷预设或直接输入。若未找到通道可能导致响应失败。
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => handleSend(undefined, imageGenUploads.length > 0 ? imageGenUploads : [])}
                                    disabled={imageGenUploads.length === 0 && inputBlocks.every(b => (b.type === 'text' && !b.text))}
                                    className="h-9 pl-3 pr-4 rounded-full flex items-center gap-2 text-[13px] font-bold transition bg-[#f3f4f6] text-[#6b7280] hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50"
                                >
                                    <Zap size={14} fill="currentColor" strokeWidth={0} className="text-blue-400" />
                                    <span>生成</span>
                                </button>
                            </>
                        )}

                        {creationMode === 'agent' && (
                            <>
                                <div className="h-8 bg-gray-100 rounded-full flex items-center p-1 gap-1">
                                    <button onClick={() => handleModeSwitch('thinking')} className={`w-6 h-6 flex items-center justify-center rounded-full ${modelMode === 'thinking' ? 'bg-white shadow-sm' : 'text-gray-400'}`}><Lightbulb size={14} /></button>
                                    <button onClick={() => handleModeSwitch('fast')} className={`w-6 h-6 flex items-center justify-center rounded-full ${modelMode === 'fast' ? 'bg-white shadow-sm' : 'text-gray-400'}`}><Zap size={14} /></button>
                                </div>
                                <button onClick={() => setWebEnabled(!webEnabled)} className={`w-8 h-8 rounded-full flex items-center justify-center ${webEnabled ? 'text-blue-500' : 'text-gray-500'}`}><Globe size={16} /></button>
                                <div className="relative">
                                    <button onClick={() => setShowModelPreference(!showModelPreference)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500"><Box size={16} /></button>
                                    {showModelPreference && (
                                        <div className="absolute bottom-full right-0 mb-4 w-[350px] bg-white rounded-[32px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border border-gray-100 z-50 p-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
                                            {/* Header */}
                                            <div className="flex items-center justify-between mb-6">
                                                <h3 className="text-[17px] font-bold tracking-tight text-gray-900 font-display">模型偏好</h3>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">自动选择</span>
                                                    <button
                                                        onClick={() => setAutoModelSelect(!autoModelSelect)}
                                                        className={`w-11 h-6 rounded-full transition-all duration-300 relative ${autoModelSelect ? 'bg-black' : 'bg-gray-200 p-0.5'}`}
                                                    >
                                                        <motion.div
                                                            animate={{ x: autoModelSelect ? 24 : 2 }}
                                                            className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                                                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                        />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Tabs */}
                                            <div className="flex bg-gray-100/60 rounded-2xl p-1.5 mb-6">
                                                {['image', 'video', '3d'].map(tab => (
                                                    <button
                                                        key={tab}
                                                        onClick={() => setModelPreferenceTab(tab as any)}
                                                        className={`flex-1 py-2 text-[11px] font-bold rounded-xl transition-all duration-300 uppercase tracking-wider ${modelPreferenceTab === tab ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                    >
                                                        {tab}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Model Input */}
                                            <div className="space-y-4 px-1 pb-2">
                                                <div className="text-[11px] font-bold text-gray-600 uppercase">
                                                    {modelPreferenceTab === 'image' ? '图像' : modelPreferenceTab === 'video' ? '视频' : '3D'} 生成调度模型
                                                </div>
                                                <input
                                                    type="text"
                                                    value={
                                                        modelPreferenceTab === 'image' ? preferredImageModel :
                                                        modelPreferenceTab === 'video' ? preferredVideoModel :
                                                        preferred3DModel
                                                    }
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (modelPreferenceTab === 'image') setPreferredImageModel(val as any);
                                                        else if (modelPreferenceTab === 'video') setPreferredVideoModel(val as any);
                                                        else setPreferred3DModel(val as any);
                                                        setAutoModelSelect(false);
                                                    }}
                                                    placeholder={`填写自定义或选择下方预设`}
                                                    className={`w-full px-4 py-3 bg-gray-50/50 border hover:bg-white focus:bg-white rounded-xl text-[13px] text-gray-800 font-bold outline-none focus:ring-4 focus:ring-black/5 transition-all ${!autoModelSelect ? 'border-black' : 'border-gray-200 focus:border-black'}`}
                                                />
                                                
                                                {/* Preset List */}
                                                <div className="flex flex-col gap-1.5 mt-2 max-h-[220px] overflow-y-auto pr-2 select-none custom-scrollbar border-b border-gray-100 pb-4">
                                                    {(modelPreferenceTab === 'video' ? MODEL_OPTIONS.video : 
                                                      modelPreferenceTab === 'image' ? MODEL_OPTIONS.image : MODEL_OPTIONS['3d']).map(preset => {
                                                        const isSelected = (modelPreferenceTab === 'video' && preferredVideoModel === preset.id) || 
                                                                           (modelPreferenceTab === 'image' && preferredImageModel === preset.id) ||
                                                                           (modelPreferenceTab === '3d' && preferred3DModel === preset.id);

                                                        return (
                                                            <button 
                                                                key={preset.id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (modelPreferenceTab === 'video') setPreferredVideoModel(preset.id as any);
                                                                    else if (modelPreferenceTab === 'image') setPreferredImageModel(preset.id as any);
                                                                    else setPreferred3DModel(preset.id as any);
                                                                    setAutoModelSelect(false);
                                                                    setShowModelPreference(false);
                                                                }}
                                                                className={`text-left p-3 rounded-2xl transition-all border ${
                                                                    isSelected 
                                                                    ? 'bg-gray-50/80 border-gray-200/60 shadow-sm' 
                                                                    : 'bg-transparent border-transparent hover:bg-gray-50/50 hover:border-gray-100'
                                                                }`}
                                                            >
                                                                <div className="flex gap-3">
                                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                                                        isSelected ? 'bg-black text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-700 shadow-sm'
                                                                    }`}>
                                                                        <preset.icon size={16} strokeWidth={2} />
                                                                    </div>
                                                                    <div className="flex flex-col flex-1 min-w-0 justify-center">
                                                                        <div className="flex items-center justify-between mb-0.5">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className={`text-[14px] font-bold ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                                                                                    {preset.name}
                                                                                </span>
                                                                                {preset.badge && (
                                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-blue-50 text-blue-500 border border-blue-100/50">
                                                                                        {preset.badge}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {isSelected && (
                                                                                <div className="w-5 h-5 rounded-md bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                                                                                    <Check size={12} className="text-black" strokeWidth={3} />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-xs text-gray-500 font-medium truncate">{preset.desc}</span>
                                                                        {preset.time && (
                                                                            <div className="mt-1.5 flex items-center">
                                                                                <span className="text-[10px] font-bold text-gray-400 bg-gray-100/80 px-1.5 py-0.5 rounded-md">
                                                                                    {preset.time}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                <p className="text-[11px] text-gray-400 font-medium leading-relaxed pt-2">
                                                    绕过原有选择限制。系统将会将您的请求调度至设定的模型。填入的值须确保您绑定的 API 供应商提供支持。<br/>
                                                    若在特定任务中由于未找到模型导致失败，重试前请核对模型标识符。
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => handleSend()} className="w-9 h-9 rounded-full flex items-center justify-center bg-black text-white hover:bg-gray-800 transition shadow-md shrink-0"><ArrowUp size={18} strokeWidth={2.5} /></button>
                            </>
                        )}
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
                        if (e.target.files) {
                            handlePickedFiles(Array.from(e.target.files));
                        }
                        if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                        }
                    }}
                />

                {/* Object Marked Popover for Sidebar Chips */}
                {editingMarkerId && markers.find(m => m.id === editingMarkerId) && (() => {
                    const marker = markers.find(m => m.id === editingMarkerId);
                    const block = inputBlocks.find(b => b.type === 'file' && (b.file as any).markerId === editingMarkerId);
                    const chipEl = document.getElementById(`marker-chip-${block?.id}`);
                    const rect = chipEl?.getBoundingClientRect();

                    if (!marker) return null;

                    return ReactDOM.createPortal(
                        <AnimatePresence>
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                className="fixed z-[10000] w-[220px] bg-white rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.12)] border border-gray-100 overflow-hidden flex flex-col"
                                style={{
                                    left: rect ? rect.left + rect.width / 2 : '50%',
                                    top: rect ? rect.top - 180 : '50%',
                                    transform: 'translateX(-50%)'
                                }}
                            >
                                <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Object Marked</span>
                                    <button
                                        onClick={() => setEditingMarkerId(null)}
                                        className="p-1 hover:bg-gray-100 rounded-full transition text-gray-400"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>

                                <div className="p-4 flex flex-col gap-3">
                                    <div className="flex items-center gap-3 bg-gray-50/80 p-2.5 rounded-2xl border border-gray-100/50">
                                        <div className="w-12 h-12 rounded-xl overflow-hidden shadow-sm border border-white shrink-0">
                                            <img src={marker.cropUrl} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[10px] text-gray-400 font-bold mb-0.5 uppercase">AI 分析</div>
                                            <div className="text-[13px] font-bold text-gray-700 truncate">{marker.analysis || '识别中...'}</div>
                                        </div>
                                    </div>

                                    <div className="relative group">
                                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
                                            <MapPin size={14} strokeWidth={2} />
                                        </div>
                                        <input
                                            autoFocus
                                            value={editingMarkerLabel}
                                            onChange={(e) => setEditingMarkerLabel(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    if (onSaveMarkerLabel) onSaveMarkerLabel(editingMarkerId, editingMarkerLabel);
                                                    setEditingMarkerId(null);
                                                }
                                            }}
                                            placeholder="自定义描述..."
                                            className="w-full h-10 pl-9 pr-10 bg-gray-50/50 hover:bg-white focus:bg-white border border-transparent focus:border-blue-500 rounded-2xl text-[13px] font-bold text-gray-800 transition-all outline-none"
                                        />
                                        <button
                                            onClick={() => {
                                                if (onSaveMarkerLabel) onSaveMarkerLabel(editingMarkerId, editingMarkerLabel);
                                                setEditingMarkerId(null);
                                            }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-blue-500 hover:bg-blue-600 text-white rounded-[10px] flex items-center justify-center shadow-md shadow-blue-500/20 transition-all active:scale-95"
                                        >
                                            <Check size={14} strokeWidth={3} />
                                        </button>
                                    </div>
                                </div>
                                <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white"></div>
                            </motion.div>
                        </AnimatePresence>,
                        document.body
                    );
                })()}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                        if (e.target.files) handlePickedFiles(Array.from(e.target.files));
                        if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                />
            </div>
        </div>
    );
};
