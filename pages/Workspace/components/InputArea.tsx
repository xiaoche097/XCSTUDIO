import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronDown, Plus, X, ArrowUp, Paperclip, Lightbulb, Zap, Globe, Box, Sparkles,
    Image as ImageIcon, Check, Video, FileText, Banana, ChevronLeft, ChevronRight,
    Activity, Layers, Cloud, ShieldCheck, Monitor
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
        { id: 'GPT Image 1.5', name: 'GPT Image 1.5', desc: "OpenAI's most advanced image model.", time: '120s', icon: Sparkles },
        { id: 'Seedream5.0', name: 'Seedream 5.0 Lite', desc: "Bytedance's latest image generation model.", time: '120s', icon: Activity },
        { id: 'Flux.2 Max', name: 'Flux.2 Max', desc: "BFL's image generation model.", time: '10s', icon: Layers },
        { id: 'Flux.2 Pro', name: 'Flux.2 Pro', desc: "BFL's image generation model.", time: '10s', icon: Layers },
        { id: 'Seedream 4.5', name: 'Seedream 4.5', desc: "Bytedance's latest image generation model.", time: '10s', icon: Activity },
        { id: 'Nano Banana', name: 'Nano Banana', desc: "Google's image generation model.", time: '20s', icon: Banana },
        { id: 'Seedream 4', name: 'Seedream 4', desc: "Bytedance's latest image generation model.", time: '10s', icon: Activity },
        { id: 'Gemini Imagen 4', name: 'Gemini Imagen 4', desc: "Google's most advanced image model.", time: '10s', icon: Sparkles },
        { id: 'Midjourney', name: 'Midjourney', desc: 'A model that transforms text into artistic visuals.', time: '20s', icon: Globe },
    ],
    video: [
        { id: 'Kling 3.0', name: 'Kling 3.0', desc: "Kling's latest video model.", time: '300s', icon: Video, badge: '蓝海5型' },
        { id: 'Kling 3.0 Omni', name: 'Kling 3.0 Omni', desc: "Kling's latest video model.", time: '300s', icon: Video, badge: '蓝海5型' },
        { id: 'Seedance 1.5 Pro', name: 'Seedance 1.5 Pro', desc: "Bytedance's latest video generation model.", time: '300s', icon: Activity },
        { id: 'Kling 2.8', name: 'Kling 2.8', desc: "Kling's video model with integrated audio.", time: '300s', icon: Video, badge: '蓝海5型' },
        { id: 'Wan 2.6', name: 'Wan 2.6', desc: 'Video generation model with built-in audio.', time: '600s', icon: Activity },
        { id: 'Sora 2 Pro', name: 'Sora 2 Pro', desc: "OpenAI's flagship video generation model with synced audio.", time: '300s', icon: Sparkles, badge: '通联专网' },
        { id: 'Sora 2', name: 'Sora 2', desc: "OpenAI's flagship video generation model with synced audio.", time: '300s', icon: Sparkles, badge: '通联专网' },
        { id: 'Veo 3.1', name: 'Veo 3.1', desc: "Google's latest video model with integrated audio and visuals.", time: '180s', icon: Cloud, badge: '蓝海5型' },
        { id: 'Veo 3.1 Fast', name: 'Veo 3.1 Fast', desc: "Google's latest video model with integrated audio and visuals.", time: '180s', icon: Cloud, badge: '蓝海5型' },
        { id: 'Kling 01', name: 'Kling 01', desc: "Kling's video model.", time: '300s', icon: Video, badge: '会员专属' },
        { id: 'Hailuo 2.3', name: 'Hailuo 2.3', desc: "Hailuo's latest video model.", time: '180s', icon: Activity },
        { id: 'Veo 3', name: 'Veo 3', desc: "Google's video model with integrated audio and visuals.", time: '180s', icon: Cloud, badge: '通联专网' },
        { id: 'Vidu Q2', name: 'Vidu Q2', desc: "Vidu's latest video model.", time: '300s', icon: Activity },
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
    markers,
}) => {
    const [showImageUploadMenu, setShowImageUploadMenu] = useState(false);
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
    const imageGenUpload = useAgentStore(s => s.imageGenUpload);
    const isPickingFromCanvas = useAgentStore(s => s.isPickingFromCanvas);

    const {
        setInputBlocks, removeInputBlock, insertInputFile,
        setActiveBlockId, setSelectionIndex,
        setVideoGenRatio, setVideoGenDuration, setVideoGenModel, setVideoGenMode,
        setVideoStartFrame, setVideoEndFrame, setVideoMultiRefs,
        setShowVideoModelDropdown, setWebEnabled, setIsAgentMode,
        setImageGenUpload, setIsPickingFromCanvas,
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

    return (
        <div className="px-2 pb-2 pt-0.5 z-20">
            <div
                className={`bg-white rounded-2xl border shadow-sm transition-all duration-200 relative group focus-within:shadow-md focus-within:border-gray-300 flex flex-col overflow-visible ${isDragOver ? 'border-blue-400 ring-2 ring-blue-100 bg-blue-50/30' : 'border-gray-200'}`}
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
                    <div className="transition-all duration-300 overflow-visible px-4 flex flex-col justify-end" style={{ maxHeight: isVideoPanelHovered ? '92px' : '0px', opacity: isVideoPanelHovered ? 1 : 0, paddingTop: isVideoPanelHovered ? '16px' : '0px', paddingBottom: isVideoPanelHovered ? '4px' : '0px' }}>
                        <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                                <div
                                    onClick={() => setShowImageUploadMenu(v => !v)}
                                    className={`w-[72px] h-[72px] border border-dashed border-gray-200 rounded-[14px] flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition group/upload bg-gray-50/50 ${isPickingFromCanvas ? 'border-blue-400 bg-blue-50/40' : ''}`}
                                >
                                    <Plus size={20} strokeWidth={1.5} className="text-gray-300 group-hover/upload:text-blue-500 transition mb-1" />
                                    <span className="text-[12px] font-bold text-gray-400 group-hover/upload:text-blue-500 transition">图片</span>
                                </div>

                                {showImageUploadMenu && (
                                    <div className="absolute bottom-full right-0 mb-2 w-32 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-[80]">
                                        <button
                                            onClick={() => {
                                                const input = document.createElement('input');
                                                input.type = 'file';
                                                input.accept = 'image/*';
                                                input.onchange = (e) => {
                                                    const file = (e.target as HTMLInputElement).files?.[0];
                                                    if (file) {
                                                        setImageGenUpload(file);
                                                    }
                                                };
                                                input.click();
                                                setShowImageUploadMenu(false);
                                            }}
                                            className="w-full px-3 py-2 text-left text-[12px] text-gray-700 hover:bg-gray-50 transition"
                                        >
                                            上传图片
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsPickingFromCanvas(true);
                                                setShowImageUploadMenu(false);
                                            }}
                                            className="w-full px-3 py-2 text-left text-[12px] text-gray-700 hover:bg-gray-50 transition"
                                        >
                                            从画布选择
                                        </button>
                                    </div>
                                )}
                            </div>

                            {imageGenUpload && (
                                <div className="relative w-[72px] h-[72px] border border-gray-200 rounded-[14px] overflow-visible shadow-sm shrink-0 bg-white">
                                    <img src={URL.createObjectURL(imageGenUpload)} className="w-full h-full object-cover rounded-[14px]" />
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setImageGenUpload(null); setIsPickingFromCanvas(false); }}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-black/80 hover:bg-black text-white rounded-full flex items-center justify-center z-10 shadow-sm border border-white/20"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            )}

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
                    className={`px-3 pt-2 pb-4 cursor-text transition-all`}
                    onMouseDown={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('[id^="file-chip-"]') || target.closest('[id^="marker-chip-"]')) return;
                        selectLatestCanvasChip();
                    }}
                    onClick={(e) => {
                    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.input-flow-container') === e.currentTarget.querySelector('.input-flow-container')) {
                        const lastText = inputBlocks.filter(b => b.type === 'text').pop();
                        const targetId = lastText?.id || inputBlocks[inputBlocks.length - 1].id;
                        const el = document.getElementById(`input-block-${targetId}`);
                        el?.focus();
                    }
                }}>
                    <div className="input-flow-container flex flex-wrap items-center gap-[2px]" style={{ minHeight: '24px', wordBreak: 'break-word', lineHeight: '24px' }}>
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
                                                className={`inline-flex items-center gap-0 rounded-full pl-[2px] pr-1 cursor-default relative group select-none h-6 transition-all border ${isSelected ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-400' : 'bg-gray-50/50 border-gray-100 hover:bg-gray-100'}`}
                                                onClick={(e) => { e.stopPropagation(); setSelectedChipId(isSelected ? null : block.id); }}
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
                                    return (
                                        <div
                                            key={block.id}
                                            id={`file-chip-${block.id}`}
                                            className={`inline-flex items-center gap-1 rounded-full pl-[2px] pr-1.5 select-none relative group h-6 cursor-default transition-all border shrink-0 ${isSelected ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-400' : isInputFocused ? 'bg-blue-50/30 border-blue-100' : 'bg-gray-50/50 border-gray-100 hover:bg-gray-100'}`}
                                            onClick={(e) => { e.stopPropagation(); setSelectedChipId(isSelected ? null : block.id); }}
                                            onMouseEnter={() => setHoveredChipId(block.id)}
                                            onMouseLeave={() => setHoveredChipId(null)}
                                        >
                                            <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0 border border-gray-100 shadow-sm">
                                                {file.type.startsWith('image/') ? <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" /> : <FileText size={10} className="text-gray-500" />}
                                            </div>
                                            <span className="text-[11px] text-gray-700 font-bold max-w-[100px] truncate ml-0.5">{chipLabel}</span>
                                            <button onClick={(e) => { e.stopPropagation(); removeInputBlock(block.id); setSelectedChipId(null); }} className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 ml-0.5"><X size={10} /></button>

                                            {isHovered && isSelected && file.type.startsWith('image/') && (() => {
                                                const MAX_SIZE = 220;
                                                const ratio = hasValidAspect ? (imageWidth / imageHeight) : 1;
                                                let renderWidth = MAX_SIZE;
                                                let renderHeight = MAX_SIZE;

                                                if (ratio > 1) {
                                                    renderHeight = MAX_SIZE / ratio;
                                                } else {
                                                    renderWidth = MAX_SIZE * ratio;
                                                }

                                                const chipRect = document.getElementById(`file-chip-${block.id}`)?.getBoundingClientRect();
                                                const left = (chipRect?.left || 0) + (chipRect?.width || 0) / 2 - (renderWidth / 2);
                                                const top = (chipRect?.top || 0) - renderHeight - 12;

                                                return ReactDOM.createPortal(
                                                    <div
                                                        className="fixed z-[9999] pointer-events-none bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden"
                                                        style={{ left, top, width: renderWidth, height: renderHeight }}
                                                    >
                                                        <img src={URL.createObjectURL(file)} className="w-full h-full object-contain bg-white" />
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
                                const placeholder = isLastTextBlock && textBlocks.length <= 1 ? (creationMode === 'agent' ? "请输入你的设计需求" : "今天我们要创作什么") : "";

                                return (
                                    <span
                                        key={block.id}
                                        id={`input-block-${block.id}`}
                                        contentEditable
                                        suppressContentEditableWarning
                                        className="ce-placeholder outline-none text-sm text-gray-800"
                                        data-placeholder={placeholder}
                                        style={{ display: 'inline-block', verticalAlign: 'middle', lineHeight: '24px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', caretColor: '#111827', minWidth: '2px', flex: isLastTextBlock ? '1 1 auto' : '0 1 auto' }}
                                        ref={el => { if (el && document.activeElement !== el && el.textContent !== (block.text || '')) el.textContent = block.text || ''; }}
                                        onInput={(e) => {
                                            setInputBlocks(useAgentStore.getState().inputBlocks.map(b => b.id === block.id ? { ...b, text: e.currentTarget.textContent || '' } : b));
                                            if (selectedChipId) setSelectedChipId(null);
                                        }}
                                        onFocus={() => { setActiveBlockId(block.id); setIsInputFocused(true); }}
                                        onBlur={() => setIsInputFocused(false)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); return; }
                                            
                                            // 任何普通按键输入都取消选中
                                            if (selectedChipId && !['ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
                                                setSelectedChipId(null);
                                            }
                                            
                                            const selection = window.getSelection();
                                            if (!selection || selection.rangeCount === 0) return;
                                            const range = selection.getRangeAt(0);
                                            const pos = range.startOffset;
                                            const textLen = block.text?.length || 0;
                                            const blockIndex = inputBlocks.findIndex(b => b.id === block.id);

                                            if (e.key === 'ArrowLeft' && pos === 0) {
                                                const prevBlock = inputBlocks[blockIndex - 1];
                                                if (prevBlock && prevBlock.type === 'file') {
                                                    e.preventDefault();
                                                    if (selectedChipId === prevBlock.id) {
                                                        // 第二阶段：已选中，执行跳转
                                                        const prevPrev = inputBlocks[blockIndex - 2];
                                                        if (prevPrev?.type === 'text') {
                                                            const prevEl = document.getElementById(`input-block-${prevPrev.id}`);
                                                            if (prevEl) {
                                                                prevEl.focus();
                                                                const range = document.createRange();
                                                                range.selectNodeContents(prevEl);
                                                                range.collapse(false);
                                                                selection.removeAllRanges();
                                                                selection.addRange(range);
                                                            }
                                                        }
                                                        setSelectedChipId(null);
                                                    } else {
                                                        // 第一阶段：先选中图片
                                                        setSelectedChipId(prevBlock.id);
                                                    }
                                                }
                                            }

                                            if (e.key === 'ArrowRight' && pos === textLen) {
                                                const nextBlock = inputBlocks[blockIndex + 1];
                                                if (nextBlock && nextBlock.type === 'file') {
                                                    e.preventDefault();
                                                    if (selectedChipId === nextBlock.id) {
                                                        // 第二阶段：已选中，执行跳转
                                                        const nextNext = inputBlocks[blockIndex + 2];
                                                        if (nextNext?.type === 'text') {
                                                            const nextEl = document.getElementById(`input-block-${nextNext.id}`);
                                                            if (nextEl) {
                                                                nextEl.focus();
                                                                const range = document.createRange();
                                                                range.selectNodeContents(nextEl);
                                                                range.collapse(true);
                                                                selection.removeAllRanges();
                                                                selection.addRange(range);
                                                            }
                                                        }
                                                        setSelectedChipId(null);
                                                    } else {
                                                        // 第一阶段：先选中图片
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

                                            if (selectedChipId && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); removeInputBlock(selectedChipId); setSelectedChipId(null); }
                                        }}
                                    />
                                );
                            }
                            return null;
                        })}
                    </div>
                </div>

                {/* Bottom Toolbar */}
                <div className="px-2 pb-2.5 pt-0 flex items-center justify-between relative">
                    <div className="flex items-center gap-1">
                        {creationMode === 'agent' && (
                            <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                                <Paperclip size={17} strokeWidth={1.8} />
                            </button>
                        )}

                        <div className="relative">
                            <button onClick={() => setShowModeSelector(!showModeSelector)} className="h-[30px] px-3.5 rounded-full flex items-center gap-1.5 text-[13px] font-medium transition-all bg-blue-50 text-[#3B82F6]">
                                {creationMode === 'agent' && <><Sparkles size={14} /> Agent</>}
                                {creationMode === 'image' && <><ImageIcon size={14} /> 图像</>}
                                {creationMode === 'video' && <><Video size={14} /> 视频</>}
                            </button>
                            {showModeSelector && (
                                <div className="absolute bottom-full left-0 mb-2 w-36 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50">
                                    <button onClick={() => { setCreationMode('agent'); setShowModeSelector(false); setIsAgentMode(true); }} className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-gray-50 transition">Agent</button>
                                    <button onClick={() => { setCreationMode('image'); setShowModeSelector(false); setIsAgentMode(false); }} className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-gray-50 transition">图像生成器</button>
                                    <button onClick={() => { setCreationMode('video'); setShowModeSelector(false); setIsAgentMode(false); }} className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-gray-50 transition">视频生成器</button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-1 justify-end">
                        {creationMode === 'image' && (
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <button
                                        onClick={() => { setShowRatioPicker(!showRatioPicker); setShowModelPicker(false); }}
                                        className="h-9 px-4 flex items-center gap-2 bg-gray-50 text-[13px] font-bold text-gray-700 hover:bg-gray-100 rounded-full transition whitespace-nowrap border border-gray-100"
                                    >
                                        <span>{imageGenRes} · {imageGenRatio}</span>
                                        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-300 ${showRatioPicker ? 'rotate-180' : ''}`} />
                                    </button>
                                    {showRatioPicker && (
                                        <div className="absolute bottom-full right-0 mb-3 w-[260px] bg-white rounded-[24px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] border border-gray-100 p-5 z-[70] animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <div className="text-[12px] text-gray-400 font-bold uppercase tracking-widest mb-4">分辨率</div>
                                            <div className="flex gap-2 mb-6">
                                                {['1K', '2K', '4K'].map(res => (
                                                    <button key={res} onClick={() => { setImageGenRes(res); }} className={`flex-1 py-2 text-[12px] font-bold rounded-xl transition-all ${imageGenRes === res ? 'bg-gray-200 text-black shadow-inner' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                                                        {res}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="text-[12px] text-gray-400 font-bold uppercase tracking-widest mb-4">Size</div>
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

                                <div className="relative">
                                    <button
                                        onClick={() => { setShowModelPicker(!showModelPicker); setShowRatioPicker(false); }}
                                        className="w-9 h-9 flex items-center justify-center bg-white border border-gray-100 text-gray-500 hover:text-black hover:border-gray-300 rounded-full transition shadow-sm"
                                    >
                                        <Banana size={18} strokeWidth={1.5} />
                                    </button>
                                    {showModelPicker && (
                                        <div className="absolute bottom-full right-0 mb-3 w-[240px] bg-white rounded-[24px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] border border-gray-100 p-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            {MODEL_OPTIONS.image.map(m => (
                                                <button
                                                    key={m.id}
                                                    onClick={() => { setPreferredImageModel(m.id as ImageModel); setShowModelPicker(false); setAutoModelSelect(false); }}
                                                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${preferredImageModel === m.id && !autoModelSelect ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50'}`}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <m.icon size={16} strokeWidth={1.5} className="text-gray-500" />
                                                        <span>{m.name}</span>
                                                    </div>
                                                    {preferredImageModel === m.id && !autoModelSelect && <Check size={14} strokeWidth={2.5} />}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => handleSend(undefined, imageGenUpload ? [imageGenUpload] : [])}
                                    disabled={!imageGenUpload && inputBlocks.every(b => (b.type === 'text' && !b.text) || (b.type === 'file' && !b.file))}
                                    className="h-9 px-4 rounded-full flex items-center justify-center text-[14px] font-bold shadow-sm transition bg-gradient-to-b from-gray-100 to-gray-200 text-gray-500 border border-gray-200 hover:from-gray-200 hover:to-gray-300 disabled:opacity-50"
                                >
                                    发送
                                </button>
                            </div>
                        )}

                        {creationMode === 'video' && (
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <button
                                        onClick={() => { setShowVideoSettingsDropdown(!showVideoSettingsDropdown); }}
                                        className="h-9 px-4 flex items-center gap-2 bg-gray-50 text-[13px] font-bold text-gray-700 hover:bg-gray-100 rounded-full transition whitespace-nowrap border border-gray-100"
                                    >
                                        <span>Frames · {videoGenRatio} · {videoGenDuration}</span>
                                        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-300 ${showVideoSettingsDropdown ? 'rotate-180' : ''}`} />
                                    </button>
                                    {showVideoSettingsDropdown && (
                                        <div className="absolute bottom-full right-0 mb-3 w-[300px] bg-white rounded-[24px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] border border-gray-100 p-5 z-[70] animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col gap-5">
                                            {/* Generate Method */}
                                            <div className="flex flex-col gap-2.5">
                                                <div className="text-[13px] text-gray-500 font-bold">Generate method</div>
                                                <div className="flex bg-gray-100 p-1 rounded-xl">
                                                    {[
                                                        { id: 'startEnd', label: '首尾帧' },
                                                        { id: 'multiRef', label: '多图参考' }
                                                    ].map(m => (
                                                        <button 
                                                            key={m.id}
                                                            onClick={() => useAgentStore.getState().actions.setVideoGenMode(m.id as any)}
                                                            className={`flex-1 py-1.5 text-[12px] font-bold rounded-lg transition-all ${videoGenMode === m.id ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}
                                                        >
                                                            {m.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Size */}
                                            <div className="flex flex-col gap-2.5">
                                                <div className="text-[13px] text-gray-500 font-bold">Size</div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {[
                                                        { r: '16:9', i: 'w-6 h-3.5' }, { r: '9:16', i: 'w-3.5 h-6' }, { r: '1:1', i: 'w-4 h-4' }
                                                    ].map(item => (
                                                        <button 
                                                            key={item.r} 
                                                            onClick={() => useAgentStore.getState().actions.setVideoGenRatio(item.r)} 
                                                            className={`flex flex-col items-center justify-center gap-2 py-3.5 rounded-xl border transition-all h-20 ${videoGenRatio === item.r ? 'bg-gray-100 border-gray-200' : 'border-gray-100 hover:border-gray-200 bg-white'}`}
                                                        >
                                                            <div className={`border-[1.5px] border-gray-400 rounded-[2px] ${item.i} ${videoGenRatio === item.r ? 'bg-gray-400' : 'bg-transparent'}`} />
                                                            <span className="text-[11px] font-bold text-gray-600">{item.r}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Resolution */}
                                            <div className="flex flex-col gap-2.5">
                                                <div className="text-[13px] text-gray-500 font-bold">Resolution</div>
                                                <div className="flex gap-2">
                                                    {['720p', '1080p', '4k'].map(res => (
                                                        <button key={res} onClick={() => useAgentStore.getState().actions.setVideoGenQuality(res)} className={`flex-1 py-2 text-[12px] font-bold rounded-xl border transition-all ${useAgentStore.getState().videoGenQuality === res ? 'bg-gray-100 border-gray-200 text-black' : 'bg-white border-gray-100 text-gray-400'}`}>
                                                            {res}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Duration */}
                                            <div className="flex flex-col gap-2.5">
                                                <div className="text-[13px] text-gray-500 font-bold">Duration</div>
                                                <div className="flex gap-2">
                                                    {['4s', '6s', '8s'].map(sec => (
                                                        <button key={sec} onClick={() => useAgentStore.getState().actions.setVideoGenDuration(sec)} className={`flex-1 py-2 text-[12px] font-bold rounded-xl border transition-all ${videoGenDuration === sec ? 'bg-gray-100 border-gray-200 text-black' : 'bg-white border-gray-100 text-gray-400'}`}>
                                                            {sec}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="relative">
                                    <button 
                                        onClick={() => setShowVideoModelDropdown(!showVideoModelDropdown)}
                                        className={`w-9 h-9 flex items-center justify-center rounded-full transition shadow-sm border ${showVideoModelDropdown ? 'bg-gray-100 border-gray-300 text-black' : 'bg-white border-gray-100 text-gray-500 hover:text-black hover:border-gray-300'}`}
                                    >
                                        <Activity size={18} strokeWidth={1.5} />
                                    </button>
                                    {showVideoModelDropdown && (
                                        <div className="absolute bottom-full right-0 mb-3 w-[240px] bg-white rounded-[24px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] border border-gray-100 p-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">选择视频模型</div>
                                            <div className="max-h-[300px] overflow-y-auto scroller-hidden">
                                                {MODEL_OPTIONS.video.map(m => (
                                                    <button
                                                        key={m.id}
                                                        onClick={() => { setVideoGenModel(m.id as VideoModel); setShowVideoModelDropdown(false); setAutoModelSelect(false); }}
                                                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${videoGenModel === m.id && !autoModelSelect ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50'}`}
                                                    >
                                                        <div className="flex items-center gap-2.5">
                                                            <m.icon size={16} strokeWidth={1.5} className="text-gray-500" />
                                                            <span>{m.name}</span>
                                                        </div>
                                                        {videoGenModel === m.id && !autoModelSelect && <Check size={14} strokeWidth={2.5} />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => handleSend()}
                                    className="h-9 px-4 rounded-full flex items-center justify-center text-[14px] font-bold shadow-sm transition bg-gradient-to-b from-gray-100 to-gray-200 text-gray-500 border border-gray-200 hover:from-gray-200 hover:to-gray-300"
                                >
                                    发送
                                </button>
                            </div>
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

                                            {/* Model List */}
                                            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 group/list custom-scrollbar">
                                                <AnimatePresence mode="wait">
                                                    <motion.div
                                                        key={modelPreferenceTab}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="space-y-2.5"
                                                    >
                                                        {MODEL_OPTIONS[modelPreferenceTab].map((m) => {
                                                            const isSelected = !autoModelSelect && (
                                                                (modelPreferenceTab === 'image' && preferredImageModel === m.id) || 
                                                                (modelPreferenceTab === 'video' && preferredVideoModel === m.id) || 
                                                                (modelPreferenceTab === '3d' && preferred3DModel === m.id)
                                                            );

                                                            return (
                                                                <div 
                                                                    key={m.id} 
                                                                    onClick={() => { 
                                                                        if (modelPreferenceTab === 'image') setPreferredImageModel(m.id as ImageModel); 
                                                                        else if (modelPreferenceTab === 'video') setPreferredVideoModel(m.id as VideoModel); 
                                                                        else setPreferred3DModel(m.id); 
                                                                        setAutoModelSelect(false); 
                                                                    }} 
                                                                    className={`group flex items-start gap-4 p-4 rounded-[24px] cursor-pointer transition-all duration-300 border ${isSelected ? 'bg-black text-white border-black shadow-xl shadow-black/10' : 'bg-white border-gray-100/50 hover:border-gray-300 hover:shadow-md'}`}
                                                                >
                                                                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors shrink-0 ${isSelected ? 'bg-white/10 text-white border border-white/10' : 'bg-gray-50 text-gray-400 border border-gray-100 group-hover:bg-gray-100 group-hover:text-gray-600'}`}>
                                                                        <m.icon size={22} strokeWidth={1.5} />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center justify-between mb-1">
                                                                            <h4 className={`text-[14px] font-bold truncate ${isSelected ? 'text-white' : 'text-gray-900 font-display'}`}>{m.name}</h4>
                                                                            {m.badge && (
                                                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-tight whitespace-nowrap ml-2 ${isSelected ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
                                                                                    {m.badge}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <p className={`text-[11px] leading-[1.4] mb-2 line-clamp-2 ${isSelected ? 'text-white/60' : 'text-gray-400 font-medium'}`}>
                                                                            {m.desc}
                                                                        </p>
                                                                        {m.time && (
                                                                            <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold ${isSelected ? 'bg-white/15 text-white' : 'bg-gray-100/80 text-gray-500'}`}>
                                                                                {m.time}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center mt-1 shrink-0 transition-all ${isSelected ? 'bg-white border-white scale-110 shadow-sm' : 'border-gray-200 group-hover:border-gray-400'}`}>
                                                                        {isSelected && <Check size={12} className="text-black" strokeWidth={3} />}
                                                                        {!isSelected && !autoModelSelect && <div className="w-1.5 h-1.5 rounded-full bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </motion.div>
                                                </AnimatePresence>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => handleSend()} className="w-9 h-9 rounded-full flex items-center justify-center bg-black text-white hover:bg-gray-800 transition shadow-md shrink-0"><ArrowUp size={18} strokeWidth={2.5} /></button>
                            </>
                        )}
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
                    if (e.target.files) {
                        if (creationMode === 'image') {
                            const firstImage = Array.from(e.target.files).find((f: File) => f.type.startsWith('image/')) || null;
                            setImageGenUpload(firstImage);
                        } else {
                            Array.from(e.target.files).forEach((f: File) => {
                                insertInputFile(f);
                            });
                        }
                    }
                    if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                    }
                }}
            />
        </div>
    );
};
