/**
 * Protocol decoders and traffic helpers extracted from TrafficMonitor.
 * Used for structured decoding of Modbus TCP/RTU and raw frames.
 */

export type StructuredField = {
  label: string;
  value: string;
  offset: number;
};

export type TrafficEvent = {
  id: string;
  direction: "tx" | "rx";
  timestamp: number;
  rawBytes: Uint8Array;
  length: number;
  isError: boolean;
  protocolId?: string;
  parsedFields?: Record<string, unknown>;
};

/* ── Modbus function code names ────────────────────────────────── */

export const MODBUS_FC_NAMES: Record<number, string> = {
  0x01: "Read Coils",
  0x02: "Read Discrete Inputs",
  0x03: "Read Holding Registers",
  0x04: "Read Input Registers",
  0x05: "Write Single Coil",
  0x06: "Write Single Register",
  0x0f: "Write Multiple Coils",
  0x10: "Write Multiple Registers"
};

/* ── Byte format helpers ───────────────────────────────────────── */

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((v) => v.toString(16).padStart(2, "0")).join(" ");
}

export function toBin(bytes: Uint8Array): string {
  return Array.from(bytes).map((v) => v.toString(2).padStart(8, "0")).join(" ");
}

export function toAscii(bytes: Uint8Array): string {
  return Array.from(bytes).map((v) => (v >= 32 && v <= 126 ? String.fromCharCode(v) : ".")).join("");
}

/* ── Checksum algorithms ───────────────────────────────────────── */

/**
 * Compute CRC-16/Modbus (polynomial 0xA001, init 0xFFFF).
 */
export function crc16Modbus(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc;
}

/**
 * Compute LRC (Longitudinal Redundancy Check) — sum of bytes mod 256, two's complement.
 */
export function lrc(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum = (sum + data[i]) & 0xff;
  }
  return (~sum + 1) & 0xff;
}

/* ── Protocol decoders ─────────────────────────────────────────── */

/**
 * Attempt to decode a Modbus TCP frame (MBAP header + PDU).
 * Returns structured fields or null if not a valid Modbus TCP frame.
 */
export function decodeModbusTcp(bytes: Uint8Array): StructuredField[] | null {
  if (bytes.length < 9) return null;

  const transactionId = (bytes[0] << 8) | bytes[1];
  const protocolId = (bytes[2] << 8) | bytes[3];
  const length = (bytes[4] << 8) | bytes[5];
  const unitId = bytes[6];
  const functionCode = bytes[7];

  if (protocolId !== 0x0000) return null;
  if (length !== bytes.length - 6) return null;

  const fields: StructuredField[] = [
    { label: "Transaction ID", value: `0x${transactionId.toString(16).padStart(4, "0")}`, offset: 0 },
    { label: "Protocol ID", value: `0x${protocolId.toString(16).padStart(4, "0")} (Modbus)`, offset: 2 },
    { label: "Length", value: `${length} bytes`, offset: 4 },
    { label: "Unit ID", value: `${unitId}`, offset: 6 },
    { label: "Function Code", value: `0x${functionCode.toString(16).padStart(2, "0")} (${MODBUS_FC_NAMES[functionCode] ?? "Unknown"})`, offset: 7 }
  ];

  const isException = functionCode >= 0x80;
  if (isException) {
    const excCode = bytes.length > 8 ? bytes[8] : 0;
    fields.push({ label: "Exception Code", value: `${excCode}`, offset: 8 });
    return fields;
  }

  if (functionCode <= 0x04 && bytes.length > 9) {
    const byteCount = bytes[8];
    fields.push({ label: "Byte Count", value: `${byteCount}`, offset: 8 });
    if (functionCode <= 0x02) {
      const bitData = bytes.slice(9, 9 + byteCount);
      fields.push({ label: "Bit Data", value: toHex(bitData), offset: 9 });
    } else {
      const regData = bytes.slice(9, 9 + byteCount);
      const registers: number[] = [];
      for (let i = 0; i + 1 < regData.length; i += 2) {
        registers.push((regData[i] << 8) | regData[i + 1]);
      }
      fields.push({ label: "Registers", value: `[${registers.join(", ")}]`, offset: 9 });
    }
  } else if ((functionCode === 0x05 || functionCode === 0x06) && bytes.length >= 12) {
    const address = (bytes[8] << 8) | bytes[9];
    const value = (bytes[10] << 8) | bytes[11];
    fields.push({ label: "Address", value: `${address}`, offset: 8 });
    fields.push({ label: "Value", value: `0x${value.toString(16).padStart(4, "0")} (${value})`, offset: 10 });
  } else if ((functionCode === 0x0f || functionCode === 0x10) && bytes.length >= 12) {
    const address = (bytes[8] << 8) | bytes[9];
    const quantity = (bytes[10] << 8) | bytes[11];
    fields.push({ label: "Address", value: `${address}`, offset: 8 });
    fields.push({ label: "Quantity", value: `${quantity}`, offset: 10 });
    if (bytes.length > 12) {
      const byteCount = bytes[12];
      fields.push({ label: "Byte Count", value: `${byteCount}`, offset: 12 });
      if (bytes.length > 13) {
        const data = bytes.slice(13, 13 + byteCount);
        fields.push({ label: "Data", value: toHex(data), offset: 13 });
      }
    }
  }

  return fields;
}

