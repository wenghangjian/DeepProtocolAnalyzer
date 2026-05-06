/**
 * IEC 61850 MMS (Manufacturing Message Specification) Protocol Engine
 *
 * Implements a functional IEC 61850 client engine using MMS (ISO 9506) over TCP.
 * Supports the core MMS services used in power utility automation:
 * - GetNameList: Browse available domains and variables
 * - Read: Read variable values with optional component specification
 * - Write: Write variable values
 * - GetVariableAccessAttributes: Get variable type information
 * - DefineNamedVariable: Create named variables
 * - DeleteNamedVariableAccess: Delete named variables
 * - Identify: Get server identification
 * - Conclude: Clean session teardown
 *
 * Transport stack: TCP → TPKT (RFC 1006) → COTP (ISO 8073) → MMS (ISO 9506)
 *
 * @example
 * ```ts
 * const engine = new Iec61850Engine();
 * await engine.onInit({ host: "127.0.0.1", port: 102 });
 * await engine.connect("session-1");
 *
 * // Browse available domains
 * const domains = await engine.invokeCapability("session-1", "iec61850:getServerDirectory");
 *
 * // Read a measurement value
 * const value = await engine.invokeCapability("session-1", "iec61850:read", {
 *   reference: "TEMPLATE/MMXU1.PhV.phsA.mag.f"
 * });
 *
 * await engine.disconnect("session-1");
 * ```
 */

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
  buildConnectionRequestPacket,
  buildInitiateRequestPacket,
  buildConcludeRequestPacket,
  buildDisconnectRequestPacket,
  buildMmsPacket,
  buildGetNameListRequest,
  buildReadRequest,
  buildWriteRequest,
  buildGetVariableAccessAttributesRequest,
  buildDefineNamedVariableRequest,
  buildDeleteNamedVariableAccessRequest,
  buildIdentifyRequest,
  parseCotpConnectionConfirm,
  parseTpktHeader,
  parseCotpData,
  parseMmsInitiateResponse,
  parseMmsConfirmedResponse,
  parseMmsConfirmedError,
  parseMmsReject,
  parseGetNameListResponse,
  parseReadResponse,
  parseWriteResponse,
  parseGetVariableAccessAttributesResponse,
  parseIdentifyResponse,
  extractMmsPduFromPacket,
  getMmsPduType,
  getTpktPacketLength,
  parseIec61850Reference,
  buildMmsVariableName,
  buildMmsVariableWithComponents,
  extractNumericValue,
  extractBooleanValue,
  extractTimestamp,
  formatMmsValue,
  decodeIec61850FrameFields,
  MmsPduType,
  MmsObjectClass,
  MmsObjectScope,
  MmsDataType,
  FunctionalConstraint,
  LogicalNodeClass,
  type MmsValue,
  type MmsTypeDescription,
  type MmsInitiateResponse,
  type GetNameListResponse,
  type MmsReadResponse,
  type MmsWriteResponse,
  type GetVarAccessAttrResponse,
  type MmsIdentifyResponse,
  type Iec61850Reference,
  mmsBoolean,
  mmsInteger,
  mmsUnsigned,
  mmsFloat32,
  mmsFloat64,
  mmsVisibleString,
  mmsOctetString,
  mmsBitString,
  mmsBinaryTime,
  mmsStructure,
  mmsArray
} from "./capabilities";

// ─── IEC 61850 Configuration ─────────────────────────────────────────

/** Extended configuration for IEC 61850 MMS engine. */
export interface Iec61850Config extends RawTcpConfig {
  /** COTP calling TSAP (default: [0x00, 0x01]) */
  callingTsap?: Uint8Array;
  /** COTP called TSAP (default: [0x00, 0x01]) */
  calledTsap?: Uint8Array;
  /** MMS initiate timeout in ms (default: 10000) */
  initiateTimeoutMs?: number;
}

// ─── IEC 61850 Runtime State ─────────────────────────────────────────

