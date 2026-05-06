// ─── IEC 60870-5-104 Capabilities ────────────────────────────────────
// APDU frame building/parsing, ASDU encoding/decoding, CP56Time2a handling.

// ─── Constants ───────────────────────────────────────────────────────

/** APDU start byte */
export const IEC104_START_BYTE = 0x68;

/** Maximum APDU length (excluding start + length byte) */
export const IEC104_MAX_APDU_LENGTH = 253;

/** Default IEC 104 TCP port */
export const IEC104_DEFAULT_PORT = 2404;

// ─── U-format function codes (byte 2 of control field) ──────────────

/** U-format function codes encoded in bits 1-6 of control byte 2 */
export const U_FORMAT = {
  STARTDT_ACT: 0x07,
  STARTDT_CON: 0x0b,
  STOPDT_ACT: 0x13,
  STOPDT_CON: 0x23,
  TESTFR_ACT: 0x43,
  TESTFR_CON: 0x83
} as const;

// ─── Control frame presets (legacy compatibility) ────────────────────

const IEC104_CONTROL_FRAMES: Record<string, Uint8Array> = {
  "startdt-act": new Uint8Array([0x68, 0x04, 0x07, 0x00, 0x00, 0x00]),
  "stopdt-act": new Uint8Array([0x68, 0x04, 0x13, 0x00, 0x00, 0x00]),
  "testfr-act": new Uint8Array([0x68, 0x04, 0x43, 0x00, 0x00, 0x00])
};

/** Legacy control action type for backward compatibility. */
export type Iec104ControlAction = keyof typeof IEC104_CONTROL_FRAMES;

/**
 * Build a legacy U-format control frame by action name.
 * @param action - One of "startdt-act", "stopdt-act", "testfr-act"
 */
export function buildIec104ControlFrame(action: Iec104ControlAction): Uint8Array {
  return IEC104_CONTROL_FRAMES[action];
}

/**
 * Get the expected confirmation byte for a given control action.
 * @param action - The control action
 * @returns The confirmation control byte value
 */
export function getIec104ControlAckByte(action: Iec104ControlAction): number {
  switch (action) {
    case "startdt-act": return U_FORMAT.STARTDT_CON;
    case "stopdt-act": return U_FORMAT.STOPDT_CON;
    case "testfr-act": return U_FORMAT.TESTFR_CON;
    default: return 0;
  }
}

// ─── Type Identification (TI) constants ──────────────────────────────

/** IEC 104 Type Identification values */
export const TI = {
  /** Single-point information */
  M_SP_NA_1: 1,
  /** Double-point information */
  M_DP_NA_1: 3,
  /** Measured value, normalized */
  M_ME_NA_1: 5,
  /** Measured value, scaled */
  M_ME_NB_1: 7,
  /** Measured value, short floating point */
  M_ME_NC_1: 9,
  /** Integrated totals */
  M_IT_NA_1: 11,
  /** Measured value, short floating point with time tag */
  M_ME_TD_1: 13,
  /** Single-point information with time tag */
  M_SP_TB_1: 30,
  /** Double-point information with time tag */
  M_DP_TB_1: 31,
  /** Measured value, short floating point with time tag */
  M_ME_TF_1: 36,
  /** Single command */
  C_SC_NA_1: 45,
  /** Double command */
  C_DC_NA_1: 46,
  /** Regulating step command */
  C_RC_NA_1: 47,
  /** Set-point command, normalized */
  C_SE_NA_1: 48,
  /** Set-point command, scaled */
  C_SE_NB_1: 49,
  /** Set-point command, short floating point */
  C_SE_NC_1: 50,
  /** General interrogation */
  C_IC_NA_1: 100,
  /** Counter interrogation */
  C_CI_NA_1: 101,
  /** Clock synchronization */
  C_CS_NA_1: 103
} as const;

// ─── Cause of Transmission (COT) constants ───────────────────────────

/** IEC 104 Cause of Transmission values */
export const COT = {
  PERIODIC: 1,
  BACKGROUND: 2,
  SPONTANEOUS: 3,
  INITIALIZED: 4,
  REQUEST: 5,
  ACTIVATION: 6,
  ACTIVATION_CONFIRMATION: 7,
  ACTIVATION_TERMINATION: 8,
  RETURN_INFO_REMOTE: 9,
  RETURN_INFO_LOCAL: 10,
  INTERROGATED_BY_STATION: 13,
  INTERROGATED_BY_GENERAL: 20
} as const;

