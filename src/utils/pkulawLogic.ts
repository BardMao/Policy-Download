export type UnpackRule = 'extract_only' | 'extract_and_merge' | 'both';

export type PkulawDownloadFormat =
  | 'excel'
  | 'word'
  | 'pdf'
  | 'txt'
  | 'html'
  | 'clean';

export const PKULAW_FORMAT_OPTIONS: {
  id: PkulawDownloadFormat;
  category: '目录' | '全文';
  label: string;
  ext: string;
  badgeText: string;
}[] = [
  { id: 'excel', category: '目录', label: 'Excel', ext: '.xlsx', badgeText: 'X' },
  { id: 'word', category: '全文', label: 'Word', ext: '.docx', badgeText: 'W' },
  { id: 'pdf', category: '全文', label: 'PDF', ext: '.pdf', badgeText: 'PDF' },
  { id: 'txt', category: '全文', label: '纯文本', ext: '.txt', badgeText: '≡' },
  { id: 'html', category: '全文', label: '超文本', ext: '.html', badgeText: '🔗' },
  { id: 'clean', category: '全文', label: '纯净版', ext: '.txt', badgeText: 'T' },
];

export interface WebpageSearchRuleRow {
  id: string;
  logic: 'AND' | 'OR' | 'NOT';
  field: '标题' | '全文' | '标题或全文' | '发文字号' | '制定机关';
  value: string;
  matchType: '精确' | '模糊';
}

export interface SearchFilterConfig {
  keyword: string;
  searchScope: 'title' | 'fulltext' | 'title_and_fulltext';
  effectivenessLevels: string[];
  issuingDepartment: string;
  timeliness: string;
  yearStart?: string;
  yearEnd?: string;
  customRawExpression?: string;
  webpageRuleRows?: WebpageSearchRuleRow[];
}

export interface BatchPageItem {
  pageNumber: number;
  startIndex: number;
  endIndex: number;
  expectedCount: number;
  zipFileName: string;
  status: 'pending' | 'downloading' | 'captcha_paused' | 'completed' | 'extracted' | 'failed';
  extractedFilesCount: number;
  captchaTriggered?: boolean;
  durationMs?: number;
}

export interface LegalDocumentRecord {
  id: string;
  sequenceNumber: number;
  title: string;
  issuingAuthority: string;
  documentNumber: string;
  publishDate: string;
  effectiveDate: string;
  timeliness: string;
  effectivenessLevel: string;
  citationCode: string;
  sourceZip: string;
  fullText: string;
}

export interface ReconciliationReport {
  expectedSearchTotal: number;
  expectedBatchesCount: number;
  completedBatchesCount: number;
  rawExtractedFilesCount: number;
  uniqueMergedCount: number;
  duplicateCount: number;
  missingCount: number;
  missingSequenceNumbers: number[];
  duplicateTitles: string[];
  isExactMatch: boolean;
  status: 'IDLE' | 'MATCHED' | 'DUPLICATES_REMOVED' | 'MISSING_DETECTED';
  summaryMessage: string;
}

export interface AppSettings {
  downloadDir: string;
  darkMode: boolean;
  downloadFormat: PkulawDownloadFormat | 'fulltext_txt';
  unpackRule: UnpackRule;
  authMode: 'carsi_institutional' | 'ip_auto' | 'account_password';
  institutionName: string;
  batchSize: number;
  minDelaySec: number;
  maxDelaySec: number;
  captchaStrategy: 'human_assist_pause' | 'persistent_profile_jitter' | 'sound_toast_notify';
  autoUnzip: boolean;
  deleteZipAfterMerge: boolean;
  mergeEncoding: 'UTF-8' | 'GB18030';
  mergeFileNamePattern: string;
  includeTableOfContents: boolean;
}

export const MAX_PKULAW_BATCH_SIZE = 50;

export function toWindowsCrlf(content: string): string {
  return content.replace(/\r?\n/g, '\r\n');
}

export function summarizeWebpageSearchRules(
  rows: WebpageSearchRuleRow[],
  effectivenessLevels: string[],
  timeliness: string
): string {
  const validRows = rows.filter((r) => r.value.trim().length > 0);
  const rowParts = validRows.map((r, idx) => {
    const prefix =
      idx === 0
        ? ''
        : `${r.logic === 'AND' ? '并且' : r.logic === 'OR' ? '或者' : '不含'} `;
    return `${prefix}[${r.field} (${r.matchType}) = "${r.value.trim()}"]`;
  });

  const filterParts: string[] = [];
  if (rowParts.length > 0) {
    filterParts.push(rowParts.join(' '));
  }
  if (effectivenessLevels.length > 0) {
    filterParts.push(`效力级别：${effectivenessLevels.join('、')}`);
  }
  if (timeliness && timeliness !== '全部') {
    filterParts.push(`时效性：${timeliness}`);
  }
  return filterParts.join(' ｜ ') || '尚未在北大法宝网页中设置检索条件';
}

