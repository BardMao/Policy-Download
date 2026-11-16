import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { generateBackgroundJs, generateContentJs } from './extensionGenerator.ts';

test('pagination gets a fresh verification window after manual CAPTCHA', async () => {
  const source = generateContentJs({ downloadDir: '测试' });
  const start = source.indexOf('  async function navigateToNextPageAndVerify(');
  const end = source.indexOf('  // --------------------------------------------------------------------------', start);
  assert.ok(start >= 0 && end > start);

  const target = {};
  let tick = 0;
  let resumedAt = 0;
  let clickCount = 0;
  let actualPage = 10;
  let signature = '181. 上一页';
  const navigate = runInNewContext(source.slice(start, end) + '\nnavigateToNextPageAndVerify', {
    state: { stopRequested: false },
    findTargetPageNumberButton: () => target,
    clickPaginationControlOnce: (node) => {
      assert.equal(node, target);
      clickCount++;
    },
    sleep: async () => {
      tick++;
      if (resumedAt && tick === resumedAt + 12) {
        actualPage = 11;
        signature = '201. 目标页';
      }
    },
    detectCaptchaVisible: () => tick === 79,
    waitIfCaptchaUntilResolved: async () => {
      resumedAt = tick;
      return true;
    },
    isResultsTableLoading: () => false,
    getActivePageNumber: () => actualPage,
    getPageContentSignature: () => signature,
    pushTrace: () => {}
  });

  assert.equal(await navigate(11, '181. 上一页'), true);
  assert.equal(clickCount, 1);
  assert.ok(tick >= 92);
});

test('Tencent CAPTCHA is detected only when the iframe actually blocks the page', () => {
  const source = generateContentJs({ downloadDir: '测试' });
  const start = source.indexOf('  function isCenteredBlockingOverlay(');
  const end = source.indexOf('  function sleep(', start);
  assert.ok(start >= 0 && end > start);
  const body = {};
  const container = {
    parentElement: body,
    style: { display: 'block', visibility: 'visible', position: 'absolute', zIndex: '2000', opacity: '0' }
  };
  let top = -1000000;
  const frame = {
    parentElement: container,
    style: { display: 'inline', visibility: 'visible', position: 'static', zIndex: 'auto', opacity: '1' },
    getBoundingClientRect: () => ({ width: 300, height: 180, top, bottom: top + 180, left: 350, right: 650 }),
    contains: (node) => node === frame
  };
  const detect = runInNewContext(source.slice(start, end) + '\ndetectCaptchaVisible', {
    isVisible: () => true,
    window: { innerWidth: 1000, innerHeight: 800, getComputedStyle: (node) => node.style },
    document: {
      body,
      documentElement: {},
      elementFromPoint: () => frame,
      querySelectorAll: (selector) => selector === 'iframe[id^="tcaptcha_iframe"]' ? [frame] : []
    }
  });
  assert.equal(detect(), false);
  top = 300;
  assert.equal(detect(), false);
  container.style.opacity = '1';
  assert.equal(detect(), true);
});

