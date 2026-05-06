import type { ReadRequest, WriteRequest } from "../../packages/shared-types";
import type { ProtocolAdapter } from "../../packages/protocol-core";
import { AdapterBackedDriver } from "../_shared/adapter-driver";
import { SerialTransport } from "../../packages/transport-core/serial-transport";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Supported send modes for frame encoding. */
export type SendMode = "hex" | "ascii" | "raw";

/** Configuration for the Custom Serial engine. */
export interface CustomSerialConfig {
  path: string;
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  readTimeoutMs?: number;
  responseTimeoutMs?: number;
  defaultSendMode?: SendMode;
  /** Inter-frame timeout in ms — used to detect frame boundaries on serial. */
  interFrameTimeoutMs?: number;
}

/** Runtime state tracked across transactions. */
interface CustomSerialRuntime {
  autoSendTimer: ReturnType<typeof setInterval> | null;
}

// ─── Hex / ASCII helpers ────────────────────────────────────────────────────

/**
 * Parse a hex string (e.g. "01 03 00 00 00 0A" or "01030000000A") into a Buffer.
 * Whitespace and "0x" prefixes are stripped automatically.
 */
function parseHexString(hex: string): Buffer {
  const cleaned = hex.replace(/[\s0x]/g, "");
  if (cleaned.length % 2 !== 0) {
    throw new Error(`Hex string must have even length, got "${hex}"`);
  }
  return Buffer.from(cleaned, "hex");
}

/**
 * Convert an ASCII string to a Buffer.
 */
function asciiToBuffer(ascii: string): Buffer {
  return Buffer.from(ascii, "ascii");
}

/**
 * Format a Buffer as a hex dump string (e.g. "01 03 00 00").
 */
function toHexDump(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

// ─── CRC-16 / Modbus ───────────────────────────────────────────────────────

/**
 * CRC-16/Modbus lookup table (polynomial 0xA001).
 */
const CRC16_TABLE: Uint16Array = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
    table[i] = crc;
  }
  return table;
})();

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Custom Serial protocol engine with HEX/ASCII/raw send modes, timed auto-send,
 * CRC-16/LRC calculation, and frame builder utilities.
 *
 * Extends {@link AdapterBackedDriver} to leverage the session kernel for
 * transport lifecycle, traffic events, and polling.
 *
 * Mirrors the Custom TCP engine feature set but targets serial transport
 * (RS-232/RS-485) with baud rate, parity, and inter-frame timeout support.
 */
export class CustomSerialEngine extends AdapterBackedDriver<CustomSerialConfig, CustomSerialRuntime> {
  protected protocolId = "custom-serial";

  protected defaultConfig: CustomSerialConfig = {
    path: "COM1",
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    readTimeoutMs: 5000,
    responseTimeoutMs: 3000,
    defaultSendMode: "hex",
    interFrameTimeoutMs: 50
  };

  /** Active auto-send interval handle (null when not running). */
  private autoSendTimer: ReturnType<typeof setInterval> | null = null;

  // ─── Adapter factory ──────────────────────────────────────────────────

  /**
   * Build the protocol adapter that wires serial transport, read/write plans,
   * and frame encoding/decoding into the session kernel.
   *
   * @param config - Effective serial configuration
   * @returns ProtocolAdapter instance for the Custom Serial protocol
   */
  protected buildAdapter(config: CustomSerialConfig): ProtocolAdapter<CustomSerialRuntime, CustomSerialConfig> {
    const self = this;
    return {
      protocolId: this.protocolId,

      initializeRuntime: () => ({ autoSendTimer: null }),

      createTransport: (cfg) =>
        new SerialTransport({
          path: cfg.path,
          baudRate: cfg.baudRate,
          dataBits: cfg.dataBits,
          stopBits: cfg.stopBits,
          parity: cfg.parity
        }),

      createReadPlan: (request: ReadRequest, context) => {
        const timeoutMs = request.timeoutMs ?? context.config.responseTimeoutMs ?? 3000;
        return {
          id: `custom-serial-read-${Date.now()}`,
          type: "custom-serial-read",
          stages: [
            {
              id: "send-and-await",
              send: () => self.resolveSendData(request, context.config),
              expectResponse: true,
              matcher: () => true,
              timeoutMs
            }
          ],
          finalize: ({ responses }) => responses[0] ?? new Uint8Array()
        };
      },

      createWritePlan: (request: WriteRequest, context) => {
        return {
          id: `custom-serial-write-${Date.now()}`,
          type: "custom-serial-write",
          stages: [
            {
              id: "send-raw",
              send: () => self.resolveSendData(request, context.config),
              expectResponse: false
            }
          ],
          finalize: () => true
        };
      },

      decodeFrame: async (frame) => ({
        fields: {
          length: frame.length,
          hexDump: toHexDump(frame),
          raw: Array.from(frame)
        },
        isError: false
      }),

      encodeFrame: async (input) => {
        const buf = self.encodeInput(input, config.defaultSendMode ?? "raw");
        return new Uint8Array(buf);
      }
    };
  }

