import { useState, useCallback, useRef } from 'react';
import { AgentType, AgentTask, ProjectContext, GeneratedAsset } from '../types/agent.types';
import { routeToAgent, executeAgentTask, getAgentInfo, detectPipeline, executePipeline, PIPELINES } from '../services/agents';
import { ChatMessage, CanvasElement } from '../types';
import { assetsToCanvasElementsAtCenter } from '../utils/canvas-helpers';
import { useAgentStore } from '../stores/agent.store';
import { uploadImage } from '../utils/uploader';
import { useImageHostStore } from '../stores/imageHost.store';
import { localPreRoute } from '../services/agents/local-router';

interface CanvasState {
  elements: CanvasElement[];
  pan: { x: number; y: number };
  zoom: number;
  showAssistant: boolean;
}

interface UseAgentOrchestratorOptions {
  projectContext: ProjectContext;
  canvasState?: CanvasState;
  onElementsUpdate?: (elements: CanvasElement[]) => void;
  onHistorySave?: (elements: CanvasElement[], markers: any[]) => void;
  autoAddToCanvas?: boolean;
}

export function useAgentOrchestrator(options: UseAgentOrchestratorOptions) {
  const {
    projectContext,
    canvasState,
    onElementsUpdate,
    onHistorySave,
    autoAddToCanvas = true
  } = options;

  // Read from store instead of local state
  const currentTask = useAgentStore(s => s.currentTask);
  const isAgentMode = useAgentStore(s => s.isAgentMode);
  const { setCurrentTask, setIsAgentMode } = useAgentStore(s => s.actions);

  const [isProcessing, setIsProcessing] = useState(false);
  const messageQueue = useRef<Array<{ message: string; attachments?: File[] }>>([]);

  const withTimeout = useCallback(async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs))
    ]);
  }, []);

  const addAssetsToCanvas = useCallback(async (assets: GeneratedAsset[]) => {
    if (!canvasState || !onElementsUpdate || !autoAddToCanvas) {
      console.log('[useAgentOrchestrator] Canvas integration disabled or not configured');
      return;
    }

    try {
      const containerW = window.innerWidth - (canvasState.showAssistant ? 400 : 0);
      const containerH = window.innerHeight;

      console.log('[useAgentOrchestrator] Processing', assets.length, 'assets for canvas');

      // 异步获取所有图片的原始尺寸
      const assetsWithDimensions = await Promise.all(assets.map(async (asset) => {
        if (asset.type === 'image' && (!asset.metadata.width || !asset.metadata.height)) {
          try {
            const dimensions = await new Promise<{ w: number, h: number }>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve({ w: img.width, h: img.height });
              img.onerror = reject;
              img.src = asset.url;
            });
            return {
              ...asset,
              metadata: { ...asset.metadata, width: dimensions.w, height: dimensions.h }
            };
          } catch (e) {
            console.warn('[useAgentOrchestrator] Failed to load image dimensions, using default', e);
            return asset;
          }
        }
        return asset;
      }));

      const newElements = assetsToCanvasElementsAtCenter(
        assetsWithDimensions,
        containerW,
        containerH,
        canvasState.pan,
        canvasState.zoom,
        canvasState.elements.length
      );

      console.log('[useAgentOrchestrator] Created', newElements.length, 'canvas elements');

      const updatedElements = [...canvasState.elements, ...newElements];
      onElementsUpdate(updatedElements);

      if (onHistorySave) {
        onHistorySave(updatedElements, []);
      }

      console.log('[useAgentOrchestrator] Canvas updated successfully');
    } catch (error) {
      console.error('[useAgentOrchestrator] Failed to add assets to canvas:', error);
    }
  }, [canvasState, onElementsUpdate, onHistorySave, autoAddToCanvas]);

  const processMessage = useCallback(async (
    message: string,
    attachments?: File[],
    metadata?: Record<string, any>,
    userMessageId?: string
  ): Promise<AgentTask | null> => {
    if (!message.trim()) return null;

    if (isProcessing) {
      messageQueue.current.push({ message, attachments });
      console.log('[useAgentOrchestrator] Message queued, queue size:', messageQueue.current.length);
      return null;
    }

    setIsProcessing(true);

    let executingTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      console.log('[useAgentOrchestrator] Processing message:', message.substring(0, 50));

      // 图片上传逻辑
      let uploadedUrls: string[] = [];
      if (attachments && attachments.length > 0) {
        const hostProvider = useImageHostStore.getState().selectedProvider;
        if (hostProvider !== 'none') {
          console.log('[useAgentOrchestrator] Uploading attachments to host...');
          // 更新状态提示用户
          setCurrentTask({
            id: `upload-${Date.now()}`,
            agentId: 'coco' as AgentType,
            status: 'analyzing', // 借用 analyzing 状态显示上传中
            progressMessage: '正在同步图片至云端...',
            input: { message, attachments, context: projectContext },
            createdAt: Date.now(),
            updatedAt: Date.now()
          });

          try {
            uploadedUrls = await Promise.all(attachments.map(file => uploadImage(file)));
            console.log('[useAgentOrchestrator] Upload success:', uploadedUrls);
            
            // 回填公网 URL 到 Store 中的消息附件 (Backfill public URLs to message attachments in Store)
            if (userMessageId && uploadedUrls.length > 0) {
              useAgentStore.getState().actions.updateMessageAttachments(userMessageId, uploadedUrls);
              console.log('[useAgentOrchestrator] Updated message attachments with public URLs for:', userMessageId);
            }
          } catch (uploadError) {
            console.error('[useAgentOrchestrator] Upload failed:', uploadError);
          }
        }
      }

      // Read conversation history from store (single source of truth)
      const updatedContext = {
        ...projectContext,
        conversationHistory: useAgentStore.getState().messages
      };

      // Pipeline detection
      const pipelineId = detectPipeline(message);
      if (pipelineId && PIPELINES[pipelineId]) {
        const pipeline = PIPELINES[pipelineId];
        console.log('[useAgentOrchestrator] Pipeline detected:', pipeline.name);

        setCurrentTask({
          id: `pipeline-${Date.now()}`,
          agentId: pipeline.steps[0].agentId,
          status: 'analyzing',
          input: { message, context: updatedContext },
          createdAt: Date.now(),
          updatedAt: Date.now()
        });

        console.log('[useAgentOrchestrator] Pipeline request start');
        const pipelineResult = await withTimeout(
          executePipeline(pipeline, message, updatedContext, (stepIdx, stepResult) => {
            console.log(`[useAgentOrchestrator] Pipeline step ${stepIdx} done:`, stepResult.status);
            setCurrentTask(stepResult);
          }),
          180000,
          '流水线执行超时，请稍后重试'
        );
        console.log('[useAgentOrchestrator] Pipeline request done');

        if (pipelineResult.allAssets.length > 0) {
          addAssetsToCanvas(pipelineResult.allAssets);
        }

        const lastStep = pipelineResult.steps[pipelineResult.steps.length - 1];
        if (lastStep && lastStep.output) {
          lastStep.output.assets = pipelineResult.allAssets;
        }
        setCurrentTask(lastStep || null);

        // Messages are managed by Workspace via addMessage — no need to push here

        return lastStep || null;
      }

      // Single agent routing — try local keyword match first to skip API call
      console.log('[useAgentOrchestrator] Routing to agent...');
      const localAgent = localPreRoute(message);
      let decision;
      if (localAgent) {
        console.log('[useAgentOrchestrator] Local pre-route hit:', localAgent);
        decision = {
          targetAgent: localAgent,
          taskType: 'local-routed',
          complexity: 'simple' as const,
          handoffMessage: `用户请求: ${message}`,
          confidence: 0.75
        };
      } else {
        console.log('[useAgentOrchestrator] 发起路由请求...');
        decision = await withTimeout(
          routeToAgent(message, updatedContext),
          20000,
          '路由请求超时，请稍后重试'
        );
        console.log('[useAgentOrchestrator] 路由请求返回:', decision?.targetAgent);
      }

      if (!decision) {
        console.warn('[useAgentOrchestrator] All routing failed, using poster fallback');
        decision = {
          targetAgent: 'poster' as AgentType,
          taskType: 'fallback',
          complexity: 'simple' as const,
          handoffMessage: `用户请求: ${message}`,
          confidence: 0.4
        };
      }

      console.log('[useAgentOrchestrator] Routed to:', decision.targetAgent);

      const task: AgentTask = {
        id: `task-${Date.now()}`,
        agentId: decision.targetAgent,
        status: 'pending',
        input: {
          message,
          attachments,
          uploadedAttachments: uploadedUrls.length > 0 ? uploadedUrls : undefined,
          context: updatedContext
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      setCurrentTask({ ...task, status: 'analyzing' });

      console.log('[useAgentOrchestrator] Executing task...');

      // Auto-switch to executing after 200ms
      executingTimer = setTimeout(() => {
        const cur = useAgentStore.getState().currentTask;
        if (cur && cur.status === 'analyzing') {
          setCurrentTask({ ...cur, status: 'executing' });
        }
      }, 200);

      console.log('[useAgentOrchestrator] 发起 Agent 执行请求...');
      const result = await withTimeout(
        executeAgentTask(task),
        180000,
        '任务执行超时，请稍后重试'
      );
      console.log('[useAgentOrchestrator] 收到 Agent 执行回复');
      if (executingTimer) {
        clearTimeout(executingTimer);
        executingTimer = null;
      }
      console.log('[useAgentOrchestrator] Task result:', result.status);

      if (result.output?.assets && result.output.assets.length > 0) {
        console.log('[useAgentOrchestrator] Auto-adding assets to canvas...');
        addAssetsToCanvas(result.output.assets);
      }

      setCurrentTask(result);

      // Messages are managed by Workspace via addMessage — no need to push here

      return result;
    } catch (error) {
      console.error('Agent Pipeline Failure', { stage: 'processMessage', error });
      console.error('生成流中断:', error);
      console.error('[useAgentOrchestrator] Error:', error);
      const errorTask: AgentTask = {
        id: `task-${Date.now()}`,
        agentId: 'coco' as AgentType,
        status: 'failed',
        input: { message, context: projectContext },
        output: {
          message: '抱歉，生成过程中遇到网络或解析错误，请重试。'
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      setCurrentTask(errorTask);
      return errorTask;
    } finally {
      if (executingTimer) {
        clearTimeout(executingTimer);
      }
      setIsProcessing(false);

      if (messageQueue.current.length > 0) {
        const next = messageQueue.current.shift()!;
        setTimeout(() => {
          processMessage(next.message, next.attachments);
        }, 300);
      }
    }
  }, [projectContext, addAssetsToCanvas, isProcessing]);

  const executeProposal = useCallback(async (proposalId: string): Promise<void> => {
    const curTask = useAgentStore.getState().currentTask;
    if (!curTask || !curTask.output?.proposals) {
      console.error('[useAgentOrchestrator] No current task or proposals');
      return;
    }

    const proposal = curTask.output.proposals.find(p => p.id === proposalId);
    if (!proposal) {
      console.error('[useAgentOrchestrator] Proposal not found:', proposalId);
      return;
    }

    try {
      console.log('[useAgentOrchestrator] Executing proposal:', proposal.title);

      setCurrentTask({ ...curTask, status: 'executing' });

      const task: AgentTask = {
        id: `task-${Date.now()}`,
        agentId: curTask.agentId,
        status: 'executing',
        input: {
          message: `执行方案: ${proposal.title}`,
          attachments: curTask.input.attachments,
          uploadedAttachments: curTask.input.uploadedAttachments,
          context: curTask.input.context || projectContext,
          metadata: {
            ...(curTask.input.metadata || {}),
            forceSkills: true,
            executeProposalId: proposal.id,
            selectedSkillCalls: (proposal.skillCalls || []).map(call => ({
              ...call,
              params: { ...(call.params || {}) }
            }))
          }
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      console.log('[useAgentOrchestrator] Proposal request start', { proposalId });
      const result = await withTimeout(
        executeAgentTask(task),
        180000,
        '方案执行超时，请稍后重试'
      );
      console.log('[useAgentOrchestrator] Proposal request done', { status: result.status });
      console.log('[useAgentOrchestrator] Proposal execution result:', result.status);

      if (result.output?.assets && result.output.assets.length > 0) {
        console.log('[useAgentOrchestrator] Auto-adding proposal assets to canvas...');
        addAssetsToCanvas(result.output.assets);
      }

      setCurrentTask(result);
    } catch (error) {
      console.error('Agent Pipeline Failure', { stage: 'executeProposal', error });
      console.error('[useAgentOrchestrator] Proposal execution error:', error);
      const cur = useAgentStore.getState().currentTask;
      if (cur) {
        setCurrentTask({
          ...cur,
          status: 'failed',
          output: {
            ...(cur.output || {}),
            message: '抱歉，生成过程中遇到网络或解析错误，请重试。'
          },
          updatedAt: Date.now()
        });
      }
      return;
    } finally {
      const cur = useAgentStore.getState().currentTask;
      if (cur && (cur.status === 'analyzing' || cur.status === 'executing')) {
        setCurrentTask({
          ...cur,
          status: 'failed',
          output: {
            ...(cur.output || {}),
            message: '抱歉，生成过程中遇到网络或解析错误，请重试。'
          },
          updatedAt: Date.now()
        });
      }
    }
  }, [projectContext, addAssetsToCanvas]);

  const resetAgent = useCallback(() => {
    setCurrentTask(null);
    useAgentStore.getState().actions.clearMessages();
  }, []);

  return {
    currentTask,
    isAgentMode,
    isProcessing,
    processMessage,
    executeProposal,
    addAssetsToCanvas,
    resetAgent,
  };
}
