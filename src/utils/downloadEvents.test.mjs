import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { generateBackgroundJs } from './extensionGenerator.ts';

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
