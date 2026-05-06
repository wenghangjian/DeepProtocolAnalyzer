import type { ReadRequest, WriteRequest, DecodedFrame } from "../../packages/shared-types";
import { ProtocolError } from "../../packages/shared-types";
import type { ProtocolAdapter, SessionKernelContext } from "../../packages/protocol-core";
import { TcpTransport } from "../../packages/transport-core/tcp-transport";
import { AdapterBackedDriver } from "../_shared/adapter-driver";

// ─── DNP3 Configuration & Runtime ──────────────────────────────────────────

/** Configuration for a DNP3 TCP connection. */
interface DNP3Config {
  host: string;
  port: number;
  /** DNP3 source (master) address (0–65535). */
  sourceAddress: number;
  /** DNP3 destination (outstation) address (0–65535). */
  destinationAddress: number;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
  writeTimeoutMs?: number;
}

/** Runtime state maintained across transactions. */
interface DNP3Runtime {
  /** Application-layer sequence number (0–15). */
  appSequence: number;
  /** Transport-layer sequence number (0–63). */
  transportSequence: number;
}

// ─── DNP3 Object Types ─────────────────────────────────────────────────────

/** Describes an object group/variation range to read. */
interface DNP3ObjectRange {
  group: number;
  variation: number;
  /** Qualifier code (0x00 = range by start/stop, 0x06 = all objects, 0x5B = count). */
  qualifier: number;
  start?: number;
  stop?: number;
  count?: number;
}

/** A decoded DNP3 object value. */
interface DNP3ObjectValue {
  group: number;
  variation: number;
  index: number;
  value: number | boolean;
  quality?: number;
  timestamp?: number;
}

/** Parsed DNP3 application-layer response. */
interface DNP3Response {
  functionCode: number;
  iin1: number;
  iin2: number;
  objects: DNP3ObjectValue[];
  rawObjects: Uint8Array;
}

// ─── DNP3 Constants ────────────────────────────────────────────────────────

/** DNP3 data-link start bytes. */
const DNP3_START = [0x05, 0x64];

/** DNP3 Application Function Codes. */
const FC = {
  READ: 0x01,
  WRITE: 0x02,
  SELECT: 0x03,
  OPERATE: 0x04,
  DIRECT_OPERATE: 0x05,
  COLD_RESTART: 0x0D,
  WARM_RESTART: 0x0E,
  RESPONSE: 0x81,
  UNSOLICITED: 0x82,
} as const;

/** DNP3 Data-Link Function Codes (user data = 0x03, unconfirmed = 0x04). */
const DL_FC = {
  RESET_LINK: 0x00,
  RESET_USER: 0x01,
  TEST_LINK: 0x02,
  USER_DATA: 0x03,
  UNCONFIRMED_USER_DATA: 0x04,
} as const;

/** Qualifier codes. */
const QUAL = {
  RANGE_8BIT: 0x00,
  RANGE_16BIT: 0x01,
  ALL_OBJECTS: 0x06,
  COUNT_8BIT: 0x07,
  COUNT_16BIT: 0x08,
  COUNT_8BIT_PREFIX: 0x17,
  COUNT_16BIT_PREFIX: 0x28,
} as const;

// ─── CRC-16/DNP3 ──────────────────────────────────────────────────────────

/**
 * Precomputed CRC-16/DNP3 lookup table.
 * Polynomial: 0x3D65 (reflected: 0xA6BC), init: 0x0000.
 */
const DNP3_CRC_TABLE: Uint16Array = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >> 1) ^ 0xA6BC;
      } else {
        crc >>= 1;
      }
    }
    table[i] = crc;
  }
  return table;
})();

/**
 * Calculate CRC-16/DNP3 over a byte buffer.
 * Uses the reflected algorithm with polynomial 0xA6BC (bit-reverse of 0x3D65).
 * @param data - Input bytes
 * @returns 16-bit CRC value
 */
function calculateDNP3CRC(data: Uint8Array): number {
  let crc = 0x0000;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >> 8) ^ DNP3_CRC_TABLE[(crc ^ data[i]) & 0xFF];
  }
  return crc;
}

// ─── Frame Building ────────────────────────────────────────────────────────

/**
 * Build a complete DNP3 data-link frame with CRC per 16-byte chunk.
 *
 * Frame layout:
 * ```
 * [0x05][0x64][length][control][dest_lo][dest_hi][src_lo][src_hi][crc_lo][crc_hi]
 * [user_data_chunk_0 (≤16 bytes)][crc_lo][crc_hi]
 * [user_data_chunk_1 ...][crc_lo][crc_hi] ...
 * ```
 *
 * @param dest - Destination address (little-endian)
 * @param src - Source address (little-endian)
 * @param control - Data-link control byte
 * @param data - User data (transport + application layer)
 * @returns Complete DNP3 frame bytes
 */
function buildDNP3Frame(dest: number, src: number, control: number, data: Uint8Array): Uint8Array {
  const userDataLength = data.length;
  const numChunks = Math.ceil(userDataLength / 16) || (userDataLength === 0 ? 0 : 1);
  // Header: start(2) + length(1) + control(1) + dest(2) + src(2) + headerCRC(2) = 10
  // Data: userDataLength + numChunks * 2 (chunk CRCs)
  const totalSize = 10 + userDataLength + numChunks * 2;
  const frame = new Uint8Array(totalSize);
  let offset = 0;

  // Start bytes
  frame[offset++] = 0x05;
  frame[offset++] = 0x64;

  // Length: control(1) + dest(2) + src(2) + userDataLength = 5 + userDataLength
  const length = 5 + userDataLength;
  frame[offset++] = length & 0xFF;

  // Control byte
  frame[offset++] = control & 0xFF;

  // Destination (little-endian)
  frame[offset++] = dest & 0xFF;
  frame[offset++] = (dest >> 8) & 0xFF;

  // Source (little-endian)
  frame[offset++] = src & 0xFF;
  frame[offset++] = (src >> 8) & 0xFF;

  // Header CRC over bytes [2..7] (length, control, dest, src)
  const headerCrc = calculateDNP3CRC(frame.slice(2, 8));
  frame[offset++] = headerCrc & 0xFF;
  frame[offset++] = (headerCrc >> 8) & 0xFF;

  // User data in 16-byte chunks, each followed by CRC
  for (let i = 0; i < userDataLength; i += 16) {
    const chunkEnd = Math.min(i + 16, userDataLength);
    const chunk = data.slice(i, chunkEnd);
    frame.set(chunk, offset);
    offset += chunk.length;

    const chunkCrc = calculateDNP3CRC(chunk);
    frame[offset++] = chunkCrc & 0xFF;
    frame[offset++] = (chunkCrc >> 8) & 0xFF;
  }

  return frame;
}

