import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    ChevronDown, ChevronUp, Search, Eye, Sparkles, 
    ThumbsUp, ThumbsDown, Copy, Check, Wand2, Image as ImageIcon
} from 'lucide-react';
import { ChatMessage } from '../../../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AgentMessageProps {
    message: ChatMessage;
    onPreview: (url: string) => void;
    onAction?: (action: string) => void;
    onSmartGenerate?: (prompt: string, proposalId?: string) => void;
}

export const AgentMessage: React.FC<AgentMessageProps> = ({ message, onPreview, onAction, onSmartGenerate }) => {
    const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(message.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const normalizeEscapedNewlines = (value: string): string =>
        (value || '')
            .replace(/\r\n/g, '\n')
            .replace(/\\r\\n/g, '\n')
            .replace(/\\n/g, '\n');

    // 解析 json:generation 块
    const { cleanText, proposals } = useMemo(() => {
        // 优先使用结构化 proposals（来自 AgentTask.output.proposals）
        if (message.agentData?.proposals && message.agentData.proposals.length > 0) {
            return { cleanText: message.text, proposals: message.agentData.proposals as any[] };
        }

        // 如果消息已经包含了生成的资产 url 或 assets，说明任务已自动执行，不再展示方案按钮
        const hasExecuted = (message.agentData?.imageUrls?.length || 0) > 0 || (message.agentData?.assets?.length || 0) > 0;

        const proposalRegex = /```json:generation\n([\s\S]*?)\n```/g;
        const foundProposals: any[] = [];
        let match;
        
        while ((match = proposalRegex.exec(message.text)) !== null) {
            try {
                // 如果已执行，我们跳过解析 proposals，只负责清理文本
                if (!hasExecuted) {
                    const parsed = JSON.parse(match[1]);
                    foundProposals.push(parsed);
                }
            } catch (e) {
                console.error("Failed to parse generation proposal", e);
            }
        }

        const textWithoutProposals = normalizeEscapedNewlines(message.text.replace(proposalRegex, '').trim());
        return { cleanText: textWithoutProposals, proposals: foundProposals };
    }, [message.text, message.agentData]);

    const agentData = message.agentData as any;
    const imageCards = useMemo(() => {
        const urls: string[] = agentData?.imageUrls || [];
        const skillCalls: any[] = agentData?.skillCalls || [];
        const successfulImageCalls = skillCalls.filter((s: any) => s?.success && s?.skillName === 'generateImage');

        return urls.map((url, index) => {
            const matched = successfulImageCalls[index];
            const title =
                matched?.description ||
                matched?.title ||
                `第 ${index + 1} 张`;
            return {
                url,
                title,
            };
        });
    }, [agentData]);

    const oneClickView = useMemo(() => {
        if (message.skillData?.id !== 'xcai-oneclick' && message.text.indexOf('SKYSPER One-Click') === -1) return { intro: '', sections: [] as Array<{ title: string; body: string }> };
        const sections: Array<{ title: string; body: string }> = [];
        const lines = cleanText.split('\n');
        const intro: string[] = [];
        let currentTitle = '';
        let currentBody: string[] = [];

        const pushCurrent = () => {
            if (currentTitle && currentBody.length > 0) {
                sections.push({ title: currentTitle, body: currentBody.join('\n').trim() });
            }
        };

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (/^##\s+/.test(line)) {
                pushCurrent();
                currentTitle = line.replace(/^##\s+/, '').trim();
                currentBody = [];
            } else if (!currentTitle) {
                intro.push(rawLine);
            } else if (currentTitle) {
                currentBody.push(rawLine);
            }
        }

        pushCurrent();
        return { intro: intro.join('\n').trim(), sections };
    }, [cleanText, message.skillData?.id, message.text]);

    return (
        <div className="w-full group">
            {/* 时间头部 */}
            <div className="flex justify-start mb-1.5 px-1">
                <span className="text-[10px] text-gray-400 font-medium">
                    {new Date(message.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
            </div>

            <div className="flex flex-col gap-2 max-w-[95%]">
                {/* 0. 附件预览 (更紧凑的 Pill) */}
                {message.attachments && message.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-0.5 mb-0.5">
                        {message.attachments.map((att, i) => (
                            <div key={i} className="flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-[10px] text-gray-500 font-medium whitespace-nowrap shadow-sm">
                                <ImageIcon size={10} className="text-gray-400" />
                                <span>Image_{i + 1}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* 1. 引导文字 */}
                {cleanText && oneClickView.sections.length === 0 && (
                    <div className="agent-msg-text px-1 break-words">
                        <MarkdownRenderer text={cleanText} className="text-[13px]" />
                    </div>
                )}

                {oneClickView.sections.length > 0 && (
                    <div className="px-1 mt-1 space-y-1.5">
                        {oneClickView.intro && (
                            <div className="rounded-lg border border-gray-200 bg-white/70 px-2.5 py-2">
                                <MarkdownRenderer text={oneClickView.intro} className="text-[12px]" />
                            </div>
                        )}
                        {oneClickView.sections.map((section, idx) => (
                            <details key={`${section.title}-${idx}`} className="rounded-lg border border-gray-200 bg-white/90" open={idx < 2}>
                                <summary className="cursor-pointer select-none px-2.5 py-2 text-[12px] font-semibold text-gray-800">
                                    {section.title}
                                </summary>
                                <div className="border-t border-gray-100 px-2.5 py-2">
                                    <MarkdownRenderer text={section.body} className="text-[12px]" />
                                </div>
                            </details>
                        ))}
                    </div>
                )}

                {/* 1.5 生成结果预览 (图 2 要求在对话框显示) */}
                {imageCards.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-1 mt-1">
                        {imageCards.map((card, i) => (
                            <div 
                                key={i} 
                                className="relative rounded-lg overflow-hidden border border-gray-100 group/img bg-gray-50 cursor-pointer"
                                style={{ width: imageCards.length > 1 ? '140px' : '220px', aspectRatio: '1/1' }}
                                onClick={() => onPreview(card.url)}
                            >
                                <img src={card.url} alt="Generated" className="w-full h-full max-w-full max-h-[300px] object-contain transition-transform group-hover/img:scale-105" />
                                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/5 transition-colors" />
                                <div className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] px-1.5 py-1 truncate">
                                    {card.title}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* 2. 可折叠分析区 */}
                {agentData?.analysis && (
                    <div className="px-1">
                        <button 
                            onClick={() => setIsAnalysisExpanded(!isAnalysisExpanded)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100/60 hover:bg-gray-100 rounded-lg transition-all border border-gray-100/50 group/btn"
                        >
                            <Search size={12} className="text-gray-500 group-hover/btn:text-gray-800 transition-colors" />
                            <span className="text-[12px] font-medium text-gray-600 group-hover/btn:text-gray-900 transition-colors">
                                图片分析
                            </span>
                            {isAnalysisExpanded ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
                        </button>
                        
                        <AnimatePresence>
                            {isAnalysisExpanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="mt-1.5 p-2.5 bg-gray-50 rounded-lg border border-gray-100 text-[12px] text-gray-600 leading-relaxed whitespace-pre-wrap">
                                        {agentData.analysis}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {/* 2.5 智能生成方案 (Lovart 深度对齐紧凑卡片) */}
                {proposals.length > 0 && (
                    <div className="flex flex-col gap-1.5 mb-1">
                        {proposals.map((prop, idx) => (
                            <motion.div 
                                key={idx}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="bg-white/95 backdrop-blur-md border border-gray-100 rounded-lg p-2.5 shadow-sm hover:shadow-md transition-all group/card overflow-hidden"
                            >
                                {/* 方案预览图 (Lovart Style) */}
                                {(prop.previewUrl || prop.concept_image) && (
                                    <div className="mb-2 rounded-md overflow-hidden bg-gray-50 border border-gray-100 aspect-video relative group/preview">
                                        <img 
                                            src={prop.previewUrl || prop.concept_image} 
                                            alt="Preview" 
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                                        />
                                        <div className="absolute inset-0 bg-black/5 group-hover/card:bg-transparent transition-colors" />
                                    </div>
                                )}

                                <div className="flex justify-between items-center mb-1">
                                    <h4 className="text-[12px] font-bold text-gray-900 flex items-center gap-1">
                                        <Sparkles size={11} className="text-blue-500" />
                                        {prop.title || `方案 ${idx + 1}`}
                                    </h4>
                                    <span className="text-[8px] px-1 py-0.5 bg-blue-50/50 text-blue-600 rounded font-bold uppercase tracking-tighter border border-blue-100/50">PROPOSAL</span>
                                </div>
                                <p className="text-[11px] text-gray-500 leading-[1.3] mb-2.5 font-normal">
                                    {prop.description}
                                </p>
                                <button
                                    onClick={() => {
                                        const prompt =
                                            prop.prompt ||
                                            prop.skillCalls?.[0]?.params?.prompt ||
                                            prop.skillCalls?.find((s: any) => s?.skillName === 'generateImage')?.params?.prompt ||
                                            '';
                                        if (prompt) {
                                            onSmartGenerate?.(prompt, prop.id);
                                        }
                                    }}
                                    className="w-full py-1.5 bg-gray-900 hover:bg-black text-white rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] shadow-sm"
                                >
                                    <Wand2 size={11} strokeWidth={2.5} />
                                    立即生成
                                </button>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* 3. 后继内容展示区 */}
                {agentData?.description && (
                    <div className="text-[12px] text-gray-700 leading-relaxed px-1">
                        {agentData.description}
                    </div>
                )}

                {/* 4. 模型标签区 */}
                {(agentData?.model || proposals.length > 0) && (
                    <div className="flex items-center gap-1 justify-start px-1">
                        <div className="flex items-center gap-1 text-gray-400">
                            <Eye size={12} strokeWidth={2.5} />
                            <span className="text-[10px] font-bold tracking-tight uppercase opacity-50">
                                {agentData?.model || 'Nano Banana Pro'}
                            </span>
                        </div>
                    </div>
                )}

                {/* 5. 最终生成结果 */}
                {imageCards.length > 0 && (
                    <div className="px-1 mt-1">
                        {imageCards.length === 1 ? (
                            <div className="relative rounded-xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                                <img 
                                    src={imageCards[0].url} 
                                    alt="Generated"
                                    className="w-full max-w-full h-auto max-h-[300px] object-contain cursor-zoom-in hover:opacity-95 transition"
                                    onClick={() => onPreview(imageCards[0].url)}
                                />
                                <div className="px-2 py-1.5 text-[11px] text-gray-600 border-t border-gray-100 bg-white/80">
                                    {imageCards[0].title}
                                </div>
                            </div>
                        ) : (
                            <div className={`grid gap-1.5 ${imageCards.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                                {imageCards.map((card, i) => (
                                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
                                        <img 
                                            src={card.url} 
                                            className="w-full h-full max-w-full max-h-[300px] object-contain cursor-zoom-in hover:opacity-95 transition"
                                            onClick={() => onPreview(card.url)}
                                        />
                                        <div className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] px-1.5 py-1 truncate">
                                            {card.title}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 6. 建议按钮（可点击快速回复） */}
                {agentData?.suggestions && agentData.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-1 mt-1.5">
                        {agentData.suggestions.map((suggestion, idx) => (
                            <button
                                key={idx}
                                onClick={() => onAction?.(suggestion)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-[11px] font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 hover:shadow-sm transition-all cursor-pointer"
                            >
                                <Wand2 size={10} strokeWidth={2} />
                                {suggestion}
                            </button>
                        ))}
                    </div>
                )}

                {/* 7. 操作栏 */}
                <div className="flex items-center gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 text-gray-300 hover:text-gray-500 transition-colors">
                        <ThumbsUp size={12} />
                    </button>
                    <button className="p-1 text-gray-300 hover:text-gray-500 transition-colors">
                        <ThumbsDown size={12} />
                    </button>
                    <button 
                        onClick={handleCopy}
                        className="p-1 text-gray-300 hover:text-gray-500 transition-colors relative"
                    >
                        {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    </button>
                </div>
            </div>
        </div>
    );
};
