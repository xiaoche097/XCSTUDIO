import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Key, X, Check, Eye, EyeOff, Loader2, Link as LinkIcon, 
  Shield, Sliders, HardDrive, Info, Globe, Banana, Zap, 
  Bot, Search, RefreshCw, ChevronDown, ChevronUp, 
  FileText, Image as ImageIcon, Video, Plus, Box, ArrowLeft 
} from 'lucide-react';
import { SettingsCard } from '../components/Settings/SettingsCard';
import { SettingsControl, SettingsToggle, SettingsInput, SettingsSelect } from '../components/Settings/SettingsControl';
import { useImageHostStore } from '../stores/imageHost.store';
import Sidebar from '../components/Sidebar';
import {
    ApiProviderConfig,
    ModelInfo,
    getDefaultProviders,
    loadProviderSettings,
    saveProviderSettings,
    refreshProviderModels,
} from '../services/provider-settings';

type ApiProvider = 'gemini' | 'yunwu' | 'plato' | 'custom';
type SettingsTab = 'api' | 'mapping' | 'hosting' | 'advanced' | 'storage' | 'about';
const AUTO_IMAGE_OPTION_ID = 'Auto';

const DEFAULT_MODEL_WHITELIST = [
    // 图片模型
    'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview', 'gemini-2.5-flash-image',
    'doubao-seedream-5-0-260128', 'gpt-image-1.5-all', 'flux-pro-max',
    // 语言模型
    'gemini-3.1-pro-preview', 'gemini-3-pro-preview', 'gemini-3-flash-preview',
    'gemini-3-pro-preview-11-2025', 'gemini-3-pro-preview-thinking',
    'gemini-2.5-pro', 'gemini-2.5-pro-thinking',
    'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-opus-4-6-thinking',
    'claude-haiku-4-5-20251001-thinking', 'claude-haiku-4-5-20251001',
    'deepseek-v3.2', 'deepseek-v3.2-thinking', /* cspell:disable-line */
    'gpt-5.3-codex', 'gpt-5.3-codex-high', 'grok-4.2',
    // 视频模型
    'grok-video-3-15s', 'grok-video-3-10s', 'grok-video-3',
    'doubao-seedance-1-5-pro-251215', /* cspell:disable-line */
    'sora-2-all', 'sora-2-pro-all', 'wan2.6-i2v', 'veo3.1-4k', 'veo3.1-c'
];

const PROVIDER_ICONS: { id: ModelInfo['brand'] | string; name: string; icon: string }[] = [
    { id: 'deepseek', name: 'DeepSeek', icon: '/icons/deepseek.svg' }, /* cspell:disable-line */
    { id: 'openai', name: 'OpenAI', icon: '/icons/openai.svg' },
    { id: 'anthropic', name: 'Anthropic', icon: '/icons/anthropic.svg' },
    { id: 'volcengine', name: '火山引擎', icon: '/icons/volc.svg' }, /* cspell:disable-line */
    { id: 'bailian', name: '阿里百炼', icon: '/icons/alibailian.svg' }, /* cspell:disable-line */
    { id: 'chatglm', name: '智谱清言', icon: '/icons/chatglm.svg' }, /* cspell:disable-line */
    { id: 'wenxin', name: '百度文心', icon: '/icons/wenxin.svg' }, /* cspell:disable-line */
    { id: 'minimax', name: '海螺 MiniMax', icon: '/icons/minimax.svg' },
    { id: 'gemini', name: 'Google Node', icon: '/icons/gemini.svg' },
    { id: 'imagen', name: 'Imagen Node', icon: '/icons/imagen.svg' }, /* cspell:disable-line */
    { id: 'flux', name: 'Flux AI Node', icon: '/icons/flux.svg' },
    { id: 'ideogram', name: 'Ideogram Node', icon: '/icons/ideogram.svg' },
    { id: 'fal', name: 'Fal AI Node', icon: '/icons/fal.svg' },
    { id: 'hailuo', name: 'Hailuo Node', icon: '/icons/hailuo.svg' }, /* cspell:disable-line */
    { id: 'replicate', name: 'Replicate Node', icon: '/icons/replicate.svg' },
    { id: 'midjourney', name: 'Midjourney Node', icon: '/icons/midjourney.svg' },
];

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
        className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${isSelected
            ? 'bg-gray-50/50 border-black shadow-sm' : 'bg-white border-gray-100 hover:border-gray-300'
            }`}
    >
        <div className="flex items-center gap-4">
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected
                ? 'bg-black border-black' : 'border-gray-200'
                }`}>
                {isSelected && <Check size={12} className="text-white" strokeWidth={4} />}
            </div>
            <div>
                <div className="text-sm font-bold text-gray-800 tracking-tight truncate max-w-[180px]">{model.id}</div>
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">{model.brand || 'Other'} Node</div>
            </div>
        </div>
        <div className="text-[10px] font-bold px-2.5 py-1 bg-gray-50 text-gray-400 rounded-md group-hover:bg-gray-100 group-hover:text-black transition-colors">
            {providerName}
        </div>
    </div>
));

