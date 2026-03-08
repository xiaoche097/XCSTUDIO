import { useMemo } from 'react';
import { ProjectContext } from '../types/agent.types';
import { CanvasElement } from '../types';
import { useAgentStore } from '../stores/agent.store';
import { useProjectStore } from '../stores/project.store';

export function useProjectContext(
  projectId: string,
  projectTitle: string,
  elements: CanvasElement[],
  conversationId: string = ''
): ProjectContext {
  const messages = useAgentStore(s => s.messages);
  const brandInfo = useProjectStore(s => s.brandInfo);
  const designSession = useProjectStore(s => s.designSession);

  return useMemo(() => ({
    projectId,
    projectTitle,
    conversationId,
    brandInfo,
    designSession: {
      ...designSession,
      brand: {
        ...designSession.brand,
        ...brandInfo,
      },
    },
    existingAssets: elements,
    conversationHistory: messages
  }), [projectId, projectTitle, elements, conversationId, messages, brandInfo, designSession]);
}
