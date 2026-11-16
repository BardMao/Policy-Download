// ============================================================================
// 北大法宝批量下载助手 - Chrome / Edge Manifest V3 后台服务 (background.js v3.3.3)
// 功能：1. 安装或重载扩展时立即向已打开的北大法宝标签页注入 page_hook.js 与 content.js
//       2. 提供特权后台下载通道 (PKULAW_FORCE_OPEN_DOWNLOAD_URL)，突破第 2+ 页浏览器异步弹窗拦截
//       3. 自动归档 pkulaw.com 下载的原始压缩包至浏览器默认“下载/Downloads”目录下的子文件夹
// ============================================================================

const pendingDownloads = new Map();
function isPkulawUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && (url.hostname === "pkulaw.com" || url.hostname.endsWith(".pkulaw.com"));
  } catch (_) { return false; }
}
function isPkulawDownload(item) {
  return [item.url, item.referrer, item.finalUrl].some(isPkulawUrl);
}
let lastDownloadItemId = null;
const DEFAULT_SUBFOLDER = "PKULaw_Downloads";

// 记录当前正在执行批量下载的主检索标签页与新弹出的临时下载窗口/标签页
const batchState = {
  active: false,
  mainTabId: null,
  mainWindowId: null,
  lastActiveTimestamp: 0
};
const trackedDownloadTabIds = new Set();

function refocusMainSearchTab() {
  if (!batchState.mainTabId) return;
  try {
    chrome.tabs.update(batchState.mainTabId, { active: true }).catch(() => {});
    if (batchState.mainWindowId) {
      chrome.windows.update(batchState.mainWindowId, { focused: true }).catch(() => {});
    }
  } catch (e) {}
}

function closeTrackedDownloadTabs(delayMs) {
  const wait = typeof delayMs === "number" ? delayMs : 650;
  setTimeout(() => {
    const ids = Array.from(trackedDownloadTabIds);
    ids.forEach((tabId) => {
      if (tabId && tabId !== batchState.mainTabId) {
        trackedDownloadTabIds.delete(tabId);
        chrome.tabs.remove(tabId).catch(() => {});
      }
    });
    refocusMainSearchTab();
  }, wait);
}

function injectScriptsIntoTab(tabId) {
  if (!tabId || !chrome.scripting) return;
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ["page_hook.js"],
    world: "MAIN"
  }).catch(() => {});
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ["content.js"]
  }).catch(() => {});
}

function injectIntoOpenPkulawTabs() {
  try {
    if (!chrome.tabs || !chrome.scripting) return;
    chrome.tabs.query({ url: ["*://*.pkulaw.com/*", "*://pkulaw.com/*"] }, (tabs) => {
      if (chrome.runtime.lastError || !tabs) return;
      tabs.forEach((tab) => {
        if (tab && tab.id) {
          injectScriptsIntoTab(tab.id);
        }
      });
    });
  } catch (e) {
    console.warn("[PKULaw Ext] injectIntoOpenPkulawTabs error:", e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  injectIntoOpenPkulawTabs();
});

if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener((tab) => {
    if (tab && tab.id && isPkulawUrl(tab.url)) {
      injectScriptsIntoTab(tab.id);
    } else {
      chrome.tabs.create({ url: "https://www.pkulaw.com/law" });
    }
  });
}

// 监听来自 content.js 的主检索页注册、打开下载目录与新开下载窗口管理请求
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type || sender.frameId !== 0 || !isPkulawUrl(sender.url)) return false;
  if (msg.type === "PKULAW_SET_BATCH_ACTIVE") {
    batchState.active = Boolean(msg.active);
    if (sender && sender.tab && sender.tab.id) {
      batchState.mainTabId = sender.tab.id;
      batchState.mainWindowId = sender.tab.windowId;
      if (batchState.active && chrome.scripting) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          files: ["page_hook.js"],
          world: "MAIN"
        }).catch(() => {});
      }
    }
    batchState.lastActiveTimestamp = Date.now();
    sendResponse({ ok: true, mainTabId: batchState.mainTabId });
    return true;
  }
  if (msg.type === "PKULAW_TOUCH_BATCH_HEARTBEAT") {
    batchState.active = true;
    if (sender && sender.tab && sender.tab.id) {
      batchState.mainTabId = sender.tab.id;
      batchState.mainWindowId = sender.tab.windowId;
    }
    batchState.lastActiveTimestamp = Date.now();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "PKULAW_FORCE_OPEN_DOWNLOAD_URL") {
    const targetUrl = msg.url ? String(msg.url).trim() : "";
    if (batchState.active && sender.frameId === 0 && sender.tab?.id === batchState.mainTabId && isPkulawUrl(targetUrl)) {
      batchState.lastActiveTimestamp = Date.now();
      chrome.tabs.create({ url: targetUrl, active: false }, (createdTab) => {
        if (createdTab && createdTab.id) {
          trackedDownloadTabIds.add(createdTab.id);
        }
      });
    }
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "PKULAW_OPEN_DOWNLOADS_FOLDER") {
    try {
      if (lastDownloadItemId !== null && chrome.downloads && chrome.downloads.show) {
        chrome.downloads.show(lastDownloadItemId);
      } else if (chrome.downloads && chrome.downloads.showDefaultFolder) {
        chrome.downloads.showDefaultFolder();
      }
    } catch (e) {
      if (chrome.downloads && chrome.downloads.showDefaultFolder) {
        chrome.downloads.showDefaultFolder();
      }
    }
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "PKULAW_CLOSE_AUX_DOWNLOAD_TAB") {
    closeTrackedDownloadTabs(msg.delayMs || 650);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

chrome.downloads.onCreated.addListener((item) => {
  if (batchState.active && isPkulawDownload(item)) pendingDownloads.set(item.id, batchState.mainTabId);
});

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  try {
    if (batchState.active && isPkulawDownload(item) && /\.zip$/i.test(item.filename || "")) {
      chrome.storage.local.get(["subfolderName", "enableSubfolder"], (res) => {
        const useSub = res && res.enableSubfolder !== false;
        const rawFolder = (res && res.subfolderName) ? res.subfolderName : DEFAULT_SUBFOLDER;
        const folder = String(rawFolder).replace(/[^a-zA-Z0-9_\u4e00-\u9fa5\-]/g, "_");
        const cleanFilename = (item.filename || "pkulaw_batch.zip").replace(/^[\\/]+/, "");
        if (useSub && folder) {
          suggest({
            filename: folder + "/" + cleanFilename,
            conflictAction: "uniquify"
          });
        } else {
          suggest({ filename: cleanFilename, conflictAction: "uniquify" });
        }
      });
      return true;
    }
  } catch (err) {
    console.warn("[PKULaw Ext] onDeterminingFilename error:", err);
  }
  return false;
});

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state || !["complete", "interrupted"].includes(delta.state.current)) return;
  const tabId = pendingDownloads.get(delta.id);
  if (!tabId) return;
  pendingDownloads.delete(delta.id);
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item) return;
  const complete = item.state === "complete" && /\.zip$/i.test(item.filename) && item.fileSize > 0;
  if (complete) {
    lastDownloadItemId = item.id;
    closeTrackedDownloadTabs(250);
  }
  chrome.tabs.sendMessage(tabId, {
    type: complete ? "PKULAW_DOWNLOAD_COMPLETED" : "PKULAW_DOWNLOAD_FAILED",
    downloadId: item.id
  }, { frameId: 0 }).catch(() => {});
});
