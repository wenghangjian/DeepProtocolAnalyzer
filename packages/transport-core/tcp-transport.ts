import { Socket } from "net";
import { ProtocolError } from "../shared-types";

export interface TcpConfig {
  host: string;
  port: number;
  connectTimeoutMs?: number;
}

export class TcpTransport {
  private socket?: Socket;
  private config: TcpConfig;
  private onDataCallback?: (data: Uint8Array) => void;

  constructor(config: TcpConfig) {
    this.config = { connectTimeoutMs: 5000, ...config };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new Socket();
      const timeout = setTimeout(() => {
        this.socket?.destroy();
        reject(new ProtocolError("CONNECTION_TIMEOUT", "Connection timeout"));
      }, this.config.connectTimeoutMs);

      this.socket.on("connect", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket.on("error", (err: Error) => {
        clearTimeout(timeout);
        reject(new ProtocolError("CONNECTION_FAILED", err.message));
      });

      this.socket.on("data", (data: Buffer) => {
        this.onDataCallback?.(new Uint8Array(data));
      });

      this.socket.connect(this.config.port, this.config.host);
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve();
        return;
      }
      this.socket.end(() => {
        this.socket?.destroy();
        this.socket = undefined;
        resolve();
      });
    });
  }

  async send(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new ProtocolError("CONNECTION_FAILED", "Not connected"));
        return;
      }
      this.socket.write(Buffer.from(data), (err?: Error | null) => {
        if (err) reject(new ProtocolError("PROTOCOL_ERROR", err.message));
        else resolve();
      });
    });
  }

  onData(callback: (data: Uint8Array) => void): void {
    this.onDataCallback = callback;
  }

  isConnected(): boolean {
    return this.socket !== undefined && !this.socket.destroyed;
  }
}