/** Human-readable COT names */
export const COT_NAMES: Record<number, string> = {
  [COT.PERIODIC]: "periodic",
  [COT.BACKGROUND]: "background",
  [COT.SPONTANEOUS]: "spontaneous",
  [COT.INITIALIZED]: "initialized",
  [COT.REQUEST]: "request",
  [COT.ACTIVATION]: "activation",
  [COT.ACTIVATION_CONFIRMATION]: "activation confirmation",
  [COT.ACTIVATION_TERMINATION]: "activation termination",
  [COT.RETURN_INFO_REMOTE]: "return info (remote cmd)",
  [COT.RETURN_INFO_LOCAL]: "return info (local cmd)",
  [COT.INTERROGATED_BY_STATION]: "interrogated by station",
  [COT.INTERROGATED_BY_GENERAL]: "interrogated by GI"
};

/** Human-readable TI names */
export const TI_NAMES: Record<number, string> = {
  [TI.M_SP_NA_1]: "M_SP_NA_1 (single-point)",
  [TI.M_DP_NA_1]: "M_DP_NA_1 (double-point)",
  [TI.M_ME_NA_1]: "M_ME_NA_1 (meas normalized)",
  [TI.M_ME_NB_1]: "M_ME_NB_1 (meas scaled)",
  [TI.M_ME_NC_1]: "M_ME_NC_1 (meas short float)",
  [TI.M_IT_NA_1]: "M_IT_NA_1 (integrated totals)",
  [TI.M_ME_TD_1]: "M_ME_TD_1 (meas short float +time)",
  [TI.M_SP_TB_1]: "M_SP_TB_1 (single-point +time)",
  [TI.M_DP_TB_1]: "M_DP_TB_1 (double-point +time)",
  [TI.M_ME_TF_1]: "M_ME_TF_1 (meas short float +time)",
  [TI.C_SC_NA_1]: "C_SC_NA_1 (single cmd)",
  [TI.C_DC_NA_1]: "C_DC_NA_1 (double cmd)",
  [TI.C_RC_NA_1]: "C_RC_NA_1 (step cmd)",
  [TI.C_SE_NA_1]: "C_SE_NA_1 (setpoint norm)",
  [TI.C_SE_NB_1]: "C_SE_NB_1 (setpoint scaled)",
  [TI.C_SE_NC_1]: "C_SE_NC_1 (setpoint float)",
  [TI.C_IC_NA_1]: "C_IC_NA_1 (general interrogation)",
  [TI.C_CI_NA_1]: "C_CI_NA_1 (counter interrogation)",
  [TI.C_CS_NA_1]: "C_CS_NA_1 (clock sync)"
};

// ─── Type Definitions ────────────────────────────────────────────────

/** APDU frame type */
export type ApduType = "I" | "S" | "U";

/** Parsed APDU header */
export interface ParsedAPDU {
  type: ApduType;
  /** Raw control field bytes (4 bytes) */
  controlField: Uint8Array;
  /** ASDU payload (I-format only) */
  asdu?: Uint8Array;
  /** Tx sequence number (I-format) */
  tx?: number;
  /** Rx sequence number (I-format, S-format) */
  rx?: number;
  /** U-format function code */
  uFunction?: number;
}

/** Information Object for ASDU building/parsing */
export interface InfoObject {
  /** Information Object Address (3 bytes, 0-16777215) */
  ioa: number;
  /** Object value — type depends on TI */
  value: unknown;
  /** Quality descriptor flags (optional) */
  quality?: number;
  /** Time tag for time-tagged types (optional) */
  timestamp?: Date;
}

/** Parsed ASDU */
export interface Iec104ASDU {
  /** Type Identification */
  ti: number;
  /** Type Identification name */
  tiName: string;
  /** Variable Structure Qualifier: SQ flag */
  sq: boolean;
  /** Variable Structure Qualifier: number of objects */
  numObjects: number;
  /** Cause of Transmission */
  cot: number;
  /** Cause of Transmission name */
  cotName: string;
  /** P/N flag (positive/negative) */
  pn: boolean;
  /** Test flag */
  test: boolean;
  /** Originator address */
  originator: number;
  /** Common address of ASDU */
  commonAddress: number;
  /** Parsed information objects */
  objects: InfoObject[];
}

