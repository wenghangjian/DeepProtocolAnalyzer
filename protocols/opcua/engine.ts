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
  buildOpcUaHelloFrame,
  buildOpcUaOpenSecureChannelProbeFrame,
  buildOpcUaCloseSecureChannelFrame,
  buildOpcUaServiceRequest,
  buildBrowseRequestBody,
  buildBrowseNextRequestBody,
  buildReadRequestBody,
  buildWriteRequestBody,
  buildCreateSubscriptionRequestBody,
  buildCreateMonitoredItemsRequestBody,
  buildPublishRequestBody,
  parseOpcUaMessageHeader,
  parseOpcUaResponseHeader,
  parseBrowseResponse,
  parseReadResponse,
  parseWriteResponse,
  parseCreateSubscriptionResponse,
  parseCreateMonitoredItemsResponse,
  parsePublishResponse,
  parseNodeIdString,
  nodeIdToString,
  BinaryReader,
  encodeNodeId,
  decodeExpandedNodeId,
  ServiceTypeId,
  type OpcUaNodeId,
  type OpcUaVariant,
  type OpcUaDataValue,
  type OpcUaBrowseResult,
  type OpcUaReferenceDescription
} from "./capabilities";

// ─── OPC UA Configuration ────────────────────────────────────────────

/** Extended configuration for OPC UA engine. */
export interface OpcUaConfig extends RawTcpConfig {
  /** Security policy URI (default: None) */
  securityPolicy?: string;
  /** Security mode: None, Sign, SignAndEncrypt (default: None) */
  securityMode?: "None" | "Sign" | "SignAndEncrypt";
  /** Requested session timeout in ms (default: 600000) */
  sessionTimeoutMs?: number;
}

// ─── OPC UA Runtime State ────────────────────────────────────────────

/** Runtime state maintained across OPC UA requests. */
interface OpcUaRuntime {
  /** Monotonically increasing sequence number for secure channel messages. */
  sequenceNumber: number;
  /** Monotonically increasing request ID. */
  requestId: number;
  /** Secure channel ID assigned by the server after OPN handshake. */
  secureChannelId: number;
  /** Security token ID assigned by the server after OPN handshake. */
  tokenId: number;
}

// ─── OPC UA Engine ───────────────────────────────────────────────────

/**
 * OPC UA Binary Protocol Engine.
 *
 * Implements a functional OPC UA client over `opc.tcp://` transport.
 * Supports Browse, Read, Write, CreateSubscription, CreateMonitoredItems,
 * and Publish services on top of the HEL/ACK/OPN/CLO/MSG message framing.
 *
 * @example
 * ```ts
 * const engine = new OpcUaEngine();
 * await engine.onInit({ host: "127.0.0.1", port: 4840 });
 * await engine.connect("session-1");
 *
 * // Browse the RootFolder
 * const browseResults = await engine.invokeCapability("session-1", "opcua:browse", { nodeId: "i=84" });
 *
 * // Read a node value
 * const readResults = await engine.invokeCapability("session-1", "opcua:read", { nodeIds: ["i=2258"] });
 *
 * await engine.disconnect("session-1");
 * ```
 */
export class OpcUaEngine extends AdapterBackedDriver<OpcUaConfig, OpcUaRuntime> {
  protected protocolId = "opcua";
  protected defaultConfig: OpcUaConfig = {
    host: "127.0.0.1",
    port: 4840,
    connectTimeoutMs: 5000,
    readTimeoutMs: 5000
  };

