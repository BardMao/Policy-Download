import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { PkulawDownloadFormat } from '../utils/pkulawLogic';

interface PkulawFormatModalProps {
  isOpen: boolean;
  initialFormat: PkulawDownloadFormat;
  onConfirmFormatAndStart: (chosenFormat: PkulawDownloadFormat) => void;
  onClose: () => void;
}

export const PkulawFormatModal: React.FC<PkulawFormatModalProps> = ({
  isOpen,
  initialFormat,
  onConfirmFormatAndStart,
  onClose,
}) => {
  const [selected, setSelected] = useState<PkulawDownloadFormat>(initialFormat || 'clean');

  useEffect(() => {
    if (isOpen && initialFormat) {
      setSelected(initialFormat);
    }
  }, [isOpen, initialFormat]);

  if (!isOpen) return null;

  const renderRadioDot = (checked: boolean) => (
    <span
      className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors shrink-0 ${
        checked
          ? 'border-[#1684FC] bg-[#1684FC]'
          : 'border-slate-300 bg-white'
      }`}
    >
      {checked && <span className="w-2 h-2 rounded-full bg-white" />}
    </span>
  );

  const renderDocIcon = (badge: string) => (
    <span className="relative inline-flex items-center justify-center w-6 h-7 rounded-xs border-[1.5px] border-[#1684FC] text-[#1684FC] font-sans text-[10px] font-bold select-none shrink-0 bg-blue-50/30">
      <span className="absolute -top-[1px] -right-[1px] w-2 h-2 border-b-[1.5px] border-l-[1.5px] border-[#1684FC] bg-white" />
      <span className="mt-1 leading-none tracking-tighter">{badge}</span>
    </span>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="自定义下载"
    >
      <div className="w-full max-w-[540px] rounded-xl bg-white text-slate-800 shadow-2xl border border-slate-200 overflow-hidden">
        {/* 弹窗头部：自定义下载 */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100">
          <span className="text-lg font-bold text-slate-800 tracking-wide">
            自定义下载
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭下载格式弹窗"
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 弹窗主体：完全还原北大法宝网页“请选择下载格式”弹窗 */}
        <div className="px-8 py-6 space-y-6">
          <div className="text-base font-bold text-slate-800">
            请选择下载格式：
          </div>

          <div className="pl-6 space-y-5 text-[15px]">
            {/* 目录行：Excel */}
            <div className="flex items-center">
              <span className="w-16 text-slate-700 font-medium shrink-0">
                目录：
              </span>
              <button
                type="button"
                onClick={() => setSelected('excel')}
                className="flex items-center gap-3 py-1 cursor-pointer group"
              >
                {renderRadioDot(selected === 'excel')}
                {renderDocIcon('X')}
                <span className="text-slate-600 group-hover:text-slate-900">
                  Excel
                </span>
              </button>
            </div>

            {/* 全文行：Word / PDF / 纯文本 / 超文本 / 纯净版 */}
            <div className="flex items-start">
              <span className="w-16 text-slate-700 font-medium shrink-0 pt-1">
                全文：
              </span>
              <div className="grid grid-cols-2 gap-x-14 gap-y-5 flex-1">
                {/* Word */}
                <button
                  type="button"
                  onClick={() => setSelected('word')}
                  className="flex items-center gap-3 py-1 cursor-pointer group text-left"
                >
                  {renderRadioDot(selected === 'word')}
                  {renderDocIcon('W')}
                  <span className="text-slate-600 group-hover:text-slate-900">
                    Word
                  </span>
                </button>

                {/* PDF */}
                <button
                  type="button"
                  onClick={() => setSelected('pdf')}
                  className="flex items-center gap-3 py-1 cursor-pointer group text-left"
                >
                  {renderRadioDot(selected === 'pdf')}
                  {renderDocIcon('PDF')}
                  <span className="text-slate-600 group-hover:text-slate-900">
                    PDF
                  </span>
                </button>

                {/* 纯文本 */}
                <button
                  type="button"
                  onClick={() => setSelected('txt')}
                  className="flex items-center gap-3 py-1 cursor-pointer group text-left"
                >
                  {renderRadioDot(selected === 'txt')}
                  {renderDocIcon('≡')}
                  <span className="text-slate-600 group-hover:text-slate-900">
                    纯文本
                  </span>
                </button>

                {/* 超文本 */}
                <button
                  type="button"
                  onClick={() => setSelected('html')}
                  className="flex items-center gap-3 py-1 cursor-pointer group text-left"
                >
                  {renderRadioDot(selected === 'html')}
                  {renderDocIcon('🔗')}
                  <span className="text-slate-600 group-hover:text-slate-900">
                    超文本
                  </span>
                </button>

                {/* 纯净版 */}
                <button
                  type="button"
                  onClick={() => setSelected('clean')}
                  className="flex items-center gap-3 py-1 cursor-pointer group text-left"
                >
                  {renderRadioDot(selected === 'clean')}
                  {renderDocIcon('T')}
                  <span className="text-slate-600 group-hover:text-slate-900">
                    纯净版
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* 底部确定按钮 */}
          <div className="pt-3 pb-1 flex justify-center">
            <button
              type="button"
              onClick={() => onConfirmFormatAndStart(selected)}
              className="px-7 py-2.5 rounded-md bg-[#1880B8] hover:bg-[#146c9c] text-white text-sm font-semibold transition-colors cursor-pointer shadow-xs"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
