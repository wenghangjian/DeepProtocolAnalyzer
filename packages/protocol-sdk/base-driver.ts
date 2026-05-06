import { IProtocolDriver, TrafficEvent } from "../shared-types";

export abstract class BaseProtocolDriver implements IProtocolDriver {
  protected trafficCallback?: (packet: TrafficEvent) => void;

  abstract onInit(config: unknown): Promise<void>;
  abstract onDestroy(): Promise<void>;
  abstract connect(sessionId: string): Promise<void>;
  abstract disconnect(sessionId: string): Promise<void>;
  abstract read(sessionId: string, request: any): Promise<Uint8Array>;
  abstract write(sessionId: string, request: any): Promise<boolean>;
  abstract startPolling(sessionId: string, task: any): Promise<void>;
  abstract stopPolling(sessionId: string, taskId: string): Promise<void>;
  abstract encodeFrame(input: unknown): Promise<Uint8Array>;
  abstract decodeFrame(frame: Uint8Array): Promise<any>;

  onTraffic(callback: (packet: TrafficEvent) => void): void {
    this.trafficCallback = callback;
  }

  protected emitTraffic(packet: TrafficEvent): void {
    this.trafficCallback?.(packet);
  }
}
