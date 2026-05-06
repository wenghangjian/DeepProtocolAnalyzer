import type { ReadRequest, WriteRequest, DecodedFrame } from "../../packages/shared-types";
import { ProtocolError } from "../../packages/shared-types";
import type { ProtocolAdapter, SessionKernelContext } from "../../packages/protocol-core";
import { UdpTransport } from "../../packages/transport-core/udp-transport";
import { AdapterBackedDriver } from "../_shared/adapter-driver";

// ─── BACnet Constants ─────────────────────────────────────────────────────────

/** BVLC BACnet/IP type byte */
const BVLC_TYPE = 0x81;

/** BVLC Function codes */
const BvlcFunction = {
  RESULT: 0x00,
  WRITE_BDT: 0x01,
  READ_BDT: 0x02,
  READ_BDT_ACK: 0x03,
  FORWARDED_NPDU: 0x04,
  REGISTER_FOREIGN_DEVICE: 0x05,
  READ_FDT: 0x06,
  READ_FDT_ACK: 0x07,
  DELETE_FDT_ENTRY: 0x08,
  DISTRIBUTE_BROADCAST: 0x09,
  ORIGINAL_UNICAST_NPDU: 0x0A,
  ORIGINAL_BROADCAST_NPDU: 0x0B
} as const;

/** BACnet Object Types */
const ObjectType = {
  ANALOG_INPUT: 0,
  ANALOG_OUTPUT: 1,
  ANALOG_VALUE: 2,
  BINARY_INPUT: 3,
  BINARY_OUTPUT: 4,
  BINARY_VALUE: 5,
  CALENDAR: 6,
  COMMAND: 7,
  DEVICE: 8,
  EVENT_ENROLLMENT: 9,
  FILE: 10,
  GROUP: 11,
  LOOP: 12,
  MULTI_STATE_INPUT: 13,
  MULTI_STATE_OUTPUT: 14,
  MULTI_STATE_VALUE: 15,
  NOTIFICATION_CLASS: 16,
  PROGRAM: 17,
  SCHEDULE: 18,
  AVERAGING: 19,
  MULTI_STATE_VALUE_2: 20,
  TREND_LOG: 20,
  LIFE_SAFETY_POINT: 21,
  LIFE_SAFETY_ZONE: 22,
  ACCUMULATOR: 23,
  PULSE_CONVERTER: 24,
  EVENT_LOG: 25,
  GLOBAL_GROUP: 26,
  TREND_LOG_MULTIPLE: 27,
  LOAD_CONTROL: 28,
  STRUCTURED_VIEW: 29,
  ACCESS_POINT: 30,
  ACCESS_ZONE: 31,
  ACCESS_USER: 32,
  ACCESS_RIGHTS: 33,
  ACCESS_CREDENTIAL: 34,
  CREDENTIAL_DATA_INPUT: 35,
  NETWORK_SECURITY: 36,
  BITSTRING_VALUE: 37,
  CHARACTERSTRING_VALUE: 38,
  DATE_PATTERN_VALUE: 39,
  DATE_VALUE: 40,
  DATETIME_PATTERN_VALUE: 41,
  DATETIME_VALUE: 42,
  INTEGER_VALUE: 43,
  LARGE_ANALOG_VALUE: 44,
  POSITIVE_INTEGER_VALUE: 45,
  TIME_PATTERN_VALUE: 46,
  TIME_VALUE: 47,
  NOTIFICATION_FORWARDER: 48,
  ALERT_ENROLLMENT: 49,
  CHANNEL: 50,
  LIGHTING_OUTPUT: 51
} as const;

/** BACnet Property IDs */
const PropertyId = {
  ACKED_TRANSITIONS: 0,
  ACK_REQUIRED: 1,
  ACTION: 2,
  ACTION_TEXT: 3,
  ACTIVE_TEXT: 4,
  ACTIVE_VT_SESSIONS: 5,
  ALARM_VALUE: 6,
  ALARM_VALUES: 7,
  ALL: 8,
  ALL_WRITES_SUCCESSFUL: 9,
  APDU_SEGMENT_TIMEOUT: 10,
  APDU_TIMEOUT: 11,
  APPLICATION_SOFTWARE_VERSION: 12,
  ARCHIVE: 13,
  BIAS: 14,
  CHANGE_OF_STATE_COUNT: 15,
  CHANGE_OF_STATE_TIME: 16,
  NOTIFICATION_CLASS: 17,
  CONTROLLED_VARIABLE_REFERENCE: 19,
  CONTROLLED_VARIABLE_UNITS: 20,
  CONTROLLED_VARIABLE_VALUE: 21,
  COV_INCREMENT: 22,
  DATE_LIST: 23,
  DAYLIGHT_SAVINGS_STATUS: 24,
  DEADBAND: 25,
  DERIVATIVE_CONSTANT: 26,
  DERIVATIVE_CONSTANT_UNITS: 27,
  DESCRIPTION: 28,
  DESCRIPTION_OF_HALT: 29,
  DEVICE_ADDRESS_BINDING: 30,
  DEVICE_TYPE: 31,
  EFFECTIVE_PERIOD: 32,
  ELAPSED_ACTIVE_TIME: 33,
  ERROR_LIMIT: 34,
  EVENT_ENABLE: 35,
  EVENT_STATE: 36,
  EVENT_TYPE: 37,
  EXCEPTION_SCHEDULE: 38,
  FAULT_VALUES: 39,
  FEEDBACK_VALUE: 40,
  FILE_ACCESS_METHOD: 41,
  FILE_SIZE: 42,
  FILE_TYPE: 43,
  FIRMWARE_REVISION: 44,
  HIGH_LIMIT: 45,
  INACTIVE_TEXT: 46,
  IN_OF_SERVICE: 47,
  INSTANCE_OF: 48,
  INTEGRAL_CONSTANT: 49,
  INTEGRAL_CONSTANT_UNITS: 50,
  ISSUE_CONFIRMED_NOTIFICATIONS: 51,
  LIMIT_ENABLE: 52,
  LIST_OF_GROUP_MEMBERS: 53,
  LIST_OF_OBJECT_PROPERTY_REFERENCES: 54,
  LOCAL_DATE: 56,
  LOCAL_TIME: 57,
  LOCATION: 58,
  LOW_LIMIT: 59,
  MANIPULATED_VARIABLE_REFERENCE: 60,
  MAXIMUM_OUTPUT: 61,
  MAX_APDU_LENGTH_ACCEPTED: 62,
  MAX_INFO_FRAMES: 63,
  MAX_MASTER: 64,
  MAX_PRES_VALUE: 65,
  MINIMUM_OFF_TIME: 66,
  MINIMUM_ON_TIME: 67,
  MINIMUM_OUTPUT: 68,
  MIN_PRES_VALUE: 69,
  MODEL_NAME: 70,
  MODIFICATION_DATE: 71,
  NOTIFY_TYPE: 72,
  NUMBER_OF_APDU_RETRIES: 73,
  NUMBER_OF_STATES: 74,
  OBJECT_IDENTIFIER: 75,
  OBJECT_LIST: 76,
  OBJECT_NAME: 77,
  OBJECT_PROPERTY_REFERENCE: 78,
  OBJECT_TYPE: 79,
  OPTIONAL: 80,
  OUT_OF_SERVICE: 81,
  OUTPUT_UNITS: 82,
  EVENT_PARAMETERS: 83,
  POLARITY: 84,
  PRESENT_VALUE: 85,
  PRIORITY: 86,
  PRIORITY_ARRAY: 87,
  PRIORITY_FOR_WRITING: 88,
  PROCESS_IDENTIFIER: 89,
  PROGRAM_CHANGE: 90,
  PROGRAM_LOCATION: 91,
  PROGRAM_STATE: 92,
  PROPORTIONAL_CONSTANT: 93,
  PROPORTIONAL_CONSTANT_UNITS: 94,
  PROTOCOL_CONFORMANCE_CLASS: 95,
  PROTOCOL_OBJECT_TYPES_SUPPORTED: 96,
  PROTOCOL_SERVICES_SUPPORTED: 97,
  PROTOCOL_VERSION: 98,
  READ_ONLY: 99,
  REASON_FOR_HALT: 100,
  RECIPIENT: 101,
  RECIPIENT_LIST: 102,
  RELIABILITY: 103,
  RELINQUISH_DEFAULT: 104,
  REQUIRED: 105,
  RESOLUTION: 106,
  SEGMENTATION_SUPPORTED: 107,
  SETPOINT: 108,
  SETPOINT_REFERENCE: 109,
  STATE_TEXT: 110,
  STATUS_FLAGS: 111,
  SYSTEM_STATUS: 112,
  TIME_DELAY: 113,
  TIME_OF_ACTIVE_TIME_RESET: 114,
  TIME_OF_STATE_COUNT_RESET: 115,
  TIME_SYNCHRONIZATION_RECIPIENTS: 116,
  UNITS: 117,
  UPDATE_INTERVAL: 118,
  UTC_OFFSET: 119,
  VENDOR_IDENTIFIER: 120,
  VENDOR_NAME: 121,
  VT_CLASSES_SUPPORTED: 122,
  WEEKLY_SCHEDULE: 123,
  ATTEMPTED_SAMPLES: 124,
  AVERAGE_VALUE: 125,
  BUFFER_SIZE: 126,
  CLIENT_COV_INCREMENT: 127,
  COV_RESUBSCRIPTION_INTERVAL: 128,
  EVENT_TIME_STAMPS: 130,
  LOG_BUFFER: 131,
  LOG_DEVICE_OBJECT_PROPERTY: 132,
  ENABLE: 133,
  LOG_INTERVAL: 134,
  MAXIMUM_VALUE: 135,
  MINIMUM_VALUE: 136,
  NOTIFICATION_THRESHOLD: 137,
  PROTOCOL_REVISION: 139,
  RECORDS_SINCE_NOTIFICATION: 140,
  RECORD_COUNT: 141,
  START_TIME: 142,
  STOP_TIME: 143,
  STOP_WHEN_FULL: 144,
  TOTAL_RECORD_COUNT: 145,
  VALID_SAMPLES: 146,
  WINDOW_INTERVAL: 147,
  WINDOW_SAMPLES: 148,
  MAXIMUM_VALUE_TIMESTAMP: 149,
  MINIMUM_VALUE_TIMESTAMP: 150,
  VARIANCE_VALUE: 151,
  ACTIVE_COV_SUBSCRIPTIONS: 152,
  LAST_RESTORE_TIME: 153,
  BACKUP_FAILURE_TIMEOUT: 154,
  CONFIGURATION_FILES: 155,
  DATABASE_REVISION: 156,
  DIRECT_READING: 157,
  LAST_RESTART_REASON: 159,
  MAINTENANCE_REQUIRED: 162,
  MEMBER_OF: 158,
  MODE: 160,
  OPERATION_EXPECTED: 161,
  SETPOINT_REFERENCE_2: 163,
  SILENCED: 164,
  TRACKING_VALUE: 165,
  ZONE_MEMBERS: 166,
  LIFE_SAFETY_ALARM_VALUES: 167,
  MAX_SEGMENTS_ACCEPTED: 168,
  PROFILE_NAME: 168,
  AUTO_SLAVE_DISCOVERY: 169,
  MANUAL_SLAVE_ADDRESS_BINDING: 170,
  SLAVE_ADDRESS_BINDING: 171,
  STRUCTURED_OBJECT_LIST: 172,
  SUBORDINATE_ANNOTATIONS: 173,
  SUBORDINATE_LIST: 174,
  ACTUAL_SHED_LEVEL: 180,
  DUTY_WINDOW: 181,
  EXPECTED_SHED_LEVEL: 182,
  FULL_DUTY_BASELINE: 183
} as const;