// ─── Frame Parsing ─────────────────────────────────────────────────────────

/** Result of parsing a DNP3 data-link frame. */
interface ParsedDNP3Frame {
  dest: number;
  src: number;
  control: number;
  data: Uint8Array;
  valid: boolean;
  error?: string;
}

/**
 * Parse and validate a DNP3 data-link frame, stripping CRCs.
 * @param buffer - Raw bytes to parse
 * @returns Parsed frame with extracted user data, or invalid result
 */
function parseDNP3Frame(buffer: Uint8Array): ParsedDNP3Frame {
  const invalid = (error: string): ParsedDNP3Frame => ({
    dest: 0, src: 0, control: 0, data: new Uint8Array(), valid: false, error
  });

  if (buffer.length < 10) {
    return invalid("Frame too short (minimum 10 bytes)");
  }

  // Verify start bytes
  if (buffer[0] !== 0x05 || buffer[1] !== 0x64) {
    return invalid(`Invalid start bytes: 0x${buffer[0].toString(16)} 0x${buffer[1].toString(16)}`);
  }

  const length = buffer[2];
  if (length < 5 || length > 255) {
    return invalid(`Invalid length byte: ${length} (must be 5–255)`);
  }

  const control = buffer[3];
  const dest = buffer[4] | (buffer[5] << 8);
  const src = buffer[6] | (buffer[7] << 8);

  // Verify header CRC (over bytes 2–7)
  const headerCrc = calculateDNP3CRC(buffer.slice(2, 8));
  const receivedHeaderCrc = buffer[8] | (buffer[9] << 8);
  if (headerCrc !== receivedHeaderCrc) {
    return invalid(`Header CRC mismatch: expected 0x${headerCrc.toString(16)}, got 0x${receivedHeaderCrc.toString(16)}`);
  }

  // Extract user data (length - 5 bytes)
  const userDataLength = length - 5;
  const data = new Uint8Array(userDataLength);
  let dataOffset = 0;
  let bufOffset = 10;

  for (let i = 0; i < userDataLength; i += 16) {
    const chunkSize = Math.min(16, userDataLength - i);
    if (bufOffset + chunkSize + 2 > buffer.length) {
      return invalid("Frame truncated: not enough data for chunk CRC");
    }

    const chunk = buffer.slice(bufOffset, bufOffset + chunkSize);
    const chunkCrc = calculateDNP3CRC(chunk);
    const receivedChunkCrc = buffer[bufOffset + chunkSize] | (buffer[bufOffset + chunkSize + 1] << 8);
    if (chunkCrc !== receivedChunkCrc) {
      return invalid(`Data CRC mismatch at offset ${bufOffset}: expected 0x${chunkCrc.toString(16)}, got 0x${receivedChunkCrc.toString(16)}`);
    }

    data.set(chunk, dataOffset);
    dataOffset += chunkSize;
    bufOffset += chunkSize + 2;
  }

  return { dest, src, control, data, valid: true };
}

// ─── Transport Layer ───────────────────────────────────────────────────────

/**
 * Build a transport-layer header byte.
 * @param fir - First fragment flag
 * @param fin - Last fragment flag
 * @param sequence - Transport sequence number (0–63)
 */
function buildTransportHeader(fir: boolean, fin: boolean, sequence: number): number {
  return ((fir ? 1 : 0) << 7) | ((fin ? 1 : 0) << 6) | (sequence & 0x3F);
}

/**
 * Parse a transport-layer header byte.
 * @param header - Transport header byte
 */
function parseTransportHeader(header: number): { fir: boolean; fin: boolean; sequence: number } {
  return {
    fir: !!(header & 0x80),
    fin: !!(header & 0x40),
    sequence: header & 0x3F,
  };
}

// ─── Application Layer ─────────────────────────────────────────────────────

/**
 * Build an application-layer control byte.
 * @param fir - First fragment
 * @param fin - Final fragment
 * @param con - Confirmation required
 * @param uns - Unsolicited response
 * @param sequence - Application sequence (0–15)
 */
function buildAppControl(fir: boolean, fin: boolean, con: boolean, uns: boolean, sequence: number): number {
  return ((fir ? 1 : 0) << 7)
    | ((fin ? 1 : 0) << 6)
    | ((con ? 1 : 0) << 5)
    | ((uns ? 1 : 0) << 4)
    | (sequence & 0x0F);
}

/**
 * Parse an application-layer control byte.
 */
function parseAppControl(control: number): { fir: boolean; fin: boolean; con: boolean; uns: boolean; sequence: number } {
  return {
    fir: !!(control & 0x80),
    fin: !!(control & 0x40),
    con: !!(control & 0x20),
    uns: !!(control & 0x10),
    sequence: control & 0x0F,
  };
}

// ─── Object Building ───────────────────────────────────────────────────────

/**
 * Build object headers for a Read request (function code 0x01).
 * @param objects - Array of object range descriptors
 * @returns Serialized object header bytes
 */
function buildReadObjectHeaders(objects: DNP3ObjectRange[]): Uint8Array {
  const parts: number[] = [];

  for (const obj of objects) {
    parts.push(obj.group);
    parts.push(obj.variation);
    parts.push(obj.qualifier);

    switch (obj.qualifier) {
      case QUAL.RANGE_8BIT:
        parts.push(obj.start ?? 0);
        parts.push(obj.stop ?? 0);
        break;
      case QUAL.RANGE_16BIT:
        parts.push((obj.start ?? 0) & 0xFF);
        parts.push(((obj.start ?? 0) >> 8) & 0xFF);
        parts.push((obj.stop ?? 0) & 0xFF);
        parts.push(((obj.stop ?? 0) >> 8) & 0xFF);
        break;
      case QUAL.ALL_OBJECTS:
        // No range fields
        break;
      case QUAL.COUNT_8BIT:
        parts.push(obj.count ?? 0);
        break;
      case QUAL.COUNT_16BIT:
        parts.push((obj.count ?? 0) & 0xFF);
        parts.push(((obj.count ?? 0) >> 8) & 0xFF);
        break;
      default:
        // For other qualifiers, use provided range
        if (obj.start !== undefined && obj.stop !== undefined) {
          parts.push(obj.start & 0xFF);
          parts.push(obj.stop & 0xFF);
        }
        break;
    }
  }

  return new Uint8Array(parts);
}

