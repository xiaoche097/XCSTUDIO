import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, X, Check, Eye, EyeOff, Loader2, Link as LinkIcon, Shield, Sliders, HardDrive, Info, Globe, Banana, Zap, Bot, Search, RefreshCw, ChevronDown, ChevronUp, FileText, Image as ImageIcon, Video, Plus, Box } from 'lucide-react';
import { createPortal } from 'react-dom';
import { SettingsCard } from './Settings/SettingsCard';
import { SettingsControl, SettingsToggle, SettingsInput, SettingsSelect } from './Settings/SettingsControl';
import { fetchAvailableModels } from '../services/gemini';
import { useImageHostStore } from '../stores/imageHost.store';
import {
    ApiProviderConfig,
    ModelInfo,
    getDefaultProviders,
    loadProviderSettings,
    saveProviderSettings,
    formatModels,
    refreshProviderModels,
} from '../services/provider-settings';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type ApiProvider = 'gemini' | 'yunwu' | 'custom';
type SettingsTab = 'api' | 'mapping' | 'hosting' | 'advanced' | 'storage' | 'about';
const AUTO_IMAGE_OPTION_ID = 'Auto';

const RECOMMENDED_MODELS = {
    script: [
        { id: 'gpt-4o', name: 'GPT-4o', brand: 'OpenAI' },
        { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', brand: 'Anthropic' },
        { id: 'deepseek-chat', name: 'DeepSeek-V3', brand: 'DeepSeek' }, // cspell:disable-line
        { id: 'deepseek-reasoner', name: 'DeepSeek-R1', brand: 'DeepSeek' }, // cspell:disable-line
        { id: 'doubao-pro-32k', name: '豆包 Pro (火山)', brand: 'Volcengine' }, // cspell:disable-line
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', brand: 'Google' },
    ],
    image: [
        { id: 'dall-e-3', name: 'DALL-E 3', brand: 'OpenAI' },
        { id: 'flux-1.1-pro', name: 'FLUX 1.1 Pro', brand: 'Flux' },
        { id: 'flux-pro', name: 'FLUX Pro', brand: 'Flux' },
        { id: 'ideogram-v2', name: 'Ideogram v2', brand: 'Ideogram' },
        { id: 'doubao-vision', name: '豆包 视界 (火山)', brand: 'Volcengine' }, // cspell:disable-line
        { id: 'imagen-3', name: 'Imagen 3', brand: 'Google' },
    ],
    video: [
        { id: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast', brand: 'Google' },
        { id: 'veo-3.1-generate-preview', name: 'Veo 3.1 Pro', brand: 'Google' },
        { id: 'kling-v1-5', name: 'Kling 1.5', brand: 'Other' },
        { id: 'hailuo-video-v1', name: 'Hailuo Video', brand: 'Other' },
    ]
};

const ModelCard = React.memo(({
    model,
    isSelected,
    onToggle,
    providerName
}: {
    model: ModelInfo;
    isSelected: boolean;
    onToggle: () => void;
    providerName: string;
}) => (
    <div
        onClick={onToggle}
        className={`p-5 rounded-3xl border transition-all cursor-pointer flex items-center justify-between group ${isSelected
            ? 'bg-blue-50/50 border-blue-600 shadow-sm' : 'bg-white border-gray-100 hover:border-blue-300'
            }`}
    >
        <div className="flex items-center gap-5">
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected
                ? 'bg-blue-600 border-blue-600' : 'border-gray-200'
                }`}>
                {isSelected && <Check size={14} className="text-white" strokeWidth={4} />}
            </div>
            <div>
                <div className="text-sm font-black text-gray-800 tracking-tight truncate max-w-[180px]">{model.id}</div>
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">{model.brand || 'Other'} Node</div>
            </div>
        </div>
        <div className="text-[10px] font-black px-3 py-1 bg-gray-50 text-gray-400 rounded-full group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
            {providerName}
        </div>
    </div>
));

ModelCard.displayName = 'ModelCard';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<SettingsTab>('api');
    const imageHost = useImageHostStore();
    const [providers, setProviders] = useState<ApiProviderConfig[]>(getDefaultProviders());
    const [activeProviderId, setActiveProviderId] = useState('yunwu');

    const [replicateKey, setReplicateKey] = useState('');
    const [klingKey, setKlingKey] = useState('');
    const [isVisible, setIsVisible] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');

    // Service Mapping State
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [brandFilter, setBrandFilter] = useState<string>('all');

    const [selectedScriptModels, setSelectedScriptModels] = useState<string[]>([]);
    const [selectedImageModels, setSelectedImageModels] = useState<string[]>([]);
    const [selectedVideoModels, setSelectedVideoModels] = useState<string[]>([]);

    const [expandedCategory, setExpandedCategory] = useState<string | null>('image');
    const [visibleCount, setVisibleCount] = useState(60);

    // Advanced Settings
    const [visualContinuity, setVisualContinuity] = useState(true);
    const [systemModeration, setSystemModeration] = useState(false);
    const [autoSave, setAutoSave] = useState(true);
    const [concurrentCount, setConcurrentCount] = useState(1);

    // Modal / Editing state
    const [editingProvider, setEditingProvider] = useState<ApiProviderConfig | null>(null);
    const [isKeysVisible, setIsKeysVisible] = useState(false);
    const [showImgbbKeys, setShowImgbbKeys] = useState(false);
    const [showCustomHostKeys, setShowCustomHostKeys] = useState(false);

    const normalizeImageSelection = (models: string[]): string[] => {
        if (!Array.isArray(models) || models.length === 0) return [AUTO_IMAGE_OPTION_ID];
        if (models.includes(AUTO_IMAGE_OPTION_ID)) return [AUTO_IMAGE_OPTION_ID];
        return [models[0]];
    };

    useEffect(() => {
        if (isOpen) {
            const loaded = loadProviderSettings();
            setProviders(loaded.providers);
            setActiveProviderId(loaded.activeProviderId);
            setReplicateKey(loaded.replicateKey);
            setKlingKey(loaded.klingKey);
            setSelectedScriptModels(loaded.selectedScriptModels);
            setSelectedImageModels(normalizeImageSelection(loaded.selectedImageModels));
            setSelectedVideoModels(loaded.selectedVideoModels);
            setVisualContinuity(loaded.visualContinuity);
            setSystemModeration(loaded.systemModeration);
            setAutoSave(loaded.autoSave);
            setConcurrentCount(loaded.concurrentCount);

            setSaveStatus('idle');
        }
    }, [isOpen]);

    const activeProvider = providers.find(p => p.id === activeProviderId) || providers[0];

    // Fetch models when provider changes or explicitly refreshed
    useEffect(() => {
        if (isOpen && activeProviderId) {
            handleRefreshModels(activeProviderId);
        }
    }, [activeProviderId, isOpen]);

    // Auto-fetch models when keys or URL change (debounced)
    useEffect(() => {
        if (!isOpen) return;

        const target = editingProvider || activeProvider;
        if (!target) return;

        const keys = target.apiKey.trim();
        const url = (target.baseUrl || '').trim();

        if (!keys) return;

        const timer = setTimeout(() => {
            console.log(`[SettingsModal] Auto-refreshing models for ${target.name}...`);
            if (editingProvider) {
                const keysList = target.apiKey.split('\n').map(k => k.trim()).filter(Boolean);
                fetchAvailableModels(target.id, keysList, target.baseUrl).then(models => {
                    if (models && models.length > 0) {
                        const formatted: ModelInfo[] = formatModels(models, target.name);
                        setAvailableModels(formatted);
                    }
                });
            } else {
                handleRefreshModels(activeProviderId);
            }
        }, 1500);

        return () => clearTimeout(timer);
    }, [activeProvider?.apiKey, activeProvider?.baseUrl, editingProvider?.apiKey, editingProvider?.baseUrl, isOpen]);

    const handleRefreshModels = async (providerId: string) => {
        setIsLoadingModels(true);
        console.log(`[SettingsModal] Refreshing models for provider: ${providerId}`);
        const formattedModels = await refreshProviderModels(providerId, providers);
        setAvailableModels(formattedModels);
        console.log(`[SettingsModal] Received ${formattedModels.length} models from service`);
        setIsLoadingModels(false);
    };

    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => {
            saveProviderSettings({
                providers,
                activeProviderId,
                replicateKey,
                klingKey,
                selectedScriptModels,
                selectedImageModels: normalizeImageSelection(selectedImageModels),
                selectedVideoModels,
                visualContinuity,
                systemModeration,
                autoSave,
                concurrentCount,
            });

            setIsSaving(false);
            setSaveStatus('success');
            setTimeout(() => {
                onClose();
            }, 800);
        }, 600);
    };

    const deleteProvider = (id: string) => {
        if (!window.confirm('确定要删除此节点吗？')) return;
        setProviders(prev => {
            const next = prev.filter(p => p.id !== id);
            if (activeProviderId === id && next.length > 0) {
                setActiveProviderId(next[0].id);
            } else if (activeProviderId === id && next.length === 0) {
                // If no providers left, reset activeProviderId or handle as needed
                setActiveProviderId(''); // Or set to a default if one exists
            }
            return next;
        });
    };

    const updateProviderKey = (id: string, key: string) => {
        setProviders(prev => prev.map(p => p.id === id ? { ...p, apiKey: key } : p));
    };

    const filteredModels = useMemo(() => {
        return availableModels.filter(m => {
            // Keep embedding models out of the main logic tabs
            if (m.id.toLowerCase().includes('embedding')) return false;

            const matchesCategory = m.category === expandedCategory;
            const matchesSearch = m.id.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesBrand = brandFilter === 'all' || m.brand?.toLowerCase() === brandFilter.toLowerCase();
            return matchesCategory && matchesSearch && matchesBrand;
        });
    }, [availableModels, searchQuery, brandFilter, expandedCategory]);

    // Reset visible count when filters change to maintain performance and clear view
    useEffect(() => {
        setVisibleCount(60);
    }, [searchQuery, brandFilter, availableModels]);

    const tabs: { id: SettingsTab; label: string; icon: any }[] = [
        { id: 'api', label: '服务商配置', icon: Key },
        { id: 'mapping', label: '模型映射', icon: Globe },
        { id: 'hosting', label: '图床配置', icon: ImageIcon },
        { id: 'advanced', label: '交互设置', icon: Sliders },
        { id: 'storage', label: '缓存磁盘', icon: HardDrive },
        { id: 'about', label: '系统架构', icon: Info },
    ];

    const toggleModel = (category: 'script' | 'image' | 'video', modelId: string) => {
        if (category === 'script') {
            setSelectedScriptModels(prev => prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId]);
        } else if (category === 'image') {
            if (modelId === AUTO_IMAGE_OPTION_ID) {
                setSelectedImageModels([AUTO_IMAGE_OPTION_ID]);
            } else {
                setSelectedImageModels([modelId]);
            }
        } else if (category === 'video') {
            setSelectedVideoModels(prev => prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId]);
        }
    };

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ x: '100%', opacity: 0.5 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0.5 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed inset-y-0 right-0 z-[101] w-full bg-[#fafafa] shadow-2xl flex border-l border-gray-100 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Sidebar Navigation */}
                        <div className="w-72 bg-white border-r border-gray-100 flex flex-col p-6 shrink-0">
                            <div className="flex items-center gap-4 mb-10 mt-2">
                                <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                                    <Zap size={24} fill="white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900 leading-tight">XC-STUDIO</h2>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">AI INFRASTRUCTURE</p>
                                </div>
                            </div>

                            <nav className="flex-1 space-y-2">
                                {tabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all duration-200 ${activeTab === tab.id
                                            ? 'bg-blue-50 text-blue-600 shadow-sm shadow-blue-500/5'
                                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 group'
                                            }`}
                                    >
                                        <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.5 : 2} className={activeTab === tab.id ? 'text-blue-600' : 'group-hover:scale-110 transition-transform'} />
                                        <span className="text-sm font-bold">{tab.label}</span>
                                    </button>
                                ))}
                            </nav>

                            <div className="mt-auto p-5 bg-blue-50/50 rounded-2xl border border-blue-100/30">
                                <div className="flex items-center gap-2 text-[10px] font-black text-blue-400 mb-2 uppercase tracking-tighter">
                                    <Bot size={14} />
                                    <span>Engine Status (V4.2)</span>
                                </div>
                                <div className="text-xs text-blue-600 font-black flex items-center gap-2 mt-1">
                                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse shadow-[0_0_8px_blue]" />
                                    SYSTEMS READY
                                </div>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 flex flex-col min-w-0 bg-[#f8f9fb]">
                            <header className="px-10 py-8 border-b border-gray-100 bg-white flex items-center justify-between sticky top-0 z-10">
                                <h3 className="text-2xl font-black text-gray-900 flex items-center gap-4">
                                    {tabs.find(t => t.id === activeTab)?.label}
                                    {activeTab === 'mapping' && (
                                        <span className="text-xs bg-gray-100 text-gray-400 px-3 py-1 rounded-full font-bold">
                                            配置: {selectedScriptModels.length + selectedImageModels.length + selectedVideoModels.length}/06
                                        </span>
                                    )}
                                </h3>
                                <button onClick={onClose} className="w-12 h-12 rounded-2xl flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-all">
                                    <X size={24} />
                                </button>
                            </header>

                            <main className="flex-1 overflow-y-auto p-10 space-y-8 no-scrollbar">
                                {activeTab === 'api' && (
                                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div className="space-y-6">
                                            <div className="flex items-center justify-between px-2">
                                                <div>
                                                    <h4 className="text-sm font-black text-gray-900">API 供应商</h4>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Provider Infrastructure</p>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newP: ApiProviderConfig = {
                                                            id: `custom_${Date.now()}`,
                                                            name: '新服务商',
                                                            baseUrl: '',
                                                            apiKey: '',
                                                            isCustom: true
                                                        };
                                                        setEditingProvider(newP);
                                                    }}
                                                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 rounded-xl text-xs font-black text-blue-600 hover:border-blue-200 transition-all shadow-sm"
                                                >
                                                    <Plus size={14} />
                                                    添加新节点
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-1 gap-4">
                                                {providers.map(p => (
                                                    <div
                                                        key={p.id}
                                                        className={`group relative bg-white border rounded-[1.5rem] p-6 transition-all hover:shadow-xl hover:shadow-black/5 flex items-center justify-between ${activeProviderId === p.id ? 'border-blue-600 ring-4 ring-blue-500/5' : 'border-gray-50'}`}
                                                    >
                                                        <div className="flex items-center gap-5">
                                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${activeProviderId === p.id ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600'}`}>
                                                                {p.id === 'gemini' ? <Zap size={20} /> : <Globe size={20} />}
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <h5 className="font-black text-gray-900 leading-none">{p.name}</h5>
                                                                    {p.id === 'gemini' && <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-black scale-90">推荐</span>}
                                                                </div>
                                                                <div className="text-[10px] text-gray-400 font-bold truncate max-w-[200px]">{p.baseUrl || 'Default Endpoint'}</div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-6">
                                                            <div className="hidden md:flex items-center gap-6 text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-gray-900">{(p.apiKey.split('\n').filter(k => k.trim()).length)} 个</span>
                                                                    <span>密钥 (Keys)</span>
                                                                </div>
                                                                <div className="w-px h-6 bg-gray-100" />
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-gray-900">{activeProviderId === p.id ? availableModels.length : '--'}</span>
                                                                    <span>模型 (Models)</span>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleRefreshModels(p.id); }}
                                                                    title="拉取最新模型"
                                                                    className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white hover:text-blue-600 hover:shadow-sm transition-all"
                                                                >
                                                                    <RefreshCw size={16} className={isLoadingModels && activeProviderId === p.id ? 'animate-spin' : ''} />
                                                                </button>
                                                                <button
                                                                    onClick={() => setEditingProvider({ ...p })}
                                                                    title="编辑节点配置"
                                                                    className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white hover:text-blue-600 hover:shadow-sm transition-all"
                                                                >
                                                                    <Sliders size={16} />
                                                                </button>
                                                                {p.isCustom && (
                                                                    <button
                                                                        onClick={() => deleteProvider(p.id)}
                                                                        title="删除节点"
                                                                        className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white hover:text-red-500 hover:shadow-sm transition-all"
                                                                    >
                                                                        <X size={16} />
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => setActiveProviderId(p.id)}
                                                                    className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${activeProviderId === p.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-transparent text-gray-400 hover:text-gray-900 border border-transparent hover:border-gray-200'}`}
                                                                >
                                                                    {activeProviderId === p.id ? '已选中' : '部署此节点'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="grid grid-cols-2 gap-8 mt-4 pt-4 border-t border-gray-100/50">
                                                <SettingsCard title="交互增强" icon={<Zap size={20} />} description="全局生成设置">
                                                    <div className="space-y-4">
                                                        <div className="flex items-center justify-between p-4 bg-white border border-gray-50 rounded-2xl">
                                                            <div>
                                                                <div className="text-xs font-black text-gray-800">并发生成数</div>
                                                                <div className="text-[10px] text-gray-400 font-bold">在高路并发时可显著提升效率</div>
                                                            </div>
                                                            <input
                                                                type="number"
                                                                value={concurrentCount}
                                                                onChange={e => setConcurrentCount(Math.max(1, parseInt(e.target.value) || 1))}
                                                                className="w-16 h-10 bg-gray-50 border border-gray-100 rounded-xl px-3 text-xs font-black text-center outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-600"
                                                            />
                                                        </div>
                                                    </div>
                                                </SettingsCard>

                                                <div className="space-y-4">
                                                    <SettingsCard title="Replicate" icon={<Banana size={20} />} badge="STABLE IMAGE">
                                                        <SettingsInput type="password" value={replicateKey} onChange={e => setReplicateKey(e.target.value)} placeholder="r8_..." />
                                                    </SettingsCard>
                                                    <SettingsCard title="Kling AI" icon={<Bot size={20} />} badge="FLUID VIDEO">
                                                        <SettingsInput type="password" value={klingKey} onChange={e => setKlingKey(e.target.value)} placeholder="kling-..." />
                                                    </SettingsCard>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'mapping' && (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div className="grid grid-cols-1 gap-6">
                                            {(['script', 'image', 'video'] as const).map(cat => (
                                                <div key={cat} className="bg-white border border-gray-100 rounded-[2.5rem] shadow-sm overflow-hidden group/cat">
                                                    <button
                                                        onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)}
                                                        className={`w-full px-10 py-8 flex items-center justify-between text-left transition-all ${expandedCategory === cat ? (cat === 'script' ? 'bg-purple-50/30' : cat === 'image' ? 'bg-rose-50/30' : 'bg-teal-50/30') : 'hover:bg-gray-50/50'}`}
                                                    >
                                                        <div className="flex items-center gap-6">
                                                            <div className={`p-4 rounded-2xl shadow-sm transition-transform group-hover/cat:scale-105 ${cat === 'script' ? 'bg-purple-100 text-purple-600' : cat === 'image' ? 'bg-rose-100 text-rose-600' : 'bg-teal-100 text-teal-600'}`}>
                                                                {cat === 'script' ? <Bot size={24} /> : cat === 'image' ? <ImageIcon size={24} /> : <Video size={24} />}
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mb-1">Functional Module</div>
                                                                <h4 className="text-xl font-black text-gray-900 leading-tight">{cat === 'script' ? '智能体思考' : cat === 'image' ? '图像生成' : '视频生成'}</h4>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <div className="text-right hidden sm:block">
                                                                <div className="text-[10px] font-black text-gray-300 uppercase tracking-widest leading-none">Status</div>
                                                                <div className="text-xs font-black text-gray-900 mt-1">已选 {(cat === 'script' ? selectedScriptModels : cat === 'image' ? selectedImageModels : selectedVideoModels).length} 项适配</div>
                                                            </div>
                                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${expandedCategory === cat ? 'bg-black text-white' : 'bg-gray-50 text-gray-400 group-hover/cat:bg-gray-100'}`}>
                                                                {expandedCategory === cat ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                            </div>
                                                        </div>
                                                    </button>

                                                    <AnimatePresence>
                                                        {expandedCategory === cat && (
                                                            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                                                                <div className="p-10 border-t border-gray-50 bg-[#fafafa]">
                                                                    <div className="flex items-center gap-4 mb-8">
                                                                        <div className="relative flex-1">
                                                                            <Search size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" />
                                                                            <input
                                                                                value={searchQuery}
                                                                                onChange={e => setSearchQuery(e.target.value)}
                                                                                placeholder="搜索模型，支持品牌、版本..."
                                                                                className="w-full pl-14 pr-6 py-4 bg-white border border-gray-200 rounded-2xl text-sm outline-none focus:ring-8 focus:ring-blue-500/5 focus:border-blue-500 transition-all"
                                                                            />
                                                                        </div>
                                                                        <div className="flex flex-wrap gap-2 bg-gray-100 p-1.5 rounded-2xl shrink-0 overflow-visible no-scrollbar">
                                                                            {[
                                                                                { id: 'all', label: '全部' },
                                                                                { id: 'OpenAI', label: 'OpenAI' },
                                                                                { id: 'Flux', label: 'Flux' },
                                                                                { id: 'Ideogram', label: 'Ideogram' },
                                                                                { id: 'Fal', label: 'Fal' },
                                                                                { id: 'Replicate', label: 'Replicate' },
                                                                                { id: 'Midjourney', label: 'Midjourney' },
                                                                                { id: 'Bailian', label: '阿里百炼' }, // cspell:disable-line
                                                                                { id: 'Google', label: 'Google' },
                                                                                { id: 'DeepSeek', label: 'DeepSeek' },
                                                                                { id: 'Anthropic', label: 'Anthropic' },
                                                                                { id: 'ChatGLM', label: '智谱' },
                                                                                { id: 'Grok', label: 'Grok' },
                                                                                { id: 'Moonshot', label: '月之暗面' },
                                                                                { id: 'Minimax', label: 'Minimax' },
                                                                                { id: 'Volcengine', label: '火山' }, // cspell:disable-line
                                                                                { id: 'Wenxin', label: '文心' } // cspell:disable-line
                                                                            ].map(b => (
                                                                                <button
                                                                                    key={b.id}
                                                                                    onClick={() => setBrandFilter(b.id)}
                                                                                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${brandFilter === b.id ? 'bg-white text-black shadow-lg shadow-black/5' : 'text-gray-400 hover:text-black'}`}
                                                                                >
                                                                                    {b.label}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>

                                                                    <div className="mb-6">
                                                                        <div className="flex items-center gap-2 mb-4">
                                                                            <Zap size={14} className="text-orange-500 fill-orange-500" />
                                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">热门推荐 (Hot Models)</span>
                                                                        </div>
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {(cat === 'image'
                                                                                ? [{ id: AUTO_IMAGE_OPTION_ID, name: '自动选择 (Gemini Pro)', brand: 'Google' }, ...RECOMMENDED_MODELS[cat]]
                                                                                : RECOMMENDED_MODELS[cat]
                                                                            ).map(hot => {
                                                                                const isSelected = (cat === 'script' ? selectedScriptModels : cat === 'image' ? selectedImageModels : selectedVideoModels).includes(hot.id);
                                                                                // Only show if available in current provider's list OR it's a known placeholder
                                                                                return (
                                                                                    <button
                                                                                        key={hot.id}
                                                                                        onClick={() => toggleModel(cat, hot.id)}
                                                                                        className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${isSelected
                                                                                            ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20'
                                                                                            : 'bg-white border-gray-100 text-gray-600 hover:border-blue-200'}`}
                                                                                    >
                                                                                        <span className="opacity-50 text-[10px]">{hot.brand}</span>
                                                                                        {hot.name}
                                                                                        {isSelected && <Check size={12} strokeWidth={3} />}
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>

                                                                    <div className="grid grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-4 no-scrollbar pb-10">
                                                                        {(cat === 'image'
                                                                            ? [{ id: AUTO_IMAGE_OPTION_ID, name: AUTO_IMAGE_OPTION_ID, brand: 'Google', category: 'image', provider: activeProvider.name } as ModelInfo, ...filteredModels]
                                                                            : filteredModels
                                                                        ).slice(0, visibleCount).map(m => (
                                                                            <ModelCard
                                                                                key={m.id}
                                                                                model={m}
                                                                                isSelected={(cat === 'script' ? selectedScriptModels : cat === 'image' ? selectedImageModels : selectedVideoModels).includes(m.id)}
                                                                                onToggle={() => toggleModel(cat, m.id)}
                                                                                providerName={activeProvider.name}
                                                                            />
                                                                        ))}

                                                                        {filteredModels.length > visibleCount && (
                                                                            <button
                                                                                onClick={() => setVisibleCount(prev => prev + 100)}
                                                                                className="col-span-2 py-4 bg-gray-50 rounded-2xl text-xs font-black text-gray-400 hover:bg-gray-100 transition-colors mt-2"
                                                                            >
                                                                                显示更多模型 ({filteredModels.length - visibleCount}+)
                                                                            </button>
                                                                        )}

                                                                        {filteredModels.length === 0 && (
                                                                            <div className="col-span-2 text-center py-20 bg-white border border-dashed border-gray-200 rounded-[2rem]">
                                                                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mx-auto mb-4">
                                                                                    {isLoadingModels ? <Loader2 size={24} className="animate-spin" /> : <Box size={24} />}
                                                                                </div>
                                                                                <h5 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em]">No Engines Discovered</h5>
                                                                                <p className="text-xs text-gray-300 mt-2">请检查 API Key 配置并刷新模型库</p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'hosting' && (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div className="flex items-center justify-between px-2">
                                            <div>
                                                <h4 className="text-sm font-black text-gray-900">图床配置</h4>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Image Hosting Infrastructure</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-6">
                                            {/* ImgBB Provider */}
                                            <div className="bg-white border border-gray-100 rounded-[1.5rem] p-8 shadow-sm hover:shadow-md transition-all">
                                                <div className="flex items-center justify-between mb-8">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center">
                                                            <ImageIcon size={24} />
                                                        </div>
                                                        <div>
                                                            <h5 className="font-black text-gray-900 leading-none">ImgBB (推荐)</h5> {/* cspell:disable-line */}
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Free API Hosting</p>
                                                        </div>
                                                    </div>
                                                    <SettingsToggle 
                                                        active={imageHost.selectedProvider === 'imgbb'} // cspell:disable-line
                                                        onClick={() => imageHost.actions.setSelectedProvider(imageHost.selectedProvider === 'imgbb' ? 'none' : 'imgbb')} // cspell:disable-line
                                                    />
                                                </div>
                                                <div className="space-y-4">
                                                    <div className="text-xs font-black text-gray-800 ml-1">API Key (每行一个，轮询)</div>
                                                    <div className="relative">
                                                        <textarea
                                                            value={imageHost.imgbbKey} // cspell:disable-line
                                                            onChange={(e) => imageHost.actions.setImgbbKey(e.target.value)} // cspell:disable-line
                                                            placeholder="支持多 Key，换行分隔轮询"
                                                            rows={4}
                                                            className="w-full bg-muted/50 border border-border/80 text-foreground text-sm rounded-md focus:ring-4 focus:ring-primary/10 focus:border-primary focus:bg-card block px-3 py-2 pr-12 outline-none transition-all placeholder:text-muted-foreground/50 resize-y min-h-[96px]"
                                                            style={{ WebkitTextSecurity: showImgbbKeys ? 'none' : 'disc' } as any}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowImgbbKeys(v => !v)}
                                                            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition"
                                                            title={showImgbbKeys ? '隐藏密钥' : '显示密钥'}
                                                        >
                                                            {showImgbbKeys ? <EyeOff size={16} /> : <Eye size={16} />}
                                                        </button>
                                                    </div>
                                                    <p className="text-[10px] text-gray-400 px-1 italic">上传用于多模态识别的临时图片，主要用于「视觉读取」功能。ImgBB 提供免费额度，适合直接配置使用。</p> {/* cspell:disable-line */}
                                                </div>
                                            </div>

                                            {/* Custom Provider */}
                                            <div className="bg-white border border-gray-100 rounded-[1.5rem] p-8 shadow-sm hover:shadow-md transition-all">
                                                <div className="flex items-center justify-between mb-8">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                                                            <LinkIcon size={24} />
                                                        </div>
                                                        <div>
                                                            <h5 className="font-black text-gray-900 leading-none">自定义接口</h5>
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Custom HTTP API</p>
                                                        </div>
                                                    </div>
                                                    <SettingsToggle 
                                                        active={imageHost.selectedProvider === 'custom'} 
                                                        onClick={() => imageHost.actions.setSelectedProvider(imageHost.selectedProvider === 'custom' ? 'none' : 'custom')} 
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-6">
                                                    <div className="space-y-2">
                                                        <div className="text-xs font-black text-gray-800 ml-1">上传地址 (URL)</div>
                                                        <SettingsInput 
                                                            value={imageHost.customConfig.uploadUrl} 
                                                            onChange={(e) => imageHost.actions.setCustomConfig({ uploadUrl: e.target.value })} 
                                                            placeholder="https://your-api.com/upload" 
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div className="text-xs font-black text-gray-800 ml-1">API Key / Token (每行一个，轮询)</div>
                                                        <div className="relative">
                                                            <textarea
                                                                value={imageHost.customConfig.apiKey}
                                                                onChange={(e) => imageHost.actions.setCustomConfig({ apiKey: e.target.value })}
                                                                placeholder="支持多 Key，换行分隔轮询"
                                                                rows={4}
                                                                className="w-full bg-muted/50 border border-border/80 text-foreground text-sm rounded-md focus:ring-4 focus:ring-primary/10 focus:border-primary focus:bg-card block px-3 py-2 pr-12 outline-none transition-all placeholder:text-muted-foreground/50 resize-y min-h-[96px]"
                                                                style={{ WebkitTextSecurity: showCustomHostKeys ? 'none' : 'disc' } as any}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowCustomHostKeys(v => !v)}
                                                                className="absolute top-2.5 right-2.5 w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition"
                                                                title={showCustomHostKeys ? '隐藏密钥' : '显示密钥'}
                                                            >
                                                                {showCustomHostKeys ? <EyeOff size={16} /> : <Eye size={16} />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div className="text-xs font-black text-gray-800 ml-1">响应解析路径 (JSON Path)</div>
                                                        <SettingsInput 
                                                            value={imageHost.customConfig.responsePath} // cspell:disable-line
                                                            onChange={(e) => imageHost.actions.setCustomConfig({ responsePath: e.target.value })} // cspell:disable-line
                                                            placeholder="例如 data.url" 
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div className="text-xs font-black text-gray-800 ml-1">文件参数名 (Para Name)</div>
                                                        <SettingsInput 
                                                            value={imageHost.customConfig.fileParamName} // cspell:disable-line
                                                            onChange={(e) => imageHost.actions.setCustomConfig({ fileParamName: e.target.value })} // cspell:disable-line
                                                            placeholder="默认为 image" 
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'advanced' && (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <SettingsCard title="交互与增强" icon={<Zap size={20} />}>
                                            <div className="space-y-4">
                                                <SettingsControl label="视觉连续性 (Visual Continuity)" description="开启后 AI 会自动维护角色在多帧生成中的视觉特征一致性。">
                                                    <SettingsToggle active={visualContinuity} onClick={() => setVisualContinuity(!visualContinuity)} />
                                                </SettingsControl>
                                                <SettingsControl label="系统级风控过滤" description="启用后将拦截不符合安全规定的生成请求。">
                                                    <SettingsToggle active={systemModeration} onClick={() => setSystemModeration(!systemModeration)} />
                                                </SettingsControl>
                                            </div>
                                        </SettingsCard>

                                        <SettingsCard title="数据与自动化" icon={<HardDrive size={20} />}>
                                            <div className="space-y-4">
                                                <SettingsControl label="自动存档" description="每 10 分钟自动将工作区状态保存到本地 IndexedDB。">
                                                    <SettingsToggle active={autoSave} onClick={() => setAutoSave(!autoSave)} />
                                                </SettingsControl>
                                            </div>
                                        </SettingsCard>
                                    </div>
                                )}

                                {activeTab === 'storage' && (
                                    <div className="flex flex-col items-center justify-center h-full text-center py-20 animate-in zoom-in-95 duration-500">
                                        <div className="w-24 h-24 bg-gray-100 rounded-[2.5rem] flex items-center justify-center text-gray-400 mb-8">
                                            <HardDrive size={40} />
                                        </div>
                                        <h4 className="text-xl font-black text-gray-900 mb-4">本地资源管理</h4>
                                        <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
                                            您的项目资源目前存储在浏览器 IndexedDB 中。
                                            支持离线编辑与瞬间加载。云端同步功能即将上线。
                                        </p>
                                    </div>
                                )}

                                {activeTab === 'about' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div className="bg-black p-14 rounded-[3rem] text-white relative overflow-hidden shadow-2xl">
                                            <div className="relative z-10">
                                                <h4 className="text-5xl font-black mb-4 tracking-tighter">XC-STUDIO</h4>
                                                <p className="text-blue-400 text-sm font-bold uppercase tracking-[0.3em] mb-10">Engine Version Pro Max 2.6.8</p>
                                                <div className="flex gap-4">
                                                    <div className="px-5 py-2 bg-white/10 rounded-2xl text-[10px] font-black border border-white/10">STABLE RELEASE</div>
                                                    <div className="px-5 py-2 bg-blue-600 rounded-2xl text-[10px] font-black shadow-lg shadow-blue-500/40" style={{ boxShadow: '0 0 20px rgba(37, 99, 235, 0.4)' }}>AGENT CORE V4</div>
                                                </div>
                                            </div>
                                            <div className="absolute -right-16 -bottom-16 opacity-5 rotate-12">
                                                <Zap size={380} fill="white" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-8">
                                            <SettingsCard title="引擎架构" icon={<Info size={20} />}>
                                                <SettingsControl label="内核" description="Vireo & Cameron Orchestrator">
                                                    <span className="text-xs font-mono font-black text-blue-600">v4.2.1-stable</span>
                                                </SettingsControl>
                                            </SettingsCard>
                                            <SettingsCard title="渲染环境" icon={<Globe size={20} />}>
                                                <SettingsControl label="浏览器" description="检测到内核：Chromium">
                                                    <span className="text-xs font-black text-green-500">EXCELLENT</span>
                                                </SettingsControl>
                                            </SettingsCard>
                                        </div>
                                    </div>
                                )}
                            </main>

                            <footer className="px-10 py-8 bg-white border-t border-gray-100 flex justify-end gap-6 sticky bottom-0 z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
                                <button onClick={onClose} className="px-8 py-3 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors">
                                    取消
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className={`px-14 py-3 rounded-2xl text-sm font-black text-white shadow-2xl transition-all duration-300 active:scale-95 flex items-center gap-3 ${saveStatus === 'success'
                                        ? 'bg-green-500 shadow-green-500/30'
                                        : 'bg-blue-600 shadow-blue-600/40 hover:bg-blue-700 hover:-translate-y-0.5'
                                        }`}
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin text-white/40" />
                                            <span>正在同步引擎...</span>
                                        </>
                                    ) : saveStatus === 'success' ? (
                                        <>
                                            <Check size={20} strokeWidth={3} />
                                            <span>同步完成</span>
                                        </>
                                    ) : (
                                        <span>保存并重启工作区</span>
                                    )}
                                </button>
                            </footer>
                        </div>

                        {/* Edit Provider Modal Overlay */}
                        <AnimatePresence>
                            {editingProvider && (
                                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        onClick={() => setEditingProvider(null)}
                                        className="fixed inset-0 bg-black/60 backdrop-blur-md"
                                    />
                                    <motion.div
                                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                        animate={{ scale: 1, opacity: 1, y: 0 }}
                                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                        className="bg-[#1a1a1a] text-white rounded-[2rem] w-full max-w-lg p-10 relative z-[111] shadow-2xl overflow-hidden border border-white/5"
                                    >
                                        <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
                                            <div>
                                                <h4 className="text-xl font-black">{editingProvider.id.startsWith('custom') && !editingProvider.baseUrl ? '添加服务商节点' : '编辑服务商配置'}</h4>
                                                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">Infrastructure Node Config</p>
                                            </div>
                                            <button onClick={() => setEditingProvider(null)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors">
                                                <X size={20} />
                                            </button>
                                        </div>

                                        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-4 no-scrollbar">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest pl-1">平台 ID</label>
                                                    <div className="w-full px-5 py-3 bg-white/5 border border-white/5 rounded-xl text-white/60 text-xs font-mono">
                                                        {editingProvider.id === 'gemini' ? 'Google Cloud' : 'Generic OpenAI'}
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest pl-1">显示名称</label>
                                                    <input
                                                        value={editingProvider.name}
                                                        onChange={e => setEditingProvider({ ...editingProvider, name: e.target.value })}
                                                        placeholder="例如: OpenAI-East"
                                                        className="w-full px-5 py-3 bg-white/5 border border-white/5 rounded-xl outline-none focus:border-blue-500/50 transition-all font-bold text-sm"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest pl-1">Base URL</label>
                                                <input
                                                    value={editingProvider.baseUrl}
                                                    onChange={e => setEditingProvider({ ...editingProvider, baseUrl: e.target.value })}
                                                    placeholder="https://api.openai.com"
                                                    disabled={!editingProvider.isCustom}
                                                    className={`w-full px-5 py-3 bg-white/5 border border-white/5 rounded-xl outline-none focus:border-blue-500/50 transition-all font-mono text-xs ${!editingProvider.isCustom ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between pr-2">
                                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest pl-1">API Keys</label>
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={(e) => { e.preventDefault(); setIsKeysVisible(!isKeysVisible); }}
                                                            className="text-white/20 hover:text-white/60 transition-colors p-1"
                                                            title={isKeysVisible ? "隐藏密钥" : "显示密钥"}
                                                        >
                                                            {isKeysVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                                        </button>
                                                        <span className="text-[10px] text-white/20 font-black">{(editingProvider.apiKey.split('\n').filter(k => k.trim()).length)} 个已输入</span>
                                                    </div>
                                                </div>
                                                <div className="relative group">
                                                    <textarea
                                                        value={editingProvider.apiKey}
                                                        onChange={e => setEditingProvider({ ...editingProvider, apiKey: e.target.value })}
                                                        placeholder="粘贴 API Keys (每行一个，会自动轮询使用)"
                                                        style={{ WebkitTextSecurity: isKeysVisible ? 'none' : 'disc' } as any}
                                                        className="w-full h-32 px-5 py-4 bg-white/5 border border-white/5 rounded-2xl outline-none focus:border-blue-500/50 transition-all font-mono text-xs resize-none placeholder:text-white/10"
                                                    />
                                                    {!isKeysVisible && editingProvider.apiKey && (
                                                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/5 backdrop-blur-[2px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">密钥已隐藏</div>
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-white/20 pl-1">💡 支持多个 Key 轮询使用，失败时自动切换到下一个</p>
                                            </div>
                                        </div>

                                        <div className="flex gap-4 mt-10">
                                            <button
                                                onClick={() => setEditingProvider(null)}
                                                className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-black transition-all"
                                            >
                                                取消
                                            </button>
                                            <button
                                                onClick={() => {
                                                    // Save to providers array
                                                    setProviders(prev => {
                                                        const exists = prev.find(p => p.id === editingProvider.id);
                                                        if (exists) {
                                                            return prev.map(p => p.id === editingProvider.id ? editingProvider : p);
                                                        } else {
                                                            return [...prev, editingProvider];
                                                        }
                                                    });
                                                    setActiveProviderId(editingProvider.id);
                                                    setEditingProvider(null);
                                                }}
                                                className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 rounded-2xl text-xs font-black shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
                                            >
                                                保存配置
                                            </button>
                                        </div>
                                    </motion.div>
                                </div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
};
