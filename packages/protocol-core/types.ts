import type {
  ConnectionState,
  DecodedFrame,
  HandshakeEvent,
  HandshakeStatus,
  ReadRequest,
  SessionEvent,
  TrafficEvent,
  TransactionEvent,
  TransactionState,
  WriteRequest
} from "../shared-types";

export type {
  ConnectionState,
  DecodedFrame,
  HandshakeEvent,
  HandshakeStatus,
  SessionEvent,
  TrafficEvent,
  TransactionEvent,
  TransactionState
} from "../shared-types";

export interface TransportLike {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(data: Uint8Array): Promise<void>;
  onData(callback: (data: Uint8Array) => void): void;
  isConnected(): boolean;
}

export interface SessionKernelContext<TRuntime = Record<string, unknown>, TConfig = unknown> {
  sessionId: string;
  protocolId: string;
  config: TConfig;
  runtime: TRuntime;
}

export type FrameMatcher<TRuntime = Record<string, unknown>> = (
  frame: Uint8Array,
  context: SessionKernelContext<TRuntime>
) => boolean;

export interface FlowStage<TRuntime = Record<string, unknown>> {
  id: string;
  send?: (context: SessionKernelContext<TRuntime>) => Uint8Array | Promise<Uint8Array>;
  expectResponse?: boolean;
  matcher?: FrameMatcher<TRuntime>;
  timeoutMs?: number;
  onResponse?: (frame: Uint8Array, context: SessionKernelContext<TRuntime>) => void | Promise<void>;
}

export interface HandshakePlan<TRuntime = Record<string, unknown>> {
  id: string;
  stages: Array<FlowStage<TRuntime>>;
}

export interface TransactionPlan<TResult = unknown, TRuntime = Record<string, unknown>> {
  id: string;
  type: string;
  stages: Array<FlowStage<TRuntime>>;
  finalize?: (payload: {
    responses: Uint8Array[];
    context: SessionKernelContext<TRuntime>;
  }) => TResult | Promise<TResult>;
}

export interface ProtocolAdapter<TRuntime = Record<string, unknown>, TConfig = unknown> {
  protocolId: string;
  createTransport(config: TConfig): TransportLike;
  initializeRuntime?: (config: TConfig) => TRuntime;
  getHandshakePlan?: (context: SessionKernelContext<TRuntime, TConfig>) => HandshakePlan<TRuntime> | null;
  createReadPlan(request: ReadRequest, context: SessionKernelContext<TRuntime, TConfig>): TransactionPlan<Uint8Array, TRuntime>;
  createWritePlan(request: WriteRequest, context: SessionKernelContext<TRuntime, TConfig>): TransactionPlan<boolean, TRuntime>;
  createCapabilityPlan?: (
    action: string,
    payload: unknown,
    context: SessionKernelContext<TRuntime, TConfig>
  ) => TransactionPlan<unknown, TRuntime>;
  decodeFrame(frame: Uint8Array, context: SessionKernelContext<TRuntime, TConfig>): Promise<DecodedFrame>;
  encodeFrame(input: unknown, context: SessionKernelContext<TRuntime, TConfig>): Promise<Uint8Array>;
}

export interface ProtocolSessionKernelOptions<TRuntime = Record<string, unknown>, TConfig = unknown> {
  sessionId: string;
  config: TConfig;
  adapter: ProtocolAdapter<TRuntime, TConfig>;
}

export interface EventEmitterLike {
  (event: SessionEvent): void;
}

export function createConnectionStateEvent(
  sessionId: string,
  protocolId: string,
  state: ConnectionState,
  reason?: string
): SessionEvent {
  return {
    type: "connection-state",
    sessionId,
    protocolId,
    state,
    reason,
    timestamp: Date.now()
  };
}

export function createHandshakeEvent(
  sessionId: string,
  protocolId: string,
  handshakeId: string,
  stepId: string,
  status: HandshakeStatus,
  detail?: string
): HandshakeEvent {
  return {
    type: "handshake",
    sessionId,
    protocolId,
    handshakeId,
    stepId,
    status,
    detail,
    timestamp: Date.now()
  };
}

export function createTransactionEvent(
  sessionId: string,
  protocolId: string,
  transactionId: string,
  transactionType: string,
  state: TransactionState,
  phase?: string,
  error?: string
): TransactionEvent {
  return {
    type: "transaction",
    sessionId,
    protocolId,
    transactionId,
    transactionType,
    state,
    phase,
    error,
    timestamp: Date.now()
  };
}

export function createTrafficEvent(payload: Omit<TrafficEvent, "timestamp" | "type"> & { timestamp?: number }): TrafficEvent {
  return {
    type: "traffic",
    ...payload,
    timestamp: payload.timestamp ?? Date.now()
  };
}
