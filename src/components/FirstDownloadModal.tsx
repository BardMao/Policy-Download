import React from 'react';
import { FolderOpen, Play } from 'lucide-react';
import { AppSettings } from '../utils/pkulawLogic';

interface FirstDownloadModalProps {
  isOpen: boolean;
  darkMode: boolean;
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onConfirmAndStart: () => void;
  onCancel: () => void;
}

const QUICK_DIRS = [
  'D:\\PKULaw_Downloads',
  'E:\\Legal_Corpus\\PKULaw',
  'C:\\Users\\Administrator\\Downloads\\PKULaw',
];

export const FirstDownloadModal: React.FC<FirstDownloadModalProps> = ({
  isOpen,
  darkMode,
  settings,
  onUpdateSettings,
  onConfirmAndStart,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="首次下载设置确认"
    >
      <div
        className={`w-full max-w-lg rounded-xl border p-6 shadow-xl transition-colors ${
          darkMode
            ? 'border-slate-800 bg-slate-900 text-slate-100'
            : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div className="border-b pb-3 border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-sm font-bold">下载目录确认</span>
          <span className="text-xs text-slate-500">
            确认后将自动弹出北大法宝下载格式选择框
          </span>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          <div>
            <label
              htmlFor="first-dl-dir"
              className="block font-medium mb-1.5"
            >
              原始压缩包 (.zip) 保存目录
            </label>
            <div className="relative">
              <FolderOpen className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="first-dl-dir"
                type="text"
                value={settings.downloadDir}
                onChange={(e) =>
                  onUpdateSettings({ downloadDir: e.target.value })
                }
                className={`w-full pl-9 pr-3 py-2 font-mono rounded-lg border outline-none ${
                  darkMode
                    ? 'border-slate-700 bg-slate-950 text-slate-100 focus:border-blue-500'
                    : 'border-slate-300 bg-slate-50 text-slate-900 focus:border-blue-600'
                }`}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {QUICK_DIRS.map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => onUpdateSettings({ downloadDir: dir })}
                  className={`px-2 py-1 rounded border font-mono text-xs transition-colors ${
                    settings.downloadDir === dir
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : darkMode
                        ? 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors ${
              darkMode
                ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            取消
          </button>

          <button
            type="button"
            onClick={onConfirmAndStart}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Play className="h-3.5 w-3.5" />
            <span>下一步：选择下载格式</span>
          </button>
        </div>
      </div>
    </div>
  );
};