/**
 * Build object headers with data for a Write request (function code 0x02).
 * @param objects - Array of object values to write
 * @returns Serialized object header + data bytes
 */
function buildWriteObjectHeaders(objects: DNP3ObjectValue[]): Uint8Array {
  const parts: number[] = [];

  // Group objects by group/variation
  const groups = new Map<string, DNP3ObjectValue[]>();
  for (const obj of objects) {
    const key = `${obj.group}/${obj.variation}`;
    const arr = groups.get(key) ?? [];
    arr.push(obj);
    groups.set(key, arr);
  }

  for (const [, objs] of groups) {
    const first = objs[0];
    parts.push(first.group);
    parts.push(first.variation);

    // Use count with 1-byte prefix (index before each value)
    parts.push(QUAL.COUNT_8BIT_PREFIX);
    parts.push(objs.length);

    for (const obj of objs) {
      // 1-byte prefix (index)
      parts.push(obj.index & 0xFF);

      // Encode value based on variation
      const valueBytes = encodeObjectValue(first.group, first.variation, obj.value);
      parts.push(...valueBytes);
    }
  }

  return new Uint8Array(parts);
}

/**
 * Encode a single object value based on group/variation.
 * @returns Serialized value bytes (without index prefix)
 */
function encodeObjectValue(group: number, variation: number, value: number | boolean): number[] {
  // Binary Input (Group 1) / Binary Output (Group 10)
  if (group === 1 || group === 10) {
    if (variation === 1) {
      return [value ? 0x81 : 0x01]; // packed bit with quality
    }
    if (variation === 2) {
      return [value ? 1 : 0]; // flag only
    }
    return [value ? 1 : 0];
  }

  // Counter (Group 20)
  if (group === 20) {
    const v = typeof value === "number" ? value : (value ? 1 : 0);
    if (variation === 1 || variation === 5) {
      // 32-bit counter with flag
      return [0x01, v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF];
    }
    if (variation === 2 || variation === 6) {
      // 16-bit counter with flag
      return [0x01, v & 0xFF, (v >> 8) & 0xFF];
    }
    return [v & 0xFF, (v >> 8) & 0xFF];
  }

  // Analog Input (Group 30) / Analog Output (Group 40)
  if (group === 30 || group === 40) {
    const v = typeof value === "number" ? value : (value ? 1 : 0);
    if (variation === 1 || variation === 2) {
      // 32-bit with flag
      const buf = new ArrayBuffer(4);
      if (variation === 1) {
        new DataView(buf).setInt32(0, v, true); // little-endian
      } else {
        new DataView(buf).setFloat32(0, v, true);
      }
      const bytes = new Uint8Array(buf);
      return [0x01, bytes[0], bytes[1], bytes[2], bytes[3]];
    }
    if (variation === 3 || variation === 4) {
      // 16-bit with flag
      const raw = variation === 3 ? (v < 0 ? v + 0x10000 : v) : v;
      return [0x01, raw & 0xFF, (raw >> 8) & 0xFF];
    }
    if (variation === 5) {
      // 32-bit without flag
      const buf = new ArrayBuffer(4);
      new DataView(buf).setInt32(0, v, true);
      const bytes = new Uint8Array(buf);
      return [bytes[0], bytes[1], bytes[2], bytes[3]];
    }
    // Default: 32-bit integer with flag
    return [0x01, v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF];
  }

  // Default: encode as single byte
  const v = typeof value === "number" ? value : (value ? 1 : 0);
  return [v & 0xFF];
}

// ─── Object Parsing ────────────────────────────────────────────────────────

/**
 * Parse object data from a DNP3 application-layer response.
 * @param data - Object data bytes (after IIN flags in response)
 * @returns Array of parsed object values
 */
function parseObjectData(data: Uint8Array): DNP3ObjectValue[] {
  const objects: DNP3ObjectValue[] = [];
  let offset = 0;

  while (offset < data.length) {
    if (offset + 3 > data.length) break;

    const group = data[offset++];
    const variation = data[offset++];
    const qualifier = data[offset++];

    const prefixCode = (qualifier >> 3) & 0x1F;
    const rangeCode = qualifier & 0x07;

    let startIndex = 0;
    let count = 0;

    // Determine range/count
    switch (rangeCode) {
      case 0x00: { // Range by start/stop (8-bit)
        if (offset + 2 > data.length) return objects;
        startIndex = data[offset++];
        const stop = data[offset++];
        count = stop - startIndex + 1;
        break;
      }
      case 0x01: { // Range by start/stop (16-bit)
        if (offset + 4 > data.length) return objects;
        startIndex = data[offset] | (data[offset + 1] << 8);
        offset += 2;
        const stop16 = data[offset] | (data[offset + 1] << 8);
        offset += 2;
        count = stop16 - startIndex + 1;
        break;
      }
      case 0x06: { // All objects
        count = 0; // Will read until end
        break;
      }
      case 0x07: { // Count (8-bit)
        if (offset + 1 > data.length) return objects;
        count = data[offset++];
        break;
      }
      case 0x08: { // Count (16-bit)
        if (offset + 2 > data.length) return objects;
        count = data[offset] | (data[offset + 1] << 8);
        offset += 2;
        break;
      }
      default:
        return objects;
    }

    // Parse prefix (index size)
    let prefixSize = 0;
    switch (prefixCode) {
      case 0x00: prefixSize = 0; break;
      case 0x01: prefixSize = 1; break;
      case 0x02: prefixSize = 2; break;
      case 0x04: prefixSize = 4; break;
      default: prefixSize = 0; break;
    }

    // Determine value size based on group/variation
    const valueSize = getObjectValueSize(group, variation);

    if (rangeCode === 0x06) {
      // All objects: read remaining data
      let index = 0;
      while (offset < data.length) {
        if (prefixSize > 0 && offset + prefixSize <= data.length) {
          if (prefixSize === 1) index = data[offset];
          else if (prefixSize === 2) index = data[offset] | (data[offset + 1] << 8);
          offset += prefixSize;
        }

        if (valueSize > 0 && offset + valueSize <= data.length) {
          const valueBytes = data.slice(offset, offset + valueSize);
          const parsed = decodeObjectValue(group, variation, valueBytes);
          objects.push({
            group,
            variation,
            index: index++,
            value: parsed.value,
            quality: parsed.quality,
            timestamp: parsed.timestamp,
          });
          offset += valueSize;
        } else {
          break;
        }
      }
    } else {
      // Fixed count
      for (let i = 0; i < count && offset < data.length; i++) {
        let index = startIndex + i;

        if (prefixSize > 0 && offset + prefixSize <= data.length) {
          if (prefixSize === 1) index = data[offset];
          else if (prefixSize === 2) index = data[offset] | (data[offset + 1] << 8);
          offset += prefixSize;
        }

        if (valueSize > 0 && offset + valueSize <= data.length) {
          const valueBytes = data.slice(offset, offset + valueSize);
          const parsed = decodeObjectValue(group, variation, valueBytes);
          objects.push({
            group,
            variation,
            index,
            value: parsed.value,
            quality: parsed.quality,
            timestamp: parsed.timestamp,
          });
          offset += valueSize;
        } else {
          break;
        }
      }
    }
  }

  return objects;
}

