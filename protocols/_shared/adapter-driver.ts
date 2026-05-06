import type {
  IProtocolDriver,
  PollTask,
  ReadRequest,
  SessionEvent,
  TrafficEvent,
  WriteRequest
} from "../../packages/shared-types";
import { ProtocolSessionKernel, type ProtocolAdapter } from "../../packages/protocol-core";

export abstract class AdapterBackedDriver<
  TConfig extends object,
  TRuntime extends object = Record<string, unknown>
> implements IProtocolDriver {
  protected abstract protocolId: string;
  protected abstract defaultConfig: TConfig;
  protected config?: TConfig;
  protected kernel?: ProtocolSessionKernel<TRuntime, TConfig>;
  private trafficCallback?: (packet: TrafficEvent) => void;
  private sessionEventCallback?: (event: SessionEvent) => void;

  protected abstract buildAdapter(config: TConfig): ProtocolAdapter<TRuntime, TConfig>;

  async onInit(config: unknown): Promise<void> {
    const next = (config ?? {}) as Partial<TConfig>;
    this.config = {
      ...this.defaultConfig,
      ...next
    };
  }

  async onDestroy(): Promise<void> {
    if (this.kernel) {
      await this.kernel.destroy();
      this.kernel = undefined;
    }
  }

  async connect(sessionId: string): Promise<void> {
    const effectiveConfig = this.getEffectiveConfig();
    const kernel = new ProtocolSessionKernel<TRuntime, TConfig>({
      sessionId,
      config: effectiveConfig,
      adapter: this.buildAdapter(effectiveConfig)
    });
    kernel.onTraffic((event) => {
      this.trafficCallback?.(event);
    });
    kernel.onEvent((event) => {
      if (event.type !== "traffic") {
        this.sessionEventCallback?.(event);
      }
    });
    this.kernel = kernel;
    await kernel.connect();
  }

  async disconnect(_sessionId: string): Promise<void> {
    await this.kernel?.disconnect();
  }

  async read(_sessionId: string, request: ReadRequest): Promise<Uint8Array> {
    return this.requireKernel().read(request);
  }

  async write(_sessionId: string, request: WriteRequest): Promise<boolean> {
    return this.requireKernel().write(request);
  }

  async invokeCapability(_sessionId: string, action: string, payload?: unknown): Promise<unknown> {
    return this.requireKernel().invokeCapability(action, payload);
  }

  async startPolling(_sessionId: string, task: PollTask): Promise<void> {
    await this.requireKernel().startPolling(task);
  }

  async stopPolling(_sessionId: string, taskId: string): Promise<void> {
    await this.requireKernel().stopPolling(taskId);
  }

  async encodeFrame(input: unknown): Promise<Uint8Array> {
    const config = this.getEffectiveConfig();
    const adapter = this.buildAdapter(config);
    return adapter.encodeFrame(input, {
      sessionId: "preview",
      protocolId: this.protocolId,
      config,
      runtime: {} as TRuntime
    });
  }

  async decodeFrame(frame: Uint8Array) {
    const config = this.getEffectiveConfig();
    const adapter = this.buildAdapter(config);
    return adapter.decodeFrame(frame, {
      sessionId: "preview",
      protocolId: this.protocolId,
      config,
      runtime: {} as TRuntime
    });
  }

  onTraffic(callback: (packet: TrafficEvent) => void): void {
    this.trafficCallback = callback;
  }

  onSessionEvent(callback: (event: SessionEvent) => void): void {
    this.sessionEventCallback = callback;
  }

  private requireKernel() {
    if (!this.kernel) {
      throw new Error(`Protocol session ${this.protocolId} is not connected`);
    }
    return this.kernel;
  }

  private getEffectiveConfig() {
    return this.config ?? { ...this.defaultConfig };
  }
}
