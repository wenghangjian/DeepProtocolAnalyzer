/**
 * IEC 61850 MMS (Manufacturing Message Specification) Capabilities
 *
 * Implements the MMS subset used in IEC 61850 power utility automation:
 * - ASN.1 BER (Basic Encoding Rules) encoder/decoder
 * - TPKT (RFC 1006) and COTP (ISO 8073) transport framing
 * - MMS PDU construction and parsing
 * - MMS services: GetNameList, Read, Write, GetVariableAccessAttributes,
 *   DefineNamedVariable, DeleteNamedVariableAccess, Identify, Conclude
 * - IEC 61850 logical device/node data model helpers
 */

// ─── MMS Constants ────────────────────────────────────────────────────

/** MMS PDU type tags (CHOICE tags in MMS PDU) */
export const MmsPduType = {
  /** [0] confirmed-RequestPDU */
  ConfirmedRequest: 0,
  /** [1] confirmed-ResponsePDU */
  ConfirmedResponse: 1,
  /** [2] confirmed-ErrorPDU */
  ConfirmedError: 2,
  /** [3] unconfirmed-PDU */
  Unconfirmed: 3,
  /** [4] rejectPDU */
  Reject: 4,
  /** [8] initiate-RequestPDU */
  InitiateRequest: 8,
  /** [9] initiate-ResponsePDU */
  InitiateResponse: 9,
  /** [10] conclude-RequestPDU */
  ConcludeRequest: 10,
  /** [11] conclude-ResponsePDU */
  ConcludeResponse: 11
} as const;

/** MMS confirmed service request tags */
export const MmsServiceRequest = {
  GetNameList: 0,
  Read: 4,
  Write: 5,
  GetVariableAccessAttributes: 6,
  DefineNamedVariable: 11,
  DeleteNamedVariableAccess: 12,
  Identify: 82
} as const;

/** MMS confirmed service response tags */
export const MmsServiceResponse = {
  GetNameList: 0,
  Read: 4,
  Write: 5,
  GetVariableAccessAttributes: 6,
  DefineNamedVariable: 11,
  DeleteNamedVariableAccess: 12,
  Identify: 82
} as const;

/** MMS object class tags */
export const MmsObjectClass = {
  NamedVariable: 0,
  NamedVariableList: 2,
  Domain: 9,
  ProgramInvocation: 11,
  OperationStation: 12
} as const;

/** MMS variable specification tags */
export const MmsVariableSpec = {
  Name: 0,
  Address: 1,
  ScatteredAccessDescription: 2,
  Invalidated: 3
} as const;

/** MMS data type tags */
export const MmsDataType = {
  Array: 0,
  Structure: 1,
  Boolean: 2,
  BitString: 3,
  Integer: 4,
  Unsigned: 5,
  FloatingPoint: 6,
  OctetString: 7,
  VisibleString: 8,
  GeneralizedTime: 9,
  BinaryTime: 10,
  BCD: 11,
  ObjectIdentifier: 12,
  MMSString: 15
} as const;

/** MMS object scope tags for GetNameList */
export const MmsObjectScope = {
  VMDSpecific: 0,
  DomainSpecific: 1,
  AAASpecific: 2
} as const;

/** MMS data access error codes */
export const MmsDataAccessError = {
  ObjectInvalidated: 0,
  HardwareFault: 1,
  TemporarilyUnavailable: 2,
  ObjectAccessDenied: 3,
  ObjectUndefined: 4,
  InvalidAddress: 5,
  TypeUnsupported: 6,
  TypeInconsistent: 7,
  ObjectAttributeInconsistent: 8,
  ObjectAccessUnsupported: 9,
  ObjectNonExistent: 10,
  ObjectAttributeValueInvalid: 11
} as const;

/** IEC 61850 Functional Constraints */
export const FunctionalConstraint = {
  MX: "MX",   // Measurands
  ST: "ST",   // Status information
  CO: "CO",   // Control
  SP: "SP",   // Setpoints
  CF: "CF",   // Configuration
  DC: "DC",   // Description
  SG: "SG",   // Setting groups
  SE: "SE",   // Setting group editable
  EX: "EX",   // Extended definition
  SV: "SV"    // Setting values
} as const;

export type FunctionalConstraintType = keyof typeof FunctionalConstraint;

/** IEC 61850 common Logical Node classes */
export const LogicalNodeClass = {
  /** Measurement — voltage, current, power */
  MMXU: "MMXU",
  /** Circuit breaker */
  XCBR: "XCBR",
  /** Switch controller */
  CSWI: "CSWI",
  /** Distance protection */
  PDIS: "PDIS",
  /** Time overcurrent */
  PTOC: "PTOC",
  /** Generic I/O */
  GGIO: "GGIO",
  /** Logical node zero */
  LLN0: "LLN0",
  /** Physical device information */
  LPHD: "LPHD"
} as const;

// ─── Type Definitions ─────────────────────────────────────────────────

/** MMS typed value representation */
export interface MmsValue {
  /** MMS data type tag */
  type: number;
  /** The value — type depends on `type` field */
  value: unknown;
}

/** MMS type description from GetVariableAccessAttributes */
export interface MmsTypeDescription {
  /** MMS data type tag */
  typeTag: number;
  /** Array element type (for arrays) */
  elementType?: MmsTypeDescription;
  /** Array length (for arrays) */
  arrayLength?: number;
  /** Structure components (for structures) */
  components?: Array<{
    name: string;
    type: MmsTypeDescription;
  }>;
  /** Human-readable type name */
  typeName: string;
}

/** Parsed MMS PDU */
export interface MmsPdu {
  type: number;
  data: unknown;
}

/** MMS Initiate request parameters */
export interface MmsInitiateRequest {
  localDetailCalling?: number;
  proposedMaxServOutstandingCalling?: number;
  proposedMaxServOutstandingCalled?: number;
  proposedDataStructureNestingLevel?: number;
  mmsInitRequestDetail?: {
    proposedVersionNumber?: number;
    proposedParameterCBB?: Uint8Array;
    servicesSupportedCalled?: Uint8Array;
  };
}

/** MMS Initiate response parameters */
export interface MmsInitiateResponse {
  localDetailCalled?: number;
  negotiatedMaxServOutstandingCalling?: number;
  negotiatedMaxServOutstandingCalled?: number;
  negotiatedDataStructureNestingLevel?: number;
  mmsInitResponseDetail?: {
    negotiatedVersionNumber?: number;
  };
}

/** MMS Confirmed request */
export interface MmsConfirmedRequest {
  invokeId: number;
  service: number;
  serviceData: unknown;
}

/** MMS Confirmed response */
export interface MmsConfirmedResponse {
  invokeId: number;
  service: number;
  serviceData: unknown;
}

/** MMS Confirmed error */
export interface MmsConfirmedError {
  invokeId: number;
  errorClass: number;
  errorCode: number;
}

/** GetNameList request */
export interface GetNameListRequest {
  objectClass: number;
  objectScope: {
    type: number;
    value?: string;
  };
  continueAfter?: string;
}

/** GetNameList response */
export interface GetNameListResponse {
  identifiers: string[];
  moreFollows: boolean;
}

/** Read request */
export interface MmsReadRequest {
  specificationWithResult?: boolean;
  variableAccessSpecification: {
    listOfVariable: Array<{
      variableSpecification: {
        type: number;
        value: unknown;
      };
      alternateAccess?: unknown;
    }>;
  };
}

/** Read response */
export interface MmsReadResponse {
  listOfAccessResult: Array<{
    success?: MmsValue;
    failure?: {
      errorClass: number;
      errorCode: number;
    };
  }>;
}

/** Write request */
export interface MmsWriteRequest {
  variableAccessSpecification: {
    listOfVariable: Array<{
      variableSpecification: {
        type: number;
        value: unknown;
      };
    }>;
  };
  listOfData: MmsValue[];
}

/** Write response */
export interface MmsWriteResponse {
  listOfWriteResult: Array<{
    success?: boolean;
    failure?: {
      errorClass: number;
      errorCode: number;
    };
  }>;
}

/** GetVariableAccessAttributes request */
export interface GetVarAccessAttrRequest {
  name?: {
    domainId?: string;
    itemId: string;
  };
}

/** GetVariableAccessAttributes response */
export interface GetVarAccessAttrResponse {
  mmsDeletable: boolean;
  typeDescription: MmsTypeDescription;
}

/** DefineNamedVariable request */
export interface DefineNamedVariableRequest {
  variableName: {
    domainId?: string;
    itemId: string;
  };
  address?: Uint8Array;
  typeSpecification?: MmsTypeDescription;
}

/** DeleteNamedVariableAccess request */
export interface DeleteNamedVariableAccessRequest {
  scopeOfDelete: number;
  listOfName: Array<{
    domainId?: string;
    itemId: string;
  }>;
}

/** Identify response */
export interface MmsIdentifyResponse {
  vendorName: string;
  modelName: string;
  revision: string;
}

/** IEC 61850 reference components */
export interface Iec61850Reference {
  /** Logical Device name */
  ld: string;
  /** Logical Node name */
  ln: string;
  /** Data Object name */
  doName?: string;
  /** Data Attribute path (e.g., "mag.f", "stVal") */
  daPath?: string;
  /** Functional Constraint (MX, ST, CO, etc.) */
  fc?: string;
}

// ─── ASN.1 BER Encoder ────────────────────────────────────────────────

/**
 * ASN.1 BER (Basic Encoding Rules) encoder.
 * Builds TLV (Tag-Length-Value) encoded byte sequences.
 */
export class BerEncoder {
  private chunks: Uint8Array[] = [];
  private totalLength = 0;

  /** Write a raw byte */
  writeByte(value: number): void {
    const buf = new Uint8Array(1);
    buf[0] = value & 0xff;
    this.chunks.push(buf);
    this.totalLength += 1;
  }

  /** Write raw bytes */
  writeBytes(data: Uint8Array): void {
    this.chunks.push(new Uint8Array(data));
    this.totalLength += data.length;
  }

  /**
   * Encode an ASN.1 tag.
   * @param tagClass - 0=Universal, 1=Application, 2=Context, 3=Private
   * @param constructed - true for constructed (sequence/set), false for primitive
   * @param tagNumber - the tag number
   */
  encodeTag(tagClass: number, constructed: boolean, tagNumber: number): void {
    let firstByte = (tagClass & 0x03) << 6;
    if (constructed) firstByte |= 0x20;
    if (tagNumber < 31) {
      firstByte |= tagNumber & 0x1f;
      this.writeByte(firstByte);
    } else {
      firstByte |= 0x1f;
      this.writeByte(firstByte);
      // Long form tag number
      const bytes: number[] = [];
      let n = tagNumber;
      bytes.push(n & 0x7f);
      n >>= 7;
      while (n > 0) {
        bytes.push((n & 0x7f) | 0x80);
        n >>= 7;
      }
      bytes.reverse();
      for (const b of bytes) {
        this.writeByte(b);
      }
    }
  }