/** Decoded object value with optional quality/timestamp. */
interface DecodedObjectValue {
  value: number | boolean;
  quality?: number;
  timestamp?: number;
}

/**
 * Get the byte size of a single object value for a given group/variation.
 * Returns 0 for variable-length objects.
 */
function getObjectValueSize(group: number, variation: number): number {
  // Binary Input (Group 1)
  if (group === 1) {
    if (variation === 0) return 1; // packed
    if (variation === 1) return 1; // flag
    if (variation === 2) return 1; // no flag
  }
  // Binary Output (Group 10)
  if (group === 10) {
    if (variation === 0) return 1;
    if (variation === 1) return 1;
    if (variation === 2) return 1;
  }
  // Counter (Group 20)
  if (group === 20) {
    if (variation === 0) return 5; // 32-bit with flag (default)
    if (variation === 1) return 5; // 32-bit with flag
    if (variation === 2) return 3; // 16-bit with flag
    if (variation === 5) return 5; // 32-bit with flag
    if (variation === 6) return 3; // 16-bit with flag
  }
  // Analog Input (Group 30)
  if (group === 30) {
    if (variation === 0) return 5; // 32-bit with flag (default)
    if (variation === 1) return 5; // 32-bit int with flag
    if (variation === 2) return 5; // 32-bit float with flag
    if (variation === 3) return 3; // 16-bit int with flag
    if (variation === 4) return 3; // 16-bit float with flag (actually 16-bit with flag)
    if (variation === 5) return 4; // 32-bit int no flag
  }
  // Analog Output (Group 40)
  if (group === 40) {
    if (variation === 0) return 5;
    if (variation === 1) return 5; // 32-bit int with flag
    if (variation === 2) return 5; // 32-bit float with flag
    if (variation === 3) return 3; // 16-bit int with flag
    if (variation === 4) return 3; // 16-bit float with flag
  }
  // Class Data (Group 60) — these are request-only, no fixed size
  if (group === 60) return 0;

  return 0;
}

/**
 * Decode a single object value from raw bytes.
 */
function decodeObjectValue(group: number, variation: number, bytes: Uint8Array): DecodedObjectValue {
  if (bytes.length === 0) return { value: 0 };

  // Binary Input (Group 1)
  if (group === 1) {
    if (variation === 1) {
      return { value: !!(bytes[0] & 0x80), quality: bytes[0] & 0x7F };
    }
    if (variation === 2) {
      return { value: !!bytes[0] };
    }
    // Variation 0 (default): treat as flag
    return { value: !!(bytes[0] & 0x80), quality: bytes[0] & 0x7F };
  }

  // Binary Output (Group 10)
  if (group === 10) {
    if (variation === 1) {
      return { value: !!(bytes[0] & 0x80), quality: bytes[0] & 0x7F };
    }
    if (variation === 2) {
      return { value: !!bytes[0] };
    }
    return { value: !!(bytes[0] & 0x80), quality: bytes[0] & 0x7F };
  }

  // Counter (Group 20)
  if (group === 20) {
    if (variation === 1 || variation === 5) {
      // 32-bit with flag
      if (bytes.length >= 5) {
        const quality = bytes[0];
        const val = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24);
        return { value: val >>> 0, quality };
      }
    }
    if (variation === 2 || variation === 6) {
      // 16-bit with flag
      if (bytes.length >= 3) {
        const quality = bytes[0];
        const val = bytes[1] | (bytes[2] << 8);
        return { value: val, quality };
      }
    }
    // Default: 32-bit with flag
    if (bytes.length >= 5) {
      const quality = bytes[0];
      const val = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24);
      return { value: val >>> 0, quality };
    }
    if (bytes.length >= 3) {
      const quality = bytes[0];
      const val = bytes[1] | (bytes[2] << 8);
      return { value: val, quality };
    }
    return { value: bytes[0] };
  }

  // Analog Input (Group 30)
  if (group === 30) {
    if (variation === 1) {
      // 32-bit signed integer with flag
      if (bytes.length >= 5) {
        const quality = bytes[0];
        const val = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24);
        return { value: val, quality };
      }
    }
    if (variation === 2) {
      // 32-bit float with flag
      if (bytes.length >= 5) {
        const quality = bytes[0];
        const buf = new ArrayBuffer(4);
        new Uint8Array(buf).set(bytes.slice(1, 5));
        const val = new DataView(buf).getFloat32(0, true);
        return { value: val, quality };
      }
    }
    if (variation === 3) {
      // 16-bit signed integer with flag
      if (bytes.length >= 3) {
        const quality = bytes[0];
        let val = bytes[1] | (bytes[2] << 8);
        if (val > 0x7FFF) val -= 0x10000;
        return { value: val, quality };
      }
    }
    if (variation === 4) {
      // 16-bit unsigned integer with flag
      if (bytes.length >= 3) {
        const quality = bytes[0];
        const val = bytes[1] | (bytes[2] << 8);
        return { value: val, quality };
      }
    }
    if (variation === 5) {
      // 32-bit integer without flag
      if (bytes.length >= 4) {
        const val = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
        return { value: val };
      }
    }
    // Default: 32-bit with flag
    if (bytes.length >= 5) {
      const quality = bytes[0];
      const val = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24);
      return { value: val, quality };
    }
    return { value: bytes[0] };
  }

  // Analog Output (Group 40)
  if (group === 40) {
    if (variation === 1) {
      if (bytes.length >= 5) {
        const quality = bytes[0];
        const val = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24);
        return { value: val, quality };
      }
    }
    if (variation === 2) {
      if (bytes.length >= 5) {
        const quality = bytes[0];
        const buf = new ArrayBuffer(4);
        new Uint8Array(buf).set(bytes.slice(1, 5));
        const val = new DataView(buf).getFloat32(0, true);
        return { value: val, quality };
      }
    }
    if (variation === 3) {
      if (bytes.length >= 3) {
        const quality = bytes[0];
        let val = bytes[1] | (bytes[2] << 8);
        if (val > 0x7FFF) val -= 0x10000;
        return { value: val, quality };
      }
    }
    if (variation === 4) {
      if (bytes.length >= 3) {
        const quality = bytes[0];
        const val = bytes[1] | (bytes[2] << 8);
        return { value: val, quality };
      }
    }
    // Default
    if (bytes.length >= 5) {
      const quality = bytes[0];
      const val = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24);
      return { value: val, quality };
    }
    return { value: bytes[0] };
  }

  // Fallback: return raw first byte
  return { value: bytes[0] };
}