/** BACnet Application Tags */
const AppTag = {
  NULL: 0x00,
  BOOLEAN_TRUE: 0x11,
  BOOLEAN_FALSE: 0x10,
  UNSIGNED_INTEGER: 0x21,
  SIGNED_INTEGER: 0x31,
  REAL: 0x44,
  DOUBLE: 0x55,
  OCTET_STRING: 0x61,
  CHARACTER_STRING: 0x71,
  BIT_STRING: 0x81,
  ENUMERATED: 0x91,
  DATE: 0xA1,
  TIME: 0xB1,
  OBJECT_IDENTIFIER: 0xC1,
  CONSTRUCTED_OPENING: 0x0E,
  CONSTRUCTED_CLOSING: 0x0F
} as const;

/** BACnet PDU Types */
const PduType = {
  CONFIRMED_REQUEST: 0x00,
  UNCONFIRMED_REQUEST: 0x01,
  SIMPLE_ACK: 0x02,
  COMPLEX_ACK: 0x03,
  SEGMENT_ACK: 0x04,
  ERROR: 0x05,
  REJECT: 0x06,
  ABORT: 0x07
} as const;

/** BACnet Unconfirmed Service Choice */
const UnconfirmedServiceChoice = {
  I_AM: 0,
  I_HAVE: 1,
  COV_NOTIFICATION: 2,
  EVENT_NOTIFICATION: 3,
  PRIVATE_TRANSFER: 4,
  TEXT_MESSAGE: 5,
  TIME_SYNCHRONIZATION: 6,
  WHO_HAS: 7,
  WHO_IS: 8,
  UTC_TIME_SYNCHRONIZATION: 9,
  WRITE_GROUP: 10
} as const;

/** BACnet Confirmed Service Choice */
const ConfirmedServiceChoice = {
  ACKNOWLEDGE_ALARM: 0,
  COV_NOTIFICATION: 1,
  EVENT_NOTIFICATION: 2,
  GET_ENROLLMENT_SUMMARY: 4,
  SUBSCRIBE_COV: 5,
  ATOMIC_READ_FILE: 6,
  ATOMIC_WRITE_FILE: 7,
  ADD_LIST_ELEMENT: 8,
  REMOVE_LIST_ELEMENT: 9,
  CREATE_OBJECT: 10,
  DELETE_OBJECT: 11,
  READ_PROPERTY: 12,
  READ_PROPERTY_MULTIPLE: 14,
  WRITE_PROPERTY: 15,
  WRITE_PROPERTY_MULTIPLE: 16,
  DEVICE_COMMUNICATION_CONTROL: 17,
  CONFIRMED_PRIVATE_TRANSFER: 18,
  CONFIRMED_TEXT_MESSAGE: 19,
  REINITIALIZE_DEVICE: 20,
  VT_OPEN: 21,
  VT_CLOSE: 22,
  VT_DATA: 23,
  READ_RANGE: 26,
  LIFE_SAFETY_OPERATION: 27,
  SUBSCRIBE_COV_PROPERTY: 28,
  GET_EVENT_INFORMATION: 29
} as const;

/** BACnet Segmentation */
const Segmentation = {
  NO_SEGMENTATION: 0,
  SEGMENTED_TRANSMIT: 1,
  SEGMENTED_RECEIVE: 2,
  SEGMENTED_BOTH: 3
} as const;

/** BACnet NPDU version */
const NPDU_VERSION = 0x01;

// ─── BACnet Types ─────────────────────────────────────────────────────────────

/** Configuration for the BACnet/IP engine */
export interface BacnetIpConfig {
  /** Target BACnet/IP host address (default: broadcast 255.255.255.255) */
  host: string;
  /** Target BACnet/IP UDP port (default: 47808 / 0xBAC0) */
  port: number;
  /** Local UDP port to bind (default: 47808) */
  localPort?: number;
  /** Local bind address (default: 0.0.0.0) */
  bindAddress?: string;
  /** Connection timeout in milliseconds */
  connectTimeoutMs?: number;
  /** Read timeout in milliseconds */
  readTimeoutMs?: number;
  /** Our BACnet device instance for identification */
  deviceInstance?: number;
}

/** Runtime state for the BACnet/IP engine */
interface BacnetIpRuntime {
  invokeId: number;
  discoveredDevices: Map<number, BacnetDevice>;
}

/** A discovered BACnet device */
export interface BacnetDevice {
  /** BACnet device object instance number */
  deviceInstance: number;
  /** Network address of the device */
  address: string;
  /** Maximum APDU length accepted */
  maxApdu: number;
  /** Segmentation support */
  segmentation: number;
  /** Vendor identifier */
  vendorId: number;
}

/** A decoded BACnet value with application tag information */
export interface BacnetValue {
  /** BACnet application tag number */
  tag: number;
  /** The decoded value */
  value: unknown;
  /** Object type (if applicable) */
  objectType?: number;
  /** Object instance (if applicable) */
  objectInstance?: number;
  /** Property ID (if applicable) */
  propertyId?: number;
}

/** Parsed BVLC header */
interface BvlcHeader {
  type: number;
  function: number;
  length: number;
  payload: Uint8Array;
  /** For forwarded NPDU: source address */
  forwardedAddress?: { addr: number[]; port: number };
}

/** Parsed NPDU header */
interface NpduHeader {
  version: number;
  control: number;
  hasDestination: boolean;
  hasSource: boolean;
  expectsReply: boolean;
  networkLayerMessage: boolean;
  destinationNetwork?: number;
  destinationAddress?: number[];
  sourceNetwork?: number;
  sourceAddress?: number[];
  hopCount?: number;
  apdu: Uint8Array;
}

/** Parsed APDU header */
interface ApduHeader {
  pduType: number;
  segmented: boolean;
  moreFollows: boolean;
  maxSegments?: number;
  maxApdu?: number;
  invokeId?: number;
  serviceChoice: number;
  serviceData: Uint8Array;
  /** For Complex-ACK: original invoke ID */
  originalInvokeId?: number;
}

// ─── BVLC Encoding/Decoding ──────────────────────────────────────────────────

/**
 * Encode a BVLC frame with the given function code and payload.
 * @param functionCode - BVLC function code
 * @param payload - NPDU + APDU payload
 * @returns Complete BACnet/IP frame with BVLC header
 */
function encodeBvlc(functionCode: number, payload: Uint8Array): Uint8Array {
  const length = 4 + payload.length; // type(1) + function(1) + length(2) + payload
  const frame = new Uint8Array(length);
  frame[0] = BVLC_TYPE;
  frame[1] = functionCode;
  frame[2] = (length >> 8) & 0xff;
  frame[3] = length & 0xff;
  frame.set(payload, 4);
  return frame;
}

/**
 * Decode a BVLC frame header.
 * @param data - Raw received data
 * @returns Parsed BVLC header or null if invalid
 */
function decodeBvlc(data: Uint8Array): BvlcHeader | null {
  if (data.length < 4) return null;
  if (data[0] !== BVLC_TYPE) return null;

  const func = data[1];
  const length = (data[2] << 8) | data[3];
  if (length > data.length) return null;

  const payload = data.slice(4, length);

  const result: BvlcHeader = {
    type: data[0],
    function: func,
    length,
    payload
  };

  // Forwarded-NPDU has 6-byte source address prefix
  if (func === BvlcFunction.FORWARDED_NPDU && payload.length >= 6) {
    result.forwardedAddress = {
      addr: [payload[0], payload[1], payload[2], payload[3]],
      port: (payload[4] << 8) | payload[5]
    };
    result.payload = payload.slice(6);
  }

  return result;
}

// ─── NPDU Encoding/Decoding ──────────────────────────────────────────────────

/**
 * Encode an NPDU header.
 * @param apdu - APDU payload
 * @param expectsReply - Whether a reply is expected (for confirmed requests)
 * @param destinationNetwork - Optional destination network
 * @param destinationAddress - Optional destination address
 * @returns NPDU frame
 */
