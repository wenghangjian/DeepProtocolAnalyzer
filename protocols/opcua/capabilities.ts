import type { RawTcpConfig } from "../_shared/raw-adapters";

// ─── OPC UA Constants ────────────────────────────────────────────────

/** OPC UA standard service type NodeIds (Part 6, Table 14) */
export const ServiceTypeId = {
  OpenSecureChannelRequest: 446,
  OpenSecureChannelResponse: 449,
  CloseSecureChannelRequest: 452,
  BrowseRequest: 527,
  BrowseResponse: 530,
  BrowseNextRequest: 533,
  BrowseNextResponse: 536,
  ReadRequest: 629,
  ReadResponse: 632,
  WriteRequest: 673,
  WriteResponse: 676,
  CreateMonitoredItemsRequest: 751,
  CreateMonitoredItemsResponse: 754,
  CreateSubscriptionRequest: 785,
  CreateSubscriptionResponse: 788,
  PublishRequest: 823,
  PublishResponse: 826,
} as const;

/** OPC UA Attribute Ids (Part 4, Table 2) */
export const AttributeId = {
  NodeId: 1,
  NodeClass: 2,
  BrowseName: 3,
  DisplayName: 4,
  Description: 5,
  Value: 13,
  DataType: 14,
  ValueRank: 15,
  ArrayDimensions: 16,
  AccessLevel: 17,
  UserAccessLevel: 18,
  MinimumSamplingInterval: 19,
  Historizing: 20,
  Executable: 21,
  UserExecutable: 22,
} as const;

/** OPC UA Built-in Data Type Ids (Part 6, Table 1) */
export const DataTypeId = {
  Boolean: 1,
  SByte: 2,
  Byte: 3,
  Int16: 4,
  UInt16: 5,
  Int32: 6,
  UInt32: 7,
  Int64: 8,
  UInt64: 9,
  Float: 10,
  Double: 11,
  String: 12,
  DateTime: 13,
  StatusCode: 14,
} as const;

/** OPC UA NodeClass flags (Part 3, Table 12) */
export const NodeClass = {
  Object: 1,
  Variable: 2,
  Method: 4,
  ObjectType: 8,
  VariableType: 16,
  ReferenceType: 32,
  DataType: 64,
  View: 128,
} as const;

// ─── OPC UA Type Definitions ─────────────────────────────────────────

/** OPC UA NodeId representation */
export interface OpcUaNodeId {
  namespace: number;
  identifierType: "numeric" | "string" | "guid" | "opaque";
  identifier: number | string | Uint8Array;
}

/** OPC UA Variant — typed value wrapper */
export interface OpcUaVariant {
  dataType: number;
  value: unknown;
  arrayType?: "scalar" | "array";
}

/** OPC UA DataValue — value with status and timestamps */
export interface OpcUaDataValue {
  value?: OpcUaVariant;
  statusCode?: number;
  sourceTimestamp?: bigint;
  serverTimestamp?: bigint;
}

/** OPC UA Browse result for a single node */
export interface OpcUaBrowseResult {
  statusCode: number;
  continuationPoint?: Uint8Array;
  references: OpcUaReferenceDescription[];
}

/** OPC UA ReferenceDescription from a Browse response */
export interface OpcUaReferenceDescription {
  referenceTypeId: OpcUaNodeId;
  isForward: boolean;
  nodeId: OpcUaNodeId;
  browseName: string;
  displayName: string;
  nodeClass: number;
  typeDefinition: OpcUaNodeId;
}

/** Parsed OPC UA message header */
export interface OpcUaMessageHeader {
  messageType: string;
  chunkType: string;
  messageSize: number;
}

// ─── Binary Writer (chunk-based, no pre-allocation) ──────────────────

class BinaryWriter {
  private chunks: Uint8Array[] = [];
  private totalLength = 0;

  writeUInt8(value: number): void {
    const buf = new Uint8Array(1);
    buf[0] = value & 0xff;
    this.chunks.push(buf);
    this.totalLength += 1;
  }

  writeUInt16(value: number): void {
    const buf = new Uint8Array(2);
    new DataView(buf.buffer).setUint16(0, value, true);
    this.chunks.push(buf);
    this.totalLength += 2;
  }

  writeInt32(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setInt32(0, value, true);
    this.chunks.push(buf);
    this.totalLength += 4;
  }

