import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageSquare, ChevronDown, CirclePlus, Clock, Search, X, Share2,
    File as FileIcon, Image as ImageIcon, Video, Download, Store, Layout, Globe, FileText, PanelRightClose
} from 'lucide-react';
import { useAgentStore } from '../../../stores/agent.store';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { ConversationSession, ImageModel, VideoModel, Marker } from '../../../types';

interface AssistantSidebarProps {
    showAssistant: boolean;
    setShowAssistant: (show: boolean) => void;
    conversations: ConversationSession[];
    setConversations: React.Dispatch<React.SetStateAction<ConversationSession[]>>;
    activeConversationId: string;
    setActiveConversationId: (id: string) => void;
    handleSend: (overridePrompt?: string, overrideAttachments?: File[], overrideWeb?: boolean, skillData?: any) => Promise<void>;
    handleSmartGenerate: (prompt: string) => void;
    setPreviewUrl: (url: string) => void;
    creationMode: 'agent' | 'image' | 'video';
    setCreationMode: (mode: 'agent' | 'image' | 'video') => void;
    setPrompt: (prompt: string) => void;
    handleModeSwitch: (mode: 'thinking' | 'fast') => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    selectedChipId: string | null;
    setSelectedChipId: (id: string | null) => void;
    hoveredChipId: string | null;
    setHoveredChipId: (id: string | null) => void;
    // New props for InputArea
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
    markers: Marker[];
}

export const AssistantSidebar: React.FC<AssistantSidebarProps> = ({
    showAssistant, setShowAssistant, conversations, setConversations,
    activeConversationId, setActiveConversationId,
    handleSend, handleSmartGenerate, setPreviewUrl,
    creationMode, setCreationMode, setPrompt,
    handleModeSwitch, fileInputRef,
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
    const messages = useAgentStore(s => s.messages);
    const { setMessages, clearMessages, setIsAgentMode } = useAgentStore(s => s.actions);
    const webEnabled = useAgentStore(s => s.webEnabled);

    const [showHistoryPopover, setShowHistoryPopover] = useState(false);
    const [historySearch, setHistorySearch] = useState('');
    const [showFileListModal, setShowFileListModal] = useState(false);



    return (
        <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute top-0 right-0 w-[480px] h-full bg-[#f8f9fc] border-l border-gray-200 shadow-[-10px_0_30px_rgba(0,0,0,0.03)] z-50 flex flex-col overflow-visible"
        >
            {/* Header with Toolbar - Lovart Style */}
            <div className="px-3 py-2.5 flex items-center justify-between border-b border-gray-100 z-20 shrink-0 select-none">
                <span className="text-sm font-semibold text-gray-900 pl-1">
                    {messages.length > 0
                        ? (conversations.find(c => c.id === activeConversationId)?.title || '对话中')
                        : '新对话'}
                </span>
                <div className="flex items-center gap-0.5">
                    <button
                        className="h-7 px-2.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 flex items-center justify-center rounded-lg transition-all"
                        onClick={() => { setActiveConversationId(''); clearMessages(); setPrompt(''); setCreationMode('agent'); }}
                    >
                        <CirclePlus size={15} strokeWidth={1.5} className="mr-1" />
                        新对话
                    </button>

                    <div className="relative">
                        <button
                            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                            onClick={(e) => { e.stopPropagation(); setShowHistoryPopover(!showHistoryPopover); }}
                        >
                            <Clock size={15} strokeWidth={1.8} />
                        </button>

                        {showHistoryPopover && (
                            <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-[60] animate-in fade-in zoom-in-95 duration-200 text-left">
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
                                    onClick={() => { setActiveConversationId(''); clearMessages(); setShowHistoryPopover(false); }}
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
                                                        if (activeConversationId === conversation.id) { setActiveConversationId(''); clearMessages(); }
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

                    <button className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all" title="Share">
                        <Share2 size={15} strokeWidth={1.5} />
                    </button>

                    <div className="relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowFileListModal(!showFileListModal); }}
                            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${showFileListModal ? 'text-gray-700 bg-gray-100' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
                            title="Files"
                        >
                            <FileIcon size={15} strokeWidth={1.5} />
                        </button>
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

                    <div className="w-px h-3.5 bg-gray-200 mx-1 opacity-50"></div>

                    <button onClick={() => setShowAssistant(false)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all" title="Collapse">
                        <PanelRightClose size={15} strokeWidth={1.5} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 no-scrollbar relative">
                {messages.length === 0 ? (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <div className="flex items-center gap-2.5 mb-6">
                            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white font-bold text-[10px] tracking-wide shadow-sm">XC</div>
                            <span className="font-bold text-base text-gray-900 tracking-tight">XcAI Studio</span>
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 leading-tight mb-2">试试这些 XcAI Skills</h3>
                        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                            点击下方技能，即刻开始专业创作
                        </p>

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
                                <Video size={15} strokeWidth={1.8} />
                                <span>分镜故事板</span>
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <MessageList
                        onSend={handleSend}
                        onSmartGenerate={handleSmartGenerate}
                        onPreview={setPreviewUrl}
                    />
                )}
            </div>

            <InputArea
                creationMode={creationMode}
                setCreationMode={setCreationMode}
                handleSend={handleSend}
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
            />
        </motion.div>
    );
};
