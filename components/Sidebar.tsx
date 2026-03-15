import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ROUTES, createNewWorkspacePath } from "../utils/routes";
import {
  Home as HomeIcon,
  Folder,
  Plus,
  Settings,
  Video,
  Shield,
} from "lucide-react";

interface SidebarProps {
  onNewProject?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onNewProject }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNewProject = () => {
    if (onNewProject) {
      onNewProject();
    } else {
      navigate(createNewWorkspacePath());
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* 桌面端侧边栏 */}
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="fixed left-6 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-4 z-50"
      >
        <div>
          <button
            onClick={handleNewProject}
            className="w-12 h-12 rounded-lg flex items-center justify-center transition-all duration-200 shadow-premium bg-foreground text-background hover:scale-105 active:scale-95"
            title="新建项目"
          >
            <Plus size={24} />
          </button>
        </div>

        <div className="w-12 py-6 bg-card/80 backdrop-blur-xl rounded-full shadow-premium flex flex-col items-center gap-6 border border-border/50">
          <button
            onClick={() => navigate(ROUTES.dashboard)}
            className={`p-2 rounded-full transition ${isActive(ROUTES.dashboard)
              ? "bg-gray-100 text-black shadow-sm"
              : "text-gray-400 hover:text-black hover:bg-gray-50"
              }`}
            title="首页"
          >
            <HomeIcon size={20} />
          </button>
          <button
            onClick={() => navigate(ROUTES.projects)}
            className={`p-2 rounded-full transition ${isActive(ROUTES.projects)
              ? "bg-gray-100 text-black shadow-sm"
              : "text-gray-400 hover:text-black hover:bg-gray-50"
              }`}
            title="项目"
          >
            <Folder size={20} />
          </button>
          <button
            onClick={() => navigate(ROUTES.videoWorkspace)}
            className={`p-2 rounded-full transition ${isActive(ROUTES.videoWorkspace)
              ? "bg-gray-100 text-black shadow-sm"
              : "text-gray-400 hover:text-black hover:bg-gray-50"
              }`}
            title="Video Studio"
          >
            <Video size={20} />
          </button>
          <button
            onClick={() => navigate(ROUTES.settings)}
            className={`p-2 rounded-full transition ${isActive(ROUTES.settings)
              ? "bg-gray-100 text-black shadow-sm"
              : "text-gray-400 hover:text-black hover:bg-gray-50"
              }`}
            title="设置 / API Key"
          >
            <Settings size={20} />
          </button>
          <button
            onClick={() => navigate(ROUTES.admin)}
            className={`p-2 rounded-full transition ${isActive(ROUTES.admin) || isActive(ROUTES.adminUsers) || isActive(ROUTES.adminUsage)
              ? "bg-gray-100 text-black shadow-sm"
              : "text-gray-400 hover:text-black hover:bg-gray-50"
              }`}
            title="管理控制台"
          >
            <Shield size={20} />
          </button>
        </div>
      </motion.div>

      {/* 移动端底部导航 */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-xl border-t border-gray-100 flex items-center justify-around px-4 z-50 pb-safe">
        <button
          onClick={() => navigate(ROUTES.dashboard)}
          className={`flex flex-col items-center gap-1 ${isActive(ROUTES.dashboard) ? "text-black" : "text-gray-400"}`}
        >
          <HomeIcon size={20} strokeWidth={isActive(ROUTES.dashboard) ? 2.5 : 2} />
          <span className="text-[10px] font-black uppercase tracking-tighter">首页</span>
        </button>
        <button
          onClick={() => navigate(ROUTES.projects)}
          className={`flex flex-col items-center gap-1 ${isActive(ROUTES.projects) ? "text-black" : "text-gray-400"}`}
        >
          <Folder size={20} strokeWidth={isActive(ROUTES.projects) ? 2.5 : 2} />
          <span className="text-[10px] font-black uppercase tracking-tighter">项目</span>
        </button>

        {/* 中间突出按钮 */}
        <div className="-translate-y-4">
          <button
            onClick={handleNewProject}
            className="w-14 h-14 rounded-2xl bg-black text-white flex items-center justify-center shadow-2xl shadow-black/20 active:scale-90 transition-all"
          >
            <Plus size={28} />
          </button>
        </div>

        <button
          onClick={() => navigate(ROUTES.videoWorkspace)}
          className={`flex flex-col items-center gap-1 ${isActive(ROUTES.videoWorkspace) ? "text-black" : "text-gray-400"}`}
        >
          <Video size={20} strokeWidth={isActive(ROUTES.videoWorkspace) ? 2.5 : 2} />
          <span className="text-[10px] font-black uppercase tracking-tighter">视频</span>
        </button>
        <button
          onClick={() => navigate(ROUTES.admin)}
          className={`flex flex-col items-center gap-1 ${isActive(ROUTES.admin) ? "text-black" : "text-gray-400"}`}
        >
          <Shield size={20} strokeWidth={isActive(ROUTES.admin) ? 2.5 : 2} />
          <span className="text-[10px] font-black uppercase tracking-tighter">管理</span>
        </button>
      </div>
    </>
  );
};

export default Sidebar;
