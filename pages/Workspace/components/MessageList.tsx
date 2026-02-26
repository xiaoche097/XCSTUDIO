import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Store, Layout, Globe, FileText, Film, Box, Video, Sparkles, Copy } from 'lucide-react';
import { useAgentStore } from '../../../stores/agent.store';
import { TaskProgress } from '../../../components/agents/TaskProgress';
import { ChatMessage } from '../../../types';

const SmartMessageRenderer = ({ text, onGenerate, onAction }: { text: string; onGenerate: (prompt: string) => void; onAction?: (action: string) => void }) => {
    const cleanText = text.replace(/---AGENT_IMAGES---[\s\S]*$/m, '').trim();
    if (!cleanText) return <div className="whitespace-pre-wrap">{text}</div>;
    return <div className="whitespace-pre-wrap">{cleanText}</div>;
};

interface MessageListProps {
    onSend: (text: string) => void;
    onSmartGenerate: (prompt: string) => void;
    onPreview: (url: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({ onSend, onSmartGenerate, onPreview }) => {
    const messages = useAgentStore(s => s.messages);
    const isTyping = useAgentStore(s => s.isTyping);
    const currentTask = useAgentStore(s => s.currentTask);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
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
                        <div className="w-full max-w-[95%]">
                            <div className="text-[13px] text-gray-700 mb-2 leading-relaxed whitespace-pre-wrap">
                                {msg.text}
                            </div>
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
                            {msg.agentData.imageUrls && msg.agentData.imageUrls.length > 0 && (
                                <div className={`mb-2 ${msg.agentData.imageUrls.length === 1 ? '' : msg.agentData.imageUrls.length <= 4 ? 'grid grid-cols-2 gap-1.5' : 'grid grid-cols-3 gap-1'}`}>
                                    {msg.agentData.imageUrls.map((url, i) => (
                                        <img
                                            key={i}
                                            src={url}
                                            className="w-full rounded-xl border border-gray-200 cursor-pointer hover:opacity-90 transition object-cover"
                                            onClick={() => onPreview(url)}
                                        />
                                    ))}
                                </div>
                            )}
                            {msg.agentData.description && (
                                <p className="text-[12px] text-gray-500 mb-2 leading-relaxed">{msg.agentData.description}</p>
                            )}
                            {msg.agentData.adjustments && msg.agentData.adjustments.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {msg.agentData.adjustments.map((adj, i) => (
                                        <button
                                            key={i}
                                            onClick={() => onSend(adj)}
                                            className="px-2.5 py-1 text-[11px] font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-full transition hover:text-gray-900 shadow-sm"
                                        >
                                            {adj}
                                        </button>
                                    ))}
                                </div>
                            )}
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
                        <div className="max-w-[85%] rounded-2xl rounded-tl-none px-4 py-3 text-sm shadow-sm bg-white border border-gray-100 text-gray-800">
                            <SmartMessageRenderer text={msg.text} onGenerate={onSmartGenerate} onAction={(action) => onSend(action)} />
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
            {currentTask && (currentTask.status === 'analyzing' || currentTask.status === 'executing') && (
                <TaskProgress task={currentTask} />
            )}
            <div ref={messagesEndRef} />
        </div>
    );
};
