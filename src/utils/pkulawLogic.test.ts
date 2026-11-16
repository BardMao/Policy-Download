import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAdvancedSearchExpression,
  summarizeWebpageSearchRules,
  validateSearchQuery,
  calculateBatchPlan,
  evaluateCaptchaRisk,
  reconcileDownloadCounts,
  mergeLegalDocumentsToCorpus,
  generateSampleDocumentsForQuery,
  generateWindowsPythonApp,
  generateQuickRunBat,
  generateBuildExeBat,
} from './pkulawLogic';

test('summarizeWebpageSearchRules formats multi-row PKULAW webpage rules accurately', () => {
  const summary = summarizeWebpageSearchRules(
    [
      { id: 'r1', logic: 'AND', field: '标题', value: '数据安全', matchType: '模糊' },
      { id: 'r2', logic: 'OR', field: '全文', value: '个人信息', matchType: '精确' },
    ],
    ['法律', '行政法规'],
    '现行有效'
  );
  assert.ok(summary.includes('[标题 (模糊) = "数据安全"]'));
  assert.ok(summary.includes('或者 [全文 (精确) = "个人信息"]'));
  assert.ok(summary.includes('效力级别：法律、行政法规'));
});

test('buildAdvancedSearchExpression builds structured PKULAW search query accurately', () => {
  const expr = buildAdvancedSearchExpression({
    keyword: '数据安全',
    searchScope: 'title_and_fulltext',
    effectivenessLevels: ['法律', '行政法规'],
    issuingDepartment: '国务院',
    timeliness: '现行有效',
    yearStart: '2020',
    yearEnd: '2026',
  });
  assert.equal(
    expr,
    '(标题="数据安全" OR 全文="数据安全") AND 效力级别="法律,行政法规" AND 制定机关="国务院" AND 时效性="现行有效" AND 公布日期="2020.01.01-2026.12.31"'
  );
});

test('validateSearchQuery enforces non-empty search expression and valid Windows path', () => {
  assert.equal(validateSearchQuery('', 'D:\\PKULaw').valid, false);
  assert.equal(validateSearchQuery('尚未在北大法宝网页中设置检索条件', 'D:\\PKULaw').valid, false);
  assert.equal(validateSearchQuery('数据安全', '').valid, false);
  assert.equal(validateSearchQuery('数据安全', 'invalid_relative_path').valid, false);
  assert.equal(validateSearchQuery('数据安全', 'D:\\PKULaw_Archive\\2026').valid, true);
});

test('calculateBatchPlan splits total search count into 50-item pages', () => {
  assert.deepEqual(calculateBatchPlan(0, 50), []);
  const batches = calculateBatchPlan(132, 50);
  assert.equal(batches.length, 3);
  assert.equal(batches[0].startIndex, 1);
  assert.equal(batches[0].endIndex, 50);
  assert.equal(batches[2].startIndex, 101);
  assert.equal(batches[2].endIndex, 132);
  assert.equal(batches[2].expectedCount, 32);
});

test('evaluateCaptchaRisk classifies pagination intervals accurately', () => {
  const highRisk = evaluateCaptchaRisk(5, 1.0, 2.0);
  assert.equal(highRisk.riskLevel, 'HIGH');

  const lowRisk = evaluateCaptchaRisk(3, 5.0, 8.0);
  assert.equal(lowRisk.riskLevel, 'LOW');
});

test('reconcileDownloadCounts handles IDLE (0 records), exact match, duplicates, and missing sequence numbers', () => {
  const idleReport = reconcileDownloadCounts(0, [], []);
  assert.equal(idleReport.status, 'IDLE');
  assert.equal(idleReport.isExactMatch, false);

  const batches = calculateBatchPlan(65, 50).map((b) => ({
    ...b,
    status: 'extracted' as const,
  }));

  const exactDocs = generateSampleDocumentsForQuery('人工智能', 65, false, null);
  const report1 = reconcileDownloadCounts(65, batches, exactDocs);
  assert.equal(report1.status, 'MATCHED');
  assert.equal(report1.isExactMatch, true);
  assert.equal(report1.uniqueMergedCount, 65);
  assert.equal(report1.missingCount, 0);

  const dupDocs = generateSampleDocumentsForQuery('人工智能', 65, true, null);
  const report2 = reconcileDownloadCounts(65, batches, dupDocs);
  assert.equal(report2.status, 'DUPLICATES_REMOVED');
  assert.equal(report2.rawExtractedFilesCount, 66);
  assert.equal(report2.uniqueMergedCount, 65);
  assert.equal(report2.duplicateCount, 1);
  assert.equal(report2.isExactMatch, true);

  const missingDocs = generateSampleDocumentsForQuery('人工智能', 65, false, 42);
  const report3 = reconcileDownloadCounts(65, batches, missingDocs);
  assert.equal(report3.status, 'MISSING_DETECTED');
  assert.equal(report3.isExactMatch, false);
  assert.equal(report3.missingCount, 1);
  assert.deepEqual(report3.missingSequenceNumbers, [42]);
});

