import { openWorkspaceDB, TOPIC_ASSET_STORE, TOPIC_MEMORY_ITEM_STORE, TOPIC_SNAPSHOT_STORE } from './storage';
import { parseMemoryKey } from './topicMemory/key';

export type TopicAssetRole =
  | 'product'
  | 'product_anchor'
  | 'model'
  | 'model_anchor_sheet'
  | 'reference'
  | 'result';

export type AssetRef = {
  assetId: string;
  role: TopicAssetRole;
  url?: string;
  createdAt: number;
};

type TopicSnapshot = {
  memoryKey: string;
  topicId: string; // deprecated: kept for backward compatibility
  updatedAt: number;
  summaryText: string;
  pinned: {
    constraints: string[];
    decisions: string[];
  };
  clothingStudio?: {
    productImageRefs: AssetRef[];
    productAnchorRef?: AssetRef;
    modelAnchorSheetRef?: AssetRef;
    modelRef?: AssetRef;
    analysis?: {
      anchorDescription: string;
      forbiddenChanges: string[];
      recommendedPoses: string[];
      recommendedStyling: any;
    };
    requirements?: {
      platform: string;
      aspectRatio: string;
      targetLanguage: string;
      clarity: '1K' | '2K' | '4K';
      count: number;
      referenceUrl?: string;
      description?: string;
    };
    lastPlan?: any;
  };

  // Generic listing workflows (e.g. Amazon listing sets)
  listing?: {
    amazonListing?: {
      updatedAt: number;
      productImageUrls?: string[];
      plan?: any;
      remaining?: any[];
    };
  };
};

type PinnedPatch = {
  constraints?: string[];
  decisions?: string[];
  mode?: 'merge' | 'replace';
};

type TopicMemoryItem = {
  id: string;
  memoryKey: string;
  topicId: string; // deprecated: kept for backward compatibility
  type: 'constraint' | 'instruction' | 'analysis' | 'asset_tag' | 'plan' | 'issue';
  text: string;
  tags?: string[];
  refs?: AssetRef[];
  createdAt: number;
};

type TopicAsset = {
  assetId: string;
  memoryKey: string;
  topicId: string; // deprecated: kept for backward compatibility
  role: TopicAssetRole;
  mime: string;
  url?: string;
  blob?: Blob;
  width?: number;
  height?: number;
  createdAt: number;
};

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function getSnapshot(memoryKey: string): Promise<TopicSnapshot | null> {
  const db = await openWorkspaceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TOPIC_SNAPSHOT_STORE, 'readonly');
    const req = tx.objectStore(TOPIC_SNAPSHOT_STORE).get(memoryKey);
    req.onsuccess = () => resolve((req.result as TopicSnapshot) || null);
    req.onerror = () => reject(req.error);
  });
}

function getCandidateKeys(memoryKey: string): string[] {
  const base = String(memoryKey || '').trim();
  if (!base) return [];
  const parsed = parseMemoryKey(base);
  return dedupe([base, parsed?.conversationId || '']);
}

async function loadSnapshotByAnyKey(memoryKey: string): Promise<{ snapshot: TopicSnapshot | null; resolvedKey: string | null }> {
  const keys = getCandidateKeys(memoryKey);
  for (const key of keys) {
    const snapshot = await getSnapshot(key);
    if (snapshot) {
      return { snapshot, resolvedKey: key };
    }
  }
  return { snapshot: null, resolvedKey: null };
}

function isCompositeMemoryKey(key: string): boolean {
  return !!parseMemoryKey(key);
}

async function migrateSnapshotKeyIfNeeded(targetKey: string, loaded: { snapshot: TopicSnapshot | null; resolvedKey: string | null }): Promise<TopicSnapshot | null> {
  if (!loaded.snapshot) return null;
  if (!targetKey || !isCompositeMemoryKey(targetKey)) return loaded.snapshot;
  if (!loaded.resolvedKey || loaded.resolvedKey === targetKey) return loaded.snapshot;

  const migrated: TopicSnapshot = {
    ...loaded.snapshot,
    memoryKey: targetKey,
    topicId: parseMemoryKey(targetKey)?.conversationId || loaded.snapshot.topicId,
    updatedAt: Date.now(),
  };
  await putSnapshot(migrated);
  return migrated;
}

