import React, { useState } from 'react';
import {
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  FileArchive,
  FolderOpen,
  ArrowLeft,
} from 'lucide-react';
import {
  AppSettings,
  BatchPageItem,
  PKULAW_FORMAT_OPTIONS,
} from '../utils/pkulawLogic';

interface DownloadProgressViewProps {
  darkMode: boolean;
  settings: AppSettings;
  isRunning: boolean;
  batches: BatchPageItem[];
  expectedSearchTotal: number;
  simulateCaptchaOnPage2: boolean;
  onToggleSimulateCaptcha: (val: boolean) => void;
  onBackToWebpage: () => void;
}

export const DownloadProgressView: React.FC<DownloadProgressViewProps> = ({
  darkMode,
  settings,
  isRunning,
  batches,
  expectedSearchTotal,
  simulateCaptchaOnPage2,
  onToggleSimulateCaptcha,
  onBackToWebpage,
}) => {
  const [folderOpenedNotice, setFolderOpenedNotice] = useState(false);

  const completedPages = batches.filter(
    (b) => b.status === 'completed' || b.status === 'extracted'
  ).length;
  const totalPages = Math.max(1, batches.length);
  const overallPct =
    batches.length === 0
      ? 0
      : Math.round((completedPages / totalPages) * 100);

  const activeFormatObj =
    PKULAW_FORMAT_OPTIONS.find((f) => f.id === settings.downloadFormat) ||
    PKULAW_FORMAT_OPTIONS[5];

  const formatDisplayText = `${activeFormatObj.category} - ${activeFormatObj.label} (${activeFormatObj.ext})`;

  const handleOpenDownloadFolder = () => {
    setFolderOpenedNotice(true);
    setTimeout(() => setFolderOpenedNotice(false), 3000);
  };

  return (
    <div className="space-y-5">
      {/* 顶部下载进度与状态栏 */}
      <div
        className={`rounded-xl border p-5 ${
          darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToWebpage}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                darkMode
                  ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>返回北大法宝网页界面</span>
            </button>

            <span className="text-sm font-bold">
              {isRunning
                ? `正在按【${formatDisplayText}】逐页下载原始压缩包 (${completedPages}/${batches.length} 页)...`
                : overallPct === 100
                  ? `全部批次原始压缩包（${formatDisplayText}）已保存至下载目录`
                  : '下载任务就绪'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={simulateCaptchaOnPage2}
                onChange={(e) => onToggleSimulateCaptcha(e.target.checked)}
                className="rounded accent-blue-600"
              />
              <span>翻至第2页时模拟弹出居中人机验证</span>
            </label>
            <span className="font-mono font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {overallPct}%
            </span>
          </div>
        </div>

        {/* 动态总进度条 */}
        <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            style={{ width: `${overallPct}%` }}
            className={`h-full transition-all duration-200 ${
              overallPct === 100 ? 'bg-emerald-600' : 'bg-blue-600'
            }`}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            原始压缩包保存目录：<code className="font-mono">{settings.downloadDir}</code> · 已选格式：{formatDisplayText}
          </span>
          <span className="font-mono tabular-nums">
            检索数量：{expectedSearchTotal} 条 · 已完成压缩包批次：{completedPages} / {batches.length} 个
          </span>
        </div>
      </div>

      {/* 下载完成后仅保留打开下载文件夹按钮 */}
      {!isRunning && completedPages > 0 && (
        <div
          className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-4 ${
            darkMode
              ? 'border-emerald-900/60 bg-emerald-950/25 text-emerald-100'
              : 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <div className="font-bold text-sm">
                全部 {completedPages} 页原始压缩包 (.zip) 下载完成！
              </div>
              <div className="opacity-85 mt-0.5 font-mono">
                保存位置：系统默认「下载 (Downloads)」文件夹 / {settings.downloadDir} （格式：{formatDisplayText}）
              </div>
              {folderOpenedNotice && (
                <div className="mt-1 text-emerald-600 dark:text-emerald-300 font-semibold">
                  在浏览器扩展中点击此按钮将直接调用系统资源管理器打开「下载/{settings.downloadDir}」文件夹。
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenDownloadFolder}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span>打开下载文件夹</span>
            </button>
          </div>
        </div>
      )}

      {/* 分页原始压缩包下载列表 */}
      <div
        className={`rounded-xl border overflow-hidden ${
          darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-semibold">
          <span>分页原始压缩包下载进度（格式：{formatDisplayText}）</span>
          <span className="font-mono tabular-nums text-slate-500">
            共 {batches.length} 页
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr
                className={`border-b font-medium ${
                  darkMode
                    ? 'border-slate-800 bg-slate-950/60 text-slate-400'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                <th className="py-2.5 px-4 font-mono tabular-nums">页码</th>
                <th className="py-2.5 px-4 font-mono tabular-nums">序号范围</th>
                <th className="py-2.5 px-4 font-mono">原始压缩包名称</th>
                <th className="py-2.5 px-4">状态</th>
                <th className="py-2.5 px-4 font-mono tabular-nums text-right">
                  包含法规篇数
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {batches.map((b) => (
                <tr key={b.pageNumber}>
                  <td className="py-2.5 px-4 font-mono tabular-nums font-semibold">
                    第 {b.pageNumber} 页
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">
                    {b.startIndex} – {b.endIndex}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <FileArchive className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      {b.zipFileName}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    {(b.status === 'extracted' || b.status === 'completed') && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        原始压缩包已保存
                      </span>
                    )}
                    {b.status === 'downloading' && (
                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-emerald-400 font-medium">
                        <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                        正在下载压缩包...
                      </span>
                    )}
                    {b.status === 'captcha_paused' && (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        检测到遮挡验证码（验证完成自动继续）
                      </span>
                    )}
                    {b.status === 'pending' && (
                      <span className="text-slate-400">等待翻页</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-right font-medium">
                    {b.expectedCount} 篇
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