  /**
   * Encode ASN.1 length field.
   * @param length - the length of the value field
   */
  encodeLength(length: number): void {
    if (length < 0x80) {
      this.writeByte(length);
    } else if (length < 0x100) {
      this.writeByte(0x81);
      this.writeByte(length);
    } else if (length < 0x10000) {
      this.writeByte(0x82);
      this.writeByte((length >> 8) & 0xff);
      this.writeByte(length & 0xff);
    } else if (length < 0x1000000) {
      this.writeByte(0x83);
      this.writeByte((length >> 16) & 0xff);
      this.writeByte((length >> 8) & 0xff);
      this.writeByte(length & 0xff);
    } else {
      this.writeByte(0x84);
      this.writeByte((length >> 24) & 0xff);
      this.writeByte((length >> 16) & 0xff);
      this.writeByte((length >> 8) & 0xff);
      this.writeByte(length & 0xff);
    }
  }

  /**
   * Encode a complete TLV (Tag-Length-Value) element.
   * @param tagClass - ASN.1 tag class
   * @param constructed - whether the element is constructed
   * @param tagNumber - the tag number
   * @param value - the value bytes
   */
  encodeTLV(tagClass: number, constructed: boolean, tagNumber: number, value: Uint8Array): void {
    this.encodeTag(tagClass, constructed, tagNumber);
    this.encodeLength(value.length);
    this.writeBytes(value);
  }

  /**
   * Encode a context-tagged element with a pre-encoded value.
   * Context class (2) is used for MMS protocol elements.
   */
  encodeContextTLV(contextTag: number, value: Uint8Array): void {
    this.encodeTLV(2, true, contextTag, value);
  }

  /**
   * Encode a context-tagged primitive element.
   */
  encodeContextPrimitive(contextTag: number, value: Uint8Array): void {
    this.encodeTag(2, false, contextTag);
    this.encodeLength(value.length);
    this.writeBytes(value);
  }

  /**
   * Encode a BOOLEAN value.
   * Universal tag 1.
   */
  encodeBoolean(value: boolean): void {
    this.encodeTLV(0, false, MmsDataType.Boolean, new Uint8Array([value ? 0xff : 0x00]));
  }

  /**
   * Encode an INTEGER value (signed, big-endian, minimal bytes).
   * Universal tag 2.
   */
  encodeInteger(value: number): void {
    const bytes = encodeIntegerBytes(value);
    this.encodeTLV(0, false, MmsDataType.Integer, bytes);
  }

  /**
   * Encode an UNSIGNED value.
   * Universal tag 2 (same as integer, but positive).
   */
  encodeUnsigned(value: number): void {
    const bytes = encodeUnsignedBytes(value);
    this.encodeTLV(0, false, MmsDataType.Unsigned, bytes);
  }

  /**
   * Encode a BIT STRING value.
   * Universal tag 3.
   * @param bits - the bit string as bytes
   * @param unusedBits - number of unused bits in the last byte
   */
  encodeBitString(bits: Uint8Array, unusedBits = 0): void {
    const value = new Uint8Array(bits.length + 1);
    value[0] = unusedBits;
    value.set(bits, 1);
    this.encodeTLV(0, false, MmsDataType.BitString, value);
  }

  /**
   * Encode an OCTET STRING value.
   * Universal tag 4.
   */
  encodeOctetString(value: Uint8Array): void {
    this.encodeTLV(0, false, MmsDataType.OctetString, value);
  }

  /**
   * Encode a VISIBLE STRING value.
   * Universal tag 26.
   */
  encodeVisibleString(value: string): void {
    const bytes = new TextEncoder().encode(value);
    this.encodeTLV(0, false, MmsDataType.VisibleString, bytes);
  }

  /**
   * Encode an MMS String (UTF-8).
   * Application tag 15.
   */
  encodeMMSString(value: string): void {
    const bytes = new TextEncoder().encode(value);
    this.encodeTLV(1, false, MmsDataType.MMSString, bytes);
  }

  /**
   * Encode a FLOATING POINT value (IEEE 754).
   * Universal tag 9.
   * @param value - the float value
   * @param doublePrecision - true for 64-bit, false for 32-bit
   */
  encodeFloatingPoint(value: number, doublePrecision = false): void {
    const buf = new ArrayBuffer(doublePrecision ? 8 : 4);
    if (doublePrecision) {
      new DataView(buf).setFloat64(0, value, false); // big-endian
    } else {
      new DataView(buf).setFloat32(0, value, false); // big-endian
    }
    // Prepend exponent width byte
    const exponentWidth = doublePrecision ? 8 : 3; // IEEE 754 exponent bytes
    const valueBytes = new Uint8Array(buf);
    const encoded = new Uint8Array(1 + valueBytes.length);
    encoded[0] = exponentWidth;
    encoded.set(valueBytes, 1);
    this.encodeTLV(0, false, MmsDataType.FloatingPoint, encoded);
  }

