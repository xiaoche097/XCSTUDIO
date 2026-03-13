export function collectReferenceCandidates(
  params: Record<string, any>,
  input: {
    uploadedAttachments?: string[];
    attachments?: Array<{ type?: string }>;
    metadata?: Record<string, any>;
  },
  maxReferenceImages: number,
): {
  limitedCandidates: string[];
  sourceCount: number;
  truncated: boolean;
} {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const selectedProvider = String(input.metadata?.imageHostProvider || 'none');
  const preferHostedUrls = selectedProvider !== 'none';

  const pushCandidate = (value: unknown) => {
    if (typeof value !== 'string') return;
    const v = value.trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    candidates.push(v);
  };

  if (Array.isArray(params.referenceImages)) {
    params.referenceImages.forEach(pushCandidate);
  }

  [
    params.referenceImage,
    params.referenceImageUrl,
    params.reference_image_url,
    params.initImage,
    params.init_image,
  ].forEach(pushCandidate);

  const uploaded = input.uploadedAttachments || [];
  uploaded.forEach(pushCandidate);

  const multimodalUrls = input.metadata?.multimodalContext?.referenceImageUrls || [];
  multimodalUrls.forEach(pushCandidate);

  // 如果没有公网 URL，或者强制优先附件，则添加附件
  if (!preferHostedUrls || uploaded.length === 0) {
    (input.attachments || []).forEach((file, index) => {
      // [XC-STUDIO] 修正：如果该附件带有 markerInfo 且其 parentUrl 已经在 seen 中，则跳过计件
      // 这里的 logic 是为了防止 1+1=2 的认知错误
      const fileAny = file as any;
      if (fileAny?.markerInfo?.parentUrl && seen.has(fileAny.markerInfo.parentUrl)) {
        return; 
      }

      if (file?.type && file.type.startsWith('image/')) {
        pushCandidate(`ATTACHMENT_${index}`);
      }
    });
  }

  return {
    limitedCandidates: candidates.slice(0, maxReferenceImages),
    sourceCount: candidates.length,
    truncated: candidates.length > maxReferenceImages,
  };
}