/** Parsed data point from IEC 104 */
export interface Iec104DataPoint {
  /** Information Object Address */
  ioa: number;
  /** Type Identification */
  ti: number;
  /** Type name */
  tiName: string;
  /** Value (type depends on TI) */
  value: unknown;
  /** Quality descriptor */
  quality?: number;
  /** Timestamp (if time-tagged) */
  timestamp?: Date;
  /** Cause of Transmission */
  cot: number;
  /** COT name */
  cotName: string;
  /** Common Address */
  commonAddress: number;
}

// ─── CP56Time2a (7-byte time tag) ────────────────────────────────────

/**
 * Parse a CP56Time2a 7-byte time tag from a buffer.
 * Layout: ms(2 LE) + min(1) + hour(1) + day(1) + month(1) + year(1)
 * @param buffer - Source buffer
 * @param offset - Start offset in buffer
 * @returns Parsed Date object
 */
export function parseCP56Time2a(buffer: Uint8Array, offset: number): Date {
  const ms = (buffer[offset] | (buffer[offset + 1] << 8)) & 0x07ff;
  const min = buffer[offset + 2] & 0x3f;
  const hour = buffer[offset + 3] & 0x1f;
  const day = buffer[offset + 4] & 0x1f;
  const month = (buffer[offset + 5] & 0x0f) - 1; // JS months are 0-based
  const year = buffer[offset + 6] & 0x7f;
  return new Date(2000 + year, month, day, hour, min, Math.floor(ms / 1000), ms % 1000);
}

/**
 * Build a CP56Time2a 7-byte time tag from a Date.
 * @param date - Date to encode
 * @returns 7-byte Uint8Array
 */
export function buildCP56Time2a(date: Date): Uint8Array {
  const buf = new Uint8Array(7);
  const ms = date.getSeconds() * 1000 + date.getMilliseconds();
  buf[0] = ms & 0xff;
  buf[1] = (ms >> 8) & 0x07;
  buf[2] = date.getMinutes() & 0x3f;
  buf[3] = date.getHours() & 0x1f;
  buf[4] = date.getDate() & 0x1f;
  buf[5] = (date.getMonth() + 1) & 0x0f;
  buf[6] = (date.getFullYear() - 2000) & 0x7f;
  return buf;
}

// ─── APDU Frame Building ─────────────────────────────────────────────

/**
 * Build a complete APDU frame (start byte + length + control field + optional ASDU).
 * @param controlField - 4-byte control field
 * @param asdu - Optional ASDU payload (I-format only)
 * @returns Complete APDU frame
 */
export function buildAPDU(controlField: Uint8Array, asdu?: Uint8Array): Uint8Array {
  const asduLen = asdu?.length ?? 0;
  const apduLen = 4 + asduLen; // control field + ASDU
  const frame = new Uint8Array(2 + apduLen);
  frame[0] = IEC104_START_BYTE;
  frame[1] = apduLen;
  frame.set(controlField, 2);
  if (asdu) {
    frame.set(asdu, 6);
  }
  return frame;
}

/**
 * Build a U-format control frame.
 * @param functionCode - U-format function code (e.g. U_FORMAT.STARTDT_ACT)
 * @returns Complete APDU frame
 */
export function buildUFrame(functionCode: number): Uint8Array {
  const cf = new Uint8Array(4);
  cf[0] = 0x03; // bits 0,1 = 1 (U-format marker)
  cf[1] = functionCode;
  cf[2] = 0x00;
  cf[3] = 0x00;
  return buildAPDU(cf);
}

/**
 * Build an S-format frame (supervisory).
 * @param rx - Receive sequence number to acknowledge
 * @returns Complete APDU frame
 */
export function buildSFrame(rx: number): Uint8Array {
  const cf = new Uint8Array(4);
  cf[0] = 0x01; // bit 0 = 1 (S-format marker)
  cf[1] = 0x00;
  cf[2] = rx & 0x7f;
  cf[3] = (rx >> 7) & 0xff;
  return buildAPDU(cf);
}

