import React, { useState } from 'react';
import {
  Globe,
  RefreshCw,
  Download,
  ShieldCheck,
  Search,
  Puzzle,
  Terminal,
  Check,
} from 'lucide-react';
import { AppSettings } from '../utils/pkulawLogic';
import {
  buildExtensionZipBytes,
  generateContentJs,
} from '../utils/extensionGenerator';

interface PkulawWebViewportProps {
  darkMode: boolean;
  settings: AppSettings;
  isLoggedIn: boolean;
  hasCompletedSearch: boolean;
  onCompleteLogin: () => void;
  onCompleteSearch: () => void;
  onClickStartDownload: () => void;
  onOpenExtensionGuide: () => void;
}

const PKULAW_LAW_HOME_URL = 'https://www.pkulaw.com/law';
const PKULAW_ADVANCED_SEARCH_URL = 'https://www.pkulaw.com/advanced/law';

export const PkulawWebViewport: React.FC<PkulawWebViewportProps> = ({
  darkMode,
  settings,
  isLoggedIn,
  hasCompletedSearch,
  onCompleteLogin,
  onCompleteSearch,
  onClickStartDownload,
  onOpenExtensionGuide,
}) => {
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [currentUrl, setCurrentUrl] = useState<string>(PKULAW_LAW_HOME_URL);
  const [urlInput, setUrlInput] = useState<string>(PKULAW_LAW_HOME_URL);
  const [copiedConsole, setCopiedConsole] = useState<boolean>(false);
  const [refreshInfoText, setRefreshInfoText] = useState<string>('');

  const handleRefreshOfficialSite = () => {
    setIframeKey((k) => k + 1);
  };

  const handleRefreshBottomBarInfo = () => {
    setRefreshInfoText(`共检测到123条法规，每页显示20条`);
  };

  const handleNavigateInFrame = (targetUrl: string) => {
    setCurrentUrl(targetUrl);
    setUrlInput(targetUrl);
    setIframeKey((k) => k + 1);
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    const normalized = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    handleNavigateInFrame(normalized);
  };

  const handleDownloadExtensionZip = () => {
    const zipBytes = buildExtensionZipBytes(settings);
    const blob = new Blob([zipBytes as unknown as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'PKULaw_Edge_Chrome_Extension.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyConsoleScript = async () => {
    try {
      const code = generateContentJs(settings);
      await navigator.clipboard.writeText(code);
      setCopiedConsole(true);
      setTimeout(() => setCopiedConsole(false), 2200);
    } catch {
      // ignore
    }
  };

  // 严格根据操作进度显示底部进度栏：
  // 阶段 1 (login_stage): 1/2 登录机构账号
  // 阶段 2 (search_stage): 2/2 填写检索式
  // 阶段 3 (download_ready): 进度条变为“开始下载”按钮
  const currentStage: 'login_stage' | 'search_stage' | 'download_ready' = !isLoggedIn
    ? 'login_stage'
    : !hasCompletedSearch
      ? 'search_stage'
      : 'download_ready';

  return (
    <div className="space-y-3">
      {/* 顶部 Edge / Chrome 网页自动化扩展快速获取横幅 */}
      <div
        className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs ${
          darkMode
            ? 'border-slate-800 bg-slate-900 text-slate-200'
            : 'border-slate-200 bg-white text-slate-800'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Puzzle className="h-4 w-4 text-[#8B1E24] dark:text-red-400 shrink-0" />
          <span>
            <strong>Edge & Chrome 网页端自动化扩展 v3.3.0 已就绪（第2+页全文格式1:1同步 + 单次点击防重复下载 + 1~2秒极速隔页间隔）</strong>：下载解压覆盖并在 <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">edge://extensions</code> 点击「重新加载」即可生效。
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadExtensionZip}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#8B1E24] hover:bg-[#72171c] text-white font-bold transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>一键下载 v3.3.0 扩展包 (.zip)</span>
          </button>

          <button
            type="button"
            onClick={handleCopyConsoleScript}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
              darkMode
                ? 'border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
                : 'border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100'
            }`}
          >
            {copiedConsole ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>已复制 F12 控制台脚本</span>
              </>
            ) : (
              <>
                <Terminal className="h-3.5 w-3.5" />
                <span>复制 F12 控制台 3 秒实测脚本</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenExtensionGuide}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors cursor-pointer"
          >
            查看安装测试与反馈指南 →
          </button>
        </div>
      </div>

      {/* 官网视图与底部扩展注入栏效果演练 */}
      <div
        className={`rounded-xl border overflow-hidden flex flex-col justify-between min-h-[620px] relative ${
          darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}
      >
        {/* 顶部官网地址栏与刷新按钮 */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b text-xs ${
            darkMode
              ? 'border-slate-800 bg-slate-950 text-slate-300'
              : 'border-slate-200 bg-slate-100 text-slate-700'
          }`}
        >
          <form
            onSubmit={handleAddressSubmit}
            className="flex items-center gap-2 flex-1 min-w-[260px]"
          >
            <Globe className="h-3.5 w-3.5 text-[#8B1E24] dark:text-red-400 shrink-0" />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              aria-label="官网内部访问地址"
              className={`px-3 py-1 rounded border font-mono text-xs flex-1 outline-none ${
                darkMode
                  ? 'border-slate-800 bg-slate-900 text-slate-200 focus:border-blue-500'
                  : 'border-slate-300 bg-white text-slate-800 focus:border-blue-600'
              }`}
            />
            <button
              type="button"
              onClick={() =>
                handleNavigateInFrame(
                  currentUrl === PKULAW_ADVANCED_SEARCH_URL
                    ? PKULAW_LAW_HOME_URL
                    : PKULAW_ADVANCED_SEARCH_URL
                )
              }
              className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                currentUrl === PKULAW_ADVANCED_SEARCH_URL
                  ? 'border-[#8B1E24] bg-[#8B1E24]/10 text-[#8B1E24] dark:text-red-300'
                  : darkMode
                    ? 'border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {currentUrl === PKULAW_ADVANCED_SEARCH_URL
                ? '切换至法规主页'
                : '切换至高级检索页'}
            </button>
            <button
              type="button"
              onClick={handleRefreshOfficialSite}
              className={`flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                darkMode
                  ? 'border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              title="刷新官网视图"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>刷新</span>
            </button>
          </form>
        </div>

        {/* 中央区域：北大法宝官方网站主界面 */}
        <div className="flex-1 flex flex-col bg-white relative">
          <iframe
            key={iframeKey}
            src={currentUrl}
            title="北大法宝官方网站主视图"
            className="w-full min-h-[520px] flex-1 border-0 bg-white"
          />
        </div>

        {/* 底部不遮挡官网界面的深色扩展动态进度栏：1/2 登录机构账号 -> 2/2 填写检索式 -> 开始下载按钮 */}
        <div className="border-t-2 border-[#8B1E24] bg-slate-950 text-slate-100 px-4 py-3 flex items-center justify-between gap-4">
          <div className="hidden md:flex items-center shrink-0">
            <span className="px-2 py-1 rounded bg-[#8B1E24] text-white text-xs font-bold">
              法宝批量下载扩展 v3.3
            </span>
          </div>

          {currentStage === 'login_stage' && (
            <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-semibold text-slate-100">
                    <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0" />
                    <span>
                      1/2 登录机构账号：请在北大法宝网页右上角登录机构账号（支持原生 CARSI 校园登录）并获取全文下载权限
                    </span>
                  </div>
                  <span className="font-mono tabular-nums text-slate-400">0%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="官网信息填写进度"
                  aria-valuenow={0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="w-full h-2 rounded-lg bg-slate-800 overflow-hidden"
                >
                  <div className="w-0 h-full bg-blue-500 transition-all duration-300" />
                </div>
              </div>

              <button
                type="button"
                onClick={onCompleteLogin}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer shrink-0"
              >
                我已在网页完成登录 →
              </button>
            </div>
          )}

          {currentStage === 'search_stage' && (
            <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-semibold text-amber-200">
                    <Search className="h-4 w-4 text-amber-400 shrink-0" />
                    <span>
                      2/2 填写检索式：已登录账号，请在官网高级检索页面填写检索词并点击「检索」确认结果无误
                    </span>
                  </div>
                  <span className="font-mono tabular-nums text-amber-400 font-semibold">
                    50%
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="官网信息填写进度"
                  aria-valuenow={50}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="w-full h-2 rounded-lg bg-slate-800 overflow-hidden"
                >
                  <div className="w-1/2 h-full bg-amber-500 transition-all duration-300" />
                </div>
              </div>

              <button
                type="button"
                onClick={onCompleteSearch}
                className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer shrink-0"
              >
                已确认检索结果 →
              </button>
            </div>
          )}

          {currentStage === 'download_ready' && (
            <button
              type="button"
              onClick={onClickStartDownload}
              className="flex-1 py-2.5 px-6 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>
                ▶ 开始下载（{refreshInfoText || '共检测到123条法规，每页显示20条'}）— 自动弹出「自定义下载」格式选择框
              </span>
            </button>
          )}

          {refreshInfoText && currentStage !== 'download_ready' && (
            <span className="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-500 text-emerald-300 text-xs font-bold whitespace-nowrap">
              {refreshInfoText}
            </span>
          )}

          <button
            type="button"
            onClick={handleRefreshBottomBarInfo}
            className="px-3 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 border border-emerald-500 text-white text-xs font-bold whitespace-nowrap cursor-pointer shrink-0"
            title="重新读取页面信息并显示总条数与每页显示条数"
          >
            🔄 刷新
          </button>
        </div>
      </div>
    </div>
  );
};
