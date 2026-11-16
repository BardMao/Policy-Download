import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle2, RefreshCw } from 'lucide-react';

interface CaptchaModalProps {
  isOpen: boolean;
  pageNumber: number;
  startIndex: number;
  endIndex: number;
  darkMode: boolean;
  onResolveAndResume: () => void;
  onCancelTask: () => void;
}

export const CaptchaModal: React.FC<CaptchaModalProps> = ({
  isOpen,
  pageNumber,
  startIndex,
  endIndex,
  darkMode,
  onResolveAndResume,
  onCancelTask,
}) => {
  const TARGET_GAP_POS = 64;
  const [puzzleOffset, setPuzzleOffset] = useState<number>(15);
  const isAligned = Math.abs(puzzleOffset - TARGET_GAP_POS) <= 5;

  // 检测到用户操作完成人工验证后，无需点击确认按钮，自动恢复继续下载
  useEffect(() => {
    if (!isOpen || !isAligned) return;
    const timer = window.setTimeout(() => {
      setPuzzleOffset(15);
      onResolveAndResume();
    }, 550);
    return () => window.clearTimeout(timer);
  }, [isOpen, isAligned, onResolveAndResume]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="人机验证提示"
    >
      <div
        className={`w-full max-w-md rounded-xl border p-5 shadow-xl transition-colors ${
          darkMode
            ? 'border-slate-800 bg-slate-900 text-slate-100'
            : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b pb-3 border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-sm font-bold">
              请完成北大法宝人机验证（完成后将自动继续）
            </span>
          </div>
          <span className="font-mono text-xs tabular-nums text-amber-600 dark:text-amber-400">
            第 {pageNumber} 页 ({startIndex}–{endIndex} 条)
          </span>
        </div>

        <div className="mt-4 space-y-3 text-xs">
          <p className="text-slate-600 dark:text-slate-300">
            翻页已自动暂停以防漏页。请直接在下方拖动滑块完成验证，<strong>系统检测到验证通过后将自动恢复下载（无需手动点击确认按钮）</strong>：
          </p>

          <div
            className={`rounded-lg border p-3.5 ${
              darkMode
                ? 'border-slate-800 bg-slate-950/70'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-500">拖动拼图对准缺口位置 (64%)</span>
              <span className="font-mono tabular-nums font-semibold">
                {puzzleOffset}%
              </span>
            </div>

            <div className="relative h-7 rounded bg-slate-200 dark:bg-slate-800 mb-2 overflow-hidden flex items-center">
              <div
                style={{ left: `${TARGET_GAP_POS}%` }}
                className="absolute top-1 bottom-1 w-6 -ml-3 rounded border border-dashed border-amber-500 bg-amber-500/20 flex items-center justify-center text-[10px] font-mono text-amber-600 dark:text-amber-300"
              >
                缺口
              </div>
              <div
                style={{ left: `${puzzleOffset}%` }}
                className={`absolute top-1 bottom-1 w-6 -ml-3 rounded transition-colors flex items-center justify-center text-[10px] font-mono text-white ${
                  isAligned ? 'bg-emerald-600' : 'bg-blue-600'
                }`}
              >
                拼图
              </div>
            </div>

            <input
              type="range"
              min={5}
              max={95}
              value={puzzleOffset}
              onChange={(e) => setPuzzleOffset(Number(e.target.value))}
              aria-label="拖动拼图块对准缺口"
              className="w-full accent-blue-600 cursor-pointer h-1.5 rounded-lg"
            />

            {isAligned ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>已检测到人工验证通过！正在自动恢复继续下载...</span>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                <span>正在实时监测验证状态，对准缺口后即自动继续下载</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancelTask}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              darkMode
                ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                : 'border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            中止下载任务
          </button>
        </div>
      </div>
    </div>
  );
};
