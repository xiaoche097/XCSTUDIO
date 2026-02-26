import React from 'react';
import { Layers, Folder, Minus, Plus } from 'lucide-react';

interface ToolbarBottomProps {
    leftPanelMode: 'layers' | 'files' | null;
    setLeftPanelMode: (mode: 'layers' | 'files' | null) => void;
    zoom: number;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
}

export const ToolbarBottom: React.FC<ToolbarBottomProps> = ({ leftPanelMode, setLeftPanelMode, zoom, setZoom }) => (
    <div className="absolute bottom-5 left-5 flex items-center gap-1.5 z-40 pointer-events-auto">
        <button onClick={() => setLeftPanelMode(leftPanelMode === 'layers' ? null : 'layers')} className={`w-7 h-7 flex items-center justify-center rounded-md transition ${leftPanelMode === 'layers' ? 'text-gray-900 bg-gray-200/80' : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'}`} title="图层">
            <Layers size={15} strokeWidth={1.8} />
        </button>
        <button onClick={() => setLeftPanelMode(leftPanelMode === 'files' ? null : 'files')} className={`w-7 h-7 flex items-center justify-center rounded-md transition ${leftPanelMode === 'files' ? 'text-gray-900 bg-gray-200/80' : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'}`} title="已生成文件列表">
            <Folder size={15} strokeWidth={1.8} />
        </button>
        <div className="w-px h-4 bg-gray-300/60 mx-0.5"></div>
        <div className="flex items-center gap-0.5">
            <button onClick={() => setZoom(z => Math.max(10, z - 10))} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-black rounded-md hover:bg-white/60 transition"><Minus size={13} /></button>
            <span className="text-[11px] font-medium w-9 text-center text-gray-600 select-none">{Math.round(zoom)}%</span>
            <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-black rounded-md hover:bg-white/60 transition"><Plus size={13} /></button>
        </div>
    </div>
);
