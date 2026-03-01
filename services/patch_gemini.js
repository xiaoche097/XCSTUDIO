const fs = require('fs');
const path = 'c:\\Users\\xiaoc\\Desktop\\XC-STUDIO\\services\\gemini.ts';
let content = fs.readFileSync(path, 'utf8');

const oldCode = `export const getClient = () => {
    const config: any = { apiKey: getApiKey() };
    const baseUrl = getApiUrl();
    if (baseUrl) {
        config.httpOptions = { baseUrl }; // @google/genai SDK uses httpOptions.baseUrl
    }
    return new GoogleGenAI(config);
};`;

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
    // 强制分析阶段对齐用户的高阶模型偏好，解决中转 CORS/503 问题
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

// Use a more flexible replace if exact match fails
if (content.includes('export const getClient')) {
    const startIdx = content.indexOf('export const getClient');
    const endIdx = content.indexOf('};', startIdx) + 2;
    const originalBlock = content.substring(startIdx, endIdx);
    console.log('Original block found, patching...');
    content = content.replace(originalBlock, newCode);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Patch applied successfully!');
} else {
    console.error('Could not find getClient function in gemini.ts');
}
