// ============================================================================
// 北大法宝批量下载助手 - 页面主世界钩子 (page_hook.js v3.3.4, world: MAIN)
// 核心作用：当第 2 页及后续分页由扩展定时器自动点击「确定」触发下载时，
// 网页处于无用户手势状态 (navigator.userActivation.isActive === false)，
// 浏览器内置弹窗拦截器会拦截网页的 window.open / target="_blank" 表单提交，导致后续页无法下载。
// 本脚本在 MAIN 世界拦截被阻止的下载弹窗与异步下载 URL，并交由扩展后台静默打开完成下载。
// ============================================================================
(function () {
  if (window.__PKULAW_MAIN_HOOK_INSTALLED__) return;
  window.__PKULAW_MAIN_HOOK_INSTALLED__ = true;

  function isBatchActive() {
    try {
      return document.documentElement && document.documentElement.getAttribute("data-pkulaw-batch-active") === "true";
    } catch (e) {
      return false;
    }
  }

  function ensureHiddenDownloadIframe() {
    var frameName = "pkulaw_ext_hidden_dl_iframe";
    var existing = document.getElementById(frameName);
    if (existing) return frameName;
    try {
      var iframe = document.createElement("iframe");
      iframe.id = frameName;
      iframe.name = frameName;
      iframe.style.cssText = "display:none !important;width:0 !important;height:0 !important;border:0 !important;";
      (document.body || document.documentElement).appendChild(iframe);
    } catch (e) {}
    return frameName;
  }

  function notifyExtensionOpenDownloadUrl(rawUrl) {
    if (!rawUrl) return;
    var str = String(rawUrl).trim();
    if (!str || str === "about:blank" || str.indexOf("javascript:") === 0) return;
    try {
      var fullUrl = new URL(str, window.location.href).href;
      window.postMessage({
        source: "PKULAW_EXT_MAIN_HOOK",
        type: "PKULAW_FORCE_OPEN_URL",
        url: fullUrl
      }, "*");
    } catch (e) {}
  }

  function createSyntheticWindowProxy(initialUrl) {
    if (initialUrl && String(initialUrl).trim() && String(initialUrl).trim() !== "about:blank") {
      notifyExtensionOpenDownloadUrl(initialUrl);
    }
    var fakeLocation = {
      _href: initialUrl || "about:blank",
      assign: function (u) { this._href = u; notifyExtensionOpenDownloadUrl(u); },
      replace: function (u) { this._href = u; notifyExtensionOpenDownloadUrl(u); },
      reload: function () {}
    };
    Object.defineProperty(fakeLocation, "href", {
      get: function () { return this._href; },
      set: function (u) { this._href = u; notifyExtensionOpenDownloadUrl(u); }
    });
    var fakeWin = {
      closed: false,
      focus: function () {},
      blur: function () {},
      close: function () { this.closed = true; },
      postMessage: function () {},
      document: {
        open: function () {},
        write: function () {},
        writeln: function () {},
        close: function () {}
      }
    };
    Object.defineProperty(fakeWin, "location", {
      get: function () { return fakeLocation; },
      set: function (u) { fakeLocation.href = u; }
    });
    return fakeWin;
  }

  var origWindowOpen = window.open;
  window.open = function (url, target, features) {
    if (!isBatchActive()) {
      return origWindowOpen.apply(window, arguments);
    }
    var win = null;
    try {
      win = origWindowOpen.apply(window, arguments);
    } catch (e) {
      win = null;
    }
    // 若因第 2+ 页无用户手势导致浏览器拦截了 window.open (返回 null)，立即使用代理对象并通过后台特权通道打开下载链接
    if (!win) {
      return createSyntheticWindowProxy(url);
    }
    return win;
  };

  var origFormSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    try {
      if (isBatchActive() && this.target === "_blank") {
        var hasGesture = window.navigator && window.navigator.userActivation && window.navigator.userActivation.isActive;
        if (!hasGesture) {
          this.target = ensureHiddenDownloadIframe();
        }
      }
    } catch (e) {}
    return origFormSubmit.apply(this, arguments);
  };

  var origAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    try {
      if (isBatchActive() && this.target === "_blank") {
        var href = this.getAttribute("href") || this.href || "";
        var hasGesture = window.navigator && window.navigator.userActivation && window.navigator.userActivation.isActive;
        if (!hasGesture && href && href.indexOf("javascript:") !== 0 && href.indexOf("/advanced/") === -1) {
          this.target = ensureHiddenDownloadIframe();
        }
      }
    } catch (e) {}
    return origAnchorClick.apply(this, arguments);
  };
})();
