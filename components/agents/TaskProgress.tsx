import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Sparkles } from 'lucide-react';
import { AgentTask } from '../../types/agent.types';

interface TaskProgressProps {
  task: AgentTask;
}

export const TaskProgress: React.FC<TaskProgressProps> = ({ task }) => {
  const [seconds, setSeconds] = React.useState(0);

  React.useEffect(() => {
    if (task.status === 'executing' || task.status === 'analyzing') {
      const timer = setInterval(() => setSeconds(s => s + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [task.status]);

  const isGenerating = task.status === 'executing' || task.status === 'analyzing';
  if (!isGenerating) return null;

  const step = task.progressStep || 1;
  const total = task.totalSteps || 4;
  const progressMsg = task.progressMessage || (task.status === 'analyzing' ? '分析需求中...' : '生成中...');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-[400px] py-2"
    >
      {/* 进度条 */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(step / total) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <span className="text-[10px] text-gray-400 font-mono shrink-0">{step}/{total}</span>
      </div>

      {/* 当前步骤消息 */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center shrink-0">
          <Sparkles size={10} className="text-white" />
        </div>
        <AnimatePresence mode="wait">
          <motion.span
            key={progressMsg}
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 5 }}
            transition={{ duration: 0.2 }}
            className="text-[12px] text-gray-600 font-medium"
          >
            {progressMsg}
          </motion.span>
        </AnimatePresence>
        <Loader2 size={12} className="animate-spin text-gray-400 shrink-0 ml-auto" />
      </div>
    </motion.div>
  );
};
