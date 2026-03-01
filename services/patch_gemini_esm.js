import fs from 'fs';
const path = 'c:\\Users\\xiaoc\\Desktop\\XC-STUDIO\\services\\gemini.ts';
let content = fs.readFileSync(path, 'utf8');

const newCode = `// 统一模型获取助手
export const getBestModelId = (type: 'text' | 'image' | 'video' = 'text'): string => {
    if (type === 'image') {
        const s = localStorage.getItem('setting_image_models');
        const selected = JSON.parse(s || '[]');
        if (selected.length === 0 || selected.includes('Auto')) return IMAGE_PRO_MODEL;
        return selected[0] === 'Nano Banana Pro' ? IMAGE_PRO_MODEL : selected[0];
    }
    if (type === 'video') {
        const s = localStorage.getItem('setting_video_models');
        const selected = JSON.parse(s || '[]');
        if (selected.length > 0) return selected[0];
        return VEO_FAST_MODEL;
    }
    const config = getProviderConfig();
    const isProxy = config.id !== 'gemini' || (config.baseUrl && !config.baseUrl.includes('googleapis.com'));
    // 强制分析阶段对齐用户要求的高阶预览模型，解决中转 CORS/503 问题
    return isProxy ? IMAGE_PRO_MODEL : FLASH_MODEL;
};

export const getClient = () => {
    const config: any = { apiKey: getApiKey() };
    let baseUrl = getApiUrl();
    if (baseUrl) {
        baseUrl = baseUrl.replace(/\\/+$/, '');
        if (!/\\/v\\d+(beta)?$/i.test(baseUrl)) baseUrl = \`\${baseUrl}/v1beta\`;
        config.httpOptions = { baseUrl };
        console.log(\`[GenAI] Using Proxy with patch: \${baseUrl}\`);
    }
    const client = new GoogleGenAI(config);
    (client as any).getBestModelId = getBestModelId;
    return client;
};`;

if (content.includes('export const getClient')) {
    const startIdx = content.indexOf('export const getClient');
    // Find matching closing brace
    let openBraces = 0;
    let endIdx = -1;
    for (let i = startIdx; i < content.length; i++) {
        if (content[i] === '{') openBraces++;
        if (content[i] === '}') {
            openBraces--;
            if (openBraces === 0) {
                endIdx = i + 1;
                break;
            }
        }
    }
    if (endIdx !== -1) {
        const originalBlock = content.substring(startIdx, endIdx);
        content = content.replace(originalBlock, newCode);
        fs.writeFileSync(path, content, 'utf8');
        console.log('Patch applied successfully!');
    }
}
