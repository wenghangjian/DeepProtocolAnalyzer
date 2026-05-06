import { SerialPort } from "serialport";
import { ProtocolError } from "../shared-types";

export interface SerialConfig {
  path: string;
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
}

export class SerialTransport {
  private port?: SerialPort;
  private config: SerialConfig;
  private onDataCallback?: (data: Uint8Array) => void;

  constructor(config: SerialConfig) {
    this.config = { dataBits: 8, stopBits: 1, parity: "none", ...config };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: this.config.path,
        baudRate: this.config.baudRate,
        dataBits: this.config.dataBits,
        stopBits: this.config.stopBits,
        parity: this.config.parity,
      }, (err?: Error | null) => {
        if (err) {
          reject(new ProtocolError("CONNECTION_FAILED", err.message));
        } else {
          resolve();
        }
      });

      this.port.on("data", (data: Buffer) => {
        this.onDataCallback?.(new Uint8Array(data));
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.port) {
        resolve();
        return;
      }
      this.port.close(() => {
        this.port = undefined;
        resolve();
      });
    });
  }

  async send(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.port) {
        reject(new ProtocolError("CONNECTION_FAILED", "Not connected"));
        return;
      }
      this.port.write(Buffer.from(data), (err?: Error | null) => {
        if (err) reject(new ProtocolError("PROTOCOL_ERROR", err.message));
        else resolve();
      });
    });
  }

  onData(callback: (data: Uint8Array) => void): void {
    this.onDataCallback = callback;
  }

  isConnected(): boolean {
    return this.port !== undefined && this.port.isOpen;
  }
}