/** Runtime state maintained across IEC 61850 MMS requests. */
interface Iec61850Runtime {
  /** Monotonically increasing invoke ID for confirmed requests. */
  invokeId: number;
  /** Whether the MMS session has been initiated. */
  sessionInitialized: boolean;
  /** Server identification from Identify response. */
  serverIdentity?: MmsIdentifyResponse;
  /** Negotiated MMS parameters from Initiate response. */
  initiateResponse?: MmsInitiateResponse;
}

// ─── IEC 61850 Engine ────────────────────────────────────────────────

/**
 * IEC 61850 MMS Protocol Engine.
 *
 * Implements a functional IEC 61850 client over TCP transport using
 * MMS (Manufacturing Message Specification, ISO 9506).
 *
 * The transport stack is: TCP → TPKT (RFC 1006) → COTP (ISO 8073) → MMS
 *
 * Supports the following capability actions via `invokeCapability`:
 * - `iec61850:getServerDirectory` — List all logical devices
 * - `iec61850:getLogicalDeviceDirectory` — List logical nodes in a device
 * - `iec61850:getLogicalNodeDirectory` — List data objects in a node
 * - `iec61850:getDataDirectory` — List data attributes of an object
 * - `iec61850:read` — Read variable values
 * - `iec61850:write` — Write variable values
 * - `iec61850:getDataDefinition` — Get type information for a variable
 * - `iec61850:identify` — Get server identification
 * - `iec61850:defineNamedVariable` — Create a named variable
 * - `iec61850:deleteNamedVariable` — Delete a named variable
 */
export class Iec61850Engine extends AdapterBackedDriver<Iec61850Config, Iec61850Runtime> {
  protected protocolId = "iec61850";
  protected defaultConfig: Iec61850Config = {
    host: "127.0.0.1",
    port: 102,
    connectTimeoutMs: 5000,
    readTimeoutMs: 5000
  };