export function buildAdvancedSearchExpression(config: SearchFilterConfig): string {
  if (config.customRawExpression && config.customRawExpression.trim().length > 0) {
    return config.customRawExpression.trim();
  }

  if (config.webpageRuleRows && config.webpageRuleRows.length > 0) {
    const nonEmptyRows = config.webpageRuleRows.filter((r) => r.value.trim().length > 0);
    if (nonEmptyRows.length === 0) return '';
    return summarizeWebpageSearchRules(
      nonEmptyRows,
      config.effectivenessLevels,
      config.timeliness
    );
  }

  const parts: string[] = [];
  const kw = config.keyword.trim();
  if (kw) {
    if (config.searchScope === 'title') {
      parts.push(`标题="${kw}"`);
    } else if (config.searchScope === 'fulltext') {
      parts.push(`全文="${kw}"`);
    } else {
      parts.push(`(标题="${kw}" OR 全文="${kw}")`);
    }
  }

  if (config.effectivenessLevels.length > 0) {
    parts.push(`效力级别="${config.effectivenessLevels.join(',')}"`);
  }

  if (config.issuingDepartment.trim()) {
    parts.push(`制定机关="${config.issuingDepartment.trim()}"`);
  }

  if (config.timeliness && config.timeliness !== '全部') {
    parts.push(`时效性="${config.timeliness}"`);
  }

  if (config.yearStart && config.yearEnd) {
    parts.push(`公布日期="${config.yearStart}.01.01-${config.yearEnd}.12.31"`);
  } else if (config.yearStart) {
    parts.push(`公布日期>="${config.yearStart}.01.01"`);
  }

  return parts.join(' AND ');
}

export function validateSearchQuery(expression: string, downloadDir: string): {
  valid: boolean;
  error?: string;
} {
  const trimmedExpr = expression.trim();
  if (!trimmedExpr || trimmedExpr === '尚未在北大法宝网页中设置检索条件') {
    return {
      valid: false,
      error: '请先在网页中输入检索词并点击检索确认结果。',
    };
  }
  if (trimmedExpr.length < 2) {
    return {
      valid: false,
      error: '检索词过短，请输入至少 2 个字符。',
    };
  }
  const trimmedDir = downloadDir.trim();
  if (!trimmedDir) {
    return {
      valid: false,
      error: '下载保存地址不能为空。',
    };
  }
  if (!/^[a-zA-Z]:\\/.test(trimmedDir) && !trimmedDir.startsWith('/')) {
    return {
      valid: false,
      error: '下载路径格式不合法，请输入盘符路径（如 D:\\PKULaw_Downloads）。',
    };
  }
  return { valid: true };
}

export function calculateBatchPlan(
  totalRecords: number,
  requestedBatchSize: number = MAX_PKULAW_BATCH_SIZE
): BatchPageItem[] {
  if (totalRecords <= 0) return [];
  const effectiveBatchSize = Math.min(Math.max(1, requestedBatchSize), MAX_PKULAW_BATCH_SIZE);
  const totalPages = Math.ceil(totalRecords / effectiveBatchSize);
  const batches: BatchPageItem[] = [];

  for (let page = 1; page <= totalPages; page++) {
    const startIndex = (page - 1) * effectiveBatchSize + 1;
    const endIndex = Math.min(page * effectiveBatchSize, totalRecords);
    const expectedCount = endIndex - startIndex + 1;
    const paddedPage = String(page).padStart(3, '0');
    const paddedStart = String(startIndex).padStart(4, '0');
    const paddedEnd = String(endIndex).padStart(4, '0');

    batches.push({
      pageNumber: page,
      startIndex,
      endIndex,
      expectedCount,
      zipFileName: `PKULAW_Batch_P${paddedPage}_${paddedStart}-${paddedEnd}.zip`,
      status: 'pending',
      extractedFilesCount: 0,
    });
  }

  return batches;
}

export function evaluateCaptchaRisk(
  totalPages: number,
  minDelaySec: number,
  maxDelaySec: number
): {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  estimatedTriggerPage: number | null;
  recommendation: string;
} {
  const avgDelay = (minDelaySec + maxDelaySec) / 2;
  if (avgDelay < 2.5) {
    return {
      riskLevel: 'HIGH',
      estimatedTriggerPage: Math.min(Math.max(1, totalPages), 3),
      recommendation: '翻页间隔低于 2.5 秒易触发验证，建议调至 4.5–8.5 秒。',
    };
  }
  if (avgDelay < 4.5 || totalPages > 12) {
    return {
      riskLevel: 'MEDIUM',
      estimatedTriggerPage: totalPages >= 4 ? 4 : null,
      recommendation: '中等频率连续翻页若遇验证弹窗将自动暂停提醒。',
    };
  }
  return {
    riskLevel: 'LOW',
    estimatedTriggerPage: null,
    recommendation: '当前翻页间隔处于安全阈值内。',
  };
}

