import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import {
    ChevronDown, Plus, X, ArrowUp, Paperclip, Lightbulb, Zap, Globe, Box, Sparkles,
    Image as ImageIcon, Check, Video, FileText
} from 'lucide-react';
import { useAgentStore } from '../../../stores/agent.store';

const VIDEO_RATIOS = [
    { label: '16:9', value: '16:9', icon: 'rectangle-horizontal' },
    { label: '9:16', value: '9:16', icon: 'rectangle-vertical' },
    { label: '1:1', value: '1:1', icon: 'square' },
];

const MODEL_OPTIONS: Record<string, { id: string; name: string; desc: string; time: string }[]> = {
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
    handleSend: (text?: string) => void;
    handleModeSwitch: (mode: 'thinking' | 'fast') => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    selectedChipId: string | null;
    setSelectedChipId: (id: string | null) => void;
    hoveredChipId: string | null;
    setHoveredChipId: (id: string | null) => void;
}

export const InputArea: React.FC<InputAreaProps> = ({
    creationMode, setCreationMode, handleSend, handleModeSwitch, fileInputRef,
    selectedChipId, setSelectedChipId, hoveredChipId, setHoveredChipId,
}) => {
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

    const {
        setInputBlocks, removeInputBlock, insertInputFile,
        setActiveBlockId, setSelectionIndex,
        setVideoGenRatio, setVideoGenDuration, setVideoGenModel, setVideoGenMode,
        setVideoStartFrame, setVideoEndFrame, setVideoMultiRefs,
        setShowVideoModelDropdown, setWebEnabled, setIsAgentMode,
    } = useAgentStore(s => s.actions);

    const [isDragOver, setIsDragOver] = useState(false);
    const [isVideoPanelHovered, setIsVideoPanelHovered] = useState(false);
    const [showModeSelector, setShowModeSelector] = useState(false);
    const [showVideoSettingsDropdown, setShowVideoSettingsDropdown] = useState(false);
    const [showModelPreference, setShowModelPreference] = useState(false);
    const [modelPreferenceTab, setModelPreferenceTab] = useState<'image' | 'video' | '3d'>('image');
    const [autoModelSelect, setAutoModelSelect] = useState(true);
    const [preferredImageModel, setPreferredImageModel] = useState('Nano Banana Pro');
    const [preferredVideoModel, setPreferredVideoModel] = useState('Veo 3.1');
    const [preferred3DModel, setPreferred3DModel] = useState('Auto');
    const [isInputFocused, setIsInputFocused] = useState(false);

    return (
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
                                    setInputBlocks(useAgentStore.getState().inputBlocks.map(b => b.id === block.id ? { ...b, text } : b));
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
                                onClick={() => { setCreationMode('agent'); setShowModeSelector(false); setIsAgentMode(true); }}
                                className={`w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-gray-50 transition ${creationMode === 'agent' ? 'text-[#3B82F6]' : 'text-gray-700'}`}
                            >
                                <Sparkles size={14} /> Agent
                                {creationMode === 'agent' && <Check size={14} className="ml-auto" />}
                            </button>
                            <button
                                onClick={() => { setCreationMode('image'); setShowModeSelector(false); setIsAgentMode(false); }}
                                className={`w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-gray-50 transition ${creationMode === 'image' ? 'text-[#3B82F6]' : 'text-gray-700'}`}
                            >
                                <ImageIcon size={14} /> 图像生成器
                                {creationMode === 'image' && <Check size={14} className="ml-auto" />}
                            </button>
                            <button
                                onClick={() => { setCreationMode('video'); setShowModeSelector(false); setIsAgentMode(false); }}
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
);
};