  // ─── Lifecycle overrides ──────────────────────────────────────────────

  /**
   * Clean up auto-send timer on disconnect.
   */
  async disconnect(sessionId: string): Promise<void> {
    this.stopAutoSend();
    await super.disconnect(sessionId);
  }

  /**
   * Clean up auto-send timer on destroy.
   */
  async onDestroy(): Promise<void> {
    this.stopAutoSend();
    await super.onDestroy();
  }

  // ─── Send mode encoding ───────────────────────────────────────────────

  /**
   * Encode an input value into a Buffer based on the send mode.
   *
   * Supported input shapes:
   * - `{ data: Uint8Array }` — raw passthrough (backward compatible)
   * - `{ hex: string }` — parse hex string
   * - `{ ascii: string }` — convert ASCII string
   * - `{ data: Uint8Array, mode: 'hex'|'ascii'|'raw' }` — explicit mode override
   *
   * @param input - The input payload
   * @param defaultMode - Fallback mode when not specified in input
   * @returns Encoded Buffer
   */
  encodeInput(input: unknown, defaultMode: SendMode = "raw"): Buffer {
    const frameInput = input as Record<string, unknown>;

    // Explicit hex string
    if (typeof frameInput.hex === "string") {
      return parseHexString(frameInput.hex);
    }

    // Explicit ASCII string
    if (typeof frameInput.ascii === "string") {
      return asciiToBuffer(frameInput.ascii);
    }

    // Data with optional mode override
    const mode = (frameInput.mode as SendMode) ?? defaultMode;
    const data = frameInput.data;

    if (data instanceof Uint8Array) {
      if (mode === "hex") {
        // Interpret the Uint8Array bytes as a hex string representation
        return Buffer.from(data);
      }
      if (mode === "ascii") {
        return Buffer.from(data);
      }
      // raw mode — direct passthrough
      return Buffer.from(data);
    }

    if (Array.isArray(data)) {
      return Buffer.from(data);
    }

    return Buffer.alloc(0);
  }

  /**
   * Resolve send data from a ReadRequest or WriteRequest.
   * Supports hex/ascii/raw modes via the `address` field or `data` field.
   *
   * @param request - The read or write request
   * @param config - Current serial configuration
   * @returns Buffer containing the encoded frame bytes
   */
  private resolveSendData(
    request: ReadRequest | WriteRequest,
    config: CustomSerialConfig
  ): Buffer {
    const req = request as unknown as Record<string, unknown>;
    const mode = (req.sendMode as SendMode) ?? config.defaultSendMode ?? "raw";

    // If address contains a hex string (common for custom protocols)
    if (typeof req.address === "string" && req.address.length > 0) {
      if (mode === "hex") {
        return parseHexString(req.address);
      }
      if (mode === "ascii") {
        return asciiToBuffer(req.address);
      }
    }

    // If data is provided as Uint8Array
    if (req.data instanceof Uint8Array) {
      return Buffer.from(req.data);
    }

    // If data is provided as array
    if (Array.isArray(req.data)) {
      return Buffer.from(req.data);
    }

    // Fallback: encode address as raw bytes
    if (typeof req.address === "string") {
      return Buffer.from(req.address, "utf-8");
    }

    return Buffer.alloc(0);
  }

  // ─── CRC-16 / Modbus ─────────────────────────────────────────────────

