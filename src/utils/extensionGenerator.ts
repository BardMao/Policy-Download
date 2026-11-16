import { AppSettings } from './pkulawLogic';
import { createZipArchive, ZipFileEntry } from './zipBuilder';

export function generateManifestJson(): string {
  const manifest = {
    manifest_version: 3,
    name: '北大法宝法律法规批量下载助手 (PKULAW Batch Downloader)',
    version: '3.3.0',
    description:
      '在北大法宝官网 (pkulaw.com) 底部注入操作进度条与全自动分页批量下载引擎，支持第2+页精确同步全文格式与单次防重确认、极速翻页间隔，将各页原始压缩包保存至下载目录。',
    permissions: ['storage', 'downloads', 'tabs', 'scripting', 'activeTab'],
    host_permissions: [
      'https://www.pkulaw.com/*',
      'https://*.pkulaw.com/*',
      'http://www.pkulaw.com/*',
      'http://*.pkulaw.com/*',
      '*://pkulaw.com/*',
    ],
    action: {
      default_title: '北大法宝批量下载助手 v3.3（点击打开或激活底部进度条）',
    },
    background: {
      service_worker: 'background.js',
    },
    content_scripts: [
      {
        matches: [
          'https://www.pkulaw.com/*',
          'https://*.pkulaw.com/*',
          'http://www.pkulaw.com/*',
          'http://*.pkulaw.com/*',
          '*://pkulaw.com/*',
        ],
        js: ['page_hook.js'],
        run_at: 'document_start',
        world: 'MAIN',
        all_frames: true,
      },
      {
        matches: [
          'https://www.pkulaw.com/*',
          'https://*.pkulaw.com/*',
          'http://www.pkulaw.com/*',
          'http://*.pkulaw.com/*',
          '*://pkulaw.com/*',
        ],
        js: ['content.js'],
        run_at: 'document_end',
        all_frames: true,
      },
    ],
  };
  return JSON.stringify(manifest, null, 2);
}

export function generatePageHookJs(): string {
  const lines = [
    '// ============================================================================',
    '// 北大法宝批量下载助手 - 页面主世界钩子 (page_hook.js v3.3.0, world: MAIN)',
    '// 核心作用：当第 2 页及后续分页由扩展定时器自动点击「确定」触发下载时，',
    '// 网页处于无用户手势状态 (navigator.userActivation.isActive === false)，',
    '// 浏览器内置弹窗拦截器会拦截网页的 window.open / target="_blank" 表单提交，导致后续页无法下载。',
    '// 本脚本在 MAIN 世界拦截被阻止的下载弹窗与异步下载 URL，并交由扩展后台静默打开完成下载。',
    '// ============================================================================',
    '(function () {',
    '  if (window.__PKULAW_MAIN_HOOK_INSTALLED__) return;',
    '  window.__PKULAW_MAIN_HOOK_INSTALLED__ = true;',
    '',
    '  function isBatchActive() {',
    '    try {',
    '      return document.documentElement && document.documentElement.getAttribute("data-pkulaw-batch-active") === "true";',
    '    } catch (e) {',
    '      return false;',
    '    }',
    '  }',
    '',
    '  function ensureHiddenDownloadIframe() {',
    '    var frameName = "pkulaw_ext_hidden_dl_iframe";',
    '    var existing = document.getElementById(frameName);',
    '    if (existing) return frameName;',
    '    try {',
    '      var iframe = document.createElement("iframe");',
    '      iframe.id = frameName;',
    '      iframe.name = frameName;',
    '      iframe.style.cssText = "display:none !important;width:0 !important;height:0 !important;border:0 !important;";',
    '      (document.body || document.documentElement).appendChild(iframe);',
    '    } catch (e) {}',
    '    return frameName;',
    '  }',
    '',
    '  function notifyExtensionOpenDownloadUrl(rawUrl) {',
    '    if (!rawUrl) return;',
    '    var str = String(rawUrl).trim();',
    '    if (!str || str === "about:blank" || str.indexOf("javascript:") === 0) return;',
    '    try {',
    '      var fullUrl = new URL(str, window.location.href).href;',
    '      window.postMessage({',
    '        source: "PKULAW_EXT_MAIN_HOOK",',
    '        type: "PKULAW_FORCE_OPEN_URL",',
    '        url: fullUrl',
    '      }, "*");',
    '    } catch (e) {}',
    '  }',
    '',
    '  function createSyntheticWindowProxy(initialUrl) {',
    '    if (initialUrl && String(initialUrl).trim() && String(initialUrl).trim() !== "about:blank") {',
    '      notifyExtensionOpenDownloadUrl(initialUrl);',
    '    }',
    '    var fakeLocation = {',
    '      _href: initialUrl || "about:blank",',
    '      assign: function (u) { this._href = u; notifyExtensionOpenDownloadUrl(u); },',
    '      replace: function (u) { this._href = u; notifyExtensionOpenDownloadUrl(u); },',
    '      reload: function () {}',
    '    };',
    '    Object.defineProperty(fakeLocation, "href", {',
    '      get: function () { return this._href; },',
    '      set: function (u) { this._href = u; notifyExtensionOpenDownloadUrl(u); }',
    '    });',
    '    var fakeWin = {',
    '      closed: false,',
    '      focus: function () {},',
    '      blur: function () {},',
    '      close: function () { this.closed = true; },',
    '      postMessage: function () {},',
    '      document: {',
    '        open: function () {},',
    '        write: function () {},',
    '        writeln: function () {},',
    '        close: function () {}',
    '      }',
    '    };',
    '    Object.defineProperty(fakeWin, "location", {',
    '      get: function () { return fakeLocation; },',
    '      set: function (u) { fakeLocation.href = u; }',
    '    });',
    '    return fakeWin;',
    '  }',
    '',
    '  var origWindowOpen = window.open;',
    '  window.open = function (url, target, features) {',
    '    if (!isBatchActive()) {',
    '      return origWindowOpen.apply(window, arguments);',
    '    }',
    '    var win = null;',
    '    try {',
    '      win = origWindowOpen.apply(window, arguments);',
    '    } catch (e) {',
    '      win = null;',
    '    }',
    '    // 若因第 2+ 页无用户手势导致浏览器拦截了 window.open (返回 null)，立即使用代理对象并通过后台特权通道打开下载链接',
    '    if (!win) {',
    '      return createSyntheticWindowProxy(url);',
    '    }',
    '    return win;',
    '  };',
    '',
    '  var origFormSubmit = HTMLFormElement.prototype.submit;',
    '  HTMLFormElement.prototype.submit = function () {',
    '    try {',
    '      if (isBatchActive() && this.target === "_blank") {',
    '        var hasGesture = window.navigator && window.navigator.userActivation && window.navigator.userActivation.isActive;',
    '        if (!hasGesture) {',
    '          this.target = ensureHiddenDownloadIframe();',
    '        }',
    '      }',
    '    } catch (e) {}',
    '    return origFormSubmit.apply(this, arguments);',
    '  };',
    '',
    '  var origAnchorClick = HTMLAnchorElement.prototype.click;',
    '  HTMLAnchorElement.prototype.click = function () {',
    '    try {',
    '      if (isBatchActive() && this.target === "_blank") {',
    '        var href = this.getAttribute("href") || this.href || "";',
    '        var hasGesture = window.navigator && window.navigator.userActivation && window.navigator.userActivation.isActive;',
    '        if (!hasGesture && href && href.indexOf("javascript:") !== 0 && href.indexOf("/advanced/") === -1) {',
    '          this.target = ensureHiddenDownloadIframe();',
    '        }',
    '      }',
    '    } catch (e) {}',
    '    return origAnchorClick.apply(this, arguments);',
    '  };',
    '})();',
  ];
  return lines.join('\n') + '\n';
}