async function putSnapshot(snapshot: TopicSnapshot): Promise<void> {
  const db = await openWorkspaceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TOPIC_SNAPSHOT_STORE, 'readwrite');
    const req = tx.objectStore(TOPIC_SNAPSHOT_STORE).put(snapshot);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadTopicSnapshot(topicId: string): Promise<TopicSnapshot | null> {
  if (!topicId) return null;
  const loaded = await loadSnapshotByAnyKey(topicId);
  return migrateSnapshotKeyIfNeeded(topicId, loaded);
}

export async function upsertTopicSnapshot(topicId: string, patch: Partial<TopicSnapshot>): Promise<void> {
  if (!topicId) return;
  const loaded = await loadSnapshotByAnyKey(topicId);
  const current = await migrateSnapshotKeyIfNeeded(topicId, loaded);

  const pinnedPatch = (patch.pinned as any) as PinnedPatch | undefined;
  const pinnedMode: 'merge' | 'replace' = pinnedPatch?.mode === 'replace' ? 'replace' : 'merge';
  const incomingConstraints = pinnedMode === 'replace'
    ? (pinnedPatch?.constraints ?? [])
    : (pinnedPatch?.constraints || []);
  const incomingDecisions = pinnedMode === 'replace'
    ? (pinnedPatch?.decisions ?? [])
    : (pinnedPatch?.decisions || []);

  const baseConstraints = pinnedMode === 'replace' ? [] : (current?.pinned?.constraints || []);
  const baseDecisions = pinnedMode === 'replace' ? [] : (current?.pinned?.decisions || []);

  const next: TopicSnapshot = {
    memoryKey: topicId,
    topicId: parseMemoryKey(topicId)?.conversationId || topicId,
    updatedAt: Date.now(),
    summaryText: patch.summaryText ?? current?.summaryText ?? '',
    pinned: {
      constraints: dedupe([...(baseConstraints || []), ...(incomingConstraints || [])]).slice(0, 60),
      decisions: dedupe([...(baseDecisions || []), ...(incomingDecisions || [])]).slice(0, 60),
    },
    clothingStudio: patch.clothingStudio ?? current?.clothingStudio,
    listing: patch.listing ?? current?.listing,
  };
  await putSnapshot(next);
}

export async function addTopicMemoryItem(input: Omit<TopicMemoryItem, 'id' | 'createdAt' | 'memoryKey'>): Promise<void> {
  if (!input.topicId || !input.text?.trim()) return;
  const db = await openWorkspaceDB();
  const normalized = normalizeText(input.text);
  const memoryKey = input.topicId;
  const legacyTopicId = parseMemoryKey(memoryKey)?.conversationId || input.topicId;

  const existing = await new Promise<TopicMemoryItem[]>((resolve, reject) => {
    const tx = db.transaction(TOPIC_MEMORY_ITEM_STORE, 'readonly');
    const store = tx.objectStore(TOPIC_MEMORY_ITEM_STORE);
    const byMemoryReq = store.index('memoryKey').getAll(memoryKey);
    byMemoryReq.onsuccess = () => {
      const byMemory = (byMemoryReq.result as TopicMemoryItem[]) || [];
      if (legacyTopicId === memoryKey) {
        resolve(byMemory);
        return;
      }
      const byLegacyReq = store.index('topicId').getAll(legacyTopicId);
      byLegacyReq.onsuccess = () => {
        const byLegacy = (byLegacyReq.result as TopicMemoryItem[]) || [];
        resolve([...byMemory, ...byLegacy]);
      };
      byLegacyReq.onerror = () => reject(byLegacyReq.error);
    };
    byMemoryReq.onerror = () => reject(byMemoryReq.error);
  });

  if (existing.some((x) => x.type === input.type && normalizeText(x.text) === normalized)) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TOPIC_MEMORY_ITEM_STORE, 'readwrite');
    const req = tx.objectStore(TOPIC_MEMORY_ITEM_STORE).put({
      ...input,
      memoryKey,
      topicId: legacyTopicId,
      id: makeId('mem'),
      createdAt: Date.now(),
    } as TopicMemoryItem);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function saveTopicAsset(topicId: string, role: TopicAssetRole, data: { url?: string; blob?: Blob; mime?: string }): Promise<AssetRef | null> {
  if (!topicId) return null;
  if (!data.url && !data.blob) return null;
  const assetId = makeId('asset');
  const memoryKey = topicId;
  const legacyTopicId = parseMemoryKey(memoryKey)?.conversationId || topicId;
  const asset: TopicAsset = {
    assetId,
    memoryKey,
    topicId: legacyTopicId,
    role,
    mime: data.mime || data.blob?.type || 'application/octet-stream',
    url: data.url,
    blob: data.blob,
    createdAt: Date.now(),
  };

  const db = await openWorkspaceDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TOPIC_ASSET_STORE, 'readwrite');
    const req = tx.objectStore(TOPIC_ASSET_STORE).put(asset);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  return { assetId, role, url: data.url, createdAt: asset.createdAt };
}