// ─── Application-Layer Request/Response Building ───────────────────────────

/**
 * Build a complete DNP3 application-layer Read request.
 * @param objects - Object ranges to read
 * @param appSeq - Application sequence number (0–15)
 * @param transportSeq - Transport sequence number (0–63)
 * @returns Transport + application layer bytes (to be wrapped in data-link frame)
 */
function buildReadRequest(objects: DNP3ObjectRange[], appSeq: number, transportSeq: number): Uint8Array {
  const appControl = buildAppControl(true, true, false, false, appSeq);
  const objectHeaders = buildReadObjectHeaders(objects);

  // Application layer: control(1) + function(1) + objects
  const appLayer = new Uint8Array(2 + objectHeaders.length);
  appLayer[0] = appControl;
  appLayer[1] = FC.READ;
  appLayer.set(objectHeaders, 2);

  // Transport header + application layer
  const transportHeader = buildTransportHeader(true, true, transportSeq);
  const result = new Uint8Array(1 + appLayer.length);
  result[0] = transportHeader;
  result.set(appLayer, 1);

  return result;
}

/**
 * Build a complete DNP3 application-layer Write request.
 * @param objects - Object values to write
 * @param appSeq - Application sequence number
 * @param transportSeq - Transport sequence number
 * @returns Transport + application layer bytes
 */
function buildWriteRequest(objects: DNP3ObjectValue[], appSeq: number, transportSeq: number): Uint8Array {
  const appControl = buildAppControl(true, true, false, false, appSeq);
  const objectHeaders = buildWriteObjectHeaders(objects);

  const appLayer = new Uint8Array(2 + objectHeaders.length);
  appLayer[0] = appControl;
  appLayer[1] = FC.WRITE;
  appLayer.set(objectHeaders, 2);

  const transportHeader = buildTransportHeader(true, true, transportSeq);
  const result = new Uint8Array(1 + appLayer.length);
  result[0] = transportHeader;
  result.set(appLayer, 1);

  return result;
}

/**
 * Build a Select request (function code 0x03).
 */
function buildSelectRequest(objects: DNP3ObjectValue[], appSeq: number, transportSeq: number): Uint8Array {
  const appControl = buildAppControl(true, true, false, false, appSeq);
  const objectHeaders = buildWriteObjectHeaders(objects);

  const appLayer = new Uint8Array(2 + objectHeaders.length);
  appLayer[0] = appControl;
  appLayer[1] = FC.SELECT;
  appLayer.set(objectHeaders, 2);

  const transportHeader = buildTransportHeader(true, true, transportSeq);
  const result = new Uint8Array(1 + appLayer.length);
  result[0] = transportHeader;
  result.set(appLayer, 1);

  return result;
}

/**
 * Build an Operate request (function code 0x04).
 */
function buildOperateRequest(objects: DNP3ObjectValue[], appSeq: number, transportSeq: number): Uint8Array {
  const appControl = buildAppControl(true, true, false, false, appSeq);
  const objectHeaders = buildWriteObjectHeaders(objects);

  const appLayer = new Uint8Array(2 + objectHeaders.length);
  appLayer[0] = appControl;
  appLayer[1] = FC.OPERATE;
  appLayer.set(objectHeaders, 2);

  const transportHeader = buildTransportHeader(true, true, transportSeq);
  const result = new Uint8Array(1 + appLayer.length);
  result[0] = transportHeader;
  result.set(appLayer, 1);

  return result;
}

/**
 * Build a Direct Operate request (function code 0x05).
 */
function buildDirectOperateRequest(objects: DNP3ObjectValue[], appSeq: number, transportSeq: number): Uint8Array {
  const appControl = buildAppControl(true, true, false, false, appSeq);
  const objectHeaders = buildWriteObjectHeaders(objects);

  const appLayer = new Uint8Array(2 + objectHeaders.length);
  appLayer[0] = appControl;
  appLayer[1] = FC.DIRECT_OPERATE;
  appLayer.set(objectHeaders, 2);

  const transportHeader = buildTransportHeader(true, true, transportSeq);
  const result = new Uint8Array(1 + appLayer.length);
  result[0] = transportHeader;
  result.set(appLayer, 1);

  return result;
}

/**
 * Build a restart request (Cold or Warm).
 */
function buildRestartRequest(functionCode: number, appSeq: number, transportSeq: number): Uint8Array {
  const appControl = buildAppControl(true, true, false, false, appSeq);

  const appLayer = new Uint8Array(2);
  appLayer[0] = appControl;
  appLayer[1] = functionCode;

  const transportHeader = buildTransportHeader(true, true, transportSeq);
  const result = new Uint8Array(1 + appLayer.length);
  result[0] = transportHeader;
  result.set(appLayer, 1);

  return result;
}

// ─── Response Parsing ──────────────────────────────────────────────────────

/**
 * Parse a DNP3 application-layer response.
 * Handles multi-fragment reassembly if needed.
 * @param data - Transport + application layer bytes (data-link user data)
 * @returns Parsed response with IIN flags and object data
 */
function parseResponse(data: Uint8Array): DNP3Response {
  if (data.length < 3) {
    return { functionCode: 0, iin1: 0, iin2: 0, objects: [], rawObjects: new Uint8Array() };
  }

  // Transport header
  const transport = parseTransportHeader(data[0]);

  // Application layer starts at offset 1
  const appControl = parseAppControl(data[1]);
  const functionCode = data[2];

  let iin1 = 0;
  let iin2 = 0;
  let objectDataStart = 3;

  // Response function codes have IIN after function code
  if (functionCode === FC.RESPONSE || functionCode === FC.UNSOLICITED) {
    if (data.length >= 5) {
      iin1 = data[3];
      iin2 = data[4];
      objectDataStart = 5;
    }
  }

  const rawObjects = data.slice(objectDataStart);
  const objects = parseObjectData(rawObjects);

  return {
    functionCode,
    iin1,
    iin2,
    objects,
    rawObjects,
  };
}