function encodeNpdu(
  apdu: Uint8Array,
  expectsReply = false,
  destinationNetwork?: number,
  destinationAddress?: number[]
): Uint8Array {
  let control = 0x00;
  const hasDestination = destinationNetwork !== undefined && destinationAddress !== undefined;

  if (hasDestination) control |= 0x20; // DRE flag
  if (expectsReply) control |= 0x04;   // DER flag

  // Calculate NPDU length
  let npduLength = 2; // version + control
  if (hasDestination) {
    npduLength += 2 + 1 + destinationAddress.length; // network(2) + len(1) + addr
  }
  npduLength += apdu.length;

  const npdu = new Uint8Array(npduLength);
  let offset = 0;
  npdu[offset++] = NPDU_VERSION;
  npdu[offset++] = control;

  if (hasDestination) {
    npdu[offset++] = (destinationNetwork >> 8) & 0xff;
    npdu[offset++] = destinationNetwork & 0xff;
    npdu[offset++] = destinationAddress.length;
    for (const b of destinationAddress) {
      npdu[offset++] = b;
    }
  }

  npdu.set(apdu, offset);
  return npdu;
}

/**
 * Decode an NPDU header.
 * @param data - NPDU data (after BVLC header)
 * @returns Parsed NPDU header
 */
function decodeNpdu(data: Uint8Array): NpduHeader | null {
  if (data.length < 2) return null;

  const version = data[0];
  if (version !== NPDU_VERSION) return null;

  const control = data[1];
  let offset = 2;

  const hasDestination = (control & 0x20) !== 0;
  const hasSource = (control & 0x08) !== 0;
  const expectsReply = (control & 0x04) !== 0;
  const networkLayerMessage = (control & 0x80) !== 0;

  let destinationNetwork: number | undefined;
  let destinationAddress: number[] | undefined;
  let sourceNetwork: number | undefined;
  let sourceAddress: number[] | undefined;
  let hopCount: number | undefined;

  if (hasDestination) {
    if (offset + 3 > data.length) return null;
    destinationNetwork = (data[offset] << 8) | data[offset + 1];
    const addrLen = data[offset + 2];
    offset += 3;
    if (offset + addrLen > data.length) return null;
    destinationAddress = Array.from(data.slice(offset, offset + addrLen));
    offset += addrLen;
  }

  if (hasSource) {
    if (offset + 3 > data.length) return null;
    sourceNetwork = (data[offset] << 8) | data[offset + 1];
    const addrLen = data[offset + 2];
    offset += 3;
    if (offset + addrLen > data.length) return null;
    sourceAddress = Array.from(data.slice(offset, offset + addrLen));
    offset += addrLen;
  }

  if (hasDestination) {
    if (offset >= data.length) return null;
    hopCount = data[offset++];
  }

  return {
    version,
    control,
    hasDestination,
    hasSource,
    expectsReply,
    networkLayerMessage,
    destinationNetwork,
    destinationAddress,
    sourceNetwork,
    sourceAddress,
    hopCount,
    apdu: data.slice(offset)
  };
}

// ─── APDU Encoding/Decoding ──────────────────────────────────────────────────

/**
 * Encode an Unconfirmed-Request APDU.
 * @param serviceChoice - Unconfirmed service choice
 * @param serviceData - Service-specific data
 * @returns APDU bytes
 */
function encodeUnconfirmedRequest(serviceChoice: number, serviceData: Uint8Array): Uint8Array {
  const apdu = new Uint8Array(2 + serviceData.length);
  apdu[0] = (PduType.UNCONFIRMED_REQUEST << 4);
  apdu[1] = serviceChoice;
  apdu.set(serviceData, 2);
  return apdu;
}

/**
 * Encode a Confirmed-Request APDU.
 * @param invokeId - Invoke ID for matching responses
 * @param serviceChoice - Confirmed service choice
 * @param serviceData - Service-specific data
 * @returns APDU bytes
 */
function encodeConfirmedRequest(invokeId: number, serviceChoice: number, serviceData: Uint8Array): Uint8Array {
  const apdu = new Uint8Array(4 + serviceData.length);
  apdu[0] = (PduType.CONFIRMED_REQUEST << 4) | 0x03; // max APDU 1476
  apdu[1] = 0x00; // no segmentation
  apdu[2] = invokeId;
  apdu[3] = serviceChoice;
  apdu.set(serviceData, 4);
  return apdu;
}

/**
 * Decode an APDU header.
 * @param data - APDU data (after NPDU header)
 * @returns Parsed APDU header or null if invalid
 */
function decodeApdu(data: Uint8Array): ApduHeader | null {
  if (data.length < 2) return null;

  const pduType = (data[0] >> 4) & 0x0f;
  const segmented = (data[0] & 0x08) !== 0;
  const moreFollows = (data[0] & 0x04) !== 0;

  switch (pduType) {
    case PduType.CONFIRMED_REQUEST: {
      if (data.length < 4) return null;
      const maxSegments = (data[0] & 0x07);
      const maxApdu = data[1];
      const invokeId = data[2];
      const serviceChoice = data[3];
      return {
        pduType,
        segmented,
        moreFollows,
        maxSegments,
        maxApdu,
        invokeId,
        serviceChoice,
        serviceData: data.slice(4)
      };
    }
    case PduType.UNCONFIRMED_REQUEST: {
      if (data.length < 2) return null;
      return {
        pduType,
        segmented,
        moreFollows,
        serviceChoice: data[1],
        serviceData: data.slice(2)
      };
    }
    case PduType.SIMPLE_ACK: {
      if (data.length < 3) return null;
      return {
        pduType,
        segmented,
        moreFollows,
        invokeId: data[1],
        serviceChoice: data[2],
        serviceData: data.slice(3)
      };
    }
    case PduType.COMPLEX_ACK: {
      if (data.length < 4) return null;
      const invokeId = data[1];
      const serviceChoice = segmented ? data[3] : data[2];
      const dataOffset = segmented ? 4 : 3;
      return {
        pduType,
        segmented,
        moreFollows,
        invokeId,
        originalInvokeId: invokeId,
        serviceChoice,
        serviceData: data.slice(dataOffset)
      };
    }
    case PduType.ERROR: {
      if (data.length < 4) return null;
      return {
        pduType,
        segmented,
        moreFollows,
        invokeId: data[1],
        serviceChoice: data[2],
        serviceData: data.slice(3)
      };
    }
    case PduType.REJECT: {
      if (data.length < 3) return null;
      return {
        pduType,
        segmented,
        moreFollows,
        invokeId: data[1],
        serviceChoice: data[2],
        serviceData: data.slice(3)
      };
    }
    case PduType.ABORT: {
      if (data.length < 3) return null;
      return {
        pduType,
        segmented,
        moreFollows,
        invokeId: data[1],
        serviceChoice: data[2],
        serviceData: data.slice(3)
      };
    }
    default:
      return null;
  }
}

// ─── BACnet Application Tag Encoding ─────────────────────────────────────────

/**
 * Encode a BACnet application-tagged value.
 * @param tag - Application tag number
 * @param value - Value to encode
 * @returns Encoded tag + value bytes
 */