/**
 * Build an I-format frame (information transfer).
 * @param tx - Send sequence number
 * @param rx - Receive sequence number
 * @param asdu - ASDU payload
 * @returns Complete APDU frame
 */
export function buildIFrame(tx: number, rx: number, asdu: Uint8Array): Uint8Array {
  const cf = new Uint8Array(4);
  // Tx in bits 1-15 of bytes 0-1 (bit 0 = 0 for I-format)
  cf[0] = (tx << 1) & 0xfe;
  cf[1] = (tx >> 7) & 0xff;
  // Rx in bits 1-15 of bytes 2-3 (bit 0 = 0)
  cf[2] = (rx << 1) & 0xfe;
  cf[3] = (rx >> 7) & 0xff;
  return buildAPDU(cf, asdu);
}

// ─── APDU Frame Parsing ──────────────────────────────────────────────

/**
 * Parse an APDU frame into its components.
 * @param buffer - Raw APDU bytes
 * @returns Parsed APDU structure
 */
export function parseAPDU(buffer: Uint8Array): ParsedAPDU {
  if (buffer.length < 2 || buffer[0] !== IEC104_START_BYTE) {
    throw new Error("Invalid IEC 104 APDU: missing start byte 0x68");
  }
  const apduLen = buffer[1];
  if (buffer.length < 2 + apduLen) {
    throw new Error(`Invalid IEC 104 APDU: expected ${2 + apduLen} bytes, got ${buffer.length}`);
  }
  if (apduLen < 4) {
    throw new Error(`Invalid IEC 104 APDU: length ${apduLen} < 4 (minimum control field)`);
  }

  const cf0 = buffer[2];
  const cf1 = buffer[3];
  const cf2 = buffer[4];
  const cf3 = buffer[5];
  const controlField = buffer.slice(2, 6);

  // I-format: bit 0 of cf0 = 0
  if ((cf0 & 0x01) === 0) {
    const tx = ((cf0 >> 1) & 0x7f) | ((cf1 & 0xff) << 7);
    const rx = ((cf2 >> 1) & 0x7f) | ((cf3 & 0xff) << 7);
    const asdu = apduLen > 4 ? buffer.slice(6, 2 + apduLen) : undefined;
    return { type: "I", controlField, tx, rx, asdu };
  }

  // S-format: bit 0 of cf0 = 1, bit 1 = 0
  if ((cf0 & 0x03) === 0x01) {
    const rx = ((cf2 >> 1) & 0x7f) | ((cf3 & 0xff) << 7);
    return { type: "S", controlField, rx };
  }

  // U-format: bits 0,1 of cf0 = 1,1
  if ((cf0 & 0x03) === 0x03) {
    return { type: "U", controlField, uFunction: cf1 };
  }

  throw new Error("Invalid IEC 104 control field format");
}

// ─── ASDU Building ───────────────────────────────────────────────────

/**
 * Build an ASDU (Application Service Data Unit).
 * @param ti - Type Identification
 * @param cot - Cause of Transmission
 * @param ca - Common Address
 * @param objects - Information objects to encode
 * @param originator - Originator address (default 0)
 * @returns ASDU bytes
 */
