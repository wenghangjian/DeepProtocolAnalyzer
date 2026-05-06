import type {
  PollTask,
  ReadRequest,
  SessionEvent,
  TrafficEvent,
  WriteRequest
} from "../shared-types";
import {
  createConnectionStateEvent,
  createHandshakeEvent,
  createTrafficEvent,
  createTransactionEvent,
  type EventEmitterLike,
  type FlowStage,
  type HandshakePlan,
  type ProtocolSessionKernelOptions,
  type SessionKernelContext,
  type TransactionPlan,
  type TransportLike
} from "./types";

type ActiveFlow = {
  kind: "handshake" | "transaction";
  flowId: string;
  flowType: string;
  stepId: string;
  matcher?: (frame: Uint8Array, context: SessionKernelContext<any, any>) => boolean;
  resolve: (frame: Uint8Array) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export class ProtocolSessionKernel<TRuntime = Record<string, unknown>, TConfig = unknown> {
  private readonly transport: TransportLike;
  private readonly protocolId: string;
  private readonly runtime: TRuntime;
  private readonly context: SessionKernelContext<TRuntime, TConfig>;
  private readonly pollTimers = new Map<string, NodeJS.Timeout>();
  private readonly eventCallbacks = new Set<EventEmitterLike>();
  private readonly trafficCallbacks = new Set<(event: TrafficEvent) => void>();
  private activeFlow: ActiveFlow | null = null;

  constructor(private readonly options: ProtocolSessionKernelOptions<TRuntime, TConfig>) {
    this.protocolId = options.adapter.protocolId;
    const runtime = ((options.adapter.initializeRuntime?.(options.config) ?? {}) as TRuntime);
    this.runtime = runtime;
    this.context = {
      sessionId: options.sessionId,
      protocolId: this.protocolId,
      config: options.config,
      runtime
    };
    this.transport = options.adapter.createTransport(options.config);
    this.transport.onData((frame) => {
      void this.handleIncomingFrame(frame);
    });
  }

  onEvent(callback: EventEmitterLike) {
    this.eventCallbacks.add(callback);
  }

  onTraffic(callback: (event: TrafficEvent) => void) {
    this.trafficCallbacks.add(callback);
  }

  async connect() {
    try {
      this.emit(createConnectionStateEvent(this.context.sessionId, this.protocolId, "connecting"));
      await this.transport.connect();
      this.emit(createConnectionStateEvent(this.context.sessionId, this.protocolId, "transport_connected"));

      const handshake = this.options.adapter.getHandshakePlan?.(this.context) ?? null;
      if (handshake) {
        this.emit(createConnectionStateEvent(this.context.sessionId, this.protocolId, "handshaking"));
        await this.runHandshake(handshake);
      }

      this.emit(createConnectionStateEvent(this.context.sessionId, this.protocolId, "ready"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection failed";
      this.emit(createConnectionStateEvent(this.context.sessionId, this.protocolId, "error", message));
      throw error;
    }
  }

  async disconnect() {
    this.emit(createConnectionStateEvent(this.context.sessionId, this.protocolId, "disconnecting"));
    this.pollTimers.forEach((timer) => clearInterval(timer));
    this.pollTimers.clear();
    await this.transport.disconnect();
    this.emit(createConnectionStateEvent(this.context.sessionId, this.protocolId, "closed"));
  }

  async destroy() {
    await this.disconnect();
  }

  async read(request: ReadRequest) {
    return this.runTransaction(this.options.adapter.createReadPlan(request, this.context));
  }

  async write(request: WriteRequest) {
    return this.runTransaction(this.options.adapter.createWritePlan(request, this.context));
  }

  async invokeCapability(action: string, payload?: unknown) {
    const planFactory = this.options.adapter.createCapabilityPlan;
    if (!planFactory) {
      throw new Error(`Protocol ${this.protocolId} does not expose capability actions`);
    }
    return this.runTransaction(planFactory(action, payload, this.context));
  }

  async startPolling(task: PollTask) {
    await this.stopPolling(task.taskId);
    const timer = setInterval(() => {
      void this.read({
        address: task.address,
        length: task.length,
        functionCode: task.functionCode,
        unitId: task.unitId,
        dataType: task.dataType,
        timeoutMs: task.intervalMs
      }).catch(() => {
        // best-effort
      });
    }, task.intervalMs);
    this.pollTimers.set(task.taskId, timer);
  }

  async stopPolling(taskId: string) {
    const timer = this.pollTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(taskId);
    }
  }

  async encodeFrame(input: unknown) {
    return this.options.adapter.encodeFrame(input, this.context);
  }

  async decodeFrame(frame: Uint8Array) {
    return this.options.adapter.decodeFrame(frame, this.context);
  }

  private async runHandshake(plan: HandshakePlan<TRuntime>) {
    try {
      for (const stage of plan.stages) {
        this.emit(createHandshakeEvent(this.context.sessionId, this.protocolId, plan.id, stage.id, "started"));
        await this.executeStage({
          kind: "handshake",
          flowId: plan.id,
          flowType: plan.id,
          stage,
          onFrameSent: () => {
            this.emit(createHandshakeEvent(this.context.sessionId, this.protocolId, plan.id, stage.id, "frame_sent"));
          },
          onFrameReceived: () => {
            this.emit(createHandshakeEvent(this.context.sessionId, this.protocolId, plan.id, stage.id, "frame_received"));
          }
        });
      }

      const lastStage = plan.stages[plan.stages.length - 1];
      this.emit(createHandshakeEvent(this.context.sessionId, this.protocolId, plan.id, lastStage?.id ?? plan.id, "completed"));
    } catch (error) {
      const stepId = plan.stages.find((stage) => stage.id === this.activeFlow?.stepId)?.id ?? plan.stages[0]?.id ?? plan.id;
      this.emit(createHandshakeEvent(
        this.context.sessionId,
        this.protocolId,
        plan.id,
        stepId,
        "failed",
        error instanceof Error ? error.message : "Handshake failed"
      ));
      throw error;
    }
  }

  private async runTransaction<TResult>(plan: TransactionPlan<TResult, TRuntime>): Promise<TResult> {
    this.emit(createTransactionEvent(this.context.sessionId, this.protocolId, plan.id, plan.type, "pending"));
    const responses: Uint8Array[] = [];

    try {
      for (const stage of plan.stages) {
        this.emit(createTransactionEvent(this.context.sessionId, this.protocolId, plan.id, plan.type, "awaiting_response", stage.id));
        const response = await this.executeStage({
          kind: "transaction",
          flowId: plan.id,
          flowType: plan.type,
          stage,
          onFrameSent: () => undefined,
          onFrameReceived: () => undefined
        });

        if (response) {
          responses.push(response);
        }
      }

      this.emit(createTransactionEvent(this.context.sessionId, this.protocolId, plan.id, plan.type, "completed"));
      if (plan.finalize) {
        return plan.finalize({ responses, context: this.context });
      }

      return responses.at(-1) as TResult;
    } catch (error) {
      this.emit(createTransactionEvent(
        this.context.sessionId,
        this.protocolId,
        plan.id,
        plan.type,
        "failed",
        this.activeFlow?.stepId,
        error instanceof Error ? error.message : "Transaction failed"
      ));
      throw error;
    }
  }

  private async executeStage(payload: {
    kind: "handshake" | "transaction";
    flowId: string;
    flowType: string;
    stage: FlowStage<TRuntime>;
    onFrameSent: () => void;
    onFrameReceived: () => void;
  }) {
    const { kind, flowId, flowType, stage, onFrameReceived, onFrameSent } = payload;

    if (stage.send) {
      const frame = await stage.send(this.context);
      await this.transport.send(frame);
      this.emitTraffic(frame, "tx", kind === "handshake" ? "handshake" : "transaction", flowId, stage.id);
      onFrameSent();
    }

    if (!stage.expectResponse) {
      return undefined;
    }

    const frame = await this.waitForMatchingFrame(kind, flowId, flowType, stage);
    await stage.onResponse?.(frame, this.context);
    onFrameReceived();
    return frame;
  }

  private waitForMatchingFrame(
    kind: "handshake" | "transaction",
    flowId: string,
    flowType: string,
    stage: FlowStage<TRuntime>
  ) {
    return new Promise<Uint8Array>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.activeFlow = null;
        if (kind === "transaction") {
          this.emit(createTransactionEvent(this.context.sessionId, this.protocolId, flowId, flowType, "timed_out", stage.id, `${flowType} timed out`));
        } else {
          this.emit(createHandshakeEvent(this.context.sessionId, this.protocolId, flowId, stage.id, "failed", "Timed out"));
        }
        reject(new Error(`${flowType} timed out`));
      }, stage.timeoutMs ?? 5000);

      this.activeFlow = {
        kind,
        flowId,
        flowType,
        stepId: stage.id,
        matcher: stage.matcher as ActiveFlow["matcher"],
        resolve: (frame) => {
          clearTimeout(timeout);
          this.activeFlow = null;
          resolve(frame);
        },
        reject,
        timeout
      };
    });
  }

  private async handleIncomingFrame(frame: Uint8Array) {
    const decoded = await this.options.adapter.decodeFrame(frame, this.context);
    const active = this.activeFlow;

    if (active && (!active.matcher || active.matcher(frame, this.context))) {
      this.emitTraffic(frame, "rx", active.kind === "handshake" ? "handshake" : "transaction", active.flowId, active.stepId, decoded.fields);
      active.resolve(frame);
      return;
    }

    this.emitTraffic(frame, "rx", active ? "unsolicited" : "orphan", undefined, undefined, decoded.fields);
  }

  private emitTraffic(
    rawBytes: Uint8Array,
    direction: "tx" | "rx",
    classification: TrafficEvent["classification"],
    relatedTransactionId?: string,
    relatedPhase?: string,
    parsedFields?: Record<string, unknown>
  ) {
    const trafficEvent = createTrafficEvent({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      sessionId: this.context.sessionId,
      protocolId: this.protocolId,
      direction,
      rawBytes,
      length: rawBytes.length,
      isError: false,
      relatedTransactionId,
      relatedPhase,
      classification,
      parsedFields
    });
    this.emit(trafficEvent);
    for (const callback of this.trafficCallbacks) {
      callback(trafficEvent);
    }
  }

  private emit(event: SessionEvent) {
    for (const callback of this.eventCallbacks) {
      callback(event);
    }
  }
}