export async function rememberApprovedAsset(
  topicId: string,
  data: { url: string; role?: TopicAssetRole; summary?: string; decision?: string },
): Promise<AssetRef | null> {
  if (!topicId || !data.url) return null;

  const ref = await saveTopicAsset(topicId, data.role || 'result', {
    url: data.url,
    mime: 'image/png',
  });

  if (!ref) return null;

  await addTopicMemoryItem({
    topicId,
    type: 'asset_tag',
    text: data.decision || `approved_asset:${ref.assetId}`,
    refs: [ref],
  });

  await upsertTopicSnapshot(topicId, {
    summaryText: data.summary || '',
    pinned: {
      constraints: [],
      decisions: [data.decision || `已采用资产 ${ref.assetId}`],
    },
  });

  return ref;
}

export async function saveTopicAssetFromFile(topicId: string, role: TopicAssetRole, file: File): Promise<AssetRef | null> {
  return saveTopicAsset(topicId, role, { blob: file, mime: file.type || 'application/octet-stream' });
}

export async function syncClothingTopicMemory(topicId: string, patch: Partial<NonNullable<TopicSnapshot['clothingStudio']>>): Promise<void> {
  if (!topicId) return;
  const loaded = await loadSnapshotByAnyKey(topicId);
  const current = loaded.snapshot;
  const nextClothing = {
    productImageRefs: current?.clothingStudio?.productImageRefs || [],
    ...current?.clothingStudio,
    ...patch,
  };

  await upsertTopicSnapshot(topicId, {
    clothingStudio: nextClothing,
    pinned: {
      constraints: [],
      decisions: [],
    },
  });
}

export async function syncAmazonListingTopicMemory(
  topicId: string,
  patch: Partial<NonNullable<NonNullable<TopicSnapshot['listing']>['amazonListing']>>,
): Promise<void> {
  if (!topicId) return;
  const loaded = await loadSnapshotByAnyKey(topicId);
  const current = loaded.snapshot;
  const next = {
    ...(current?.listing?.amazonListing || { updatedAt: Date.now() }),
    ...patch,
    updatedAt: Date.now(),
  };
  await upsertTopicSnapshot(topicId, {
    listing: {
      ...(current?.listing || {}),
      amazonListing: next,
    },
  });
}