ModelCard.displayName = 'ModelCard';

const SettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<SettingsTab>('api');
    const [providers, setProviders] = useState<ApiProviderConfig[]>(getDefaultProviders());
    const [activeProviderId, setActiveProviderId] = useState('yunwu');

    const [replicateKey, setReplicateKey] = useState('');
    const [klingKey, setKlingKey] = useState('');
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
    const [showImgBBKeys, setShowImgBBKeys] = useState(false);
    const [showCustomHostKeys, setShowCustomHostKeys] = useState(false);

    const [expandedCategory, setExpandedCategory] = useState<string | null>('image');
    const [visibleCount, setVisibleCount] = useState(60);

    // Advanced Settings
    const [visualContinuity, setVisualContinuity] = useState(true);
    const [systemModeration, setSystemModeration] = useState(false);
    const [autoSave, setAutoSave] = useState(true);
    const [concurrentCount, setConcurrentCount] = useState(1);

    // Editing state
    const [editingProvider, setEditingProvider] = useState<ApiProviderConfig | null>(null);

    const normalizeImageSelection = (models: string[]): string[] => {
        if (!Array.isArray(models) || models.length === 0) return [AUTO_IMAGE_OPTION_ID];
        if (models.includes(AUTO_IMAGE_OPTION_ID)) return [AUTO_IMAGE_OPTION_ID];
        return [models[0]];
    };

    // Image Host Store (Reactive Hook)
    const imageHost = useImageHostStore();

    useEffect(() => {
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
    }, []);

    const activeProvider = providers.find(p => p.id === activeProviderId) || providers[0];

    useEffect(() => {
        if (activeProviderId) {
            handleRefreshModels(activeProviderId);
        }
    }, [activeProviderId]);

    const handleRefreshModels = async (providerId: string) => {
        setIsLoadingModels(true);
        const formattedModels = await refreshProviderModels(providerId, providers);

        setAvailableModels(formattedModels);

        // 自动勾选逻辑：如果模型在白名单中，且目前未被手动勾选，则自动勾选
        const autoSelect = (cat: 'script' | 'image' | 'video', currentSelected: string[], setCurrent: React.Dispatch<React.SetStateAction<string[]>>) => {
            if (cat === 'image') return;
            const newMatches = formattedModels
                .filter(m => m.category === cat && DEFAULT_MODEL_WHITELIST.includes(m.id) && !currentSelected.includes(m.id))
                .map(m => m.id);
            
            if (newMatches.length > 0) {
                setCurrent(prev => [...new Set([...prev, ...newMatches])]);
            }
        };

        autoSelect('script', selectedScriptModels, setSelectedScriptModels);
        autoSelect('image', selectedImageModels, setSelectedImageModels);
        autoSelect('video', selectedVideoModels, setSelectedVideoModels);

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
            setTimeout(() => setSaveStatus('idle'), 2000);
        }, 600);
    };

    const deleteProvider = (id: string) => {
        if (!window.confirm('确定要删除此节点吗？')) return;
        setProviders(prev => prev.filter(p => p.id !== id));
        if (activeProviderId === id) setActiveProviderId('');
    };

    const filteredModels = useMemo(() => {
        return availableModels.filter(m => {
            if (m.id.toLowerCase().includes('embedding')) return false;
            const matchesCategory = m.category === expandedCategory;
            const matchesSearch = m.id.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesBrand = brandFilter === 'all' || m.brand?.toLowerCase() === brandFilter.toLowerCase();
            return matchesCategory && matchesSearch && matchesBrand;
        });
    }, [availableModels, searchQuery, brandFilter, expandedCategory]);

    useEffect(() => {
        setVisibleCount(60);
    }, [searchQuery, brandFilter, availableModels]);

    const tabs: { id: SettingsTab; label: string; icon: any }[] = [
        { id: 'api', label: '服务商配置', icon: Key },
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

    return (
        <div className="flex min-h-screen bg-[#f8f9fa] selection:bg-black/5 transition-colors duration-500">
            <Sidebar />
            
            <div className="flex-1 flex flex-col pb-16 lg:pb-0">
                <header className="px-6 lg:px-12 py-8 lg:mt-4 flex items-center justify-between sticky top-0 z-30 bg-[#f8f9fa]/80 backdrop-blur-xl">
                    <div className="flex items-center gap-4 lg:gap-8 ml-2">
                        <button 
                            onClick={() => navigate(-1)}
                            className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-black border border-gray-200 transition-all active:scale-95"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div className="flex flex-col">
                            <h3 className="text-2xl lg:text-3xl font-display font-bold text-foreground tracking-tight flex items-center gap-4">
                                设置中心
                                {activeTab && (
                                    <span className="hidden sm:inline-block text-[11px] lg:text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-bold uppercase tracking-wider border border-primary/20">
                                        {tabs.find(t => t.id === activeTab)?.label}
                                    </span>
                                )}
                            </h3>
                            <p className="hidden lg:block text-[11px] lg:text-xs text-muted-foreground/60 uppercase tracking-[0.2em] mt-1.5 font-semibold">XC-STUDIO Infrastructure</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`px-7 lg:px-10 py-2.5 lg:py-3 rounded-full text-sm lg:text-[15px] font-bold text-white shadow-xl shadow-black/10 transition-all duration-300 active:scale-95 hover:-translate-y-0.5 flex items-center gap-2 lg:gap-3 ${saveStatus === 'success'
                                ? 'bg-green-500 hover:bg-green-600'
                                : 'bg-black hover:bg-gray-800'
                                }`}
                        >
                            {isSaving ? <Loader2 size={18} className="animate-spin" /> : saveStatus === 'success' ? <Check size={18} /> : <div className="p-0.5 bg-white/20 rounded-md"><RefreshCw size={16} /></div>}
                            <span className="hidden xs:inline">{saveStatus === 'success' ? '配置已入库' : '保存系统设置'}</span>
                            <span className="xs:hidden">{saveStatus === 'success' ? 'OK' : '保存'}</span>
                        </button>
                    </div>
                </header>

                <div className="flex flex-1 flex-col lg:flex-row max-w-[1800px] w-full mx-auto px-6 lg:px-10">
                    {/* Inner Sidebar */}
                    <div className="lg:w-56 w-full py-10 flex lg:flex-col overflow-x-auto lg:overflow-y-auto gap-0.5 no-scrollbar lg:border-r lg:border-gray-200/50 pr-8">
                        {tabs.map(tab => {
                            const Icon = tab.icon;
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-4 px-6 py-3.5 rounded-xl transition-all duration-300 group shrink-0 lg:shrink ${active
                                        ? 'bg-gray-100/80 text-black shadow-sm'
                                        : 'text-gray-450 hover:bg-gray-50 hover:text-gray-900'
                                        }`}
                                >
                                    <div className={`p-2 rounded-lg transition-colors ${active ? 'bg-black/5 text-black' : 'text-gray-400 group-hover:text-gray-700'}`}>
                                        <Icon size={20} />
                                    </div>
                                    <span className={`text-[15px] tracking-tight ${active ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
                                    {active && (
                                        <motion.div 
                                            layoutId="activeTabDot"
                                            className="ml-auto w-1.5 h-4 rounded-full bg-black"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Main Content */}
                    <main className="flex-1 p-6 lg:p-14 space-y-12 no-scrollbar pb-24 lg:pb-10">
                        {activeTab === 'api' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-xl font-display font-bold text-gray-900">API 供应商</h4>
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Infrastructure Management</p>
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
                                        className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-[14px] font-bold text-gray-700 hover:border-gray-400 transition-all shadow-sm active:scale-95"
                                    >
                                        <Plus size={16} />
                                        添加节点
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    {providers.map(p => (
                                        <div
                                            key={p.id}
                                            className={`bg-white border rounded-2xl p-5 transition-all flex items-center justify-between ${activeProviderId === p.id ? 'border-gray-200 ring-4 ring-gray-100 shadow-premium' : 'border-gray-100 hover:border-gray-200'}`}
                                        >
                                            <div className="flex items-center gap-5">
                                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${activeProviderId === p.id ? 'bg-black text-white' : 'bg-gray-50 text-gray-400'}`}>
                                                    {p.id === 'gemini' ? <Zap size={24} /> : <Globe size={24} />}
                                                </div>
                                                <div>
                                                    <h5 className="text-lg font-bold text-gray-900 leading-tight mb-1">{p.name}</h5>
                                                    <div className="text-xs text-gray-400 font-medium truncate max-w-[240px]">{p.baseUrl || 'Default Endpoint'}</div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => setEditingProvider({ ...p })}
                                                    className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-gray-50 text-gray-400 hover:text-black transition-all"
                                                >
                                                    <Sliders size={18} />
                                                </button>
                                                <button
                                                    onClick={() => setActiveProviderId(p.id)}
                                                    className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${activeProviderId === p.id ? 'bg-black text-white' : 'bg-gray-50 text-gray-500 hover:text-black hover:bg-gray-100'}`}
                                                >
                                                    {activeProviderId === p.id ? '当前使用' : '切换节点'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="grid grid-cols-2 gap-6 mt-8">
                                    <SettingsCard title="交互增强" icon={<Zap size={18} />} description="全局生成设置">
                                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl mt-4">
                                            <div>
                                                <div className="text-sm font-bold text-gray-800">并行任务数</div>
                                                <div className="text-xs text-gray-500 font-medium">建议设置 1-3</div>
                                            </div>
                                            <input
                                                type="number"
                                                value={concurrentCount}
                                                onChange={e => setConcurrentCount(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="w-20 h-11 bg-white border border-gray-200 rounded-xl px-4 text-sm font-bold text-center outline-none focus:ring-4 focus:ring-black/5"
                                            />
                                        </div>
                                    </SettingsCard>
                                    
                                    <div className="space-y-4">
                                        <SettingsCard title="三方集成" icon={<Plus size={18} />}>
                                            <div className="space-y-4 mt-4">
                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-[11px] font-bold text-gray-500 uppercase ml-1">Replicate Key</label>
                                                    <SettingsInput type="password" value={replicateKey} onChange={e => setReplicateKey(e.target.value)} placeholder="r8_..." />
                                                </div>
                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-[11px] font-bold text-gray-500 uppercase ml-1">Kling Key</label>
                                                    <SettingsInput type="password" value={klingKey} onChange={e => setKlingKey(e.target.value)} placeholder="kling-..." />
                                                </div>
                                            </div>
                                        </SettingsCard>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'hosting' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <SettingsCard title="图床服务商" icon={<ImageIcon size={18} />} description="选择图片存储方案（用于智能视觉记忆）">
                                        <div className="space-y-4 pt-4">
                                            {(['none', 'imgbb', 'custom'] as const).map((providerId) => ( /* cspell:disable-line */
                                                <button
                                                    key={providerId}
                                                    onClick={() => imageHost.actions.setSelectedProvider(providerId)}
                                                    className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all group ${
                                                        imageHost.selectedProvider === providerId 
                                                            ? 'bg-primary/5 border-primary shadow-sm' 
                                                            : 'bg-card border-border/50 hover:bg-muted/50'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={`p-2 rounded-lg ${
                                                            imageHost.selectedProvider === providerId ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                                                        }`}>
                                                            {providerId === 'none' ? <X size={16} /> : providerId === 'imgbb' ? <ImageIcon size={16} /> : <Globe size={16} />} {/* cspell:disable-line */}
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="text-[15px] font-bold">{providerId === 'none' ? '不启用' : providerId === 'imgbb' ? 'ImgBB' : '自定义 API'}</div> {/* cspell:disable-line */}
                                                            <div className="text-[11px] text-muted-foreground uppercase tracking-widest px-0.5">{providerId === 'none' ? '仅使用临时链接' : providerId === 'imgbb' ? '官方 API' : '兼容协议'}</div> {/* cspell:disable-line */}
                                                        </div>
                                                    </div>
                                                    {imageHost.selectedProvider === providerId && <Check size={16} className="text-primary" />}
                                                </button>
                                            ))}
                                        </div>
                                    </SettingsCard>

                                    {imageHost.selectedProvider === 'imgbb' && ( /* cspell:disable-line */
                                        <SettingsCard title="ImgBB 参数" icon={<Key size={18} />}> {/* cspell:disable-line */}
                                            <div className="space-y-4 mt-4">
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">API KEY (每行一个，轮询)</label>
                                                    <div className="relative">
                                                        <textarea
                                                            value={imageHost.imgbbKey} // cspell:disable-line
                                                            onChange={(e) => imageHost.actions.setImgbbKey(e.target.value)} // cspell:disable-line
                                                            placeholder="支持多 Key，换行分隔"
                                                            rows={4}
                                                            className="w-full bg-muted/50 border border-border/80 text-foreground text-sm rounded-md focus:ring-4 focus:ring-primary/10 focus:border-primary focus:bg-card block px-3 py-2 pr-12 outline-none transition-all placeholder:text-muted-foreground/50 resize-y min-h-[96px]"
                                                            style={{ WebkitTextSecurity: showImgBBKeys ? 'none' : 'disc' } as any}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowImgBBKeys(v => !v)}
                                                            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition"
                                                            title={showImgBBKeys ? '隐藏密钥' : '显示密钥'}
                                                        >
                                                            {showImgBBKeys ? <EyeOff size={16} /> : <Eye size={16} />}
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
                                                    从 <a href="https://api.imgbb.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">ImgBB API</a> 获取密钥。免费版支持无限存储量。 {/* cspell:disable-line */}
                                                </p>
                                            </div>
                                        </SettingsCard>
                                    )}

                                    {imageHost.selectedProvider === 'custom' && (
                                        <SettingsCard title="自定义图床" icon={<Globe size={18} />}>
                                            <div className="space-y-4 mt-4">
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">上传地址 (Upload URL)</label>
                                                    <SettingsInput 
                                                        value={imageHost.customConfig.uploadUrl} 
                                                        onChange={(e) => imageHost.actions.setCustomConfig({ uploadUrl: e.target.value })} 
                                                        placeholder="https://your-host.com/api/upload" 
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">身份验证 (Auth Token，多行轮询)</label>
                                                    <div className="relative">
                                                        <textarea
                                                            value={imageHost.customConfig.apiKey}
                                                            onChange={(e) => imageHost.actions.setCustomConfig({ apiKey: e.target.value })}
                                                            placeholder="支持多 Key，换行分隔"
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
                                            </div>
                                        </SettingsCard>
                                    )}
                                </div>
                            </div>
                        )}
                        {activeTab === 'advanced' && (
                            <div className="max-w-3xl space-y-6">
                                <SettingsCard title="体验优化" icon={<Zap size={18} />}>
                                    <div className="space-y-2 mt-4">
                                        <SettingsControl label="视觉一致性" description="智能体在多个生成步骤间保持视觉特征。">
                                            <SettingsToggle active={visualContinuity} onClick={() => setVisualContinuity(!visualContinuity)} />
                                        </SettingsControl>
                                        <SettingsControl label="安全过滤" description="启用系统内置的合规性预警流程。">
                                            <SettingsToggle active={systemModeration} onClick={() => setSystemModeration(!systemModeration)} />
                                        </SettingsControl>
                                        <SettingsControl label="自动保存" description="工作进度的后台即时备份（每 5 分钟）。">
                                            <SettingsToggle active={autoSave} onClick={() => setAutoSave(!autoSave)} />
                                        </SettingsControl>
                                    </div>
                                </SettingsCard>
                            </div>
                        )}

                        {activeTab === 'storage' && (
                            <div className="flex flex-col items-center justify-center py-20 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                                <HardDrive size={48} className="text-gray-300 mb-6" />
                                <h4 className="text-lg font-bold text-gray-900 mb-2">架构节点加载中</h4>
                                <p className="text-xs text-gray-400 max-w-xs leading-relaxed">当前版本 XC-Studio 仅支持本地存储，云端同步模块正在进行内测（预计 V5.0 加入）。</p>
                            </div>
                        )}

                        {activeTab === 'about' && (
                            <div className="space-y-10 max-w-4xl mx-auto">
                                <div className="bg-foreground p-12 lg:p-16 rounded-lg text-background relative overflow-hidden shadow-2xl">
                                    <div className="relative z-10">
                                        <h4 className="text-5xl lg:text-7xl font-display font-bold mb-4 tracking-tighter">XC-STUDIO</h4>
                                        <p className="text-primary text-xs lg:text-sm font-bold uppercase tracking-[0.4em] mb-12">System Architecture Engine V4.2.0</p>
                                        <div className="flex flex-wrap gap-4">
                                            <div className="px-5 py-2 bg-background/10 rounded-md text-[10px] font-bold backdrop-blur-md border border-background/20 uppercase tracking-widest">PRODUCTION STABLE</div>
                                            <div className="px-5 py-2 bg-primary rounded-md text-[10px] font-bold shadow-lg shadow-primary/20 uppercase tracking-widest">AGENT CORE UPGRADED</div>
                                        </div>
                                    </div>
                                    <Zap size={280} className="absolute -right-12 -bottom-12 opacity-5 rotate-12 text-background fill-background" />
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <SettingsCard title="系统信息" icon={<Info size={18} />}>
                                        <div className="mt-4 space-y-4">
                                            <div className="flex items-center justify-between py-2 border-b border-border/30">
                                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">内核版本</span>
                                                <span className="font-mono font-bold text-primary text-xs">v4.2.1-SR2</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">开发代号</span>
                                                <span className="font-display font-bold text-foreground text-xs tracking-tight">Antigravity</span>
                                            </div>
                                        </div>
                                    </SettingsCard>
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            </div>

            {/* Provider Edit Overlay */}
            <AnimatePresence>
                {editingProvider && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-xl">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl p-8 w-full max-w-xl shadow-2xl relative border border-gray-100"
                        >
                            <button 
                                onClick={() => setEditingProvider(null)}
                                className="absolute right-8 top-8 p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl transition-all"
                            >
                                <X size={20} />
                            </button>

                            <h4 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-3">
                                <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center">
                                    <Plus size={20} />
                                </div>
                                {editingProvider.isCustom ? '配置新节点' : '编辑节点参数'}
                            </h4>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">节点名称</label>
                                    <SettingsInput 
                                        value={editingProvider.name} 
                                        onChange={e => setEditingProvider({ ...editingProvider, name: e.target.value })} 
                                        placeholder="例如：Gemini 代理" 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">API 端点 (Base URL)</label>
                                    <SettingsInput 
                                        value={editingProvider.baseUrl} 
                                        onChange={e => setEditingProvider({ ...editingProvider, baseUrl: e.target.value })} 
                                        placeholder="https://..." 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">API 密钥 (支持多行轮询)</label>
                                    <textarea
                                        value={editingProvider.apiKey}
                                        onChange={e => setEditingProvider({ ...editingProvider, apiKey: e.target.value })}
                                        placeholder="粘贴 API Key，每行一个"
                                        className="w-full h-32 p-5 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-mono outline-none focus:ring-4 focus:ring-black/5 focus:border-black transition-all resize-none"
                                    />
                                </div>
                            </div>

                            <div className="mt-10 flex gap-4">
                                <button
                                    onClick={() => setEditingProvider(null)}
                                    className="flex-1 py-3.5 bg-gray-50 rounded-xl text-xs font-bold text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-all uppercase tracking-widest"
                                >
                                    放弃
                                </button>
                                <button
                                    onClick={() => {
                                        setProviders(prev => {
                                            const idx = prev.findIndex(p => p.id === editingProvider.id);
                                            if (idx > -1) {
                                                const next = [...prev];
                                                next[idx] = editingProvider;
                                                return next;
                                            }
                                            return [...prev, editingProvider];
                                        });
                                        setEditingProvider(null);
                                    }}
                                    className="flex-1 py-3.5 bg-black rounded-xl text-xs font-bold text-white shadow-lg hover:bg-gray-800 transition-all uppercase tracking-widest"
                                >
                                    确认部署
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SettingsPage;
