import React, { useState } from 'react';
import {
  FolderOpen,
  Download,
  Copy,
  Check,
  Moon,
  Sun,
  Terminal,
  Puzzle,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { AppSettings } from '../utils/pkulawLogic';
import {
  generateManifestJson,
  generateBackgroundJs,
  generateContentJs,
  buildExtensionZipBytes,
} from '../utils/extensionGenerator';

interface WindowsExportViewProps {
  darkMode: boolean;
  settings: AppSettings;
  searchExpression: string;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
}

const PRESET_SUBFOLDERS = [
  'PKULaw_Downloads',
  'PKULaw_Corpus_2026',
  'Legal_Batch_Archive',
];

interface DiagnosticData {
  extVersion?: string;
  url?: string;
  stage?: string;
  domLoggedIn?: boolean;
  detectedUserIndicator?: string;
  domHasResults?: boolean;
  detectedTotalCount?: number;
  itemCheckboxesCount?: number;
  itemCheckboxesCheckedCount?: number;
  captchaVisible?: boolean;
  selectAllControl?: unknown;
  batchDownloadControl?: unknown;
  foundCustomDownloadModal?: boolean;
  foundNextPageBtn?: boolean;
  chosenFormat?: string;
  timestamp?: string;
}

export const WindowsExportView: React.FC<WindowsExportViewProps> = ({
  darkMode,
  settings,
  onUpdateSettings,
}) => {
  const [activeFileTab, setActiveFileTab] = useState<
    'content_js' | 'manifest_json' | 'background_js'
  >('content_js');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedConsole, setCopiedConsole] = useState(false);
  const [diagInput, setDiagInput] = useState('');
  const [parsedDiag, setParsedDiag] = useState<DiagnosticData | null>(null);
  const [diagError, setDiagError] = useState('');

  const contentJsSource = generateContentJs(settings);
  const manifestJsonSource = generateManifestJson();
  const backgroundJsSource = generateBackgroundJs(settings);

  const currentCode =
    activeFileTab === 'content_js'
      ? contentJsSource
      : activeFileTab === 'manifest_json'
        ? manifestJsonSource
        : backgroundJsSource;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleCopyConsoleScript = async () => {
    try {
      await navigator.clipboard.writeText(contentJsSource);
      setCopiedConsole(true);
      setTimeout(() => setCopiedConsole(false), 2200);
    } catch {
      // ignore
    }
  };

  const triggerBlobDownload = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadExtensionZip = () => {
    const zipBytes = buildExtensionZipBytes(settings);
    const blob = new Blob([zipBytes as unknown as BlobPart], { type: 'application/zip' });
    triggerBlobDownload('PKULaw_Edge_Chrome_Extension.zip', blob);
  };

  const handleDownloadUserscript = () => {
    const blob = new Blob([contentJsSource], {
      type: 'text/javascript;charset=utf-8',
    });
    triggerBlobDownload('pkulaw_auto_downloader.user.js', blob);
  };

  const handleParseDiagnostics = (raw: string) => {
    setDiagInput(raw);
    if (!raw.trim()) {
      setParsedDiag(null);
      setDiagError('');
      return;
    }
    try {
      const obj = JSON.parse(raw) as DiagnosticData;
      setParsedDiag(obj);
      setDiagError('');
    } catch {
      setParsedDiag(null);
      setDiagError('JSON 格式解析失败，请直接粘贴点击「诊断与调试」获得的完整内容。');
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Edge / Chrome 网页自动化扩展一键获取与运行测试指南 */}
      <div
        className={`rounded-xl border p-5 ${
          darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Puzzle className="h-4 w-4 text-[#8B1E24] dark:text-red-400" />
              <span className="text-sm font-bold">
                Edge & Chrome 网页端自动化扩展 v3.3.0（修复第 2+ 页误下载成 Excel 目录列表 + 消除同页重复下载 + 1.0s~2.0s 极速隔页间隔）
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              精准录制第 1 页弹窗内全部单选/复选框状态并在第 2+ 页 1:1 还原（确保下载法规全文 ZIP 压缩包而非目录列表 Excel），检测 <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">.is-loading</code> 打包状态杜绝同一页重复触发下载，并将默认隔页随机间隔缩短至 <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">1.0s ~ 2.0s</code>（支持最低 0.5s）。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadExtensionZip}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#8B1E24] hover:bg-[#72171c] rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <Download className="h-3.5 w-3.5" />
              <span>一键下载 v3.3.0 扩展包 (.zip)</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadUserscript}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>下载 Tampermonkey 油猴脚本 (.user.js)</span>
            </button>

            <button
              type="button"
              onClick={handleCopyConsoleScript}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                darkMode
                  ? 'border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
                  : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
              }`}
            >
              {copiedConsole ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span>已复制控制台脚本！</span>
                </>
              ) : (
                <>
                  <Terminal className="h-3.5 w-3.5" />
                  <span>复制 F12 控制台 3 秒实测脚本</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 三步运行、测试与反馈说明卡片 */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div
            className={`rounded-lg border p-4 space-y-2 ${
              darkMode
                ? 'border-slate-800 bg-slate-950/70'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="font-bold text-blue-600 dark:text-blue-400">
              第一步：如何在 Edge / Chrome 中更新并运行 v3.3.0
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300 leading-relaxed">
              <li>
                <strong>更新扩展至 v3.3.0</strong>：点击上方「一键下载 v3.3.0 扩展包 (.zip)」，解压覆盖之前的扩展文件夹。在 <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono">edge://extensions</code> 页面点击扩展卡片上的<strong>「重新加载」</strong>（确认版本变为 <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono">3.3.0</code>），刷新北大法宝页面即可看到底部变为 <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono">法宝批量下载扩展 v3.3</code>。
              </li>
              <li>
                <strong>底栏「🔄 刷新」按钮</strong>：若您在网页上临时修改了每页显示法规条数（如改为 50条/页），点击底栏右侧的<strong>「🔄 刷新」</strong>按钮即可重新读取页面信息并输出：<code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono">共检测到xxx条法规，每页显示XX条</code>。
              </li>
            </ol>
          </div>

          <div
            className={`rounded-lg border p-4 space-y-2 ${
              darkMode
                ? 'border-slate-800 bg-slate-950/70'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="font-bold text-emerald-600 dark:text-emerald-400">
              第二步：如何在北大法宝官网测试全流程
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300 leading-relaxed">
              <li>
                在北大法宝官网或高级检索页 (<code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">pkulaw.com/advanced/law</code>) 登录机构账号并执行检索。
              </li>
              <li>
                结果加载后底部进度条变为<strong>「▶ 开始下载」</strong>。点击后将自动勾选本页全部法规，并精确点击 <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono">left-downLoad</code> 下载图标自动弹出法宝<strong>「自定义下载」</strong>格式选择框，底栏显示<strong>「请选择下载格式」</strong>。
              </li>
              <li>
                在弹窗中选好格式并点击「确定」，扩展将逐页保存原始压缩包并在全部完成后保留「打开下载文件夹查看压缩包」按钮。
              </li>
            </ol>
          </div>

          <div
            className={`rounded-lg border p-4 space-y-2 ${
              darkMode
                ? 'border-slate-800 bg-slate-950/70'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="font-bold text-amber-600 dark:text-amber-400">
              第三步：如何将测试结果反馈给我
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              在北大法宝网页底部的扩展栏最右侧点击<strong>「🔍 诊断与调试」</strong>按钮，会自动将当前网页的 DOM 识别状态复制为 JSON：
            </p>
            <textarea
              value={diagInput}
              onChange={(e) => handleParseDiagnostics(e.target.value)}
              placeholder="在此粘贴从法宝网页底部点击「🔍 诊断与调试」获得的 JSON 报告以自检，或直接粘贴到对话框发给我..."
              rows={3}
              className={`w-full rounded border p-2 font-mono text-[11px] outline-none ${
                darkMode
                  ? 'border-slate-700 bg-slate-900 text-slate-200'
                  : 'border-slate-300 bg-white text-slate-800'
              }`}
            />
            {diagError && (
              <div className="text-red-500 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{diagError}</span>
              </div>
            )}
            {parsedDiag && (
              <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-[11px] space-y-1">
                <div className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>诊断报告解析成功（版本 {parsedDiag.extVersion || '3.3.0'}）</span>
                </div>
                <div>
                  阶段: <span className="font-mono">{parsedDiag.stage}</span> | 检索条数:{' '}
                  <span className="font-mono">{parsedDiag.detectedTotalCount}</span> | 遮挡验证:{' '}
                  <span className="font-mono">{String(parsedDiag.captchaVisible)}</span>
                </div>
                <div>
                  全选框: {parsedDiag.selectAllControl ? '✅' : '❌'} | 下载按钮:{' '}
                  {parsedDiag.batchDownloadControl ? '✅' : '❌'} | 下一页按钮:{' '}
                  {parsedDiag.foundNextPageBtn ? '✅' : '❌'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. 扩展默认下载设置与应用程序设置 */}
      <div
        className={`rounded-xl border p-5 ${
          darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-bold">
              扩展默认下载参数设置（修改后点击上方「一键下载 v3.3.0 扩展包」即自动写入扩展默认配置）
            </span>
          </div>

          <button
            type="button"
            onClick={() => onUpdateSettings({ darkMode: !settings.darkMode })}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              darkMode
                ? 'border-slate-700 bg-slate-800 text-amber-300 hover:bg-slate-700'
                : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
            }`}
          >
            {darkMode ? (
              <>
                <Sun className="h-3.5 w-3.5" />
                <span>深色模式：开启</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5" />
                <span>深色模式：关闭</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          {/* 左侧：浏览器下载归档子目录 */}
          <div>
            <label
              htmlFor="cfg-download-dir"
              className="block font-medium mb-1.5"
            >
              原始压缩包 (.zip) 自动归档子文件夹名称（位于 Edge/Chrome 默认「下载」目录内）
            </label>
            <div className="relative">
              <FolderOpen className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="cfg-download-dir"
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESET_SUBFOLDERS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onUpdateSettings({ downloadDir: preset })}
                  className={`px-2.5 py-1 font-mono rounded border transition-colors cursor-pointer ${
                    settings.downloadDir === preset
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : darkMode
                        ? 'border-slate-800 bg-slate-950 text-slate-400'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  Downloads/{preset}
                </button>
              ))}
            </div>
          </div>

          {/* 右侧：翻页间隔 */}
          <div>
            <label
              htmlFor="cfg-delay"
              className="block font-medium mb-1.5"
            >
              自动翻页随机等待间隔：{settings.minDelaySec.toFixed(1)}s –{' '}
              {settings.maxDelaySec.toFixed(1)}s（默认 1.0s – 2.0s 极速模式）
            </label>
            <input
              id="cfg-delay"
              type="range"
              min={0.5}
              max={6.0}
              step={0.5}
              value={settings.minDelaySec}
              onChange={(e) => {
                const val = Number(e.target.value);
                onUpdateSettings({
                  minDelaySec: val,
                  maxDelaySec: Number((val + 1.0).toFixed(1)),
                });
              }}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <p className="mt-2 text-slate-500 dark:text-slate-400">
              每页原始压缩包触发浏览器下载流后，仅等待此极短随机间隔即自动翻至下一页（也可在法宝网页底栏「⚙ 下载设置」中一键切换 0.5s~1.2s 极速模式）。
            </p>
          </div>
        </div>
      </div>

      {/* 3. 扩展源码在线检视与单文件复制 */}
      <div
        className={`rounded-xl border overflow-hidden ${
          darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="text-xs space-y-0.5">
            <div className="font-bold text-sm">
              扩展核心代码检视（Manifest V3 标准结构，兼容 Edge 与 Chrome）
            </div>
            <div className="text-slate-500 dark:text-slate-400">
              包含 `content.js`（官网 DOM 注入与自动翻页下载）、`manifest.json`（扩展配置）与 `background.js`（原始压缩包自动归档与打开下载目录服务）。
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyCode}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              darkMode
                ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {copiedCode ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>已复制当前文件</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>复制当前文件代码</span>
              </>
            )}
          </button>
        </div>

        <div
          className={`flex flex-wrap items-center gap-2 px-4 py-2 border-b text-xs ${
            darkMode
              ? 'border-slate-800 bg-slate-950/60'
              : 'border-slate-200 bg-slate-50'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveFileTab('content_js')}
            className={`px-3 py-1 rounded font-mono transition-colors cursor-pointer ${
              activeFileTab === 'content_js'
                ? 'bg-blue-600 text-white font-medium'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            content.js (官网注入与自动下载核心脚本 / 油猴脚本)
          </button>
          <button
            type="button"
            onClick={() => setActiveFileTab('manifest_json')}
            className={`px-3 py-1 rounded font-mono transition-colors cursor-pointer ${
              activeFileTab === 'manifest_json'
                ? 'bg-blue-600 text-white font-medium'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            manifest.json (Edge/Chrome 扩展清单)
          </button>
          <button
            type="button"
            onClick={() => setActiveFileTab('background_js')}
            className={`px-3 py-1 rounded font-mono transition-colors cursor-pointer ${
              activeFileTab === 'background_js'
                ? 'bg-blue-600 text-white font-medium'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            background.js (原始压缩包归档与打开文件夹服务)
          </button>
        </div>

        <div className="p-4">
          <pre
            className={`w-full h-[280px] overflow-auto rounded-lg border p-3.5 font-mono text-xs leading-relaxed select-all ${
              darkMode
                ? 'border-slate-800 bg-slate-950 text-slate-200'
                : 'border-slate-200 bg-slate-50 text-slate-800'
            }`}
          >
            {currentCode}
          </pre>
        </div>
      </div>
    </div>
  );
};