export function extractConstraintHints(text: string): string[] {
  const t = text || '';
  const list: string[] = [];
  if (/纯白|白底|#ffffff/i.test(t)) list.push('背景必须纯白 #FFFFFF');
  if (/2k/i.test(t)) list.push('清晰度固定 2K');
  if (/禁止|不要改|不能改|forbidden/i.test(t)) list.push('保留既定锚点与禁止变更项');
  if (/比例|aspect|\d+:\d+/i.test(t)) list.push('按用户指定画幅比例生成');
  return dedupe(list);
}

export async function buildTopicPinnedContext(topicId: string): Promise<{ text: string; refs: string[] }> {
  const snapshot = await loadTopicSnapshot(topicId);
  if (!snapshot) return { text: '', refs: [] };

  const constraints = snapshot.pinned?.constraints || [];
  const decisions = snapshot.pinned?.decisions || [];
  const c = snapshot.clothingStudio;
  const listing = snapshot.listing?.amazonListing;
  const refs = [
    c?.productAnchorRef?.url,
    c?.modelAnchorSheetRef?.url,
    ...(c?.productImageRefs || []).map((x) => x.url),
    c?.modelRef?.url,
    ...(listing?.productImageUrls || []),
  ].filter((x): x is string => !!x).slice(0, 8);

  const blocks: string[] = [];
  if (snapshot.summaryText) blocks.push(`参考摘要:\n${snapshot.summaryText}`);
  if (constraints.length) blocks.push(`硬约束:\n- ${constraints.slice(0, 12).join('\n- ')}`);
  if (c?.analysis?.anchorDescription) {
    blocks.push(`产品锚点描述:\n${c.analysis.anchorDescription}`);
  }
  if (c?.analysis?.forbiddenChanges?.length) {
    blocks.push(`禁止变更:\n- ${c.analysis.forbiddenChanges.slice(0, 12).join('\n- ')}`);
  }
  if (c?.requirements) {
    blocks.push(`当前参数: platform=${c.requirements.platform}, ratio=${c.requirements.aspectRatio}, clarity=${c.requirements.clarity}, count=${c.requirements.count}`);
  }
  if (decisions.length) blocks.push(`已确认决策:\n- ${decisions.slice(0, 10).join('\n- ')}`);
  if (refs.length) blocks.push(`关键参考图:\n- ${refs.join('\n- ')}`);

  let text = blocks.join('\n\n');
  if (text.length > 4500) {
    const compactBlocks: string[] = [];
    if (constraints.length) compactBlocks.push(`硬约束:\n- ${constraints.slice(0, 8).join('\n- ')}`);
    if (c?.analysis?.anchorDescription) compactBlocks.push(`产品锚点描述:\n${c.analysis.anchorDescription.slice(0, 800)}`);
    if (c?.analysis?.forbiddenChanges?.length) compactBlocks.push(`禁止变更:\n- ${c.analysis.forbiddenChanges.slice(0, 8).join('\n- ')}`);
    if (c?.requirements) compactBlocks.push(`当前参数: platform=${c.requirements.platform}, ratio=${c.requirements.aspectRatio}, clarity=${c.requirements.clarity}, count=${c.requirements.count}`);
    if (refs.length) compactBlocks.push(`关键参考图:\n- ${refs.slice(0, 2).join('\n- ')}`);
    text = compactBlocks.join('\n\n').slice(0, 4500);
  }
  return { text, refs };
}

export function summarizeReferenceSet(refs: string[]): string {
  const normalized = dedupe((refs || []).filter(Boolean)).slice(0, 8);
  if (normalized.length === 0) return '';

  const hosts = dedupe(
    normalized.map((value) => {
      try {
        return new URL(value).host;
      } catch {
        if (value.startsWith('data:')) return 'inline-image';
        if (value.startsWith('ATTACHMENT_')) return 'attachment';
        return 'local-reference';
      }
    }),
  );

  const hostLabel = hosts.slice(0, 3).join(' / ');
  const angleHint = normalized.length > 1 ? '同一主体的多角度/多细节参考' : '单主体参考';
  return `共 ${normalized.length} 张参考图，来源: ${hostLabel}。按 ${angleHint} 理解，保持主体轮廓、材质、logo 位置、核心配色与关键结构一致。`;
}

export async function deleteTopicMemory(topicId: string): Promise<void> {
  if (!topicId) return;
  const db = await openWorkspaceDB();
  const keys = getCandidateKeys(topicId);

  for (const key of keys) {
    await deleteSnapshotByKey(db, key);
  }

  for (const key of keys) {
    await deleteByIndexValue(db, TOPIC_MEMORY_ITEM_STORE, 'memoryKey', key);
    await deleteByIndexValue(db, TOPIC_MEMORY_ITEM_STORE, 'topicId', key);
    await deleteByIndexValue(db, TOPIC_ASSET_STORE, 'memoryKey', key);
    await deleteByIndexValue(db, TOPIC_ASSET_STORE, 'topicId', key);
  }
}

function deleteSnapshotByKey(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TOPIC_SNAPSHOT_STORE, 'readwrite');
    const req = tx.objectStore(TOPIC_SNAPSHOT_STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function deleteByIndexValue(db: IDBDatabase, storeName: string, indexName: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const index = tx.objectStore(storeName).index(indexName);
    const req = index.openCursor(IDBKeyRange.only(value));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

function dedupe(items: string[]): string[] {
  const map = new Map<string, string>();
  for (const item of items) {
    const norm = normalizeText(item);
    if (!norm) continue;
    if (!map.has(norm)) map.set(norm, item.trim());
  }
  return Array.from(map.values());
}

function normalizeText(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function mergeUniqueStrings(existing: string[], incoming: string[], limit: number = 20): string[] {
  return dedupe([...(existing || []), ...(incoming || [])]).slice(-limit);
}
