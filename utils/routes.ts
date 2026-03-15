export const ROUTES = {
  landing: '/',
  login: '/login',
  admin: '/admin',
  adminUsers: '/admin/users',
  adminUsage: '/admin/usage',
  dashboard: '/dashboard',
  projects: '/projects',
  workspace: '/workspace',
  workspaceNew: '/workspace-new',
  videoWorkspace: '/video-workspace',
  settings: '/settings',
} as const;

export const workspacePath = (id: string) => `${ROUTES.workspace}/${id}`;
export const workspaceNewPath = (id: string) => `${ROUTES.workspaceNew}/${id}`;
export const createNewWorkspacePath = () => workspacePath(`new-${Date.now()}`);
