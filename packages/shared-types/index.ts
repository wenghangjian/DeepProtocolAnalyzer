export type DataFormat = "uint16" | "int16" | "float32" | "bool" | "raw";
export type ByteOrder = "big-endian" | "little-endian" | "big-endian-word-swap" | "little-endian-word-swap";

export interface ReadRequest {
  address: string;
  length: number;
  functionCode?: number;
  unitId?: number;
  dataType?: DataFormat;
  timeoutMs?: number;
}

export interface WriteRequest {
  address: string;
  data: Uint8Array;
  functionCode?: number;
  unitId?: number;
  timeoutMs?: number;
}

/**
 * Convert raw Modbus register bytes to a typed value.
 * @param registers - Raw bytes from Modbus response (register data area)
 * @param format - Target data format
 * @param byteOrder - Byte ordering within registers (default: big-endian)
 */
export function convertRegistersToValue(
  registers: Uint8Array,
  format: DataFormat,
  byteOrder: ByteOrder = "big-endian"
): number | boolean {
  if (format === "raw") {
    return 0;
  }

  if (format === "bool") {
    // For coils/discrete inputs, any non-zero byte means true
    return registers.length > 0 && registers.some((b) => b !== 0);
  }

  // Reorder bytes according to byteOrder
  const reordered = reorderBytes(registers, byteOrder);

  if (format === "uint16") {
    if (reordered.length < 2) return 0;
    return (reordered[0] << 8) | reordered[1];
  }

  if (format === "int16") {
    if (reordered.length < 2) return 0;
    const val = (reordered[0] << 8) | reordered[1];
    return val > 0x7fff ? val - 0x10000 : val;
  }

  if (format === "float32") {
    if (reordered.length < 4) return 0;
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint8(0, reordered[0]);
    view.setUint8(1, reordered[1]);
    view.setUint8(2, reordered[2]);
    view.setUint8(3, reordered[3]);
    return view.getFloat32(0);
  }

  return 0;
}

/**
 * Convert a typed value to raw Modbus register bytes.
 * @param value - The value to encode
 * @param format - Source data format
 * @param byteOrder - Byte ordering within registers (default: big-endian)
 */
export function convertValueToRegisters(
  value: number | boolean,
  format: DataFormat,
  byteOrder: ByteOrder = "big-endian"
): Uint8Array {
  if (format === "raw") {
    return new Uint8Array(0);
  }

  if (format === "bool") {
    return new Uint8Array([value ? 0xff : 0x00]);
  }

  let bytes: Uint8Array;

  if (format === "uint16") {
    const v = typeof value === "number" ? value : 0;
    bytes = new Uint8Array([(v >> 8) & 0xff, v & 0xff]);
  } else if (format === "int16") {
    const v = typeof value === "number" ? value : 0;
    const raw = v < 0 ? v + 0x10000 : v;
    bytes = new Uint8Array([(raw >> 8) & 0xff, raw & 0xff]);
  } else if (format === "float32") {
    const v = typeof value === "number" ? value : 0;
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, v);
    bytes = new Uint8Array(buf);
  } else {
    return new Uint8Array(0);
  }

  return reorderBytes(bytes, byteOrder);
}

/**
 * Reorder bytes according to the specified byte order.
 * Input is assumed to be in big-endian order.
 */
function reorderBytes(data: Uint8Array, byteOrder: ByteOrder): Uint8Array {
  if (byteOrder === "big-endian") {
    return data;
  }

  const result = new Uint8Array(data);

  if (byteOrder === "little-endian") {
    // Reverse all bytes
    result.reverse();
  } else if (byteOrder === "big-endian-word-swap") {
    // Swap 16-bit words: [ABCD] -> [CDAB]
    if (result.length >= 4) {
      const tmp0 = result[0];
      const tmp1 = result[1];
      result[0] = result[2];
      result[1] = result[3];
      result[2] = tmp0;
      result[3] = tmp1;
    }
  } else if (byteOrder === "little-endian-word-swap") {
    // Reverse bytes within each word: [ABCD] -> [BADC]
    for (let i = 0; i + 1 < result.length; i += 2) {
      const tmp = result[i];
      result[i] = result[i + 1];
      result[i + 1] = tmp;
    }
  }

  return result;
}

