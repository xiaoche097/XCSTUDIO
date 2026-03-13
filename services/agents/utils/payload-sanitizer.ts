/**
 * Payload Sanitizer Utility
 * 用于在发送给 LLM 之前清洗对象，防止 Base64 或超长字符串导致 413 Payload Too Large 错误。
 */

/**
 * 递归清洗对象中的长字符串
 * @param obj 要清洗的对象
 * @param maxStringLen 最大允许的字符串长度，默认 1024
 * @returns 清洗后的新对象
 */
export function sanitizeObject<T>(obj: T, maxStringLen: number = 1024): T {
    if (obj === null || obj === undefined) return obj;

    // 处理数组
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, maxStringLen)) as unknown as T;
    }

    // 处理对象
    if (typeof obj === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeObject(value, maxStringLen);
        }
        return sanitized as T;
    }

    // 处理字符串
    if (typeof obj === 'string') {
        // 识别 Base64 特征或单纯超长
        if (obj.length > maxStringLen) {
            if (obj.startsWith('data:image/') || obj.includes(';base64,')) {
                return `[BASE64_IMAGE_DATA_OMITTED_SIZE_${obj.length}]` as unknown as T;
            }
            return `${obj.slice(0, maxStringLen)}... [TRUNCATED_TOTAL_${obj.length}]` as unknown as T;
        }
    }

    return obj;
}

/**
 * 专门针对长字符串的粗暴 Base64 正则清洗（防漏防御）
 * 修复：使用正则处理超长字符串可能导致 Maximum call stack size exceeded
 */
export function sanitizeStringBase64(str: string): string {
    if (!str || str.length < 50000) return str; 
    
    // 采用更安全的手动切分方式，避免深层正则递归
    if (str.includes('data:image/') && str.includes(';base64,')) {
        const parts = str.split(/(data:image\/[a-zA-Z]*;base64,)/);
        return parts.map(part => {
            if (part.startsWith('data:image/') && part.endsWith(';base64,')) {
                return part; // 保留前缀用于定位，但随后会截断内容
            }
            // 如果上一个部分是前缀，且当前部分很长，则截断
            if (part.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(part.slice(0, 100))) {
                return `[BASE64_IMAGE_STRIPPED_SIZE_${part.length}]`;
            }
            return part;
        }).join('');
    }
    return str;
}

/**
 * 安全的 JSON 序列化并截断
 * @param value 要序列化的值
 * @param maxChars 最终字符串的最大长度
 */
export function compactJson(value: any, maxChars: number): string {
    try {
        // 先进行结构化清洗，防止 stringify 过程崩溃或内存溢出
        const sanitized = sanitizeObject(value, Math.min(maxChars, 2048));
        const json = JSON.stringify(sanitized);
        if (json.length <= maxChars) return json;
        return json.slice(0, maxChars) + "...";
    } catch (e) {
        console.error('[PayloadSanitizer] compactJson failed:', e);
        return "{}";
    }
}