/**
 * Attempt to decode a Modbus RTU frame (Unit ID + PDU + CRC16).
 */
export function decodeModbusRtu(bytes: Uint8Array): StructuredField[] | null {
  if (bytes.length < 4) return null;

  const unitId = bytes[0];
  const functionCode = bytes[1];

  const frameCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
  const computedCrc = crc16Modbus(bytes.slice(0, bytes.length - 2));
  const crcValid = frameCrc === computedCrc;

  const fields: StructuredField[] = [
    { label: "Unit ID", value: `${unitId}`, offset: 0 },
    { label: "Function Code", value: `0x${functionCode.toString(16).padStart(2, "0")} (${MODBUS_FC_NAMES[functionCode] ?? "Unknown"})`, offset: 1 },
    { label: "CRC-16", value: `0x${frameCrc.toString(16).padStart(4, "0")} ${crcValid ? "Valid" : "Invalid"}`, offset: bytes.length - 2 }
  ];

  const isException = functionCode >= 0x80;
  if (isException) {
    const excCode = bytes.length > 2 ? bytes[2] : 0;
    fields.push({ label: "Exception Code", value: `${excCode}`, offset: 2 });
    return fields;
  }

  if (functionCode <= 0x04 && bytes.length > 3) {
    const byteCount = bytes[2];
    fields.push({ label: "Byte Count", value: `${byteCount}`, offset: 2 });
    if (functionCode <= 0x02) {
      const bitData = bytes.slice(3, 3 + byteCount);
      fields.push({ label: "Bit Data", value: toHex(bitData), offset: 3 });
    } else {
      const regData = bytes.slice(3, 3 + byteCount);
      const registers: number[] = [];
      for (let i = 0; i + 1 < regData.length; i += 2) {
        registers.push((regData[i] << 8) | regData[i + 1]);
      }
      fields.push({ label: "Registers", value: `[${registers.join(", ")}]`, offset: 3 });
    }
  } else if ((functionCode === 0x05 || functionCode === 0x06) && bytes.length >= 8) {
    const address = (bytes[2] << 8) | bytes[3];
    const value = (bytes[4] << 8) | bytes[5];
    fields.push({ label: "Address", value: `${address}`, offset: 2 });
    fields.push({ label: "Value", value: `0x${value.toString(16).padStart(4, "0")} (${value})`, offset: 4 });
  } else if ((functionCode === 0x0f || functionCode === 0x10) && bytes.length >= 9) {
    const address = (bytes[2] << 8) | bytes[3];
    const quantity = (bytes[4] << 8) | bytes[5];
    const byteCount = bytes[6];
    fields.push({ label: "Address", value: `${address}`, offset: 2 });
    fields.push({ label: "Quantity", value: `${quantity}`, offset: 4 });
    fields.push({ label: "Byte Count", value: `${byteCount}`, offset: 6 });
    if (bytes.length > 7) {
      const data = bytes.slice(7, 7 + byteCount);
      fields.push({ label: "Data", value: toHex(data), offset: 7 });
    }
  }

  return fields;
}