export function buildASDU(
  ti: number,
  cot: number,
  ca: number,
  objects: InfoObject[],
  originator: number = 0
): Uint8Array {
  const parts: Uint8Array[] = [];

  // TI (1 byte)
  const tiBuf = new Uint8Array(1);
  tiBuf[0] = ti;
  parts.push(tiBuf);

  // VSQ (1 byte): SQ=0, number of objects
  const vsqBuf = new Uint8Array(1);
  vsqBuf[0] = objects.length & 0x7f; // SQ=0 for individual objects
  parts.push(vsqBuf);

  // COT (2 bytes): COT + P/N + T + originator
  const cotBuf = new Uint8Array(2);
  cotBuf[0] = cot & 0x3f;
  cotBuf[1] = originator & 0xff;
  parts.push(cotBuf);

  // Common Address (2 bytes, little-endian)
  const caBuf = new Uint8Array(2);
  caBuf[0] = ca & 0xff;
  caBuf[1] = (ca >> 8) & 0xff;
  parts.push(caBuf);

  // Information Objects
  for (const obj of objects) {
    parts.push(encodeInfoObject(ti, obj));
  }

  // Concatenate all parts
  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Encode a single information object based on TI type.
 * @param ti - Type Identification
 * @param obj - Information object
 * @returns Encoded bytes (IOA + data)
 */
function encodeInfoObject(ti: number, obj: InfoObject): Uint8Array {
  const ioaBytes = encodeIOA(obj.ioa);
  let dataBytes: Uint8Array;

  switch (ti) {
    case TI.M_SP_NA_1: // Single-point: 1 byte (SIQ)
      dataBytes = new Uint8Array(1);
      dataBytes[0] = (obj.value ? 0x01 : 0x00) | (obj.quality ?? 0);
      break;

    case TI.M_DP_NA_1: // Double-point: 1 byte (DIQ)
      dataBytes = new Uint8Array(1);
      dataBytes[0] = ((obj.value as number) & 0x03) | (obj.quality ?? 0);
      break;

    case TI.M_ME_NA_1: // Measured normalized: 2 bytes (NVA) + 1 byte (QDS)
      dataBytes = new Uint8Array(3);
      const nva = Math.round((obj.value as number) * 32767);
      dataBytes[0] = nva & 0xff;
      dataBytes[1] = (nva >> 8) & 0xff;
      dataBytes[2] = obj.quality ?? 0;
      break;

    case TI.M_ME_NB_1: // Measured scaled: 2 bytes (SVA) + 1 byte (QDS)
      dataBytes = new Uint8Array(3);
      const sva = Math.round(obj.value as number);
      dataBytes[0] = sva & 0xff;
      dataBytes[1] = (sva >> 8) & 0xff;
      dataBytes[2] = obj.quality ?? 0;
      break;

    case TI.M_ME_NC_1: // Measured short float: 4 bytes (IEEE 754) + 1 byte (QDS)
      dataBytes = new Uint8Array(5);
      const f32buf = new ArrayBuffer(4);
      new DataView(f32buf).setFloat32(0, obj.value as number, true);
      dataBytes.set(new Uint8Array(f32buf), 0);
      dataBytes[4] = obj.quality ?? 0;
      break;

    case TI.M_IT_NA_1: // Integrated totals: 4 bytes (BCD or binary) + 1 byte (QCI)
      dataBytes = new Uint8Array(5);
      const itVal = obj.value as number;
      dataBytes[0] = itVal & 0xff;
      dataBytes[1] = (itVal >> 8) & 0xff;
      dataBytes[2] = (itVal >> 16) & 0xff;
      dataBytes[3] = (itVal >> 24) & 0xff;
      dataBytes[4] = obj.quality ?? 0;
      break;

    case TI.M_ME_TD_1: // Measured short float + time: 4 bytes + 1 byte QDS + 7 bytes CP56Time2a
      dataBytes = new Uint8Array(12);
      const f32buf2 = new ArrayBuffer(4);
      new DataView(f32buf2).setFloat32(0, obj.value as number, true);
      dataBytes.set(new Uint8Array(f32buf2), 0);
      dataBytes[4] = obj.quality ?? 0;
      dataBytes.set(buildCP56Time2a(obj.timestamp ?? new Date()), 5);
      break;

    case TI.M_SP_TB_1: // Single-point + time: 1 byte SIQ + 7 bytes CP56Time2a
      dataBytes = new Uint8Array(8);
      dataBytes[0] = (obj.value ? 0x01 : 0x00) | (obj.quality ?? 0);
      dataBytes.set(buildCP56Time2a(obj.timestamp ?? new Date()), 1);
      break;

    case TI.M_DP_TB_1: // Double-point + time: 1 byte DIQ + 7 bytes CP56Time2a
      dataBytes = new Uint8Array(8);
      dataBytes[0] = ((obj.value as number) & 0x03) | (obj.quality ?? 0);
      dataBytes.set(buildCP56Time2a(obj.timestamp ?? new Date()), 1);
      break;

    case TI.M_ME_TF_1: // Measured short float + time: 4 bytes + 1 byte QDS + 7 bytes CP56Time2a
      dataBytes = new Uint8Array(12);
      const f32buf3 = new ArrayBuffer(4);
      new DataView(f32buf3).setFloat32(0, obj.value as number, true);
      dataBytes.set(new Uint8Array(f32buf3), 0);
      dataBytes[4] = obj.quality ?? 0;
      dataBytes.set(buildCP56Time2a(obj.timestamp ?? new Date()), 5);
      break;

    case TI.C_SC_NA_1: // Single command: 1 byte (DCO)
      dataBytes = new Uint8Array(1);
      dataBytes[0] = (obj.value ? 0x01 : 0x00) | (obj.quality ?? 0);
      break;

    case TI.C_DC_NA_1: // Double command: 1 byte (DCO)
      dataBytes = new Uint8Array(1);
      dataBytes[0] = ((obj.value as number) & 0x03) | (obj.quality ?? 0);
      break;

    case TI.C_RC_NA_1: // Regulating step command: 1 byte (RCO)
      dataBytes = new Uint8Array(1);
      dataBytes[0] = ((obj.value as number) & 0x03) | (obj.quality ?? 0);
      break;

    case TI.C_SE_NA_1: // Setpoint normalized: 2 bytes (NVA) + 1 byte (QOS)
      dataBytes = new Uint8Array(3);
      const spNva = Math.round((obj.value as number) * 32767);
      dataBytes[0] = spNva & 0xff;
      dataBytes[1] = (spNva >> 8) & 0xff;
      dataBytes[2] = obj.quality ?? 0;
      break;

    case TI.C_SE_NB_1: // Setpoint scaled: 2 bytes (SVA) + 1 byte (QOS)
      dataBytes = new Uint8Array(3);
      const spSva = Math.round(obj.value as number);
      dataBytes[0] = spSva & 0xff;
      dataBytes[1] = (spSva >> 8) & 0xff;
      dataBytes[2] = obj.quality ?? 0;
      break;

    case TI.C_SE_NC_1: // Setpoint short float: 4 bytes (IEEE 754) + 1 byte (QOS)
      dataBytes = new Uint8Array(5);
      const f32buf4 = new ArrayBuffer(4);
      new DataView(f32buf4).setFloat32(0, obj.value as number, true);
      dataBytes.set(new Uint8Array(f32buf4), 0);
      dataBytes[4] = obj.quality ?? 0;
      break;

    case TI.C_IC_NA_1: // General interrogation: 1 byte (QOI)
      dataBytes = new Uint8Array(1);
      dataBytes[0] = (obj.value as number) & 0xff;
      break;

    case TI.C_CI_NA_1: // Counter interrogation: 1 byte (QCC)
      dataBytes = new Uint8Array(1);
      dataBytes[0] = (obj.value as number) & 0xff;
      break;

    case TI.C_CS_NA_1: // Clock sync: 7 bytes CP56Time2a
      dataBytes = buildCP56Time2a(obj.timestamp ?? new Date());
      break;

    default:
      throw new Error(`Unsupported TI for encoding: ${ti}`);
  }

  // Combine IOA + data
  const result = new Uint8Array(ioaBytes.length + dataBytes.length);
  result.set(ioaBytes, 0);
  result.set(dataBytes, ioaBytes.length);
  return result;
}

/**
 * Encode an Information Object Address (3 bytes, little-endian).
 * @param ioa - IOA value (0-16777215)
 * @returns 3-byte Uint8Array
 */
function encodeIOA(ioa: number): Uint8Array {
  const buf = new Uint8Array(3);
  buf[0] = ioa & 0xff;
  buf[1] = (ioa >> 8) & 0xff;
  buf[2] = (ioa >> 16) & 0xff;
  return buf;
}

/**
 * Decode an Information Object Address from 3 bytes.
 * @param buffer - Source buffer
 * @param offset - Start offset
 * @returns IOA value
 */
function decodeIOA(buffer: Uint8Array, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

// ─── ASDU Parsing ────────────────────────────────────────────────────

/**
 * Parse an ASDU buffer into a structured Iec104ASDU object.
 * @param buffer - Raw ASDU bytes (without APDU header)
 * @returns Parsed ASDU
 */
export function parseASDU(buffer: Uint8Array): Iec104ASDU {
  if (buffer.length < 6) {
    throw new Error(`ASDU too short: ${buffer.length} bytes (minimum 6)`);
  }

  const ti = buffer[0];
  const vsq = buffer[1];
  const sq = (vsq & 0x80) !== 0;
  const numObjects = vsq & 0x7f;
  const cotByte = buffer[2];
  const cot = cotByte & 0x3f;
  const pn = (cotByte & 0x40) !== 0;
  const test = (cotByte & 0x80) !== 0;
  const originator = buffer[3];
  const commonAddress = buffer[4] | (buffer[5] << 8);

  const objects: InfoObject[] = [];
  let offset = 6;

  for (let i = 0; i < numObjects; i++) {
    if (offset + 3 > buffer.length) break;

    const ioa = decodeIOA(buffer, offset);
    offset += 3;

    const parsed = parseInfoObjectData(ti, buffer, offset);
    objects.push({
      ioa,
      value: parsed.value,
      quality: parsed.quality,
      timestamp: parsed.timestamp
    });
    offset += parsed.bytesRead;

    // If SQ=1, subsequent objects share the same IOA base but increment
    // For SQ=0, each object has its own IOA (already read above)
  }

  return {
    ti,
    tiName: TI_NAMES[ti] ?? `Unknown TI ${ti}`,
    sq,
    numObjects,
    cot,
    cotName: COT_NAMES[cot] ?? `Unknown COT ${cot}`,
    pn,
    test,
    originator,
    commonAddress,
    objects
  };
}

/**
 * Parse information object data based on TI type.
 * @param ti - Type Identification
 * @param buffer - Source buffer
 * @param offset - Data start offset (after IOA)
 * @returns Parsed value, quality, timestamp, and bytes consumed
 */
function parseInfoObjectData(
  ti: number,
  buffer: Uint8Array,
  offset: number
): { value: unknown; quality?: number; timestamp?: Date; bytesRead: number } {
  switch (ti) {
    case TI.M_SP_NA_1: { // Single-point: 1 byte SIQ
      const siq = buffer[offset];
      return { value: (siq & 0x01) !== 0, quality: siq & 0xf0, bytesRead: 1 };
    }

    case TI.M_DP_NA_1: { // Double-point: 1 byte DIQ
      const diq = buffer[offset];
      return { value: diq & 0x03, quality: diq & 0xf0, bytesRead: 1 };
    }

    case TI.M_ME_NA_1: { // Measured normalized: 2 bytes NVA + 1 byte QDS
      const nva = buffer[offset] | (buffer[offset + 1] << 8);
      const signedNva = nva > 0x7fff ? nva - 0x10000 : nva;
      return {
        value: signedNva / 32767,
        quality: buffer[offset + 2],
        bytesRead: 3
      };
    }

    case TI.M_ME_NB_1: { // Measured scaled: 2 bytes SVA + 1 byte QDS
      const sva = buffer[offset] | (buffer[offset + 1] << 8);
      const signedSva = sva > 0x7fff ? sva - 0x10000 : sva;
      return {
        value: signedSva,
        quality: buffer[offset + 2],
        bytesRead: 3
      };
    }

    case TI.M_ME_NC_1: { // Measured short float: 4 bytes IEEE754 + 1 byte QDS
      const f32buf = new ArrayBuffer(4);
      new Uint8Array(f32buf).set(buffer.slice(offset, offset + 4));
      const floatVal = new DataView(f32buf).getFloat32(0, true);
      return {
        value: floatVal,
        quality: buffer[offset + 4],
        bytesRead: 5
      };
    }

    case TI.M_IT_NA_1: { // Integrated totals: 4 bytes + 1 byte QCI
      const itVal = buffer[offset]
        | (buffer[offset + 1] << 8)
        | (buffer[offset + 2] << 16)
        | (buffer[offset + 3] << 24);
      return {
        value: itVal,
        quality: buffer[offset + 4],
        bytesRead: 5
      };
    }

    case TI.M_ME_TD_1: { // Measured short float + time: 4+1+7 = 12 bytes
      const f32buf = new ArrayBuffer(4);
      new Uint8Array(f32buf).set(buffer.slice(offset, offset + 4));
      const floatVal = new DataView(f32buf).getFloat32(0, true);
      const quality = buffer[offset + 4];
      const timestamp = parseCP56Time2a(buffer, offset + 5);
      return { value: floatVal, quality, timestamp, bytesRead: 12 };
    }

    case TI.M_SP_TB_1: { // Single-point + time: 1+7 = 8 bytes
      const siq = buffer[offset];
      const timestamp = parseCP56Time2a(buffer, offset + 1);
      return { value: (siq & 0x01) !== 0, quality: siq & 0xf0, timestamp, bytesRead: 8 };
    }

    case TI.M_DP_TB_1: { // Double-point + time: 1+7 = 8 bytes
      const diq = buffer[offset];
      const timestamp = parseCP56Time2a(buffer, offset + 1);
      return { value: diq & 0x03, quality: diq & 0xf0, timestamp, bytesRead: 8 };
    }

    case TI.M_ME_TF_1: { // Measured short float + time: 4+1+7 = 12 bytes
      const f32buf = new ArrayBuffer(4);
      new Uint8Array(f32buf).set(buffer.slice(offset, offset + 4));
      const floatVal = new DataView(f32buf).getFloat32(0, true);
      const quality = buffer[offset + 4];
      const timestamp = parseCP56Time2a(buffer, offset + 5);
      return { value: floatVal, quality, timestamp, bytesRead: 12 };
    }

    case TI.C_SC_NA_1: { // Single command: 1 byte
      const dco = buffer[offset];
      return { value: (dco & 0x01) !== 0, quality: dco & 0xfc, bytesRead: 1 };
    }

    case TI.C_DC_NA_1: { // Double command: 1 byte
      const dco = buffer[offset];
      return { value: dco & 0x03, quality: dco & 0xfc, bytesRead: 1 };
    }

    case TI.C_RC_NA_1: { // Regulating step command: 1 byte
      const rco = buffer[offset];
      return { value: rco & 0x03, quality: rco & 0xfc, bytesRead: 1 };
    }

    case TI.C_SE_NA_1: { // Setpoint normalized: 2 bytes NVA + 1 byte QOS
      const nva = buffer[offset] | (buffer[offset + 1] << 8);
      const signedNva = nva > 0x7fff ? nva - 0x10000 : nva;
      return {
        value: signedNva / 32767,
        quality: buffer[offset + 2],
        bytesRead: 3
      };
    }

    case TI.C_SE_NB_1: { // Setpoint scaled: 2 bytes SVA + 1 byte QOS
      const sva = buffer[offset] | (buffer[offset + 1] << 8);
      const signedSva = sva > 0x7fff ? sva - 0x10000 : sva;
      return {
        value: signedSva,
        quality: buffer[offset + 2],
        bytesRead: 3
      };
    }

    case TI.C_SE_NC_1: { // Setpoint short float: 4 bytes + 1 byte QOS
      const f32buf = new ArrayBuffer(4);
      new Uint8Array(f32buf).set(buffer.slice(offset, offset + 4));
      const floatVal = new DataView(f32buf).getFloat32(0, true);
      return {
        value: floatVal,
        quality: buffer[offset + 4],
        bytesRead: 5
      };
    }

    case TI.C_IC_NA_1: { // General interrogation: 1 byte QOI
      return { value: buffer[offset], bytesRead: 1 };
    }

    case TI.C_CI_NA_1: { // Counter interrogation: 1 byte QCC
      return { value: buffer[offset], bytesRead: 1 };
    }

    case TI.C_CS_NA_1: { // Clock sync: 7 bytes CP56Time2a
      const timestamp = parseCP56Time2a(buffer, offset);
      return { value: timestamp.getTime(), timestamp, bytesRead: 7 };
    }

    default:
      // Unknown TI — skip remaining bytes
      return { value: null, bytesRead: 0 };
  }
}

// ─── Helper: Convert ASDU to DataPoints ──────────────────────────────

/**
 * Convert a parsed ASDU into an array of Iec104DataPoint objects.
 * @param asdu - Parsed ASDU
 * @returns Array of data points
 */
export function asduToDataPoints(asdu: Iec104ASDU): Iec104DataPoint[] {
  return asdu.objects.map((obj) => ({
    ioa: obj.ioa,
    ti: asdu.ti,
    tiName: asdu.tiName,
    value: obj.value,
    quality: obj.quality,
    timestamp: obj.timestamp,
    cot: asdu.cot,
    cotName: asdu.cotName,
    commonAddress: asdu.commonAddress
  }));
}