function encodeApplicationTag(tag: number, value: unknown): Uint8Array {
  switch (tag) {
    case AppTag.NULL:
      return new Uint8Array([AppTag.NULL]);

    case AppTag.BOOLEAN_TRUE:
    case AppTag.BOOLEAN_FALSE: {
      const boolVal = value as boolean;
      return new Uint8Array([boolVal ? AppTag.BOOLEAN_TRUE : AppTag.BOOLEAN_FALSE]);
    }

    case AppTag.UNSIGNED_INTEGER: {
      const num = value as number;
      if (num < 0x100) {
        return new Uint8Array([0x21, num & 0xff]);
      } else if (num < 0x10000) {
        return new Uint8Array([0x22, (num >> 8) & 0xff, num & 0xff]);
      } else if (num < 0x1000000) {
        return new Uint8Array([0x23, (num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff]);
      } else {
        return new Uint8Array([
          0x24, (num >> 24) & 0xff, (num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff
        ]);
      }
    }

    case AppTag.SIGNED_INTEGER: {
      const num = value as number;
      if (num >= -0x80 && num < 0x80) {
        return new Uint8Array([0x31, num & 0xff]);
      } else if (num >= -0x8000 && num < 0x8000) {
        const raw = num < 0 ? num + 0x10000 : num;
        return new Uint8Array([0x32, (raw >> 8) & 0xff, raw & 0xff]);
      } else if (num >= -0x800000 && num < 0x800000) {
        const raw = num < 0 ? num + 0x1000000 : num;
        return new Uint8Array([0x33, (raw >> 16) & 0xff, (raw >> 8) & 0xff, raw & 0xff]);
      } else {
        const raw = num < 0 ? num + 0x100000000 : num;
        return new Uint8Array([
          0x34, (raw >> 24) & 0xff, (raw >> 16) & 0xff, (raw >> 8) & 0xff, raw & 0xff
        ]);
      }
    }

    case AppTag.REAL: {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setFloat32(0, value as number);
      const bytes = new Uint8Array(buf);
      return new Uint8Array([0x44, bytes[0], bytes[1], bytes[2], bytes[3]]);
    }

    case AppTag.DOUBLE: {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setFloat64(0, value as number);
      const bytes = new Uint8Array(buf);
      return new Uint8Array([0x55, bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]]);
    }

    case AppTag.ENUMERATED: {
      const num = value as number;
      if (num < 0x100) {
        return new Uint8Array([0x91, num & 0xff]);
      } else if (num < 0x10000) {
        return new Uint8Array([0x92, (num >> 8) & 0xff, num & 0xff]);
      } else if (num < 0x1000000) {
        return new Uint8Array([0x93, (num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff]);
      } else {
        return new Uint8Array([
          0x94, (num >> 24) & 0xff, (num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff
        ]);
      }
    }

    case AppTag.CHARACTER_STRING: {
      const str = value as string;
      const encoder = new TextEncoder();
      const strBytes = encoder.encode(str);
      const len = strBytes.length;
      const result = new Uint8Array(2 + len);
      result[0] = 0x71; // character string, 1-byte length
      result[1] = len;
      result.set(strBytes, 2);
      return result;
    }

    case AppTag.OCTET_STRING: {
      const bytes = value as Uint8Array;
      const len = bytes.length;
      const result = new Uint8Array(2 + len);
      result[0] = 0x61; // octet string, 1-byte length
      result[1] = len;
      result.set(bytes, 2);
      return result;
    }

    case AppTag.OBJECT_IDENTIFIER: {
      const objId = value as number;
      return new Uint8Array([
        0xC4,
        (objId >> 24) & 0xff,
        (objId >> 16) & 0xff,
        (objId >> 8) & 0xff,
        objId & 0xff
      ]);
    }

    default:
      return new Uint8Array([tag]);
  }
}

/**
 * Decode a BACnet application-tagged value.
 * @param data - Data starting at the application tag
 * @param offset - Starting offset
 * @returns Decoded value and number of bytes consumed, or null if invalid
 */
function decodeApplicationTag(data: Uint8Array, offset: number): { value: BacnetValue; length: number } | null {
  if (offset >= data.length) return null;

  const tagByte = data[offset];
  const tagClass = (tagByte >> 4) & 0x0f;
  const tagNumber = tagByte & 0x0f;

  // Context-specific tag
  if (tagClass === 0x08 || tagClass === 0x09) {
    const contextTag = tagNumber;
    // Context tags have length in the next byte(s)
    if (offset + 1 >= data.length) return null;
    const lenOrValue = data[offset + 1];

    if (lenOrValue === 0x1f) {
      // Length is in closing tag
      return { value: { tag: contextTag, value: null }, length: 1 };
    }

    // For context tags, the value follows
    if (contextTag === 0) {
      // Object identifier
      if (offset + 5 >= data.length) return null;
      const objId = ((data[offset + 2] & 0x3f) << 24) | (data[offset + 3] << 16) | (data[offset + 4] << 8) | data[offset + 5];
      const objType = (data[offset + 2] << 2) | (data[offset + 3] >> 6);
      return {
        value: {
          tag: contextTag,
          value: objId,
          objectType: objType,
          objectInstance: objId & 0x3fffff
        },
        length: 5
      };
    }

    if (contextTag === 1) {
      // Property identifier
      if (lenOrValue < 0x100) {
        return { value: { tag: contextTag, value: lenOrValue }, length: 2 };
      }
    }

    // Generic context tag handling
    return { value: { tag: contextTag, value: lenOrValue }, length: 2 };
  }

  // Application tag
  const appTag = tagNumber;

  switch (appTag) {
    case 0x00: // NULL
      return { value: { tag: AppTag.NULL, value: null }, length: 1 };

    case 0x01: // Boolean
      return {
        value: { tag: tagByte, value: (tagByte & 0x01) !== 0 },
        length: 1
      };

    case 0x02: { // Unsigned Integer
      const len = tagByte & 0x07;
      if (len === 0 || offset + 1 + len > data.length) return null;
      let val = 0;
      for (let i = 0; i < len; i++) {
        val = (val << 8) | data[offset + 1 + i];
      }
      return { value: { tag: AppTag.UNSIGNED_INTEGER, value: val }, length: 1 + len };
    }

    case 0x03: { // Signed Integer
      const len = tagByte & 0x07;
      if (len === 0 || offset + 1 + len > data.length) return null;
      let val = 0;
      for (let i = 0; i < len; i++) {
        val = (val << 8) | data[offset + 1 + i];
      }
      // Sign extend
      if (val >= (1 << (len * 8 - 1))) {
        val -= (1 << (len * 8));
      }
      return { value: { tag: AppTag.SIGNED_INTEGER, value: val }, length: 1 + len };
    }

    case 0x04: { // Real (4 bytes)
      if (offset + 5 > data.length) return null;
      const buf = new ArrayBuffer(4);
      const view = new DataView(buf);
      view.setUint8(0, data[offset + 1]);
      view.setUint8(1, data[offset + 2]);
      view.setUint8(2, data[offset + 3]);
      view.setUint8(3, data[offset + 4]);
      return { value: { tag: AppTag.REAL, value: view.getFloat32(0) }, length: 5 };
    }

    case 0x05: { // Double (8 bytes)
      if (offset + 9 > data.length) return null;
      const buf = new ArrayBuffer(8);
      const view = new DataView(buf);
      for (let i = 0; i < 8; i++) {
        view.setUint8(i, data[offset + 1 + i]);
      }
      return { value: { tag: AppTag.DOUBLE, value: view.getFloat64(0) }, length: 9 };
    }

    case 0x06: { // Octet String
      const len = tagByte & 0x07;
      if (offset + 1 + len > data.length) return null;
      const strLen = data[offset + 1];
      if (offset + 2 + strLen > data.length) return null;
      return {
        value: { tag: AppTag.OCTET_STRING, value: data.slice(offset + 2, offset + 2 + strLen) },
        length: 2 + strLen
      };
    }

    case 0x07: { // Character String
      const len = tagByte & 0x07;
      if (offset + 2 > data.length) return null;
      const strLen = data[offset + 2];
      if (offset + 3 + strLen > data.length) return null;
      const decoder = new TextDecoder();
      const strBytes = data.slice(offset + 3, offset + 3 + strLen);
      return {
        value: { tag: AppTag.CHARACTER_STRING, value: decoder.decode(strBytes) },
        length: 3 + strLen
      };
    }

    case 0x08: { // Bit String
      const len = tagByte & 0x07;
      if (offset + 2 > data.length) return null;
      const unusedBits = data[offset + 2];
      const byteLen = len;
      if (offset + 1 + byteLen > data.length) return null;
      return {
        value: { tag: AppTag.BIT_STRING, value: { unusedBits, data: data.slice(offset + 2, offset + 1 + byteLen) } },
        length: 1 + byteLen
      };
    }

    case 0x09: { // Enumerated
      const len = tagByte & 0x07;
      if (len === 0 || offset + 1 + len > data.length) return null;
      let val = 0;
      for (let i = 0; i < len; i++) {
        val = (val << 8) | data[offset + 1 + i];
      }
      return { value: { tag: AppTag.ENUMERATED, value: val }, length: 1 + len };
    }

    case 0x0a: { // Date
      if (offset + 5 > data.length) return null;
      return {
        value: {
          tag: AppTag.DATE,
          value: {
            year: data[offset + 1] + 1900,
            month: data[offset + 2],
            day: data[offset + 3],
            dayOfWeek: data[offset + 4]
          }
        },
        length: 5
      };
    }

    case 0x0b: { // Time
      if (offset + 5 > data.length) return null;
      return {
        value: {
          tag: AppTag.TIME,
          value: {
            hour: data[offset + 1],
            minute: data[offset + 2],
            second: data[offset + 3],
            hundredths: data[offset + 4]
          }
        },
        length: 5
      };
    }

    case 0x0c: { // Object Identifier
      if (offset + 5 > data.length) return null;
      const objId = ((data[offset + 1] & 0x3f) << 24) | (data[offset + 2] << 16) | (data[offset + 3] << 8) | data[offset + 4];
      const objType = (data[offset + 1] << 2) | (data[offset + 2] >> 6);
      return {
        value: {
          tag: AppTag.OBJECT_IDENTIFIER,
          value: objId,
          objectType: objType,
          objectInstance: objId & 0x3fffff
        },
        length: 5
      };
    }

    case 0x0e: // Opening tag
      return { value: { tag: AppTag.CONSTRUCTED_OPENING, value: null }, length: 1 };

    case 0x0f: // Closing tag
      return { value: { tag: AppTag.CONSTRUCTED_CLOSING, value: null }, length: 1 };

    default:
      return null;
  }
}

// ─── BACnet Service Builders ─────────────────────────────────────────────────

/**
 * Build a BACnet Object Identifier from type and instance.
 * @param objectType - BACnet object type number
 * @param instance - Object instance number (0-4194303)
 * @returns 32-bit object identifier
 */
function buildObjectIdentifier(objectType: number, instance: number): number {
  return ((objectType & 0x3ff) << 22) | (instance & 0x3fffff);
}

/**
 * Build a Who-Is service data.
 * @param lowLimit - Optional low device instance limit
 * @param highLimit - Optional high device instance limit
 * @returns Service data bytes
 */
function buildWhoIsData(lowLimit?: number, highLimit?: number): Uint8Array {
  if (lowLimit !== undefined && highLimit !== undefined) {
    // Context tag 0: low limit, Context tag 1: high limit
    return new Uint8Array([
      0x09, lowLimit & 0xff,  // context tag 0, length 1
      0x19, highLimit & 0xff  // context tag 1, length 1
    ]);
  }
  return new Uint8Array(0);
}

/**
 * Build a ReadProperty service data.
 * @param objectType - BACnet object type
 * @param objectInstance - Object instance
 * @param propertyId - Property identifier
 * @param arrayIndex - Optional array index
 * @returns Service data bytes
 */
function buildReadPropertyData(
  objectType: number,
  objectInstance: number,
  propertyId: number,
  arrayIndex?: number
): Uint8Array {
  const parts: number[] = [];

  // Context tag 0: Object Identifier (4 bytes)
  parts.push(0x0c); // context tag 0, length 4
  const objId = buildObjectIdentifier(objectType, objectInstance);
  parts.push((objId >> 24) & 0xff);
  parts.push((objId >> 16) & 0xff);
  parts.push((objId >> 8) & 0xff);
  parts.push(objId & 0xff);

  // Context tag 1: Property Identifier
  if (propertyId < 256) {
    parts.push(0x19); // context tag 1, length 1
    parts.push(propertyId & 0xff);
  } else {
    parts.push(0x1a); // context tag 1, length 2
    parts.push((propertyId >> 8) & 0xff);
    parts.push(propertyId & 0xff);
  }

  // Context tag 2: Optional Array Index
  if (arrayIndex !== undefined) {
    if (arrayIndex < 256) {
      parts.push(0x29); // context tag 2, length 1
      parts.push(arrayIndex & 0xff);
    } else {
      parts.push(0x2a); // context tag 2, length 2
      parts.push((arrayIndex >> 8) & 0xff);
      parts.push(arrayIndex & 0xff);
    }
  }

  return new Uint8Array(parts);
}

/**
 * Build a WriteProperty service data.
 * @param objectType - BACnet object type
 * @param objectInstance - Object instance
 * @param propertyId - Property identifier
 * @param value - Value to write
 * @param priority - Optional priority (1-16)
 * @returns Service data bytes
 */
function buildWritePropertyData(
  objectType: number,
  objectInstance: number,
  propertyId: number,
  value: BacnetValue,
  priority?: number
): Uint8Array {
  const parts: number[] = [];

  // Context tag 0: Object Identifier
  parts.push(0x0c);
  const objId = buildObjectIdentifier(objectType, objectInstance);
  parts.push((objId >> 24) & 0xff);
  parts.push((objId >> 16) & 0xff);
  parts.push((objId >> 8) & 0xff);
  parts.push(objId & 0xff);

  // Context tag 1: Property Identifier
  if (propertyId < 256) {
    parts.push(0x19);
    parts.push(propertyId & 0xff);
  } else {
    parts.push(0x1a);
    parts.push((propertyId >> 8) & 0xff);
    parts.push(propertyId & 0xff);
  }

  // Context tag 3: Opening tag for property value
  parts.push(0x3e);

  // Application-tagged value
  const encodedValue = encodeApplicationTag(value.tag, value.value);
  for (const b of encodedValue) {
    parts.push(b);
  }

  // Context tag 3: Closing tag
  parts.push(0x3f);

  // Context tag 4: Optional Priority
  if (priority !== undefined) {
    parts.push(0x49); // context tag 4, length 1
    parts.push(priority & 0xff);
  }

  return new Uint8Array(parts);
}

/**
 * Build a ReadPropertyMultiple service data.
 * @param objectType - BACnet object type
 * @param objectInstance - Object instance
 * @param propertyIds - Array of property identifiers
 * @returns Service data bytes
 */
function buildReadPropertyMultipleData(
  objectType: number,
  objectInstance: number,
  propertyIds: number[]
): Uint8Array {
  const parts: number[] = [];

  // SEQUENCE OF ReadAccessSpecification
  // Opening tag 0
  parts.push(0x0e);

  // Object Identifier (context tag 0)
  parts.push(0x0c);
  const objId = buildObjectIdentifier(objectType, objectInstance);
  parts.push((objId >> 24) & 0xff);
  parts.push((objId >> 16) & 0xff);
  parts.push((objId >> 8) & 0xff);
  parts.push(objId & 0xff);

  // SEQUENCE OF PropertyReference (context tag 1)
  parts.push(0x1e);

  for (const propId of propertyIds) {
    // Property Identifier (context tag 0)
    if (propId < 256) {
      parts.push(0x09);
      parts.push(propId & 0xff);
    } else {
      parts.push(0x0a);
      parts.push((propId >> 8) & 0xff);
      parts.push(propId & 0xff);
    }
  }

  // Closing tag for SEQUENCE OF PropertyReference
  parts.push(0x1f);

  // Closing tag for SEQUENCE OF ReadAccessSpecification
  parts.push(0x0f);

  return new Uint8Array(parts);
}

/**
 * Build a Who-Has service data.
 * @param objectName - Optional object name to search for
 * @param objectType - Optional object type
 * @param objectInstance - Optional object instance
 * @returns Service data bytes
 */
function buildWhoHasData(
  objectName?: string,
  objectType?: number,
  objectInstance?: number
): Uint8Array {
  const parts: number[] = [];

  if (objectName !== undefined) {
    // Context tag 1: Object Name (character string)
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(objectName);
    parts.push(0x19); // context tag 1, length 1
    // Application tag: character string
    parts.push(0x71); // character string, 1-byte length
    parts.push(nameBytes.length);
    for (const b of nameBytes) {
      parts.push(b);
    }
  }

  if (objectType !== undefined && objectInstance !== undefined) {
    // Context tag 0: Object Identifier
    parts.push(0x0c);
    const objId = buildObjectIdentifier(objectType, objectInstance);
    parts.push((objId >> 24) & 0xff);
    parts.push((objId >> 16) & 0xff);
    parts.push((objId >> 8) & 0xff);
    parts.push(objId & 0xff);
  }

  return new Uint8Array(parts);
}

// ─── Response Parsers ─────────────────────────────────────────────────────────

/**
 * Parse an I-Am response to extract device information.
 * @param serviceData - I-Am service data
 * @returns Parsed device information
 */
function parseIAmResponse(serviceData: Uint8Array): BacnetDevice | null {
  let offset = 0;

  // Object Identifier (device)
  const objResult = decodeApplicationTag(serviceData, offset);
  if (!objResult || objResult.value.tag !== AppTag.OBJECT_IDENTIFIER) return null;
  offset += objResult.length;

  // Max APDU length
  const maxApduResult = decodeApplicationTag(serviceData, offset);
  if (!maxApduResult) return null;
  offset += maxApduResult.length;

  // Segmentation support
  const segResult = decodeApplicationTag(serviceData, offset);
  if (!segResult) return null;
  offset += segResult.length;

  // Vendor ID
  const vendorResult = decodeApplicationTag(serviceData, offset);
  if (!vendorResult) return null;

  const deviceInstance = objResult.value.objectInstance ?? (objResult.value.value as number & 0x3fffff);

  return {
    deviceInstance,
    address: "", // Will be filled by caller
    maxApdu: maxApduResult.value.value as number,
    segmentation: segResult.value.value as number,
    vendorId: vendorResult.value.value as number
  };
}

/**
 * Parse a ReadProperty-ACK response to extract the property value.
 * @param serviceData - ReadProperty-ACK service data
 * @returns Parsed property value
 */
function parseReadPropertyAck(serviceData: Uint8Array): BacnetValue | null {
  let offset = 0;

  // Context tag 0: Object Identifier
  if (offset >= serviceData.length) return null;
  const objResult = decodeApplicationTag(serviceData, offset);
  if (!objResult) return null;
  offset += objResult.length;

  // Context tag 1: Property Identifier
  if (offset >= serviceData.length) return null;
  const propResult = decodeApplicationTag(serviceData, offset);
  if (!propResult) return null;
  offset += propResult.length;

  // Context tag 2: Opening tag for property value (optional array index may precede)
  // Skip optional array index (context tag 2)
  if (offset < serviceData.length && (serviceData[offset] & 0xf0) === 0x20) {
    const arrayResult = decodeApplicationTag(serviceData, offset);
    if (arrayResult) offset += arrayResult.length;
  }

  // Opening tag for property value (context tag 3 or application tag opening)
  if (offset < serviceData.length && serviceData[offset] === 0x3e) {
    offset++; // skip opening tag
  }

  // Decode the actual value
  if (offset >= serviceData.length) return null;
  const valueResult = decodeApplicationTag(serviceData, offset);
  if (!valueResult) return null;

  return {
    ...valueResult.value,
    objectType: objResult.value.objectType,
    objectInstance: objResult.value.objectInstance,
    propertyId: propResult.value.value as number
  };
}

/**
 * Parse a ReadPropertyMultiple-ACK response.
 * @param serviceData - ReadPropertyMultiple-ACK service data
 * @returns Array of parsed property values
 */
function parseReadPropertyMultipleAck(serviceData: Uint8Array): BacnetValue[] {
  const results: BacnetValue[] = [];
  let offset = 0;

  // Skip opening tag for ReadAccessResult (context tag 0)
  if (offset < serviceData.length && serviceData[offset] === 0x0e) {
    offset++;
  }

  // Object Identifier
  if (offset >= serviceData.length) return results;
  const objResult = decodeApplicationTag(serviceData, offset);
  if (!objResult) return results;
  offset += objResult.length;

  // Skip opening tag for SEQUENCE OF PropertyResult (context tag 1)
  if (offset < serviceData.length && serviceData[offset] === 0x1e) {
    offset++;
  }

  // Parse each property result
  while (offset < serviceData.length) {
    // Check for closing tag
    if (serviceData[offset] === 0x1f) {
      offset++;
      break;
    }

    // Property Identifier (context tag 0)
    const propResult = decodeApplicationTag(serviceData, offset);
    if (!propResult) break;
    offset += propResult.length;

    // Skip optional array index
    if (offset < serviceData.length && (serviceData[offset] & 0xf0) === 0x20) {
      const arrayResult = decodeApplicationTag(serviceData, offset);
      if (arrayResult) offset += arrayResult.length;
    }

    // Property value (opening tag 0x3e, value, closing tag 0x3f)
    if (offset < serviceData.length && serviceData[offset] === 0x3e) {
      offset++;
      const valueResult = decodeApplicationTag(serviceData, offset);
      if (valueResult) {
        results.push({
          ...valueResult.value,
          objectType: objResult.value.objectType,
          objectInstance: objResult.value.objectInstance,
          propertyId: propResult.value.value as number
        });
        offset += valueResult.length;
      }
      // Skip closing tag
      if (offset < serviceData.length && serviceData[offset] === 0x3f) {
        offset++;
      }
    }
  }

  return results;
}

// ─── Helper: Parse address string ────────────────────────────────────────────

/**
 * Parse a BACnet address string in format "objectType:instance:propertyId" or "objectType:instance:propertyId:arrayIndex".
 * @param address - Address string
 * @returns Parsed address components
 */
function parseBacnetAddress(address: string): {
  objectType: number;
  objectInstance: number;
  propertyId: number;
  arrayIndex?: number;
} {
  const parts = address.split(":").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) {
    throw new ProtocolError("INVALID_ADDRESS", `Invalid BACnet address format: ${address}. Expected objectType:instance:propertyId`);
  }
  return {
    objectType: parts[0],
    objectInstance: parts[1],
    propertyId: parts[2],
    arrayIndex: parts.length > 3 ? parts[3] : undefined
  };
}

// ─── BACnet/IP Engine ─────────────────────────────────────────────────────────

/**
 * BACnet/IP protocol engine implementing ISO 16484-5.
 *
 * Supports BVLC framing, NPDU routing, APDU encoding/decoding,
 * and common BACnet services including Who-Is/I-Am discovery,
 * ReadProperty, WriteProperty, ReadPropertyMultiple, and Who-Has.
 *
 * @example
 * ```typescript
 * const engine = new BacnetIpEngine();
 * await engine.onInit({ host: "192.168.1.100", port: 47808 });
 * await engine.connect("session-1");
 *
 * // Discover devices
 * const devices = await engine.invokeCapability("session-1", "whoIs");
 *
 * // Read a property
 * const value = await engine.invokeCapability("session-1", "readProperty", {
 *   objectType: 8, objectInstance: 1234, propertyId: 77
 * });
 * ```
 */
export class BacnetIpEngine extends AdapterBackedDriver<BacnetIpConfig, BacnetIpRuntime> {
  protected protocolId = "bacnet-ip";
  protected defaultConfig: BacnetIpConfig = {
    host: "255.255.255.255",
    port: 47808,
    localPort: 47808,
    bindAddress: "0.0.0.0",
    connectTimeoutMs: 3000,
    readTimeoutMs: 5000,
    deviceInstance: 4194303
  };

  /**
   * Build the BACnet/IP protocol adapter with BVLC/NPDU/APDU framing.
   * @param config - BACnet/IP configuration
   * @returns Protocol adapter for the session kernel
   */
  protected buildAdapter(config: BacnetIpConfig): ProtocolAdapter<BacnetIpRuntime, BacnetIpConfig> {
    return {
      protocolId: this.protocolId,
      initializeRuntime: () => ({
        invokeId: 0,
        discoveredDevices: new Map()
      }),
      createTransport: (cfg) => new UdpTransport({
        host: cfg.host,
        port: cfg.port,
        localPort: cfg.localPort,
        bindAddress: cfg.bindAddress,
        connectTimeoutMs: cfg.connectTimeoutMs
      }),
      createReadPlan: (request, context) => {
        const addr = parseBacnetAddress(request.address);
        const invokeId = nextInvokeId(context.runtime);
        const serviceData = buildReadPropertyData(
          addr.objectType,
          addr.objectInstance,
          addr.propertyId,
          addr.arrayIndex
        );
        const apdu = encodeConfirmedRequest(invokeId, ConfirmedServiceChoice.READ_PROPERTY, serviceData);
        const npdu = encodeNpdu(apdu, true);
        const frame = encodeBvlc(BvlcFunction.ORIGINAL_UNICAST_NPDU, npdu);

        return {
          id: `bacnet-read-${invokeId}`,
          type: "bacnet-read-property",
          stages: [
            {
              id: "request-response",
              send: () => frame,
              expectResponse: true,
              matcher: (rxFrame) => {
                const bvlc = decodeBvlc(rxFrame);
                if (!bvlc) return false;
                const npduResult = decodeNpdu(bvlc.payload);
                if (!npduResult) return false;
                const apduResult = decodeApdu(npduResult.apdu);
                if (!apduResult) return false;
                return apduResult.invokeId === invokeId &&
                  (apduResult.pduType === PduType.COMPLEX_ACK ||
                    apduResult.pduType === PduType.SIMPLE_ACK ||
                    apduResult.pduType === PduType.ERROR);
              },
              timeoutMs: request.timeoutMs ?? context.config.readTimeoutMs ?? 5000,
              onResponse: (rxFrame) => {
                const bvlc = decodeBvlc(rxFrame);
                if (!bvlc) return;
                const npduResult = decodeNpdu(bvlc.payload);
                if (!npduResult) return;
                const apduResult = decodeApdu(npduResult.apdu);
                if (!apduResult) return;
                if (apduResult.pduType === PduType.ERROR) {
                  throw new ProtocolError("PROTOCOL_ERROR", `BACnet error for invoke ID ${invokeId}`);
                }
                if (apduResult.pduType === PduType.REJECT) {
                  throw new ProtocolError("PROTOCOL_ERROR", `BACnet reject for invoke ID ${invokeId}`);
                }
                if (apduResult.pduType === PduType.ABORT) {
                  throw new ProtocolError("PROTOCOL_ERROR", `BACnet abort for invoke ID ${invokeId}`);
                }
              }
            }
          ],
          finalize: ({ responses }) => {
            const resp = responses[0];
            if (!resp) return new Uint8Array();
            const bvlc = decodeBvlc(resp);
            if (!bvlc) return new Uint8Array();
            const npduResult = decodeNpdu(bvlc.payload);
            if (!npduResult) return new Uint8Array();
            const apduResult = decodeApdu(npduResult.apdu);
            if (!apduResult) return new Uint8Array();

            // Return the decoded value as a JSON-encoded Uint8Array
            const parsed = parseReadPropertyAck(apduResult.serviceData);
            if (parsed) {
              const json = JSON.stringify(parsed);
              return new TextEncoder().encode(json);
            }
            return apduResult.serviceData;
          }
        };
      },
      createWritePlan: (request, context) => {
        const addr = parseBacnetAddress(request.address);
        const invokeId = nextInvokeId(context.runtime);

        // Decode the value from the request data
        // The data should be a JSON-encoded BacnetValue or raw bytes
        let bacnetValue: BacnetValue;
        try {
          const json = new TextDecoder().decode(request.data);
          bacnetValue = JSON.parse(json) as BacnetValue;
        } catch {
          // If not JSON, treat as raw enumerated value
          const rawVal = request.data.length > 0 ? request.data[0] : 0;
          bacnetValue = { tag: AppTag.ENUMERATED, value: rawVal };
        }

        const serviceData = buildWritePropertyData(
          addr.objectType,
          addr.objectInstance,
          addr.propertyId,
          bacnetValue
        );
        const apdu = encodeConfirmedRequest(invokeId, ConfirmedServiceChoice.WRITE_PROPERTY, serviceData);
        const npdu = encodeNpdu(apdu, true);
        const frame = encodeBvlc(BvlcFunction.ORIGINAL_UNICAST_NPDU, npdu);

        return {
          id: `bacnet-write-${invokeId}`,
          type: "bacnet-write-property",
          stages: [
            {
              id: "request-response",
              send: () => frame,
              expectResponse: true,
              matcher: (rxFrame) => {
                const bvlc = decodeBvlc(rxFrame);
                if (!bvlc) return false;
                const npduResult = decodeNpdu(bvlc.payload);
                if (!npduResult) return false;
                const apduResult = decodeApdu(npduResult.apdu);
                if (!apduResult) return false;
                return apduResult.invokeId === invokeId &&
                  (apduResult.pduType === PduType.SIMPLE_ACK ||
                    apduResult.pduType === PduType.ERROR);
              },
              timeoutMs: request.timeoutMs ?? context.config.readTimeoutMs ?? 5000,
              onResponse: (rxFrame) => {
                const bvlc = decodeBvlc(rxFrame);
                if (!bvlc) return;
                const npduResult = decodeNpdu(bvlc.payload);
                if (!npduResult) return;
                const apduResult = decodeApdu(npduResult.apdu);
                if (!apduResult) return;
                if (apduResult.pduType === PduType.ERROR) {
                  throw new ProtocolError("PROTOCOL_ERROR", `BACnet write error for invoke ID ${invokeId}`);
                }
              }
            }
          ],
          finalize: () => true
        };
      },
      createCapabilityPlan: (action, payload, context) => {
        switch (action) {
          case "whoIs":
            return buildWhoIsPlan(context, payload as { lowLimit?: number; highLimit?: number } | undefined);
          case "readProperty":
            return buildReadPropertyCapabilityPlan(context, payload as { objectType: number; objectInstance: number; propertyId: number; arrayIndex?: number });
          case "writeProperty":
            return buildWritePropertyCapabilityPlan(context, payload as { objectType: number; objectInstance: number; propertyId: number; value: BacnetValue; priority?: number });
          case "readPropertyMultiple":
            return buildReadPropertyMultiplePlan(context, payload as { objectType: number; objectInstance: number; propertyIds: number[] });
          case "whoHas":
            return buildWhoHasPlan(context, payload as { objectName?: string; objectType?: number; objectInstance?: number });
          default:
            throw new ProtocolError("PROTOCOL_ERROR", `Unknown BACnet capability: ${action}`);
        }
      },
      decodeFrame: async (frame) => decodeBacnetIpFrame(frame),
      encodeFrame: async (input) => {
        // Support raw passthrough for backward compatibility
        const frameInput = input as { data?: Uint8Array | number[] };
        if (frameInput.data instanceof Uint8Array) {
          return frameInput.data;
        }
        if (Array.isArray(frameInput.data)) {
          return new Uint8Array(frameInput.data);
        }
        return new Uint8Array();
      }
    };
  }
}

// ─── Capability Plan Builders ─────────────────────────────────────────────────

function nextInvokeId(runtime: BacnetIpRuntime): number {
  runtime.invokeId = (runtime.invokeId + 1) & 0xff;
  return runtime.invokeId;
}

/**
 * Build a Who-Is discovery plan.
 */
function buildWhoIsPlan(
  context: SessionKernelContext<BacnetIpRuntime, BacnetIpConfig>,
  params?: { lowLimit?: number; highLimit?: number }
) {
  const serviceData = buildWhoIsData(params?.lowLimit, params?.highLimit);
  const apdu = encodeUnconfirmedRequest(UnconfirmedServiceChoice.WHO_IS, serviceData);
  const npdu = encodeNpdu(apdu);
  const frame = encodeBvlc(BvlcFunction.ORIGINAL_BROADCAST_NPDU, npdu);

  return {
    id: `bacnet-whois-${Date.now()}`,
    type: "bacnet-whois",
    stages: [
      {
        id: "send-whois",
        send: () => frame,
        expectResponse: true,
        matcher: (rxFrame: Uint8Array) => {
          const bvlc = decodeBvlc(rxFrame);
          if (!bvlc) return false;
          const npduResult = decodeNpdu(bvlc.payload);
          if (!npduResult) return false;
          const apduResult = decodeApdu(npduResult.apdu);
          if (!apduResult) return false;
          return apduResult.pduType === PduType.UNCONFIRMED_REQUEST &&
            apduResult.serviceChoice === UnconfirmedServiceChoice.I_AM;
        },
        timeoutMs: context.config.readTimeoutMs ?? 5000
      }
    ],
    finalize: ({ responses }: { responses: Uint8Array[] }) => {
      const devices: BacnetDevice[] = [];
      for (const resp of responses) {
        const bvlc = decodeBvlc(resp);
        if (!bvlc) continue;
        const npduResult = decodeNpdu(bvlc.payload);
        if (!npduResult) continue;
        const apduResult = decodeApdu(npduResult.apdu);
        if (!apduResult) continue;

        const device = parseIAmResponse(apduResult.serviceData);
        if (device) {
          // Store discovered device
          context.runtime.discoveredDevices.set(device.deviceInstance, device);
          devices.push(device);
        }
      }
      return devices;
    }
  };
}

/**
 * Build a ReadProperty capability plan.
 */
function buildReadPropertyCapabilityPlan(
  context: SessionKernelContext<BacnetIpRuntime, BacnetIpConfig>,
  params: { objectType: number; objectInstance: number; propertyId: number; arrayIndex?: number }
) {
  const invokeId = nextInvokeId(context.runtime);
  const serviceData = buildReadPropertyData(
    params.objectType,
    params.objectInstance,
    params.propertyId,
    params.arrayIndex
  );
  const apdu = encodeConfirmedRequest(invokeId, ConfirmedServiceChoice.READ_PROPERTY, serviceData);
  const npdu = encodeNpdu(apdu, true);
  const frame = encodeBvlc(BvlcFunction.ORIGINAL_UNICAST_NPDU, npdu);

  return {
    id: `bacnet-rp-${invokeId}`,
    type: "bacnet-read-property",
    stages: [
      {
        id: "request-response",
        send: () => frame,
        expectResponse: true,
        matcher: (rxFrame: Uint8Array) => {
          const bvlc = decodeBvlc(rxFrame);
          if (!bvlc) return false;
          const npduResult = decodeNpdu(bvlc.payload);
          if (!npduResult) return false;
          const apduResult = decodeApdu(npduResult.apdu);
          if (!apduResult) return false;
          return apduResult.invokeId === invokeId;
        },
        timeoutMs: context.config.readTimeoutMs ?? 5000
      }
    ],
    finalize: ({ responses }: { responses: Uint8Array[] }) => {
      const resp = responses[0];
      if (!resp) return null;
      const bvlc = decodeBvlc(resp);
      if (!bvlc) return null;
      const npduResult = decodeNpdu(bvlc.payload);
      if (!npduResult) return null;
      const apduResult = decodeApdu(npduResult.apdu);
      if (!apduResult) return null;
      return parseReadPropertyAck(apduResult.serviceData);
    }
  };
}

/**
 * Build a WriteProperty capability plan.
 */
function buildWritePropertyCapabilityPlan(
  context: SessionKernelContext<BacnetIpRuntime, BacnetIpConfig>,
  params: { objectType: number; objectInstance: number; propertyId: number; value: BacnetValue; priority?: number }
) {
  const invokeId = nextInvokeId(context.runtime);
  const serviceData = buildWritePropertyData(
    params.objectType,
    params.objectInstance,
    params.propertyId,
    params.value,
    params.priority
  );
  const apdu = encodeConfirmedRequest(invokeId, ConfirmedServiceChoice.WRITE_PROPERTY, serviceData);
  const npdu = encodeNpdu(apdu, true);
  const frame = encodeBvlc(BvlcFunction.ORIGINAL_UNICAST_NPDU, npdu);

  return {
    id: `bacnet-wp-${invokeId}`,
    type: "bacnet-write-property",
    stages: [
      {
        id: "request-response",
        send: () => frame,
        expectResponse: true,
        matcher: (rxFrame: Uint8Array) => {
          const bvlc = decodeBvlc(rxFrame);
          if (!bvlc) return false;
          const npduResult = decodeNpdu(bvlc.payload);
          if (!npduResult) return false;
          const apduResult = decodeApdu(npduResult.apdu);
          if (!apduResult) return false;
          return apduResult.invokeId === invokeId;
        },
        timeoutMs: context.config.readTimeoutMs ?? 5000
      }
    ],
    finalize: () => true
  };
}

/**
 * Build a ReadPropertyMultiple capability plan.
 */
function buildReadPropertyMultiplePlan(
  context: SessionKernelContext<BacnetIpRuntime, BacnetIpConfig>,
  params: { objectType: number; objectInstance: number; propertyIds: number[] }
) {
  const invokeId = nextInvokeId(context.runtime);
  const serviceData = buildReadPropertyMultipleData(
    params.objectType,
    params.objectInstance,
    params.propertyIds
  );
  const apdu = encodeConfirmedRequest(invokeId, ConfirmedServiceChoice.READ_PROPERTY_MULTIPLE, serviceData);
  const npdu = encodeNpdu(apdu, true);
  const frame = encodeBvlc(BvlcFunction.ORIGINAL_UNICAST_NPDU, npdu);

  return {
    id: `bacnet-rpm-${invokeId}`,
    type: "bacnet-read-property-multiple",
    stages: [
      {
        id: "request-response",
        send: () => frame,
        expectResponse: true,
        matcher: (rxFrame: Uint8Array) => {
          const bvlc = decodeBvlc(rxFrame);
          if (!bvlc) return false;
          const npduResult = decodeNpdu(bvlc.payload);
          if (!npduResult) return false;
          const apduResult = decodeApdu(npduResult.apdu);
          if (!apduResult) return false;
          return apduResult.invokeId === invokeId;
        },
        timeoutMs: context.config.readTimeoutMs ?? 5000
      }
    ],
    finalize: ({ responses }: { responses: Uint8Array[] }) => {
      const resp = responses[0];
      if (!resp) return [];
      const bvlc = decodeBvlc(resp);
      if (!bvlc) return [];
      const npduResult = decodeNpdu(bvlc.payload);
      if (!npduResult) return [];
      const apduResult = decodeApdu(npduResult.apdu);
      if (!apduResult) return [];
      return parseReadPropertyMultipleAck(apduResult.serviceData);
    }
  };
}

/**
 * Build a Who-Has capability plan.
 */
function buildWhoHasPlan(
  context: SessionKernelContext<BacnetIpRuntime, BacnetIpConfig>,
  params: { objectName?: string; objectType?: number; objectInstance?: number }
) {
  const serviceData = buildWhoHasData(params.objectName, params.objectType, params.objectInstance);
  const apdu = encodeUnconfirmedRequest(UnconfirmedServiceChoice.WHO_HAS, serviceData);
  const npdu = encodeNpdu(apdu);
  const frame = encodeBvlc(BvlcFunction.ORIGINAL_BROADCAST_NPDU, npdu);

  return {
    id: `bacnet-whohas-${Date.now()}`,
    type: "bacnet-whohas",
    stages: [
      {
        id: "send-whohas",
        send: () => frame,
        expectResponse: true,
        matcher: (rxFrame: Uint8Array) => {
          const bvlc = decodeBvlc(rxFrame);
          if (!bvlc) return false;
          const npduResult = decodeNpdu(bvlc.payload);
          if (!npduResult) return false;
          const apduResult = decodeApdu(npduResult.apdu);
          if (!apduResult) return false;
          return apduResult.pduType === PduType.UNCONFIRMED_REQUEST &&
            apduResult.serviceChoice === UnconfirmedServiceChoice.I_HAVE;
        },
        timeoutMs: context.config.readTimeoutMs ?? 5000
      }
    ],
    finalize: ({ responses }: { responses: Uint8Array[] }) => {
      const results: Array<{ deviceInstance: number; objectType: number; objectInstance: number; objectName: string }> = [];
      for (const resp of responses) {
        const bvlc = decodeBvlc(resp);
        if (!bvlc) continue;
        const npduResult = decodeNpdu(bvlc.payload);
        if (!npduResult) continue;
        const apduResult = decodeApdu(npduResult.apdu);
        if (!apduResult) continue;

        // Parse I-Have response
        let offset = 0;
        const deviceResult = decodeApplicationTag(apduResult.serviceData, offset);
        if (!deviceResult) continue;
        offset += deviceResult.length;

        const objResult = decodeApplicationTag(apduResult.serviceData, offset);
        if (!objResult) continue;
        offset += objResult.length;

        const nameResult = decodeApplicationTag(apduResult.serviceData, offset);
        if (!nameResult) continue;

        results.push({
          deviceInstance: deviceResult.value.objectInstance ?? 0,
          objectType: objResult.value.objectType ?? 0,
          objectInstance: objResult.value.objectInstance ?? 0,
          objectName: nameResult.value.value as string
        });
      }
      return results;
    }
  };
}

// ─── Frame Decoder ────────────────────────────────────────────────────────────

/**
 * Decode a complete BACnet/IP frame into structured fields.
 * @param frame - Raw BACnet/IP frame bytes
 * @returns Decoded frame with parsed fields
 */
function decodeBacnetIpFrame(frame: Uint8Array): DecodedFrame {
  if (frame.length < 4) {
    return {
      fields: { raw: Array.from(frame) },
      isError: true,
      errorDescription: "Frame too short for BVLC header (minimum 4 bytes)"
    };
  }

  const bvlc = decodeBvlc(frame);
  if (!bvlc) {
    return {
      fields: { raw: Array.from(frame) },
      isError: true,
      errorDescription: "Invalid BVLC header"
    };
  }

  const fields: Record<string, unknown> = {
    bvlcType: `0x${bvlc.type.toString(16).padStart(2, "0")}`,
    bvlcFunction: bvlc.function,
    bvlcFunctionName: getBvlcFunctionName(bvlc.function),
    bvlcLength: bvlc.length
  };

  if (bvlc.forwardedAddress) {
    fields.forwardedFrom = `${bvlc.forwardedAddress.addr.join(".")}:${bvlc.forwardedAddress.port}`;
  }

  // Decode NPDU
  const npdu = decodeNpdu(bvlc.payload);
  if (npdu) {
    fields.npduVersion = npdu.version;
    fields.npduExpectsReply = npdu.expectsReply;
    fields.npduNetworkLayerMessage = npdu.networkLayerMessage;

    if (npdu.sourceNetwork !== undefined) {
      fields.npduSourceNetwork = npdu.sourceNetwork;
      fields.npduSourceAddress = npdu.sourceAddress?.join(".");
    }
    if (npdu.destinationNetwork !== undefined) {
      fields.npduDestinationNetwork = npdu.destinationNetwork;
      fields.npduDestinationAddress = npdu.destinationAddress?.join(".");
    }

    // Decode APDU
    const apdu = decodeApdu(npdu.apdu);
    if (apdu) {
      fields.apduType = apdu.pduType;
      fields.apduTypeName = getPduTypeName(apdu.pduType);
      fields.apduServiceChoice = apdu.serviceChoice;
      fields.apduServiceName = getServiceName(apdu.pduType, apdu.serviceChoice);

      if (apdu.invokeId !== undefined) {
        fields.apduInvokeId = apdu.invokeId;
      }

      // Parse service data for known types
      if (apdu.pduType === PduType.UNCONFIRMED_REQUEST) {
        if (apdu.serviceChoice === UnconfirmedServiceChoice.I_AM) {
          const device = parseIAmResponse(apdu.serviceData);
          if (device) {
            fields.iAmDevice = device;
          }
        }
      } else if (apdu.pduType === PduType.COMPLEX_ACK) {
        if (apdu.serviceChoice === ConfirmedServiceChoice.READ_PROPERTY) {
          const value = parseReadPropertyAck(apdu.serviceData);
          if (value) {
            fields.readPropertyResult = value;
          }
        }
      }

      fields.apduDataHex = Array.from(apdu.serviceData.slice(0, 40))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
    }
  }

  return { fields, isError: false };
}

/**
 * Get human-readable name for BVLC function code.
 */
function getBvlcFunctionName(func: number): string {
  const names: Record<number, string> = {
    [BvlcFunction.RESULT]: "Result",
    [BvlcFunction.WRITE_BDT]: "Write-BDT",
    [BvlcFunction.READ_BDT]: "Read-BDT",
    [BvlcFunction.READ_BDT_ACK]: "Read-BDT-Ack",
    [BvlcFunction.FORWARDED_NPDU]: "Forwarded-NPDU",
    [BvlcFunction.REGISTER_FOREIGN_DEVICE]: "Register-Foreign-Device",
    [BvlcFunction.READ_FDT]: "Read-FDT",
    [BvlcFunction.READ_FDT_ACK]: "Read-FDT-Ack",
    [BvlcFunction.DELETE_FDT_ENTRY]: "Delete-FDT-Entry",
    [BvlcFunction.DISTRIBUTE_BROADCAST]: "Distribute-Broadcast",
    [BvlcFunction.ORIGINAL_UNICAST_NPDU]: "Original-Unicast-NPDU",
    [BvlcFunction.ORIGINAL_BROADCAST_NPDU]: "Original-Broadcast-NPDU"
  };
  return names[func] ?? `Unknown(0x${func.toString(16)})`;
}

/**
 * Get human-readable name for PDU type.
 */
function getPduTypeName(pduType: number): string {
  const names: Record<number, string> = {
    [PduType.CONFIRMED_REQUEST]: "Confirmed-Request",
    [PduType.UNCONFIRMED_REQUEST]: "Unconfirmed-Request",
    [PduType.SIMPLE_ACK]: "Simple-ACK",
    [PduType.COMPLEX_ACK]: "Complex-ACK",
    [PduType.SEGMENT_ACK]: "Segment-ACK",
    [PduType.ERROR]: "Error",
    [PduType.REJECT]: "Reject",
    [PduType.ABORT]: "Abort"
  };
  return names[pduType] ?? `Unknown(${pduType})`;
}

/**
 * Get human-readable name for a BACnet service.
 */
function getServiceName(pduType: number, serviceChoice: number): string {
  if (pduType === PduType.UNCONFIRMED_REQUEST) {
    const names: Record<number, string> = {
      [UnconfirmedServiceChoice.I_AM]: "I-Am",
      [UnconfirmedServiceChoice.I_HAVE]: "I-Have",
      [UnconfirmedServiceChoice.COV_NOTIFICATION]: "COV-Notification",
      [UnconfirmedServiceChoice.EVENT_NOTIFICATION]: "Event-Notification",
      [UnconfirmedServiceChoice.PRIVATE_TRANSFER]: "Private-Transfer",
      [UnconfirmedServiceChoice.TEXT_MESSAGE]: "Text-Message",
      [UnconfirmedServiceChoice.TIME_SYNCHRONIZATION]: "Time-Synchronization",
      [UnconfirmedServiceChoice.WHO_HAS]: "Who-Has",
      [UnconfirmedServiceChoice.WHO_IS]: "Who-Is",
      [UnconfirmedServiceChoice.UTC_TIME_SYNCHRONIZATION]: "UTC-Time-Synchronization",
      [UnconfirmedServiceChoice.WRITE_GROUP]: "Write-Group"
    };
    return names[serviceChoice] ?? `Unknown(${serviceChoice})`;
  }

  if (pduType === PduType.CONFIRMED_REQUEST || pduType === PduType.COMPLEX_ACK || pduType === PduType.SIMPLE_ACK) {
    const names: Record<number, string> = {
      [ConfirmedServiceChoice.ACKNOWLEDGE_ALARM]: "Acknowledge-Alarm",
      [ConfirmedServiceChoice.COV_NOTIFICATION]: "COV-Notification",
      [ConfirmedServiceChoice.EVENT_NOTIFICATION]: "Event-Notification",
      [ConfirmedServiceChoice.GET_ENROLLMENT_SUMMARY]: "Get-Enrollment-Summary",
      [ConfirmedServiceChoice.SUBSCRIBE_COV]: "Subscribe-COV",
      [ConfirmedServiceChoice.ATOMIC_READ_FILE]: "Atomic-Read-File",
      [ConfirmedServiceChoice.ATOMIC_WRITE_FILE]: "Atomic-Write-File",
      [ConfirmedServiceChoice.ADD_LIST_ELEMENT]: "Add-List-Element",
      [ConfirmedServiceChoice.REMOVE_LIST_ELEMENT]: "Remove-List-Element",
      [ConfirmedServiceChoice.CREATE_OBJECT]: "Create-Object",
      [ConfirmedServiceChoice.DELETE_OBJECT]: "Delete-Object",
      [ConfirmedServiceChoice.READ_PROPERTY]: "ReadProperty",
      [ConfirmedServiceChoice.READ_PROPERTY_MULTIPLE]: "ReadPropertyMultiple",
      [ConfirmedServiceChoice.WRITE_PROPERTY]: "WriteProperty",
      [ConfirmedServiceChoice.WRITE_PROPERTY_MULTIPLE]: "WritePropertyMultiple",
      [ConfirmedServiceChoice.DEVICE_COMMUNICATION_CONTROL]: "Device-Communication-Control",
      [ConfirmedServiceChoice.CONFIRMED_PRIVATE_TRANSFER]: "Confirmed-Private-Transfer",
      [ConfirmedServiceChoice.CONFIRMED_TEXT_MESSAGE]: "Confirmed-Text-Message",
      [ConfirmedServiceChoice.REINITIALIZE_DEVICE]: "Reinitialize-Device",
      [ConfirmedServiceChoice.READ_RANGE]: "Read-Range",
      [ConfirmedServiceChoice.SUBSCRIBE_COV_PROPERTY]: "Subscribe-COV-Property",
      [ConfirmedServiceChoice.GET_EVENT_INFORMATION]: "Get-Event-Information"
    };
    return names[serviceChoice] ?? `Unknown(${serviceChoice})`;
  }

  return `Service(${serviceChoice})`;
}

// ─── Re-export constants for external use ─────────────────────────────────────

export {
  ObjectType,
  PropertyId,
  AppTag,
  PduType,
  UnconfirmedServiceChoice,
  ConfirmedServiceChoice,
  Segmentation,
  BvlcFunction,
  buildObjectIdentifier,
  encodeApplicationTag,
  decodeApplicationTag,
  encodeBvlc,
  decodeBvlc,
  encodeNpdu,
  decodeNpdu,
  encodeUnconfirmedRequest,
  encodeConfirmedRequest,
  decodeApdu
};

export default BacnetIpEngine;
