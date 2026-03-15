import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ROUTES } from './utils/routes';

const Home = lazy(() => import('./pages/Home'));
const Workspace = lazy(() => import('./pages/Workspace'));
const WorkspaceNew = lazy(() => import('./pages/Workspace/WorkspaceNew'));
const Projects = lazy(() => import('./pages/Projects'));
const Settings = lazy(() => import('./pages/Settings'));
const VideoWorkspace = lazy(() => import('./pages/VideoWorkspace'));
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Admin = lazy(() => import('./pages/Admin'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminUsage = lazy(() => import('./pages/AdminUsage'));

const App: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
          <Routes>
            <Route path={ROUTES.landing} element={<Landing />} />
            <Route path={ROUTES.login} element={<Login />} />
            <Route path={ROUTES.admin} element={<Admin />} />
            <Route path={ROUTES.adminUsers} element={<AdminUsers />} />
            <Route path={ROUTES.adminUsage} element={<AdminUsage />} />
            <Route path={ROUTES.dashboard} element={<Home onExit={onExit} />} />
            <Route path={ROUTES.projects} element={<Projects onExit={onExit} />} />
            <Route path={`${ROUTES.workspace}/:id`} element={<Workspace />} />
            <Route path={ROUTES.videoWorkspace} element={<VideoWorkspace />} />
            {/* 新版Workspace - 使用Store和组件化架构 */}
            <Route path={`${ROUTES.workspaceNew}/:id`} element={<WorkspaceNew />} />
            <Route path={ROUTES.settings} element={<Settings />} />
            <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
};

export default App;