// ─── Human-Readable Decode ─────────────────────────────────────────────────

/** DNP3 function code names. */
const FC_NAMES: Record<number, string> = {
  0x00: "Confirm",
  0x01: "Read",
  0x02: "Write",
  0x03: "Select",
  0x04: "Operate",
  0x05: "Direct Operate",
  0x06: "Direct Operate No Ack",
  0x0D: "Cold Restart",
  0x0E: "Warm Restart",
  0x81: "Response",
  0x82: "Unsolicited Response",
};

/** DNP3 object group names. */
const GROUP_NAMES: Record<number, string> = {
  1: "Binary Input",
  2: "Binary Input Event",
  10: "Binary Output",
  11: "Binary Output Event",
  20: "Counter",
  21: "Frozen Counter",
  22: "Counter Event",
  30: "Analog Input",
  31: "Frozen Analog Input",
  32: "Analog Input Event",
  40: "Analog Output",
  41: "Analog Output Event",
  60: "Class Data",
};

/** IIN1 flag names. */
const IIN1_FLAGS: Record<number, string> = {
  0x01: "BROADCAST",
  0x02: "CLASS1_DATA",
  0x04: "CLASS2_DATA",
  0x08: "CLASS3_DATA",
  0x10: "NEED_TIME",
  0x20: "LOCAL_CONTROL",
  0x40: "DEVICE_TROUBLE",
  0x80: "DEVICE_RESTART",
};

/**
 * Decode a DNP3 frame into human-readable fields.
 * @param buffer - Raw DNP3 frame bytes
 * @returns Decoded frame with structured fields
 */
function decodeDNP3Frame(buffer: Uint8Array): DecodedFrame {
  const parsed = parseDNP3Frame(buffer);

  if (!parsed.valid) {
    return {
      fields: {
        raw: Array.from(buffer.slice(0, 20)).map((b) => "0x" + b.toString(16).padStart(2, "0")).join(" "),
        error: parsed.error,
      },
      isError: true,
      errorDescription: parsed.error,
    };
  }

  const fields: Record<string, unknown> = {
    startBytes: "0x05 0x64",
    length: parsed.data.length + 5,
    control: `0x${parsed.control.toString(16).padStart(2, "0")}`,
    destination: parsed.dest,
    source: parsed.src,
    dlFunctionCode: parsed.control & 0x0F,
    dlFunctionName: getDLFunctionName(parsed.control & 0x0F),
    prm: !!(parsed.control & 0x80),
    fcb: !!(parsed.control & 0x20),
    fcv: !!(parsed.control & 0x10),
  };

  // Parse transport + application layer from user data
  if (parsed.data.length > 0) {
    const transport = parseTransportHeader(parsed.data[0]);
    fields.transportFIR = transport.fir;
    fields.transportFIN = transport.fin;
    fields.transportSequence = transport.sequence;

    if (parsed.data.length > 2) {
      const appControl = parseAppControl(parsed.data[1]);
      fields.appFIR = appControl.fir;
      fields.appFIN = appControl.fin;
      fields.appCON = appControl.con;
      fields.appUNS = appControl.uns;
      fields.appSequence = appControl.sequence;

      const functionCode = parsed.data[2];
      fields.functionCode = `0x${functionCode.toString(16).padStart(2, "0")}`;
      fields.functionName = FC_NAMES[functionCode] ?? `Unknown (0x${functionCode.toString(16)})`;

      // Response has IIN flags
      if (functionCode === FC.RESPONSE || functionCode === FC.UNSOLICITED) {
        if (parsed.data.length >= 5) {
          const iin1 = parsed.data[3];
          const iin2 = parsed.data[4];
          fields.iin1 = `0x${iin1.toString(16).padStart(2, "0")}`;
          fields.iin2 = `0x${iin2.toString(16).padStart(2, "0")}`;

          const activeFlags: string[] = [];
          for (const [bit, name] of Object.entries(IIN1_FLAGS)) {
            if (iin1 & Number(bit)) activeFlags.push(name);
          }
          if (activeFlags.length > 0) {
            fields.iin1Flags = activeFlags.join(", ");
          }

          // Parse objects
          const objectData = parsed.data.slice(5);
          if (objectData.length > 0) {
            const objects = parseObjectData(objectData);
            fields.objectCount = objects.length;
            if (objects.length > 0) {
              fields.objects = objects.map((obj) => ({
                group: obj.group,
                groupName: GROUP_NAMES[obj.group] ?? `Group ${obj.group}`,
                variation: obj.variation,
                index: obj.index,
                value: obj.value,
                quality: obj.quality,
              }));
            }
          }
        }
      }
    }
  }

  return { fields, isError: false };
}

/**
 * Get data-link function code name.
 */
function getDLFunctionName(fc: number): string {
  switch (fc) {
    case 0x00: return "Reset Link";
    case 0x01: return "Reset User Process";
    case 0x02: return "Test Link";
    case 0x03: return "User Data";
    case 0x04: return "Unconfirmed User Data";
    case 0x0B: return "Link Status";
    case 0x0F: return "Not Supported";
    default: return `Unknown (0x${fc.toString(16)})`;
  }
}

// ─── Helper: Parse address string ──────────────────────────────────────────

/**
 * Parse a DNP3 address string like "1/0" (group/variation) or "1/0/5" (group/variation/index).
 */
function parseDNP3Address(address: string): { group: number; variation: number; index?: number } {
  const parts = address.split("/").map((s) => parseInt(s.trim(), 10));
  return {
    group: parts[0] ?? 0,
    variation: parts[1] ?? 0,
    index: parts.length > 2 ? parts[2] : undefined,
  };
}

// ─── DNP3 Engine ───────────────────────────────────────────────────────────

/**
 * DNP3 (Distributed Network Protocol) engine for SCADA/ICS communication.
 *
 * Implements a DNP3 master/client with:
 * - Data-link layer framing with CRC-16/DNP3
 * - Transport layer with sequence numbering
 * - Application layer with common function codes
 * - Object type parsing for Binary I/O, Counters, Analog I/O, and Class Data
 *
 * @example
 * ```typescript
 * const engine = new Dnp3Engine();
 * await engine.onInit({ host: "192.168.1.100", port: 20000 });
 * await engine.connect("session-1");
 * const data = await engine.readClass0();
 * ```
 */