export type ProtocolErrorCode =
  | "CONNECTION_FAILED"
  | "CONNECTION_TIMEOUT"
  | "READ_TIMEOUT"
  | "WRITE_TIMEOUT"
  | "PROTOCOL_ERROR"
  | "INVALID_ADDRESS"
  | "DEVICE_BUSY"
  | "UNKNOWN";

export class ProtocolError extends Error {
  constructor(
    public code: ProtocolErrorCode,
    message: string,
    public raw?: Uint8Array
  ) {
    super(message);
  }
}

export interface PollTask {
  taskId: string;
  address: string;
  length: number;
  intervalMs: number;
  functionCode?: number;
  unitId?: number;
  dataType?: ReadRequest["dataType"];
}

export interface DecodedFrame {
  fields: Record<string, unknown>;
  isError: boolean;
  errorDescription?: string;
}

export type ConnectionState =
  | "idle"
  | "connecting"
  | "transport_connected"
  | "handshaking"
  | "ready"
  | "degraded"
  | "disconnecting"
  | "closed"
  | "error";

export type TransactionState =
  | "pending"
  | "awaiting_response"
  | "streaming"
  | "completed"
  | "timed_out"
  | "cancelled"
  | "failed";

export type HandshakeStatus =
  | "started"
  | "frame_sent"
  | "frame_received"
  | "completed"
  | "failed";

export interface ConnectionStateEvent {
  type: "connection-state";
  sessionId: string;
  protocolId: string;
  state: ConnectionState;
  timestamp: number;
  reason?: string;
}

export interface HandshakeEvent {
  type: "handshake";
  sessionId: string;
  protocolId: string;
  handshakeId: string;
  stepId: string;
  status: HandshakeStatus;
  timestamp: number;
  detail?: string;
}

export interface TransactionEvent {
  type: "transaction";
  sessionId: string;
  protocolId: string;
  transactionId: string;
  transactionType: string;
  state: TransactionState;
  timestamp: number;
  phase?: string;
  error?: string;
}

export type SessionEvent =
  | ConnectionStateEvent
  | HandshakeEvent
  | TransactionEvent
  | TrafficEvent;

export interface IProtocolDriver {
  onInit(config: unknown): Promise<void>;
  onDestroy(): Promise<void>;
  connect(sessionId: string): Promise<void>;
  disconnect(sessionId: string): Promise<void>;
  read(sessionId: string, request: ReadRequest): Promise<Uint8Array>;
  write(sessionId: string, request: WriteRequest): Promise<boolean>;
  startPolling(sessionId: string, task: PollTask): Promise<void>;
  stopPolling(sessionId: string, taskId: string): Promise<void>;
  encodeFrame(input: unknown): Promise<Uint8Array>;
  decodeFrame(frame: Uint8Array): Promise<DecodedFrame>;
  onTraffic(callback: (packet: TrafficEvent) => void): void;
  onSessionEvent?(callback: (event: SessionEvent) => void): void;
  invokeCapability?(sessionId: string, action: string, payload?: unknown): Promise<unknown>;
}

export interface TrafficEvent {
  type: "traffic";
  id: string;
  sessionId: string;
  protocolId: string;
  direction: "tx" | "rx";
  timestamp: number;
  rawBytes: Uint8Array;
  length: number;
  isError: boolean;
  relatedTransactionId?: string;
  relatedPhase?: string;
  classification?: "handshake" | "transaction" | "unsolicited" | "orphan";
  parsedFields?: Record<string, unknown>;
}

export interface SessionConfig {
  sessionId: string;
  protocolId: string;
  transport: "tcp" | "serial" | "udp";
  config: unknown;
}

export type SessionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface SessionState extends SessionConfig {
  status: SessionStatus;
  connectionState?: ConnectionState;
  handshakePhase?: string;
  activeTransactionId?: string;
  lastError?: string;
  tasks: PollTask[];
}

export interface ProtocolManifest {
  protocolId: string;
  protocolName: string;
  version: string;
  supportedTransports: Array<"tcp" | "serial" | "udp">;
  capabilities: string[];
  category?: "modbus" | "scada" | "substation" | "automation" | "building" | "custom";
  defaultTransport?: "tcp" | "serial" | "udp";
  defaultConfig?: Record<string, string | number | boolean>;
  connectionSummary?: string;
  connectionSteps?: string[];
  readBehavior?: string;
}

export interface SerialPortInfo {
  path: string;
  friendlyName: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  vendorId?: string;
  productId?: string;
  isMappedPhysical: boolean;
  isLikelyVirtual: boolean;
}