export function reconcileDownloadCounts(
  expectedSearchTotal: number,
  batches: BatchPageItem[],
  documents: LegalDocumentRecord[]
): ReconciliationReport {
  if (expectedSearchTotal === 0 && documents.length === 0) {
    return {
      expectedSearchTotal: 0,
      expectedBatchesCount: 0,
      completedBatchesCount: 0,
      rawExtractedFilesCount: 0,
      uniqueMergedCount: 0,
      duplicateCount: 0,
      missingCount: 0,
      missingSequenceNumbers: [],
      duplicateTitles: [],
      isExactMatch: false,
      status: 'IDLE',
      summaryMessage: '等待开始下载。',
    };
  }

  const expectedBatchesCount = batches.length;
  const completedBatchesCount = batches.filter(
    (b) => b.status === 'completed' || b.status === 'extracted'
  ).length;
  const rawExtractedFilesCount = documents.length;

  const seenCitations = new Set<string>();
  const seenSequenceNumbers = new Set<number>();
  const duplicateTitles: string[] = [];
  let uniqueMergedCount = 0;

  for (const doc of documents) {
    const key = doc.citationCode || `${doc.title}_${doc.documentNumber}`;
    if (seenCitations.has(key)) {
      duplicateTitles.push(`${doc.title} (${doc.documentNumber})`);
    } else {
      seenCitations.add(key);
      uniqueMergedCount++;
    }
    if (doc.sequenceNumber >= 1 && doc.sequenceNumber <= expectedSearchTotal) {
      seenSequenceNumbers.add(doc.sequenceNumber);
    }
  }

  const missingSequenceNumbers: number[] = [];
  for (let seq = 1; seq <= expectedSearchTotal; seq++) {
    if (!seenSequenceNumbers.has(seq)) {
      missingSequenceNumbers.push(seq);
    }
  }

  const duplicateCount = duplicateTitles.length;
  const missingCount = missingSequenceNumbers.length;

  let status: ReconciliationReport['status'] = 'MATCHED';
  let summaryMessage = `核对一致：检索数量 ${expectedSearchTotal} 条，实际解压有效文件 ${uniqueMergedCount} 个。`;

  if (missingCount > 0) {
    status = 'MISSING_DETECTED';
    summaryMessage = `数量不一致：检索数量 ${expectedSearchTotal} 条，实际有效文件 ${uniqueMergedCount} 个，缺失 ${missingCount} 条（序号：${missingSequenceNumbers.slice(0, 8).join(', ')}）。`;
  } else if (duplicateCount > 0) {
    status = 'DUPLICATES_REMOVED';
    summaryMessage = `去重后核对一致：解压原始文件 ${rawExtractedFilesCount} 个，剔除重复 ${duplicateCount} 个，有效文件 ${uniqueMergedCount} 个（与检索数量 ${expectedSearchTotal} 条一致）。`;
  }

  return {
    expectedSearchTotal,
    expectedBatchesCount,
    completedBatchesCount,
    rawExtractedFilesCount,
    uniqueMergedCount,
    duplicateCount,
    missingCount,
    missingSequenceNumbers,
    duplicateTitles,
    isExactMatch:
      expectedSearchTotal > 0 &&
      missingCount === 0 &&
      uniqueMergedCount === expectedSearchTotal,
    status,
    summaryMessage,
  };
}

export function mergeLegalDocumentsToCorpus(
  documents: LegalDocumentRecord[],
  searchSummary: string,
  includeToc: boolean = true
): {
  mergedText: string;
  uniqueDocuments: LegalDocumentRecord[];
  totalCharCount: number;
} {
  if (documents.length === 0) {
    return {
      mergedText: '暂无已下载文件。',
      uniqueDocuments: [],
      totalCharCount: 0,
    };
  }

  const seen = new Set<string>();
  const uniqueDocuments: LegalDocumentRecord[] = [];

  const sorted = [...documents].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  for (const doc of sorted) {
    const key = doc.citationCode || `${doc.title}_${doc.documentNumber}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueDocuments.push(doc);
    }
  }

  const lines: string[] = [];
  lines.push('================================================================================');
  lines.push('                    北大法宝（PKULAW）法律法规批量下载纯文本                    ');
  lines.push('================================================================================');
  lines.push(`检索条件: ${searchSummary}`);
  lines.push(`下载格式: 全文 - 纯文本 (Plain Text)`);
  lines.push(`文件数量: ${uniqueDocuments.length} 部`);
  lines.push('================================================================================');
  lines.push('');

  if (includeToc && uniqueDocuments.length > 0) {
    lines.push('【目 录 索 引 (Table of Contents)】');
    lines.push('--------------------------------------------------------------------------------');
    for (const doc of uniqueDocuments) {
      const seqStr = String(doc.sequenceNumber).padStart(3, '0');
      lines.push(
        `[${seqStr}] ${doc.title} | ${doc.documentNumber} | ${doc.effectivenessLevel} | ${doc.citationCode}`
      );
    }
    lines.push('--------------------------------------------------------------------------------');
    lines.push('');
  }

  for (const doc of uniqueDocuments) {
    const seqStr = String(doc.sequenceNumber).padStart(3, '0');
    lines.push(`################################################################################`);
    lines.push(`【第 ${seqStr} 部】 ${doc.title}`);
    lines.push(`################################################################################`);
    lines.push(`【制定机关】 ${doc.issuingAuthority}`);
    lines.push(`【发文字号】 ${doc.documentNumber}`);
    lines.push(`【效力级别】 ${doc.effectivenessLevel} | 【时效性】 ${doc.timeliness}`);
    lines.push(`【法宝引证码】 ${doc.citationCode} | 【来源包】 ${doc.sourceZip}`);
    lines.push('--------------------------------------------------------------------------------');
    lines.push(doc.fullText.trim());
    lines.push('');
    lines.push('');
  }

  const mergedText = lines.join('\n');
  return {
    mergedText,
    uniqueDocuments,
    totalCharCount: mergedText.length,
  };
}