  /**
   * Build the OPC UA protocol adapter with handshake, read/write plans,
   * and capability plans for Browse, Read, Write, and Subscription services.
   */
  protected buildAdapter(_config: OpcUaConfig): ProtocolAdapter<OpcUaRuntime, OpcUaConfig> {
    const baseAdapter = createRawTcpAdapter<OpcUaRuntime>(
      this.protocolId,
      (frame) => decodeOpcUaFrameFields(frame)
    );

    return {
      ...baseAdapter,

      /** Initialize OPC UA runtime with sequence/request counters and channel state. */
      initializeRuntime: () => ({
        sequenceNumber: 1,
        requestId: 1,
        secureChannelId: 0,
        tokenId: 0
      }),

      /** OPC UA connection handshake: HEL → ACK, then OPN → OPN response. */
      getHandshakePlan: (context) => createOpcUaHandshake(context),

      /** OPC UA-specific read plan: sends a ReadRequest and parses the ReadResponse. */
      createReadPlan: (request, context) => {
        const requestId = context.runtime.requestId++;
        const sequenceNumber = context.runtime.sequenceNumber++;
        const nodeIds = parseReadRequestAddresses(request);
        const body = buildReadRequestBody({ nodeIds });

        return {
          id: `opcua-read-${requestId}`,
          type: "opcua-read",
          stages: [
            {
              id: "read-request",
              send: () => buildOpcUaServiceRequest({
                secureChannelId: context.runtime.secureChannelId,
                tokenId: context.runtime.tokenId,
                sequenceNumber,
                requestId,
                serviceTypeId: ServiceTypeId.ReadRequest,
                requestBody: body
              }),
              expectResponse: true,
              matcher: (frame) => matchOpcUaResponse(frame, "MSG"),
              timeoutMs: context.config.readTimeoutMs ?? 5000
            }
          ],
          finalize: ({ responses }) => responses[0] ?? new Uint8Array()
        };
      },

      /** OPC UA-specific write plan: sends a WriteRequest and parses the WriteResponse. */
      createWritePlan: (request, context) => {
        const requestId = context.runtime.requestId++;
        const sequenceNumber = context.runtime.sequenceNumber++;
        const { nodeIds, variants } = parseWriteRequestData(request);
        const body = buildWriteRequestBody({ nodeIds, values: variants });

        return {
          id: `opcua-write-${requestId}`,
          type: "opcua-write",
          stages: [
            {
              id: "write-request",
              send: () => buildOpcUaServiceRequest({
                secureChannelId: context.runtime.secureChannelId,
                tokenId: context.runtime.tokenId,
                sequenceNumber,
                requestId,
                serviceTypeId: ServiceTypeId.WriteRequest,
                requestBody: body
              }),
              expectResponse: true,
              matcher: (frame) => matchOpcUaResponse(frame, "MSG"),
              timeoutMs: context.config.readTimeoutMs ?? 5000
            }
          ],
          finalize: () => true
        };
      },

      /**
       * OPC UA capability plan factory.
       * Supports: browse, browseNext, read, write, createSubscription,
       * createMonitoredItems, publish, open-secure-channel-probe, hello-probe.
       */
      createCapabilityPlan: (action, payload, context) => {
        // ── Probe capabilities (legacy) ──────────────────────────────
        if (action === "opcua:hello-probe") {
          return {
            id: `opcua-hello-${Date.now()}`,
            type: action,
            stages: [
              {
                id: "hello-probe",
                send: () => buildOpcUaHelloFrame(context.config),
                expectResponse: true,
                matcher: (frame) => frame.length >= 3 && (
                  String.fromCharCode(frame[0], frame[1], frame[2]) === "ACK" ||
                  String.fromCharCode(frame[0], frame[1], frame[2]) === "ERR"
                ),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => responses[0] ?? new Uint8Array()
          };
        }

        if (action === "opcua:open-secure-channel-probe") {
          const requestId = context.runtime.requestId++;
          const sequenceNumber = context.runtime.sequenceNumber++;
          return {
            id: `opcua-opn-${requestId}`,
            type: action,
            stages: [
              {
                id: "open-secure-channel-probe",
                send: () => buildOpcUaOpenSecureChannelProbeFrame({
                  secureChannelId: 0,
                  requestId,
                  sequenceNumber
                }),
                expectResponse: true,
                matcher: (frame) => frame.length >= 3 && (
                  String.fromCharCode(frame[0], frame[1], frame[2]) === "OPN" ||
                  String.fromCharCode(frame[0], frame[1], frame[2]) === "ERR"
                ),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => responses[0] ?? new Uint8Array()
          };
        }

        // ── Browse ───────────────────────────────────────────────────
        if (action === "opcua:browse") {
          const p = payload as { nodeId?: string } | undefined;
          const nodeId = parseNodeIdString(p?.nodeId ?? "i=84");
          const requestId = context.runtime.requestId++;
          const sequenceNumber = context.runtime.sequenceNumber++;
          const body = buildBrowseRequestBody({ nodeId });

          return {
            id: `opcua-browse-${requestId}`,
            type: action,
            stages: [
              {
                id: "browse-request",
                send: () => buildOpcUaServiceRequest({
                  secureChannelId: context.runtime.secureChannelId,
                  tokenId: context.runtime.tokenId,
                  sequenceNumber,
                  requestId,
                  serviceTypeId: ServiceTypeId.BrowseRequest,
                  requestBody: body
                }),
                expectResponse: true,
                matcher: (frame) => matchOpcUaResponse(frame, "MSG"),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return [];
              return parseBrowseResponse(frame);
            }
          };
        }

        // ── BrowseNext ───────────────────────────────────────────────
        if (action === "opcua:browseNext") {
          const p = payload as { continuationPoint: Uint8Array; release?: boolean } | undefined;
          if (!p?.continuationPoint) throw new Error("browseNext requires continuationPoint");
          const requestId = context.runtime.requestId++;
          const sequenceNumber = context.runtime.sequenceNumber++;
          const body = buildBrowseNextRequestBody({
            releaseContinuationPoints: p.release ?? false,
            continuationPoint: p.continuationPoint
          });

          return {
            id: `opcua-browseNext-${requestId}`,
            type: action,
            stages: [
              {
                id: "browseNext-request",
                send: () => buildOpcUaServiceRequest({
                  secureChannelId: context.runtime.secureChannelId,
                  tokenId: context.runtime.tokenId,
                  sequenceNumber,
                  requestId,
                  serviceTypeId: ServiceTypeId.BrowseNextRequest,
                  requestBody: body
                }),
                expectResponse: true,
                matcher: (frame) => matchOpcUaResponse(frame, "MSG"),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return [];
              return parseBrowseResponse(frame);
            }
          };
        }

        // ── Read ─────────────────────────────────────────────────────
        if (action === "opcua:read") {
          const p = payload as { nodeIds: string[]; attributeId?: number } | undefined;
          if (!p?.nodeIds?.length) throw new Error("read requires nodeIds array");
          const nodeIds = p.nodeIds.map(parseNodeIdString);
          const requestId = context.runtime.requestId++;
          const sequenceNumber = context.runtime.sequenceNumber++;
          const body = buildReadRequestBody({ nodeIds, attributeId: p.attributeId });

          return {
            id: `opcua-read-${requestId}`,
            type: action,
            stages: [
              {
                id: "read-request",
                send: () => buildOpcUaServiceRequest({
                  secureChannelId: context.runtime.secureChannelId,
                  tokenId: context.runtime.tokenId,
                  sequenceNumber,
                  requestId,
                  serviceTypeId: ServiceTypeId.ReadRequest,
                  requestBody: body
                }),
                expectResponse: true,
                matcher: (frame) => matchOpcUaResponse(frame, "MSG"),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return [];
              return parseReadResponse(frame);
            }
          };
        }

        // ── Write ────────────────────────────────────────────────────
        if (action === "opcua:write") {
          const p = payload as { nodeIds: string[]; values: OpcUaVariant[] } | undefined;
          if (!p?.nodeIds?.length || !p?.values?.length) throw new Error("write requires nodeIds and values arrays");
          const nodeIds = p.nodeIds.map(parseNodeIdString);
          const requestId = context.runtime.requestId++;
          const sequenceNumber = context.runtime.sequenceNumber++;
          const body = buildWriteRequestBody({ nodeIds, values: p.values });

          return {
            id: `opcua-write-${requestId}`,
            type: action,
            stages: [
              {
                id: "write-request",
                send: () => buildOpcUaServiceRequest({
                  secureChannelId: context.runtime.secureChannelId,
                  tokenId: context.runtime.tokenId,
                  sequenceNumber,
                  requestId,
                  serviceTypeId: ServiceTypeId.WriteRequest,
                  requestBody: body
                }),
                expectResponse: true,
                matcher: (frame) => matchOpcUaResponse(frame, "MSG"),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return [];
              return parseWriteResponse(frame);
            }
          };
        }

        // ── CreateSubscription ───────────────────────────────────────
        if (action === "opcua:createSubscription") {
          const p = payload as { requestedPublishingInterval?: number } | undefined;
          const requestId = context.runtime.requestId++;
          const sequenceNumber = context.runtime.sequenceNumber++;
          const body = buildCreateSubscriptionRequestBody({
            requestedPublishingInterval: p?.requestedPublishingInterval ?? 1000
          });

          return {
            id: `opcua-createSub-${requestId}`,
            type: action,
            stages: [
              {
                id: "createSubscription-request",
                send: () => buildOpcUaServiceRequest({
                  secureChannelId: context.runtime.secureChannelId,
                  tokenId: context.runtime.tokenId,
                  sequenceNumber,
                  requestId,
                  serviceTypeId: ServiceTypeId.CreateSubscriptionRequest,
                  requestBody: body
                }),
                expectResponse: true,
                matcher: (frame) => matchOpcUaResponse(frame, "MSG"),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return null;
              return parseCreateSubscriptionResponse(frame);
            }
          };
        }

        // ── CreateMonitoredItems ─────────────────────────────────────
        if (action === "opcua:createMonitoredItems") {
          const p = payload as { subscriptionId: number; nodeIds: string[]; samplingInterval?: number } | undefined;
          if (!p?.subscriptionId || !p?.nodeIds?.length) {
            throw new Error("createMonitoredItems requires subscriptionId and nodeIds");
          }
          const nodeIds = p.nodeIds.map(parseNodeIdString);
          const requestId = context.runtime.requestId++;
          const sequenceNumber = context.runtime.sequenceNumber++;
          const body = buildCreateMonitoredItemsRequestBody({
            subscriptionId: p.subscriptionId,
            nodeIds,
            samplingInterval: p.samplingInterval
          });

          return {
            id: `opcua-createMI-${requestId}`,
            type: action,
            stages: [
              {
                id: "createMonitoredItems-request",
                send: () => buildOpcUaServiceRequest({
                  secureChannelId: context.runtime.secureChannelId,
                  tokenId: context.runtime.tokenId,
                  sequenceNumber,
                  requestId,
                  serviceTypeId: ServiceTypeId.CreateMonitoredItemsRequest,
                  requestBody: body
                }),
                expectResponse: true,
                matcher: (frame) => matchOpcUaResponse(frame, "MSG"),
                timeoutMs: context.config.readTimeoutMs ?? 5000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return [];
              return parseCreateMonitoredItemsResponse(frame);
            }
          };
        }

        // ── Publish ──────────────────────────────────────────────────
        if (action === "opcua:publish") {
          const p = payload as { subscriptionIds: number[] } | undefined;
          if (!p?.subscriptionIds?.length) throw new Error("publish requires subscriptionIds");
          const requestId = context.runtime.requestId++;
          const sequenceNumber = context.runtime.sequenceNumber++;
          const body = buildPublishRequestBody({ subscriptionIds: p.subscriptionIds });

          return {
            id: `opcua-publish-${requestId}`,
            type: action,
            stages: [
              {
                id: "publish-request",
                send: () => buildOpcUaServiceRequest({
                  secureChannelId: context.runtime.secureChannelId,
                  tokenId: context.runtime.tokenId,
                  sequenceNumber,
                  requestId,
                  serviceTypeId: ServiceTypeId.PublishRequest,
                  requestBody: body
                }),
                expectResponse: true,
                matcher: (frame) => matchOpcUaResponse(frame, "MSG"),
                timeoutMs: context.config.readTimeoutMs ?? 30000
              }
            ],
            finalize: ({ responses }) => {
              const frame = responses[0];
              if (!frame) return null;
              return parsePublishResponse(frame);
            }
          };
        }

        throw new Error(`Unsupported OPC UA capability: ${action}`);
      },

      /**
       * Decode an OPC UA frame into structured fields.
       * Handles HEL, ACK, ERR, OPN, MSG, and CLO message types.
       */
      decodeFrame: async (frame) => decodeOpcUaFrame(frame)
    };
  }
}

// ─── Handshake Plan ──────────────────────────────────────────────────

/**
 * Create the OPC UA connection handshake plan.
 * Stage 1: HEL → ACK (transport-level handshake)
 * Stage 2: OPN → OPN response (secure channel establishment)
 */
function createOpcUaHandshake(context: SessionKernelContext<OpcUaRuntime, OpcUaConfig>): HandshakePlan<OpcUaRuntime> {
  return {
    id: "opcua-hello-ack",
    stages: [
      {
        id: "hello",
        send: () => buildOpcUaHelloFrame(context.config),
        expectResponse: true,
        matcher: (frame) => frame.length >= 3 && (
          String.fromCharCode(frame[0], frame[1], frame[2]) === "ACK" ||
          String.fromCharCode(frame[0], frame[1], frame[2]) === "ERR"
        ),
        timeoutMs: context.config.readTimeoutMs ?? 5000,
        onResponse: (frame) => {
          const messageType = String.fromCharCode(frame[0], frame[1], frame[2]);
          if (messageType === "ERR") {
            throw new Error("OPC UA HEL was rejected by the server");
          }
        }
      },
      {
        id: "open-secure-channel",
        send: () => {
          const requestId = context.runtime.requestId++;
          const sequenceNumber = context.runtime.sequenceNumber++;
          return buildOpcUaOpenSecureChannelProbeFrame({
            secureChannelId: 0,
            requestId,
            sequenceNumber
          });
        },
        expectResponse: true,
        matcher: (frame) => frame.length >= 3 && (
          String.fromCharCode(frame[0], frame[1], frame[2]) === "OPN" ||
          String.fromCharCode(frame[0], frame[1], frame[2]) === "ERR"
        ),
        timeoutMs: context.config.readTimeoutMs ?? 5000,
        onResponse: (frame) => {
          const messageType = String.fromCharCode(frame[0], frame[1], frame[2]);
          if (messageType === "ERR") {
            throw new Error("OPC UA OpenSecureChannel was rejected by the server");
          }
          // Parse OPN response to extract SecureChannelId and TokenId
          if (frame.length >= 12) {
            const reader = new BinaryReader(frame);
            reader.skip(8); // message header
            context.runtime.secureChannelId = reader.readUInt32();
            // Skip security policy URI
            const policyLen = reader.readInt32();
            if (policyLen > 0) reader.skip(policyLen);
            reader.readInt32(); // sender certificate
            reader.readInt32(); // receiver thumbprint
            reader.readUInt32(); // sequence number
            reader.readUInt32(); // request id
            // ResponseHeader
            const { serviceResult } = parseOpcUaResponseHeader(reader);
            if (serviceResult !== 0) {
              throw new Error(`OpenSecureChannel failed with status 0x${serviceResult.toString(16)}`);
            }
            // SecurityToken
            context.runtime.secureChannelId = reader.readUInt32();
            context.runtime.tokenId = reader.readUInt32();
            reader.readInt64(); // createdAt
            reader.readUInt32(); // revisedLifetime
          }
        }
      }
    ]
  };
}

// ─── Frame Decoding Helpers ──────────────────────────────────────────

/**
 * Match an OPC UA response frame by message type.
 */
function matchOpcUaResponse(frame: Uint8Array, expectedType: string): boolean {
  if (frame.length < 3) return false;
  const msgType = String.fromCharCode(frame[0], frame[1], frame[2]);
  return msgType === expectedType || msgType === "ERR";
}

/**
 * Decode OPC UA frame fields for the raw adapter's decodeFields callback.
 */
function decodeOpcUaFrameFields(frame: Uint8Array): Record<string, unknown> {
  const header = parseOpcUaMessageHeader(frame);
  if (!header) {
    return {
      length: frame.length,
      messageType: "unknown",
      previewHex: formatHexPreview(frame)
    };
  }

  const fields: Record<string, unknown> = {
    length: frame.length,
    messageType: header.messageType,
    chunkType: header.chunkType,
    messageSize: header.messageSize,
    previewHex: formatHexPreview(frame)
  };

  // For MSG/OPN responses, try to parse the service result
  if (header.messageType === "MSG" || header.messageType === "OPN") {
    try {
      const reader = new BinaryReader(frame);
      reader.skip(8); // message header
      if (header.messageType === "MSG") {
        reader.skip(8); // symmetric security header
      } else {
        reader.readUInt32(); // secure channel id
        const policyLen = reader.readInt32();
        if (policyLen > 0) reader.skip(policyLen);
        reader.readInt32(); // sender cert
        reader.readInt32(); // receiver thumbprint
      }
      reader.skip(8); // sequence header
      decodeExpandedNodeId(reader); // response type
      const { serviceResult } = parseOpcUaResponseHeader(reader);
      fields.serviceResult = serviceResult;
      fields.serviceResultHex = `0x${serviceResult.toString(16).padStart(8, "0")}`;
    } catch {
      // Parsing failed — not a service response
    }
  }

  return fields;
}

/**
 * Full OPC UA frame decoder for the adapter's decodeFrame method.
 */
async function decodeOpcUaFrame(frame: Uint8Array): Promise<DecodedFrame> {
  const header = parseOpcUaMessageHeader(frame);
  if (!header) {
    return {
      fields: { length: frame.length, messageType: "unknown", previewHex: formatHexPreview(frame) },
      isError: true,
      errorDescription: "Frame too short for OPC UA header"
    };
  }

  const isError = header.messageType === "ERR";
  const fields = decodeOpcUaFrameFields(frame);

  return {
    fields,
    isError,
    errorDescription: isError ? "OPC UA Error frame received" : undefined
  };
}

/**
 * Format the first N bytes of a buffer as hex for preview.
 */
function formatHexPreview(data: Uint8Array, maxBytes = 20): string {
  return Array.from(data.slice(0, maxBytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

// ─── Read/Write Request Parsing ──────────────────────────────────────

/**
 * Parse a ReadRequest address field into OPC UA NodeIds.
 * Supports comma-separated NodeId strings (e.g. "i=2258,i=2259").
 */
function parseReadRequestAddresses(request: ReadRequest): OpcUaNodeId[] {
  const addresses = request.address.split(",").map((s) => s.trim()).filter(Boolean);
  return addresses.map(parseNodeIdString);
}

/**
 * Parse a WriteRequest into OPC UA NodeIds and Variants.
 * Expects the address field to contain comma-separated NodeId strings,
 * and the data field to contain the raw bytes to write.
 */
function parseWriteRequestData(request: WriteRequest): { nodeIds: OpcUaNodeId[]; variants: OpcUaVariant[] } {
  const addresses = request.address.split(",").map((s) => s.trim()).filter(Boolean);
  const nodeIds = addresses.map(parseNodeIdString);

  // Interpret data as a single Int32 value by default
  const variants: OpcUaVariant[] = [];
  if (request.data.length >= 4) {
    const view = new DataView(request.data.buffer, request.data.byteOffset, 4);
    variants.push({ dataType: 6, value: view.getInt32(0, true) }); // Int32
  } else if (request.data.length >= 2) {
    const view = new DataView(request.data.buffer, request.data.byteOffset, 2);
    variants.push({ dataType: 4, value: view.getInt16(0, true) }); // Int16
  } else if (request.data.length >= 1) {
    variants.push({ dataType: 1, value: request.data[0] !== 0 }); // Boolean
  } else {
    variants.push({ dataType: 0, value: null }); // Null
  }

  return { nodeIds, variants };
}

// ─── Re-exports for external use ─────────────────────────────────────

export {
  parseNodeIdString,
  nodeIdToString,
  type OpcUaNodeId,
  type OpcUaVariant,
  type OpcUaDataValue,
  type OpcUaBrowseResult,
  type OpcUaReferenceDescription
};

export default OpcUaEngine;
