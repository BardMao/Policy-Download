/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Scale,
  Moon,
  Sun,
  Globe,
  Settings,
} from 'lucide-react';
import {
  WebpageSearchRuleRow,
  BatchPageItem,
  AppSettings,
  PkulawDownloadFormat,
  MAX_PKULAW_BATCH_SIZE,
  summarizeWebpageSearchRules,
  calculateBatchPlan,
} from './utils/pkulawLogic';
import { PkulawWebViewport } from './components/PkulawWebViewport';
import { DownloadProgressView } from './components/DownloadProgressView';
import { FirstDownloadModal } from './components/FirstDownloadModal';
import { PkulawFormatModal } from './components/PkulawFormatModal';
import { WindowsExportView } from './components/WindowsExportView';
import { CaptchaModal } from './components/CaptchaModal';

type SecondaryView = 'browser_download' | 'settings';
type MainStage = 'browser' | 'download_progress';

export default function App() {
  const [secondaryView, setSecondaryView] = useState<SecondaryView>('browser_download');
  const [mainStage, setMainStage] = useState<MainStage>('browser');

  // 1. Strict Login & Search Stage State (Never auto-jumps before login)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [hasCompletedSearch, setHasCompletedSearch] = useState<boolean>(false);
  const [expectedSearchTotal] = useState<number>(128);
  const [ruleRows] = useState<WebpageSearchRuleRow[]>([
    {
      id: 'row-1',
      logic: 'AND',
      field: '标题',
      value: '生态环境',
      matchType: '模糊',
    },
  ]);

  // 2. Application & Download Settings
  const [settings, setSettings] = useState<AppSettings>({
    downloadDir: 'PKULaw_Downloads',
    darkMode: false,
    downloadFormat: 'clean',
    unpackRule: 'extract_only',
    authMode: 'carsi_institutional',
    institutionName: '北京大学 (CARSI 校园机构权限)',
    batchSize: MAX_PKULAW_BATCH_SIZE,
    minDelaySec: 1.0,
    maxDelaySec: 2.0,
    captchaStrategy: 'human_assist_pause',
    autoUnzip: false,
    deleteZipAfterMerge: false,
    mergeEncoding: 'UTF-8',
    mergeFileNamePattern: '北大法宝_批量法规汇总_{count}篇.txt',
    includeTableOfContents: false,
  });

  // 3. Modals State
  const [hasConfiguredFirstDownload, setHasConfiguredFirstDownload] = useState<boolean>(false);
  const [isFirstDownloadModalOpen, setIsFirstDownloadModalOpen] = useState<boolean>(false);
  const [isFormatModalOpen, setIsFormatModalOpen] = useState<boolean>(false);

  // 4. Download Execution & CAPTCHA State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [batches, setBatches] = useState<BatchPageItem[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState<number>(0);
  const [simulateCaptchaOnPage2, setSimulateCaptchaOnPage2] = useState<boolean>(false);
  const [isCaptchaModalOpen, setIsCaptchaModalOpen] = useState<boolean>(false);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.darkMode]);

  const handleUpdateSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const handleCompleteLogin = () => {
    setIsLoggedIn(true);
  };

  const handleCompleteSearch = () => {
    setHasCompletedSearch(true);
  };

  const searchExpression = summarizeWebpageSearchRules(
    ruleRows,
    ['法律', '行政法规'],
    '现行有效'
  );

  const handleClickStartDownload = () => {
    if (!hasConfiguredFirstDownload) {
      setIsFirstDownloadModalOpen(true);
      return;
    }
    setIsFormatModalOpen(true);
  };

  const handleConfirmFirstDownloadSettings = () => {
    setHasConfiguredFirstDownload(true);
    setIsFirstDownloadModalOpen(false);
    setIsFormatModalOpen(true);
  };

  const handleConfirmFormatAndStartDownload = (chosenFormat: PkulawDownloadFormat) => {
    handleUpdateSettings({ downloadFormat: chosenFormat });
    setIsFormatModalOpen(false);
    setMainStage('download_progress');
    startBatchDownloadFlow();
  };

  const startBatchDownloadFlow = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);

    const plannedBatches = calculateBatchPlan(expectedSearchTotal, MAX_PKULAW_BATCH_SIZE);
    setBatches(plannedBatches);
    setCurrentPageIdx(0);
    setIsRunning(true);

    runSingleBatchStep(0, plannedBatches);
  };

  const runSingleBatchStep = (
    pageIdx: number,
    currentBatches: BatchPageItem[]
  ) => {
    if (pageIdx >= currentBatches.length) {
      setIsRunning(false);
      return;
    }

    setCurrentPageIdx(pageIdx);
    const targetBatch = currentBatches[pageIdx];

    if (pageIdx === 1 && simulateCaptchaOnPage2 && !targetBatch.captchaTriggered) {
      const pausedBatches = currentBatches.map((b, idx) =>
        idx === pageIdx
          ? { ...b, status: 'captcha_paused' as const, captchaTriggered: true }
          : b
      );
      setBatches(pausedBatches);
      setIsCaptchaModalOpen(true);
      return;
    }

    const downloadingBatches = currentBatches.map((b, idx) =>
      idx === pageIdx ? { ...b, status: 'downloading' as const } : b
    );
    setBatches(downloadingBatches);

    timerRef.current = window.setTimeout(() => {
      const completedBatches = downloadingBatches.map((b, idx) =>
        idx === pageIdx
          ? {
              ...b,
              status: 'completed' as const,
              extractedFilesCount: b.expectedCount,
            }
          : b
      );

      setBatches(completedBatches);

      timerRef.current = window.setTimeout(() => {
        runSingleBatchStep(pageIdx + 1, completedBatches);
      }, 420);
    }, 520);
  };

  const handleResolveCaptchaAndResume = () => {
    setIsCaptchaModalOpen(false);
    const updatedBatches = batches.map((b, idx) =>
      idx === currentPageIdx
        ? { ...b, captchaTriggered: true, status: 'downloading' as const }
        : b
    );
    setBatches(updatedBatches);
    runSingleBatchStep(currentPageIdx, updatedBatches);
  };

  const handleCancelCaptchaTask = () => {
    setIsCaptchaModalOpen(false);
    setIsRunning(false);
  };

  const activeBatchForCaptcha = batches[currentPageIdx] || {
    pageNumber: 2,
    startIndex: 51,
    endIndex: 100,
  };

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors ${
        settings.darkMode
          ? 'bg-slate-950 text-slate-100'
          : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Streamlined Top Bar: Brand + 2 Secondary Views + Dark Mode Toggle */}
      <header
        className={`sticky top-0 z-30 border-b px-4 py-2.5 ${
          settings.darkMode
            ? 'border-slate-800 bg-slate-900'
            : 'border-slate-200 bg-white'
        }`}
      >
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[#8B1E24] flex items-center justify-center text-white">
              <Scale className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold tracking-tight">
              北大法宝法律法规批量下载器
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`inline-flex rounded-lg p-0.5 border ${
                settings.darkMode
                  ? 'bg-slate-950 border-slate-800'
                  : 'bg-slate-100 border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setSecondaryView('browser_download')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  secondaryView === 'browser_download'
                    ? 'bg-[#8B1E24] text-white'
                    : settings.darkMode
                      ? 'text-slate-300 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>浏览器与下载</span>
              </button>

              <button
                type="button"
                onClick={() => setSecondaryView('settings')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  secondaryView === 'settings'
                    ? 'bg-[#8B1E24] text-white'
                    : settings.darkMode
                      ? 'text-slate-300 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>扩展安装与下载设置</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleUpdateSettings({ darkMode: !settings.darkMode })}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                settings.darkMode
                  ? 'border-slate-800 bg-slate-950 text-amber-400 hover:bg-slate-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
              title="切换深色/浅色模式"
            >
              {settings.darkMode ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 py-4">
        {secondaryView === 'browser_download' ? (
          mainStage === 'browser' ? (
            <PkulawWebViewport
              darkMode={settings.darkMode}
              settings={settings}
              isLoggedIn={isLoggedIn}
              hasCompletedSearch={hasCompletedSearch}
              onCompleteLogin={handleCompleteLogin}
              onCompleteSearch={handleCompleteSearch}
              onClickStartDownload={handleClickStartDownload}
              onOpenExtensionGuide={() => setSecondaryView('settings')}
            />
          ) : (
            <DownloadProgressView
              darkMode={settings.darkMode}
              settings={settings}
              isRunning={isRunning}
              batches={batches}
              expectedSearchTotal={expectedSearchTotal}
              simulateCaptchaOnPage2={simulateCaptchaOnPage2}
              onToggleSimulateCaptcha={setSimulateCaptchaOnPage2}
              onBackToWebpage={() => setMainStage('browser')}
            />
          )
        ) : (
          <WindowsExportView
            darkMode={settings.darkMode}
            settings={settings}
            searchExpression={searchExpression}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </main>

      {/* First-Time Download Settings Confirmation Modal */}
      <FirstDownloadModal
        isOpen={isFirstDownloadModalOpen}
        darkMode={settings.darkMode}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onConfirmAndStart={handleConfirmFirstDownloadSettings}
        onCancel={() => setIsFirstDownloadModalOpen(false)}
      />

      {/* PKULAW Native "自定义下载" Format Selection Popup */}
      <PkulawFormatModal
        isOpen={isFormatModalOpen}
        initialFormat={
          settings.downloadFormat === 'fulltext_txt' ? 'clean' : settings.downloadFormat
        }
        onConfirmFormatAndStart={handleConfirmFormatAndStartDownload}
        onClose={() => setIsFormatModalOpen(false)}
      />

      {/* Human Verification (CAPTCHA) Prompt Modal */}
      <CaptchaModal
        isOpen={isCaptchaModalOpen}
        pageNumber={activeBatchForCaptcha.pageNumber}
        startIndex={activeBatchForCaptcha.startIndex}
        endIndex={activeBatchForCaptcha.endIndex}
        darkMode={settings.darkMode}
        onResolveAndResume={handleResolveCaptchaAndResume}
        onCancelTask={handleCancelCaptchaTask}
      />
    </div>
  );
}