test('only a completed, nonempty PKULaw ZIP succeeds and only the active search tab is notified', async () => {
  const event = () => ({ addListener(listener) { this.fire = listener; } });
  const messages = [];
  const downloads = new Map();
  const chrome = {
    runtime: { onMessage: event(), onInstalled: event() },
    tabs: {
      sendMessage: async (tabId, message) => messages.push([tabId, message.type, message.downloadId]),
      update: async () => {}
    },
    downloads: {
      onCreated: event(),
      onChanged: event(),
      onDeterminingFilename: event(),
      search: async ({ id }) => [downloads.get(id)]
    }
  };
  runInNewContext(generateBackgroundJs({ downloadDir: '测试' }), {
    chrome, URL, console, setTimeout
  });
  chrome.runtime.onMessage.fire(
    { type: 'PKULAW_TOUCH_BATCH_HEARTBEAT' },
    { frameId: 0, url: 'https://www.pkulaw.com/advanced/law', tab: { id: 7 } },
    () => {}
  );

  const site = 'https://www.pkulaw.com/';
  const samples = [
    { id: 1, url: 'https://pkulaw.com.example.org/a', filename: 'foreign.zip', fileSize: 40, state: 'complete' },
    { id: 2, url: site, filename: 'catalog.xls', fileSize: 40, state: 'complete' },
    { id: 3, url: site, filename: 'incomplete.zip', fileSize: 40, state: 'interrupted' },
    { id: 4, url: site, filename: 'empty.zip', fileSize: 0, state: 'complete' },
    { id: 5, url: site, filename: 'policy.zip', fileSize: 40, state: 'complete' }
  ];
  for (const item of samples) {
    downloads.set(item.id, item);
    chrome.downloads.onCreated.fire(item);
  }
  assert.deepEqual(messages, []);

  for (const item of samples) {
    const delta = { id: item.id, state: { current: item.state } };
    await chrome.downloads.onChanged.fire(delta);
    await chrome.downloads.onChanged.fire(delta);
  }
  assert.deepEqual(messages, [
    [7, 'PKULAW_DOWNLOAD_FAILED', 2],
    [7, 'PKULAW_DOWNLOAD_FAILED', 3],
    [7, 'PKULAW_DOWNLOAD_FAILED', 4],
    [7, 'PKULAW_DOWNLOAD_COMPLETED', 5]
  ]);
});

test('advanced-search download waits for an enabled button in the replacement dialog', async () => {
  const source = generateContentJs({ downloadDir: '测试' });
  const copyFunctions = (start, end) => {
    const first = source.indexOf(start);
    const last = source.indexOf(end, first + start.length);
    assert.ok(first >= 0 && last > first);
    return source.slice(first, last);
  };
  const radio = (text, checked) => {
    const label = {
      textContent: text,
      getAttribute: () => String(checked)
    };
    return {
      labels: [label],
      checked,
      select(value) {
        this.checked = value;
        label.getAttribute = () => String(value);
      }
    };
  };
  function dialog() {
    const excel = radio('Excel', true);
    const text = radio(' \uE600 纯文本', false);
    const confirm = {
      tagName: 'BUTTON',
      textContent: '确定',
      disabled: true,
      clicks: 0,
      getAttribute: () => null,
      classList: { contains: () => false },
      click() {
        assert.equal(this.disabled, false);
        assert.equal(text.checked, true);
        assert.equal(excel.checked, false);
        this.clicks++;
      }
    };
    text.click = () => {
      excel.select(false);
      text.select(true);
    };
    return {
      isConnected: true,
      confirm,
      text,
      contains: (node) => node === confirm || text.labels.includes(node) || excel.labels.includes(node),
      querySelectorAll: (selector) => selector === 'input[type="radio"]' ? [excel, text] : []
    };
  }
  const oldDialog = dialog();
  const newDialog = dialog();
  let activeDialog = oldDialog;
  let newPolls = 0;
  oldDialog.text.click = () => {
    oldDialog.isConnected = false;
    activeDialog = newDialog;
  };
  const confirmDownload = runInNewContext(
    copyFunctions('  const downloadFormats', '  function dispatchRealMouseClick') +
    copyFunctions('  function isModalLoadingOrClosed', '  // 6.5') +
    '\nselectFormatAndConfirmInModalAsync',
    {
      state: { recordedModalInputsState: [] },
      pushTrace: () => {},
      sleep: async () => {
        if (activeDialog === newDialog && ++newPolls === 3) newDialog.confirm.disabled = false;
      },
      touchBatchLock: () => {},
      findCustomDownloadModal: () => activeDialog,
      findConfirmButtonInModal: (modal) => modal.confirm,
      isVisible: (node) => !node.hidden
    }
  );

  assert.equal(await confirmDownload('纯文本'), null);
  assert.equal(oldDialog.confirm.clicks, 0);
  assert.equal(newDialog.confirm.clicks, 1);
  activeDialog = dialog();
  activeDialog.text.click = () => {};
  activeDialog.confirm.disabled = false;
  assert.match(await confirmDownload('纯文本'), /无法确认已选中/);
  assert.equal(activeDialog.confirm.clicks, 0);
});