/**
 * Decode raw frame with CRC/LRC annotations.
 */
export function decodeRawWithChecksum(bytes: Uint8Array): StructuredField[] {
  const fields: StructuredField[] = [];

  if (bytes.length === 0) {
    fields.push({ label: "Info", value: "Empty frame", offset: 0 });
    return fields;
  }

  fields.push({ label: "Length", value: `${bytes.length} bytes`, offset: 0 });
  fields.push({ label: "Hex", value: toHex(bytes), offset: 0 });

  if (bytes.length >= 3) {
    const frameCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
    const computedCrc = crc16Modbus(bytes.slice(0, bytes.length - 2));
    fields.push({
      label: "CRC-16 (Modbus)",
      value: `Frame: 0x${frameCrc.toString(16).padStart(4, "0")} | Computed: 0x${computedCrc.toString(16).padStart(4, "0")} ${frameCrc === computedCrc ? "Match" : "Mismatch"}`,
      offset: bytes.length - 2
    });
  }

  if (bytes.length >= 2) {
    const frameLrc = bytes[bytes.length - 1];
    const computedLrc = lrc(bytes.slice(0, bytes.length - 1));
    fields.push({
      label: "LRC",
      value: `Frame: 0x${frameLrc.toString(16).padStart(2, "0")} | Computed: 0x${computedLrc.toString(16).padStart(2, "0")} ${frameLrc === computedLrc ? "Match" : "Mismatch"}`,
      offset: bytes.length - 1
    });
  }

  return fields;
}

/**
 * Main structured decoder: tries Modbus TCP, Modbus RTU, then raw with checksums.
 */
export function decodeStructured(item: TrafficEvent): StructuredField[] {
  const bytes = item.rawBytes;
  const protocolId = item.protocolId?.toLowerCase() ?? "";

  if (item.parsedFields && Object.keys(item.parsedFields).length > 0) {
    const fields: StructuredField[] = [];
    let offset = 0;
    for (const [key, val] of Object.entries(item.parsedFields)) {
      const displayVal = typeof val === "object" ? JSON.stringify(val) : String(val);
      fields.push({ label: key, value: displayVal, offset });
      offset++;
    }
    fields.push({ label: "Raw Hex", value: toHex(bytes), offset: 0 });
    return fields;
  }

  if (protocolId.includes("modbus-tcp")) {
    const result = decodeModbusTcp(bytes);
    if (result) return result;
  }

  if (protocolId.includes("modbus-rtu")) {
    const result = decodeModbusRtu(bytes);
    if (result) return result;
  }

  if (bytes.length >= 9) {
    const protoId = (bytes[2] << 8) | bytes[3];
    if (protoId === 0x0000) {
      const result = decodeModbusTcp(bytes);
      if (result) return result;
    }
  }

  if (bytes.length >= 4) {
    const frameCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
    const computedCrc = crc16Modbus(bytes.slice(0, bytes.length - 2));
    if (frameCrc === computedCrc) {
      const result = decodeModbusRtu(bytes);
      if (result) return result;
    }
  }

  return decodeRawWithChecksum(bytes);
}

/**
 * Check if a traffic event matches a search query.
 */
export function matchesSearch(item: TrafficEvent, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (toHex(item.rawBytes).toLowerCase().includes(q)) return true;
  if (item.direction.toLowerCase().includes(q)) return true;
  if (item.parsedFields) {
    for (const val of Object.values(item.parsedFields)) {
      if (String(val).toLowerCase().includes(q)) return true;
    }
  }
  return false;
}
