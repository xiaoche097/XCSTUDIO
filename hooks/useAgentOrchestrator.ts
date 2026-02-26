import { useState, useCallback, useRef } from 'react';
import { AgentType, AgentTask, ProjectContext, GeneratedAsset } from '../types/agent.types';
import { routeToAgent, executeAgentTask, getAgentInfo, detectPipeline, executePipeline, PIPELINES } from '../services/agents';
import { ChatMessage, CanvasElement } from '../types';
import { assetsToCanvasElementsAtCenter } from '../utils/canvas-helpers';
import { useAgentStore } from '../stores/agent.store';
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

  const addAssetsToCanvas = useCallback((assets: GeneratedAsset[]) => {
    if (!canvasState || !onElementsUpdate || !autoAddToCanvas) {
      console.log('[useAgentOrchestrator] Canvas integration disabled or not configured');
      return;
    }

    try {
      const containerW = window.innerWidth - (canvasState.showAssistant ? 400 : 0);
      const containerH = window.innerHeight;

      console.log('[useAgentOrchestrator] Adding', assets.length, 'assets to canvas');

      const newElements = assetsToCanvasElementsAtCenter(
        assets,
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
    metadata?: Record<string, any>
  ): Promise<AgentTask | null> => {
    if (!message.trim()) return null;

    if (isProcessing) {
      messageQueue.current.push({ message, attachments });
      console.log('[useAgentOrchestrator] Message queued, queue size:', messageQueue.current.length);
      return null;
    }

    setIsProcessing(true);

    try {
      console.log('[useAgentOrchestrator] Processing message:', message.substring(0, 50));

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

        const pipelineResult = await executePipeline(pipeline, message, updatedContext, (stepIdx, stepResult) => {
          console.log(`[useAgentOrchestrator] Pipeline step ${stepIdx} done:`, stepResult.status);
          setCurrentTask(stepResult);
        });

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
        decision = await routeToAgent(message, updatedContext);
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
          context: updatedContext
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      setCurrentTask({ ...task, status: 'analyzing' });

      console.log('[useAgentOrchestrator] Executing task...');

      // Auto-switch to executing after 200ms
      const executingTimer = setTimeout(() => {
        const cur = useAgentStore.getState().currentTask;
        if (cur && cur.status === 'analyzing') {
          setCurrentTask({ ...cur, status: 'executing' });
        }
      }, 200);

      const result = await executeAgentTask(task);
      clearTimeout(executingTimer);
      console.log('[useAgentOrchestrator] Task result:', result.status);

      if (result.output?.assets && result.output.assets.length > 0) {
        console.log('[useAgentOrchestrator] Auto-adding assets to canvas...');
        addAssetsToCanvas(result.output.assets);
      }

      setCurrentTask(result);

      // Messages are managed by Workspace via addMessage — no need to push here

      return result;
    } catch (error) {
      console.error('[useAgentOrchestrator] Error:', error);
      const errorTask: AgentTask = {
        id: `task-${Date.now()}`,
        agentId: 'coco' as AgentType,
        status: 'failed',
        input: { message, context: projectContext },
        output: {
          message: error instanceof Error
            ? `处理请求时遇到问题: ${error.message}。请稍后重试。`
            : '处理请求时遇到问题，请稍后重试。'
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      setCurrentTask(errorTask);
      return errorTask;
    } finally {
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
          message: `Execute proposal: ${proposal.title}`,
          context: projectContext
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const result = await executeAgentTask(task);
      console.log('[useAgentOrchestrator] Proposal execution result:', result.status);

      if (result.output?.assets && result.output.assets.length > 0) {
        console.log('[useAgentOrchestrator] Auto-adding proposal assets to canvas...');
        addAssetsToCanvas(result.output.assets);
      }

      setCurrentTask(result);
    } catch (error) {
      console.error('[useAgentOrchestrator] Proposal execution error:', error);
      const cur = useAgentStore.getState().currentTask;
      if (cur) setCurrentTask({ ...cur, status: 'failed' });
      throw error;
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