  /**
   * Encode a BINARY TIME value (4 bytes: ms since midnight + days since epoch).
   * Application tag 10.
   */
  encodeBinaryTime(date: Date): void {
    const msSinceMidnight =
      date.getUTCHours() * 3600000 +
      date.getUTCMinutes() * 60000 +
      date.getUTCSeconds() * 1000 +
      date.getUTCMilliseconds();
    const epoch = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const daysSinceEpoch = Math.floor((date.getTime() - epoch.getTime()) / 86400000);

    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, msSinceMidnight, false); // big-endian
    // MMS binary time uses 4 bytes for ms-since-midnight
    // Some implementations use 6 bytes (adding 2 bytes for days)
    // We use the 4-byte variant (time-of-day only)
    this.encodeTLV(1, false, MmsDataType.BinaryTime, buf);
  }

  /**
   * Encode an OBJECT IDENTIFIER value.
   * Universal tag 6.
   */
  encodeObjectIdentifier(oid: number[]): void {
    if (oid.length < 2) {
      this.encodeTLV(0, false, MmsDataType.ObjectIdentifier, new Uint8Array(0));
      return;
    }
    const bytes: number[] = [];
    bytes.push(oid[0] * 40 + oid[1]);
    for (let i = 2; i < oid.length; i++) {
      const subId = oid[i];
      if (subId < 128) {
        bytes.push(subId);
      } else {
        const encoded: number[] = [];
        let n = subId;
        encoded.push(n & 0x7f);
        n >>= 7;
        while (n > 0) {
          encoded.push((n & 0x7f) | 0x80);
          n >>= 7;
        }
        encoded.reverse();
        bytes.push(...encoded);
      }
    }
    this.encodeTLV(0, false, MmsDataType.ObjectIdentifier, new Uint8Array(bytes));
  }

  /**
   * Encode a NULL value (empty).
   * Universal tag 5.
   */
  encodeNull(): void {
    this.encodeTag(0, false, 5);
    this.encodeLength(0);
  }

  /**
   * Encode an MMS Data element.
   * This is the CHOICE type used in Read/Write responses.
   */
  encodeMmsData(value: MmsValue): Uint8Array {
    const inner = new BerEncoder();
    switch (value.type) {
      case MmsDataType.Boolean:
        inner.encodeBoolean(value.value as boolean);
        break;
      case MmsDataType.Integer:
        inner.encodeInteger(value.value as number);
        break;
      case MmsDataType.Unsigned:
        inner.encodeUnsigned(value.value as number);
        break;
      case MmsDataType.FloatingPoint:
        inner.encodeFloatingPoint(value.value as number, false);
        break;
      case MmsDataType.BitString:
        inner.encodeBitString(value.value as Uint8Array);
        break;
      case MmsDataType.OctetString:
        inner.encodeOctetString(value.value as Uint8Array);
        break;
      case MmsDataType.VisibleString:
        inner.encodeVisibleString(value.value as string);
        break;
      case MmsDataType.MMSString:
        inner.encodeMMSString(value.value as string);
        break;
      case MmsDataType.BinaryTime:
        inner.encodeBinaryTime(value.value as Date);
        break;
      case MmsDataType.ObjectIdentifier:
        inner.encodeObjectIdentifier(value.value as number[]);
        break;
      case MmsDataType.Array: {
        const arr = value.value as MmsValue[];
        for (const elem of arr) {
          inner.writeBytes(inner.encodeMmsData(elem));
        }
        break;
      }
      case MmsDataType.Structure: {
        const fields = value.value as MmsValue[];
        for (const field of fields) {
          inner.writeBytes(inner.encodeMmsData(field));
        }
        break;
      }
      default:
        inner.encodeNull();
        break;
    }
    return inner.toUint8Array();
  }

  /**
   * Encode a complete MMS Data element with context tag.
   */
  encodeMmsDataWithContextTag(contextTag: number, value: MmsValue): void {
    const dataBytes = this.encodeMmsData(value);
    this.encodeContextTLV(contextTag, dataBytes);
  }

  /**
   * Get the accumulated bytes.
   */
  toUint8Array(): Uint8Array {
    const result = new Uint8Array(this.totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

// ─── ASN.1 BER Decoder ────────────────────────────────────────────────

/**
 * ASN.1 BER (Basic Encoding Rules) decoder.
 * Parses TLV-encoded byte sequences.
 */
export class BerDecoder {
  private data: Uint8Array;
  private offset: number;

  constructor(data: Uint8Array, offset = 0) {
    this.data = data;
    this.offset = offset;
  }

  /** Get current offset */
  getOffset(): number {
    return this.offset;
  }

  /** Get remaining bytes */
  getRemaining(): number {
    return this.data.length - this.offset;
  }

  /** Check if there are more bytes to read */
  hasMore(): boolean {
    return this.offset < this.data.length;
  }

  /** Skip a number of bytes */
  skip(count: number): void {
    this.offset += count;
  }

  /** Read a single byte */
  readByte(): number {
    if (this.offset >= this.data.length) {
      throw new Error("BER decoder: unexpected end of data");
    }
    return this.data[this.offset++];
  }

  /** Peek at the next byte without advancing */
  peekByte(): number {
    if (this.offset >= this.data.length) {
      throw new Error("BER decoder: unexpected end of data");
    }
    return this.data[this.offset];
  }

  /** Read N bytes */
  readBytes(count: number): Uint8Array {
    if (this.offset + count > this.data.length) {
      throw new Error("BER decoder: unexpected end of data");
    }
    const result = this.data.slice(this.offset, this.offset + count);
    this.offset += count;
    return result;
  }

  /**
   * Decode an ASN.1 tag.
   * Returns [tagClass, constructed, tagNumber].
   */
  decodeTag(): [number, boolean, number] {
    const firstByte = this.readByte();
    const tagClass = (firstByte >> 6) & 0x03;
    const constructed = (firstByte & 0x20) !== 0;
    let tagNumber = firstByte & 0x1f;

    if (tagNumber === 0x1f) {
      // Long form tag number
      tagNumber = 0;
      let b: number;
      do {
        b = this.readByte();
        tagNumber = (tagNumber << 7) | (b & 0x7f);
      } while ((b & 0x80) !== 0);
    }

    return [tagClass, constructed, tagNumber];
  }

  /**
   * Decode an ASN.1 length field.
   * Returns the length value, or -1 for indefinite length.
   */
  decodeLength(): number {
    const firstByte = this.readByte();
    if (firstByte < 0x80) {
      return firstByte;
    }
    if (firstByte === 0x80) {
      return -1; // Indefinite length
    }
    const numBytes = firstByte & 0x7f;
    let length = 0;
    for (let i = 0; i < numBytes; i++) {
      length = (length << 8) | this.readByte();
    }
    return length;
  }

  /**
   * Decode a complete TLV element.
   * Returns [tagClass, constructed, tagNumber, valueBytes].
   */
  decodeTLV(): [number, boolean, number, Uint8Array] {
    const [tagClass, constructed, tagNumber] = this.decodeTag();
    const length = this.decodeLength();

    if (length === -1) {
      // Indefinite length — read until two zero bytes (0x00 0x00)
      const start = this.offset;
      while (this.offset < this.data.length - 1) {
        if (this.data[this.offset] === 0x00 && this.data[this.offset + 1] === 0x00) {
          const value = this.data.slice(start, this.offset);
          this.offset += 2; // Skip the end-of-contents octets
          return [tagClass, constructed, tagNumber, value];
        }
        this.offset++;
      }
      throw new Error("BER decoder: indefinite length not terminated");
    }

    const value = this.readBytes(length);
    return [tagClass, constructed, tagNumber, value];
  }

  /**
   * Decode a BOOLEAN value.
   */
  decodeBoolean(): boolean {
    const [, , tagNumber, value] = this.decodeTLV();
    if (tagNumber !== MmsDataType.Boolean) {
      throw new Error(`Expected BOOLEAN (tag 1), got tag ${tagNumber}`);
    }
    return value.length > 0 && value[0] !== 0;
  }

  /**
   * Decode an INTEGER value (signed).
   */
  decodeInteger(): number {
    const [, , tagNumber, value] = this.decodeTLV();
    if (tagNumber !== MmsDataType.Integer) {
      throw new Error(`Expected INTEGER (tag 2), got tag ${tagNumber}`);
    }
    return decodeIntegerValue(value);
  }

  /**
   * Decode an UNSIGNED value.
   */
  decodeUnsigned(): number {
    const [, , tagNumber, value] = this.decodeTLV();
    if (tagNumber !== MmsDataType.Unsigned) {
      throw new Error(`Expected UNSIGNED (tag 2), got tag ${tagNumber}`);
    }
    return decodeUnsignedValue(value);
  }

  /**
   * Decode a BIT STRING value.
   * Returns { bits, unusedBits }.
   */
  decodeBitString(): { bits: Uint8Array; unusedBits: number } {
    const [, , tagNumber, value] = this.decodeTLV();
    if (tagNumber !== MmsDataType.BitString) {
      throw new Error(`Expected BIT STRING (tag 3), got tag ${tagNumber}`);
    }
    if (value.length === 0) {
      return { bits: new Uint8Array(0), unusedBits: 0 };
    }
    return {
      unusedBits: value[0],
      bits: value.slice(1)
    };
  }

  /**
   * Decode an OCTET STRING value.
   */
  decodeOctetString(): Uint8Array {
    const [, , tagNumber, value] = this.decodeTLV();
    if (tagNumber !== MmsDataType.OctetString) {
      throw new Error(`Expected OCTET STRING (tag 4), got tag ${tagNumber}`);
    }
    return value;
  }

  /**
   * Decode a VISIBLE STRING value.
   */
  decodeVisibleString(): string {
    const [, , tagNumber, value] = this.decodeTLV();
    if (tagNumber !== MmsDataType.VisibleString) {
      throw new Error(`Expected VISIBLE STRING (tag 26), got tag ${tagNumber}`);
    }
    return new TextDecoder().decode(value);
  }

  /**
   * Decode a FLOATING POINT value.
   */
  decodeFloatingPoint(): number {
    const [, , tagNumber, value] = this.decodeTLV();
    if (tagNumber !== MmsDataType.FloatingPoint) {
      throw new Error(`Expected FLOATING POINT (tag 9), got tag ${tagNumber}`);
    }
    if (value.length < 2) {
      return 0;
    }
    const exponentWidth = value[0];
    const dataBytes = value.slice(1);
    if (exponentWidth >= 8 && dataBytes.length >= 8) {
      const view = new DataView(dataBytes.buffer, dataBytes.byteOffset, 8);
      return view.getFloat64(0, false);
    } else if (dataBytes.length >= 4) {
      const view = new DataView(dataBytes.buffer, dataBytes.byteOffset, 4);
      return view.getFloat32(0, false);
    }
    return 0;
  }

  /**
   * Decode a BINARY TIME value.
   */
  decodeBinaryTime(): Date {
    const [, , tagNumber, value] = this.decodeTLV();
    if (tagNumber !== MmsDataType.BinaryTime) {
      throw new Error(`Expected BINARY TIME (tag 10), got tag ${tagNumber}`);
    }
    if (value.length < 4) {
      return new Date(0);
    }
    const view = new DataView(value.buffer, value.byteOffset, value.length);
    const msSinceMidnight = view.getUint32(0, false);
    const now = new Date();
    const result = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    result.setUTCMilliseconds(msSinceMidnight);
    return result;
  }

  /**
   * Decode an MMS String (UTF-8).
   */
  decodeMMSString(): string {
    const [, , tagNumber, value] = this.decodeTLV();
    if (tagNumber !== MmsDataType.MMSString) {
      throw new Error(`Expected MMS String (tag 15), got tag ${tagNumber}`);
    }
    return new TextDecoder().decode(value);
  }

  /**
   * Decode an OBJECT IDENTIFIER value.
   */
  decodeObjectIdentifier(): number[] {
    const [, , tagNumber, value] = this.decodeTLV();
    if (tagNumber !== MmsDataType.ObjectIdentifier) {
      throw new Error(`Expected OBJECT IDENTIFIER (tag 6), got tag ${tagNumber}`);
    }
    if (value.length === 0) return [];
    const result: number[] = [];
    result.push(Math.floor(value[0] / 40));
    result.push(value[0] % 40);
    let i = 1;
    while (i < value.length) {
      let subId = 0;
      let b: number;
      do {
        b = value[i++];
        subId = (subId << 7) | (b & 0x7f);
      } while ((b & 0x80) !== 0 && i < value.length);
      result.push(subId);
    }
    return result;
  }

  /**
   * Decode an MMS Data element (CHOICE type).
   * Returns an MmsValue.
   */
  decodeMmsData(): MmsValue {
    const [tagClass, constructed, tagNumber, value] = this.decodeTLV();

    // Context-tagged elements in MMS Data are the CHOICE alternatives
    if (tagClass === 2) {
      const inner = new BerDecoder(value);
      switch (tagNumber) {
        case MmsDataType.Array: {
          const elements: MmsValue[] = [];
          while (inner.hasMore()) {
            elements.push(inner.decodeMmsData());
          }
          return { type: MmsDataType.Array, value: elements };
        }
        case MmsDataType.Structure: {
          const components: MmsValue[] = [];
          while (inner.hasMore()) {
            components.push(inner.decodeMmsData());
          }
          return { type: MmsDataType.Structure, value: components };
        }
        case MmsDataType.Boolean:
          return { type: MmsDataType.Boolean, value: inner.decodeBoolean() };
        case MmsDataType.BitString: {
          const bs = inner.decodeBitString();
          return { type: MmsDataType.BitString, value: bs.bits };
        }
        case MmsDataType.Integer:
          return { type: MmsDataType.Integer, value: inner.decodeInteger() };
        case MmsDataType.Unsigned:
          return { type: MmsDataType.Unsigned, value: inner.decodeUnsigned() };
        case MmsDataType.FloatingPoint:
          return { type: MmsDataType.FloatingPoint, value: inner.decodeFloatingPoint() };
        case MmsDataType.OctetString:
          return { type: MmsDataType.OctetString, value: inner.decodeOctetString() };
        case MmsDataType.VisibleString:
          return { type: MmsDataType.VisibleString, value: inner.decodeVisibleString() };
        case MmsDataType.BinaryTime:
          return { type: MmsDataType.BinaryTime, value: inner.decodeBinaryTime() };
        case MmsDataType.MMSString:
          return { type: MmsDataType.MMSString, value: inner.decodeMMSString() };
        case MmsDataType.ObjectIdentifier:
          return { type: MmsDataType.ObjectIdentifier, value: inner.decodeObjectIdentifier() };
        default:
          return { type: tagNumber, value: value };
      }
    }

    // Universal class tags
    if (tagClass === 0) {
      switch (tagNumber) {
        case MmsDataType.Boolean:
          return { type: MmsDataType.Boolean, value: value.length > 0 && value[0] !== 0 };
        case MmsDataType.Integer:
          return { type: MmsDataType.Integer, value: decodeIntegerValue(value) };
        case MmsDataType.Unsigned:
          return { type: MmsDataType.Unsigned, value: decodeUnsignedValue(value) };
        case MmsDataType.BitString:
          return { type: MmsDataType.BitString, value: value.length > 1 ? value.slice(1) : new Uint8Array(0) };
        case MmsDataType.OctetString:
          return { type: MmsDataType.OctetString, value };
        case MmsDataType.VisibleString:
          return { type: MmsDataType.VisibleString, value: new TextDecoder().decode(value) };
        case MmsDataType.FloatingPoint: {
          if (value.length >= 9) {
            const view = new DataView(value.buffer, value.byteOffset + 1, 8);
            return { type: MmsDataType.FloatingPoint, value: view.getFloat64(0, false) };
          } else if (value.length >= 5) {
            const view = new DataView(value.buffer, value.byteOffset + 1, 4);
            return { type: MmsDataType.FloatingPoint, value: view.getFloat32(0, false) };
          }
          return { type: MmsDataType.FloatingPoint, value: 0 };
        }
        case MmsDataType.ObjectIdentifier:
          return { type: MmsDataType.ObjectIdentifier, value: new BerDecoder(value).decodeObjectIdentifier() };
        default:
          return { type: tagNumber, value };
      }
    }

    return { type: tagNumber, value };
  }

  /**
   * Decode a sequence of elements until the decoder is exhausted.
   */
  decodeSequence<T>(decoder: (d: BerDecoder) => T): T[] {
    const results: T[] = [];
    while (this.hasMore()) {
      results.push(decoder(this));
    }
    return results;
  }
}

// ─── ASN.1 BER Helper Functions ───────────────────────────────────────

/**
 * Encode a signed integer as minimal big-endian bytes.
 */
function encodeIntegerBytes(value: number): Uint8Array {
  if (value === 0) return new Uint8Array([0]);

  const negative = value < 0;
  const abs = Math.abs(value);

  if (abs <= 0x7f) {
    return new Uint8Array([negative ? (0x100 - abs) & 0xff : abs]);
  }
  if (abs <= 0x7fff) {
    const v = negative ? (0x10000 - abs) & 0xffff : abs;
    return new Uint8Array([(v >> 8) & 0xff, v & 0xff]);
  }
  if (abs <= 0x7fffff) {
    const v = negative ? (0x1000000 - abs) & 0xffffff : abs;
    return new Uint8Array([(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  }
  const v = negative ? (0x100000000 - abs) >>> 0 : abs;
  return new Uint8Array([(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
}

/**
 * Encode an unsigned integer as minimal big-endian bytes.
 */
function encodeUnsignedBytes(value: number): Uint8Array {
  if (value === 0) return new Uint8Array([0]);

  if (value <= 0xff) {
    return new Uint8Array([value]);
  }
  if (value <= 0xffff) {
    return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
  }
  if (value <= 0xffffff) {
    return new Uint8Array([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
  }
  return new Uint8Array([(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}

/**
 * Decode a signed integer from big-endian bytes.
 */
function decodeIntegerValue(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let value = (bytes[0] & 0x80) !== 0 ? -1 : 0;
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
  }
  return value;
}

/**
 * Decode an unsigned integer from big-endian bytes.
 */
function decodeUnsignedValue(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let value = 0;
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
  }
  return value >>> 0;
}

// ─── TPKT (RFC 1006) Framing ─────────────────────────────────────────

/**
 * Build a TPKT header + COTP data packet.
 * TPKT: version(1) + reserved(1) + length(2) + COTP data
 */
export function buildTpktPacket(cotpData: Uint8Array): Uint8Array {
  const totalLength = 4 + cotpData.length;
  const packet = new Uint8Array(totalLength);
  packet[0] = 0x03; // TPKT version 3
  packet[1] = 0x00; // Reserved
  packet[2] = (totalLength >> 8) & 0xff;
  packet[3] = totalLength & 0xff;
  packet.set(cotpData, 4);
  return packet;
}

/**
 * Parse a TPKT header.
 * Returns { version, length, dataOffset } or null if insufficient data.
 */
export function parseTpktHeader(data: Uint8Array): { version: number; length: number; dataOffset: number } | null {
  if (data.length < 4) return null;
  const version = data[0];
  const length = (data[2] << 8) | data[3];
  if (length < 4) return null;
  return { version, length, dataOffset: 4 };
}

/**
 * Check if a complete TPKT packet is available in the buffer.
 * Returns the packet length if complete, or 0 if more data is needed.
 */
export function getTpktPacketLength(data: Uint8Array): number {
  const header = parseTpktHeader(data);
  if (!header) return 0;
  if (data.length < header.length) return 0;
  return header.length;
}

// ─── COTP (ISO 8073) Framing ─────────────────────────────────────────

/** COTP PDU types */
export const CotpPduType = {
  /** Connection Request */
  CR: 0x0e,
  /** Connection Confirm */
  CC: 0x0d,
  /** Disconnect Request */
  DR: 0x08,
  /** Disconnect Confirm */
  DC: 0x0c,
  /** Data (DT) */
  DT: 0x0f,
  /** Data Acknowledgement (AK) */
  AK: 0x06,
  /** Expedited Data (ED) */
  ED: 0x01,
  /** Reject (RJ) */
  RJ: 0x05
} as const;

/**
 * Build a COTP Connection Request (CR) PDU.
 * Used for ISO 8073 connection establishment.
 */
export function buildCotpConnectionRequest(options?: {
  sourceRef?: number;
  destRef?: number;
  tpduSize?: number;
  callingTsap?: Uint8Array;
  calledTsap?: Uint8Array;
}): Uint8Array {
  const sourceRef = options?.sourceRef ?? 0x0001;
  const destRef = options?.destRef ?? 0x0000;
  const tpduSize = options?.tpduSize ?? 0x0a; // 1024 bytes (2^10)

  // Build variable part
  const variableParts: number[] = [];

  // TPDU size parameter (code 0xc0)
  variableParts.push(0xc0, 0x01, tpduSize);

  // Calling TSAP (code 0xc1)
  const callingTsap = options?.callingTsap ?? new Uint8Array([0x00, 0x01]);
  variableParts.push(0xc1, callingTsap.length);
  for (const b of callingTsap) variableParts.push(b);

  // Called TSAP (code 0xc2)
  const calledTsap = options?.calledTsap ?? new Uint8Array([0x00, 0x01]);
  variableParts.push(0xc2, calledTsap.length);
  for (const b of calledTsap) variableParts.push(b);

  const headerLength = 6 + variableParts.length;
  const pdu = new Uint8Array(headerLength);
  pdu[0] = headerLength - 1; // Length indicator
  pdu[1] = CotpPduType.CR; // PDU type: CR
  pdu[2] = (sourceRef >> 8) & 0xff;
  pdu[3] = sourceRef & 0xff;
  pdu[4] = (destRef >> 8) & 0xff;
  pdu[5] = destRef & 0xff;
  pdu[6] = 0x00; // Class/options
  for (let i = 0; i < variableParts.length; i++) {
    pdu[7 + i] = variableParts[i];
  }

  return pdu;
}

/**
 * Parse a COTP Connection Confirm (CC) PDU.
 * Returns connection parameters or null if not a CC.
 */
export function parseCotpConnectionConfirm(data: Uint8Array): {
  sourceRef: number;
  destRef: number;
  tpduSize: number;
} | null {
  if (data.length < 7) return null;
  const pduType = data[1];
  if (pduType !== CotpPduType.CC) return null;

  const sourceRef = (data[2] << 8) | data[3];
  const destRef = (data[4] << 8) | data[5];

  let tpduSize = 0x0a; // default 1024
  // Parse variable part for TPDU size
  let offset = 7;
  while (offset < data.length - 1) {
    const paramCode = data[offset];
    const paramLen = data[offset + 1];
    if (paramCode === 0xc0 && paramLen === 1) {
      tpduSize = data[offset + 2];
    }
    offset += 2 + paramLen;
  }

  return { sourceRef, destRef, tpduSize };
}

/**
 * Build a COTP Data (DT) PDU.
 * Wraps MMS data for transport.
 */
export function buildCotpData(mmsData: Uint8Array): Uint8Array {
  const pdu = new Uint8Array(3 + mmsData.length);
  pdu[0] = 0x02; // Header length (3 - 1)
  pdu[1] = CotpPduType.DT; // PDU type: DT
  pdu[2] = 0x80; // EOT (end of transfer)
  pdu.set(mmsData, 3);
  return pdu;
}

/**
 * Parse a COTP Data (DT) PDU.
 * Returns the MMS payload or null if not a DT PDU.
 */
export function parseCotpData(data: Uint8Array): Uint8Array | null {
  if (data.length < 3) return null;
  const pduType = data[1];
  if (pduType !== CotpPduType.DT) return null;

  const headerLength = data[0] + 1;
  return data.slice(headerLength);
}

/**
 * Build a COTP Disconnect Request (DR) PDU.
 */
export function buildCotpDisconnectRequest(): Uint8Array {
  const pdu = new Uint8Array(7);
  pdu[0] = 0x06; // Header length
  pdu[1] = CotpPduType.DR; // PDU type: DR
  pdu[2] = 0x00; // Source ref high
  pdu[3] = 0x01; // Source ref low
  pdu[4] = 0x00; // Dest ref high
  pdu[5] = 0x00; // Dest ref low
  pdu[6] = 0x00; // Reason: not specified
  return pdu;
}

// ─── MMS PDU Builder ──────────────────────────────────────────────────

/**
 * Build an MMS Initiate-Request PDU.
 * This is the first MMS message sent after COTP connection.
 */
export function buildMmsInitiateRequest(params?: MmsInitiateRequest): Uint8Array {
  const enc = new BerEncoder();
  const inner = new BerEncoder();

  // proposedVersionNumber [0] IMPLICIT INTEGER DEFAULT 1
  const version = params?.mmsInitRequestDetail?.proposedVersionNumber ?? 1;
  inner.encodeContextPrimitive(0, encodeIntegerBytes(version));

  // proposedParameterCBB [1] IMPLICIT BIT STRING
  // Supports: str1, str2, vnam, vlis, cei, alobj, pi, rt
  const paramCBB = new Uint8Array([0xdc]);
  inner.encodeContextPrimitive(1, paramCBB);

  // servicesSupportedCalled [2] IMPLICIT BIT STRING
  // Support key MMS services
  const servicesSupported = new Uint8Array([
    0xee, // GetNameList, Read, Write, GetVariableAccessAttributes, DefineNamedVariable, DeleteNamedVariableAccess
    0x01, // Identify
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00
  ]);
  inner.encodeContextPrimitive(2, servicesSupported);

  // Wrap in mmsInitRequestDetail [5]
  const initDetail = new BerEncoder();
  initDetail.encodeContextTLV(5, inner.toUint8Array());

  // proposedMaxServOutstandingCalling [1] IMPLICIT INTEGER DEFAULT 10
  const maxCalling = params?.proposedMaxServOutstandingCalling ?? 10;
  initDetail.encodeContextPrimitive(1, encodeIntegerBytes(maxCalling));

  // proposedMaxServOutstandingCalled [2] IMPLICIT INTEGER DEFAULT 10
  const maxCalled = params?.proposedMaxServOutstandingCalled ?? 10;
  initDetail.encodeContextPrimitive(2, encodeIntegerBytes(maxCalled));

  // proposedDataStructureNestingLevel [3] IMPLICIT INTEGER DEFAULT 10
  const nestingLevel = params?.proposedDataStructureNestingLevel ?? 10;
  initDetail.encodeContextPrimitive(3, encodeIntegerBytes(nestingLevel));

  // Wrap as Initiate-RequestPDU [8] IMPLICIT SEQUENCE
  enc.encodeContextTLV(MmsPduType.InitiateRequest, initDetail.toUint8Array());

  return enc.toUint8Array();
}

/**
 * Parse an MMS Initiate-Response PDU.
 */
export function parseMmsInitiateResponse(data: Uint8Array): MmsInitiateResponse {
  const dec = new BerDecoder(data);
  const [, , tagNumber, value] = dec.decodeTLV();

  if (tagNumber !== MmsPduType.InitiateResponse) {
    throw new Error(`Expected Initiate-Response (tag ${MmsPduType.InitiateResponse}), got tag ${tagNumber}`);
  }

  const inner = new BerDecoder(value);
  const result: MmsInitiateResponse = {};

  while (inner.hasMore()) {
    const [, , ctxTag, ctxValue] = inner.decodeTLV();
    switch (ctxTag) {
      case 0: // localDetailCalled
        result.localDetailCalled = decodeIntegerValue(ctxValue);
        break;
      case 1: // negotiatedMaxServOutstandingCalling
        result.negotiatedMaxServOutstandingCalling = decodeIntegerValue(ctxValue);
        break;
      case 2: // negotiatedMaxServOutstandingCalled
        result.negotiatedMaxServOutstandingCalled = decodeIntegerValue(ctxValue);
        break;
      case 3: // negotiatedDataStructureNestingLevel
        result.negotiatedDataStructureNestingLevel = decodeIntegerValue(ctxValue);
        break;
      case 5: // mmsInitResponseDetail
        result.mmsInitResponseDetail = {
          negotiatedVersionNumber: 1
        };
        break;
    }
  }

  return result;
}

/**
 * Build an MMS Confirmed-Request PDU.
 */
export function buildMmsConfirmedRequest(invokeId: number, serviceTag: number, serviceData: Uint8Array): Uint8Array {
  const enc = new BerEncoder();
  const inner = new BerEncoder();

  // invokeID [0] IMPLICIT Unsigned32
  inner.encodeContextPrimitive(0, encodeUnsignedBytes(invokeId));

  // service [1] CHOICE
  inner.encodeContextTLV(1, serviceData);

  // Wrap as Confirmed-RequestPDU [0] IMPLICIT SEQUENCE
  enc.encodeContextTLV(MmsPduType.ConfirmedRequest, inner.toUint8Array());

  return enc.toUint8Array();
}

/**
 * Parse an MMS Confirmed-Response PDU.
 */
export function parseMmsConfirmedResponse(data: Uint8Array): MmsConfirmedResponse {
  const dec = new BerDecoder(data);
  const [, , pduTag, pduValue] = dec.decodeTLV();

  if (pduTag !== MmsPduType.ConfirmedResponse) {
    throw new Error(`Expected Confirmed-Response (tag ${MmsPduType.ConfirmedResponse}), got tag ${pduTag}`);
  }

  const inner = new BerDecoder(pduValue);
  let invokeId = 0;
  let service = -1;
  let serviceData: unknown = null;

  while (inner.hasMore()) {
    const [, , ctxTag, ctxValue] = inner.decodeTLV();
    switch (ctxTag) {
      case 0: // invokeID
        invokeId = decodeUnsignedValue(ctxValue);
        break;
      case 1: { // service
        const svcDec = new BerDecoder(ctxValue);
        const [, , svcTag] = svcDec.decodeTag();
        service = svcTag;
        serviceData = ctxValue;
        break;
      }
    }
  }

  return { invokeId, service, serviceData };
}

/**
 * Parse an MMS Confirmed-Error PDU.
 */
export function parseMmsConfirmedError(data: Uint8Array): MmsConfirmedError {
  const dec = new BerDecoder(data);
  const [, , pduTag, pduValue] = dec.decodeTLV();

  if (pduTag !== MmsPduType.ConfirmedError) {
    throw new Error(`Expected Confirmed-Error (tag ${MmsPduType.ConfirmedError}), got tag ${pduTag}`);
  }

  const inner = new BerDecoder(pduValue);
  let invokeId = 0;
  let errorClass = 0;
  let errorCode = 0;

  while (inner.hasMore()) {
    const [, , ctxTag, ctxValue] = inner.decodeTLV();
    switch (ctxTag) {
      case 0: // invokeID
        invokeId = decodeUnsignedValue(ctxValue);
        break;
      case 1: { // serviceError
        const errDec = new BerDecoder(ctxValue);
        while (errDec.hasMore()) {
          const [, , errTag, errValue] = errDec.decodeTLV();
          if (errTag === 0) errorClass = decodeUnsignedValue(errValue);
          if (errTag === 1) errorCode = decodeUnsignedValue(errValue);
        }
        break;
      }
    }
  }

  return { invokeId, errorClass, errorCode };
}

/**
 * Parse an MMS Reject PDU.
 */
export function parseMmsReject(data: Uint8Array): { rejectType: number; rejectReason: number } {
  const dec = new BerDecoder(data);
  const [, , pduTag, pduValue] = dec.decodeTLV();

  if (pduTag !== MmsPduType.Reject) {
    throw new Error(`Expected Reject (tag ${MmsPduType.Reject}), got tag ${pduTag}`);
  }

  const inner = new BerDecoder(pduValue);
  let rejectType = 0;
  let rejectReason = 0;

  while (inner.hasMore()) {
    const [, , ctxTag, ctxValue] = inner.decodeTLV();
    if (ctxTag === 0) rejectType = decodeUnsignedValue(ctxValue);
    if (ctxTag === 1) rejectReason = decodeUnsignedValue(ctxValue);
  }

  return { rejectType, rejectReason };
}

/**
 * Build an MMS Conclude-Request PDU.
 */
export function buildMmsConcludeRequest(): Uint8Array {
  const enc = new BerEncoder();
  // Conclude-RequestPDU [10] IMPLICIT NULL
  enc.encodeTag(2, false, MmsPduType.ConcludeRequest);
  enc.encodeLength(0);
  return enc.toUint8Array();
}

/**
 * Parse the MMS PDU type from raw bytes.
 * Returns the PDU type tag or -1 if insufficient data.
 */
export function getMmsPduType(data: Uint8Array): number {
  if (data.length < 2) return -1;
  const dec = new BerDecoder(data);
  try {
    const [, , tagNumber] = dec.decodeTag();
    return tagNumber;
  } catch {
    return -1;
  }
}

// ─── MMS Service Builders ─────────────────────────────────────────────

/**
 * Build a GetNameList service request.
 * Lists available objects (domains, variables, etc.) from the server.
 */
export function buildGetNameListRequest(params: GetNameListRequest): Uint8Array {
  const enc = new BerEncoder();
  const inner = new BerEncoder();

  // objectClass [0] CHOICE
  const classEnc = new BerEncoder();
  classEnc.encodeTag(2, false, params.objectClass); // context tag for the class choice
  inner.encodeContextTLV(0, classEnc.toUint8Array());

  // objectScope [1] CHOICE
  const scopeEnc = new BerEncoder();
  switch (params.objectScope.type) {
    case MmsObjectScope.VMDSpecific:
      scopeEnc.encodeTag(2, false, 0); // vmdSpecific [0]
      scopeEnc.encodeLength(0);
      break;
    case MmsObjectScope.DomainSpecific:
      scopeEnc.encodeVisibleString(params.objectScope.value ?? "");
      break;
    case MmsObjectScope.AAASpecific:
      scopeEnc.encodeTag(2, false, 2); // aaSpecific [2]
      scopeEnc.encodeLength(0);
      break;
  }
  inner.encodeContextTLV(1, scopeEnc.toUint8Array());

  // continueAfter [2] OPTIONAL VisibleString
  if (params.continueAfter !== undefined) {
    inner.encodeContextPrimitive(2, new TextEncoder().encode(params.continueAfter));
  }

  // Wrap as GetNameList-Request
  const serviceEnc = new BerEncoder();
  serviceEnc.encodeContextTLV(MmsServiceRequest.GetNameList, inner.toUint8Array());

  return buildMmsConfirmedRequest(0, MmsServiceRequest.GetNameList, serviceEnc.toUint8Array());
}

/**
 * Parse a GetNameList service response.
 */
export function parseGetNameListResponse(data: Uint8Array): GetNameListResponse {
  const pdu = parseMmsConfirmedResponse(data);
  const serviceData = pdu.serviceData as Uint8Array;

  // Parse the service response
  const svcDec = new BerDecoder(serviceData);
  const [, , , svcValue] = svcDec.decodeTLV(); // GetNameList-Response

  const inner = new BerDecoder(svcValue);
  const identifiers: string[] = [];
  let moreFollows = false;

  while (inner.hasMore()) {
    const [, , ctxTag, ctxValue] = inner.decodeTLV();
    switch (ctxTag) {
      case 0: { // listOfIdentifier
        const listDec = new BerDecoder(ctxValue);
        while (listDec.hasMore()) {
          const [, , , idValue] = listDec.decodeTLV();
          identifiers.push(new TextDecoder().decode(idValue));
        }
        break;
      }
      case 1: // moreFollows
        moreFollows = ctxValue.length > 0 && ctxValue[0] !== 0;
        break;
    }
  }

  return { identifiers, moreFollows };
}

/**
 * Build a Read service request.
 * Reads variable values from the MMS server.
 */
export function buildReadRequest(params: {
  invokeId?: number;
  variables: Array<{
    domainId?: string;
    itemId: string;
    component?: string[];
  }>;
  specificationWithResult?: boolean;
}): Uint8Array {
  const enc = new BerEncoder();
  const inner = new BerEncoder();

  // specificationWithResult [0] IMPLICIT BOOLEAN DEFAULT FALSE
  if (params.specificationWithResult) {
    inner.encodeContextPrimitive(0, new Uint8Array([0xff]));
  }

  // variableAccessSpecification [1] CHOICE -> listOfVariable [0]
  const listOfVar = new BerEncoder();
  for (const v of params.variables) {
    const varSpec = new BerEncoder();

    // variableSpecification [0] CHOICE -> name [0]
    const nameEnc = new BerEncoder();
    if (v.domainId) {
      // domain-specific [1] IMPLICIT SEQUENCE { domainId, itemId }
      const domainSpec = new BerEncoder();
      domainSpec.encodeVisibleString(v.domainId);
      domainSpec.encodeVisibleString(v.itemId);
      nameEnc.encodeContextTLV(1, domainSpec.toUint8Array());
    } else {
      // vmd-specific [0] IMPLICIT Identifier
      nameEnc.encodeContextPrimitive(0, new TextEncoder().encode(v.itemId));
    }
    varSpec.encodeContextTLV(0, nameEnc.toUint8Array());

    // alternateAccess [1] OPTIONAL (for component specification)
    if (v.component && v.component.length > 0) {
      const altAccess = new BerEncoder();
      for (const comp of v.component) {
        const selectEnc = new BerEncoder();
        // selectAlternateAccess [0] -> select [0] -> component [1]
        const componentEnc = new BerEncoder();
        componentEnc.encodeVisibleString(comp);
        selectEnc.encodeContextTLV(0, componentEnc.toUint8Array());
        altAccess.encodeContextTLV(0, selectEnc.toUint8Array());
      }
      varSpec.encodeContextTLV(1, altAccess.toUint8Array());
    }

    listOfVar.writeBytes(varSpec.toUint8Array());
  }

  const varAccess = new BerEncoder();
  varAccess.encodeContextTLV(0, listOfVar.toUint8Array());
  inner.encodeContextTLV(1, varAccess.toUint8Array());

  // Wrap as Read-Request
  const serviceEnc = new BerEncoder();
  serviceEnc.encodeContextTLV(MmsServiceRequest.Read, inner.toUint8Array());

  return buildMmsConfirmedRequest(params.invokeId ?? 0, MmsServiceRequest.Read, serviceEnc.toUint8Array());
}

/**
 * Parse a Read service response.
 */
export function parseReadResponse(data: Uint8Array): MmsReadResponse {
  const pdu = parseMmsConfirmedResponse(data);
  const serviceData = pdu.serviceData as Uint8Array;

  const svcDec = new BerDecoder(serviceData);
  const [, , , svcValue] = svcDec.decodeTLV(); // Read-Response

  const inner = new BerDecoder(svcValue);
  const listOfAccessResult: MmsReadResponse["listOfAccessResult"] = [];

  while (inner.hasMore()) {
    const [, , ctxTag, ctxValue] = inner.decodeTLV();
    if (ctxTag === 0) { // listOfAccessResult
      const listDec = new BerDecoder(ctxValue);
      while (listDec.hasMore()) {
        const [, , resultTag, resultValue] = listDec.decodeTLV();
        if (resultTag === 0) { // success
          const dataDec = new BerDecoder(resultValue);
          const mmsValue = dataDec.decodeMmsData();
          listOfAccessResult.push({ success: mmsValue });
        } else if (resultTag === 1) { // failure
          const errDec = new BerDecoder(resultValue);
          let errorClass = 0;
          let errorCode = 0;
          while (errDec.hasMore()) {
            const [, , errTag, errValue] = errDec.decodeTLV();
            if (errTag === 0) errorClass = decodeUnsignedValue(errValue);
            if (errTag === 1) errorCode = decodeUnsignedValue(errValue);
          }
          listOfAccessResult.push({ failure: { errorClass, errorCode } });
        }
      }
    }
  }

  return { listOfAccessResult };
}

/**
 * Build a Write service request.
 * Writes variable values to the MMS server.
 */
export function buildWriteRequest(params: {
  invokeId?: number;
  variables: Array<{
    domainId?: string;
    itemId: string;
    component?: string[];
  }>;
  values: MmsValue[];
}): Uint8Array {
  const enc = new BerEncoder();
  const inner = new BerEncoder();

  // variableAccessSpecification [0] CHOICE -> listOfVariable [0]
  const listOfVar = new BerEncoder();
  for (const v of params.variables) {
    const varSpec = new BerEncoder();

    // variableSpecification [0] CHOICE -> name [0]
    const nameEnc = new BerEncoder();
    if (v.domainId) {
      const domainSpec = new BerEncoder();
      domainSpec.encodeVisibleString(v.domainId);
      domainSpec.encodeVisibleString(v.itemId);
      nameEnc.encodeContextTLV(1, domainSpec.toUint8Array());
    } else {
      nameEnc.encodeContextPrimitive(0, new TextEncoder().encode(v.itemId));
    }
    varSpec.encodeContextTLV(0, nameEnc.toUint8Array());

    // alternateAccess [1] OPTIONAL
    if (v.component && v.component.length > 0) {
      const altAccess = new BerEncoder();
      for (const comp of v.component) {
        const selectEnc = new BerEncoder();
        const componentEnc = new BerEncoder();
        componentEnc.encodeVisibleString(comp);
        selectEnc.encodeContextTLV(0, componentEnc.toUint8Array());
        altAccess.encodeContextTLV(0, selectEnc.toUint8Array());
      }
      varSpec.encodeContextTLV(1, altAccess.toUint8Array());
    }

    listOfVar.writeBytes(varSpec.toUint8Array());
  }

  const varAccess = new BerEncoder();
  varAccess.encodeContextTLV(0, listOfVar.toUint8Array());
  inner.encodeContextTLV(0, varAccess.toUint8Array());

  // listOfData [1] SEQUENCE OF Data
  const dataEnc = new BerEncoder();
  for (const val of params.values) {
    dataEnc.writeBytes(dataEnc.encodeMmsData(val));
  }
  inner.encodeContextTLV(1, dataEnc.toUint8Array());

  // Wrap as Write-Request
  const serviceEnc = new BerEncoder();
  serviceEnc.encodeContextTLV(MmsServiceRequest.Write, inner.toUint8Array());

  return buildMmsConfirmedRequest(params.invokeId ?? 0, MmsServiceRequest.Write, serviceEnc.toUint8Array());
}

/**
 * Parse a Write service response.
 */
export function parseWriteResponse(data: Uint8Array): MmsWriteResponse {
  const pdu = parseMmsConfirmedResponse(data);
  const serviceData = pdu.serviceData as Uint8Array;

  const svcDec = new BerDecoder(serviceData);
  const [, , , svcValue] = svcDec.decodeTLV(); // Write-Response

  const inner = new BerDecoder(svcValue);
  const listOfWriteResult: MmsWriteResponse["listOfWriteResult"] = [];

  while (inner.hasMore()) {
    const [, , ctxTag, ctxValue] = inner.decodeTLV();
    if (ctxTag === 0) { // listOfWriteResult
      const listDec = new BerDecoder(ctxValue);
      while (listDec.hasMore()) {
        const [, , resultTag, resultValue] = listDec.decodeTLV();
        if (resultTag === 0) { // success
          listOfWriteResult.push({ success: true });
        } else if (resultTag === 1) { // failure
          const errDec = new BerDecoder(resultValue);
          let errorClass = 0;
          let errorCode = 0;
          while (errDec.hasMore()) {
            const [, , errTag, errValue] = errDec.decodeTLV();
            if (errTag === 0) errorClass = decodeUnsignedValue(errValue);
            if (errTag === 1) errorCode = decodeUnsignedValue(errValue);
          }
          listOfWriteResult.push({ failure: { errorClass, errorCode } });
        }
      }
    }
  }

  return { listOfWriteResult };
}

/**
 * Build a GetVariableAccessAttributes service request.
 * Retrieves type information for a named variable.
 */
export function buildGetVariableAccessAttributesRequest(params: {
  invokeId?: number;
  domainId?: string;
  itemId: string;
}): Uint8Array {
  const enc = new BerEncoder();
  const inner = new BerEncoder();

  // name [0] CHOICE
  const nameEnc = new BerEncoder();
  if (params.domainId) {
    const domainSpec = new BerEncoder();
    domainSpec.encodeVisibleString(params.domainId);
    domainSpec.encodeVisibleString(params.itemId);
    nameEnc.encodeContextTLV(1, domainSpec.toUint8Array());
  } else {
    nameEnc.encodeContextPrimitive(0, new TextEncoder().encode(params.itemId));
  }
  inner.encodeContextTLV(0, nameEnc.toUint8Array());

  // Wrap as GetVariableAccessAttributes-Request
  const serviceEnc = new BerEncoder();
  serviceEnc.encodeContextTLV(MmsServiceRequest.GetVariableAccessAttributes, inner.toUint8Array());

  return buildMmsConfirmedRequest(params.invokeId ?? 0, MmsServiceRequest.GetVariableAccessAttributes, serviceEnc.toUint8Array());
}

/**
 * Parse a GetVariableAccessAttributes response.
 */
export function parseGetVariableAccessAttributesResponse(data: Uint8Array): GetVarAccessAttrResponse {
  const pdu = parseMmsConfirmedResponse(data);
  const serviceData = pdu.serviceData as Uint8Array;

  const svcDec = new BerDecoder(serviceData);
  const [, , , svcValue] = svcDec.decodeTLV();

  const inner = new BerDecoder(svcValue);
  let mmsDeletable = false;
  let typeDescription: MmsTypeDescription = { typeTag: 0, typeName: "unknown" };

  while (inner.hasMore()) {
    const [, , ctxTag, ctxValue] = inner.decodeTLV();
    switch (ctxTag) {
      case 0: // mmsDeletable
        mmsDeletable = ctxValue.length > 0 && ctxValue[0] !== 0;
        break;
      case 1: { // typeDescription
        typeDescription = parseTypeDescription(ctxValue);
        break;
      }
    }
  }

  return { mmsDeletable, typeDescription };
}

/**
 * Build a DefineNamedVariable service request.
 */
export function buildDefineNamedVariableRequest(params: DefineNamedVariableRequest): Uint8Array {
  const enc = new BerEncoder();
  const inner = new BerEncoder();

  // variableName [0] IMPLICIT ObjectName
  const nameEnc = new BerEncoder();
  if (params.variableName.domainId) {
    const domainSpec = new BerEncoder();
    domainSpec.encodeVisibleString(params.variableName.domainId);
    domainSpec.encodeVisibleString(params.variableName.itemId);
    nameEnc.encodeContextTLV(1, domainSpec.toUint8Array());
  } else {
    nameEnc.encodeContextPrimitive(0, new TextEncoder().encode(params.variableName.itemId));
  }
  inner.encodeContextTLV(0, nameEnc.toUint8Array());

  // address [1] OPTIONAL Address
  if (params.address) {
    inner.encodeContextPrimitive(1, params.address);
  }

  // typeSpecification [2] OPTIONAL TypeSpecification
  if (params.typeSpecification) {
    const typeEnc = encodeTypeSpecification(params.typeSpecification);
    inner.encodeContextTLV(2, typeEnc);
  }

  // Wrap as DefineNamedVariable-Request
  const serviceEnc = new BerEncoder();
  serviceEnc.encodeContextTLV(MmsServiceRequest.DefineNamedVariable, inner.toUint8Array());

  return buildMmsConfirmedRequest(0, MmsServiceRequest.DefineNamedVariable, serviceEnc.toUint8Array());
}

/**
 * Build a DeleteNamedVariableAccess service request.
 */
export function buildDeleteNamedVariableAccessRequest(params: DeleteNamedVariableAccessRequest): Uint8Array {
  const enc = new BerEncoder();
  const inner = new BerEncoder();

  // scopeOfDelete [0] IMPLICIT INTEGER
  inner.encodeContextPrimitive(0, encodeIntegerBytes(params.scopeOfDelete));

  // listOfName [1] IMPLICIT SEQUENCE OF ObjectName
  const listEnc = new BerEncoder();
  for (const name of params.listOfName) {
    const nameEnc = new BerEncoder();
    if (name.domainId) {
      const domainSpec = new BerEncoder();
      domainSpec.encodeVisibleString(name.domainId);
      domainSpec.encodeVisibleString(name.itemId);
      nameEnc.encodeContextTLV(1, domainSpec.toUint8Array());
    } else {
      nameEnc.encodeContextPrimitive(0, new TextEncoder().encode(name.itemId));
    }
    listEnc.writeBytes(nameEnc.toUint8Array());
  }
  inner.encodeContextTLV(1, listEnc.toUint8Array());

  // Wrap as DeleteNamedVariableAccess-Request
  const serviceEnc = new BerEncoder();
  serviceEnc.encodeContextTLV(MmsServiceRequest.DeleteNamedVariableAccess, inner.toUint8Array());

  return buildMmsConfirmedRequest(0, MmsServiceRequest.DeleteNamedVariableAccess, serviceEnc.toUint8Array());
}

/**
 * Build an Identify service request.
 */
export function buildIdentifyRequest(invokeId = 0): Uint8Array {
  const serviceEnc = new BerEncoder();
  // Identify-Request is an empty SEQUENCE
  serviceEnc.encodeTag(2, true, MmsServiceRequest.Identify);
  serviceEnc.encodeLength(0);

  return buildMmsConfirmedRequest(invokeId, MmsServiceRequest.Identify, serviceEnc.toUint8Array());
}

/**
 * Parse an Identify service response.
 */
export function parseIdentifyResponse(data: Uint8Array): MmsIdentifyResponse {
  const pdu = parseMmsConfirmedResponse(data);
  const serviceData = pdu.serviceData as Uint8Array;

  const svcDec = new BerDecoder(serviceData);
  const [, , , svcValue] = svcDec.decodeTLV();

  const inner = new BerDecoder(svcValue);
  let vendorName = "";
  let modelName = "";
  let revision = "";

  while (inner.hasMore()) {
    const [, , ctxTag, ctxValue] = inner.decodeTLV();
    switch (ctxTag) {
      case 0: vendorName = new TextDecoder().decode(ctxValue); break;
      case 1: modelName = new TextDecoder().decode(ctxValue); break;
      case 2: revision = new TextDecoder().decode(ctxValue); break;
    }
  }

  return { vendorName, modelName, revision };
}

// ─── Type Description Helpers ─────────────────────────────────────────

/**
 * Parse a TypeDescription from BER-encoded bytes.
 */
function parseTypeDescription(data: Uint8Array): MmsTypeDescription {
  const dec = new BerDecoder(data);
  const [, , tagNumber, value] = dec.decodeTLV();

  switch (tagNumber) {
    case MmsDataType.Array: {
      const inner = new BerDecoder(value);
      let arrayLength = 0;
      let elementType: MmsTypeDescription = { typeTag: 0, typeName: "unknown" };
      while (inner.hasMore()) {
        const [, , ctxTag, ctxValue] = inner.decodeTLV();
        if (ctxTag === 0) arrayLength = decodeUnsignedValue(ctxValue);
        if (ctxTag === 1) elementType = parseTypeDescription(ctxValue);
      }
      return { typeTag: MmsDataType.Array, arrayLength, elementType, typeName: "array" };
    }
    case MmsDataType.Structure: {
      const inner = new BerDecoder(value);
      const components: MmsTypeDescription["components"] = [];
      while (inner.hasMore()) {
        const [, , ctxTag, ctxValue] = inner.decodeTLV();
        if (ctxTag === 0) { // components
          const compDec = new BerDecoder(ctxValue);
          while (compDec.hasMore()) {
            const [, , , compValue] = compDec.decodeTLV();
            const compInner = new BerDecoder(compValue);
            let compName = "";
            let compType: MmsTypeDescription = { typeTag: 0, typeName: "unknown" };
            while (compInner.hasMore()) {
              const [, , compCtxTag, compCtxValue] = compInner.decodeTLV();
              if (compCtxTag === 0) compName = new TextDecoder().decode(compCtxValue);
              if (compCtxTag === 1) compType = parseTypeDescription(compCtxValue);
            }
            components.push({ name: compName, type: compType });
          }
        }
      }
      return { typeTag: MmsDataType.Structure, components, typeName: "structure" };
    }
    case MmsDataType.Boolean:
      return { typeTag: MmsDataType.Boolean, typeName: "boolean" };
    case MmsDataType.BitString:
      return { typeTag: MmsDataType.BitString, typeName: "bit-string" };
    case MmsDataType.Integer:
      return { typeTag: MmsDataType.Integer, typeName: "integer" };
    case MmsDataType.Unsigned:
      return { typeTag: MmsDataType.Unsigned, typeName: "unsigned" };
    case MmsDataType.FloatingPoint:
      return { typeTag: MmsDataType.FloatingPoint, typeName: "floating-point" };
    case MmsDataType.OctetString:
      return { typeTag: MmsDataType.OctetString, typeName: "octet-string" };
    case MmsDataType.VisibleString:
      return { typeTag: MmsDataType.VisibleString, typeName: "visible-string" };
    case MmsDataType.MMSString:
      return { typeTag: MmsDataType.MMSString, typeName: "mms-string" };
    case MmsDataType.BinaryTime:
      return { typeTag: MmsDataType.BinaryTime, typeName: "binary-time" };
    case MmsDataType.BCD:
      return { typeTag: MmsDataType.BCD, typeName: "bcd" };
    case MmsDataType.ObjectIdentifier:
      return { typeTag: MmsDataType.ObjectIdentifier, typeName: "object-identifier" };
    default:
      return { typeTag: tagNumber, typeName: `unknown-${tagNumber}` };
  }
}

/**
 * Encode a TypeSpecification to BER bytes.
 */
function encodeTypeSpecification(type: MmsTypeDescription): Uint8Array {
  const enc = new BerEncoder();

  switch (type.typeTag) {
    case MmsDataType.Array: {
      const inner = new BerEncoder();
      if (type.arrayLength !== undefined) {
        inner.encodeContextPrimitive(0, encodeUnsignedBytes(type.arrayLength));
      }
      if (type.elementType) {
        inner.encodeContextTLV(1, encodeTypeSpecification(type.elementType));
      }
      enc.encodeContextTLV(MmsDataType.Array, inner.toUint8Array());
      break;
    }
    case MmsDataType.Structure: {
      const inner = new BerEncoder();
      if (type.components) {
        const compEnc = new BerEncoder();
        for (const comp of type.components) {
          const compInner = new BerEncoder();
          compInner.encodeContextPrimitive(0, new TextEncoder().encode(comp.name));
          compInner.encodeContextTLV(1, encodeTypeSpecification(comp.type));
          compEnc.writeBytes(compInner.toUint8Array());
        }
        inner.encodeContextTLV(0, compEnc.toUint8Array());
      }
      enc.encodeContextTLV(MmsDataType.Structure, inner.toUint8Array());
      break;
    }
    case MmsDataType.Boolean:
      enc.encodeTag(2, false, MmsDataType.Boolean);
      enc.encodeLength(0);
      break;
    case MmsDataType.Integer:
      enc.encodeTag(2, false, MmsDataType.Integer);
      enc.encodeLength(0);
      break;
    case MmsDataType.Unsigned:
      enc.encodeTag(2, false, MmsDataType.Unsigned);
      enc.encodeLength(0);
      break;
    case MmsDataType.FloatingPoint:
      enc.encodeTag(2, false, MmsDataType.FloatingPoint);
      enc.encodeLength(0);
      break;
    case MmsDataType.BitString:
      enc.encodeTag(2, false, MmsDataType.BitString);
      enc.encodeLength(0);
      break;
    case MmsDataType.OctetString:
      enc.encodeTag(2, false, MmsDataType.OctetString);
      enc.encodeLength(0);
      break;
    case MmsDataType.VisibleString:
      enc.encodeTag(2, false, MmsDataType.VisibleString);
      enc.encodeLength(0);
      break;
    case MmsDataType.MMSString:
      enc.encodeTag(2, false, MmsDataType.MMSString);
      enc.encodeLength(0);
      break;
    case MmsDataType.BinaryTime:
      enc.encodeTag(2, false, MmsDataType.BinaryTime);
      enc.encodeLength(0);
      break;
    default:
      enc.encodeTag(2, false, type.typeTag);
      enc.encodeLength(0);
      break;
  }

  return enc.toUint8Array();
}

// ─── IEC 61850 Reference Parsing ─────────────────────────────────────

/**
 * Parse an IEC 61850 object reference string into its components.
 *
 * Supports formats:
 * - `LD/LN.DO.DA` (e.g., `TEMPLATE/MMXU1.PhV.phsA.mag.f`)
 * - `LD/LN.DO.DA$FC` (e.g., `TEMPLATE/MMXU1.PhV.phsA.mag.f$MX`)
 * - `LD/LN` (e.g., `TEMPLATE/MMXU1`)
 * - `LN.DO.DA` (without LD, e.g., `MMXU1.PhV.phsA.mag.f`)
 *
 * @param reference - The IEC 61850 object reference string
 * @returns Parsed reference components
 */
export function parseIec61850Reference(reference: string): Iec61850Reference {
  const result: Iec61850Reference = { ld: "", ln: "" };

  // Split off functional constraint if present (e.g., "$MX")
  let ref = reference;
  const fcIdx = reference.indexOf("$");
  if (fcIdx >= 0) {
    result.fc = reference.substring(fcIdx + 1);
    ref = reference.substring(0, fcIdx);
  }

  // Split by "/" to separate LD from the rest
  const slashIdx = ref.indexOf("/");
  let lnPart: string;
  if (slashIdx >= 0) {
    result.ld = ref.substring(0, slashIdx);
    lnPart = ref.substring(slashIdx + 1);
  } else {
    lnPart = ref;
  }

  // Split remaining by "." to get LN.DO.DA
  const parts = lnPart.split(".");
  if (parts.length >= 1) result.ln = parts[0];
  if (parts.length >= 2) result.doName = parts[1];
  if (parts.length >= 3) result.daPath = parts.slice(2).join(".");

  return result;
}

/**
 * Build an MMS variable name from IEC 61850 reference components.
 * For domain-scoped variables: `LD/LN$FC$DO$DA`
 * For VMD-scoped variables: `LN$FC$DO$DA`
 */
export function buildMmsVariableName(ref: Iec61850Reference): { domainId?: string; itemId: string } {
  const parts: string[] = [];
  parts.push(ref.ln);
  if (ref.fc) parts.push(ref.fc);
  if (ref.doName) parts.push(ref.doName);
  if (ref.daPath) parts.push(ref.daPath);

  const itemId = parts.join("$");

  if (ref.ld) {
    return { domainId: ref.ld, itemId };
  }
  return { itemId };
}

/**
 * Build an MMS variable name with component specification for alternate access.
 * Returns the variable name and optional component path for deep attribute access.
 */
export function buildMmsVariableWithComponents(ref: Iec61850Reference): {
  domainId?: string;
  itemId: string;
  component?: string[];
} {
  // For IEC 61850, the MMS variable name is typically: LN$FC$DO
  // And the DA path is accessed via alternate access (component specification)
  if (ref.daPath && ref.doName) {
    const parts: string[] = [];
    parts.push(ref.ln);
    if (ref.fc) parts.push(ref.fc);
    parts.push(ref.doName);

    const itemId = parts.join("$");
    const components = ref.daPath.split(".");

    if (ref.ld) {
      return { domainId: ref.ld, itemId, component: components };
    }
    return { itemId, component: components };
  }

  // No component specification needed
  const { domainId, itemId } = buildMmsVariableName(ref);
  return { domainId, itemId };
}

// ─── MMS Value Helpers ────────────────────────────────────────────────

/**
 * Create an MMS Boolean value.
 */
export function mmsBoolean(value: boolean): MmsValue {
  return { type: MmsDataType.Boolean, value };
}

/**
 * Create an MMS Integer value.
 */
export function mmsInteger(value: number): MmsValue {
  return { type: MmsDataType.Integer, value };
}

/**
 * Create an MMS Unsigned value.
 */
export function mmsUnsigned(value: number): MmsValue {
  return { type: MmsDataType.Unsigned, value };
}

/**
 * Create an MMS Float32 value.
 */
export function mmsFloat32(value: number): MmsValue {
  return { type: MmsDataType.FloatingPoint, value };
}

/**
 * Create an MMS Float64 value.
 */
export function mmsFloat64(value: number): MmsValue {
  return { type: MmsDataType.FloatingPoint, value };
}

/**
 * Create an MMS Visible String value.
 */
export function mmsVisibleString(value: string): MmsValue {
  return { type: MmsDataType.VisibleString, value };
}

/**
 * Create an MMS Octet String value.
 */
export function mmsOctetString(value: Uint8Array): MmsValue {
  return { type: MmsDataType.OctetString, value };
}

/**
 * Create an MMS Bit String value.
 */
export function mmsBitString(value: Uint8Array): MmsValue {
  return { type: MmsDataType.BitString, value };
}

/**
 * Create an MMS Binary Time value.
 */
export function mmsBinaryTime(value: Date): MmsValue {
  return { type: MmsDataType.BinaryTime, value };
}

/**
 * Create an MMS Structure value.
 */
export function mmsStructure(fields: MmsValue[]): MmsValue {
  return { type: MmsDataType.Structure, value: fields };
}

/**
 * Create an MMS Array value.
 */
export function mmsArray(elements: MmsValue[]): MmsValue {
  return { type: MmsDataType.Array, value: elements };
}

/**
 * Extract a numeric value from an MmsValue.
 * Works for Integer, Unsigned, FloatingPoint types.
 */
export function extractNumericValue(mmsValue: MmsValue): number {
  switch (mmsValue.type) {
    case MmsDataType.Integer:
    case MmsDataType.Unsigned:
    case MmsDataType.FloatingPoint:
      return mmsValue.value as number;
    case MmsDataType.Boolean:
      return mmsValue.value ? 1 : 0;
    default:
      return 0;
  }
}

/**
 * Extract a boolean value from an MmsValue.
 */
export function extractBooleanValue(mmsValue: MmsValue): boolean {
  switch (mmsValue.type) {
    case MmsDataType.Boolean:
      return mmsValue.value as boolean;
    case MmsDataType.Integer:
    case MmsDataType.Unsigned:
      return (mmsValue.value as number) !== 0;
    default:
      return false;
  }
}

/**
 * Extract a string value from an MmsValue.
 */
export function extractStringValue(mmsValue: MmsValue): string {
  switch (mmsValue.type) {
    case MmsDataType.VisibleString:
    case MmsDataType.MMSString:
      return mmsValue.value as string;
    default:
      return String(mmsValue.value);
  }
}

/**
 * Extract a timestamp from an MmsValue.
 */
export function extractTimestamp(mmsValue: MmsValue): Date {
  if (mmsValue.type === MmsDataType.BinaryTime) {
    return mmsValue.value as Date;
  }
  return new Date(0);
}

/**
 * Get a human-readable type name for an MMS data type tag.
 */
export function getMmsDataTypeName(typeTag: number): string {
  switch (typeTag) {
    case MmsDataType.Array: return "array";
    case MmsDataType.Structure: return "structure";
    case MmsDataType.Boolean: return "boolean";
    case MmsDataType.BitString: return "bit-string";
    case MmsDataType.Integer: return "integer";
    case MmsDataType.Unsigned: return "unsigned";
    case MmsDataType.FloatingPoint: return "floating-point";
    case MmsDataType.OctetString: return "octet-string";
    case MmsDataType.VisibleString: return "visible-string";
    case MmsDataType.GeneralizedTime: return "generalized-time";
    case MmsDataType.BinaryTime: return "binary-time";
    case MmsDataType.BCD: return "bcd";
    case MmsDataType.ObjectIdentifier: return "object-identifier";
    case MmsDataType.MMSString: return "mms-string";
    default: return `unknown-${typeTag}`;
  }
}

/**
 * Format an MmsValue as a human-readable string for display.
 */
export function formatMmsValue(mmsValue: MmsValue, indent = 0): string {
  const prefix = "  ".repeat(indent);
  switch (mmsValue.type) {
    case MmsDataType.Boolean:
      return `${prefix}${mmsValue.value ? "true" : "false"}`;
    case MmsDataType.Integer:
    case MmsDataType.Unsigned:
      return `${prefix}${mmsValue.value}`;
    case MmsDataType.FloatingPoint:
      return `${prefix}${(mmsValue.value as number).toFixed(6)}`;
    case MmsDataType.VisibleString:
    case MmsDataType.MMSString:
      return `${prefix}"${mmsValue.value}"`;
    case MmsDataType.OctetString: {
      const bytes = mmsValue.value as Uint8Array;
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(" ");
      return `${prefix}0x${hex}`;
    }
    case MmsDataType.BitString: {
      const bits = mmsValue.value as Uint8Array;
      const hex = Array.from(bits).map(b => b.toString(16).padStart(2, "0")).join(" ");
      return `${prefix}b'${hex}'`;
    }
    case MmsDataType.BinaryTime:
      return `${prefix}${(mmsValue.value as Date).toISOString()}`;
    case MmsDataType.Structure: {
      const fields = mmsValue.value as MmsValue[];
      const lines = fields.map((f, i) => `${prefix}  [${i}]: ${formatMmsValue(f, indent + 1)}`);
      return `{\n${lines.join("\n")}\n${prefix}}`;
    }
    case MmsDataType.Array: {
      const elements = mmsValue.value as MmsValue[];
      const lines = elements.map((e, i) => `${prefix}  [${i}]: ${formatMmsValue(e, indent + 1)}`);
      return `[\n${lines.join("\n")}\n${prefix}]`;
    }
    default:
      return `${prefix}<unknown type ${mmsValue.type}>`;
  }
}

// ─── Frame Decoding Helpers ───────────────────────────────────────────

/**
 * Decode IEC 61850 MMS frame fields for the raw adapter's decodeFields callback.
 */
export function decodeIec61850FrameFields(frame: Uint8Array): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    length: frame.length,
    previewHex: formatHexPreview(frame)
  };

  // Try to parse TPKT header
  const tpkt = parseTpktHeader(frame);
  if (tpkt) {
    fields.tpktVersion = tpkt.version;
    fields.tpktLength = tpkt.length;
  }

  // Try to parse COTP header
  if (frame.length > 4) {
    const cotpData = frame.slice(4);
    if (cotpData.length >= 2) {
      fields.cotpPduType = cotpData[1];
      fields.cotpPduTypeName = getCotpPduTypeName(cotpData[1]);
    }
  }

  // Try to parse MMS PDU type
  if (frame.length > 7) {
    const mmsData = frame.slice(7); // Skip TPKT(4) + COTP(3)
    const pduType = getMmsPduType(mmsData);
    if (pduType >= 0) {
      fields.mmsPduType = pduType;
      fields.mmsPduTypeName = getMmsPduTypeName(pduType);
    }
  }

  return fields;
}

/**
 * Get a human-readable name for a COTP PDU type.
 */
function getCotpPduTypeName(type: number): string {
  switch (type) {
    case CotpPduType.CR: return "CR (Connect Request)";
    case CotpPduType.CC: return "CC (Connect Confirm)";
    case CotpPduType.DR: return "DR (Disconnect Request)";
    case CotpPduType.DC: return "DC (Disconnect Confirm)";
    case CotpPduType.DT: return "DT (Data)";
    case CotpPduType.AK: return "AK (Data Ack)";
    case CotpPduType.ED: return "ED (Expedited Data)";
    case CotpPduType.RJ: return "RJ (Reject)";
    default: return `Unknown (0x${type.toString(16)})`;
  }
}

/**
 * Get a human-readable name for an MMS PDU type.
 */
function getMmsPduTypeName(type: number): string {
  switch (type) {
    case MmsPduType.ConfirmedRequest: return "Confirmed-Request";
    case MmsPduType.ConfirmedResponse: return "Confirmed-Response";
    case MmsPduType.ConfirmedError: return "Confirmed-Error";
    case MmsPduType.Unconfirmed: return "Unconfirmed";
    case MmsPduType.Reject: return "Reject";
    case MmsPduType.InitiateRequest: return "Initiate-Request";
    case MmsPduType.InitiateResponse: return "Initiate-Response";
    case MmsPduType.ConcludeRequest: return "Conclude-Request";
    case MmsPduType.ConcludeResponse: return "Conclude-Response";
    default: return `Unknown (${type})`;
  }
}

/**
 * Format the first N bytes of a buffer as hex for preview.
 */
function formatHexPreview(data: Uint8Array, maxBytes = 20): string {
  return Array.from(data.slice(0, maxBytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

// ─── Complete MMS Packet Builders ─────────────────────────────────────

/**
 * Build a complete TPKT+COTP+MMS packet for an MMS PDU.
 * This is the standard framing for MMS over TCP (RFC 1006).
 */
export function buildMmsPacket(mmsPdu: Uint8Array): Uint8Array {
  const cotp = buildCotpData(mmsPdu);
  return buildTpktPacket(cotp);
}

/**
 * Build a complete TPKT+COTP Connection Request packet.
 */
export function buildConnectionRequestPacket(options?: Parameters<typeof buildCotpConnectionRequest>[0]): Uint8Array {
  const cotp = buildCotpConnectionRequest(options);
  return buildTpktPacket(cotp);
}

/**
 * Build a complete MMS Initiate-Request packet.
 */
export function buildInitiateRequestPacket(params?: MmsInitiateRequest): Uint8Array {
  const mmsPdu = buildMmsInitiateRequest(params);
  return buildMmsPacket(mmsPdu);
}

/**
 * Build a complete MMS Conclude-Request packet.
 */
export function buildConcludeRequestPacket(): Uint8Array {
  const mmsPdu = buildMmsConcludeRequest();
  return buildMmsPacket(mmsPdu);
}

/**
 * Build a complete MMS Disconnect Request packet (COTP DR).
 */
export function buildDisconnectRequestPacket(): Uint8Array {
  const cotp = buildCotpDisconnectRequest();
  return buildTpktPacket(cotp);
}

/**
 * Extract MMS PDU data from a TPKT+COTP+MMS packet.
 * Returns the MMS PDU bytes, or null if the packet is invalid.
 */
export function extractMmsPduFromPacket(packet: Uint8Array): Uint8Array | null {
  const tpkt = parseTpktHeader(packet);
  if (!tpkt) return null;

  const cotpData = packet.slice(tpkt.dataOffset);
  const mmsData = parseCotpData(cotpData);
  return mmsData;
}
