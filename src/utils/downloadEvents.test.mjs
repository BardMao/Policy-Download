import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { generateBackgroundJs, generateContentJs } from './extensionGenerator.ts';

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
