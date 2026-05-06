import dgram, { type RemoteInfo, type Socket } from "dgram";
import { ProtocolError } from "../shared-types";

export interface UdpConfig {
  host: string;
  port: number;
  localPort?: number;
  bindAddress?: string;
  connectTimeoutMs?: number;
}

export class UdpTransport {
  private socket?: Socket;
  private config: UdpConfig;
  private onDataCallback?: (data: Uint8Array, remote: RemoteInfo) => void;

  constructor(config: UdpConfig) {
    this.config = {
      bindAddress: "0.0.0.0",
      connectTimeoutMs: 3000,
      ...config
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      const timeout = setTimeout(() => {
        socket.close();
        reject(new ProtocolError("CONNECTION_TIMEOUT", "UDP bind timeout"));
      }, this.config.connectTimeoutMs);

      socket.once("error", (error) => {
        clearTimeout(timeout);
        socket.close();
        reject(new ProtocolError("CONNECTION_FAILED", error.message));
      });

      socket.on("message", (message, remote) => {
        this.onDataCallback?.(new Uint8Array(message), remote);
      });

      socket.bind(this.config.localPort ?? 0, this.config.bindAddress, () => {
        clearTimeout(timeout);
        this.socket = socket;
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve();
        return;
      }

      this.socket.close(() => {
        this.socket = undefined;
        resolve();
      });
    });
  }

  async send(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new ProtocolError("CONNECTION_FAILED", "UDP transport is not connected"));
        return;
      }

      this.socket.send(data, this.config.port, this.config.host, (error) => {
        if (error) {
          reject(new ProtocolError("PROTOCOL_ERROR", error.message));
          return;
        }
        resolve();
      });
    });
  }

  onData(callback: (data: Uint8Array, remote: RemoteInfo) => void): void {
    this.onDataCallback = callback;
  }

  isConnected(): boolean {
    return Boolean(this.socket);
  }
}