  writeUInt32(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, value >>> 0, true);
    this.chunks.push(buf);
    this.totalLength += 4;
  }

  writeInt64(value: bigint): void {
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigInt64(0, value, true);
    this.chunks.push(buf);
    this.totalLength += 8;
  }

  writeFloat32(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setFloat32(0, value, true);
    this.chunks.push(buf);
    this.totalLength += 4;
  }

  writeFloat64(value: number): void {
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setFloat64(0, value, true);
    this.chunks.push(buf);
    this.totalLength += 8;
  }

  writeBytes(data: Uint8Array): void {
    this.chunks.push(new Uint8Array(data));
    this.totalLength += data.length;
  }

  /** Write a UA String (Int32 length prefix + UTF-8 bytes). Pass null/undefined for -1 (null string). */
  writeString(value: string | null | undefined): void {
    if (value == null) {
      this.writeInt32(-1);
      return;
    }
    const bytes = new TextEncoder().encode(value);
    this.writeInt32(bytes.length);
    this.chunks.push(bytes);
    this.totalLength += bytes.length;
  }

  toUint8Array(): Uint8Array {
    const result = new Uint8Array(this.totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  getOffset(): number {
    return this.totalLength;
  }
}

// ─── Binary Reader ───────────────────────────────────────────────────

export class BinaryReader {
  private offset = 0;

  constructor(private readonly buffer: Uint8Array) {}

  readUInt8(): number {
    const value = this.buffer[this.offset];
    this.offset += 1;
    return value;
  }

  readUInt16(): number {
    const value = new DataView(
      this.buffer.buffer, this.buffer.byteOffset + this.offset, 2
    ).getUint16(0, true);
    this.offset += 2;
    return value;
  }

  readInt32(): number {
    const value = new DataView(
      this.buffer.buffer, this.buffer.byteOffset + this.offset, 4
    ).getInt32(0, true);
    this.offset += 4;
    return value;
  }

  readUInt32(): number {
    const value = new DataView(
      this.buffer.buffer, this.buffer.byteOffset + this.offset, 4
    ).getUint32(0, true);
    this.offset += 4;
    return value;
  }

  readInt64(): bigint {
    const value = new DataView(
      this.buffer.buffer, this.buffer.byteOffset + this.offset, 8
    ).getBigInt64(0, true);
    this.offset += 8;
    return value;
  }

  readFloat32(): number {
    const value = new DataView(
      this.buffer.buffer, this.buffer.byteOffset + this.offset, 4
    ).getFloat32(0, true);
    this.offset += 4;
    return value;
  }

  readFloat64(): number {
    const value = new DataView(
      this.buffer.buffer, this.buffer.byteOffset + this.offset, 8
    ).getFloat64(0, true);
    this.offset += 8;
    return value;
  }

  readBytes(length: number): Uint8Array {
    const bytes = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  readString(): string {
    const length = this.readInt32();
    if (length < 0) return "";
    const bytes = this.readBytes(length);
    return new TextDecoder().decode(bytes);
  }

  getOffset(): number {
    return this.offset;
  }

  remaining(): number {
    return this.buffer.length - this.offset;
  }

  /** Peek at the byte at the current offset without advancing. */
  peek(): number {
    return this.buffer[this.offset];
  }

  skip(count: number): void {
    this.offset += count;
  }
}

// ─── NodeId Encoding / Decoding ──────────────────────────────────────

/**
 * Encode an OPC UA NodeId into binary form.
 *
 * Encoding byte bits 0-3 select the identifier type:
 *   0 = TwoByte, 1 = FourByte, 2 = Numeric, 3 = String, 4 = Guid, 5 = Opaque
 */
export function encodeNodeId(writer: BinaryWriter, nodeId: OpcUaNodeId): void {
  if (nodeId.identifierType === "numeric") {
    const id = nodeId.identifier as number;
    if (nodeId.namespace === 0 && id >= 0 && id <= 255) {
      writer.writeUInt8(0x00);
      writer.writeUInt8(id);
    } else if (nodeId.namespace <= 255 && id >= 0 && id <= 0xffff) {
      writer.writeUInt8(0x01);
      writer.writeUInt8(nodeId.namespace);
      writer.writeUInt16(id);
    } else {
      writer.writeUInt8(0x02);
      writer.writeUInt16(nodeId.namespace);
      writer.writeUInt32(id);
    }
  } else if (nodeId.identifierType === "string") {
    writer.writeUInt8(0x03);
    writer.writeUInt16(nodeId.namespace);
    writer.writeString(nodeId.identifier as string);
  } else if (nodeId.identifierType === "guid") {
    writer.writeUInt8(0x04);
    writer.writeUInt16(nodeId.namespace);
    writer.writeBytes(nodeId.identifier as Uint8Array);
  } else {
    writer.writeUInt8(0x05);
    writer.writeUInt16(nodeId.namespace);
    const data = nodeId.identifier as Uint8Array;
    writer.writeInt32(data.length);
    writer.writeBytes(data);
  }
}

/**
 * Decode an OPC UA NodeId from binary form.
 */
export function decodeNodeId(reader: BinaryReader): OpcUaNodeId {
  const encodingByte = reader.readUInt8();
  const idType = encodingByte & 0x0f;

  switch (idType) {
    case 0: // TwoByteNodeId
      return { namespace: 0, identifierType: "numeric", identifier: reader.readUInt8() };
    case 1: // FourByteNodeId
      return { namespace: reader.readUInt8(), identifierType: "numeric", identifier: reader.readUInt16() };
    case 2: // NumericNodeId
      return { namespace: reader.readUInt16(), identifierType: "numeric", identifier: reader.readUInt32() };
    case 3: // StringNodeId
      return { namespace: reader.readUInt16(), identifierType: "string", identifier: reader.readString() };
    case 4: // GuidNodeId
      return { namespace: reader.readUInt16(), identifierType: "guid", identifier: reader.readBytes(16) };
    case 5: // OpaqueNodeId
      return { namespace: reader.readUInt16(), identifierType: "opaque", identifier: reader.readBytes(reader.readInt32()) };
    default:
      throw new Error(`Unknown NodeId encoding type: ${idType}`);
  }
}

/**
 * Decode an ExpandedNodeId — same as NodeId but may include
 * a NamespaceUri (bit 7) and/or ServerIndex (bit 6) after the NodeId.
 */
export function decodeExpandedNodeId(reader: BinaryReader): OpcUaNodeId {
  const encodingByte = reader.peek();
  const hasNamespaceUri = (encodingByte & 0x80) !== 0;
  const hasServerIndex = (encodingByte & 0x40) !== 0;

  const nodeId = decodeNodeId(reader);

  if (hasNamespaceUri) reader.readString();
  if (hasServerIndex) reader.readUInt32();

  return nodeId;
}

// ─── Variant Encoding / Decoding ─────────────────────────────────────

/**
 * Encode an OPC UA Variant.
 * Encoding mask byte: bits 0-5 = data type, bit 7 = array flag.
 */
export function encodeVariant(writer: BinaryWriter, variant: OpcUaVariant): void {
  let mask = variant.dataType & 0x3f;
  if (variant.arrayType === "array") mask |= 0x80;
  writer.writeUInt8(mask);

  if (variant.arrayType === "array") {
    const arr = variant.value as unknown[];
    writer.writeInt32(arr.length);
    for (const item of arr) encodeVariantValue(writer, variant.dataType, item);
  } else {
    encodeVariantValue(writer, variant.dataType, variant.value);
  }
}

function encodeVariantValue(writer: BinaryWriter, dataType: number, value: unknown): void {
  switch (dataType) {
    case DataTypeId.Boolean:   writer.writeUInt8(value ? 1 : 0); break;
    case DataTypeId.SByte:     writer.writeUInt8((value as number) & 0x7f); break;
    case DataTypeId.Byte:      writer.writeUInt8((value as number) & 0xff); break;
    case DataTypeId.Int16:     writer.writeUInt16(value as number); break;
    case DataTypeId.UInt16:    writer.writeUInt16(value as number); break;
    case DataTypeId.Int32:     writer.writeInt32(value as number); break;
    case DataTypeId.UInt32:    writer.writeUInt32(value as number); break;
    case DataTypeId.Int64:     writer.writeInt64(BigInt(value as number | bigint)); break;
    case DataTypeId.UInt64:    writer.writeInt64(BigInt(value as number | bigint)); break;
    case DataTypeId.Float:     writer.writeFloat32(value as number); break;
    case DataTypeId.Double:    writer.writeFloat64(value as number); break;
    case DataTypeId.String:    writer.writeString(value as string); break;
    case DataTypeId.DateTime:  writer.writeInt64(BigInt(value as number | bigint)); break;
    case DataTypeId.StatusCode: writer.writeUInt32(value as number); break;
    default: break; // unknown type → nothing written
  }
}

/**
 * Decode an OPC UA Variant from binary.
 */
export function decodeVariant(reader: BinaryReader): OpcUaVariant {
  const mask = reader.readUInt8();
  const dataType = mask & 0x3f;
  const isArray = (mask & 0x80) !== 0;

  if (dataType === 0) return { dataType: 0, value: null };

  if (isArray) {
    const len = reader.readInt32();
    const values: unknown[] = [];
    for (let i = 0; i < len; i++) values.push(decodeVariantValue(reader, dataType));
    return { dataType, value: values, arrayType: "array" };
  }

  return { dataType, value: decodeVariantValue(reader, dataType) };
}

function decodeVariantValue(reader: BinaryReader, dataType: number): unknown {
  switch (dataType) {
    case DataTypeId.Boolean:   return reader.readUInt8() !== 0;
    case DataTypeId.SByte:     return reader.readUInt8();
    case DataTypeId.Byte:      return reader.readUInt8();
    case DataTypeId.Int16:     return reader.readUInt16(); // stored as unsigned, interpret as signed
    case DataTypeId.UInt16:    return reader.readUInt16();
    case DataTypeId.Int32:     return reader.readInt32();
    case DataTypeId.UInt32:    return reader.readUInt32();
    case DataTypeId.Int64:     return reader.readInt64();
    case DataTypeId.UInt64:    return reader.readInt64();
    case DataTypeId.Float:     return reader.readFloat32();
    case DataTypeId.Double:    return reader.readFloat64();
    case DataTypeId.String:    return reader.readString();
    case DataTypeId.DateTime:  return reader.readInt64();
    case DataTypeId.StatusCode: return reader.readUInt32();
    default: return null;
  }
}

// ─── DataValue Decoding ──────────────────────────────────────────────

/**
 * Decode an OPC UA DataValue.
 * Encoding mask: bit 0 = has Value, bit 1 = has StatusCode,
 * bit 2 = has SourceTimestamp, bit 3 = has ServerTimestamp.
 */
export function decodeDataValue(reader: BinaryReader): OpcUaDataValue {
  const mask = reader.readUInt8();
  const dv: OpcUaDataValue = {};
  if (mask & 0x01) dv.value = decodeVariant(reader);
  if (mask & 0x02) dv.statusCode = reader.readUInt32();
  if (mask & 0x04) dv.sourceTimestamp = reader.readInt64();
  if (mask & 0x08) dv.serverTimestamp = reader.readInt64();
  return dv;
}

// ─── Message Header Parsing ──────────────────────────────────────────

/**
 * Parse the 8-byte OPC UA message header.
 * Returns null if the frame is too short.
 */
export function parseOpcUaMessageHeader(frame: Uint8Array): OpcUaMessageHeader | null {
  if (frame.length < 8) return null;
  return {
    messageType: String.fromCharCode(frame[0], frame[1], frame[2]),
    chunkType: String.fromCharCode(frame[3]),
    messageSize: new DataView(frame.buffer, frame.byteOffset, 8).getUint32(4, true),
  };
}

// ─── Response Header Parsing ─────────────────────────────────────────

/**
 * Skip a NodeId in the reader (used for skipping SessionId in ResponseHeader).
 */
function skipNodeId(reader: BinaryReader): void {
  const encodingByte = reader.readUInt8();
  const idType = encodingByte & 0x0f;
  switch (idType) {
    case 0: break; // TwoByte — nothing more
    case 1: reader.readUInt8(); reader.readUInt16(); break;
    case 2: reader.readUInt16(); reader.readUInt32(); break;
    case 3: reader.readUInt16(); reader.readString(); break;
    case 4: reader.readUInt16(); reader.readBytes(16); break;
    case 5: reader.readUInt16(); reader.readBytes(reader.readInt32()); break;
    default: break;
  }
}

/**
 * Skip a DiagnosticInfo in the reader.
 */
function skipDiagnosticInfo(reader: BinaryReader): void {
  const mask = reader.readUInt8();
  if (mask === 0) return;
  if (mask & 0x01) reader.readInt32();
  if (mask & 0x02) reader.readInt32();
  if (mask & 0x04) reader.readInt32();
  if (mask & 0x08) reader.readInt32();
  if (mask & 0x10) reader.readString();
  if (mask & 0x20) reader.readUInt32();
  if (mask & 0x40) skipDiagnosticInfo(reader); // recursive
}

/**
 * Parse the OPC UA ResponseHeader and return the ServiceResult (StatusCode).
 * Advances the reader past the entire ResponseHeader.
 */
export function parseOpcUaResponseHeader(reader: BinaryReader): { serviceResult: number } {
  skipNodeId(reader);          // SessionId
  reader.readInt64();           // Timestamp
  reader.readUInt32();          // RequestHandle
  const serviceResult = reader.readUInt32(); // ServiceResult (StatusCode)
  skipDiagnosticInfo(reader);   // ServiceDiagnostics

  // StringTable
  const stringCount = reader.readInt32();
  for (let i = 0; i < stringCount; i++) reader.readString();

  // AdditionalHeader (ExtensionObject — usually null)
  reader.readUInt8(); // encoding byte (0x00 = null)

  return { serviceResult };
}

// ─── Frame Builders ──────────────────────────────────────────────────

interface OpenSecureChannelProbeOptions {
  secureChannelId: number;
  sequenceNumber: number;
  requestId: number;
  requestHandle?: number;
}

function writeUInt32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function writeInt32(view: DataView, offset: number, value: number) {
  view.setInt32(offset, value, true);
}

/**
 * Build an OPC UA Hello (HEL) message.
 * This is the first message sent during connection establishment.
 */
export function buildOpcUaHelloFrame(config: Pick<RawTcpConfig, "host" | "port">) {
  const endpoint = `opc.tcp://${config.host}:${config.port}`;
  const endpointBytes = new TextEncoder().encode(endpoint);
  const frameSize = 32 + endpointBytes.length;
  const frame = new Uint8Array(frameSize);
  frame.set([0x48, 0x45, 0x4c, 0x46], 0); // "HELF"

  const view = new DataView(frame.buffer);
  writeUInt32(view, 4, frameSize);
  writeUInt32(view, 8, 0);       // ProtocolVersion
  writeUInt32(view, 12, 65535);  // ReceiveBufferSize
  writeUInt32(view, 16, 65535);  // SendBufferSize
  writeUInt32(view, 20, 0);      // MaxMessageSize (0 = no limit)
  writeUInt32(view, 24, 0);      // MaxChunkCount (0 = no limit)
  writeInt32(view, 28, endpointBytes.length);
  frame.set(endpointBytes, 32);
  return frame;
}

/**
 * Build an OPC UA Open Secure Channel (OPN) probe frame.
 * Uses SecurityPolicy#None with no certificates.
 */
export function buildOpcUaOpenSecureChannelProbeFrame(options: OpenSecureChannelProbeOptions) {
  const securityPolicy = new TextEncoder().encode("http://opcfoundation.org/UA/SecurityPolicy#None");
  const serviceBodyLength = 40;
  const asymmetricHeaderLength = 4 + securityPolicy.length + 4 + 4;
  const sequenceHeaderLength = 8;
  const secureConversationHeaderLength = 12;
  const totalLength = secureConversationHeaderLength + asymmetricHeaderLength + sequenceHeaderLength + serviceBodyLength;
  const frame = new Uint8Array(totalLength);
  frame.set([0x4f, 0x50, 0x4e, 0x46], 0); // "OPNF"

  const view = new DataView(frame.buffer);
  writeUInt32(view, 4, totalLength);
  writeUInt32(view, 8, options.secureChannelId);

  let offset = 12;
  writeInt32(view, offset, securityPolicy.length);
  offset += 4;
  frame.set(securityPolicy, offset);
  offset += securityPolicy.length;
  writeInt32(view, offset, -1); // sender certificate: null
  offset += 4;
  writeInt32(view, offset, -1); // receiver thumbprint: null
  offset += 4;

  writeUInt32(view, offset, options.sequenceNumber);
  offset += 4;
  writeUInt32(view, offset, options.requestId);
  offset += 4;

  // OpenSecureChannelRequest body
  writeUInt32(view, offset, ServiceTypeId.OpenSecureChannelRequest);
  offset += 4;
  writeUInt32(view, offset, 0x01); // encoding mask
  offset += 4;
  writeUInt32(view, offset, options.requestHandle ?? 1);
  offset += 4;
  writeUInt32(view, offset, Date.now() & 0xffffffff);
  offset += 4;
  writeUInt32(view, offset, 30000); // timeout hint
  offset += 4;
  writeUInt32(view, offset, 0); // security mode: None
  offset += 4;
  writeUInt32(view, offset, 1); // request type: Issue
  offset += 4;
  writeUInt32(view, offset, 600000); // requested lifetime
  offset += 4;
  writeUInt32(view, offset, 0); // nonce length

  return frame;
}

/**
 * Build an OPC UA Close Secure Channel (CLO) message.
 */
export function buildOpcUaCloseSecureChannelFrame(options: {
  secureChannelId: number;
  tokenId: number;
  sequenceNumber: number;
  requestId: number;
}): Uint8Array {
  const body = buildSymmetricServiceBody({
    secureChannelId: options.secureChannelId,
    tokenId: options.tokenId,
    sequenceNumber: options.sequenceNumber,
    requestId: options.requestId,
    serviceTypeId: ServiceTypeId.CloseSecureChannelRequest,
    requestBody: new Uint8Array(0),
  });
  return wrapMessage("CLO", body);
}

/**
 * Build an OPC UA MSG (service request) frame.
 * Wraps a service body with the symmetric secure channel header.
 */
export function buildOpcUaServiceRequest(options: {
  secureChannelId: number;
  tokenId: number;
  sequenceNumber: number;
  requestId: number;
  serviceTypeId: number;
  requestBody: Uint8Array;
}): Uint8Array {
  const body = buildSymmetricServiceBody(options);
  return wrapMessage("MSG", body);
}

/** Build the body portion of a symmetric (MSG/CLO) message. */
function buildSymmetricServiceBody(options: {
  secureChannelId: number;
  tokenId: number;
  sequenceNumber: number;
  requestId: number;
  serviceTypeId: number;
  requestBody: Uint8Array;
}): Uint8Array {
  const w = new BinaryWriter();

  // Symmetric security header
  w.writeUInt32(options.secureChannelId);
  w.writeUInt32(options.tokenId);

  // Sequence header
  w.writeUInt32(options.sequenceNumber);
  w.writeUInt32(options.requestId);

  // ExpandedNodeId for the service type (namespace 0, numeric)
  encodeNodeId(w, { namespace: 0, identifierType: "numeric", identifier: options.serviceTypeId });

  // RequestHeader
  encodeNodeId(w, { namespace: 0, identifierType: "numeric", identifier: 0 }); // SessionId: null
  w.writeInt64(0n);                  // Timestamp
  w.writeUInt32(options.requestId);  // RequestHandle
  w.writeUInt32(0);                  // ReturnDiagnostics
  w.writeInt32(-1);                  // AuditEntryId: null
  w.writeUInt32(30000);              // TimeoutHint
  w.writeUInt8(0x00);                // AdditionalHeader: null ExtensionObject

  // Service-specific body
  w.writeBytes(options.requestBody);

  return w.toUint8Array();
}

/** Wrap a body in an 8-byte message header (type + 'F' + size). */
function wrapMessage(msgType: string, body: Uint8Array): Uint8Array {
  const totalSize = 8 + body.length;
  const frame = new Uint8Array(totalSize);
  frame[0] = msgType.charCodeAt(0);
  frame[1] = msgType.charCodeAt(1);
  frame[2] = msgType.charCodeAt(2);
  frame[3] = 0x46; // 'F' = Final
  new DataView(frame.buffer).setUint32(4, totalSize, true);
  frame.set(body, 8);
  return frame;
}

// ─── Service Request Body Builders ───────────────────────────────────

/**
 * Build the body of a BrowseRequest.
 * @param nodeId - NodeId to browse from (default: RootFolder i=84)
 */
export function buildBrowseRequestBody(options: {
  nodeId: OpcUaNodeId;
  browseDirection?: number;
  referenceTypeId?: OpcUaNodeId;
  includeSubtypes?: boolean;
  nodeClassMask?: number;
  resultMask?: number;
}): Uint8Array {
  const w = new BinaryWriter();

  // ViewId: null NodeId
  encodeNodeId(w, { namespace: 0, identifierType: "numeric", identifier: 0 });

  // RequestedMaxReferencesPerNode
  w.writeUInt32(1000);

  // BrowseDescription (array of 1)
  w.writeInt32(1);
  encodeNodeId(w, options.nodeId);
  w.writeUInt32(options.browseDirection ?? 0); // Forward
  encodeNodeId(w, options.referenceTypeId ?? { namespace: 0, identifierType: "numeric", identifier: 0 });
  w.writeUInt8(options.includeSubtypes ? 1 : 0);
  w.writeUInt32(options.nodeClassMask ?? 0);   // all classes
  w.writeUInt32(options.resultMask ?? 0x3f);   // all fields

  return w.toUint8Array();
}

/**
 * Build the body of a BrowseNextRequest.
 */
export function buildBrowseNextRequestBody(options: {
  releaseContinuationPoints: boolean;
  continuationPoint: Uint8Array;
}): Uint8Array {
  const w = new BinaryWriter();
  w.writeUInt8(options.releaseContinuationPoints ? 1 : 0);
  w.writeInt32(1); // one continuation point
  w.writeInt32(options.continuationPoint.length);
  w.writeBytes(options.continuationPoint);
  return w.toUint8Array();
}

/**
 * Build the body of a ReadRequest.
 * @param nodeIds - Array of NodeIds to read
 * @param attributeId - Attribute to read (default: Value = 13)
 */
export function buildReadRequestBody(options: {
  nodeIds: OpcUaNodeId[];
  attributeId?: number;
  maxAge?: number;
  timestampsToReturn?: number;
}): Uint8Array {
  const w = new BinaryWriter();

  w.writeFloat64(options.maxAge ?? 0);
  w.writeUInt32(options.timestampsToReturn ?? 0); // Both

  // NodesToRead array
  w.writeInt32(options.nodeIds.length);
  for (const nodeId of options.nodeIds) {
    encodeNodeId(w, nodeId);
    w.writeUInt32(options.attributeId ?? AttributeId.Value);
    w.writeString(null); // IndexRange
    w.writeUInt16(0);    // DataEncoding namespace
    w.writeInt32(-1);    // DataEncoding name: null
  }

  return w.toUint8Array();
}

/**
 * Build the body of a WriteRequest.
 */
export function buildWriteRequestBody(options: {
  nodeIds: OpcUaNodeId[];
  values: OpcUaVariant[];
}): Uint8Array {
  const w = new BinaryWriter();

  w.writeInt32(options.nodeIds.length);
  for (let i = 0; i < options.nodeIds.length; i++) {
    encodeNodeId(w, options.nodeIds[i]);
    w.writeUInt32(AttributeId.Value);
    w.writeString(null); // IndexRange
    // DataValue with only the Value flag set
    w.writeUInt8(0x01);
    encodeVariant(w, options.values[i]);
  }

  return w.toUint8Array();
}

/**
 * Build the body of a CreateSubscriptionRequest.
 */
export function buildCreateSubscriptionRequestBody(options: {
  requestedPublishingInterval: number;
  requestedLifetimeCount?: number;
  requestedMaxKeepAliveCount?: number;
  maxNotificationsPerPublish?: number;
  publishingEnabled?: boolean;
  priority?: number;
}): Uint8Array {
  const w = new BinaryWriter();
  w.writeFloat64(options.requestedPublishingInterval);
  w.writeUInt32(options.requestedLifetimeCount ?? 1000);
  w.writeUInt32(options.requestedMaxKeepAliveCount ?? 10);
  w.writeUInt32(options.maxNotificationsPerPublish ?? 0);
  w.writeUInt8(options.publishingEnabled !== false ? 1 : 0);
  w.writeUInt8(options.priority ?? 0);
  return w.toUint8Array();
}

/**
 * Build the body of a CreateMonitoredItemsRequest.
 */
export function buildCreateMonitoredItemsRequestBody(options: {
  subscriptionId: number;
  nodeIds: OpcUaNodeId[];
  attributeId?: number;
  samplingInterval?: number;
  queueSize?: number;
}): Uint8Array {
  const w = new BinaryWriter();

  w.writeUInt32(options.subscriptionId);
  w.writeUInt32(0); // TimestampsToReturn: Both

  // ItemsToCreate array
  w.writeInt32(options.nodeIds.length);
  for (let i = 0; i < options.nodeIds.length; i++) {
    w.writeUInt32(0); // MonitoredItemId (server assigns)
    // ItemToMonitor
    encodeNodeId(w, options.nodeIds[i]);
    w.writeUInt32(options.attributeId ?? AttributeId.Value);
    w.writeString(null); // IndexRange
    w.writeUInt16(0);    // DataEncoding namespace
    w.writeInt32(-1);    // DataEncoding name: null
    // MonitoringMode: Reporting
    w.writeUInt32(1);
    // RequestedParameters
    w.writeUInt32(i + 1); // ClientHandle
    w.writeFloat64(options.samplingInterval ?? 1000);
    w.writeUInt8(0x00); // Filter: null ExtensionObject
    w.writeUInt32(options.queueSize ?? 1);
    w.writeUInt8(1); // DiscardOldest
  }

  return w.toUint8Array();
}

/**
 * Build the body of a PublishRequest.
 * The first PublishRequest is sent immediately after creating monitored items.
 */
export function buildPublishRequestBody(options: {
  subscriptionIds: number[];
}): Uint8Array {
  const w = new BinaryWriter();
  // SubscriptionAcknowledgements
  w.writeInt32(options.subscriptionIds.length);
  for (const subId of options.subscriptionIds) {
    w.writeUInt32(subId);
    w.writeUInt32(0); // SequenceNumber
  }
  return w.toUint8Array();
}

// ─── Response Parsers ────────────────────────────────────────────────

/**
 * Parse a BrowseResponse frame.
 * Returns an array of OpcUaBrowseResult.
 */
export function parseBrowseResponse(frame: Uint8Array): OpcUaBrowseResult[] {
  const reader = new BinaryReader(frame);
  reader.skip(8);  // message header
  reader.skip(8);  // symmetric security header
  reader.skip(8);  // sequence header
  decodeExpandedNodeId(reader); // response type NodeId
  const { serviceResult } = parseOpcUaResponseHeader(reader);

  if (serviceResult !== 0) return [{ statusCode: serviceResult, references: [] }];

  const count = reader.readInt32();
  const results: OpcUaBrowseResult[] = [];

  for (let i = 0; i < count; i++) {
    const statusCode = reader.readUInt32();

    // ContinuationPoint
    const cpLen = reader.readInt32();
    const continuationPoint = cpLen > 0 ? reader.readBytes(cpLen) : undefined;

    // References
    const refCount = reader.readInt32();
    const references: OpcUaReferenceDescription[] = [];
    for (let j = 0; j < refCount; j++) {
      references.push({
        referenceTypeId: decodeNodeId(reader),
        isForward: reader.readUInt8() !== 0,
        nodeId: decodeExpandedNodeId(reader),
        browseName: reader.readString(),
        displayName: reader.readString(),
        nodeClass: reader.readUInt32(),
        typeDefinition: decodeExpandedNodeId(reader),
      });
    }

    results.push({ statusCode, continuationPoint, references });
  }

  reader.readInt32(); // DiagnosticInfos (usually empty)
  return results;
}

/**
 * Parse a ReadResponse frame.
 * Returns an array of OpcUaDataValue.
 */
export function parseReadResponse(frame: Uint8Array): OpcUaDataValue[] {
  const reader = new BinaryReader(frame);
  reader.skip(8);
  reader.skip(8);
  reader.skip(8);
  decodeExpandedNodeId(reader);
  const { serviceResult } = parseOpcUaResponseHeader(reader);

  if (serviceResult !== 0) return [];

  const count = reader.readInt32();
  const results: OpcUaDataValue[] = [];
  for (let i = 0; i < count; i++) results.push(decodeDataValue(reader));

  reader.readInt32(); // DiagnosticInfos
  return results;
}

/**
 * Parse a WriteResponse frame.
 * Returns an array of StatusCode values.
 */
export function parseWriteResponse(frame: Uint8Array): number[] {
  const reader = new BinaryReader(frame);
  reader.skip(8);
  reader.skip(8);
  reader.skip(8);
  decodeExpandedNodeId(reader);
  const { serviceResult } = parseOpcUaResponseHeader(reader);

  if (serviceResult !== 0) return [];

  const count = reader.readInt32();
  const results: number[] = [];
  for (let i = 0; i < count; i++) results.push(reader.readUInt32());

  reader.readInt32(); // DiagnosticInfos
  return results;
}

/**
 * Parse a CreateSubscriptionResponse frame.
 */
export function parseCreateSubscriptionResponse(frame: Uint8Array): {
  subscriptionId: number;
  revisedPublishingInterval: number;
  revisedLifetimeCount: number;
  revisedMaxKeepAliveCount: number;
} | null {
  const reader = new BinaryReader(frame);
  reader.skip(8);
  reader.skip(8);
  reader.skip(8);
  decodeExpandedNodeId(reader);
  const { serviceResult } = parseOpcUaResponseHeader(reader);

  if (serviceResult !== 0) return null;

  return {
    subscriptionId: reader.readUInt32(),
    revisedPublishingInterval: reader.readFloat64(),
    revisedLifetimeCount: reader.readUInt32(),
    revisedMaxKeepAliveCount: reader.readUInt32(),
  };
}

/**
 * Parse a CreateMonitoredItemsResponse frame.
 */
export function parseCreateMonitoredItemsResponse(frame: Uint8Array): Array<{
  monitoredItemId: number;
  statusCode: number;
  samplingInterval: number;
  queueSize: number;
}> {
  const reader = new BinaryReader(frame);
  reader.skip(8);
  reader.skip(8);
  reader.skip(8);
  decodeExpandedNodeId(reader);
  const { serviceResult } = parseOpcUaResponseHeader(reader);

  if (serviceResult !== 0) return [];

  const count = reader.readInt32();
  const results: Array<{
    monitoredItemId: number;
    statusCode: number;
    samplingInterval: number;
    queueSize: number;
  }> = [];

  for (let i = 0; i < count; i++) {
    const monitoredItemId = reader.readUInt32();
    const statusCode = reader.readUInt32();
    const samplingInterval = reader.readFloat64();
    const queueSize = reader.readUInt32();
    reader.readUInt8(); // FilterResult: null ExtensionObject
    results.push({ monitoredItemId, statusCode, samplingInterval, queueSize });
  }

  reader.readInt32(); // DiagnosticInfos
  return results;
}

/**
 * Parse a PublishResponse frame.
 * Returns subscription notifications or null on error.
 */
export function parsePublishResponse(frame: Uint8Array): {
  subscriptionId: number;
  notifications: Array<{ nodeId: OpcUaNodeId; value: OpcUaDataValue }>;
} | null {
  const reader = new BinaryReader(frame);
  reader.skip(8);
  reader.skip(8);
  reader.skip(8);
  decodeExpandedNodeId(reader);
  const { serviceResult } = parseOpcUaResponseHeader(reader);

  if (serviceResult !== 0) return null;

  const subscriptionId = reader.readUInt32();

  // AvailableSequenceNumbers
  const seqCount = reader.readInt32();
  for (let i = 0; i < seqCount; i++) reader.readUInt32();

  reader.readUInt8(); // MoreNotifications

  // NotificationMessage
  reader.readUInt32(); // SequenceNumber
  reader.readInt64();   // PublishTime

  // NotificationData (array of ExtensionObject)
  const ndCount = reader.readInt32();
  const notifications: Array<{ nodeId: OpcUaNodeId; value: OpcUaDataValue }> = [];

  for (let i = 0; i < ndCount; i++) {
    const enc = reader.readUInt8();
    if (enc === 0x00) continue; // null ExtensionObject

    decodeExpandedNodeId(reader); // TypeId
    const bodyEncoding = reader.readUInt8();

    if (bodyEncoding === 0x01) {
      // Body is ByteString
      const bodyLen = reader.readInt32();
      if (bodyLen > 0) {
        const body = reader.readBytes(bodyLen);
        const br = new BinaryReader(body);

        // DataChangeNotification
        const miCount = br.readInt32();
        for (let j = 0; j < miCount; j++) {
          br.readUInt32(); // ClientHandle
          const dataValue = decodeDataValue(br);
          notifications.push({
            nodeId: { namespace: 0, identifierType: "numeric", identifier: 0 },
            value: dataValue,
          });
        }
        br.readInt32(); // DiagnosticInfos
      }
    } else if (bodyEncoding === 0x02) {
      const bodyLen = reader.readInt32();
      if (bodyLen > 0) reader.readBytes(bodyLen);
    }
  }

  return { subscriptionId, notifications };
}

// ─── NodeId String Parsing ───────────────────────────────────────────

/**
 * Parse an OPC UA NodeId string representation.
 * Supports formats: "i=84", "ns=2;s=MyNode", "g=...", "b=..."
 */
export function parseNodeIdString(nodeIdStr: string): OpcUaNodeId {
  const parts = nodeIdStr.split(";");
  let namespace = 0;
  let identifierStr = nodeIdStr;

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith("ns=")) {
      namespace = parseInt(trimmed.substring(3), 10);
    } else {
      identifierStr = trimmed;
    }
  }

  if (identifierStr.startsWith("i=")) {
    return { namespace, identifierType: "numeric", identifier: parseInt(identifierStr.substring(2), 10) };
  }
  if (identifierStr.startsWith("s=")) {
    return { namespace, identifierType: "string", identifier: identifierStr.substring(2) };
  }
  if (identifierStr.startsWith("g=")) {
    const hex = identifierStr.substring(2).replace(/-/g, "");
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    return { namespace, identifierType: "guid", identifier: bytes };
  }
  if (identifierStr.startsWith("b=")) {
    const binary = globalThis.atob(identifierStr.substring(2));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { namespace, identifierType: "opaque", identifier: bytes };
  }

  // Fallback: try numeric
  const num = parseInt(identifierStr, 10);
  if (!isNaN(num)) return { namespace, identifierType: "numeric", identifier: num };
  return { namespace, identifierType: "string", identifier: identifierStr };
}