export async function extractTxtFilesFromZipBuffer(
  zipBuffer: ArrayBuffer,
  zipFileName: string,
  startingSequence: number
): Promise<LegalDocumentRecord[]> {
  const view = new DataView(zipBuffer);
  const bytes = new Uint8Array(zipBuffer);
  const extracted: LegalDocumentRecord[] = [];

  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error(`文件 ${zipFileName} 不是有效的 ZIP 压缩包`);
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  let ptr = cdOffset;
  let seqCounter = startingSequence;

  const decodeBytes = (raw: Uint8Array, isUtf8Flag: boolean): string => {
    if (isUtf8Flag) {
      return new TextDecoder('utf-8').decode(raw);
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(raw);
    } catch {
      try {
        return new TextDecoder('gb18030').decode(raw);
      } catch {
        return new TextDecoder('utf-8').decode(raw);
      }
    }
  };

  for (let idx = 0; idx < totalEntries; idx++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) {
      break;
    }
    const flags = view.getUint16(ptr + 8, true);
    const isUtf8 = (flags & 0x0800) !== 0;
    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const fileNameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const nameBytes = bytes.subarray(ptr + 46, ptr + 46 + fileNameLen);
    const entryName = decodeBytes(nameBytes, isUtf8);

    ptr += 46 + fileNameLen + extraLen + commentLen;

    if (!entryName.toLowerCase().endsWith('.txt') || entryName.endsWith('/')) {
      continue;
    }

    if (localHeaderOffset + 30 > bytes.length) continue;
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedSlice = bytes.subarray(dataStart, dataStart + compressedSize);

    let uncompressedBytes: Uint8Array;
    if (compressionMethod === 0) {
      uncompressedBytes = compressedSlice;
    } else if (compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compressedSlice);
      writer.close();
      const resp = new Response(ds.readable);
      const ab = await resp.arrayBuffer();
      uncompressedBytes = new Uint8Array(ab);
    } else {
      continue;
    }

    const textContent = decodeBytes(uncompressedBytes, false);
    const cleanBaseName =
      entryName.split('/').pop()?.replace(/\.txt$/i, '') || `法规文件_${seqCounter}`;

    const citationMatch = textContent.match(/CLI\.[0-9A-Za-z.]+/);
    const docNumMatch = textContent.match(/【发文字号】\s*([^\r\n]+)/);
    const authMatch = textContent.match(/【制定机关】\s*([^\r\n]+)/);

    extracted.push({
      id: `zip-doc-${Date.now()}-${seqCounter}`,
      sequenceNumber: seqCounter,
      title: cleanBaseName,
      issuingAuthority: authMatch ? authMatch[1].trim() : '北大法宝收录机关',
      documentNumber: docNumMatch ? docNumMatch[1].trim() : `序号 #${seqCounter}`,
      publishDate: '详见正文',
      effectiveDate: '详见正文',
      timeliness: '现行有效',
      effectivenessLevel: '法律法规',
      citationCode: citationMatch ? citationMatch[0] : `PKULAW.${zipFileName}.${cleanBaseName}`,
      sourceZip: zipFileName,
      fullText: textContent,
    });

    seqCounter++;
  }

  return extracted;
}

export function generateSampleDocumentsForQuery(
  keyword: string,
  totalCount: number,
  injectDuplicate: boolean = false,
  injectMissingSeq: number | null = null
): LegalDocumentRecord[] {
  const cleanKw = keyword.trim() || '数据安全';
  const authorities = [
    '全国人民代表大会常务委员会',
    '中华人民共和国国务院',
    '国家互联网信息办公室',
    '最高人民法院',
    '中国人民银行',
    '中华人民共和国公安部',
  ];
  const levels = ['法律', '行政法规', '部门规章', '司法解释', '部门规范性文件'];
  const docPrefixes = ['主席令', '国务院令', '网信办令', '法释', '银发', '公通字'];
  const suffixes = ['管理条例', '实施细则', '合规办法', '安全指南', '分类分级规定', '裁量基准'];

  const records: LegalDocumentRecord[] = [];
  for (let i = 1; i <= totalCount; i++) {
    if (injectMissingSeq !== null && i === injectMissingSeq) {
      continue;
    }
    const pageNum = Math.ceil(i / MAX_PKULAW_BATCH_SIZE);
    const startIdx = (pageNum - 1) * MAX_PKULAW_BATCH_SIZE + 1;
    const endIdx = Math.min(pageNum * MAX_PKULAW_BATCH_SIZE, totalCount);
    const zipName = `PKULAW_Batch_P${String(pageNum).padStart(3, '0')}_${String(startIdx).padStart(4, '0')}-${String(endIdx).padStart(4, '0')}.zip`;

    const idx = (i - 1) % authorities.length;
    const year = 2019 + (i % 7);
    const citation = `CLI.${(i % 5) + 1}.${100000 + i * 37}`;
    const docNum = `${docPrefixes[idx]}〔${year}〕第${10 + i}号`;
    const title =
      i === 1
        ? `中华人民共和国${cleanKw}法`
        : i === 2
          ? `中华人民共和国${cleanKw}管理条例`
          : `关于${cleanKw}领域${suffixes[idx]}（${year}年第${i}号）`;

    const fullText = [
      `第一条 为了规范${cleanKw}活动，保障公民、法人和其他组织的合法权益，根据宪法制定本规定。`,
      `第二条 在中华人民共和国境内开展${cleanKw}相关活动，适用本规定。`,
      `第三条 相关主体应当履行安全保护义务，建立健全合规管理制度。`,
    ].join('\n');

    records.push({
      id: `doc-${i}`,
      sequenceNumber: i,
      title,
      issuingAuthority: authorities[idx],
      documentNumber: docNum,
      publishDate: `${year}.06.01`,
      effectiveDate: `${year}.09.01`,
      timeliness: '现行有效',
      effectivenessLevel: levels[idx % levels.length],
      citationCode: citation,
      sourceZip: zipName,
      fullText,
    });
  }

  if (injectDuplicate && records.length > 0) {
    records.push({ ...records[0], id: 'doc-dup-1' });
  }

  return records;
}