  /**
   * Calculate CRC-16/Modbus checksum over a data buffer.
   *
   * Uses the standard polynomial 0xA001 with a lookup table for performance.
   * The result is returned as a 2-byte Buffer in little-endian order
   * (low byte first), matching the Modbus RTU convention.
   *
   * @param data - Input data bytes
   * @returns 2-byte Buffer containing CRC-16 (little-endian)
   */
  calculateCRC16(data: Buffer): Buffer {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
      crc = (crc >> 8) ^ CRC16_TABLE[(crc ^ data[i]) & 0xff];
    }
    return Buffer.from([crc & 0xff, (crc >> 8) & 0xff]);
  }

  /**
   * Calculate LRC (Longitudinal Redundancy Check) over a data buffer.
   *
   * LRC is the two's complement of the XOR sum of all bytes.
   * Used in Modbus ASCII framing.
   *
   * @param data - Input data bytes
   * @returns LRC value as a single byte (0x00–0xFF)
   */
  calculateLRC(data: Buffer): number {
    let lrc = 0;
    for (let i = 0; i < data.length; i++) {
      lrc = (lrc + data[i]) & 0xff;
    }
    return (~lrc + 1) & 0xff;
  }

  /**
   * Convenience method: append CRC-16/Modbus to a data buffer.
   *
   * Returns a new Buffer with the original data followed by the 2-byte
   * CRC in little-endian order.
   *
   * @param data - Input data bytes
   * @returns New Buffer with CRC appended
   */
  appendCRC(data: Buffer): Buffer {
    const crc = this.calculateCRC16(data);
    return Buffer.concat([data, crc]);
  }

  /**
   * Convenience method: wrap data with LRC in Modbus ASCII frame format.
   *
   * Produces a frame in the format: `:data_lrc\r\n`
   * where `data` is the hex-encoded input and `lrc` is the hex-encoded LRC byte.
   *
   * @param data - Input data bytes (pre-LRC payload)
   * @returns Buffer containing the full ASCII-framed message
   */
  appendLRC(data: Buffer): Buffer {
    const lrc = this.calculateLRC(data);
    const hexData = data.toString("hex").toUpperCase();
    const hexLRC = lrc.toString(16).padStart(2, "0").toUpperCase();
    const frame = `:${hexData}${hexLRC}\r\n`;
    return Buffer.from(frame, "ascii");
  }

  // ─── Frame builder ────────────────────────────────────────────────────

  /**
   * Build a frame from a hex string with optional CRC or LRC appending.
   *
   * @param hexString - Hex string to parse (e.g. "01 03 00 00 00 0A")
   * @param options - Optional frame building options
   * @param options.appendCRC - If true, append CRC-16/Modbus (little-endian)
   * @param options.appendLRC - If true, wrap in Modbus ASCII frame with LRC
   * @returns Built frame Buffer
   *
   * @example
   * ```ts
   * const engine = new CustomSerialEngine();
   * const frame = engine.buildFrame("01 03 00 00 00 0A", { appendCRC: true });
   * // frame = [01, 03, 00, 00, 00, 0A, CRC_LO, CRC_HI]
   * ```
   */
  buildFrame(hexString: string, options?: { appendCRC?: boolean; appendLRC?: boolean }): Buffer {
    let buf = parseHexString(hexString);

    if (options?.appendCRC) {
      buf = this.appendCRC(buf);
    } else if (options?.appendLRC) {
      buf = this.appendLRC(buf);
    }

    return buf;
  }

  // ─── Frame decoder ────────────────────────────────────────────────────

  /**
   * Decode a received frame buffer into a human-readable representation.
   *
   * Returns an object with:
   * - `hexDump`: Space-separated hex string
   * - `length`: Byte count
   * - `ascii`: Printable ASCII representation (non-printable chars replaced with '.')
   *
   * @param buffer - Raw received bytes
   * @returns Decoded frame information
   */
  decodeReceivedFrame(buffer: Buffer): { hexDump: string; length: number; ascii: string } {
    const hexDump = toHexDump(buffer);
    const ascii = Array.from(buffer)
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "."))
      .join("");
    return { hexDump, length: buffer.length, ascii };
  }

  // ─── Auto-send (timed send) ───────────────────────────────────────────

  /**
   * Start automatic periodic frame sending at the specified interval.
   *
   * The frame is sent using the engine's `encodeFrame` method, so hex/ascii/raw
   * modes are supported. Only one auto-send can be active at a time; calling
   * this again will stop the previous auto-send first.
   *
   * @param intervalMs - Send interval in milliseconds (must be > 0)
   * @param frame - Frame content (hex string, ASCII string, or raw data)
   * @param mode - Send mode: 'hex', 'ascii', or 'raw'
   *
   * @example
   * ```ts
   * engine.startAutoSend(1000, "01 03 00 00 00 0A", "hex");
   * // Sends the hex frame every 1 second
   * ```
   */
  startAutoSend(intervalMs: number, frame: string, mode: SendMode = "hex"): void {
    this.stopAutoSend();

    if (intervalMs <= 0) {
      throw new Error("Auto-send interval must be greater than 0");
    }

    this.autoSendTimer = setInterval(() => {
      try {
        const input = mode === "hex"
          ? { hex: frame }
          : mode === "ascii"
            ? { ascii: frame }
            : { data: Buffer.from(frame, "utf-8") };

        // Fire-and-forget encode + send via kernel if connected
        void this.encodeFrame(input).then((encoded) => {
          // The kernel's write path handles actual sending
          // For auto-send we use the kernel directly if available
          if (this.kernel) {
            void this.kernel.write({
              address: "auto",
              data: encoded
            });
          }
        });
      } catch {
        // Silently ignore encoding errors during auto-send
      }
    }, intervalMs);
  }

  /**
   * Stop the active auto-send timer.
   *
   * Safe to call even when no auto-send is active (no-op).
   */
  stopAutoSend(): void {
    if (this.autoSendTimer) {
      clearInterval(this.autoSendTimer);
      this.autoSendTimer = null;
    }
  }

  /**
   * Check whether auto-send is currently active.
   *
   * @returns `true` if an auto-send timer is running
   */
  isAutoSending(): boolean {
    return this.autoSendTimer !== null;
  }
}

export default CustomSerialEngine;