export function generateBackgroundJs(settings: AppSettings): string {
  const folderName =
    settings.downloadDir
      .replace(/^[A-Za-z]:\\/, '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '') || 'PKULaw_Downloads';

  const lines = [
    '// ============================================================================',
    '// 北大法宝批量下载助手 - Chrome / Edge Manifest V3 后台服务 (background.js v3.3.0)',
    '// 功能：1. 安装或重载扩展时立即向已打开的北大法宝标签页注入 page_hook.js 与 content.js',
    '//       2. 提供特权后台下载通道 (PKULAW_FORCE_OPEN_DOWNLOAD_URL)，突破第 2+ 页浏览器异步弹窗拦截',
    '//       3. 自动归档 pkulaw.com 下载的原始压缩包至浏览器默认“下载/Downloads”目录下的子文件夹',
    '// ============================================================================',
    '',
    'let startedCounter = 0;',
    'let downloadCounter = 0;',
    'let lastDownloadItemId = null;',
    'const DEFAULT_SUBFOLDER = ' + JSON.stringify(folderName) + ';',
    '',
    '// 记录当前正在执行批量下载的主检索标签页与新弹出的临时下载窗口/标签页',
    'const batchState = {',
    '  active: false,',
    '  mainTabId: null,',
    '  mainWindowId: null,',
    '  lastActiveTimestamp: 0',
    '};',
    'const trackedDownloadTabIds = new Set();',
    '',
    'function refocusMainSearchTab() {',
    '  if (!batchState.mainTabId) return;',
    '  try {',
    '    chrome.tabs.update(batchState.mainTabId, { active: true }).catch(() => {});',
    '    if (batchState.mainWindowId) {',
    '      chrome.windows.update(batchState.mainWindowId, { focused: true }).catch(() => {});',
    '    }',
    '  } catch (e) {}',
    '}',
    '',
    'function closeTrackedDownloadTabs(delayMs) {',
    '  const wait = typeof delayMs === "number" ? delayMs : 650;',
    '  setTimeout(() => {',
    '    const ids = Array.from(trackedDownloadTabIds);',
    '    ids.forEach((tabId) => {',
    '      if (tabId && tabId !== batchState.mainTabId) {',
    '        trackedDownloadTabIds.delete(tabId);',
    '        chrome.tabs.remove(tabId).catch(() => {});',
    '      }',
    '    });',
    '    refocusMainSearchTab();',
    '  }, wait);',
    '}',
    '',
    'function injectScriptsIntoTab(tabId) {',
    '  if (!tabId || !chrome.scripting) return;',
    '  chrome.scripting.executeScript({',
    '    target: { tabId: tabId, allFrames: true },',
    '    files: ["page_hook.js"],',
    '    world: "MAIN"',
    '  }).catch(() => {});',
    '  chrome.scripting.executeScript({',
    '    target: { tabId: tabId, allFrames: true },',
    '    files: ["content.js"]',
    '  }).catch(() => {});',
    '}',
    '',
    'function injectIntoOpenPkulawTabs() {',
    '  try {',
    '    if (!chrome.tabs || !chrome.scripting) return;',
    '    chrome.tabs.query({ url: ["*://*.pkulaw.com/*", "*://pkulaw.com/*"] }, (tabs) => {',
    '      if (chrome.runtime.lastError || !tabs) return;',
    '      tabs.forEach((tab) => {',
    '        if (tab && tab.id) {',
    '          injectScriptsIntoTab(tab.id);',
    '        }',
    '      });',
    '    });',
    '  } catch (e) {',
    '    console.warn("[PKULaw Ext] injectIntoOpenPkulawTabs error:", e);',
    '  }',
    '}',
    '',
    'chrome.runtime.onInstalled.addListener(() => {',
    '  injectIntoOpenPkulawTabs();',
    '});',
    '',
    'if (chrome.action && chrome.action.onClicked) {',
    '  chrome.action.onClicked.addListener((tab) => {',
    '    if (tab && tab.id && tab.url && tab.url.includes("pkulaw.com")) {',
    '      injectScriptsIntoTab(tab.id);',
    '    } else {',
    '      chrome.tabs.create({ url: "https://www.pkulaw.com/law" });',
    '    }',
    '  });',
    '}',
    '',
    '// 监听来自 content.js 的主检索页注册、打开下载目录与新开下载窗口管理请求',
    'chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {',
    '  if (!msg || !msg.type) return false;',
    '  if (msg.type === "PKULAW_SET_BATCH_ACTIVE") {',
    '    batchState.active = Boolean(msg.active);',
    '    if (sender && sender.tab && sender.tab.id) {',
    '      batchState.mainTabId = sender.tab.id;',
    '      batchState.mainWindowId = sender.tab.windowId;',
    '      if (batchState.active && chrome.scripting) {',
    '        chrome.scripting.executeScript({',
    '          target: { tabId: sender.tab.id, allFrames: true },',
    '          files: ["page_hook.js"],',
    '          world: "MAIN"',
    '        }).catch(() => {});',
    '      }',
    '    }',
    '    batchState.lastActiveTimestamp = Date.now();',
    '    sendResponse({ ok: true, mainTabId: batchState.mainTabId });',
    '    return true;',
    '  }',
    '  if (msg.type === "PKULAW_TOUCH_BATCH_HEARTBEAT") {',
    '    batchState.active = true;',
    '    if (sender && sender.tab && sender.tab.id) {',
    '      batchState.mainTabId = sender.tab.id;',
    '      batchState.mainWindowId = sender.tab.windowId;',
    '    }',
    '    batchState.lastActiveTimestamp = Date.now();',
    '    sendResponse({ ok: true });',
    '    return true;',
    '  }',
    '  if (msg.type === "PKULAW_FORCE_OPEN_DOWNLOAD_URL") {',
    '    const targetUrl = msg.url ? String(msg.url).trim() : "";',
    '    if (targetUrl && targetUrl.startsWith("http")) {',
    '      batchState.lastActiveTimestamp = Date.now();',
    '      chrome.tabs.create({ url: targetUrl, active: false }, (createdTab) => {',
    '        if (createdTab && createdTab.id) {',
    '          trackedDownloadTabIds.add(createdTab.id);',
    '          setTimeout(() => {',
    '            if (trackedDownloadTabIds.has(createdTab.id)) {',
    '              trackedDownloadTabIds.delete(createdTab.id);',
    '              chrome.tabs.remove(createdTab.id).catch(() => {});',
    '              refocusMainSearchTab();',
    '            }',
    '          }, 25000);',
    '        }',
    '      });',
    '    }',
    '    sendResponse({ ok: true });',
    '    return true;',
    '  }',
    '  if (msg.type === "PKULAW_OPEN_DOWNLOADS_FOLDER") {',
    '    try {',
    '      if (lastDownloadItemId !== null && chrome.downloads && chrome.downloads.show) {',
    '        chrome.downloads.show(lastDownloadItemId);',
    '      } else if (chrome.downloads && chrome.downloads.showDefaultFolder) {',
    '        chrome.downloads.showDefaultFolder();',
    '      }',
    '    } catch (e) {',
    '      if (chrome.downloads && chrome.downloads.showDefaultFolder) {',
    '        chrome.downloads.showDefaultFolder();',
    '      }',
    '    }',
    '    sendResponse({ ok: true });',
    '    return true;',
    '  }',
    '  if (msg.type === "PKULAW_CLOSE_AUX_DOWNLOAD_TAB") {',
    '    closeTrackedDownloadTabs(msg.delayMs || 650);',
    '    sendResponse({ ok: true });',
    '    return true;',
    '  }',
    '  return false;',
    '});',
    '',
    '// 核心机制：当北大法宝每次下载弹出新标签页或新窗口时，立即将焦点切回原检索标签页，',
    '// 但保持该下载标签页在后台存活以完成服务端 ZIP 打包，直到 chrome.downloads.onCreated 收到文件流后再关闭！',
    'chrome.tabs.onCreated.addListener((tab) => {',
    '  try {',
    '    const isRecentBatch = batchState.active && (Date.now() - batchState.lastActiveTimestamp < 180000);',
    '    if (!isRecentBatch || !batchState.mainTabId) return;',
    '    if (tab.id === batchState.mainTabId) return;',
    '',
    '    const openedByMain = (tab.openerTabId === batchState.mainTabId);',
    '    const veryRecentAction = (Date.now() - batchState.lastActiveTimestamp < 30000);',
    '    if (openedByMain || veryRecentAction) {',
    '      trackedDownloadTabIds.add(tab.id);',
    '      // 1. 立即将焦点切回原检索标签页，避免界面停留在新弹出的空白/下载页',
    '      setTimeout(() => {',
    '        refocusMainSearchTab();',
    '      }, 150);',
    '      // 2. 宽松安全超时兜底（25秒）：给足北大法宝服务端打包生成 ZIP 的时间，正常情况下会在 onCreated 触发后 650ms 内提前关闭',
    '      setTimeout(() => {',
    '        if (trackedDownloadTabIds.has(tab.id)) {',
    '          trackedDownloadTabIds.delete(tab.id);',
    '          chrome.tabs.remove(tab.id).catch(() => {});',
    '          refocusMainSearchTab();',
    '        }',
    '      }, 25000);',
    '    }',
    '  } catch (e) {',
    '    console.warn("[PKULaw Ext] tabs.onCreated handler error:", e);',
    '  }',
    '});',
    '',
    '// 当浏览器真正开始接收北大法宝下载文件流（Ctrl+J 产生下载任务）时，通知主页面并关闭临时下载窗口',
    'if (chrome.downloads && chrome.downloads.onCreated) {',
    '  chrome.downloads.onCreated.addListener((item) => {',
    '    try {',
    '      const url = ((item.url || "") + " " + (item.referrer || "") + " " + (item.finalUrl || "")).toLowerCase();',
    '      const isPkulawDownload = url.includes("pkulaw.com") || (batchState.active && (Date.now() - batchState.lastActiveTimestamp < 60000));',
    '      if (isPkulawDownload) {',
    '        startedCounter += 1;',
    '        lastDownloadItemId = item.id;',
    '        closeTrackedDownloadTabs(650);',
    '        chrome.tabs.query({ url: ["*://*.pkulaw.com/*", "*://pkulaw.com/*"] }, (tabs) => {',
    '          if (chrome.runtime.lastError || !tabs) return;',
    '          tabs.forEach((tab) => {',
    '            if (tab && tab.id) {',
    '              chrome.tabs.sendMessage(tab.id, {',
    '                type: "PKULAW_DOWNLOAD_STARTED",',
    '                downloadId: item.id,',
    '                totalStarted: startedCounter',
    '              }).catch(() => {});',
    '            }',
    '          });',
    '        });',
    '      }',
    '    } catch (e) {}',
    '  });',
    '}',
    '',
    'chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {',
    '  try {',
    '    const url = ((item.url || "") + " " + (item.referrer || "") + " " + (item.finalUrl || "")).toLowerCase();',
    '    const isPkulawDownload = url.includes("pkulaw.com") || (batchState.active && (Date.now() - batchState.lastActiveTimestamp < 60000));',
    '    if (isPkulawDownload) {',
    '      lastDownloadItemId = item.id;',
    '      closeTrackedDownloadTabs(550);',
    '      chrome.storage.local.get(["subfolderName", "enableSubfolder"], (res) => {',
    '        const useSub = res && res.enableSubfolder !== false;',
    '        const rawFolder = (res && res.subfolderName) ? res.subfolderName : DEFAULT_SUBFOLDER;',
    '        const folder = String(rawFolder).replace(/[^a-zA-Z0-9_\\u4e00-\\u9fa5\\-]/g, "_");',
    '        const cleanFilename = (item.filename || "pkulaw_batch.zip").replace(/^[\\\\/]+/, "");',
    '        if (useSub && folder) {',
    '          suggest({',
    '            filename: folder + "/" + cleanFilename,',
    '            conflictAction: "uniquify"',
    '          });',
    '        } else {',
    '          suggest({ filename: cleanFilename, conflictAction: "uniquify" });',
    '        }',
    '      });',
    '      return true;',
    '    }',
    '  } catch (err) {',
    '    console.warn("[PKULaw Ext] onDeterminingFilename error:", err);',
    '  }',
    '  return false;',
    '});',
    '',
    'chrome.downloads.onChanged.addListener((delta) => {',
    '  if (delta.state && delta.state.current === "complete") {',
    '    chrome.downloads.search({ id: delta.id }, (items) => {',
    '      if (items && items[0]) {',
    '        const item = items[0];',
    '        const url = ((item.url || "") + " " + (item.referrer || "") + " " + (item.finalUrl || "")).toLowerCase();',
    '        if (url.includes("pkulaw.com") || batchState.active) {',
    '          downloadCounter += 1;',
    '          lastDownloadItemId = item.id;',
    '          closeTrackedDownloadTabs(250);',
    '          chrome.tabs.query({ url: ["*://*.pkulaw.com/*", "*://pkulaw.com/*"] }, (tabs) => {',
    '            if (chrome.runtime.lastError || !tabs) return;',
    '            tabs.forEach((tab) => {',
    '              if (tab.id) {',
    '                chrome.tabs.sendMessage(tab.id, {',
    '                  type: "PKULAW_DOWNLOAD_COMPLETED",',
    '                  filename: item.filename,',
    '                  totalCompleted: downloadCounter',
    '                }).catch(() => {});',
    '              }',
    '            });',
    '          });',
    '        }',
    '      }',
    '    });',
    '  }',
    '});',
  ];

  return lines.join('\n') + '\n';
}

export function generateContentJs(settings: AppSettings): string {
  const folderName =
    settings.downloadDir
      .replace(/^[A-Za-z]:\\/, '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '') || 'PKULaw_Downloads';

  return `// ==UserScript==
// @name         北大法宝法律法规批量下载助手 (Edge & Chrome 网页端自动化扩展 v3.3.0)
// @namespace    https://www.pkulaw.com/
// @version      3.3.0
// @description  在北大法宝官网底部注入动态进度条：支持第2+页精确同步全文格式与单次防重确认、1~2秒极速翻页间隔，将各页原始压缩包保存至下载目录。
// @author       PKULAW Batch Archiver
// @match        https://www.pkulaw.com/*
// @match        https://*.pkulaw.com/*
// @match        http://www.pkulaw.com/*
// @match        http://*.pkulaw.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  function isTopPkulawFrame() {
    if (window === window.top) return true;
    try {
      return !window.parent.location.hostname.includes('pkulaw.com');
    } catch (e) {
      return true;
    }
  }

  if (!isTopPkulawFrame()) return;

  if (window.__PKULAW_EXT_INTERVAL__) {
    clearInterval(window.__PKULAW_EXT_INTERVAL__);
  }
  const legacyIframe = document.getElementById('pkulaw_batch_dl_iframe');
  if (legacyIframe && legacyIframe.parentNode) {
    legacyIframe.parentNode.removeChild(legacyIframe);
  }
  window.__PKULAW_BATCH_EXT_LOADED__ = true;

  // --------------------------------------------------------------------------
  // 1. 默认配置与持久化状态 (sessionStorage + localStorage)
  // --------------------------------------------------------------------------
  const STORAGE_KEY = 'pkulaw_batch_ext_config_v2';
  const SESSION_KEY = 'pkulaw_batch_ext_session_v2';
  const ACTIVE_BATCH_LOCK_KEY = 'pkulaw_batch_active_lock_v29';

  const defaultConfig = {
    subfolderName: ${JSON.stringify(folderName)},
    minDelaySec: ${Number(settings.minDelaySec) || 1.0},
    maxDelaySec: ${Number(settings.maxDelaySec) || 2.0},
    delayMigratedV33: true,
    keepAdvSearchSameTab: true,
    interceptDownloadNewWindow: true,
    hasConfiguredFirstDownload: true,
    lastChosenFormat: '纯净版'
  };

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Object.assign({}, defaultConfig);
      const parsed = JSON.parse(raw);
      // 自动将旧版默认的 4.5s~8.5s 升级为极速 1.0s~2.0s 随机等待间隔
      if (!parsed.delayMigratedV33 && (parsed.minDelaySec === 4.5 || !parsed.minDelaySec)) {
        parsed.minDelaySec = 1.0;
        parsed.maxDelaySec = 2.0;
        parsed.delayMigratedV33 = true;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign({}, defaultConfig, parsed)));
      }
      return Object.assign({}, defaultConfig, parsed);
    } catch (e) {
      return Object.assign({}, defaultConfig);
    }
  }

  function saveConfig(partial) {
    try {
      const next = Object.assign(loadConfig(), partial, { delayMigratedV33: true });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ subfolderName: next.subfolderName });
      }
      return next;
    } catch (e) {
      return defaultConfig;
    }
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw
        ? JSON.parse(raw)
        : {
            manualLoginConfirmed: false,
            manualSearchConfirmed: false,
            isMainSearchTab: false,
            resumeDownloading: false,
            currentPage: 1,
            totalPages: 1,
            downloadedBatches: 0,
            chosenFormat: ''
          };
    } catch (e) {
      return { manualLoginConfirmed: false, manualSearchConfirmed: false };
    }
  }

  function saveSession(partial) {
    try {
      const next = Object.assign(loadSession(), partial);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      return next;
    } catch (e) {
      return {};
    }
  }

  function touchBatchLock(active) {
    try {
      if (active) {
        localStorage.setItem(ACTIVE_BATCH_LOCK_KEY, String(Date.now()));
        document.documentElement.setAttribute('data-pkulaw-batch-active', 'true');
      } else {
        localStorage.removeItem(ACTIVE_BATCH_LOCK_KEY);
        document.documentElement.setAttribute('data-pkulaw-batch-active', 'false');
      }
    } catch (e) {}
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: active ? 'PKULAW_TOUCH_BATCH_HEARTBEAT' : 'PKULAW_SET_BATCH_ACTIVE',
          active: Boolean(active)
        }).catch(function () {});
      }
    } catch (e) {}
  }

  let config = loadConfig();
  let session = loadSession();

  let state = {
    stage: 'login_stage', // 'login_stage' | 'search_stage' | 'download_ready' | 'waiting_format_choice' | 'downloading' | 'captcha_paused' | 'completed'
    domLoggedIn: false,
    everDetectedLoggedIn: Boolean(session.manualLoginConfirmed),
    domLoginBtnText: '',
    domUserText: '',
    domHasResults: false,
    detectedTotalCount: 0,
    pageSize: 20,
    currentPage: session.currentPage || 1,
    totalPages: session.totalPages || 1,
    downloadedBatches: session.downloadedBatches || 0,
    startedDownloadsCount: 0,
    completedZipFiles: 0,
    lastDownloadStartTimestamp: 0,
    chosenFormat: session.chosenFormat || config.lastChosenFormat || '纯净版',
    recordedConfirmBtn: null,
    recordedConfirmRawTarget: null,
    recordedConfirmText: '',
    recordedConfirmModalRoot: null,
    recordedUserModalClicks: [],
    recordedModalInputsState: [],
    lastOpenModalHtml: '',
    eventTrace: [],
    statusMessage: '',
    refreshInfoText: '',
    countdownSec: 0,
    showSettingsModal: false,
    showDiagModal: false,
    lastDiagJson: '',
    diagCopiedBanner: false,
    stopRequested: false,
    loopRunning: false
  };

  function pushTrace(step, detail) {
    try {
      const ts = new Date().toISOString().slice(11, 23);
      state.eventTrace.push(ts + ' [' + step + '] ' + (detail ? String(detail).slice(0, 120) : ''));
      if (state.eventTrace.length > 50) {
        state.eventTrace.shift();
      }
    } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // 2. 真实下载流握手与新下载窗口管理（含 MAIN 世界拦截桥接，严禁在文件流开始前提前强杀窗口）
  // --------------------------------------------------------------------------
  let pendingDownloadWaiters = [];

  function notifyDownloadStarted() {
    state.lastDownloadStartTimestamp = Date.now();
    while (pendingDownloadWaiters.length > 0) {
      const resolveFn = pendingDownloadWaiters.shift();
      try {
        resolveFn(true);
      } catch (e) {}
    }
  }

  function waitForRealDownloadSignal(timeoutMs) {
    const maxWait = typeof timeoutMs === 'number' ? timeoutMs : 9500;
    const startTs = Date.now();
    if (Date.now() - state.lastDownloadStartTimestamp < 1200) {
      return Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      let settled = false;
      const waiter = function (ok) {
        if (!settled) {
          settled = true;
          resolve(Boolean(ok));
        }
      };
      pendingDownloadWaiters.push(waiter);
      setTimeout(function () {
        if (!settled) {
          settled = true;
          const idx = pendingDownloadWaiters.indexOf(waiter);
          if (idx !== -1) pendingDownloadWaiters.splice(idx, 1);
          resolve(Date.now() - startTs >= maxWait ? false : true);
        }
      }, maxWait);
    });
  }

  function requestOpenBrowserDownloadsFolder() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'PKULAW_OPEN_DOWNLOADS_FOLDER' }).catch(function () {});
      }
    } catch (e) {}
  }

  // 监听来自 page_hook.js (MAIN 世界) 捕获的被浏览器拦截的异步下载 URL，交由后台特权标签页静默打开
  window.addEventListener('message', function (event) {
    try {
      const data = event && event.data;
      if (!data || data.source !== 'PKULAW_EXT_MAIN_HOOK') return;
      if (data.type === 'PKULAW_FORCE_OPEN_URL' && data.url) {
        pushTrace('main_hook_open_url', data.url);
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            type: 'PKULAW_FORCE_OPEN_DOWNLOAD_URL',
            url: String(data.url)
          }).catch(function () {});
        }
      }
    } catch (e) {}
  });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg || !msg.type) return;
      if (msg.type === 'PKULAW_DOWNLOAD_STARTED') {
        state.startedDownloadsCount = msg.totalStarted || (state.startedDownloadsCount + 1);
        pushTrace('dl_started', 'count=' + state.startedDownloadsCount + ', stage=' + state.stage);
        notifyDownloadStarted();
        // 自愈闭环保障：若第 1 页用户在弹窗中触发下载后，浏览器已产生真实下载流但当前仍停留在 waiting_format_choice，立即自动推进到翻页循环！
        if ((state.stage === 'waiting_format_choice' || state.stage === 'download_ready') && !state.loopRunning && state.downloadedBatches === 0) {
          triggerFirstPageConfirmedAndStartLoop('auto_on_dl_started', findCustomDownloadModal(), state.recordedConfirmBtn, state.recordedConfirmRawTarget);
        } else {
          renderBar();
        }
      }
      if (msg.type === 'PKULAW_DOWNLOAD_COMPLETED') {
        state.completedZipFiles = msg.totalCompleted || (state.completedZipFiles + 1);
        pushTrace('dl_completed', 'count=' + state.completedZipFiles + ', stage=' + state.stage);
        notifyDownloadStarted();
        if ((state.stage === 'waiting_format_choice' || state.stage === 'download_ready') && !state.loopRunning && state.downloadedBatches === 0) {
          triggerFirstPageConfirmedAndStartLoop('auto_on_dl_completed', findCustomDownloadModal(), state.recordedConfirmBtn, state.recordedConfirmRawTarget);
        } else {
          renderBar();
        }
      }
    });
  }

  function checkIfAuxiliaryDownloadPopupTab() {
    try {
      const lockTime = parseInt(localStorage.getItem(ACTIVE_BATCH_LOCK_KEY) || '0', 10);
      const isBatchRunningElsewhere = lockTime > 0 && (Date.now() - lockTime < 120000) && !session.isMainSearchTab;
      const urlLower = window.location.href.toLowerCase();
      const isDownloadEndpoint =
        urlLower.includes('download') ||
        urlLower.includes('export') ||
        urlLower.includes('downrecord') ||
        urlLower.includes('zip');

      if (isBatchRunningElsewhere && (Boolean(window.opener) || isDownloadEndpoint)) {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.focus();
          }
        } catch (e) {}
        setTimeout(function () {
          try {
            window.close();
          } catch (e) {}
        }, 22000);
        return true;
      }
    } catch (e) {}
    return false;
  }

  // --------------------------------------------------------------------------
  // 3. 拦截「高级检索」target="_blank"，使其在当前标签页内直接打开
  // --------------------------------------------------------------------------
  function interceptSameTabNavigation() {
    if (!config.keepAdvSearchSameTab) return;
    const links = document.querySelectorAll('a[target="_blank"]');
    for (let i = 0; i < links.length; i++) {
      const a = links[i];
      const href = (a.getAttribute('href') || '').trim();
      const text = (a.textContent || '').trim();
      if (
        text.includes('高级检索') ||
        href.includes('/advanced/') ||
        href.includes('pkulaw.com/advanced')
      ) {
        a.setAttribute('target', '_self');
      }
    }
  }

  document.addEventListener(
    'click',
    function (e) {
      const target = e.target;
      const anchor = target && target.closest ? target.closest('a') : null;
      if (!anchor) return;
      const href = (anchor.getAttribute('href') || '').trim();
      const text = (anchor.textContent || '').trim();
      if (
        config.keepAdvSearchSameTab &&
        (text.includes('高级检索') ||
          href.includes('/advanced/') ||
          href.includes('pkulaw.com/advanced'))
      ) {
        anchor.setAttribute('target', '_self');
      }
    },
    true
  );

  // --------------------------------------------------------------------------
  // 4. 北大法宝 V6 (/law 与 /advanced/law) 工具栏、全选框与列表复选框引擎
  // --------------------------------------------------------------------------
  function isVisible(el, allowZeroOpacityInput) {
    if (!el || !el.getBoundingClientRect) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    if (!allowZeroOpacityInput && parseFloat(style.opacity) === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function hasDownloadSemantics(el) {
    if (!el || !el.getAttribute) return false;
    const rawCls = String(el.className || '');
    // 严禁将包含多个工具图标的外层容器 .batch-container 误判为单个下载按钮
    if (rawCls.includes('batch-container') || rawCls.includes('el-table')) return false;

    const title = (
      (el.getAttribute('title') || '') +
      ' ' +
      (el.getAttribute('data-title') || '') +
      ' ' +
      (el.getAttribute('aria-label') || '') +
      ' ' +
      (el.getAttribute('alt') || '') +
      ' ' +
      (el.getAttribute('data-original-title') || '')
    ).trim();
    if (title.includes('下载') || title.includes('导出')) return true;

    const selfCls = (
      rawCls +
      ' ' +
      (el.id || '') +
      ' ' +
      (el.getAttribute('onclick') || '') +
      ' ' +
      (el.getAttribute('href') || '')
    ).toLowerCase();
    if (
      selfCls.includes('left-download') ||
      selfCls.includes('qikan_xiazai') ||
      selfCls.includes('download') ||
      selfCls.includes('down-load') ||
      selfCls.includes('batchdown') ||
      selfCls.includes('xiazai') ||
      selfCls.includes('icon-down') ||
      selfCls.includes('icon_down')
    ) {
      return true;
    }
    return false;
  }

  function findRawDownloadIconsOrButtons() {
    const nodes = document.querySelectorAll(
      'p.left-downLoad, [class*="left-downLoad"], i.icon-qikan_xiazai, i[class*="xiazai" i], i[class*="download" i], a[title*="下载"], button[title*="下载"], span[title*="下载"], p, a, button, span, i'
    );
    const matches = [];
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.closest && el.closest('#pkulaw-ext-root')) continue;
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 120 || r.height > 60) continue;
      const txt = (el.textContent || '').replace(/\\s+/g, '');
      const cls = String(el.className || '').toLowerCase();
      if (cls.includes('batch-container')) continue;
      if (
        txt === '批量下载' ||
        cls.includes('left-download') ||
        cls.includes('qikan_xiazai') ||
        cls.includes('xiazai') ||
        cls.includes('batchdown') ||
        (el.getAttribute('title') || '').includes('批量下载') ||
        (el.getAttribute('title') || '') === '下载'
      ) {
        matches.push(el);
      }
    }
    matches.sort(function (a, b) {
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });
    return matches;
  }

  function findResultsToolbar() {
    const candidates = document.querySelectorAll('div, ul, section, header');
    let seedEl = null;
    let smallestSeedArea = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.closest && el.closest('#pkulaw-ext-root')) continue;
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 180 || rect.height < 18 || rect.height > 120) continue;
      const txt = (el.innerText || '').replace(/\\s+/g, ' ');
      const hasToolbarKeywords =
        (txt.includes('分组') && (txt.includes('排序') || txt.includes('条/页'))) ||
        (/共\\s*[0-9,]+\\s*(篇|条)/.test(txt) &&
          (txt.includes('分组') ||
            txt.includes('排序') ||
            txt.includes('条/页') ||
            txt.includes('全选') ||
            txt.includes('批量') ||
            txt.includes('下载'))) ||
        (txt.includes('全选') &&
          (txt.includes('批量下载') || txt.includes('下载') || txt.includes('导出') || txt.includes('排序')));
      if (hasToolbarKeywords) {
        const area = rect.width * rect.height;
        if (area < smallestSeedArea) {
          smallestSeedArea = area;
          seedEl = el;
        }
      }
    }

    // 策略 2：针对 /advanced/law (Vue V6)，通过批量下载图标 (如 icon-qikan_xiazai) 向上反向锚定工具栏行容器
    if (!seedEl) {
      const dlMatches = findRawDownloadIconsOrButtons();
      for (let i = 0; i < dlMatches.length; i++) {
        const dlIcon = dlMatches[i];
        let p = dlIcon.parentElement;
        while (p && p !== document.body) {
          if (isVisible(p)) {
            const pr = p.getBoundingClientRect();
            if (pr.width >= 260 && pr.height >= 20 && pr.height <= 115) {
              const hasCheckboxOrIconSibling =
                p.querySelectorAll('input[type="checkbox"], .el-checkbox, .layui-form-checkbox, i.iconfont, label').length >= 2;
              if (hasCheckboxOrIconSibling) {
                seedEl = p;
                break;
              }
            }
          }
          p = p.parentElement;
        }
        if (seedEl) break;
      }
    }

    if (!seedEl) return null;

    let current = seedEl;
    while (current && current.parentElement && current.parentElement !== document.body) {
      const parent = current.parentElement;
      if (!isVisible(parent)) break;
      const pRect = parent.getBoundingClientRect();
      if (pRect.height >= 20 && pRect.height <= 118 && pRect.width >= current.getBoundingClientRect().width) {
        current = parent;
      } else {
        break;
      }
    }
    return current;
  }

  function getCheckboxVisibleRect(node) {
    if (!node) return null;
    if (node.getBoundingClientRect) {
      const r0 = node.getBoundingClientRect();
      if (r0.width > 0 && r0.height > 0) return r0;
    }
    if (node.previousElementSibling && node.previousElementSibling.getBoundingClientRect) {
      const rPrev = node.previousElementSibling.getBoundingClientRect();
      if (rPrev.width > 0 && rPrev.height > 0) return rPrev;
    }
    if (node.nextElementSibling && node.nextElementSibling.getBoundingClientRect) {
      const rNext = node.nextElementSibling.getBoundingClientRect();
      if (rNext.width > 0 && rNext.height > 0) return rNext;
    }
    if (node.closest) {
      const wrap = node.closest('label, .el-checkbox, .ant-checkbox, .layui-form-checkbox, span, div');
      if (wrap && wrap.getBoundingClientRect) {
        const rWrap = wrap.getBoundingClientRect();
        if (rWrap.width > 0 && rWrap.height > 0) return rWrap;
      }
    }
    if (node.parentElement && node.parentElement.getBoundingClientRect) {
      const rPar = node.parentElement.getBoundingClientRect();
      if (rPar.width > 0 && rPar.height > 0) return rPar;
    }
    return null;
  }

  function findResultItemCheckboxes() {
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const toolbar = findResultsToolbar();
    const tbRect = toolbar ? toolbar.getBoundingClientRect() : null;
    const minDocTop = tbRect ? tbRect.bottom + scrollY - 8 : 140;

    // 1. 优先扫描所有原生 input[type="checkbox"]（使用文档绝对纵坐标 itemDocTop，即使页面滚动到底部也能完整识别全部 20/50 个复选框）
    const allInputs = document.querySelectorAll('input[type="checkbox"]');
    const inputCandidates = [];
    for (let i = 0; i < allInputs.length; i++) {
      const inp = allInputs[i];
      if (inp.closest && inp.closest('#pkulaw-ext-root, .el-dialog, .layui-layer, .ant-modal, .modal')) continue;
      if (toolbar && toolbar.contains(inp)) continue;
      const r = getCheckboxVisibleRect(inp);
      if (!r) continue;
      const itemDocTop = r.top + scrollY;
      if (itemDocTop >= minDocTop && r.left >= 30 && r.left <= window.innerWidth - 80) {
        inputCandidates.push({ node: inp, rect: r });
      }
    }

    if (inputCandidates.length > 0) {
      // 按近似左坐标分桶，找出竖向排列成一列的结果列表复选框（排除高级检索条件区的零散复选框）
      const buckets = {};
      let bestBucketArr = [];
      for (let i = 0; i < inputCandidates.length; i++) {
        const item = inputCandidates[i];
        const key = Math.round(item.rect.left / 16);
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(item.node);
        if (buckets[key].length > bestBucketArr.length) {
          bestBucketArr = buckets[key];
        }
      }
      if (bestBucketArr.length >= 1) {
        return bestBucketArr;
      }
    }

    // 2. 扫描 Vue / Layui / Iconfont 自定义复选框元素
    const customCandidates = document.querySelectorAll(
      '.el-checkbox, .ant-checkbox, .layui-form-checkbox, label.checkbox, span.checkbox, div.checkbox, i[class*="check" i], span[class*="check" i], div[class*="checkbox" i], i[class*="fuxuan" i], i[class*="xuanze" i], i[class*="xuanzhong" i], i[class*="duoxuan" i]'
    );
    const matchedCustom = [];
    for (let i = 0; i < customCandidates.length; i++) {
      const el = customCandidates[i];
      if (el.closest && el.closest('#pkulaw-ext-root, .el-dialog, .layui-layer, .ant-modal, .modal')) continue;
      if (toolbar && toolbar.contains(el)) continue;
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      const itemDocTop = r.top + scrollY;
      if (
        itemDocTop >= minDocTop &&
        r.left >= 30 &&
        r.left <= window.innerWidth - 80 &&
        r.width >= 10 &&
        r.width <= 46 &&
        r.height >= 10 &&
        r.height <= 42
      ) {
        const alreadyContained = matchedCustom.some(function (existing) {
          return existing.node.contains(el) || el.contains(existing.node);
        });
        if (!alreadyContained) {
          matchedCustom.push({ node: el, rect: r });
        }
      }
    }

    if (matchedCustom.length > 0) {
      const buckets = {};
      let bestBucketArr = [];
      for (let i = 0; i < matchedCustom.length; i++) {
        const item = matchedCustom[i];
        const key = Math.round(item.rect.left / 16);
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(item.node);
        if (buckets[key].length > bestBucketArr.length) {
          bestBucketArr = buckets[key];
        }
      }
      if (bestBucketArr.length > 0) return bestBucketArr;
    }

    return [];
  }

  function isCheckboxNodeChecked(node) {
    if (!node) return false;
    if (node.tagName === 'INPUT' && node.type === 'checkbox') {
      if (node.checked) return true;
    }
    const innerInput = node.querySelector ? node.querySelector('input[type="checkbox"]') : null;
    if (innerInput && innerInput.checked) return true;

    const checkClassList = function (el) {
      if (!el) return false;
      const cls = ((el.className || '') + ' ' + (el.getAttribute ? el.getAttribute('aria-checked') || '' : '')).toLowerCase();
      return (
        cls.includes('checked') ||
        cls.includes('layui-form-checked') ||
        cls.includes('is-checked') ||
        cls.includes('icon-xuanzhong') ||
        cls.includes('icon-yixuan') ||
        cls.includes('active') ||
        cls.includes('selected') ||
        cls === 'true'
      );
    };

    if (checkClassList(node)) return true;
    if (node.parentElement && checkClassList(node.parentElement)) return true;
    if (node.previousElementSibling && checkClassList(node.previousElementSibling)) return true;
    if (node.nextElementSibling && checkClassList(node.nextElementSibling)) return true;
    if (node.closest) {
      const wrap = node.closest('.el-checkbox, .ant-checkbox, .layui-form-checkbox, label');
      if (wrap && checkClassList(wrap)) return true;
    }
    return false;
  }

  function countCheckedResultItems() {
    const items = findResultItemCheckboxes();
    let count = 0;
    for (let i = 0; i < items.length; i++) {
      if (isCheckboxNodeChecked(items[i])) count++;
    }
    return { checked: count, total: items.length };
  }

  function findSelectAllCheckbox() {
    const toolbar = findResultsToolbar();
    const itemCbs = findResultItemCheckboxes();
    let refItemLeft = null;
    if (itemCbs.length > 0) {
      const fr = getCheckboxVisibleRect(itemCbs[0]);
      if (fr && fr.width > 0) refItemLeft = fr.left;
    }

    if (toolbar) {
      const tbRect = toolbar.getBoundingClientRect();
      const inputs = toolbar.querySelectorAll('input[type="checkbox"], .el-checkbox, .layui-form-checkbox');
      for (let i = 0; i < inputs.length; i++) {
        const inp = inputs[i];
        const r = getCheckboxVisibleRect(inp);
        if (r && r.width > 0 && r.left - tbRect.left < 220) {
          return inp;
        }
      }

      const leftNodes = toolbar.querySelectorAll('label, input, i, span, a, div');
      for (let i = 0; i < leftNodes.length; i++) {
        const node = leftNodes[i];
        if (!isVisible(node)) continue;
        const txt = (node.textContent || '').trim();
        if (txt.includes('共') || txt.includes('分组') || txt.includes('排序') || txt.includes('条/页')) continue;
        const r = node.getBoundingClientRect();
        if (r.left - tbRect.left > 180 || r.width > 80) continue;
        const cls = ((node.className || '') + ' ' + (node.id || '') + ' ' + (node.getAttribute('title') || '')).toLowerCase();
        if (
          cls.includes('check') ||
          cls.includes('all') ||
          cls.includes('choose') ||
          cls.includes('quanxuan') ||
          cls.includes('fuxuan') ||
          cls.includes('xuanze') ||
          cls.includes('全选') ||
          txt === '全选' ||
          node.tagName === 'LABEL'
        ) {
          return node;
        }
      }

      if (refItemLeft !== null && tbRect.top >= 0 && tbRect.bottom <= window.innerHeight) {
        const probeX = refItemLeft + 8;
        const probeY = tbRect.top + tbRect.height / 2;
        const hit = document.elementFromPoint(probeX, probeY);
        if (hit && toolbar.contains(hit) && hit !== toolbar) {
          const hitTxt = (hit.textContent || '').trim();
          if (!hitTxt.includes('共') && !hitTxt.includes('分组')) {
            return hit;
          }
        }
      }

      let leftmostIcon = null;
      let minLeft = Infinity;
      for (let i = 0; i < leftNodes.length; i++) {
        const node = leftNodes[i];
        if (!isVisible(node)) continue;
        const txt = (node.textContent || '').trim();
        if (txt.length > 2) continue;
        const r = node.getBoundingClientRect();
        if (
          r.left - tbRect.left >= 0 &&
          r.left - tbRect.left < 120 &&
          r.width >= 10 &&
          r.width <= 38 &&
          r.height >= 10 &&
          r.height <= 38
        ) {
          if (r.left < minLeft) {
            minLeft = r.left;
            leftmostIcon = node;
          }
        }
      }
      if (leftmostIcon) return leftmostIcon;
    }

    // 策略 2：若已定位到批量下载图标 (如 icon-qikan_xiazai)，在同一水平行左侧查找全选框或图标
    const dlMatches = findRawDownloadIconsOrButtons();
    if (dlMatches.length > 0) {
      const dlRect = dlMatches[0].getBoundingClientRect();
      const dlCy = dlRect.top + dlRect.height / 2;
      const rowCandidates = document.querySelectorAll(
        'input[type="checkbox"], .el-checkbox, .layui-form-checkbox, label, i.iconfont, span[class*="check" i], div[class*="check" i]'
      );
      let bestRowNode = null;
      let bestLeft = Infinity;
      for (let i = 0; i < rowCandidates.length; i++) {
        const node = rowCandidates[i];
        if (node.closest && node.closest('#pkulaw-ext-root')) continue;
        if (node === dlMatches[0] || node.contains(dlMatches[0]) || dlMatches[0].contains(node)) continue;
        const r = getCheckboxVisibleRect(node);
        if (!r || r.width === 0 || r.width > 90) continue;
        const cy = r.top + r.height / 2;
        if (Math.abs(cy - dlCy) <= 26 && r.left < dlRect.left - 8 && r.left >= 30) {
          if (r.left < bestLeft) {
            bestLeft = r.left;
            bestRowNode = node;
          }
        }
      }
      if (bestRowNode) return bestRowNode;
    }

    const labels = document.querySelectorAll('label, span, a, i, div.checkbox-all, .select-all, [title*="全选"]');
    for (let i = 0; i < labels.length; i++) {
      const el = labels[i];
      if (el.closest && el.closest('#pkulaw-ext-root')) continue;
      if (!isVisible(el)) continue;
      const txt = (el.textContent || el.getAttribute('title') || '').trim();
      if (txt === '全选' || txt.indexOf('全选') === 0) {
        return el;
      }
    }

    const direct = document.querySelector(
      '#selectAll, #checkAll, input.select-all, input[name="checkAll"], .tool-bar input[type="checkbox"], .batch-op input[type="checkbox"]'
    );
    return direct ? direct : null;
  }

  function findBatchDownloadButton() {
    // 1. 优先精确匹配北大法宝 V6 (/advanced/law/chl 与 /law) 工具栏上的批量下载按钮与图标（绝不匹配外层 .batch-container）
    const exactV6Selectors = [
      '.batch-container p.left-downLoad',
      '.batch-container [class*="left-downLoad"]',
      'p.left-downLoad',
      '[class*="left-downLoad"]',
      '.batch-container i.icon-qikan_xiazai',
      'i.icon-qikan_xiazai',
      'i[class*="qikan_xiazai"]'
    ];
    for (let i = 0; i < exactV6Selectors.length; i++) {
      const el = document.querySelector(exactV6Selectors[i]);
      if (el && (!el.closest || !el.closest('#pkulaw-ext-root')) && isVisible(el)) {
        return el;
      }
    }

    const toolbar = findResultsToolbar();

    if (toolbar) {
      const tbNodes = toolbar.querySelectorAll('p, a, button, span, i, li, div');
      for (let i = 0; i < tbNodes.length; i++) {
        const el = tbNodes[i];
        if (!isVisible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 110) continue;
        if (hasDownloadSemantics(el)) {
          return el;
        }
      }

      const selectAllEl = findSelectAllCheckbox();
      const cbRect = getCheckboxVisibleRect(selectAllEl);
      if (cbRect && cbRect.width > 0) {
        const cbCenterY = cbRect.top + cbRect.height / 2;
        let bestIcon = null;
        let bestDistX = Infinity;

        for (let i = 0; i < tbNodes.length; i++) {
          const el = tbNodes[i];
          if (el === selectAllEl || (selectAllEl && (el.contains(selectAllEl) || selectAllEl.contains(el)))) continue;
          if (!isVisible(el)) continue;
          const cls = String(el.className || '');
          if (cls.includes('batch-container')) continue;
          const r = el.getBoundingClientRect();
          const cy = r.top + r.height / 2;
          const distX = r.left - cbRect.right;
          if (
            r.width >= 10 &&
            r.width <= 58 &&
            r.height >= 10 &&
            r.height <= 48 &&
            Math.abs(cy - cbCenterY) <= 24 &&
            distX >= 1 &&
            distX <= 80
          ) {
            if (distX < bestDistX) {
              bestDistX = distX;
              bestIcon = el;
            }
          }
        }
        if (bestIcon) {
          return bestIcon;
        }
      }
    }

    const rawMatches = findRawDownloadIconsOrButtons();
    if (rawMatches.length > 0) {
      return rawMatches[0];
    }

    const candidates = document.querySelectorAll('p, a, button, span, i, li');
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.closest && el.closest('#pkulaw-ext-root')) continue;
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 120) continue;
      const txt = (el.textContent || '').replace(/\\s+/g, '');
      if (txt === '批量下载' || txt === '下载' || hasDownloadSemantics(el)) {
        return el;
      }
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // 5. 网页状态自动探测（文档绝对坐标防滚动丢失登录态 + 检索结果总篇数 + 每页条数）
  // --------------------------------------------------------------------------
  function detectPkulawDomState() {
    interceptSameTabNavigation();

    const scrollY = window.scrollY || window.pageYOffset || 0;
    let hasVisibleLoginBtn = false;
    let loginBtnSample = '';
    const headerCandidates = document.querySelectorAll('a, button, span, div.login, .header a, .top a, .nav a');
    for (let i = 0; i < headerCandidates.length; i++) {
      const el = headerCandidates[i];
      if (el.closest && el.closest('#pkulaw-ext-root')) continue;
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      const docTop = rect.top + scrollY;
      if (docTop > 220 || docTop < -10) continue;
      const txt = (el.textContent || '').replace(/\\s+/g, '');
      if (txt === '登录/注册' || txt === '登录|注册' || txt === '登录' || txt === '请登录') {
        hasVisibleLoginBtn = true;
        loginBtnSample = txt;
        break;
      }
    }

    let hasPositiveLoginIndicator = false;
    let userSample = '';
    const userSelectors = [
      '.user-name',
      '.login-user',
      '.user-info',
      '.org-name',
      'a[href*="logout"]',
      'a[href*="Logout"]',
      'a[href*="UserCenter"]',
      '.header-user'
    ];
    for (let i = 0; i < userSelectors.length; i++) {
      const el = document.querySelector(userSelectors[i]);
      if (el && isVisible(el)) {
        const t = (el.textContent || '').trim();
        if (t && !t.includes('登录/注册')) {
          hasPositiveLoginIndicator = true;
          userSample = t.slice(0, 24);
          break;
        }
      }
    }
    if (!hasPositiveLoginIndicator) {
      for (let i = 0; i < headerCandidates.length; i++) {
        const el = headerCandidates[i];
        if (el.closest && el.closest('#pkulaw-ext-root')) continue;
        if (!isVisible(el)) continue;
        const rect = el.getBoundingClientRect();
        const docTop = rect.top + scrollY;
        if (docTop > 220 || docTop < -10 || rect.left < 400) continue;
        const txt = (el.textContent || '').trim();
        if (
          txt === '退出' ||
          txt === '退出登录' ||
          txt === '个人中心' ||
          /^[0-9]{5,}\\.{2,}/.test(txt) ||
          /^1[3-9][0-9]{3,}/.test(txt)
        ) {
          hasPositiveLoginIndicator = true;
          userSample = txt.slice(0, 24);
          break;
        }
      }
    }

    if (!hasVisibleLoginBtn && hasPositiveLoginIndicator) {
      state.everDetectedLoggedIn = true;
      if (!session.manualLoginConfirmed) {
        session = saveSession({ manualLoginConfirmed: true });
      }
    }

    state.domLoginBtnText = loginBtnSample;
    if (userSample) state.domUserText = userSample;
    state.domLoggedIn =
      (!hasVisibleLoginBtn && hasPositiveLoginIndicator) ||
      Boolean(state.everDetectedLoggedIn) ||
      Boolean(session.manualLoginConfirmed);

    const toolbar = findResultsToolbar();
    const itemCheckboxes = findResultItemCheckboxes();
    const dlBtn = findBatchDownloadButton();

    const bodyText = document.body ? document.body.innerText : '';
    let totalCount = 0;
    const countPatterns = [
      /共\\s*([0-9,]+)\\s*篇/,
      /总共\\s*([0-9,]+)\\s*条/,
      /共\\s*([0-9,]+)\\s*条/,
      /找到相关结果约?\\s*([0-9,]+)\\s*条/,
      /检索结果[：:\\s]*([0-9,]+)\\s*条/
    ];
    // 优先从工具栏或结果统计节点读取法规总条数
    if (toolbar && toolbar.innerText) {
      for (let i = 0; i < countPatterns.length; i++) {
        const m = toolbar.innerText.match(countPatterns[i]);
        if (m && m[1]) {
          totalCount = parseInt(m[1].replace(/,/g, ''), 10) || 0;
          if (totalCount > 0) break;
        }
      }
    }
    if (totalCount === 0) {
      for (let i = 0; i < countPatterns.length; i++) {
        const m = bodyText.match(countPatterns[i]);
        if (m && m[1]) {
          totalCount = parseInt(m[1].replace(/,/g, ''), 10) || 0;
          if (totalCount > 0) break;
        }
      }
    }

    // 精确检测当前每页显示条数（支持用户临时修改 10/20/50/100 条/页 后实时读取）
    let detectedSize = 0;
    const sizeNodes = document.querySelectorAll(
      '.el-dropdown-link, .el-select input, .el-pagination__sizes input, .page-size, span, div, p, a, input'
    );
    for (let i = 0; i < sizeNodes.length; i++) {
      const node = sizeNodes[i];
      if (!node || (node.closest && node.closest('#pkulaw-ext-root, .el-dropdown-menu, .el-select-dropdown'))) continue;
      if (!isVisible(node)) continue;
      const raw = (node.tagName === 'INPUT' ? node.value : node.textContent) || '';
      const trimmed = raw.replace(/\\s+/g, '');
      if (trimmed.length > 0 && trimmed.length <= 12) {
        const sm = trimmed.match(/^([0-9]+)条\\/页/);
        if (sm && sm[1]) {
          const parsed = parseInt(sm[1], 10);
          if (parsed > 0 && parsed <= 200) {
            detectedSize = parsed;
            break;
          }
        }
      }
    }
    if (detectedSize === 0) {
      const pageSizeMatch = bodyText.match(/([0-9]+)\\s*条\\/页/);
      if (pageSizeMatch && pageSizeMatch[1]) {
        const parsedSize = parseInt(pageSizeMatch[1], 10);
        if (parsedSize > 0 && parsedSize <= 200) {
          detectedSize = parsedSize;
        }
      }
    }
    if (itemCheckboxes.length >= 5 && (detectedSize === 0 || itemCheckboxes.length > detectedSize)) {
      detectedSize = itemCheckboxes.length;
    }
    if (detectedSize > 0) {
      state.pageSize = detectedSize;
    }

    const hasResultItems =
      (toolbar !== null && totalCount > 0) ||
      (totalCount > 0 && itemCheckboxes.length > 0) ||
      (totalCount > 0 && dlBtn !== null);

    state.domHasResults = hasResultItems || Boolean(session.manualSearchConfirmed);
    if (totalCount > 0) {
      state.detectedTotalCount = totalCount;
      state.totalPages = Math.max(1, Math.ceil(totalCount / (state.pageSize || 20)));
    } else if (itemCheckboxes.length > 0 && state.detectedTotalCount === 0) {
      state.detectedTotalCount = itemCheckboxes.length;
      state.totalPages = 1;
    }

    // 严禁在批量下载循环进行中或已完成状态被重置回 login_stage / download_ready
    if (
      !state.loopRunning &&
      (state.stage === 'login_stage' || state.stage === 'search_stage' || state.stage === 'download_ready')
    ) {
      if (!state.domLoggedIn) {
        state.stage = 'login_stage';
      } else if (!state.domHasResults) {
        state.stage = 'search_stage';
      } else {
        state.stage = 'download_ready';
      }
    }
  }

  function refreshPageInfoAndDisplay() {
    detectPkulawDomState();
    const total = state.detectedTotalCount || 0;
    const size = state.pageSize || 20;
    state.refreshInfoText = '共检测到' + total + '条法规，每页显示' + size + '条';
    if (!state.loopRunning && state.domHasResults && (state.stage === 'waiting_format_choice' || state.stage === 'completed')) {
      state.stage = 'download_ready';
    }
    renderBar();
  }

  // --------------------------------------------------------------------------
  // 6. 「自定义下载」弹窗探测、第 1 页用户选项录制与第 2+ 页精确同步（彻底解决第 2+ 页下载成 Excel 目录列表与重复下载）
  // --------------------------------------------------------------------------
  function isDialogSubPart(el) {
    if (!el) return false;
    const cls = String(el.className || '');
    return /(__header|__body|__footer|-header|-body|-footer|-content|-title|-btn)\b/i.test(cls);
  }

  function hasModalFormatAndConfirmSemantics(el) {
    if (!el) return false;
    const txt = (el.innerText || '').replace(/\\s+/g, ' ');
    const hasFormat =
      txt.includes('自定义下载') ||
      txt.includes('请选择下载格式') ||
      txt.includes('下载格式') ||
      txt.includes('Word') ||
      txt.includes('纯文本') ||
      txt.includes('纯净版');
    const hasAction =
      txt.includes('确定') ||
      txt.includes('确认') ||
      txt.includes('取消') ||
      Boolean(el.querySelector && el.querySelector('button, .el-button, .layui-layer-btn0, input[type="button"], input[type="submit"], a[class*="btn" i]'));
    return hasFormat && hasAction;
  }

  function cacheModalHtmlSnapshot(modalEl) {
    if (!modalEl) return;
    try {
      state.lastOpenModalHtml = (modalEl.outerHTML || '').replace(/\\s+/g, ' ').trim().slice(0, 1600);
    } catch (e) {}
  }

  function findCustomDownloadModal() {
    // 0. 优先检查第 1 页用户点击时记录的弹窗根节点（若当前可见）
    if (
      state.recordedConfirmModalRoot &&
      document.body.contains(state.recordedConfirmModalRoot) &&
      isVisible(state.recordedConfirmModalRoot) &&
      (!state.recordedConfirmModalRoot.querySelector || !state.recordedConfirmModalRoot.querySelector('.el-table, .batch-container'))
    ) {
      cacheModalHtmlSnapshot(state.recordedConfirmModalRoot);
      return state.recordedConfirmModalRoot;
    }

    // 1. 优先匹配标准 UI 框架的对话框根节点（如 .el-dialog, .layui-layer, .el-message-box, .ant-modal, [role="dialog"]）
    const rootDialogSelectors = '.el-dialog, .layui-layer, .el-message-box, .ant-modal, [role="dialog"], .modal-dialog, .modal, .dialog, .popup';
    const rootDialogs = document.querySelectorAll(rootDialogSelectors);
    for (let i = 0; i < rootDialogs.length; i++) {
      const el = rootDialogs[i];
      if (el.closest && el.closest('#pkulaw-ext-root')) continue;
      if (isDialogSubPart(el)) continue;
      if (!isVisible(el)) continue;
      if (el.querySelector && el.querySelector('.el-table, .batch-container')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 180 || r.height < 100 || r.width > 1200) continue;
      if (hasModalFormatAndConfirmSemantics(el)) {
        cacheModalHtmlSnapshot(el);
        return el;
      }
    }

    // 2. 扫描通用弹窗容器，但自动向上提升到完整的对话框根节点
    const genericContainers = document.querySelectorAll(
      'div[class*="modal" i], div[class*="dialog" i], div[class*="layer" i], div[class*="pop" i]'
    );
    let bestModal = null;
    let smallestArea = Infinity;

    for (let i = 0; i < genericContainers.length; i++) {
      let el = genericContainers[i];
      if (el.closest && el.closest('#pkulaw-ext-root')) continue;
      if (isDialogSubPart(el)) {
        const promoted = el.closest ? el.closest('.el-dialog, .layui-layer, .el-message-box, .ant-modal, [role="dialog"], .modal, .dialog') : el.parentElement;
        if (promoted && promoted !== document.body) {
          el = promoted;
        } else {
          continue;
        }
      }
      if (!isVisible(el)) continue;
      if (el.querySelector && el.querySelector('.el-table, .batch-container')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 180 || r.height < 100 || r.width > 1200) continue;

      if (hasModalFormatAndConfirmSemantics(el)) {
        const area = r.width * r.height;
        if (area > 0 && area < smallestArea) {
          smallestArea = area;
          bestModal = el;
        }
      }
    }
    if (bestModal) {
      cacheModalHtmlSnapshot(bestModal);
      return bestModal;
    }

    // 3. XPath 向上回溯直至同时包含格式选项与「确定」按钮的外层对话框容器
    const xpath = "//*[contains(text(),'请选择下载格式') or contains(text(),'自定义下载')]";
    const snap = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < snap.snapshotLength; i++) {
      const node = snap.snapshotItem(i);
      if (node && (!node.closest || !node.closest('#pkulaw-ext-root')) && isVisible(node)) {
        let parent = node.parentElement;
        while (parent && parent !== document.body) {
          if (parent.querySelector && parent.querySelector('.el-table, .batch-container')) break;
          if (!isDialogSubPart(parent) && hasModalFormatAndConfirmSemantics(parent)) {
            cacheModalHtmlSnapshot(parent);
            return parent;
          }
          parent = parent.parentElement;
        }
      }
    }
    return null;
  }

  // 计算与解析相对于弹窗根节点的 DOM 子节点索引路径，即使第 2+ 页 Vue 重新销毁创建弹窗也能 100% 命中同一元素
  function getRelativeNodePath(rootEl, targetEl) {
    if (!rootEl || !targetEl || !rootEl.contains(targetEl)) return null;
    const path = [];
    let curr = targetEl;
    while (curr && curr !== rootEl && curr.parentElement) {
      const parent = curr.parentElement;
      const children = parent.children;
      let idx = -1;
      for (let i = 0; i < children.length; i++) {
        if (children[i] === curr) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return null;
      path.unshift(idx);
      curr = parent;
    }
    return curr === rootEl ? path : null;
  }

  function resolveRelativeNodePath(rootEl, pathArr) {
    if (!rootEl || !Array.isArray(pathArr) || pathArr.length === 0) return null;
    let curr = rootEl;
    for (let i = 0; i < pathArr.length; i++) {
      const idx = pathArr[i];
      if (!curr || !curr.children || idx < 0 || idx >= curr.children.length) {
        return null;
      }
      curr = curr.children[idx];
    }
    return curr;
  }

  function isOptionNodeSelected(node) {
    if (!node) return false;
    if (node.tagName === 'INPUT' && (node.type === 'radio' || node.type === 'checkbox')) {
      if (node.checked) return true;
    }
    const innerInp = node.querySelector ? node.querySelector('input[type="radio"], input[type="checkbox"]') : null;
    if (innerInp && innerInp.checked) return true;
    const checkCls = function (el) {
      if (!el) return false;
      const cls = ((el.className || '') + ' ' + (el.getAttribute ? el.getAttribute('aria-checked') || '' : '')).toLowerCase();
      return (
        cls.includes('is-checked') ||
        cls.includes('checked') ||
        cls.includes('active') ||
        cls.includes('selected') ||
        cls.includes('layui-form-radioed') ||
        cls.includes('layui-form-checked') ||
        cls === 'true'
      );
    };
    if (checkCls(node)) return true;
    if (node.parentElement && checkCls(node.parentElement)) return true;
    if (node.closest) {
      const w = node.closest('label, .el-radio, .el-checkbox, .ant-radio-wrapper, .layui-form-radio, li');
      if (w && checkCls(w)) return true;
    }
    return false;
  }

  // 快照当前弹窗内全部单选框/复选框的精确勾选状态（在第 1 页点击「确定」瞬间调用，供第 2+ 页 1:1 校验还原）
  function snapshotModalInputsState(modalEl) {
    if (!modalEl) return [];
    cacheModalHtmlSnapshot(modalEl);
    const inputs = modalEl.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    const list = [];
    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i];
      const wrap =
        (inp.closest ? inp.closest('label, .el-radio, .el-checkbox, .ant-radio-wrapper, .layui-form-radio, .layui-form-checkbox, li') : null) ||
        inp.parentElement;
      const labelText = ((wrap ? wrap.textContent : '') || '').replace(/\\s+/g, '');
      const checked = Boolean(inp.checked) || isOptionNodeSelected(wrap || inp);
      list.push({
        index: i,
        type: inp.type || 'radio',
        checked: checked,
        labelText: labelText.slice(0, 24),
        inputPath: getRelativeNodePath(modalEl, inp),
        wrapPath: wrap ? getRelativeNodePath(modalEl, wrap) : null
      });
    }
    return list;
  }

  function detectSelectedFormatInModal(modalEl) {
    if (!modalEl) return null;
    // 注意：优先检查全文格式（纯文本 / 纯净版 / Word / PDF / 超文本），最后再看默认 Excel，防止被同时存在的目录复选框干扰
    const formats = ['纯文本', '纯净版', 'Word', 'PDF', '超文本', 'Excel'];
    const inputs = modalEl.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    for (let j = 0; j < formats.length; j++) {
      const fmt = formats[j];
      for (let i = 0; i < inputs.length; i++) {
        const r = inputs[i];
        const wrap =
          (r.closest ? r.closest('label, .el-radio, .el-checkbox, .ant-radio-wrapper, .layui-form-radio, li, div') : null) ||
          r.parentElement;
        const containerText = ((wrap ? wrap.innerText || wrap.textContent : '') || '').replace(/\\s+/g, '');
        if ((r.checked || isOptionNodeSelected(wrap)) && containerText.includes(fmt)) {
          return fmt;
        }
      }
    }
    for (let j = 0; j < formats.length; j++) {
      const f = formats[j];
      const nodes = modalEl.querySelectorAll('label, span, div, li');
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const t = (n.textContent || '').replace(/\\s+/g, '');
        if (t === f && isOptionNodeSelected(n)) {
          return f;
        }
      }
    }
    return null;
  }

  function dispatchRealMouseClick(el, dismissTooltipAfter) {
    if (!el) return;
    try {
      const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 10, top: 10, width: 20, height: 20 };
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
      el.dispatchEvent(new MouseEvent('mouseenter', opts));
      el.dispatchEvent(new MouseEvent('mouseover', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      if (typeof el.click === 'function') {
        el.click();
      } else {
        el.dispatchEvent(new MouseEvent('click', opts));
      }
      if (dismissTooltipAfter) {
        el.dispatchEvent(new MouseEvent('mouseout', opts));
        el.dispatchEvent(new MouseEvent('mouseleave', opts));
        if (el.parentElement) {
          el.parentElement.dispatchEvent(new MouseEvent('mouseout', opts));
          el.parentElement.dispatchEvent(new MouseEvent('mouseleave', opts));
        }
      }
    } catch (e) {
      try {
        el.click();
      } catch (e2) {}
    }
  }

  // 对弹窗内的单选框/复选框选项执行干净的单次点击（严禁对同一 label 连续点击 3 次导致勾选后又被取消！）
  function clickModalOptionOnce(node) {
    if (!node) return;
    try {
      const wrap =
        (node.closest ? node.closest('label.el-radio, .el-radio, label.el-checkbox, .el-checkbox, .layui-form-radio, .layui-form-checkbox, label') : null) ||
        node;
      // 优先点击 Element UI 的 .el-radio__inner / .el-checkbox__inner 或 label 本身一次
      const innerIndicator =
        wrap.querySelector &&
        wrap.querySelector('.el-radio__inner, .el-checkbox__inner, .el-radio__label, .el-checkbox__label');
      const clickTarget = innerIndicator && isVisible(innerIndicator) ? innerIndicator : wrap;
      if (typeof clickTarget.click === 'function') {
        clickTarget.click();
      } else {
        dispatchRealMouseClick(clickTarget);
      }
    } catch (e) {
      try {
        node.click();
      } catch (e2) {}
    }
  }

  function findConfirmButtonInModal(modalEl) {
    if (!modalEl) return null;

    const scopes = [modalEl];
    const dialogRoot =
      (modalEl.closest ? modalEl.closest('.el-dialog, .layui-layer, .el-message-box, .ant-modal, [role="dialog"], .modal, .dialog') : null) ||
      modalEl.parentElement;
    if (
      dialogRoot &&
      dialogRoot !== modalEl &&
      dialogRoot !== document.body &&
      (!dialogRoot.querySelector || !dialogRoot.querySelector('.el-table, .batch-container'))
    ) {
      scopes.push(dialogRoot);
    }

    // 1. 优先复用用户在第 1 页弹窗中亲手点击过的「确定」按钮节点（若仍在 DOM 中）
    if (state.recordedConfirmBtn && document.body.contains(state.recordedConfirmBtn) && isVisible(state.recordedConfirmBtn)) {
      for (let s = 0; s < scopes.length; s++) {
        if (scopes[s].contains(state.recordedConfirmBtn)) {
          return state.recordedConfirmBtn;
        }
      }
    }

    // 2. 第一优先级：严格匹配真正的 <button> / <input> / .el-button 节点（防止被外层 <div class="confirm-btn"> 抢先命中而导致重复点击）
    for (let s = 0; s < scopes.length; s++) {
      const scope = scopes[s];
      const realButtons = scope.querySelectorAll(
        'button, input[type="button"], input[type="submit"], a.layui-layer-btn0, a.el-button'
      );
      for (let i = 0; i < realButtons.length; i++) {
        const b = realButtons[i];
        if (!isVisible(b)) continue;
        const t = (b.textContent || b.value || '').replace(/\\s+/g, '');
        if (
          t === '确定' ||
          t === '确认' ||
          t === '确定下载' ||
          t === '立即下载' ||
          t === '开始下载' ||
          (state.recordedConfirmText && t === state.recordedConfirmText && !t.includes('取消'))
        ) {
          return b;
        }
      }
    }

    // 3. 第二优先级：匹配按钮样式类节点，若内部包含 <button> 则优先返回内部 <button>
    for (let s = 0; s < scopes.length; s++) {
      const scope = scopes[s];
      const classCandidates = scope.querySelectorAll(
        '.el-button--primary, .el-button, .layui-layer-btn0, .confirm-btn, .btn-confirm, span[class*="btn" i], a'
      );
      for (let i = 0; i < classCandidates.length; i++) {
        const b = classCandidates[i];
        if (!isVisible(b)) continue;
        const t = (b.textContent || b.value || '').replace(/\\s+/g, '');
        if (t === '确定' || t === '确认' || t === '确定下载' || t === '立即下载' || t === '开始下载') {
          const innerRealBtn = b.querySelector ? b.querySelector('button') : null;
          return innerRealBtn && isVisible(innerRealBtn) ? innerRealBtn : b;
        }
      }
    }

    // 4. 兜底：查找主按钮但严格排除取消/关闭按钮
    for (let s = 0; s < scopes.length; s++) {
      const fallbackPrimary = scopes[s].querySelector('button.el-button--primary, .layui-layer-btn0, button.btn-primary, .el-button--primary');
      if (fallbackPrimary && isVisible(fallbackPrimary)) {
        const ft = (fallbackPrimary.textContent || '').replace(/\\s+/g, '');
        if (!ft.includes('取消') && !ft.includes('关闭') && !ft.includes('重置')) {
          return fallbackPrimary;
        }
      }
    }
    return null;
  }

  // 检测弹窗是否已关闭，或者「确定」按钮是否已进入 Element UI 的 .is-loading / disabled 服务端打包等待状态
  // 一旦处于 loading 状态，严禁再次点击「确定」，否则会导致同一页重复触发 2~3 次下载！
  function isModalLoadingOrClosed(modalEl, btnEl) {
    const currentModal = findCustomDownloadModal();
    if (!currentModal) return true;
    const checkBtn = btnEl || findConfirmButtonInModal(currentModal);
    if (checkBtn) {
      const cls = String(checkBtn.className || '');
      if (
        checkBtn.disabled ||
        checkBtn.hasAttribute('disabled') ||
        cls.includes('is-loading') ||
        Boolean(checkBtn.querySelector && checkBtn.querySelector('.el-icon-loading'))
      ) {
        return true;
      }
    }
    if (currentModal.querySelector && currentModal.querySelector('.is-loading, .el-icon-loading, .el-loading-mask')) {
      return true;
    }
    return false;
  }

  // 在第 2+ 页弹窗中精确同步第 1 页用户选择的全文格式与全部复选框/单选框状态
  async function syncModalFormatOptionsWithPage1(modalEl, targetFormat) {
    if (!modalEl) return;

    // 步骤 A：按顺序回放用户在第 1 页弹窗内亲手点击过的格式/类别节点（通过相对 DOM 路径定位）
    if (Array.isArray(state.recordedUserModalClicks) && state.recordedUserModalClicks.length > 0) {
      for (let i = 0; i < state.recordedUserModalClicks.length; i++) {
        const step = state.recordedUserModalClicks[i];
        const resolvedWrap = resolveRelativeNodePath(modalEl, step.labelPath);
        const resolvedRaw = resolveRelativeNodePath(modalEl, step.rawPath);
        const nodeToClick = resolvedWrap || resolvedRaw;
        if (nodeToClick && isVisible(nodeToClick)) {
          // 若该节点已经是选中状态的单选框，则无需重复点击；否则执行单次点击
          const inp =
            nodeToClick.tagName === 'INPUT'
              ? nodeToClick
              : nodeToClick.querySelector
                ? nodeToClick.querySelector('input[type="radio"], input[type="checkbox"]')
                : null;
          if (!inp || inp.type === 'checkbox' || !inp.checked) {
            clickModalOptionOnce(nodeToClick);
            await sleep(90);
          }
        }
      }
    }

    // 步骤 B：严格比对弹窗内所有 input[type="radio"] 与 input[type="checkbox"] 的勾选状态与第 1 页快照是否完全一致
    if (Array.isArray(state.recordedModalInputsState) && state.recordedModalInputsState.length > 0) {
      const liveInputs = modalEl.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      // 第一遍：把第 1 页勾选为 true 但当前仍为 false 的单选框/复选框勾上
      for (let i = 0; i < state.recordedModalInputsState.length; i++) {
        const snap = state.recordedModalInputsState[i];
        const inp = resolveRelativeNodePath(modalEl, snap.inputPath) || liveInputs[snap.index];
        if (!inp) continue;
        const wrap =
          resolveRelativeNodePath(modalEl, snap.wrapPath) ||
          (inp.closest ? inp.closest('label, .el-radio, .el-checkbox, .layui-form-radio, .layui-form-checkbox') : null) ||
          inp.parentElement;
        const nowChecked = Boolean(inp.checked) || isOptionNodeSelected(wrap || inp);
        if (snap.checked && !nowChecked) {
          clickModalOptionOnce(wrap || inp);
          await sleep(80);
          if (!inp.checked) {
            try {
              inp.click();
              if (!inp.checked) {
                inp.checked = true;
                inp.dispatchEvent(new Event('change', { bubbles: true }));
              }
            } catch (e) {}
          }
        }
      }
      // 第二遍：把第 1 页未勾选 (checked === false) 但当前默认被勾选的复选框（例如默认勾选的“目录/Excel”）取消勾选
      for (let i = 0; i < state.recordedModalInputsState.length; i++) {
        const snap = state.recordedModalInputsState[i];
        const inp = resolveRelativeNodePath(modalEl, snap.inputPath) || liveInputs[snap.index];
        if (!inp || inp.type !== 'checkbox') continue;
        const wrap =
          resolveRelativeNodePath(modalEl, snap.wrapPath) ||
          (inp.closest ? inp.closest('label, .el-checkbox, .layui-form-checkbox') : null) ||
          inp.parentElement;
        const nowChecked = Boolean(inp.checked) || isOptionNodeSelected(wrap || inp);
        if (!snap.checked && nowChecked) {
          clickModalOptionOnce(wrap || inp);
          await sleep(80);
          if (inp.checked) {
            try {
              inp.click();
              if (inp.checked) {
                inp.checked = false;
                inp.dispatchEvent(new Event('change', { bubbles: true }));
              }
            } catch (e) {}
          }
        }
      }
    }

    // 步骤 C：按目标格式名称（如“纯文本”、“Word”、“纯净版”、“PDF”）做最终兜底校验，确保目标格式一定处于选中状态
    if (targetFormat) {
      // 若目标格式不是 Excel（即用户需要下载法规全文），且弹窗中存在“全文”与“目录”切换项，确保“全文”已激活且“目录”复选框未误勾
      if (targetFormat !== 'Excel') {
        const allLabels = modalEl.querySelectorAll('label.el-radio, .el-radio, label.el-checkbox, .el-checkbox, label, span, li');
        for (let i = 0; i < allLabels.length; i++) {
          const el = allLabels[i];
          if (!isVisible(el)) continue;
          const t = (el.textContent || '').replace(/\\s+/g, '');
          if ((t === '全文' || t === '下载全文') && !isOptionNodeSelected(el)) {
            clickModalOptionOnce(el);
            await sleep(80);
          }
        }
      }

      const currentFmt = detectSelectedFormatInModal(modalEl);
      if (currentFmt !== targetFormat) {
        // 寻找最内层文本等于或包含 targetFormat 的单选框/复选框或标签
        const candidates = modalEl.querySelectorAll('label.el-radio, .el-radio, label.el-checkbox, .el-checkbox, label, span, div, a, li');
        let bestTarget = null;
        let smallestLen = Infinity;
        for (let i = 0; i < candidates.length; i++) {
          const el = candidates[i];
          if (!isVisible(el)) continue;
          const txt = (el.textContent || '').replace(/\\s+/g, '');
          if (txt === targetFormat || (txt.indexOf(targetFormat) !== -1 && txt.length <= targetFormat.length + 4)) {
            if (txt.length < smallestLen) {
              smallestLen = txt.length;
              bestTarget = el;
            }
          }
        }
        if (bestTarget) {
          const wrap =
            (bestTarget.closest ? bestTarget.closest('label.el-radio, .el-radio, label.el-checkbox, .el-checkbox, .layui-form-radio, label') : null) ||
            bestTarget;
          if (!isOptionNodeSelected(wrap)) {
            clickModalOptionOnce(wrap);
            await sleep(90);
          }
          const radioOrCb =
            (wrap.querySelector ? wrap.querySelector('input[type="radio"], input[type="checkbox"]') : null) ||
            (bestTarget.previousElementSibling && (bestTarget.previousElementSibling.type === 'radio' || bestTarget.previousElementSibling.type === 'checkbox')
              ? bestTarget.previousElementSibling
              : null);
          if (radioOrCb && !radioOrCb.checked) {
            try {
              radioOrCb.click();
              if (!radioOrCb.checked) {
                radioOrCb.checked = true;
                radioOrCb.dispatchEvent(new Event('change', { bubbles: true }));
              }
            } catch (e) {}
          }
        }
      }
    }

    const verifiedSnap = snapshotModalInputsState(modalEl)
      .filter(function (x) { return x.checked; })
      .map(function (x) { return x.labelText; })
      .join(',');
    pushTrace('modal_sync_fmt', 'target=' + targetFormat + ' | checked=[' + verifiedSnap + ']');
    await sleep(120);
  }

  async function selectFormatAndConfirmInModalAsync(modalEl, targetFormat) {
    if (!modalEl) return false;
    touchBatchLock(true);

    // 1. 精确同步第 1 页的下载格式与单选/复选状态（杜绝第 2+ 页回退成默认的 Excel 目录列表）
    await syncModalFormatOptionsWithPage1(modalEl, targetFormat);

    touchBatchLock(true);
    const confirmBtn = findConfirmButtonInModal(modalEl);
    if (!confirmBtn) {
      pushTrace('modal_confirm_not_found', modalEl.className || modalEl.tagName);
      return false;
    }

    // 2. 若按钮已处于 is-loading 状态，说明已经在打包下载中，绝不重复点击
    if (isModalLoadingOrClosed(modalEl, confirmBtn)) {
      pushTrace('modal_already_loading', confirmBtn.tagName || '');
      return true;
    }

    // 3. 对真正的 <button> 执行单次干净点击
    pushTrace('modal_click_confirm', (confirmBtn.tagName || '') + ':' + ((confirmBtn.textContent || '').replace(/\\s+/g, '').slice(0, 16)));
    if (typeof confirmBtn.click === 'function') {
      confirmBtn.click();
    } else {
      dispatchRealMouseClick(confirmBtn);
    }

    // 4. 等待 320ms 检查弹窗是否已关闭或按钮已进入 .is-loading 服务端打包状态
    // 一旦进入 .is-loading 或弹窗关闭，说明点击已 100% 生效，立即返回，彻底杜绝同一页触发多次下载！
    await sleep(320);
    if (isModalLoadingOrClosed(modalEl, confirmBtn)) {
      pushTrace('modal_confirm_accepted', 'loading_or_closed');
      return true;
    }

    // 5. 仅当 320ms 后弹窗仍未关闭且按钮未进入 loading 状态时，才补充一次真实鼠标事件点击
    const stillOpenModal = findCustomDownloadModal();
    if (stillOpenModal && !isModalLoadingOrClosed(stillOpenModal, confirmBtn)) {
      const retryBtn = findConfirmButtonInModal(stillOpenModal) || confirmBtn;
      pushTrace('modal_fallback_click', retryBtn.tagName || '');
      dispatchRealMouseClick(retryBtn);
    }
    return true;
  }

  // --------------------------------------------------------------------------
  // 6.5 精准顺序翻页引擎（优先点击目标页码数字按钮 + 内容签名变更校验，彻底杜绝跳页/漏页）
  // --------------------------------------------------------------------------
  function getFirstResultItemDocTop() {
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const cbs = findResultItemCheckboxes();
    if (cbs.length > 0) {
      const r = getCheckboxVisibleRect(cbs[0]);
      if (r) return r.top + scrollY;
    }
    return 180;
  }

  function findTargetPageNumberButton(targetPageNumber) {
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const targetStr = String(targetPageNumber);
    const minDocTop = getFirstResultItemDocTop();
    // 严格限定在分页器组件内部查找目标页码按钮（绝不误点检索条件区的序号 1/2/3/4/5）
    const pagerItemSelectors = [
      '.el-pagination .el-pager li.number',
      '.el-pagination .el-pager li',
      '.el-pagination li.number',
      '.layui-laypage a',
      '.ant-pagination-item',
      '.pagination li a',
      '.pagination a',
      '.page-box a',
      '.pager a'
    ];
    for (let s = 0; s < pagerItemSelectors.length; s++) {
      const items = document.querySelectorAll(pagerItemSelectors[s]);
      for (let i = 0; i < items.length; i++) {
        const el = items[i];
        if (el.closest && el.closest('#pkulaw-ext-root')) continue;
        if (!isVisible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.top + scrollY < minDocTop) continue;
        const txt = (el.textContent || '').trim();
        if (txt === targetStr) {
          const cls = ((el.className || '') + ' ' + (el.parentElement ? el.parentElement.className : '')).toLowerCase();
          if (cls.includes('disabled') || el.hasAttribute('disabled')) continue;
          return el;
        }
      }
    }
    return null;
  }

  function findNextPageButton() {
    // 1. 优先匹配标准分页器下一页按钮（支持 Vue .el-pagination .btn-next 无文字箭头按钮）
    const nextSelectors = [
      '.el-pagination button.btn-next:not(:disabled):not(.disabled)',
      '.el-pagination .btn-next:not(:disabled):not(.disabled)',
      '.layui-laypage-next:not(.layui-disabled)',
      '.ant-pagination-next:not(.ant-pagination-disabled)',
      '.pagination li.next:not(.disabled) a',
      '.pagination a.next:not(.disabled)',
      'li.next:not(.disabled) a',
      'a.next:not(.disabled)',
      '.page-next:not(.disabled)',
      'a.next-page:not(.disabled)',
      'button.next-page:not(.disabled)'
    ];
    for (let i = 0; i < nextSelectors.length; i++) {
      const el = document.querySelector(nextSelectors[i]);
      if (el && (!el.closest || !el.closest('#pkulaw-ext-root')) && isVisible(el)) {
        const cls = ((el.className || '') + ' ' + (el.parentElement ? el.parentElement.className : '')).toLowerCase();
        if (!cls.includes('disabled') && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true') {
          return el;
        }
      }
    }

    // 2. 匹配带文字或 title 的下一页按钮（严禁匹配代表“尾页/最后一页”的 » 符号，防止从第 1 页直接跳到第 3 页！）
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const minDocTop = getFirstResultItemDocTop();
    const candidates = document.querySelectorAll('a, button, li, span');
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.closest && el.closest('#pkulaw-ext-root')) continue;
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      const txt = (el.textContent || '').trim();
      const title = (el.getAttribute('title') || '').trim();
      if (txt === '>' && r.top + scrollY < minDocTop) continue;
      if (txt === '下一页' || txt === '下一页>' || txt === '下一页 >' || txt === '>' || title === '下一页' || title === '向后') {
        const cls = ((el.className || '') + ' ' + (el.parentElement ? el.parentElement.className : '')).toLowerCase();
        if (
          cls.includes('disabled') ||
          cls.includes('none') ||
          el.hasAttribute('disabled') ||
          el.getAttribute('aria-disabled') === 'true'
        ) {
          return null;
        }
        return el;
      }
    }
    return null;
  }

  function hasMorePagesToDownload() {
    const nextTargetPage = state.currentPage + 1;
    if (state.totalPages > 1 && state.currentPage < state.totalPages) {
      if (findTargetPageNumberButton(nextTargetPage) || findNextPageButton()) {
        return true;
      }
    }
    return Boolean(findNextPageButton());
  }

  function getPageContentSignature() {
    const parts = [];
    // 提取当前分页器激活页码（严格限定在分页组件内部）
    const activePager = document.querySelector(
      '.el-pagination .el-pager li.number.active, .el-pagination .el-pager li.active, .layui-laypage-curr, .ant-pagination-item-active'
    );
    if (activePager) {
      parts.push('p:' + (activePager.textContent || '').trim());
    }
    // 提取本页前 3 条法规的序号与标题文本（如 "1. ..."、"21. ..."、"101. ..."）
    const cbs = findResultItemCheckboxes();
    for (let i = 0; i < Math.min(3, cbs.length); i++) {
      const cb = cbs[i];
      const row = (cb.closest ? cb.closest('tr, li, .block, .list-item, .el-table__row, div[class*="item" i]') : null) || cb.parentElement;
      if (row) {
        const rowTxt = (row.innerText || row.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 48);
        if (rowTxt) parts.push(rowTxt);
      }
    }
    if (parts.length <= 1 && document.body) {
      const m = (document.body.innerText || '').match(/\\b([0-9]{1,4})\\.\\s*[^\\n]{4,30}/);
      if (m && m[0]) parts.push(m[0].replace(/\\s+/g, ' ').trim());
    }
    return parts.join(' | ');
  }

  function isResultsTableLoading() {
    const masks = document.querySelectorAll('.el-loading-mask, .layui-layer-loading, .ant-spin-spinning');
    for (let i = 0; i < masks.length; i++) {
      if (isVisible(masks[i])) return true;
    }
    return false;
  }

  function clickPaginationControlOnce(el) {
    if (!el) return;
    try {
      if (el.scrollIntoView) {
        const r = el.getBoundingClientRect();
        if (r.bottom > window.innerHeight - 70 || r.top < 40) {
          el.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
      }
    } catch (e) {}
    try {
      // 对分页按钮仅执行单次原生 click()，严禁同时派发 mousedown + mouseup + click 防止相对翻页按钮连跳两页
      if (typeof el.click === 'function') {
        el.click();
      } else {
        const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 10, top: 10, width: 20, height: 20 };
        el.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
          })
        );
      }
    } catch (e) {}
  }

  async function navigateToNextPageAndVerify(targetPageNumber, prevSignature) {
    // 1. 优先点击目标页码数字按钮（如第 2 页点击 "2"，第 3 页点击 "3"），天然具备幂等性，绝不会从第 1 页跳到第 3 页
    const targetPageBtn = findTargetPageNumberButton(targetPageNumber);
    const nextBtn = findNextPageButton();

    if (targetPageBtn) {
      clickPaginationControlOnce(targetPageBtn);
    } else if (nextBtn) {
      clickPaginationControlOnce(nextBtn);
    } else {
      return false;
    }

    // 2. 高频轮询（每 180ms 一次）等待新页面 AJAX 列表真正替换完成（特征签名发生变化且加载遮罩消失）
    for (let tick = 0; tick < 36 && !state.stopRequested; tick++) {
      await sleep(180);
      if (detectCaptchaVisible()) {
        const ok = await waitIfCaptchaUntilResolved();
        if (!ok || state.stopRequested) return false;
      }
      if (isResultsTableLoading()) continue;
      const curSig = getPageContentSignature();
      const cbs = findResultItemCheckboxes();
      if (cbs.length > 0 && curSig && curSig !== prevSignature) {
        await sleep(260);
        return true;
      }
    }

    // 3. 若首次点击后页面签名仍未变化，使用备用分页按钮重试一次
    const retryTargetBtn = findTargetPageNumberButton(targetPageNumber);
    const retryNextBtn = findNextPageButton();
    if (retryTargetBtn) {
      dispatchRealMouseClick(retryTargetBtn, true);
    } else if (retryNextBtn) {
      clickPaginationControlOnce(retryNextBtn);
    }

    for (let tick = 0; tick < 25 && !state.stopRequested; tick++) {
      await sleep(220);
      if (detectCaptchaVisible()) {
        const ok = await waitIfCaptchaUntilResolved();
        if (!ok || state.stopRequested) return false;
      }
      if (isResultsTableLoading()) continue;
      const curSig = getPageContentSignature();
      const cbs = findResultItemCheckboxes();
      if (cbs.length > 0 && curSig !== prevSignature) {
        await sleep(260);
        return true;
      }
    }

    await sleep(300);
    return findResultItemCheckboxes().length > 0;
  }

  // --------------------------------------------------------------------------
  // 7. 严苛化人工验证（CAPTCHA）视口居中遮挡检测（彻底杜绝登录框隐藏节点误报）
  // --------------------------------------------------------------------------
  function isCenteredBlockingOverlay(el) {
    if (!el || !isVisible(el)) return false;
    if (el.closest && el.closest('#pkulaw-ext-root')) return false;
    const r = el.getBoundingClientRect();
    // 验证码弹窗必须具备合理尺寸
    if (r.width < 180 || r.height < 110) return false;

    const vw = window.innerWidth || document.documentElement.clientWidth || 1280;
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    const cx = vw / 2;
    const cy = vh / 2;

    // 必须位于视口中央区域
    const coversCenter =
      r.left <= cx + 140 &&
      r.right >= cx - 140 &&
      r.top <= cy + 160 &&
      r.bottom >= cy - 160;
    if (!coversCenter) return false;

    // 必须具备浮层定位与高优先级层级（或其祖先具备 fixed/absolute 模态层）
    let hasFloatingLayer = false;
    let curr = el;
    while (curr && curr !== document.body && curr !== document.documentElement) {
      const st = window.getComputedStyle(curr);
      const z = parseInt(st.zIndex, 10) || 0;
      if ((st.position === 'fixed' || st.position === 'absolute') && z >= 90) {
        hasFloatingLayer = true;
        break;
      }
      curr = curr.parentElement;
    }
    if (!hasFloatingLayer) return false;

    // 必须真正处于当前屏幕最顶层并实际遮挡页面中央（通过 elementFromPoint 验证）
    const probeX = Math.max(10, Math.min(vw - 10, r.left + r.width / 2));
    const probeY = Math.max(10, Math.min(vh - 10, r.top + r.height / 2));
    const topEl = document.elementFromPoint(probeX, probeY);
    if (!topEl) return false;
    if (topEl.closest && topEl.closest('#pkulaw-ext-root')) return false;
    return el.contains(topEl) || topEl.contains(el);
  }

  function detectCaptchaVisible() {
    // 1. 检测专门的第三方滑块/拼图浮层组件（必须处于视口中央且实际遮挡页面）
    const sliderSelectors = [
      '.geetest_panel_box',
      '.geetest_wind',
      '.nc-container',
      '.yidun_modal',
      '.tcaptcha-transform'
    ];
    for (let i = 0; i < sliderSelectors.length; i++) {
      const nodes = document.querySelectorAll(sliderSelectors[i]);
      for (let j = 0; j < nodes.length; j++) {
        if (isCenteredBlockingOverlay(nodes[j])) {
          return true;
        }
      }
    }

    // 2. 检测明确包含安全验证提示语且实际遮挡视口中央的顶层弹窗（严格排除登录框与自定义下载框）
    const modalSelectors = '.layui-layer, .el-dialog, .ant-modal, .modal, .dialog';
    const modals = document.querySelectorAll(modalSelectors);
    for (let i = 0; i < modals.length; i++) {
      const m = modals[i];
      if (!isCenteredBlockingOverlay(m)) continue;
      const t = (m.innerText || '').replace(/\\s+/g, ' ');
      // 排除普通账号登录框与自定义下载框
      if (
        t.includes('扫码登录') ||
        t.includes('密码登录') ||
        t.includes('CARSI') ||
        t.includes('自定义下载') ||
        t.includes('请选择下载格式')
      ) {
        continue;
      }
      if (
        t.includes('请完成安全验证') ||
        t.includes('拖动下方滑块') ||
        t.includes('拖动滑块') ||
        t.includes('访问受到安全保护') ||
        t.includes('访问过于频繁') ||
        t.includes('人机验证')
      ) {
        return true;
      }
    }
    return false;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function waitIfCaptchaUntilResolved() {
    if (!detectCaptchaVisible()) return true;

    state.stage = 'captcha_paused';
    state.statusMessage = '检测到居中人工验证浮层遮挡页面，请直接在网页中完成验证，验证通过后将全自动继续下载...';
    renderBar();

    let consecutiveClearCount = 0;
    while (!state.stopRequested) {
      await sleep(600);
      touchBatchLock(true);

      if (!detectCaptchaVisible()) {
        consecutiveClearCount += 1;
        if (consecutiveClearCount >= 2) {
          state.stage = 'downloading';
          state.statusMessage = '已检测到人工验证完成！正在全自动恢复下载流程...';
          renderBar();
          await sleep(600);
          return true;
        }
      } else {
        consecutiveClearCount = 0;
      }
    }
    return false;
  }

  // 统一的「第 1 页确认完成并启动跨页循环」入口（支持点击监听与下载信号自愈双重触发，且严格幂等）
  function triggerFirstPageConfirmedAndStartLoop(triggerSource, modalEl, btnEl, rawTarget) {
    if (state.loopRunning || state.stage === 'downloading') return;
    if (btnEl) state.recordedConfirmBtn = btnEl;
    if (rawTarget) state.recordedConfirmRawTarget = rawTarget;

    if (modalEl) {
      const snap = snapshotModalInputsState(modalEl);
      if (snap.length > 0) {
        state.recordedModalInputsState = snap;
      }
    }

    detectPkulawDomState();
    session = saveSession({ isMainSearchTab: true, manualLoginConfirmed: true });
    touchBatchLock(true);

    const detectedFmt = modalEl ? detectSelectedFormatInModal(modalEl) : null;
    const finalFmt = detectedFmt || state.chosenFormat || '纯净版';
    state.chosenFormat = finalFmt;
    config = saveConfig({ lastChosenFormat: finalFmt });
    state.downloadedBatches = 1;
    state.currentPage = 1;
    state.stage = 'downloading';
    state.statusMessage = '第 1 页已按【' + finalFmt + '】触发下载，正在等待浏览器接收原始压缩包文件流...';
    session = saveSession({
      isMainSearchTab: true,
      manualLoginConfirmed: true,
      resumeDownloading: true,
      currentPage: 1,
      totalPages: state.totalPages,
      downloadedBatches: 1,
      chosenFormat: finalFmt
    });
    const checkedLabels = (state.recordedModalInputsState || [])
      .filter(function (x) { return x.checked; })
      .map(function (x) { return x.labelText; })
      .join(',');
    pushTrace('page1_confirmed', triggerSource + ' | fmt=' + finalFmt + ' | checked=[' + checkedLabels + ']');
    renderBar();

    setTimeout(async function () {
      await waitForRealDownloadSignal(9500);
      runNextPageLoop();
    }, 250);
  }

  // 监听用户在第 1 页北大法宝原生「自定义下载」弹窗中的真实点击操作与「确定」按钮
  document.addEventListener(
    'click',
    function (e) {
      // 严禁处理脚本自身派发的合成点击 (e.isTrusted === false)，只录制用户的真实鼠标点击！
      if (e.isTrusted === false) return;
      const target = e.target;
      if (!target || (target.closest && target.closest('#pkulaw-ext-root'))) return;

      const modal = findCustomDownloadModal();
      const dialogRoot =
        (target.closest ? target.closest('.el-dialog, .layui-layer, .el-message-box, .ant-modal, [role="dialog"], .modal, .dialog') : null) ||
        modal;

      // 仅在等待选择格式或弹窗可见时拦截并记录格式与确定按钮
      if (state.stage !== 'waiting_format_choice' && !modal && !dialogRoot) return;

      // 查找被点击的按钮
      const btnEl = target.closest
        ? target.closest('button, a, input[type="button"], input[type="submit"], .el-button, .layui-layer-btn0, .confirm-btn, .btn-confirm') || target
        : target;
      const rawText = (target.textContent || target.value || '').replace(/\\s+/g, '');
      const btnText = (btnEl.textContent || btnEl.value || '').replace(/\\s+/g, '');

      const isConfirmAction =
        btnText === '确定' ||
        btnText === '确认' ||
        btnText === '确定下载' ||
        btnText === '立即下载' ||
        btnText === '开始下载' ||
        rawText === '确定' ||
        rawText === '确认' ||
        rawText === '确定下载' ||
        rawText === '立即下载' ||
        (btnEl.classList && btnEl.classList.contains('layui-layer-btn0')) ||
        ((btnText === '下载' || rawText === '下载') && Boolean(dialogRoot) && !(target.closest && target.closest('.batch-container')));

      const isCancelOrClose =
        btnText.includes('取消') ||
        btnText.includes('关闭') ||
        rawText.includes('取消') ||
        rawText.includes('关闭') ||
        Boolean(target.closest && target.closest('.el-dialog__headerbtn, .layui-layer-close'));

      const formats = ['纯文本', '纯净版', 'Word', 'PDF', '超文本', 'Excel'];
      const labelNode =
        (target.closest ? target.closest('label.el-radio, .el-radio, label.el-checkbox, .el-checkbox, .ant-radio-wrapper, .layui-form-radio, label, li, span') : null) ||
        target;
      const clickedText = ((labelNode.textContent || target.textContent || '') + '').replace(/\\s+/g, '');

      if (!isConfirmAction && !isCancelOrClose && dialogRoot && dialogRoot.contains(target)) {
        for (let i = 0; i < formats.length; i++) {
          const f = formats[i];
          if (clickedText === f || (clickedText.length <= 12 && clickedText.includes(f))) {
            state.chosenFormat = f;
            config = saveConfig({ lastChosenFormat: f });
            pushTrace('user_select_fmt', f);
            renderBar();
            break;
          }
        }
        // 记录用户在第 1 页弹窗内点击过的选项相对路径，供第 2+ 页精确回放
        const rawPath = getRelativeNodePath(dialogRoot, target);
        const labelPath = getRelativeNodePath(dialogRoot, labelNode);
        if (rawPath || labelPath) {
          state.recordedUserModalClicks.push({
            rawPath: rawPath,
            labelPath: labelPath,
            text: clickedText.slice(0, 24)
          });
          if (state.recordedUserModalClicks.length > 10) {
            state.recordedUserModalClicks.shift();
          }
        }
        // 延迟 60ms 刷新弹窗内所有单选/复选框的最新勾选快照
        setTimeout(function () {
          if (dialogRoot && document.body.contains(dialogRoot)) {
            const snap = snapshotModalInputsState(dialogRoot);
            if (snap.length > 0) {
              state.recordedModalInputsState = snap;
            }
          }
        }, 60);
      }

      if (
        (state.stage === 'waiting_format_choice' || state.stage === 'download_ready') &&
        isConfirmAction &&
        !state.loopRunning
      ) {
        const realButton = (btnEl.tagName === 'BUTTON' ? btnEl : (btnEl.querySelector ? btnEl.querySelector('button') : null)) || btnEl;
        if (dialogRoot && (!dialogRoot.querySelector || !dialogRoot.querySelector('.el-table, .batch-container'))) {
          state.recordedConfirmModalRoot = dialogRoot;
          state.recordedConfirmBtn = realButton;
          state.recordedConfirmRawTarget = target;
          if (btnText && btnText.length <= 8) {
            state.recordedConfirmText = btnText;
          }
        }
        triggerFirstPageConfirmedAndStartLoop('user_click_' + (btnText || rawText || 'confirm'), dialogRoot || modal, realButton, target);
      }
    },
    true
  );

  // --------------------------------------------------------------------------
  // 8. 闭环状态验证的「全选勾选」引擎
  // --------------------------------------------------------------------------
  function clickCheckboxTargetOnce(node) {
    if (!node) return;
    try {
      if (node.tagName === 'INPUT' && node.type === 'checkbox') {
        const r = node.getBoundingClientRect();
        if (r.width === 0 || window.getComputedStyle(node).opacity === '0' || window.getComputedStyle(node).display === 'none') {
          if (node.previousElementSibling && isVisible(node.previousElementSibling)) {
            dispatchRealMouseClick(node.previousElementSibling);
            return;
          }
          if (node.nextElementSibling && isVisible(node.nextElementSibling)) {
            dispatchRealMouseClick(node.nextElementSibling);
            return;
          }
          if (node.closest) {
            const labelWrap = node.closest('label, .el-checkbox, .ant-checkbox, .layui-form-checkbox');
            if (labelWrap && isVisible(labelWrap)) {
              dispatchRealMouseClick(labelWrap);
              return;
            }
          }
          if (node.parentElement && isVisible(node.parentElement)) {
            dispatchRealMouseClick(node.parentElement);
            return;
          }
        }
      }
      dispatchRealMouseClick(node);
    } catch (e) {}
  }

  async function scrollResultsAreaIntoViewIfNeeded() {
    const target = findResultsToolbar() || findBatchDownloadButton() || findSelectAllCheckbox();
    if (!target || !target.getBoundingClientRect) return;
    const r = target.getBoundingClientRect();
    if (r.top < 60 || r.bottom > window.innerHeight - 80) {
      try {
        target.scrollIntoView({ block: 'center', behavior: 'instant' });
        await sleep(120);
      } catch (e) {
        try {
          target.scrollIntoView({ block: 'center' });
          await sleep(120);
        } catch (e2) {}
      }
    }
  }

  async function selectAllOnCurrentPage() {
    await scrollResultsAreaIntoViewIfNeeded();

    let stats = countCheckedResultItems();
    if (stats.total > 0 && stats.checked >= stats.total) {
      return true;
    }

    const cb = findSelectAllCheckbox();
    if (cb) {
      clickCheckboxTargetOnce(cb);
      await sleep(220);
      stats = countCheckedResultItems();
      if (stats.total > 0 && stats.checked >= stats.total) {
        return true;
      }

      // 若全选框因上一页残留状态导致第 1 次点击变成了取消勾选，则立即再次点击完成全选
      if (stats.total > 0 && stats.checked === 0) {
        clickCheckboxTargetOnce(cb);
        await sleep(220);
        stats = countCheckedResultItems();
        if (stats.total > 0 && stats.checked >= stats.total) {
          return true;
        }
      }

      if (stats.checked === 0 && cb.parentElement) {
        clickCheckboxTargetOnce(cb.parentElement);
        await sleep(200);
        stats = countCheckedResultItems();
        if (stats.total > 0 && stats.checked >= stats.total) {
          return true;
        }
      }
    }

    const itemCheckboxes = findResultItemCheckboxes();
    if (itemCheckboxes.length > 0) {
      for (let i = 0; i < itemCheckboxes.length; i++) {
        const itemNode = itemCheckboxes[i];
        if (!isCheckboxNodeChecked(itemNode)) {
          clickCheckboxTargetOnce(itemNode);
          await sleep(18);
          if (!isCheckboxNodeChecked(itemNode)) {
            const innerInp =
              itemNode.tagName === 'INPUT'
                ? itemNode
                : itemNode.querySelector
                  ? itemNode.querySelector('input[type="checkbox"]')
                  : null;
            if (innerInp && !innerInp.checked) {
              try {
                innerInp.click();
                if (!innerInp.checked) {
                  innerInp.checked = true;
                  innerInp.dispatchEvent(new Event('change', { bubbles: true }));
                }
              } catch (e) {}
            }
          }
        }
      }
      await sleep(150);
    }

    const finalStats = countCheckedResultItems();
    return finalStats.checked > 0 || Boolean(cb);
  }

  async function triggerOpenCustomDownloadModal() {
    await scrollResultsAreaIntoViewIfNeeded();
    if (findCustomDownloadModal()) return true;

    const dlBtn = findBatchDownloadButton();
    const clickTargets = [];

    function addCandidate(node) {
      if (!node || !isVisible(node)) return;
      const cls = String(node.className || '');
      if (cls.includes('batch-container') || cls.includes('el-table')) return;
      const r = node.getBoundingClientRect();
      if (r.width > 110) return;
      if (clickTargets.indexOf(node) === -1) {
        clickTargets.push(node);
      }
    }

    // 1. 优先精确命中北大法宝 V6 的下载图标 <i class="iconfont icon-qikan_xiazai"> 及包装层 <p class="el-tooltip item left-downLoad">
    const v6Icon = document.querySelector('.batch-container i.icon-qikan_xiazai, p.left-downLoad i.icon-qikan_xiazai, i.icon-qikan_xiazai');
    const v6TooltipP = document.querySelector('.batch-container p.left-downLoad, p.left-downLoad, [class*="left-downLoad"]');
    if (v6Icon) addCandidate(v6Icon);
    if (v6TooltipP) addCandidate(v6TooltipP);
    if (v6TooltipP && v6TooltipP.parentElement) addCandidate(v6TooltipP.parentElement);

    // 2. 补充通用定位到的下载按钮及其内部图标和直接父节点
    if (dlBtn) {
      if (dlBtn.querySelector) {
        const innerIcon = dlBtn.querySelector('i.icon-qikan_xiazai, i[class*="xiazai" i], i[class*="download" i], i.iconfont');
        const innerP = dlBtn.querySelector('p.left-downLoad, [class*="left-downLoad"]');
        if (innerIcon) addCandidate(innerIcon);
        if (innerP) addCandidate(innerP);
      }
      addCandidate(dlBtn);
      if (dlBtn.parentElement && dlBtn.parentElement !== findResultsToolbar()) {
        addCandidate(dlBtn.parentElement);
      }
    }

    for (let i = 0; i < clickTargets.length; i++) {
      const target = clickTargets[i];
      dispatchRealMouseClick(target, true);
      // 给足弹窗动画与权限校验渲染时间（900ms），一旦弹窗出现立即返回，绝不重复点击父节点造成弹窗关闭
      for (let tick = 0; tick < 6; tick++) {
        await sleep(140);
        const m = findCustomDownloadModal();
        if (m) {
          return true;
        }
      }
    }

    return Boolean(findCustomDownloadModal());
  }

  async function startBatchDownloadProcess() {
    state.stopRequested = false;
    state.recordedUserModalClicks = [];
    state.recordedModalInputsState = [];
    detectPkulawDomState();
    session = saveSession({ isMainSearchTab: true });
    touchBatchLock(true);

    // 直接执行勾选全选并自动打开下载格式窗口，底栏文字统一显示“请选择下载格式”
    state.stage = 'waiting_format_choice';
    state.statusMessage = '请选择下载格式';
    renderBar();

    await selectAllOnCurrentPage();
    await sleep(240);

    let opened = await triggerOpenCustomDownloadModal();
    if (!opened) {
      await sleep(280);
      await selectAllOnCurrentPage();
      await sleep(220);
      opened = await triggerOpenCustomDownloadModal();
    }

    // 仅当未能打开下载格式窗口且确实存在居中遮挡的验证码弹窗时，才进入验证码暂停等待
    if (!findCustomDownloadModal() && detectCaptchaVisible()) {
      const okAfterCaptcha = await waitIfCaptchaUntilResolved();
      if (!okAfterCaptcha || state.stopRequested) return;
      state.stage = 'waiting_format_choice';
      state.statusMessage = '请选择下载格式';
      await selectAllOnCurrentPage();
      await sleep(240);
      await triggerOpenCustomDownloadModal();
    }

    state.statusMessage = '请选择下载格式';
    renderBar();
  }

  async function runNextPageLoop() {
    if (state.loopRunning) return;
    state.loopRunning = true;

    try {
      while (!state.stopRequested) {
        touchBatchLock(true);

        const resolved1 = await waitIfCaptchaUntilResolved();
        if (!resolved1 || state.stopRequested) break;

        if (!hasMorePagesToDownload()) {
          state.stage = 'completed';
          touchBatchLock(false);
          session = saveSession({ resumeDownloading: false });
          const actualTriggered = Math.max(state.startedDownloadsCount, state.completedZipFiles);
          state.statusMessage =
            '全部批次原始压缩包下载已完成！共执行 ' +
            state.downloadedBatches +
            ' 页批次（浏览器已接收 ' +
            actualTriggered +
            ' 个压缩包下载任务，格式：' +
            state.chosenFormat +
            '）。';
          renderBar();
          return;
        }

        // 支持极速隔页随机等待间隔（默认 1.0s ~ 2.0s，最低支持 0.5s）
        const minSec = Math.max(0.3, Number(config.minDelaySec) || 1.0);
        const maxSec = Math.max(minSec + 0.3, Number(config.maxDelaySec) || 2.0);
        const minMs = Math.round(minSec * 1000);
        const maxMs = Math.round(maxSec * 1000);
        const waitMs = Math.floor(minMs + Math.random() * (maxMs - minMs));
        let remainingMs = waitMs;

        while (remainingMs > 0 && !state.stopRequested) {
          touchBatchLock(true);
          if (detectCaptchaVisible()) {
            const okDuringCountdown = await waitIfCaptchaUntilResolved();
            if (!okDuringCountdown || state.stopRequested) return;
          }
          state.countdownSec = Number((remainingMs / 1000).toFixed(1));
          state.statusMessage =
            '第 ' +
            state.currentPage +
            ' 页原始压缩包已触发下载（格式：' +
            state.chosenFormat +
            '），间隔 ' +
            state.countdownSec +
            ' 秒后自动翻至第 ' +
            (state.currentPage + 1) +
            ' 页...';
          renderBar();
          const stepMs = Math.min(300, remainingMs);
          await sleep(stepMs);
          remainingMs -= stepMs;
        }

        if (state.stopRequested) break;

        if (!hasMorePagesToDownload()) {
          state.stage = 'completed';
          touchBatchLock(false);
          session = saveSession({ resumeDownloading: false });
          const actualTriggered = Math.max(state.startedDownloadsCount, state.completedZipFiles);
          state.statusMessage =
            '全部批次原始压缩包下载已完成！共执行 ' +
            state.downloadedBatches +
            ' 页批次（浏览器已接收 ' +
            actualTriggered +
            ' 个压缩包下载任务，格式：' +
            state.chosenFormat +
            '）。';
          renderBar();
          return;
        }

        const prevSignature = getPageContentSignature();
        const targetPage = state.currentPage + 1;
        state.currentPage = targetPage;
        state.statusMessage = '正在精准翻至第 ' + state.currentPage + '/' + state.totalPages + ' 页并等待列表刷新...';
        session = saveSession({
          isMainSearchTab: true,
          manualLoginConfirmed: true,
          resumeDownloading: true,
          currentPage: state.currentPage,
          totalPages: state.totalPages,
          downloadedBatches: state.downloadedBatches,
          chosenFormat: state.chosenFormat
        });
        renderBar();

        const navOk = await navigateToNextPageAndVerify(targetPage, prevSignature);
        if (!navOk || state.stopRequested) break;

        const resolvedAfterNav = await waitIfCaptchaUntilResolved();
        if (!resolvedAfterNav || state.stopRequested) break;

        await selectAllOnCurrentPage();
        await sleep(220);

        let modalOpened = await triggerOpenCustomDownloadModal();
        if (!modalOpened) {
          if (detectCaptchaVisible()) {
            await waitIfCaptchaUntilResolved();
          }
          await sleep(450);
          await selectAllOnCurrentPage();
          await sleep(220);
          modalOpened = await triggerOpenCustomDownloadModal();
        }

        const downloadsBeforeConfirm = Math.max(state.startedDownloadsCount, state.completedZipFiles);
        let modal = findCustomDownloadModal();
        if (modal) {
          state.statusMessage =
            '第 ' +
            state.currentPage +
            '/' +
            state.totalPages +
            ' 页已同步【' +
            state.chosenFormat +
            '】格式并点击「确定」，等待服务端打包返回压缩包...';
          renderBar();
          await selectFormatAndConfirmInModalAsync(modal, state.chosenFormat);
          await waitForRealDownloadSignal(12000);
          // 若服务端仍在打包中（按钮处于 .is-loading 状态），继续等待打包完成，绝不重复点击「确定」！
          for (let waitTick = 0; waitTick < 16 && !state.stopRequested; waitTick++) {
            if (Math.max(state.startedDownloadsCount, state.completedZipFiles) > downloadsBeforeConfirm) break;
            const openM = findCustomDownloadModal();
            if (!openM || !isModalLoadingOrClosed(openM, null)) break;
            await waitForRealDownloadSignal(1000);
          }
        }

        // 仅当本页尚未收到下载流且弹窗不处于 loading 打包状态时，才执行一次补救重试
        if (!state.stopRequested && Math.max(state.startedDownloadsCount, state.completedZipFiles) <= downloadsBeforeConfirm) {
          if (detectCaptchaVisible()) {
            const okAfterConfirm = await waitIfCaptchaUntilResolved();
            if (!okAfterConfirm || state.stopRequested) break;
          }
          const openM = findCustomDownloadModal();
          if (!openM || !isModalLoadingOrClosed(openM, null)) {
            state.statusMessage = '正在对第 ' + state.currentPage + ' 页执行二次确认下载校验...';
            renderBar();
            if (!findCustomDownloadModal()) {
              await selectAllOnCurrentPage();
              await sleep(250);
              await triggerOpenCustomDownloadModal();
            }
            const retryModal = findCustomDownloadModal();
            if (retryModal) {
              await selectFormatAndConfirmInModalAsync(retryModal, state.chosenFormat);
              await waitForRealDownloadSignal(10000);
            }
          }
        }

        state.downloadedBatches += 1;
        session = saveSession({
          isMainSearchTab: true,
          manualLoginConfirmed: true,
          resumeDownloading: true,
          currentPage: state.currentPage,
          totalPages: state.totalPages,
          downloadedBatches: state.downloadedBatches,
          chosenFormat: state.chosenFormat
        });
        renderBar();
      }
    } finally {
      state.loopRunning = false;
      if (state.stopRequested) {
        touchBatchLock(false);
        session = saveSession({ resumeDownloading: false });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 9. 可视化网页 DOM 诊断弹窗
  // --------------------------------------------------------------------------
  function describeElement(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    return {
      tag: el.tagName,
      id: el.id || '',
      className: String(el.className || ''),
      title: el.getAttribute ? (el.getAttribute('title') || '') : '',
      text: (el.textContent || '').trim().slice(0, 40),
      rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
      outerHTML: (el.outerHTML || '').slice(0, 260)
    };
  }

  function buildDiagnosticReportObject() {
    const tb = findResultsToolbar();
    const cb = findSelectAllCheckbox();
    const dl = findBatchDownloadButton();
    const modal = findCustomDownloadModal();
    const stats = countCheckedResultItems();

    return {
      extVersion: '3.3.0',
      url: window.location.href,
      title: document.title,
      stage: state.stage,
      domLoggedIn: state.domLoggedIn,
      detectedUserIndicator: state.domUserText,
      domHasResults: state.domHasResults,
      detectedTotalCount: state.detectedTotalCount,
      pageSize: state.pageSize,
      currentPage: state.currentPage,
      totalPages: state.totalPages,
      downloadedBatches: state.downloadedBatches,
      itemCheckboxesCount: stats.total,
      itemCheckboxesCheckedCount: stats.checked,
      startedDownloadsCount: state.startedDownloadsCount,
      completedZipFiles: state.completedZipFiles,
      pageSignature: getPageContentSignature(),
      captchaVisible: detectCaptchaVisible(),
      toolbarInfo: tb
        ? {
            rect: describeElement(tb).rect,
            text: (tb.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 140),
            htmlSnippet: (tb.innerHTML || '').replace(/\\s+/g, ' ').trim().slice(0, 600)
          }
        : null,
      selectAllControl: describeElement(cb),
      batchDownloadControl: describeElement(dl),
      foundCustomDownloadModal: Boolean(modal),
      customDownloadModalInfo: describeElement(modal),
      confirmButtonInModalInfo: describeElement(findConfirmButtonInModal(modal)),
      recordedConfirmBtnInfo: describeElement(state.recordedConfirmBtn),
      recordedModalInputsState: state.recordedModalInputsState,
      lastOpenModalHtml: state.lastOpenModalHtml,
      foundNextPageBtn: Boolean(findNextPageButton()),
      nextPageBtnInfo: describeElement(findNextPageButton()),
      nextTargetPageBtnInfo: describeElement(findTargetPageNumberButton(state.currentPage + 1)),
      chosenFormat: state.chosenFormat,
      delayConfigSec: [config.minDelaySec, config.maxDelaySec],
      eventTrace: state.eventTrace.slice(-30),
      subfolderLocation: '系统默认「下载 (Downloads)」文件夹 / ' + (config.subfolderName || 'PKULaw_Downloads'),
      timestamp: new Date().toISOString()
    };
  }

  function openAndCopyDiagnosticReport() {
    const report = buildDiagnosticReportObject();
    const jsonStr = JSON.stringify(report, null, 2);
    state.lastDiagJson = jsonStr;
    state.showDiagModal = true;
    state.diagCopiedBanner = false;
    renderBar();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(jsonStr).then(function () {
        state.diagCopiedBanner = true;
        renderBar();
      }).catch(function () {});
    }
  }

  // --------------------------------------------------------------------------
  // 10. 注入北大法宝官网底部的非遮挡动态进度栏与二级设置/诊断弹窗
  // --------------------------------------------------------------------------
  let rootEl = null;

  function ensureRootMounted() {
    if (!document.body) return null;
    const existing = document.getElementById('pkulaw-ext-root');
    if (existing) {
      rootEl = existing;
      return rootEl;
    }

    document.body.style.paddingBottom = '68px';

    rootEl = document.createElement('div');
    rootEl.id = 'pkulaw-ext-root';
    document.body.appendChild(rootEl);
    return rootEl;
  }

  function renderBar() {
    const root = ensureRootMounted();
    if (!root) return;

    const progressPct =
      state.stage === 'login_stage'
        ? 0
        : state.stage === 'search_stage'
          ? 50
          : state.stage === 'downloading'
            ? Math.min(99, Math.round((state.currentPage / Math.max(1, state.totalPages)) * 100))
            : 100;

    const pageSummaryText = '共检测到' + state.detectedTotalCount + '条法规，每页显示' + state.pageSize + '条';
    const refreshBadgeHtml = state.refreshInfoText
      ? '<span id="pkulaw-refresh-info" style="padding:5px 10px;border-radius:6px;background:rgba(16,185,129,0.18);border:1px solid #10b981;color:#6ee7b7;font-size:12px;font-weight:700;white-space:nowrap;">' +
          state.refreshInfoText +
        '</span>'
      : '';

    let mainActionHtml = '';

    if (state.stage === 'login_stage') {
      mainActionHtml =
        '<div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:#f8fafc;margin-bottom:5px;">' +
              '<span>1/2 登录机构账号：请在北大法宝网页右上角登录机构账号（支持原生 CARSI 校园登录）并获取全文下载权限</span>' +
              '<span style="color:#94a3b8;font-family:monospace;">0%</span>' +
            '</div>' +
            '<div style="width:100%;height:8px;background:#1e293b;border-radius:4px;overflow:hidden;">' +
              '<div style="width:0%;height:100%;background:#3b82f6;transition:width 0.3s;"></div>' +
            '</div>' +
          '</div>' +
          refreshBadgeHtml +
          '<button id="pkulaw-btn-confirm-login" style="padding:8px 14px;border-radius:6px;border:1px solid #3b82f6;background:#2563eb;color:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">' +
            '我已在网页完成登录 →' +
          '</button>' +
        '</div>';
    } else if (state.stage === 'search_stage') {
      const onAdvPage = window.location.href.includes('/advanced/');
      const gotoAdvBtnHtml = !onAdvPage
        ? '<button id="pkulaw-btn-goto-adv" style="padding:8px 12px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">同页打开高级检索</button>'
        : '';
      mainActionHtml =
        '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:#fef08a;margin-bottom:5px;">' +
              '<span>2/2 填写检索式：已登录账号，请在官网高级检索页面填写检索词并点击「检索」确认结果无误</span>' +
              '<span style="color:#facc15;font-family:monospace;">50%</span>' +
            '</div>' +
            '<div style="width:100%;height:8px;background:#1e293b;border-radius:4px;overflow:hidden;">' +
              '<div style="width:50%;height:100%;background:#eab308;transition:width 0.3s;"></div>' +
            '</div>' +
          '</div>' +
          refreshBadgeHtml +
          gotoAdvBtnHtml +
          '<button id="pkulaw-btn-confirm-search" style="padding:8px 14px;border-radius:6px;border:1px solid #d97706;background:#d97706;color:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">' +
            '已确认检索结果 →' +
          '</button>' +
        '</div>';
    } else if (state.stage === 'download_ready') {
      const countLabel =
        state.detectedTotalCount > 0
          ? '（' + pageSummaryText + ' / 共 ' + state.totalPages + ' 页）'
          : '';
      mainActionHtml =
        '<div style="display:flex;align-items:center;gap:12px;flex:1;">' +
          (state.refreshInfoText ? refreshBadgeHtml : '') +
          '<button id="pkulaw-btn-start-download" style="flex:1;padding:10px 20px;border-radius:8px;border:none;background:#16a34a;color:#ffffff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 2px 8px rgba(22,163,74,0.35);">' +
            '<span>▶ 开始下载 ' + countLabel + ' — 自动勾选全选并弹出「自定义下载」格式框</span>' +
          '</button>' +
          '<button id="pkulaw-btn-reset-steps" style="padding:8px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#cbd5e1;font-size:12px;cursor:pointer;white-space:nowrap;">' +
            '重置步骤' +
          '</button>' +
        '</div>';
    } else if (state.stage === 'waiting_format_choice') {
      mainActionHtml =
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex:1;">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<span style="font-size:14px;font-weight:700;color:#38bdf8;line-height:1.35;">' +
              (state.statusMessage || '请选择下载格式') +
            '</span>' +
            refreshBadgeHtml +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;white-space:nowrap;">' +
            '<button id="pkulaw-btn-retry-open-modal" style="padding:7px 12px;border-radius:6px;border:1px solid #16a34a;background:#15803d;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;">' +
              '🔄 重新勾选全选并打开格式框' +
            '</button>' +
            '<button id="pkulaw-btn-stop" style="padding:7px 12px;border-radius:6px;border:1px solid #ef4444;background:#7f1d1d;color:#fecaca;font-size:12px;font-weight:600;cursor:pointer;">' +
              '取消下载' +
            '</button>' +
          '</div>' +
        '</div>';
    } else if (state.stage === 'downloading') {
      mainActionHtml =
        '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:#4ade80;margin-bottom:5px;">' +
              '<span>⏳ ' + state.statusMessage + '</span>' +
              '<span style="font-family:monospace;">第 ' + state.currentPage + '/' + state.totalPages + ' 页 | 已触发压缩包下载: ' + Math.max(state.startedDownloadsCount, state.completedZipFiles) + ' (已完成: ' + state.completedZipFiles + ')</span>' +
            '</div>' +
            '<div style="width:100%;height:8px;background:#1e293b;border-radius:4px;overflow:hidden;">' +
              '<div style="width:' + progressPct + '%;height:100%;background:#22c55e;transition:width 0.3s;"></div>' +
            '</div>' +
          '</div>' +
          '<button id="pkulaw-btn-open-folder" style="padding:8px 12px;border-radius:6px;border:1px solid #3b82f6;background:#1e3a8a;color:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">' +
            '📂 打开下载目录' +
          '</button>' +
          '<button id="pkulaw-btn-stop" style="padding:8px 14px;border-radius:6px;border:1px solid #ef4444;background:#991b1b;color:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">' +
            '停止下载' +
          '</button>' +
        '</div>';
    } else if (state.stage === 'captcha_paused') {
      mainActionHtml =
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex:1;">' +
          '<div style="font-size:13px;font-weight:700;color:#fbbf24;display:flex;align-items:center;gap:8px;">' +
            '<span>⚠️ ' + state.statusMessage + '</span>' +
            '<span style="padding:3px 8px;border-radius:4px;background:rgba(245,158,11,0.2);border:1px solid #f59e0b;color:#fde68a;font-size:11px;">🔄 自动监测验证状态中（验证完成自动恢复）</span>' +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button id="pkulaw-btn-stop" style="padding:8px 12px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#cbd5e1;font-size:12px;cursor:pointer;white-space:nowrap;">' +
              '终止下载' +
            '</button>' +
          '</div>' +
        '</div>';
    } else if (state.stage === 'completed') {
      mainActionHtml =
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex:1;">' +
          '<div style="font-size:13px;font-weight:700;color:#4ade80;">' +
            '✅ ' + state.statusMessage + '（各页原始压缩包已保存在系统「下载/' + (config.subfolderName || 'PKULaw_Downloads') + '」目录）' +
          '</div>' +
          '<div style="display:flex;gap:8px;white-space:nowrap;">' +
            '<button id="pkulaw-btn-open-folder" style="padding:8px 14px;border-radius:6px;border:none;background:#16a34a;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">' +
              '📂 打开下载文件夹查看压缩包' +
            '</button>' +
            '<button id="pkulaw-btn-restart" style="padding:8px 14px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer;">' +
              '返回继续下载' +
            '</button>' +
          '</div>' +
        '</div>';
    }

    const settingsModalHtml = state.showSettingsModal
      ? '<div style="position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;">' +
          '<div style="width:100%;max-width:480px;background:#0f172a;border:1px solid #334155;border-radius:12px;padding:20px;color:#f8fafc;box-shadow:0 20px 40px rgba(0,0,0,0.5);font-family:system-ui,-apple-system,sans-serif;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:12px;margin-bottom:14px;">' +
              '<span style="font-size:15px;font-weight:700;">下载与扩展设置 (v3.3.0)</span>' +
              '<button id="pkulaw-modal-close" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;">×</button>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:12px;font-size:13px;">' +
              '<div>' +
                '<label style="display:block;color:#cbd5e1;margin-bottom:4px;font-weight:600;">浏览器默认下载子文件夹名称（原始压缩包将直接保存在系统“下载/Downloads”此子目录下）</label>' +
                '<input id="pkulaw-input-subfolder" type="text" value="' + config.subfolderName + '" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#fff;font-family:monospace;" />' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '<div>' +
                  '<label style="display:block;color:#cbd5e1;margin-bottom:4px;font-weight:600;">最小翻页间隔 (秒，最低 0.5)</label>' +
                  '<input id="pkulaw-input-mindelay" type="number" step="0.5" min="0.5" max="30" value="' + config.minDelaySec + '" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#fff;" />' +
                '</div>' +
                '<div>' +
                  '<label style="display:block;color:#cbd5e1;margin-bottom:4px;font-weight:600;">最大翻页间隔 (秒，最低 1.0)</label>' +
                  '<input id="pkulaw-input-maxdelay" type="number" step="0.5" min="1.0" max="60" value="' + config.maxDelaySec + '" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#fff;" />' +
                '</div>' +
              '</div>' +
              '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button id="pkulaw-preset-ultra" type="button" style="padding:5px 10px;border-radius:6px;border:1px solid #0284c7;background:#0369a1;color:#fff;font-size:11px;font-weight:600;cursor:pointer;">⚡ 极速模式 (0.5s ~ 1.2s)</button>' +
                '<button id="pkulaw-preset-fast" type="button" style="padding:5px 10px;border-radius:6px;border:1px solid #16a34a;background:#15803d;color:#fff;font-size:11px;font-weight:600;cursor:pointer;">🚀 默认快速 (1.0s ~ 2.0s)</button>' +
                '<button id="pkulaw-preset-safe" type="button" style="padding:5px 10px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#cbd5e1;font-size:11px;font-weight:600;cursor:pointer;">🛡️ 稳妥防封 (3.0s ~ 5.0s)</button>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:16px;padding-top:12px;border-top:1px solid #1e293b;">' +
              '<button id="pkulaw-modal-open-dir" style="padding:8px 12px;border-radius:6px;border:1px solid #3b82f6;background:#1e3a8a;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">📂 打开浏览器默认下载目录</button>' +
              '<div style="display:flex;gap:10px;">' +
                '<button id="pkulaw-modal-cancel" style="padding:8px 14px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#cbd5e1;font-size:12px;cursor:pointer;">取消</button>' +
                '<button id="pkulaw-modal-save" style="padding:8px 16px;border-radius:6px;border:none;background:#16a34a;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">保存设置</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>'
      : '';

    const diagModalHtml = state.showDiagModal
      ? '<div style="position:fixed;inset:0;background:rgba(15,23,42,0.7);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;">' +
          '<div style="width:100%;max-width:620px;background:#0f172a;border:1px solid #38bdf8;border-radius:12px;padding:20px;color:#f8fafc;box-shadow:0 20px 40px rgba(0,0,0,0.6);font-family:system-ui,-apple-system,sans-serif;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:12px;margin-bottom:12px;">' +
              '<span style="font-size:15px;font-weight:700;color:#38bdf8;">🔍 网页 DOM 元素诊断与单步调试面板 (v3.3.0)</span>' +
              '<button id="pkulaw-diag-close" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;">×</button>' +
            '</div>' +
            (state.diagCopiedBanner
              ? '<div style="margin-bottom:10px;padding:8px 12px;border-radius:6px;background:rgba(22,163,74,0.2);border:1px solid #16a34a;color:#4ade80;font-size:12px;font-weight:600;">✅ 诊断 JSON（含实时步骤追踪日志 eventTrace）已自动复制到剪贴板！可直接粘贴发送给开发者：</div>'
              : '') +
            '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">' +
              '<button id="pkulaw-diag-test-selectall" style="padding:7px 12px;border-radius:6px;border:1px solid #3b82f6;background:#1d4ed8;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">1. 测试勾选本页全部法规</button>' +
              '<button id="pkulaw-diag-test-dlmodal" style="padding:7px 12px;border-radius:6px;border:1px solid #16a34a;background:#15803d;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">2. 测试点击「↓ 下载图标」弹出格式框</button>' +
              '<button id="pkulaw-diag-recopy" style="padding:7px 12px;border-radius:6px;border:1px solid #0284c7;background:#0369a1;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">📋 重新刷新并复制 JSON</button>' +
            '</div>' +
            '<textarea id="pkulaw-diag-textarea" readonly style="width:100%;height:220px;box-sizing:border-box;padding:10px;border-radius:6px;border:1px solid #334155;background:#020617;color:#38bdf8;font-family:monospace;font-size:11px;line-height:1.45;">' +
              state.lastDiagJson +
            '</textarea>' +
            '<div style="display:flex;justify-content:flex-end;margin-top:12px;">' +
              '<button id="pkulaw-diag-close-btn" style="padding:8px 16px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer;">关闭窗口</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      : '';

    root.innerHTML =
      settingsModalHtml +
      diagModalHtml +
      '<div style="position:fixed;left:0;right:0;bottom:0;height:60px;background:#0f172a;border-top:2px solid #8B1E24;z-index:2147483645;display:flex;align-items:center;justify-content:space-between;padding:0 18px;gap:14px;box-shadow:0 -4px 20px rgba(0,0,0,0.35);font-family:system-ui,-apple-system,sans-serif;">' +
        '<div style="display:flex;align-items:center;gap:8px;white-space:nowrap;">' +
          '<span style="display:inline-block;padding:4px 8px;border-radius:4px;background:#8B1E24;color:#fff;font-size:12px;font-weight:700;">法宝批量下载扩展 v3.3</span>' +
        '</div>' +
        mainActionHtml +
        '<div style="display:flex;align-items:center;gap:8px;white-space:nowrap;">' +
          '<button id="pkulaw-btn-refresh" title="重新读取页面信息并显示总条数与每页显示条数" style="padding:7px 12px;border-radius:6px;border:1px solid #10b981;background:#065f46;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;">' +
            '🔄 刷新' +
          '</button>' +
          '<button id="pkulaw-btn-open-settings" style="padding:7px 12px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer;">' +
            '⚙ 下载设置' +
          '</button>' +
          '<button id="pkulaw-btn-copy-diag" title="打开网页元素诊断与单步测试面板并复制 JSON" style="padding:7px 12px;border-radius:6px;border:1px solid #38bdf8;background:#0284c7;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;">' +
            '🔍 诊断与调试' +
          '</button>' +
        '</div>' +
      '</div>';

    bindBarEvents(root);
  }

  window.__PKULAW_FORCE_RENDER__ = renderBar;

  function bindBarEvents(root) {
    const btnRefresh = root.querySelector('#pkulaw-btn-refresh');
    if (btnRefresh) {
      btnRefresh.onclick = function () {
        refreshPageInfoAndDisplay();
      };
    }

    const btnConfirmLogin = root.querySelector('#pkulaw-btn-confirm-login');
    if (btnConfirmLogin) {
      btnConfirmLogin.onclick = function () {
        session = saveSession({ manualLoginConfirmed: true });
        state.everDetectedLoggedIn = true;
        state.domLoggedIn = true;
        state.stage = state.domHasResults ? 'download_ready' : 'search_stage';
        renderBar();
      };
    }

    const btnGotoAdv = root.querySelector('#pkulaw-btn-goto-adv');
    if (btnGotoAdv) {
      btnGotoAdv.onclick = function () {
        window.location.href = 'https://www.pkulaw.com/advanced/law';
      };
    }

    const btnConfirmSearch = root.querySelector('#pkulaw-btn-confirm-search');
    if (btnConfirmSearch) {
      btnConfirmSearch.onclick = function () {
        session = saveSession({ manualSearchConfirmed: true });
        state.domHasResults = true;
        state.stage = 'download_ready';
        renderBar();
      };
    }

    const btnResetSteps = root.querySelector('#pkulaw-btn-reset-steps');
    if (btnResetSteps) {
      btnResetSteps.onclick = function () {
        touchBatchLock(false);
        state.everDetectedLoggedIn = false;
        session = saveSession({
          manualLoginConfirmed: false,
          manualSearchConfirmed: false,
          resumeDownloading: false
        });
        detectPkulawDomState();
        renderBar();
      };
    }

    const btnStartDownload = root.querySelector('#pkulaw-btn-start-download');
    if (btnStartDownload) {
      btnStartDownload.onclick = function () {
        startBatchDownloadProcess();
      };
    }

    const btnRetryOpenModal = root.querySelector('#pkulaw-btn-retry-open-modal');
    if (btnRetryOpenModal) {
      btnRetryOpenModal.onclick = function () {
        startBatchDownloadProcess();
      };
    }

    const btnStop = root.querySelector('#pkulaw-btn-stop');
    if (btnStop) {
      btnStop.onclick = function () {
        state.stopRequested = true;
        touchBatchLock(false);
        session = saveSession({ resumeDownloading: false });
        state.stage = 'download_ready';
        renderBar();
      };
    }

    const btnOpenFolder = root.querySelector('#pkulaw-btn-open-folder');
    if (btnOpenFolder) {
      btnOpenFolder.onclick = function () {
        requestOpenBrowserDownloadsFolder();
      };
    }

    const btnModalOpenDir = root.querySelector('#pkulaw-modal-open-dir');
    if (btnModalOpenDir) {
      btnModalOpenDir.onclick = function () {
        requestOpenBrowserDownloadsFolder();
      };
    }

    const btnRestart = root.querySelector('#pkulaw-btn-restart');
    if (btnRestart) {
      btnRestart.onclick = function () {
        state.stage = 'download_ready';
        renderBar();
      };
    }

    const btnOpenSettings = root.querySelector('#pkulaw-btn-open-settings');
    if (btnOpenSettings) {
      btnOpenSettings.onclick = function () {
        state.showSettingsModal = true;
        renderBar();
      };
    }

    const btnCopyDiag = root.querySelector('#pkulaw-btn-copy-diag');
    if (btnCopyDiag) {
      btnCopyDiag.onclick = function () {
        openAndCopyDiagnosticReport();
      };
    }

    const btnDiagClose = root.querySelector('#pkulaw-diag-close');
    const btnDiagClose2 = root.querySelector('#pkulaw-diag-close-btn');
    if (btnDiagClose) btnDiagClose.onclick = function () { state.showDiagModal = false; renderBar(); };
    if (btnDiagClose2) btnDiagClose2.onclick = function () { state.showDiagModal = false; renderBar(); };

    const btnDiagTestSelectAll = root.querySelector('#pkulaw-diag-test-selectall');
    if (btnDiagTestSelectAll) {
      btnDiagTestSelectAll.onclick = async function () {
        await selectAllOnCurrentPage();
        openAndCopyDiagnosticReport();
      };
    }

    const btnDiagTestDlModal = root.querySelector('#pkulaw-diag-test-dlmodal');
    if (btnDiagTestDlModal) {
      btnDiagTestDlModal.onclick = async function () {
        state.showDiagModal = false;
        renderBar();
        await selectAllOnCurrentPage();
        await sleep(250);
        await triggerOpenCustomDownloadModal();
      };
    }

    const btnDiagRecopy = root.querySelector('#pkulaw-diag-recopy');
    if (btnDiagRecopy) {
      btnDiagRecopy.onclick = function () {
        openAndCopyDiagnosticReport();
        const ta = root.querySelector('#pkulaw-diag-textarea');
        if (ta && ta.select) ta.select();
      };
    }

    const btnModalClose = root.querySelector('#pkulaw-modal-close');
    const btnModalCancel = root.querySelector('#pkulaw-modal-cancel');
    if (btnModalClose) btnModalClose.onclick = function () { state.showSettingsModal = false; renderBar(); };
    if (btnModalCancel) btnModalCancel.onclick = function () { state.showSettingsModal = false; renderBar(); };

    const btnPresetUltra = root.querySelector('#pkulaw-preset-ultra');
    if (btnPresetUltra) {
      btnPresetUltra.onclick = function () {
        const minInput = root.querySelector('#pkulaw-input-mindelay');
        const maxInput = root.querySelector('#pkulaw-input-maxdelay');
        if (minInput) minInput.value = '0.5';
        if (maxInput) maxInput.value = '1.2';
      };
    }
    const btnPresetFast = root.querySelector('#pkulaw-preset-fast');
    if (btnPresetFast) {
      btnPresetFast.onclick = function () {
        const minInput = root.querySelector('#pkulaw-input-mindelay');
        const maxInput = root.querySelector('#pkulaw-input-maxdelay');
        if (minInput) minInput.value = '1.0';
        if (maxInput) maxInput.value = '2.0';
      };
    }
    const btnPresetSafe = root.querySelector('#pkulaw-preset-safe');
    if (btnPresetSafe) {
      btnPresetSafe.onclick = function () {
        const minInput = root.querySelector('#pkulaw-input-mindelay');
        const maxInput = root.querySelector('#pkulaw-input-maxdelay');
        if (minInput) minInput.value = '3.0';
        if (maxInput) maxInput.value = '5.0';
      };
    }

    const btnModalSave = root.querySelector('#pkulaw-modal-save');
    if (btnModalSave) {
      btnModalSave.onclick = function () {
        const subInput = root.querySelector('#pkulaw-input-subfolder');
        const minInput = root.querySelector('#pkulaw-input-mindelay');
        const maxInput = root.querySelector('#pkulaw-input-maxdelay');

        const parsedMin = minInput ? Math.max(0.3, parseFloat(minInput.value) || 1.0) : config.minDelaySec;
        const parsedMax = maxInput ? Math.max(parsedMin + 0.3, parseFloat(maxInput.value) || 2.0) : config.maxDelaySec;

        config = saveConfig({
          subfolderName: subInput ? subInput.value.trim() || 'PKULaw_Downloads' : config.subfolderName,
          minDelaySec: parsedMin,
          maxDelaySec: parsedMax,
          hasConfiguredFirstDownload: true
        });
        state.showSettingsModal = false;
        renderBar();
      };
    }
  }

  function boot() {
    if (!document.body) {
      setTimeout(boot, 100);
      return;
    }
    if (checkIfAuxiliaryDownloadPopupTab()) {
      return;
    }

    detectPkulawDomState();
    renderBar();

    if (session.isMainSearchTab && session.resumeDownloading && state.domHasResults) {
      state.stage = 'downloading';
      state.currentPage = session.currentPage || 1;
      state.downloadedBatches = session.downloadedBatches || 1;
      state.chosenFormat = session.chosenFormat || config.lastChosenFormat || '纯净版';
      state.statusMessage = '已恢复第 ' + state.currentPage + ' 页批量下载状态，正在继续执行...';
      touchBatchLock(true);
      renderBar();
      setTimeout(function () {
        runNextPageLoop();
      }, 1500);
    }

    window.__PKULAW_EXT_INTERVAL__ = setInterval(function () {
      const prevStage = state.stage;
      const prevCount = state.detectedTotalCount;
      const prevPageSize = state.pageSize;
      detectPkulawDomState();
      // 定时看门狗自愈：若处于 waiting_format_choice 阶段且浏览器已记录到第 1 页下载开始/完成，立即切入自动翻页循环
      if (
        state.stage === 'waiting_format_choice' &&
        !state.loopRunning &&
        state.downloadedBatches === 0 &&
        (state.startedDownloadsCount > 0 || state.completedZipFiles > 0)
      ) {
        triggerFirstPageConfirmedAndStartLoop('watchdog_interval_resume', findCustomDownloadModal(), state.recordedConfirmBtn, state.recordedConfirmRawTarget);
        return;
      }
      if (
        !document.getElementById('pkulaw-ext-root') ||
        state.stage !== prevStage ||
        state.detectedTotalCount !== prevCount ||
        state.pageSize !== prevPageSize
      ) {
        if (state.refreshInfoText && (state.detectedTotalCount !== prevCount || state.pageSize !== prevPageSize)) {
          state.refreshInfoText = '共检测到' + state.detectedTotalCount + '条法规，每页显示' + state.pageSize + '条';
        }
        renderBar();
      }
    }, 1500);
  }

  boot();
})();
`;
}

export function generateExtensionReadme(): string {
  return [
    '====================================================================',
    '北大法宝法律法规批量下载扩展 v3.3.0 (适用于 Microsoft Edge 与 Google Chrome)',
    '====================================================================',
    '',
    '【一、 v3.3.0 核心升级说明】',
    '1. 彻底解决「第 2+ 页下载成了《【北大法宝】目录列表.xls》而非第 1 页所选法规全文压缩包 (.zip)」的问题：',
    '   - 根因修复：v3.2.0 在第 2+ 页对同一个单选框/复选框连续派发了 3 次点击（导致已勾选项被取消回退为默认的 Excel 目录列表），且未录制第 1 页用户在弹窗内对各个单选/复选框的操作。',
    '   - v3.3.0 新增「第 1 页弹窗选项路径录制 + 全量 Input 勾选快照 1:1 同步」机制：第 1 页点击确定瞬间完整快照弹窗内所有单选/复选框状态，第 2+ 页采用单次干净点击并严格校验目标全文格式处于勾选状态、默认目录项处于未误勾状态。',
    '2. 彻底解决「同一页重复下载多次（目录列表 (1)、(2)...）」的问题：',
    '   - 根因修复：法宝点击「确定」后按钮会进入 Element UI 的 .is-loading 禁用等待打包状态（耗时约 3~8 秒），v3.2.0 在弹窗未关闭时于 220ms、970ms、6500ms 重复点击了确定按钮，导致服务端收到多次请求。',
    '   - v3.3.0 新增 isModalLoadingOrClosed 状态锁：精准点击真正的 <button> 一次后，一旦检测到按钮进入 .is-loading 或 disabled 状态即停止重点，静候服务端完成 ZIP 打包。',
    '3. 隔页等待随机时间间隔缩至最小：',
    '   - 默认隔页随机等待时间已从 4.5s~8.5s 大幅缩短为 1.0s~2.0s（并在底部「⚙ 下载设置」中提供一键切换「⚡ 极速模式 0.5s~1.2s」按钮）。',
    '',
    '【二、 如何更新到 Edge / Chrome 浏览器】',
    '1. 将最新下载的 PKULaw_Edge_Chrome_Extension.zip 解压覆盖到原文件夹。',
    '2. 打开 Edge 地址栏输入 edge://extensions（Chrome 输入 chrome://extensions）。',
    '3. 点击本扩展卡片上的「重新加载」按钮，确认版本号变为 3.3.0，随后刷新北大法宝网页即可。',
  ].join('\r\n');
}

export function generateExtensionReadmeMarkdown(): string {
  return `# 北大法宝法律法规批量下载扩展 v3.3.0 (Edge / Chrome)

本扩展（Manifest V3）专为 **北大法宝 V6 (\`https://www.pkulaw.com\`)** 打造，在网页底部注入可视化批量下载控制条，支持自动全选、跨页自动同步下载格式、人机验证实时监测自动恢复与原始压缩包归档。

## 一、 v3.3.0 核心特性

1. **第 1 页弹窗格式录制 + 第 2 页起 1:1 状态同步**：
   - 第 1 页在「批量下载」弹窗中选择全文格式（纯文本 / 纯净版 / Word / PDF / 超文本）并点击「确定」时，自动记录弹窗内点击路径与全部单选/复选框状态快照。
   - 第 2 页起单次精准点击并校验目标格式与复选框状态，彻底杜绝后续分页回退为默认《【北大法宝】目录列表.xls》的问题。
2. **防重复下载状态锁 (\`isModalLoadingOrClosed\`)**：
   - 精准识别确定按钮的 \`.is-loading\` / \`disabled\` 服务端打包状态，确保每页严格只触发 1 次下载。
3. **三档隔页等待速度预设**：
   - 默认间隔缩短至 \`1.0s ~ 2.0s\`，并可在底部「⚙ 下载设置」中一键切换「⚡ 极速模式 (\`0.5s ~ 1.2s\`)」、「🚀 默认快速 (\`1.0s ~ 2.0s\`)」或「🛡️ 稳妥防封 (\`3.0s ~ 5.0s\`)」。
4. **人工验证自动监测恢复**：
   - 仅当滑块/验证码浮层居中遮挡视口时暂停，用户在网页内完成验证后全自动恢复下载。

## 二、 安装与更新步骤

1. 将压缩包解压到本地固定文件夹（如 \`D:\\PKULaw_Extension\`）。
2. 打开浏览器扩展管理页面：
   - **Edge**：地址栏输入 \`edge://extensions\`，开启「开发人员模式」。
   - **Chrome**：地址栏输入 \`chrome://extensions\`，开启「开发者模式」。
3. 点击 **「加载解压缩的扩展 / 加载已解压的扩展程序」**，选择解压后的文件夹。
4. 若为覆盖更新，点击扩展卡片上的 **「刷新/重新加载 (⟳)」** 按钮，确认版本号为 \`3.3.0\`，然后刷新北大法宝网页即可使用。
`;
}

export function buildExtensionZipBytes(settings: AppSettings): Uint8Array {
  const entries: ZipFileEntry[] = [
    {
      name: 'manifest.json',
      content: generateManifestJson(),
    },
    {
      name: 'page_hook.js',
      content: generatePageHookJs(),
    },
    {
      name: 'background.js',
      content: generateBackgroundJs(settings),
    },
    {
      name: 'content.js',
      content: generateContentJs(settings),
    },
    {
      name: 'README.md',
      content: generateExtensionReadmeMarkdown(),
    },
    {
      name: 'README_安装与测试指南.txt',
      content: generateExtensionReadme(),
    },
  ];
  return createZipArchive(entries);
}

