import { useMemo } from 'react';
import { ProjectContext } from '../types/agent.types';
import { CanvasElement } from '../types';
import { useAgentStore } from '../stores/agent.store';

export function useProjectContext(
  projectId: string,
  projectTitle: string,
  elements: CanvasElement[]
): ProjectContext {
  const messages = useAgentStore(s => s.messages);
  return useMemo(() => ({
    projectId,
    projectTitle,
    brandInfo: undefined,
    existingAssets: elements,
    conversationHistory: messages
  }), [projectId, projectTitle, elements, messages]);
}