  /**
   * Build the IEC 61850 MMS protocol adapter with handshake, read/write plans,
   * and capability plans for GetNameList, Read, Write, and other MMS services.
   */
  protected buildAdapter(_config: Iec61850Config): ProtocolAdapter<Iec61850Runtime, Iec61850Config> {
    const baseAdapter = createRawTcpAdapter<Iec61850Runtime>(
      this.protocolId,
      (frame) => decodeIec61850FrameFields(frame)
    );

    return {
      ...baseAdapter,

      /** Initialize IEC 61850 runtime with invoke counter and session state. */
      initializeRuntime: () => ({
        invokeId: 1,
        sessionInitialized: false
      }),

      /** IEC 61850 connection handshake: COTP CR → CC, then MMS Initiate → Initiate Response. */
      getHandshakePlan: (context) => createIec61850Handshake(context),

      /** IEC 61850-specific read plan: sends a Read request and parses the Read response. */
      createReadPlan: (request, context) => {
        const invokeId = context.runtime.invokeId++;
        const variables = parseReadRequestAddresses(request);

        return {
          id: `iec61850-read-${invokeId}`,
          type: "iec61850-read",
          stages: [
            {
              id: "read-request",
              send: () => {
                const mmsPdu = buildReadRequest({ invokeId, variables });
                return buildMmsPacket(mmsPdu);
              },
              expectResponse: true,
              matcher: (frame) => matchMmsResponse(frame),
              timeoutMs: context.config.readTimeoutMs ?? 5000
            }
          ],
          finalize: ({ responses }) => responses[0] ?? new Uint8Array()
        };
      },

      /** IEC 61850-specific write plan: sends a Write request and parses the Write response. */
      createWritePlan: (request, context) => {
        const invokeId = context.runtime.invokeId++;
        const { variables, values } = parseWriteRequestData(request);

        return {
          id: `iec61850-write-${invokeId}`,
          type: "iec61850-write",
          stages: [
            {
              id: "write-request",
              send: () => {
                const mmsPdu = buildWriteRequest({ invokeId, variables, values });
                return buildMmsPacket(mmsPdu);
              },
              expectResponse: true,
              matcher: (frame) => matchMmsResponse(frame),
              timeoutMs: context.config.readTimeoutMs ?? 5000
            }
          ],
          finalize: () => true
        };
      },

      /**
       * IEC 61850 capability plan factory.
       * Supports: getServerDirectory, getLogicalDeviceDirectory, getLogicalNodeDirectory,
       * getDataDirectory, read, write, getDataDefinition, identify,
       * defineNamedVariable, deleteNamedVariable.
       */
      createCapabilityPlan: (action, payload, context) => {
        // ── Get Server Directory (list domains) ─────────────────────
        if (action === "iec61850:getServerDirectory") {
          const invokeId = context.runtime.invokeId++;
          return {
            id: `iec61850-getServerDir-${invokeId}`,
            type: action,
            stages: [
              {
                id: "getServerDirectory-request",
                send: () => {
                  const mmsPdu = buildGetNameListRequest({
                    objectClass: MmsObjectClass.Domain,
                    objectScope: { type: MmsObjectScope.VMDSpecific }
                  });
                  return buildMmsPacket(mmsPdu);
                },
                expectResponse: true,
                matcher: (frame) => matchMmsResponse(frame),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return [];
              const mmsData = extractMmsPduFromPacket(frame);
              if (!mmsData) return [];
              try {
                const result = parseGetNameListResponse(mmsData);
                return result.identifiers;
              } catch {
                return [];
              }
            }
          };
        }

        // ── Get Logical Device Directory (list LNs in a domain) ────
        if (action === "iec61850:getLogicalDeviceDirectory") {
          const p = payload as { ldName?: string } | undefined;
          if (!p?.ldName) throw new Error("getLogicalDeviceDirectory requires ldName");
          const invokeId = context.runtime.invokeId++;
          return {
            id: `iec61850-getLDDir-${invokeId}`,
            type: action,
            stages: [
              {
                id: "getLogicalDeviceDirectory-request",
                send: () => {
                  const mmsPdu = buildGetNameListRequest({
                    objectClass: MmsObjectClass.NamedVariable,
                    objectScope: { type: MmsObjectScope.DomainSpecific, value: p.ldName }
                  });
                  return buildMmsPacket(mmsPdu);
                },
                expectResponse: true,
                matcher: (frame) => matchMmsResponse(frame),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return [];
              const mmsData = extractMmsPduFromPacket(frame);
              if (!mmsData) return [];
              try {
                const result = parseGetNameListResponse(mmsData);
                return result.identifiers;
              } catch {
                return [];
              }
            }
          };
        }

        // ── Get Logical Node Directory (list DOs in an LN) ─────────
        if (action === "iec61850:getLogicalNodeDirectory") {
          const p = payload as { ldName?: string; lnName?: string } | undefined;
          if (!p?.ldName || !p?.lnName) throw new Error("getLogicalNodeDirectory requires ldName and lnName");
          const invokeId = context.runtime.invokeId++;
          return {
            id: `iec61850-getLNDir-${invokeId}`,
            type: action,
            stages: [
              {
                id: "getLogicalNodeDirectory-request",
                send: () => {
                  // Read the LN variable to get its structure
                  const mmsPdu = buildReadRequest({
                    invokeId,
                    variables: [{ domainId: p.ldName!, itemId: p.lnName! }]
                  });
                  return buildMmsPacket(mmsPdu);
                },
                expectResponse: true,
                matcher: (frame) => matchMmsResponse(frame),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return [];
              const mmsData = extractMmsPduFromPacket(frame);
              if (!mmsData) return [];
              try {
                const result = parseReadResponse(mmsData);
                const accessResult = result.listOfAccessResult[0];
                if (accessResult?.success?.type === MmsDataType.Structure) {
                  return (accessResult.success.value as MmsValue[]).map((_, i) => `component-${i}`);
                }
                return [];
              } catch {
                return [];
              }
            }
          };
        }

        // ── Get Data Directory (list DAs of a DO) ──────────────────
        if (action === "iec61850:getDataDirectory") {
          const p = payload as { ldName?: string; lnName?: string; doName?: string } | undefined;
          if (!p?.ldName || !p?.lnName || !p?.doName) {
            throw new Error("getDataDirectory requires ldName, lnName, and doName");
          }
          const invokeId = context.runtime.invokeId++;
          return {
            id: `iec61850-getDataDir-${invokeId}`,
            type: action,
            stages: [
              {
                id: "getDataDirectory-request",
                send: () => {
                  const mmsPdu = buildReadRequest({
                    invokeId,
                    variables: [{
                      domainId: p.ldName,
                      itemId: `${p.lnName}$${p.doName}`
                    }]
                  });
                  return buildMmsPacket(mmsPdu);
                },
                expectResponse: true,
                matcher: (frame) => matchMmsResponse(frame),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return [];
              const mmsData = extractMmsPduFromPacket(frame);
              if (!mmsData) return [];
              try {
                const result = parseReadResponse(mmsData);
                const accessResult = result.listOfAccessResult[0];
                if (accessResult?.success?.type === MmsDataType.Structure) {
                  return (accessResult.success.value as MmsValue[]).map((_, i) => `attribute-${i}`);
                }
                return [];
              } catch {
                return [];
              }
            }
          };
        }

        // ── Read (by IEC 61850 reference) ──────────────────────────
        if (action === "iec61850:read") {
          const p = payload as { reference?: string } | undefined;
          if (!p?.reference) throw new Error("read requires a reference string");
          const invokeId = context.runtime.invokeId++;
          const ref = parseIec61850Reference(p.reference);
          const variable = buildMmsVariableWithComponents(ref);

          return {
            id: `iec61850-read-${invokeId}`,
            type: action,
            stages: [
              {
                id: "read-request",
                send: () => {
                  const mmsPdu = buildReadRequest({
                    invokeId,
                    variables: [variable]
                  });
                  return buildMmsPacket(mmsPdu);
                },
                expectResponse: true,
                matcher: (frame) => matchMmsResponse(frame),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return null;
              const mmsData = extractMmsPduFromPacket(frame);
              if (!mmsData) return null;
              try {
                const result = parseReadResponse(mmsData);
                const accessResult = result.listOfAccessResult[0];
                if (accessResult?.success) {
                  return accessResult.success;
                }
                if (accessResult?.failure) {
                  return { error: accessResult.failure };
                }
                return null;
              } catch {
                return null;
              }
            }
          };
        }

        // ── Write (by IEC 61850 reference) ─────────────────────────
        if (action === "iec61850:write") {
          const p = payload as { reference?: string; value?: MmsValue } | undefined;
          if (!p?.reference || !p?.value) throw new Error("write requires reference and value");
          const invokeId = context.runtime.invokeId++;
          const ref = parseIec61850Reference(p.reference);
          const variable = buildMmsVariableWithComponents(ref);

          return {
            id: `iec61850-write-${invokeId}`,
            type: action,
            stages: [
              {
                id: "write-request",
                send: () => {
                  const mmsPdu = buildWriteRequest({
                    invokeId,
                    variables: [variable],
                    values: [p.value!]
                  });
                  return buildMmsPacket(mmsPdu);
                },
                expectResponse: true,
                matcher: (frame) => matchMmsResponse(frame),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return { success: false };
              const mmsData = extractMmsPduFromPacket(frame);
              if (!mmsData) return { success: false };
              try {
                const result = parseWriteResponse(mmsData);
                const writeResult = result.listOfWriteResult[0];
                if (writeResult?.success) return { success: true };
                if (writeResult?.failure) return { success: false, error: writeResult.failure };
                return { success: false };
              } catch {
                return { success: false };
              }
            }
          };
        }

        // ── Get Data Definition ────────────────────────────────────
        if (action === "iec61850:getDataDefinition") {
          const p = payload as { reference?: string } | undefined;
          if (!p?.reference) throw new Error("getDataDefinition requires a reference string");
          const invokeId = context.runtime.invokeId++;
          const ref = parseIec61850Reference(p.reference);
          const { domainId, itemId } = buildMmsVariableWithComponents(ref);

          return {
            id: `iec61850-getDataDef-${invokeId}`,
            type: action,
            stages: [
              {
                id: "getDataDefinition-request",
                send: () => {
                  const mmsPdu = buildGetVariableAccessAttributesRequest({
                    invokeId,
                    domainId,
                    itemId
                  });
                  return buildMmsPacket(mmsPdu);
                },
                expectResponse: true,
                matcher: (frame) => matchMmsResponse(frame),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return null;
              const mmsData = extractMmsPduFromPacket(frame);
              if (!mmsData) return null;
              try {
                return parseGetVariableAccessAttributesResponse(mmsData);
              } catch {
                return null;
              }
            }
          };
        }

        // ── Identify ───────────────────────────────────────────────
        if (action === "iec61850:identify") {
          const invokeId = context.runtime.invokeId++;
          return {
            id: `iec61850-identify-${invokeId}`,
            type: action,
            stages: [
              {
                id: "identify-request",
                send: () => {
                  const mmsPdu = buildIdentifyRequest(invokeId);
                  return buildMmsPacket(mmsPdu);
                },
                expectResponse: true,
                matcher: (frame) => matchMmsResponse(frame),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return null;
              const mmsData = extractMmsPduFromPacket(frame);
              if (!mmsData) return null;
              try {
                return parseIdentifyResponse(mmsData);
              } catch {
                return null;
              }
            }
          };
        }

        // ── Define Named Variable ──────────────────────────────────
        if (action === "iec61850:defineNamedVariable") {
          const p = payload as {
            domainId?: string;
            itemId?: string;
            typeTag?: number;
          } | undefined;
          if (!p?.itemId) throw new Error("defineNamedVariable requires itemId");
          const invokeId = context.runtime.invokeId++;

          return {
            id: `iec61850-defineVar-${invokeId}`,
            type: action,
            stages: [
              {
                id: "defineNamedVariable-request",
                send: () => {
                  const mmsPdu = buildDefineNamedVariableRequest({
                    variableName: { domainId: p.domainId, itemId: p.itemId! },
                    typeSpecification: p.typeTag !== undefined
                      ? { typeTag: p.typeTag, typeName: `type-${p.typeTag}` }
                      : undefined
                  });
                  return buildMmsPacket(mmsPdu);
                },
                expectResponse: true,
                matcher: (frame) => matchMmsResponse(frame),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return { success: false };
              const mmsData = extractMmsPduFromPacket(frame);
              if (!mmsData) return { success: false };
              try {
                const pduType = getMmsPduType(mmsData);
                if (pduType === MmsPduType.ConfirmedResponse) return { success: true };
                if (pduType === MmsPduType.ConfirmedError) {
                  const err = parseMmsConfirmedError(mmsData);
                  return { success: false, error: err };
                }
                return { success: false };
              } catch {
                return { success: false };
              }
            }
          };
        }

        // ── Delete Named Variable ──────────────────────────────────
        if (action === "iec61850:deleteNamedVariable") {
          const p = payload as {
            domainId?: string;
            itemId?: string;
          } | undefined;
          if (!p?.itemId) throw new Error("deleteNamedVariable requires itemId");
          const invokeId = context.runtime.invokeId++;

          return {
            id: `iec61850-deleteVar-${invokeId}`,
            type: action,
            stages: [
              {
                id: "deleteNamedVariable-request",
                send: () => {
                  const mmsPdu = buildDeleteNamedVariableAccessRequest({
                    scopeOfDelete: 0, // specific
                    listOfName: [{ domainId: p.domainId, itemId: p.itemId! }]
                  });
                  return buildMmsPacket(mmsPdu);
                },
                expectResponse: true,
                matcher: (frame) => matchMmsResponse(frame),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return { success: false };
              const mmsData = extractMmsPduFromPacket(frame);
              if (!mmsData) return { success: false };
              try {
                const pduType = getMmsPduType(mmsData);
                if (pduType === MmsPduType.ConfirmedResponse) return { success: true };
                if (pduType === MmsPduType.ConfirmedError) {
                  const err = parseMmsConfirmedError(mmsData);
                  return { success: false, error: err };
                }
                return { success: false };
              } catch {
                return { success: false };
              }
            }
          };
        }

        throw new Error(`Unsupported IEC 61850 capability: ${action}`);
      },

      /**
       * Decode an IEC 61850 MMS frame into structured fields.
       * Handles TPKT, COTP, and MMS PDU layers.
       */
      decodeFrame: async (frame) => decodeIec61850Frame(frame)
    };
  }
}

// ─── Handshake Plan ──────────────────────────────────────────────────

/**
 * Create the IEC 61850 MMS connection handshake plan.
 * Stage 1: COTP CR → CC (transport-level connection)
 * Stage 2: MMS Initiate-Request → Initiate-Response (application-level handshake)
 */
function createIec61850Handshake(context: SessionKernelContext<Iec61850Runtime, Iec61850Config>): HandshakePlan<Iec61850Runtime> {
  return {
    id: "iec61850-mms-handshake",
    stages: [
      {
        id: "cotp-connect",
        send: () => buildConnectionRequestPacket({
          callingTsap: context.config.callingTsap,
          calledTsap: context.config.calledTsap
        }),
        expectResponse: true,
        matcher: (frame) => {
          // Match COTP Connection Confirm (CC)
          if (frame.length < 6) return false;
          const tpkt = parseTpktHeader(frame);
          if (!tpkt) return false;
          const cotpData = frame.slice(tpkt.dataOffset);
          if (cotpData.length < 2) return false;
          return cotpData[1] === 0x0d; // CC PDU type
        },
        timeoutMs: context.config.connectTimeoutMs ?? 5000,
        onResponse: (frame) => {
          const tpkt = parseTpktHeader(frame);
          if (!tpkt) throw new Error("Invalid TPKT header in COTP CC");
          const cotpData = frame.slice(tpkt.dataOffset);
          const cc = parseCotpConnectionConfirm(cotpData);
          if (!cc) throw new Error("Failed to parse COTP Connection Confirm");
        }
      },
      {
        id: "mms-initiate",
        send: () => buildInitiateRequestPacket(),
        expectResponse: true,
        matcher: (frame) => {
          // Match MMS Initiate-Response
          const mmsData = extractMmsPduFromPacket(frame);
          if (!mmsData) return false;
          const pduType = getMmsPduType(mmsData);
          return pduType === MmsPduType.InitiateResponse ||
                 pduType === MmsPduType.Reject;
        },
        timeoutMs: context.config.initiateTimeoutMs ?? 10000,
        onResponse: (frame) => {
          const mmsData = extractMmsPduFromPacket(frame);
          if (!mmsData) throw new Error("Failed to extract MMS PDU from Initiate response");
          const pduType = getMmsPduType(mmsData);
          if (pduType === MmsPduType.Reject) {
            const reject = parseMmsReject(mmsData);
            throw new Error(`MMS Initiate rejected: type=${reject.rejectType}, reason=${reject.rejectReason}`);
          }
          if (pduType !== MmsPduType.InitiateResponse) {
            throw new Error(`Expected MMS Initiate-Response, got PDU type ${pduType}`);
          }
          const initResp = parseMmsInitiateResponse(mmsData);
          context.runtime.initiateResponse = initResp;
          context.runtime.sessionInitialized = true;
        }
      }
    ]
  };
}

// ─── Frame Decoding Helpers ──────────────────────────────────────────

/**
 * Match an MMS response frame.
 * Checks for a valid TPKT header and COTP DT PDU containing an MMS response.
 */
function matchMmsResponse(frame: Uint8Array): boolean {
  const mmsData = extractMmsPduFromPacket(frame);
  if (!mmsData) return false;
  const pduType = getMmsPduType(mmsData);
  return pduType === MmsPduType.ConfirmedResponse ||
         pduType === MmsPduType.ConfirmedError ||
         pduType === MmsPduType.Reject ||
         pduType === MmsPduType.Unconfirmed;
}

/**
 * Full IEC 61850 MMS frame decoder for the adapter's decodeFrame method.
 */
async function decodeIec61850Frame(frame: Uint8Array): Promise<DecodedFrame> {
  const fields = decodeIec61850FrameFields(frame);

  // Check for MMS error conditions
  const mmsData = extractMmsPduFromPacket(frame);
  if (mmsData) {
    const pduType = getMmsPduType(mmsData);
    if (pduType === MmsPduType.ConfirmedError) {
      try {
        const err = parseMmsConfirmedError(mmsData);
        return {
          fields: {
            ...fields,
            mmsError: true,
            errorClass: err.errorClass,
            errorCode: err.errorCode
          },
          isError: true,
          errorDescription: `MMS Error: class=${err.errorClass}, code=${err.errorCode}`
        };
      } catch {
        // Fall through to generic decode
      }
    }
    if (pduType === MmsPduType.Reject) {
      try {
        const reject = parseMmsReject(mmsData);
        return {
          fields: {
            ...fields,
            mmsReject: true,
            rejectType: reject.rejectType,
            rejectReason: reject.rejectReason
          },
          isError: true,
          errorDescription: `MMS Reject: type=${reject.rejectType}, reason=${reject.rejectReason}`
        };
      } catch {
        // Fall through
      }
    }
  }

  return {
    fields,
    isError: false
  };
}

// ─── Read/Write Request Parsing ──────────────────────────────────────

/**
 * Parse a ReadRequest address field into MMS variable specifications.
 * Supports IEC 61850 references (e.g., "TEMPLATE/MMXU1.PhV.phsA.mag.f$MX").
 * Multiple references can be separated by commas.
 */
function parseReadRequestAddresses(request: ReadRequest): Array<{
  domainId?: string;
  itemId: string;
  component?: string[];
}> {
  const addresses = request.address.split(",").map((s) => s.trim()).filter(Boolean);
  return addresses.map((addr) => {
    const ref = parseIec61850Reference(addr);
    return buildMmsVariableWithComponents(ref);
  });
}

/**
 * Parse a WriteRequest into MMS variable specifications and values.
 * Expects the address field to contain an IEC 61850 reference,
 * and the data field to contain the raw bytes to write.
 */
function parseWriteRequestData(request: WriteRequest): {
  variables: Array<{ domainId?: string; itemId: string; component?: string[] }>;
  values: MmsValue[];
} {
  const addresses = request.address.split(",").map((s) => s.trim()).filter(Boolean);
  const variables = addresses.map((addr) => {
    const ref = parseIec61850Reference(addr);
    return buildMmsVariableWithComponents(ref);
  });

  // Interpret data as a single value
  const values: MmsValue[] = [];
  if (request.data.length >= 4) {
    const view = new DataView(request.data.buffer, request.data.byteOffset, 4);
    values.push(mmsFloat32(view.getFloat32(0, false)));
  } else if (request.data.length >= 2) {
    const view = new DataView(request.data.buffer, request.data.byteOffset, 2);
    values.push(mmsInteger(view.getInt16(0, false)));
  } else if (request.data.length >= 1) {
    values.push(mmsBoolean(request.data[0] !== 0));
  } else {
    values.push(mmsInteger(0));
  }

  return { variables, values };
}

// ─── Re-exports for external use ─────────────────────────────────────

export {
  parseIec61850Reference,
  buildMmsVariableName,
  buildMmsVariableWithComponents,
  extractNumericValue,
  extractBooleanValue,
  extractTimestamp,
  formatMmsValue,
  mmsBoolean,
  mmsInteger,
  mmsUnsigned,
  mmsFloat32,
  mmsFloat64,
  mmsVisibleString,
  mmsOctetString,
  mmsBitString,
  mmsBinaryTime,
  mmsStructure,
  mmsArray,
  MmsDataType,
  MmsPduType,
  MmsObjectClass,
  MmsObjectScope,
  FunctionalConstraint,
  LogicalNodeClass,
  type MmsValue,
  type MmsTypeDescription,
  type Iec61850Reference,
  type GetNameListResponse,
  type MmsReadResponse,
  type MmsWriteResponse,
  type GetVarAccessAttrResponse,
  type MmsIdentifyResponse
};

export default Iec61850Engine;