test('mergeLegalDocumentsToCorpus deduplicates and formats TOC and plain text body', () => {
  const emptyMerged = mergeLegalDocumentsToCorpus([], '', true);
  assert.equal(emptyMerged.uniqueDocuments.length, 0);

  const docs = generateSampleDocumentsForQuery('网络安全', 12, true, null);
  const merged = mergeLegalDocumentsToCorpus(docs, '标题="网络安全"', true);
  assert.equal(merged.uniqueDocuments.length, 12);
  assert.ok(merged.mergedText.includes('【目 录 索 引 (Table of Contents)】'));
  assert.ok(merged.mergedText.includes('【第 001 部】 中华人民共和国网络安全法'));
  assert.ok(merged.mergedText.includes('【第 012 部】'));
});

test('generateQuickRunBat and generateBuildExeBat output pure ASCII with CRLF line endings to prevent cmd.exe offset truncation', () => {
  const quickBat = generateQuickRunBat();
  const buildBat = generateBuildExeBat();

  // Must use Windows CRLF (\r\n)
  assert.ok(quickBat.includes('\r\n'));
  assert.ok(buildBat.includes('\r\n'));

  // Must contain zero non-ASCII characters (all char codes <= 127)
  for (let i = 0; i < quickBat.length; i++) {
    assert.ok(
      quickBat.charCodeAt(i) <= 127,
      `Non-ASCII character at index ${i} in Run_PKULaw_Portable.bat`
    );
  }
  for (let i = 0; i < buildBat.length; i++) {
    assert.ok(
      buildBat.charCodeAt(i) <= 127,
      `Non-ASCII character at index ${i} in Build_EXE.bat`
    );
  }

  assert.ok(quickBat.includes('python pkulaw_portable_app.py'));
  assert.ok(buildBat.includes('python -m PyInstaller'));
});

test('generateWindowsPythonApp embeds portable tkinter UI and extract_only default rule', () => {
  const pyCode = generateWindowsPythonApp(
    {
      downloadDir: 'E:\\LegalCorpus\\PKULaw',
      darkMode: true,
      downloadFormat: 'fulltext_txt',
      unpackRule: 'extract_only',
      authMode: 'carsi_institutional',
      institutionName: '北京大学法学院',
      batchSize: 50,
      minDelaySec: 4.5,
      maxDelaySec: 8.5,
      captchaStrategy: 'human_assist_pause',
      autoUnzip: true,
      deleteZipAfterMerge: false,
      mergeEncoding: 'UTF-8',
      mergeFileNamePattern: '北大法宝汇编_{date}.txt',
      includeTableOfContents: true,
    },
    '标题="数据安全"'
  );
  assert.ok(pyCode.includes('E:\\\\LegalCorpus\\\\PKULaw'));
  assert.ok(pyCode.includes('DEFAULT_UNPACK_RULE = "extract_only"'));
  assert.ok(pyCode.includes('import tkinter as tk'));
});

