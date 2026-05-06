import type {
  HandshakePlan,
  ProtocolAdapter,
  SessionKernelContext
} from "../../packages/protocol-core";
import type {
  ReadRequest,
  WriteRequest,
  DecodedFrame
} from "../../packages/shared-types";
import { AdapterBackedDriver } from "../_shared/adapter-driver";
import {
  createRawTcpAdapter,
  type RawTcpConfig
} from "../_shared/raw-adapters";
import {
  buildIec104ControlFrame,
  getIec104ControlAckByte,
  buildUFrame,
  buildSFrame,
  buildIFrame,
  buildAPDU,
  parseAPDU,
  buildASDU,
  parseASDU,
  asduToDataPoints,
  buildCP56Time2a,
  parseCP56Time2a,
  U_FORMAT,
  TI,
  COT,
  type Iec104ControlAction,
  type Iec104DataPoint,
  type Iec104ASDU,
  type InfoObject,
  type ParsedAPDU
} from "./capabilities";

// ─── IEC 104 Configuration ───────────────────────────────────────────

/** Extended configuration for IEC 104 engine. */
export interface Iec104Config extends RawTcpConfig {
  /** Common address of ASDU (default: 1) */
  commonAddress?: number;
  /** Originator address (default: 0) */
  originatorAddress?: number;
  /** Maximum unacknowledged I-frames before sending S-frame (default: 10) */
  maxUnack?: number;
  /** Timeout t1: APDU timeout in ms (default: 15000) */
  t1Ms?: number;
  /** Timeout t2: S-frame timeout in ms (default: 10000) */
  t2Ms?: number;
  /** Timeout t3: Test frame timeout in ms (default: 20000) */
  t3Ms?: number;
}

// ─── IEC 104 Runtime State ───────────────────────────────────────────

/** Runtime state maintained across IEC 104 requests. */
export interface Iec104Runtime {
  /** Send sequence number (Tx) */
  tx: number;
  /** Receive sequence number (Rx) */
  rx: number;
  /** Number of unacknowledged received I-frames */
  unackRx: number;
  /** Whether STARTDT has been activated */
  started: boolean;
}

// ─── IEC 104 Engine ──────────────────────────────────────────────────

/**
 * IEC 60870-5-104 Protocol Engine.
 *
 * Implements a functional IEC 104 client over TCP transport.
 * Supports APDU frame building/parsing (I/S/U formats), ASDU encoding/decoding
 * for all standard Type Identifications, General Interrogation, Counter Interrogation,
 * Clock Synchronization, and command sending (single/double/setpoint).
 *
 * @example
 * ```ts
 * const engine = new Iec104Engine();
 * await engine.onInit({ host: "127.0.0.1", port: 2404 });
 * await engine.connect("session-1");
 *
 * // Perform General Interrogation
 * const points = await engine.generalInterrogation("session-1");
 *
 * // Send a single command
 * await engine.sendSingleCommand("session-1", 100, true);
 *
 * await engine.disconnect("session-1");
 * ```
 */
export class Iec104Engine extends AdapterBackedDriver<Iec104Config, Iec104Runtime> {
  protected protocolId = "iec104";
  protected defaultConfig: Iec104Config = {
    host: "127.0.0.1",
    port: 2404,
    connectTimeoutMs: 5000,
    readTimeoutMs: 15000,
    commonAddress: 1,
    originatorAddress: 0,
    maxUnack: 10,
    t1Ms: 15000,
    t2Ms: 10000,
    t3Ms: 20000
  };

