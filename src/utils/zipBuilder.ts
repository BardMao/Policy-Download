/**
 * Pure TypeScript ZIP Archive Builder (Store Method 0x0000 with IEEE 802.3 CRC-32)
 * Generates standard .zip archives in-browser with zero external dependencies.
 */

export interface ZipFileEntry {
  name: string; // e.g., "PKULaw_Extension/manifest.json"
  content: string | Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipArchive(entries: ZipFileEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localFileChunks: Uint8Array[] = [];
  const centralDirChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes =
      typeof entry.content === 'string'
        ? encoder.encode(entry.content)
        : entry.content;
    const fileCrc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local File Header (30 bytes + filename + data)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true); // General purpose bit flag (Bit 11: UTF-8 filename)
    lv.setUint16(8, 0, true); // Compression method: 0 (Stored)
    lv.setUint16(10, 0x4800, true); // Last mod file time
    lv.setUint16(12, 0x555d, true); // Last mod file date
    lv.setUint32(14, fileCrc, true); // CRC-32
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localFileChunks.push(localHeader, dataBytes);

    // Central Directory File Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central file header signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed to extract
    cv.setUint16(8, 0x0800, true); // General purpose bit flag (UTF-8)
    cv.setUint16(10, 0, true); // Compression method: 0 (Stored)
    cv.setUint16(12, 0x4800, true); // Last mod file time
    cv.setUint16(14, 0x555d, true); // Last mod file date
    cv.setUint32(16, fileCrc, true); // CRC-32
    cv.setUint32(20, size, true); // Compressed size
    cv.setUint32(24, size, true); // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // File name length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // File comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, 0, true); // External file attributes
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralDirChunks.push(centralHeader);
    offset += localHeader.length + size;
  }

  let centralDirSize = 0;
  for (const chunk of centralDirChunks) {
    centralDirSize += chunk.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // Number of this disk
  ev.setUint16(6, 0, true); // Disk where central directory starts
  ev.setUint16(8, entries.length, true); // Number of central directory records on this disk
  ev.setUint16(10, entries.length, true); // Total number of central directory records
  ev.setUint32(12, centralDirSize, true); // Size of central directory (bytes)
  ev.setUint32(16, offset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true); // Comment length

  const totalLength = offset + centralDirSize + 22;
  const output = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of localFileChunks) {
    output.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of centralDirChunks) {
    output.set(chunk, pos);
    pos += chunk.length;
  }
  output.set(eocd, pos);

  return output;
}