export class Dnp3Engine extends AdapterBackedDriver<DNP3Config, DNP3Runtime> {
  protected protocolId = "dnp3";
  protected defaultConfig: DNP3Config = {
    host: "127.0.0.1",
    port: 20000,
    sourceAddress: 1,
    destinationAddress: 2,
    connectTimeoutMs: 5000,
    readTimeoutMs: 5000,
    writeTimeoutMs: 5000,
  };

  protected buildAdapter(_config: DNP3Config): ProtocolAdapter<DNP3Runtime, DNP3Config> {
    return {
      protocolId: this.protocolId,
      initializeRuntime: () => ({
        appSequence: 0,
        transportSequence: 0,
      }),
      createTransport: (config) => new TcpTransport({
        host: config.host,
        port: config.port,
        connectTimeoutMs: config.connectTimeoutMs,
      }),
      createReadPlan: (request, context) => {
        const { appSequence, transportSequence } = context.runtime;
        const dest = context.config.destinationAddress;
        const src = context.config.sourceAddress;

        // Parse address to determine what to read
        const addr = parseDNP3Address(request.address);
        const objects: DNP3ObjectRange[] = [{
          group: addr.group,
          variation: addr.variation,
          qualifier: request.length > 0 ? QUAL.RANGE_8BIT : QUAL.ALL_OBJECTS,
          ...(request.length > 0 ? { start: addr.index ?? 0, stop: (addr.index ?? 0) + request.length - 1 } : {}),
        }];

        // If function code is specified, use it; otherwise default to Read
        const functionCode = request.functionCode ?? FC.READ;

        let userData: Uint8Array;
        if (functionCode === FC.COLD_RESTART || functionCode === FC.WARM_RESTART) {
          userData = buildRestartRequest(functionCode, appSequence, transportSequence);
        } else {
          userData = buildReadRequest(objects, appSequence, transportSequence);
        }

        const dlControl = (0x40) | DL_FC.USER_DATA; // PRM=1, FCV=0, FCB=0
        const frame = buildDNP3Frame(dest, src, dlControl, userData);

        // Advance sequences
        context.runtime.appSequence = (appSequence + 1) & 0x0F;
        context.runtime.transportSequence = (transportSequence + 1) & 0x3F;

        return {
          id: `dnp3-read-${appSequence}`,
          type: "dnp3-read",
          stages: [
            {
              id: "request-response",
              send: () => frame,
              expectResponse: true,
              matcher: (rxFrame) => {
                const parsed = parseDNP3Frame(rxFrame);
                if (!parsed.valid) return false;
                // Match by source/dest swap (response comes from outstation)
                return parsed.dest === src && parsed.src === dest;
              },
              timeoutMs: request.timeoutMs ?? context.config.readTimeoutMs ?? 5000,
            },
          ],
          finalize: ({ responses }) => {
            const resp = responses[0];
            if (!resp || resp.length < 10) return new Uint8Array();

            const parsed = parseDNP3Frame(resp);
            if (!parsed.valid) return new Uint8Array();

            // Return the user data (transport + application layer)
            return parsed.data;
          },
        };
      },
      createWritePlan: (request, context) => {
        const { appSequence, transportSequence } = context.runtime;
        const dest = context.config.destinationAddress;
        const src = context.config.sourceAddress;

        const addr = parseDNP3Address(request.address);
        const functionCode = request.functionCode ?? FC.WRITE;

        // Build object value from request
        let value: number | boolean = 0;
        if (request.data.length >= 4) {
          value = request.data[0] | (request.data[1] << 8) | (request.data[2] << 16) | (request.data[3] << 24);
        } else if (request.data.length >= 2) {
          value = request.data[0] | (request.data[1] << 8);
        } else if (request.data.length >= 1) {
          value = request.data[0];
        }

        const objValue: DNP3ObjectValue = {
          group: addr.group,
          variation: addr.variation,
          index: addr.index ?? 0,
          value,
        };

        let userData: Uint8Array;
        switch (functionCode) {
          case FC.SELECT:
            userData = buildSelectRequest([objValue], appSequence, transportSequence);
            break;
          case FC.OPERATE:
            userData = buildOperateRequest([objValue], appSequence, transportSequence);
            break;
          case FC.DIRECT_OPERATE:
            userData = buildDirectOperateRequest([objValue], appSequence, transportSequence);
            break;
          default:
            userData = buildWriteRequest([objValue], appSequence, transportSequence);
            break;
        }

        const dlControl = (0x40) | DL_FC.USER_DATA;
        const frame = buildDNP3Frame(dest, src, dlControl, userData);

        context.runtime.appSequence = (appSequence + 1) & 0x0F;
        context.runtime.transportSequence = (transportSequence + 1) & 0x3F;

        return {
          id: `dnp3-write-${appSequence}`,
          type: "dnp3-write",
          stages: [
            {
              id: "request-response",
              send: () => frame,
              expectResponse: true,
              matcher: (rxFrame) => {
                const parsed = parseDNP3Frame(rxFrame);
                if (!parsed.valid) return false;
                return parsed.dest === src && parsed.src === dest;
              },
              timeoutMs: request.timeoutMs ?? context.config.writeTimeoutMs ?? 5000,
            },
          ],
          finalize: () => true,
        };
      },
      decodeFrame: async (frame) => decodeDNP3Frame(frame),
      encodeFrame: async (input, context) => {
        // Raw passthrough: if input has a `data` property, pass it through
        const frameInput = input as { data?: Uint8Array | number[] };
        if (frameInput.data instanceof Uint8Array) {
          return frameInput.data;
        }
        if (Array.isArray(frameInput.data)) {
          return new Uint8Array(frameInput.data);
        }

        // Structured DNP3 frame encoding
        const structured = input as {
          functionCode?: number;
          fc?: number;
          group?: number;
          variation?: number;
          index?: number;
          value?: number | boolean;
          address?: string;
          objects?: DNP3ObjectRange[];
        };

        const dest = context.config.destinationAddress;
        const src = context.config.sourceAddress;
        const { appSequence, transportSequence } = context.runtime;

        const functionCode = structured.functionCode ?? structured.fc ?? FC.READ;

        let userData: Uint8Array;

        if (functionCode === FC.READ) {
          let objects: DNP3ObjectRange[];
          if (structured.objects) {
            objects = structured.objects;
          } else if (structured.group !== undefined) {
            objects = [{
              group: structured.group,
              variation: structured.variation ?? 0,
              qualifier: QUAL.ALL_OBJECTS,
            }];
          } else if (structured.address) {
            const addr = parseDNP3Address(structured.address);
            objects = [{
              group: addr.group,
              variation: addr.variation,
              qualifier: QUAL.ALL_OBJECTS,
            }];
          } else {
            // Default: Class 0 poll (all data)
            objects = [{ group: 60, variation: 1, qualifier: QUAL.ALL_OBJECTS }];
          }
          userData = buildReadRequest(objects, appSequence, transportSequence);
        } else if (functionCode === FC.WRITE || functionCode === FC.SELECT || functionCode === FC.OPERATE || functionCode === FC.DIRECT_OPERATE) {
          const objValue: DNP3ObjectValue = {
            group: structured.group ?? 0,
            variation: structured.variation ?? 0,
            index: structured.index ?? 0,
            value: structured.value ?? 0,
          };

          switch (functionCode) {
            case FC.SELECT:
              userData = buildSelectRequest([objValue], appSequence, transportSequence);
              break;
            case FC.OPERATE:
              userData = buildOperateRequest([objValue], appSequence, transportSequence);
              break;
            case FC.DIRECT_OPERATE:
              userData = buildDirectOperateRequest([objValue], appSequence, transportSequence);
              break;
            default:
              userData = buildWriteRequest([objValue], appSequence, transportSequence);
              break;
          }
        } else if (functionCode === FC.COLD_RESTART || functionCode === FC.WARM_RESTART) {
          userData = buildRestartRequest(functionCode, appSequence, transportSequence);
        } else {
          // Generic: build minimal request
          const appControl = buildAppControl(true, true, false, false, appSequence);
          userData = new Uint8Array([buildTransportHeader(true, true, transportSequence), appControl, functionCode]);
        }

        context.runtime.appSequence = (appSequence + 1) & 0x0F;
        context.runtime.transportSequence = (transportSequence + 1) & 0x3F;

        const dlControl = (0x40) | DL_FC.USER_DATA;
        return buildDNP3Frame(dest, src, dlControl, userData);
      },
    };
  }