test('buildExtensionZipBytes builds valid Manifest V3 Edge/Chrome extension archive with zero JS syntax errors', async () => {
  const {
    generateManifestJson,
    generateBackgroundJs,
    generatePageHookJs,
    generateContentJs,
    buildExtensionZipBytes,
  } = await import('./extensionGenerator');

  const sampleSettings = {
    downloadDir: 'PKULaw_Downloads',
    darkMode: false,
    downloadFormat: 'clean' as const,
    unpackRule: 'extract_only' as const,
    authMode: 'carsi_institutional' as const,
    institutionName: '',
    batchSize: 50,
    minDelaySec: 4.5,
    maxDelaySec: 8.5,
    captchaStrategy: 'human_assist_pause' as const,
    autoUnzip: false,
    deleteZipAfterMerge: false,
    mergeEncoding: 'UTF-8' as const,
    mergeFileNamePattern: '汇总.txt',
    includeTableOfContents: false,
  };

  const manifestObj = JSON.parse(generateManifestJson());
  assert.equal(manifestObj.manifest_version, 3);
  assert.equal(manifestObj.version, '3.3.0');
  assert.ok(manifestObj.host_permissions.includes('https://www.pkulaw.com/*'));
  assert.ok(manifestObj.permissions.includes('scripting'));
  assert.ok(manifestObj.permissions.includes('tabs'));

  const pageHookJs = generatePageHookJs();
  assert.doesNotThrow(
    () => new Function(pageHookJs),
    'page_hook.js must parse as valid JavaScript without any SyntaxError'
  );
  assert.ok(pageHookJs.includes('PKULAW_FORCE_OPEN_URL'));
  assert.ok(pageHookJs.includes('data-pkulaw-batch-active'));

  const backgroundJs = generateBackgroundJs(sampleSettings);
  assert.doesNotThrow(
    () => new Function(backgroundJs),
    'background.js must parse as valid JavaScript without any SyntaxError'
  );
  assert.ok(backgroundJs.includes('closeTrackedDownloadTabs'));
  assert.ok(backgroundJs.includes('refocusMainSearchTab'));
  assert.ok(backgroundJs.includes('PKULAW_DOWNLOAD_STARTED'));
  assert.ok(backgroundJs.includes('PKULAW_FORCE_OPEN_DOWNLOAD_URL'));
  assert.ok(backgroundJs.includes('PKULAW_OPEN_DOWNLOADS_FOLDER'));

  const contentJs = generateContentJs(sampleSettings);
  assert.doesNotThrow(
    () => new Function(contentJs),
    'content.js must parse as valid JavaScript without any SyntaxError'
  );
  assert.ok(contentJs.includes('1/2 登录机构账号'));
  assert.ok(contentJs.includes('2/2 填写检索式'));
  assert.ok(contentJs.includes('请选择下载格式'));
  assert.ok(contentJs.includes('p.left-downLoad'));
  assert.ok(contentJs.includes('i.icon-qikan_xiazai'));
  assert.ok(contentJs.includes('pkulaw-btn-refresh'));
  assert.ok(contentJs.includes('refreshPageInfoAndDisplay'));
  assert.ok(contentJs.includes('findTargetPageNumberButton'));
  assert.ok(contentJs.includes('navigateToNextPageAndVerify'));
  assert.ok(contentJs.includes('clickPaginationControlOnce'));
  assert.ok(contentJs.includes('triggerFirstPageConfirmedAndStartLoop'));
  assert.ok(contentJs.includes('syncModalFormatOptionsWithPage1'));
  assert.ok(contentJs.includes('isModalLoadingOrClosed'));
  assert.ok(contentJs.includes('snapshotModalInputsState'));
  assert.ok(contentJs.includes('eventTrace'));
  assert.ok(contentJs.includes('PKULAW_FORCE_OPEN_DOWNLOAD_URL'));
  assert.ok(contentJs.includes('共检测到'));
  assert.ok(contentJs.includes('条法规，每页显示'));
  assert.ok(contentJs.includes('findResultsToolbar'));
  assert.ok(contentJs.includes('isCenteredBlockingOverlay'));
  assert.ok(contentJs.includes('waitForRealDownloadSignal'));
  assert.ok(contentJs.includes('waitIfCaptchaUntilResolved'));
  assert.ok(contentJs.includes('countCheckedResultItems'));
  // Ensure old verbose waiting_format_choice fallback text is removed
  assert.equal(
    contentJs.includes('若未自动弹出格式框，请点击列表上方'),
    false
  );
  // Ensure manual captcha confirmation button and unpack/merge script button are removed
  assert.equal(contentJs.includes('pkulaw-btn-resume-captcha'), false);
  assert.equal(contentJs.includes('pkulaw-btn-download-unpack-bat'), false);
  assert.equal(contentJs.includes('Unpack_PKULaw_Zips.bat'), false);
  // Ensure broad false-positive captcha selector is removed
  assert.equal(contentJs.includes('图形验证码'), false);

  const zipBytes = buildExtensionZipBytes(sampleSettings);
  // PKZIP magic bytes: 0x50 0x4b 0x03 0x04 ('PK\x03\x04')
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);
  assert.equal(zipBytes[2], 0x03);
  assert.equal(zipBytes[3], 0x04);
  assert.ok(zipBytes.length > 1000);
});




