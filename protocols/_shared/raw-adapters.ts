import type { ReadRequest, WriteRequest } from "../../packages/shared-types";
import type {
  HandshakePlan,
  ProtocolAdapter,
  SessionKernelContext
} from "../../packages/protocol-core";
import { SerialTransport } from "../../packages/transport-core/serial-transport";
import { TcpTransport } from "../../packages/transport-core/tcp-transport";
import { UdpTransport } from "../../packages/transport-core/udp-transport";

type RawDecodeFields = (frame: Uint8Array) => Record<string, unknown>;

function toPreviewFields(frame: Uint8Array) {
  return {
    length: frame.length,
    previewHex: Array.from(frame.slice(0, 20))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ")
  };
}

function normalizeRawInput(input: unknown): Uint8Array {
  const frameInput = input as { data?: Uint8Array | number[] };
  if (frameInput.data instanceof Uint8Array) {
    return frameInput.data;
  }
  if (Array.isArray(frameInput.data)) {
    return new Uint8Array(frameInput.data);
  }
  return new Uint8Array();
}

function buildRawReadPlan(
  request: ReadRequest,
  timeoutMs: number
) {
  return {
    id: `read-${Date.now()}`,
    type: "raw-read",
    stages: [
      {
        id: "await-next-frame",
        expectResponse: true,
        matcher: () => true,
        timeoutMs: request.timeoutMs ?? timeoutMs
      }
    ],
    finalize: ({ responses }: { responses: Uint8Array[] }) => responses[0] ?? new Uint8Array()
  };
}

function buildRawWritePlan(
  request: WriteRequest
) {
  return {
    id: `write-${Date.now()}`,
    type: "raw-write",
    stages: [
      {
        id: "send-raw",
        send: () => request.data,
        expectResponse: false
      }
    ],
    finalize: () => true
  };
}

export interface RawTcpConfig {
  host: string;
  port: number;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
}

export interface RawSerialConfig {
  path: string;
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  readTimeoutMs?: number;
}

export interface RawUdpConfig {
  host: string;
  port: number;
  localPort?: number;
  bindAddress?: string;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
}

export function createRawTcpAdapter<TRuntime extends object = Record<string, unknown>>(
  protocolId: string,
  decodeFields: RawDecodeFields = toPreviewFields,
  handshakeFactory?: (context: SessionKernelContext<TRuntime, RawTcpConfig>) => HandshakePlan<TRuntime> | null
): ProtocolAdapter<TRuntime, RawTcpConfig> {
  return {
    protocolId,
    createTransport: (config) => new TcpTransport({
      host: config.host,
      port: config.port,
      connectTimeoutMs: config.connectTimeoutMs
    }),
    getHandshakePlan: (context) => handshakeFactory?.(context) ?? null,
    createReadPlan: (request, context) => buildRawReadPlan(request, context.config.readTimeoutMs ?? 5000),
    createWritePlan: (request) => buildRawWritePlan(request),
    decodeFrame: async (frame) => ({
      fields: decodeFields(frame),
      isError: false
    }),
    encodeFrame: async (input) => normalizeRawInput(input)
  };
}

export function createRawSerialAdapter<TRuntime extends object = Record<string, unknown>>(
  protocolId: string,
  decodeFields: RawDecodeFields = toPreviewFields
): ProtocolAdapter<TRuntime, RawSerialConfig> {
  return {
    protocolId,
    createTransport: (config) => new SerialTransport({
      path: config.path,
      baudRate: config.baudRate,
      dataBits: config.dataBits,
      stopBits: config.stopBits,
      parity: config.parity
    }),
    createReadPlan: (request, context) => buildRawReadPlan(request, context.config.readTimeoutMs ?? 5000),
    createWritePlan: (request) => buildRawWritePlan(request),
    decodeFrame: async (frame) => ({
      fields: decodeFields(frame),
      isError: false
    }),
    encodeFrame: async (input) => normalizeRawInput(input)
  };
}

export function createRawUdpAdapter<TRuntime extends object = Record<string, unknown>>(
  protocolId: string,
  decodeFields: RawDecodeFields = toPreviewFields
): ProtocolAdapter<TRuntime, RawUdpConfig> {
  return {
    protocolId,
    createTransport: (config) => new UdpTransport({
      host: config.host,
      port: config.port,
      localPort: config.localPort,
      bindAddress: config.bindAddress,
      connectTimeoutMs: config.connectTimeoutMs
    }),
    createReadPlan: (request, context) => buildRawReadPlan(request, context.config.readTimeoutMs ?? 5000),
    createWritePlan: (request) => buildRawWritePlan(request),
    decodeFrame: async (frame) => ({
      fields: decodeFields(frame),
      isError: false
    }),
    encodeFrame: async (input) => normalizeRawInput(input)
  };
}