  /**
   * Build the IEC 104 protocol adapter with handshake, read/write plans,
   * and capability plans for GI, counter interrogation, clock sync, and commands.
   */
  protected buildAdapter(_config: Iec104Config): ProtocolAdapter<Iec104Runtime, Iec104Config> {
    const baseAdapter = createRawTcpAdapter<Iec104Runtime>(
      this.protocolId,
      (frame) => decodeIec104FrameFields(frame),
      (context) => createIec104Handshake(context)
    );

    return {
      ...baseAdapter,

      /** Initialize IEC 104 runtime with sequence counters and state. */
      initializeRuntime: () => ({
        tx: 0,
        rx: 0,
        unackRx: 0,
        started: false
      }),

      /** IEC 104-specific read plan: sends S-frame ack and waits for next I-frame. */
      createReadPlan: (request, context) => {
        const timeoutMs = request.timeoutMs ?? context.config.readTimeoutMs ?? 15000;
        return {
          id: `iec104-read-${Date.now()}`,
          type: "iec104-read",
          stages: [
            {
              id: "await-i-frame",
              expectResponse: true,
              matcher: (frame) => {
                try {
                  const apdu = parseAPDU(frame);
                  return apdu.type === "I";
                } catch {
                  return false;
                }
              },
              timeoutMs
            }
          ],
          finalize: ({ responses }) => responses[0] ?? new Uint8Array()
        };
      },

      /** IEC 104-specific write plan: sends raw bytes as I-frame. */
      createWritePlan: (request, context) => {
        const tx = context.runtime.tx++;
        const rx = context.runtime.rx;
        const asdu = request.data;
        return {
          id: `iec104-write-${Date.now()}`,
          type: "iec104-write",
          stages: [
            {
              id: "send-i-frame",
              send: () => buildIFrame(tx, rx, asdu),
              expectResponse: true,
              matcher: (frame) => {
                try {
                  const apdu = parseAPDU(frame);
                  return apdu.type === "I" || apdu.type === "S";
                } catch {
                  return false;
                }
              },
              timeoutMs: context.config.t1Ms ?? 15000
            }
          ],
          finalize: () => true
        };
      },

      /**
       * IEC 104 capability plan factory.
       * Supports: startdt-act, stopdt-act, testfr-act,
       * general-interrogation, counter-interrogation, clock-sync,
       * single-command, double-command, setpoint-norm, setpoint-float.
       */
      createCapabilityPlan: (action, payload, context) => {
        const capAction = action.replace("iec104:", "");

        // ── Legacy U-frame control actions ───────────────────────────
        if (["startdt-act", "stopdt-act", "testfr-act"].includes(capAction)) {
          const controlAction = capAction as Iec104ControlAction;
          return {
            id: `${action}-${Date.now()}`,
            type: action,
            stages: [
              {
                id: controlAction,
                send: () => buildIec104ControlFrame(controlAction),
                expectResponse: true,
                matcher: (frame) => {
                  try {
                    const apdu = parseAPDU(frame);
                    return apdu.type === "U" && apdu.uFunction === getIec104ControlAckByte(controlAction);
                  } catch {
                    return false;
                  }
                },
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => responses[0] ?? new Uint8Array()
          };
        }

        // ── General Interrogation ────────────────────────────────────
        if (capAction === "general-interrogation") {
          return this.buildGiPlan(context, payload);
        }

        // ── Counter Interrogation ────────────────────────────────────
        if (capAction === "counter-interrogation") {
          return this.buildCiPlan(context, payload);
        }

        // ── Clock Synchronization ────────────────────────────────────
        if (capAction === "clock-sync") {
          return this.buildClockSyncPlan(context);
        }

        // ── Single Command ───────────────────────────────────────────
        if (capAction === "single-command") {
          return this.buildSingleCommandPlan(context, payload);
        }

        // ── Double Command ───────────────────────────────────────────
        if (capAction === "double-command") {
          return this.buildDoubleCommandPlan(context, payload);
        }

        // ── Setpoint Normalized ──────────────────────────────────────
        if (capAction === "setpoint-norm") {
          return this.buildSetpointNormPlan(context, payload);
        }

        // ── Setpoint Short Float ─────────────────────────────────────
        if (capAction === "setpoint-float") {
          return this.buildSetpointFloatPlan(context, payload);
        }

        throw new Error(`Unsupported IEC104 capability: ${action}`);
      }
    };
  }

  // ─── Capability Plan Builders ──────────────────────────────────────

  /**
   * Build a General Interrogation (GI) capability plan.
   * Sends C_IC_NA_1 (TI=100) with QOI=20 (station interrogation).
   * Collects all response I-frames until activation termination (COT=8).
   */
  private buildGiPlan(
    context: SessionKernelContext<Iec104Runtime, Iec104Config>,
    payload: unknown
  ) {
    const commonAddr = (payload as { commonAddress?: number })?.commonAddress
      ?? context.config.commonAddress ?? 1;
    const tx = context.runtime.tx++;
    const rx = context.runtime.rx;

    const asdu = buildASDU(
      TI.C_IC_NA_1,
      COT.ACTIVATION,
      commonAddr,
      [{ ioa: 0, value: 20 }] // QOI=20: station interrogation
    );

    const collectedPoints: Iec104DataPoint[] = [];

    return {
      id: `iec104-gi-${Date.now()}`,
      type: "iec104:general-interrogation",
      stages: [
        {
          id: "gi-activation",
          send: () => buildIFrame(tx, rx, asdu),
          expectResponse: true,
          matcher: (frame: Uint8Array) => {
            try {
              const apdu = parseAPDU(frame);
              if (apdu.type !== "I" || !apdu.asdu) return false;
              const parsed = parseASDU(apdu.asdu);
              // Accept activation confirmation (COT=7) or data responses (COT=20)
              return parsed.ti === TI.C_IC_NA_1 && parsed.cot === COT.ACTIVATION_CONFIRMATION;
            } catch {
              return false;
            }
          },
          timeoutMs: context.config.t1Ms ?? 15000
        },
        {
          id: "gi-data",
          expectResponse: true,
          matcher: (frame: Uint8Array) => {
            try {
              const apdu = parseAPDU(frame);
              if (apdu.type !== "I" || !apdu.asdu) return false;
              const parsed = parseASDU(apdu.asdu);
              // Collect GI data (COT=20) or activation termination (COT=8)
              if (parsed.cot === COT.INTERROGATED_BY_GENERAL) {
                collectedPoints.push(...asduToDataPoints(parsed));
                return false; // keep collecting
              }
              if (parsed.ti === TI.C_IC_NA_1 && parsed.cot === COT.ACTIVATION_TERMINATION) {
                return true; // GI complete
              }
              return false;
            } catch {
              return false;
            }
          },
          timeoutMs: context.config.t1Ms ?? 15000
        }
      ],
      finalize: () => collectedPoints
    };
  }

  /**
   * Build a Counter Interrogation capability plan.
   * Sends C_CI_NA_1 (TI=101) with QCC=5 (general counter request).
   */
  private buildCiPlan(
    context: SessionKernelContext<Iec104Runtime, Iec104Config>,
    payload: unknown
  ) {
    const commonAddr = (payload as { commonAddress?: number })?.commonAddress
      ?? context.config.commonAddress ?? 1;
    const tx = context.runtime.tx++;
    const rx = context.runtime.rx;

    const asdu = buildASDU(
      TI.C_CI_NA_1,
      COT.ACTIVATION,
      commonAddr,
      [{ ioa: 0, value: 5 }] // QCC=5: general counter request
    );

    const collectedPoints: Iec104DataPoint[] = [];

    return {
      id: `iec104-ci-${Date.now()}`,
      type: "iec104:counter-interrogation",
      stages: [
        {
          id: "ci-activation",
          send: () => buildIFrame(tx, rx, asdu),
          expectResponse: true,
          matcher: (frame: Uint8Array) => {
            try {
              const apdu = parseAPDU(frame);
              if (apdu.type !== "I" || !apdu.asdu) return false;
              const parsed = parseASDU(apdu.asdu);
              return parsed.ti === TI.C_CI_NA_1 && parsed.cot === COT.ACTIVATION_CONFIRMATION;
            } catch {
              return false;
            }
          },
          timeoutMs: context.config.t1Ms ?? 15000
        },
        {
          id: "ci-data",
          expectResponse: true,
          matcher: (frame: Uint8Array) => {
            try {
              const apdu = parseAPDU(frame);
              if (apdu.type !== "I" || !apdu.asdu) return false;
              const parsed = parseASDU(apdu.asdu);
              if (parsed.cot === COT.INTERROGATED_BY_STATION) {
                collectedPoints.push(...asduToDataPoints(parsed));
                return false;
              }
              if (parsed.ti === TI.C_CI_NA_1 && parsed.cot === COT.ACTIVATION_TERMINATION) {
                return true;
              }
              return false;
            } catch {
              return false;
            }
          },
          timeoutMs: context.config.t1Ms ?? 15000
        }
      ],
      finalize: () => collectedPoints
    };
  }

  /**
   * Build a Clock Synchronization capability plan.
   * Sends C_CS_NA_1 (TI=103) with current time.
   */
  private buildClockSyncPlan(
    context: SessionKernelContext<Iec104Runtime, Iec104Config>
  ) {
    const commonAddr = context.config.commonAddress ?? 1;
    const tx = context.runtime.tx++;
    const rx = context.runtime.rx;

    const asdu = buildASDU(
      TI.C_CS_NA_1,
      COT.ACTIVATION,
      commonAddr,
      [{ ioa: 0, value: 0, timestamp: new Date() }]
    );

    return {
      id: `iec104-clock-sync-${Date.now()}`,
      type: "iec104:clock-sync",
      stages: [
        {
          id: "clock-sync",
          send: () => buildIFrame(tx, rx, asdu),
          expectResponse: true,
          matcher: (frame: Uint8Array) => {
            try {
              const apdu = parseAPDU(frame);
              if (apdu.type !== "I" || !apdu.asdu) return false;
              const parsed = parseASDU(apdu.asdu);
              return parsed.ti === TI.C_CS_NA_1 && parsed.cot === COT.ACTIVATION_CONFIRMATION;
            } catch {
              return false;
            }
          },
          timeoutMs: context.config.t1Ms ?? 15000
        }
      ],
      finalize: () => undefined
    };
  }

  /**
   * Build a Single Command capability plan.
   * Sends C_SC_NA_1 (TI=45).
   */
  private buildSingleCommandPlan(
    context: SessionKernelContext<Iec104Runtime, Iec104Config>,
    payload: unknown
  ) {
    const params = payload as { ioa: number; value: boolean; select?: boolean; commonAddress?: number };
    const commonAddr = params.commonAddress ?? context.config.commonAddress ?? 1;
    const tx = context.runtime.tx++;
    const rx = context.runtime.rx;
    const dco = (params.value ? 0x01 : 0x00) | (params.select ? 0x80 : 0x00);

    const asdu = buildASDU(
      TI.C_SC_NA_1,
      COT.ACTIVATION,
      commonAddr,
      [{ ioa: params.ioa, value: dco }]
    );

    return {
      id: `iec104-sc-${Date.now()}`,
      type: "iec104:single-command",
      stages: [
        {
          id: "single-command",
          send: () => buildIFrame(tx, rx, asdu),
          expectResponse: true,
          matcher: (frame: Uint8Array) => {
            try {
              const apdu = parseAPDU(frame);
              if (apdu.type !== "I" || !apdu.asdu) return false;
              const parsed = parseASDU(apdu.asdu);
              return parsed.ti === TI.C_SC_NA_1 &&
                (parsed.cot === COT.ACTIVATION_CONFIRMATION || parsed.cot === COT.ACTIVATION_TERMINATION);
            } catch {
              return false;
            }
          },
          timeoutMs: context.config.t1Ms ?? 15000
        }
      ],
      finalize: ({ responses }: { responses: Uint8Array[] }) => {
        if (responses[0]) {
          const apdu = parseAPDU(responses[0]);
          if (apdu.asdu) {
            const parsed = parseASDU(apdu.asdu);
            return { success: !parsed.pn, asdu: parsed };
          }
        }
        return { success: false };
      }
    };
  }

  /**
   * Build a Double Command capability plan.
   * Sends C_DC_NA_1 (TI=46).
   */
  private buildDoubleCommandPlan(
    context: SessionKernelContext<Iec104Runtime, Iec104Config>,
    payload: unknown
  ) {
    const params = payload as { ioa: number; value: number; select?: boolean; commonAddress?: number };
    const commonAddr = params.commonAddress ?? context.config.commonAddress ?? 1;
    const tx = context.runtime.tx++;
    const rx = context.runtime.rx;
    const dco = (params.value & 0x03) | (params.select ? 0x80 : 0x00);

    const asdu = buildASDU(
      TI.C_DC_NA_1,
      COT.ACTIVATION,
      commonAddr,
      [{ ioa: params.ioa, value: dco }]
    );

    return {
      id: `iec104-dc-${Date.now()}`,
      type: "iec104:double-command",
      stages: [
        {
          id: "double-command",
          send: () => buildIFrame(tx, rx, asdu),
          expectResponse: true,
          matcher: (frame: Uint8Array) => {
            try {
              const apdu = parseAPDU(frame);
              if (apdu.type !== "I" || !apdu.asdu) return false;
              const parsed = parseASDU(apdu.asdu);
              return parsed.ti === TI.C_DC_NA_1 &&
                (parsed.cot === COT.ACTIVATION_CONFIRMATION || parsed.cot === COT.ACTIVATION_TERMINATION);
            } catch {
              return false;
            }
          },
          timeoutMs: context.config.t1Ms ?? 15000
        }
      ],
      finalize: ({ responses }: { responses: Uint8Array[] }) => {
        if (responses[0]) {
          const apdu = parseAPDU(responses[0]);
          if (apdu.asdu) {
            const parsed = parseASDU(apdu.asdu);
            return { success: !parsed.pn, asdu: parsed };
          }
        }
        return { success: false };
      }
    };
  }

  /**
   * Build a Setpoint Normalized capability plan.
   * Sends C_SE_NA_1 (TI=48).
   */
  private buildSetpointNormPlan(
    context: SessionKernelContext<Iec104Runtime, Iec104Config>,
    payload: unknown
  ) {
    const params = payload as { ioa: number; value: number; select?: boolean; commonAddress?: number };
    const commonAddr = params.commonAddress ?? context.config.commonAddress ?? 1;
    const tx = context.runtime.tx++;
    const rx = context.runtime.rx;
    const qos = params.select ? 0x80 : 0x00; // QOS: select/execute

    const asdu = buildASDU(
      TI.C_SE_NA_1,
      COT.ACTIVATION,
      commonAddr,
      [{ ioa: params.ioa, value: params.value, quality: qos }]
    );

    return {
      id: `iec104-se-norm-${Date.now()}`,
      type: "iec104:setpoint-norm",
      stages: [
        {
          id: "setpoint-norm",
          send: () => buildIFrame(tx, rx, asdu),
          expectResponse: true,
          matcher: (frame: Uint8Array) => {
            try {
              const apdu = parseAPDU(frame);
              if (apdu.type !== "I" || !apdu.asdu) return false;
              const parsed = parseASDU(apdu.asdu);
              return parsed.ti === TI.C_SE_NA_1 &&
                (parsed.cot === COT.ACTIVATION_CONFIRMATION || parsed.cot === COT.ACTIVATION_TERMINATION);
            } catch {
              return false;
            }
          },
          timeoutMs: context.config.t1Ms ?? 15000
        }
      ],
      finalize: ({ responses }: { responses: Uint8Array[] }) => {
        if (responses[0]) {
          const apdu = parseAPDU(responses[0]);
          if (apdu.asdu) {
            const parsed = parseASDU(apdu.asdu);
            return { success: !parsed.pn, asdu: parsed };
          }
        }
        return { success: false };
      }
    };
  }

  /**
   * Build a Setpoint Short Float capability plan.
   * Sends C_SE_NC_1 (TI=50).
   */
  private buildSetpointFloatPlan(
    context: SessionKernelContext<Iec104Runtime, Iec104Config>,
    payload: unknown
  ) {
    const params = payload as { ioa: number; value: number; select?: boolean; commonAddress?: number };
    const commonAddr = params.commonAddress ?? context.config.commonAddress ?? 1;
    const tx = context.runtime.tx++;
    const rx = context.runtime.rx;
    const qos = params.select ? 0x80 : 0x00;

    const asdu = buildASDU(
      TI.C_SE_NC_1,
      COT.ACTIVATION,
      commonAddr,
      [{ ioa: params.ioa, value: params.value, quality: qos }]
    );

    return {
      id: `iec104-se-float-${Date.now()}`,
      type: "iec104:setpoint-float",
      stages: [
        {
          id: "setpoint-float",
          send: () => buildIFrame(tx, rx, asdu),
          expectResponse: true,
          matcher: (frame: Uint8Array) => {
            try {
              const apdu = parseAPDU(frame);
              if (apdu.type !== "I" || !apdu.asdu) return false;
              const parsed = parseASDU(apdu.asdu);
              return parsed.ti === TI.C_SE_NC_1 &&
                (parsed.cot === COT.ACTIVATION_CONFIRMATION || parsed.cot === COT.ACTIVATION_TERMINATION);
            } catch {
              return false;
            }
          },
          timeoutMs: context.config.t1Ms ?? 15000
        }
      ],
      finalize: ({ responses }: { responses: Uint8Array[] }) => {
        if (responses[0]) {
          const apdu = parseAPDU(responses[0]);
          if (apdu.asdu) {
            const parsed = parseASDU(apdu.asdu);
            return { success: !parsed.pn, asdu: parsed };
          }
        }
        return { success: false };
      }
    };
  }

  // ─── Convenience Methods (delegate to invokeCapability) ────────────

  /**
   * Perform a General Interrogation (station interrogation).
   * Sends C_IC_NA_1 with QOI=20 and collects all returned data points.
   * @param sessionId - Active session ID
   * @param commonAddr - Common address (default: from config)
   * @returns Array of data points received during GI
   */
  async generalInterrogation(sessionId: string, commonAddr?: number): Promise<Iec104DataPoint[]> {
    return this.invokeCapability(sessionId, "iec104:general-interrogation", {
      commonAddress: commonAddr
    }) as Promise<Iec104DataPoint[]>;
  }

  /**
   * Perform a Counter Interrogation.
   * Sends C_CI_NA_1 with QCC=5 and collects all returned counter values.
   * @param sessionId - Active session ID
   * @param commonAddr - Common address (default: from config)
   * @returns Array of counter data points
   */
  async counterInterrogation(sessionId: string, commonAddr?: number): Promise<Iec104DataPoint[]> {
    return this.invokeCapability(sessionId, "iec104:counter-interrogation", {
      commonAddress: commonAddr
    }) as Promise<Iec104DataPoint[]>;
  }

  /**
   * Synchronize the remote station clock.
   * Sends C_CS_NA_1 with the current local time.
   * @param sessionId - Active session ID
   * @param commonAddr - Common address (default: from config)
   */
  async clockSync(sessionId: string, commonAddr?: number): Promise<void> {
    await this.invokeCapability(sessionId, "iec104:clock-sync", {
      commonAddress: commonAddr
    });
  }

  /**
   * Send a Single Command (C_SC_NA_1).
   * @param sessionId - Active session ID
   * @param ioa - Information Object Address
   * @param value - Command value (true=ON, false=OFF)
   * @param select - If true, send as select (SBO); if false, send as execute
   * @param commonAddr - Common address (default: from config)
   */
  async sendSingleCommand(
    sessionId: string,
    ioa: number,
    value: boolean,
    select?: boolean,
    commonAddr?: number
  ): Promise<void> {
    await this.invokeCapability(sessionId, "iec104:single-command", {
      ioa, value, select, commonAddress: commonAddr
    });
  }

  /**
   * Send a Double Command (C_DC_NA_1).
   * @param sessionId - Active session ID
   * @param ioa - Information Object Address
   * @param value - Command value (1=ON, 2=OFF, 0=not allowed)
   * @param select - If true, send as select (SBO); if false, send as execute
   * @param commonAddr - Common address (default: from config)
   */
  async sendDoubleCommand(
    sessionId: string,
    ioa: number,
    value: number,
    select?: boolean,
    commonAddr?: number
  ): Promise<void> {
    await this.invokeCapability(sessionId, "iec104:double-command", {
      ioa, value, select, commonAddress: commonAddr
    });
  }

  /**
   * Send a Set-point Command, Normalized (C_SE_NA_1).
   * @param sessionId - Active session ID
   * @param ioa - Information Object Address
   * @param value - Normalized value (-1.0 to 1.0)
   * @param select - If true, send as select; if false, send as execute
   * @param commonAddr - Common address (default: from config)
   */
  async sendSetpointNormalized(
    sessionId: string,
    ioa: number,
    value: number,
    select?: boolean,
    commonAddr?: number
  ): Promise<void> {
    await this.invokeCapability(sessionId, "iec104:setpoint-norm", {
      ioa, value, select, commonAddress: commonAddr
    });
  }

  /**
   * Send a Set-point Command, Short Floating Point (C_SE_NC_1).
   * @param sessionId - Active session ID
   * @param ioa - Information Object Address
   * @param value - IEEE 754 float value
   * @param select - If true, send as select; if false, send as execute
   * @param commonAddr - Common address (default: from config)
   */
  async sendSetpointShortFloat(
    sessionId: string,
    ioa: number,
    value: number,
    select?: boolean,
    commonAddr?: number
  ): Promise<void> {
    await this.invokeCapability(sessionId, "iec104:setpoint-float", {
      ioa, value, select, commonAddress: commonAddr
    });
  }
}

// ─── IEC 104 Handshake ───────────────────────────────────────────────

/**
 * Create the IEC 104 connection handshake plan.
 * Sends STARTDT act and waits for STARTDT con.
 */
function createIec104Handshake(
  _context: SessionKernelContext<Iec104Runtime, Iec104Config>
): HandshakePlan<Iec104Runtime> {
  return {
    id: "iec104-startdt",
    stages: [
      {
        id: "startdt-act",
        send: () => buildUFrame(U_FORMAT.STARTDT_ACT),
        expectResponse: true,
        matcher: (frame) => {
          try {
            const apdu = parseAPDU(frame);
            return apdu.type === "U" && apdu.uFunction === U_FORMAT.STARTDT_CON;
          } catch {
            return false;
          }
        },
        timeoutMs: 5000,
        onResponse: (_frame, ctx) => {
          ctx.runtime.started = true;
        }
      }
    ]
  };
}

// ─── Frame Field Decoder ─────────────────────────────────────────────

/**
 * Decode IEC 104 APDU frame into human-readable fields for traffic display.
 * @param frame - Raw APDU bytes
 * @returns Decoded fields object
 */
function decodeIec104FrameFields(frame: Uint8Array): Record<string, unknown> {
  try {
    const apdu = parseAPDU(frame);
    const fields: Record<string, unknown> = {
      startByte: frame[0],
      apduLength: frame[1],
      frameType: apdu.type,
      controlFieldHex: Array.from(apdu.controlField)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")
    };

    if (apdu.type === "I") {
      fields.tx = apdu.tx;
      fields.rx = apdu.rx;
      if (apdu.asdu && apdu.asdu.length > 0) {
        try {
          const asdu = parseASDU(apdu.asdu);
          fields.ti = asdu.ti;
          fields.tiName = asdu.tiName;
          fields.cot = asdu.cot;
          fields.cotName = asdu.cotName;
          fields.commonAddress = asdu.commonAddress;
          fields.numObjects = asdu.numObjects;
          fields.objects = asdu.objects.map((obj) => ({
            ioa: obj.ioa,
            value: obj.value,
            quality: obj.quality,
            timestamp: obj.timestamp?.toISOString()
          }));
        } catch {
          fields.asduHex = Array.from(apdu.asdu)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ");
        }
      }
    } else if (apdu.type === "S") {
      fields.rx = apdu.rx;
    } else if (apdu.type === "U") {
      fields.uFunction = apdu.uFunction;
      fields.uFunctionName = getUFunctionName(apdu.uFunction);
    }

    fields.previewHex = Array.from(frame.slice(0, 20))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");

    return fields;
  } catch {
    return {
      length: frame.length,
      startByte: frame[0],
      apduLength: frame[1],
      previewHex: Array.from(frame.slice(0, 20))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")
    };
  }
}

/**
 * Get human-readable name for a U-format function code.
 */
function getUFunctionName(code: number | undefined): string {
  switch (code) {
    case U_FORMAT.STARTDT_ACT: return "STARTDT act";
    case U_FORMAT.STARTDT_CON: return "STARTDT con";
    case U_FORMAT.STOPDT_ACT: return "STOPDT act";
    case U_FORMAT.STOPDT_CON: return "STOPDT con";
    case U_FORMAT.TESTFR_ACT: return "TESTFR act";
    case U_FORMAT.TESTFR_CON: return "TESTFR con";
    default: return `Unknown (0x${(code ?? 0).toString(16)})`;
  }
}