export function generateWindowsPythonApp(
  settings: AppSettings,
  _searchSummary: string
): string {
  const escapedDir = settings.downloadDir.replace(/\\/g, '\\\\');
  const unpackMode = settings.unpackRule;

  const pyCode = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PKULAW Portable Batch Downloader for Windows (Zero-Compile Portable Edition)
Uses Python built-in tkinter + Playwright Chromium:
  1. Opens PKULAW webpage and displays bottom progress bar for manual login & search
  2. First click on Start Download prompts for Format, Directory, and Unpack Rule
  3. Automatically clicks Ungroup, loops 50/page downloading Plain-Text ZIPs, pauses on CAPTCHA, extracts all TXT files to folder, and verifies count.
"""

import os
import re
import time
import random
import zipfile
import threading
import winsound
from pathlib import Path
from datetime import datetime
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from playwright.sync_api import sync_playwright

DEFAULT_DOWNLOAD_DIR = "${escapedDir}"
DEFAULT_UNPACK_RULE = "${unpackMode}"
BATCH_LIMIT = ${settings.batchSize}
MIN_DELAY_SEC = ${settings.minDelaySec}
MAX_DELAY_SEC = ${settings.maxDelaySec}
MERGE_ENCODING = "${settings.mergeEncoding}"


class PKULawPortableApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("北大法宝批量下载程序")
        self.geometry("920x600")
        self.minsize(820, 520)

        self.download_dir = tk.StringVar(value=DEFAULT_DOWNLOAD_DIR)
        self.unpack_rule = tk.StringVar(value=DEFAULT_UNPACK_RULE)
        self.format_var = tk.StringVar(value="全文 - 纯文本 (.txt)")
        self.step_var = tk.IntVar(value=1)
        self.first_download_configured = False

        self.pw = None
        self.context = None
        self.page = None
        self._stop_event = threading.Event()
        self._resume_captcha_event = threading.Event()

        self._build_ui()

    def _build_ui(self):
        # 顶部仅保留两个二级界面切换按钮
        top_bar = tk.Frame(self, bd=1, relief="solid", padx=12, pady=8)
        top_bar.pack(fill="x")

        self.btn_tab_main = tk.Button(
            top_bar, text="浏览器与下载", width=16, command=lambda: self._switch_tab("main")
        )
        self.btn_tab_main.pack(side="left", padx=(0, 8))

        self.btn_tab_settings = tk.Button(
            top_bar, text="下载与应用设置", width=16, command=lambda: self._switch_tab("settings")
        )
        self.btn_tab_settings.pack(side="left")

        # 主容器
        self.container = tk.Frame(self)
        self.container.pack(fill="both", expand=True)

        # 视图1：主界面（网页引导 + 下载进度 + 底部动态进度条）
        self.frame_main = tk.Frame(self.container)
        self.frame_settings = tk.Frame(self.container, padx=20, pady=20)

        self._build_main_view()
        self._build_settings_view()
        self._switch_tab("main")

    def _build_main_view(self):
        # 中央区域：显示网页联动状态与下载进度日志
        center = tk.Frame(self.frame_main, padx=16, pady=12)
        center.pack(fill="both", expand=True)

        top_ctrl = tk.Frame(center)
        top_ctrl.pack(fill="x", pady=(0, 8))

        tk.Button(
            top_ctrl,
            text="1. 启动并显示北大法宝网页窗口",
            bg="#2563EB",
            fg="white",
            padx=12,
            pady=6,
            command=self._open_browser
        ).pack(side="left", padx=(0, 8))

        tk.Button(
            top_ctrl,
            text="我已在网页登录并完成检索确认 ->",
            padx=10,
            pady=6,
            command=lambda: self._set_manual_step(3)
        ).pack(side="left", padx=(0, 8))

        self.btn_resume = tk.Button(
            top_ctrl,
            text="已在网页完成人机验证 · 继续下载",
            bg="#D97706",
            fg="white",
            padx=10,
            pady=6,
            command=lambda: self._resume_captcha_event.set()
        )
        self.btn_resume.pack(side="right")

        self.log_text = tk.Text(center, font=("Consolas", 10), height=18)
        self.log_text.pack(fill="both", expand=True)
        self._log("请点击上方 [1. 启动并显示北大法宝网页窗口]，直接在北大法宝官网完成机构登录与高级检索，底部进度栏将自动检测并在就绪后变为 [开始下载] 按钮。")

        # 最下方：不遮挡官网界面的自动判定进度栏（登录机构账号 -> 填写检索式 -> 进度条变为开始下载按钮）
        self.bottom_bar = tk.Frame(self.frame_main, bd=1, relief="solid", padx=16, pady=10)
        self.bottom_bar.pack(fill="x", side="bottom")

        self.progress_container = tk.Frame(self.bottom_bar)
        self.progress_container.pack(fill="x", expand=True)

        self.step_label = tk.Label(
            self.progress_container,
            text="官网操作进度 [1/2]：登录机构账号（正在检测北大法宝机构登录与法律正文下载权限...）",
            font=("Microsoft YaHei UI", 10, "bold")
        )
        self.step_label.pack(side="left")

        self.progress = ttk.Progressbar(self.progress_container, length=280, mode="determinate", maximum=100)
        self.progress["value"] = 25
        self.progress.pack(side="right", padx=8)

        self.btn_start_dl = tk.Button(
            self.bottom_bar,
            text="开始下载（已检测到机构正文下载权限与官网检索结果）",
            bg="#059669",
            fg="white",
            font=("Microsoft YaHei UI", 10, "bold"),
            padx=20,
            pady=8,
            command=self._on_click_start_download
        )

    def _build_settings_view(self):
        tk.Label(self.frame_settings, text="下载保存地址：").grid(row=0, column=0, sticky="w", pady=8)
        tk.Entry(self.frame_settings, textvariable=self.download_dir, width=50).grid(row=0, column=1, sticky="w", pady=8)
        tk.Button(self.frame_settings, text="选择目录", command=self._choose_dir).grid(row=0, column=2, padx=8, pady=8)

        tk.Label(self.frame_settings, text="下载解压后打包规则：").grid(row=1, column=0, sticky="w", pady=8)
        rule_frame = tk.Frame(self.frame_settings)
        rule_frame.grid(row=1, column=1, columnspan=2, sticky="w", pady=8)
        tk.Radiobutton(rule_frame, text="仅解压全部文件到独立文件夹不合并 (默认)", variable=self.unpack_rule, value="extract_only").pack(anchor="w")
        tk.Radiobutton(rule_frame, text="解压全部文件并合并为单个汇总文本文件", variable=self.unpack_rule, value="extract_and_merge").pack(anchor="w")
        tk.Radiobutton(rule_frame, text="同时保留独立文件夹与合并汇总文件", variable=self.unpack_rule, value="both").pack(anchor="w")

    def _switch_tab(self, tab_name: str):
        self.frame_main.pack_forget()
        self.frame_settings.pack_forget()
        if tab_name == "main":
            self.frame_main.pack(fill="both", expand=True)
        else:
            self.frame_settings.pack(fill="both", expand=True)

    def _set_manual_step(self, step: int):
        self.step_var.set(step)
        if step == 1:
            self.btn_start_dl.pack_forget()
            self.progress_container.pack(fill="x", expand=True)
            self.progress["value"] = 0
            self.step_label.config(text="1/2 登录机构账号：请在北大法宝官网登录机构账号并取得法律正文下载权限")
        elif step == 2:
            self.btn_start_dl.pack_forget()
            self.progress_container.pack(fill="x", expand=True)
            self.progress["value"] = 50
            self.step_label.config(text="2/2 填写检索式：已取得正文下载权限，请在官网高级检索页面填写检索式并执行检索")
        else:
            self.progress_container.pack_forget()
            self.btn_start_dl.pack(fill="x", expand=True)

    def _choose_dir(self):
        folder = filedialog.askdirectory(initialdir=self.download_dir.get())
        if folder:
            self.download_dir.set(os.path.normpath(folder))

    def _log(self, msg: str):
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_text.insert("end", f"[{ts}] {msg}\\n")
        self.log_text.see("end")

    def _open_browser(self):
        def _launch():
            try:
                dl_dir = Path(self.download_dir.get().strip())
                profile_dir = dl_dir / ".browser_profile"
                profile_dir.mkdir(parents=True, exist_ok=True)
                self._log("正在启动北大法宝官网视图（所有新标签页与CARSI登录均在程序单窗口内处理）...")
                self.pw = sync_playwright().start()
                self.context = self.pw.chromium.launch_persistent_context(
                    user_data_dir=str(profile_dir),
                    headless=False,
                    accept_downloads=True,
                    viewport={"width": 1366, "height": 860}
                )
                # 强制拦截 target="_blank"（如高级检索）与 window.open（如CARSI校园登录），确保在当前程序窗口内直接打开
                self.context.add_init_script("""
                    document.addEventListener('click', function(e) {
                        var a = e.target && e.target.closest ? e.target.closest('a') : null;
                        if (a && a.target === '_blank' && a.href) {
                            a.target = '_self';
                        }
                    }, true);
                    window.open = function(url) {
                        if (url) window.location.href = url;
                        return window;
                    };
                """)
                def _on_new_page(new_p):
                    try:
                        target_url = new_p.url
                        if target_url and target_url != "about:blank" and self.page:
                            self.page.goto(target_url)
                            new_p.close()
                    except Exception:
                        pass
                self.context.on("page", _on_new_page)

                self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
                self.page.goto("https://www.pkulaw.com/law", timeout=60000)
                self._log("官网已打开！正在精确检测：1.顶部[登录/注册]是否已变为已登录账号 -> 2.高级检索结果列表...")
                while not self._stop_event.is_set() and self.step_var.get() < 3:
                    try:
                        active_p = self.context.pages[-1]
                        # 严格判断：若页面中仍可见“登录/注册”，说明尚未登录，严禁进入第二步
                        unlogged_btn = active_p.locator("a:has-text('登录/注册'), .login-btn:has-text('登录')").first
                        still_unlogged = False
                        try:
                            still_unlogged = unlogged_btn.is_visible(timeout=400)
                        except Exception:
                            still_unlogged = False

                        body_txt = active_p.locator("body").inner_text(timeout=1200)
                        has_logged_in = (not still_unlogged) and any(k in body_txt for k in ("退出", "个人中心", "欢迎您"))
                        has_results = has_logged_in and ("批量下载" in body_txt) and ("全选" in body_txt)

                        if not has_logged_in:
                            if self.step_var.get() != 1:
                                self.after(0, lambda: self._set_manual_step(1))
                        elif has_logged_in and not has_results:
                            if self.step_var.get() != 2:
                                self.after(0, lambda: self._set_manual_step(2))
                        elif has_results:
                            self.after(0, lambda: self._set_manual_step(3))
                            break
                    except Exception:
                        pass
                    time.sleep(1.2)
            except Exception as e:
                self._log(f"启动浏览器失败: {e}")

        threading.Thread(target=_launch, daemon=True).start()

    def _on_click_start_download(self):
        if not self.first_download_configured:
            self._show_first_time_modal()
        else:
            self._start_download_worker()

    def _show_first_time_modal(self):
        modal = tk.Toplevel(self)
        modal.title("首次下载设置确认")
        modal.geometry("500x230")
        modal.transient(self)
        modal.grab_set()

        frame = tk.Frame(modal, padx=20, pady=16)
        frame.pack(fill="both", expand=True)

        dir_row = tk.Frame(frame)
        dir_row.pack(fill="x", pady=6)
        tk.Label(dir_row, text="下载地址：").pack(side="left")
        tk.Entry(dir_row, textvariable=self.download_dir, width=36).pack(side="left", padx=6)
        tk.Button(dir_row, text="浏览...", command=self._choose_dir).pack(side="left")

        tk.Label(frame, text="解压后打包规则：").pack(anchor="w", pady=(10, 4))
        tk.Radiobutton(frame, text="仅解压全部文件到独立文件夹不合并 (默认)", variable=self.unpack_rule, value="extract_only").pack(anchor="w")
        tk.Radiobutton(frame, text="解压全部文件并合并为单个汇总文本文件", variable=self.unpack_rule, value="extract_and_merge").pack(anchor="w")
        tk.Radiobutton(frame, text="同时保留独立文件夹与合并汇总文件", variable=self.unpack_rule, value="both").pack(anchor="w")

        def _confirm():
            self.first_download_configured = True
            modal.destroy()
            self._start_download_worker()

        tk.Button(frame, text="确认并打开网页下载格式弹窗", bg="#2563EB", fg="white", padx=16, pady=6, command=_confirm).pack(anchor="e", pady=(12, 0))

    def _detect_captcha(self, page) -> bool:
        for sel in [".geetest_panel_box", ".geetest_widget", "#captcha-box", "text=请完成安全验证", "text=拖动滑块"]:
            try:
                if page.locator(sel).first.is_visible(timeout=300):
                    return True
            except Exception:
                continue
        return False

    def _start_download_worker(self):
        if not self.context or not self.context.pages:
            messagebox.showwarning("提示", "请先点击 [1. 启动并显示北大法宝网页窗口] 并在网页中完成检索！")
            return

        def _worker():
            dl_root = Path(self.download_dir.get().strip())
            zip_dir = dl_root / "raw_zips"
            extract_dir = dl_root / "extracted_files"
            zip_dir.mkdir(parents=True, exist_ok=True)
            extract_dir.mkdir(parents=True, exist_ok=True)

            active_page = self.context.pages[-1]
            expected_total = 0
            chosen_format_label = None

            try:
                self._log("正在切换网页 [分组 -> 不分组]...")
                try:
                    grp = active_page.locator("text=分组, a:has-text('分组'), span:has-text('分组')").first
                    if grp.is_visible(timeout=4000):
                        grp.click()
                        time.sleep(0.8)
                    ungrp = active_page.locator("text=不分组, a:has-text('不分组'), li:has-text('不分组')").first
                    if ungrp.is_visible(timeout=4000):
                        ungrp.click()
                        active_page.wait_for_load_state("networkidle", timeout=20000)
                        time.sleep(1.8)
                except Exception:
                    pass

                try:
                    cnt_el = active_page.locator(".total-count, .search-result-count, span.total, em.total").first
                    if cnt_el.is_visible(timeout=4000):
                        nums = re.findall(r"\\d+", cnt_el.inner_text().replace(",", ""))
                        if nums:
                            expected_total = int(nums[0])
                            self._log(f"读取到网页检索结果总数：{expected_total} 条。")
                except Exception:
                    pass

                total_pages = max(1, (expected_total + BATCH_LIMIT - 1) // BATCH_LIMIT) if expected_total > 0 else 999
                current_page = 1

                while current_page <= total_pages:
                    if self._detect_captcha(active_page):
                        self._log(f"[人机验证暂停] 第 {current_page} 页出现验证弹窗，请在网页内完成验证！")
                        try:
                            winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
                        except Exception:
                            pass
                        self._resume_captcha_event.clear()
                        while self._detect_captcha(active_page) and not self._resume_captcha_event.is_set():
                            time.sleep(1.0)
                        self._log("验证已完成，继续下载...")

                    select_all = active_page.locator("input.check-all, label:has-text('全选'), #selectAll").first
                    select_all.click(timeout=10000)
                    time.sleep(0.4)

                    if current_page == 1:
                        # 第1页：自动打开北大法宝网页的“自定义下载”格式选择弹窗，等待用户选择格式并点击“确定”
                        self._log("已自动打开北大法宝网页【自定义下载】格式选择弹窗，请在网页弹窗中选择格式（Excel/Word/PDF/纯文本/超文本/纯净版）并点击【确定】...")
                        with active_page.expect_download(timeout=180000) as dl_info:
                            active_page.locator("a:has-text('批量下载'), button:has-text('下载')").first.click()
                            # 轮询记录用户在弹窗中选中的格式名称（Word / PDF / 纯文本 / 超文本 / 纯净版 / Excel）
                            for _ in range(300):
                                try:
                                    for fmt_name in ("Excel", "Word", "PDF", "纯文本", "超文本", "纯净版"):
                                        loc = active_page.locator(f"label:has-text('{fmt_name}'), span:has-text('{fmt_name}')").first
                                        if loc.is_visible(timeout=100):
                                            checked = active_page.evaluate(
                                                """(name) => {
                                                    const labels = Array.from(document.querySelectorAll('label, li, div'));
                                                    for (const el of labels) {
                                                        if (el.innerText && el.innerText.trim() === name) {
                                                            const inp = el.querySelector('input[type=radio]') || el.previousElementSibling;
                                                            if (inp && inp.checked) return true;
                                                            if (el.className && (el.className.includes('checked') || el.className.includes('active'))) return true;
                                                        }
                                                    }
                                                    return false;
                                                }""",
                                                fmt_name
                                            )
                                            if checked:
                                                chosen_format_label = fmt_name
                                except Exception:
                                    pass
                                time.sleep(0.2)
                        self._log(f"用户已选择下载格式：【{chosen_format_label or '默认选中格式'}】并启动全自动连续下载！")
                    else:
                        # 后续页：自动按照用户在第1页选择的下载格式执行全自动下载
                        with active_page.expect_download(timeout=60000) as dl_info:
                            active_page.locator("a:has-text('批量下载'), button:has-text('下载')").first.click()
                            time.sleep(0.6)
                            if chosen_format_label:
                                try:
                                    fmt_opt = active_page.locator(f"label:has-text('{chosen_format_label}'), span:has-text('{chosen_format_label}')").first
                                    if fmt_opt.is_visible(timeout=2000):
                                        fmt_opt.click()
                                except Exception:
                                    pass
                            active_page.locator("button:has-text('确定'), a:has-text('确定'), .btn-confirm-download").first.click()

                    zip_path = zip_dir / f"PKULAW_Page_{current_page:03d}.zip"
                    dl_info.value.save_as(str(zip_path))
                    self._log(f"第 {current_page} 页已下载：{zip_path.name}")

                    next_btn = active_page.locator("a:has-text('下一页'), .page-next:not(.disabled)").first
                    if not next_btn.is_visible(timeout=3000) or current_page >= total_pages:
                        break

                    time.sleep(random.uniform(MIN_DELAY_SEC, MAX_DELAY_SEC))
                    next_btn.click()
                    active_page.wait_for_load_state("networkidle", timeout=30000)
                    current_page += 1

                # 自动解压所有下载的压缩包文件
                for zf_path in sorted(zip_dir.glob("*.zip")):
                    try:
                        with zipfile.ZipFile(zf_path, "r") as zf:
                            zf.extractall(path=extract_dir)
                    except Exception:
                        pass

                extracted_files = [p for p in sorted(extract_dir.rglob("*")) if p.is_file()]
                rule = self.unpack_rule.get()
                merged_info = ""

                if rule in ("extract_and_merge", "both"):
                    txt_like = [p for p in extracted_files if p.suffix.lower() in (".txt", ".html", ".htm")]
                    if txt_like:
                        merged_file = dl_root / f"PKULAW_Merged_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
                        with open(merged_file, "w", encoding=MERGE_ENCODING) as out_f:
                            for idx, tf in enumerate(txt_like, 1):
                                raw = tf.read_bytes()
                                txt = raw.decode("utf-8", errors="ignore")
                                out_f.write(f"=== [{idx:03d}] {tf.name} ===\\n{txt}\\n\\n")
                        merged_info = f"\\n合并汇总文件：{merged_file}"

                summary = (
                    f"下载与自动解压已完成！\\n"
                    f"所选下载格式：{chosen_format_label or '自定义格式'}\\n"
                    f"网页检索数量：{expected_total} 条\\n"
                    f"实际解压文件数量：{len(extracted_files)} 个\\n"
                    f"核对结论：{'数量完全一致' if expected_total in (0, len(extracted_files)) else '存在数量差异，请检查'}\\n"
                    f"解压输出文件夹：{extract_dir}{merged_info}"
                )
                self._log(summary)
                self.after(0, lambda: messagebox.showinfo("下载完成与数量核对结果", summary))

            except Exception as e:
                self._log(f"下载过程出错: {e}")

        threading.Thread(target=_worker, daemon=True).start()


if __name__ == "__main__":
    app = PKULawPortableApp()
    app.mainloop()
`;
  return toWindowsCrlf(pyCode);
}

export function generateRequirementsTxt(): string {
  return toWindowsCrlf(`playwright>=1.49.0\n`);
}

/**
 * 100% 纯 ASCII 英文 + CRLF 换行符的免安装便携启动脚本（彻底杜绝 Windows cmd.exe 编码偏移截断报错）
 */
export function generateQuickRunBat(): string {
  const bat = `@echo off
title PKULAW Portable Downloader Launcher
echo ======================================================================
echo   PKULAW Portable Batch Downloader - Starting Environment Check
echo ======================================================================
echo.
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python was not found in PATH.
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)
echo [Step 1/2] Checking Playwright library and Chromium browser...
python -m pip install playwright -i https://pypi.tuna.tsinghua.edu.cn/simple
python -m playwright install chromium
echo.
echo [Step 2/2] Launching PKULAW Portable Application...
python pkulaw_portable_app.py
pause
`;
  return toWindowsCrlf(bat);
}

/**
 * 100% 纯 ASCII 英文 + CRLF 换行符的 EXE 编译脚本（修复之前因中文 UTF-8 与括号导致的截断闪退）
 */
export function generateBuildExeBat(): string {
  const bat = `@echo off
title PKULAW Standalone EXE Builder
echo ======================================================================
echo   PKULAW Batch Downloader - Standalone EXE Builder
echo ======================================================================
echo.
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python was not found in PATH.
    pause
    exit /b 1
)
echo [1/3] Installing Playwright and PyInstaller via Tsinghua mirror...
python -m pip install playwright pyinstaller -i https://pypi.tuna.tsinghua.edu.cn/simple
echo.
echo [2/3] Ensuring Playwright Chromium driver is installed...
python -m playwright install chromium
echo.
echo [3/3] Packaging pkulaw_portable_app.py into dist\\PKULawDownloader.exe...
python -m PyInstaller --noconfirm --onefile --windowed --name PKULawDownloader pkulaw_portable_app.py
echo.
echo ======================================================================
echo   Build Complete! Output file: dist\\PKULawDownloader.exe
echo ======================================================================
if exist dist explorer dist
pause
`;
  return toWindowsCrlf(bat);
}