/**
 * Convert an OpcUaNodeId to its string representation.
 */
export function nodeIdToString(nodeId: OpcUaNodeId): string {
  const prefix = nodeId.namespace !== 0 ? `ns=${nodeId.namespace};` : "";
  switch (nodeId.identifierType) {
    case "numeric": return `${prefix}i=${nodeId.identifier}`;
    case "string":  return `${prefix}s=${nodeId.identifier}`;
    case "guid": {
      const hex = Array.from(nodeId.identifier as Uint8Array).map(b => b.toString(16).padStart(2, "0")).join("");
      return `${prefix}g=${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    case "opaque": {
      const bytes = nodeId.identifier as Uint8Array;
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return `${prefix}b=${globalThis.btoa(binary)}`;
    }
    default: return `${prefix}${String(nodeId.identifier)}`;
  }
}

// ─── Capability Definitions ──────────────────────────────────────────

/** OPC UA capability action identifiers. */
export const OpcUaCapabilities = {
  /** Send HEL and wait for ACK — basic connectivity test. */
  HelloProbe: "opcua:hello-probe",
  /** Send OPN and wait for OPN response — secure channel test. */
  OpenSecureChannelProbe: "opcua:open-secure-channel-probe",
  /** Browse the address space from a given NodeId. */
  Browse: "opcua:browse",
  /** Continue a browse that returned a continuation point. */
  BrowseNext: "opcua:browseNext",
  /** Read node attribute values. */
  Read: "opcua:read",
  /** Write node attribute values. */
  Write: "opcua:write",
  /** Create a subscription for monitored data changes. */
  CreateSubscription: "opcua:createSubscription",
  /** Create monitored items within a subscription. */
  CreateMonitoredItems: "opcua:createMonitoredItems",
  /** Send a Publish request to receive subscription notifications. */
  Publish: "opcua:publish",
} as const;