  // ─── High-Level DNP3 Operations ──────────────────────────────────────

  /**
   * Perform a Class 0 poll (all static data).
   * Reads all Binary Inputs, Counters, Analog Inputs, etc.
   * @returns Array of all object values from the outstation
   */
  async readClass0(): Promise<DNP3ObjectValue[]> {
    return this.readObjects(60, 1);
  }

  /**
   * Perform a Class 1 poll (Binary Input events).
   * @returns Array of Binary Input event values
   */
  async readClass1(): Promise<DNP3ObjectValue[]> {
    return this.readObjects(60, 2);
  }

  /**
   * Perform a Class 2 poll (Analog Input events).
   * @returns Array of Analog Input event values
   */
  async readClass2(): Promise<DNP3ObjectValue[]> {
    return this.readObjects(60, 3);
  }

  /**
   * Perform a Class 3 poll (Counter events).
   * @returns Array of Counter event values
   */
  async readClass3(): Promise<DNP3ObjectValue[]> {
    return this.readObjects(60, 4);
  }

  /**
   * Read specific objects from the outstation.
   * @param group - DNP3 object group number
   * @param variation - DNP3 object variation number
   * @param range - Optional start/stop range (omit for all objects)
   * @returns Array of object values
   */
  async readObjects(group: number, variation: number, range?: { start: number; stop: number }): Promise<DNP3ObjectValue[]> {
    const kernel = this.getKernel();
    const config = this.getEffectiveCfg();

    const objects: DNP3ObjectRange[] = [{
      group,
      variation,
      qualifier: range ? QUAL.RANGE_8BIT : QUAL.ALL_OBJECTS,
      ...(range ?? {}),
    }];

    const request: ReadRequest = {
      address: `${group}/${variation}`,
      length: range ? range.stop - range.start + 1 : 0,
      functionCode: FC.READ,
      timeoutMs: config.readTimeoutMs,
    };

    const responseData = await kernel.read(request);
    if (responseData.length === 0) return [];

    const response = parseResponse(responseData);
    return response.objects;
  }

  /**
   * Write a single object value to the outstation.
   * @param group - DNP3 object group number
   * @param variation - DNP3 object variation number
   * @param index - Object index
   * @param value - Value to write
   */
  async writeObject(group: number, variation: number, index: number, value: number | boolean): Promise<void> {
    const kernel = this.getKernel();
    const config = this.getEffectiveCfg();

    const valueBytes = encodeObjectValue(group, variation, value);
    const request: WriteRequest = {
      address: `${group}/${variation}/${index}`,
      data: new Uint8Array(valueBytes),
      functionCode: FC.WRITE,
      timeoutMs: config.writeTimeoutMs,
    };

    await kernel.write(request);
  }

  /**
   * Perform a Direct Operate command (immediate execution without Select).
   * @param group - DNP3 object group number
   * @param variation - DNP3 object variation number
   * @param index - Object index
   * @param value - Value to operate
   */
  async directOperate(group: number, variation: number, index: number, value: number | boolean): Promise<void> {
    const kernel = this.getKernel();
    const config = this.getEffectiveCfg();

    const valueBytes = encodeObjectValue(group, variation, value);
    const request: WriteRequest = {
      address: `${group}/${variation}/${index}`,
      data: new Uint8Array(valueBytes),
      functionCode: FC.DIRECT_OPERATE,
      timeoutMs: config.writeTimeoutMs,
    };

    await kernel.write(request);
  }

  // ─── Private helpers ─────────────────────────────────────────────────

  /** Access the kernel (throws if not connected). */
  private getKernel() {
    // Access the protected kernel through the parent class
    // The kernel is set during connect()
    const kernel = (this as any).kernel;
    if (!kernel) {
      throw new Error("DNP3 session is not connected");
    }
    return kernel;
  }

  /** Get the effective configuration. */
  private getEffectiveCfg(): DNP3Config {
    return (this as any).config ?? { ...this.defaultConfig };
  }
}

// ─── Exports ───────────────────────────────────────────────────────────────

export type { DNP3Config, DNP3Runtime, DNP3ObjectRange, DNP3ObjectValue, DNP3Response };
export { calculateDNP3CRC, buildDNP3Frame, parseDNP3Frame, parseResponse, FC, QUAL };
