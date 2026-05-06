/**
 * Shared Modbus utilities used by both Modbus TCP and Modbus RTU engines.
 *
 * This module contains all protocol-level logic that is identical between
 * the two transports: function-code constants, bit-packing helpers, PDU
 * builders, validation, and response decoding.  Transport-specific framing
 * (MBAP header for TCP, CRC-16 for RTU) stays in each engine.
 *
 * @module modbus-common
 */

import type { ReadRequest, WriteRequest } from "../../packages/shared-types";
import { ProtocolError } from "../../packages/shared-types";

// ─── Function Code Constants ────────────────────────────────────────

/** Standard Modbus function codes (FC01 – FC16). */
export const FC = {
  READ_COILS: 0x01,
  READ_DISCRETE_INPUTS: 0x02,
  READ_HOLDING_REGISTERS: 0x03,
  READ_INPUT_REGISTERS: 0x04,
  WRITE_SINGLE_COIL: 0x05,
  WRITE_SINGLE_REGISTER: 0x06,
  WRITE_MULTIPLE_COILS: 0x0f,
  WRITE_MULTIPLE_REGISTERS: 0x10
} as const;

/** Function codes that read bit-packed data (coils / discrete inputs). */
export const BIT_READ_FCS: Set<number> = new Set([FC.READ_COILS, FC.READ_DISCRETE_INPUTS]);

/** Function codes that read 16-bit register data (holding / input registers). */
export const REGISTER_READ_FCS: Set<number> = new Set([FC.READ_HOLDING_REGISTERS, FC.READ_INPUT_REGISTERS]);

/** All valid read function codes. */
export const VALID_READ_FCS: Set<number> = new Set([...BIT_READ_FCS, ...REGISTER_READ_FCS]);

/** All valid write function codes. */
export const VALID_WRITE_FCS: Set<number> = new Set([
  FC.WRITE_SINGLE_COIL,
  FC.WRITE_SINGLE_REGISTER,
  FC.WRITE_MULTIPLE_COILS,
  FC.WRITE_MULTIPLE_REGISTERS
]);

// ─── Utility Functions ──────────────────────────────────────────────

/**
 * Parse a decimal address string into a number.
 * Throws {@link ProtocolError} with code `INVALID_ADDRESS` if the string
 * is not a valid integer.
 *
 * @param addressText - Decimal address string (e.g. `"40001"`)
 * @returns The numeric address
 */
export function parseAddress(addressText: string): number {
  const address = Number.parseInt(addressText, 10);
  if (Number.isNaN(address)) {
    throw new ProtocolError("INVALID_ADDRESS", `Invalid Modbus address: ${addressText}`);
  }
  return address;
}

/**
 * Pack an array of boolean values into bit-packed bytes (LSB first).
 * Used for coil / discrete-input write operations (FC15).
 *
 * @param values - Boolean values to pack
 * @returns Packed bytes
 */
export function packBits(values: boolean[]): Uint8Array {
  const byteCount = Math.ceil(values.length / 8);
  const result = new Uint8Array(byteCount);
  for (let i = 0; i < values.length; i++) {
    if (values[i]) {
      result[Math.floor(i / 8)] |= 1 << (i % 8);
    }
  }
  return result;
}

/**
 * Unpack bit-packed bytes into an array of boolean values (LSB first).
 * Used for coil / discrete-input read responses (FC01/FC02).
 *
 * @param data - Bit-packed bytes
 * @param bitCount - Number of boolean values to extract
 * @returns Array of boolean values
 */
export function unpackBits(data: Uint8Array, bitCount: number): boolean[] {
  const result: boolean[] = [];
  for (let i = 0; i < bitCount; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = i % 8;
    result.push((data[byteIndex] & (1 << bitIndex)) !== 0);
  }
  return result;
}

// ─── Frame Input Type ───────────────────────────────────────────────

/**
 * Normalized shape of the opaque `input` object passed to `encodeFrame`.
 * Both engines accept the same flexible input shape.
 */
export interface FrameInput {
  fc?: number;
  functionCode?: number;
  addr?: number;
  address?: number;
  len?: number;
  length?: number;
  unitId?: number;
  data?: Uint8Array;
  coils?: boolean[];
}

/**
 * Cast an opaque `encodeFrame` input to the known {@link FrameInput} shape.
 */
export function normalizeFrameInput(input: unknown): FrameInput {
  return input as FrameInput;
}

// ─── Validation Helpers ─────────────────────────────────────────────

/**
 * Validate that `functionCode` is a supported read function code.
 * Throws {@link ProtocolError} with code `PROTOCOL_ERROR` if not.
 */
export function validateReadFunctionCode(functionCode: number): void {
  if (!VALID_READ_FCS.has(functionCode)) {
    throw new ProtocolError(
      "PROTOCOL_ERROR",
      `Unsupported read function code: 0x${functionCode.toString(16).padStart(2, "0")}`
    );
  }
}

/**
 * Validate that `functionCode` is a supported write function code.
 * Throws {@link ProtocolError} with code `PROTOCOL_ERROR` if not.
 */
export function validateWriteFunctionCode(functionCode: number): void {
  if (!VALID_WRITE_FCS.has(functionCode)) {
    throw new ProtocolError(
      "PROTOCOL_ERROR",
      `Unsupported write function code: 0x${functionCode.toString(16).padStart(2, "0")}`
    );
  }
}

// ─── PDU Builders ───────────────────────────────────────────────────

/**
 * Build a Modbus read PDU (Protocol Data Unit).
 *
 * Returns the raw PDU bytes **without** any transport-specific framing
 * (no MBAP header, no CRC).  The caller is responsible for wrapping.
 *
 * @param unitId - Modbus unit/slave ID
 * @param functionCode - Read function code (FC01–FC04)
 * @param address - Starting register/coil address
 * @param quantity - Number of coils/registers to read
 * @returns PDU bytes: `[unitId, fc, addrHi, addrLo, qtyHi, qtyLo]`
 */
export function buildReadPDU(
  unitId: number,
  functionCode: number,
  address: number,
  quantity: number
): Uint8Array {
  return new Uint8Array([
    unitId,
    functionCode,
    address >> 8,
    address & 0xff,
    quantity >> 8,
    quantity & 0xff
  ]);
}

/**
 * Build a Modbus write PDU based on the write request.
 *
 * Handles FC05 (Write Single Coil), FC06 (Write Single Register),
 * FC15 (Write Multiple Coils), and FC16 (Write Multiple Registers).
 *
 * Returns the raw PDU bytes **without** any transport-specific framing.
 *
 * @param request - Write request (address, data, optional functionCode)
 * @param unitId - Modbus unit/slave ID
 * @returns PDU bytes
 */
export function buildWritePDU(request: WriteRequest, unitId: number): Uint8Array {
  const address = parseAddress(request.address);
  const functionCode =
    request.functionCode ??
    (request.data.length === 2 ? FC.WRITE_SINGLE_REGISTER : FC.WRITE_MULTIPLE_REGISTERS);

  validateWriteFunctionCode(functionCode);

  // FC05: Write Single Coil
  if (functionCode === FC.WRITE_SINGLE_COIL) {
    let coilValue: number;
    if (request.data.length === 1) {
      coilValue = request.data[0] !== 0 ? 0xff00 : 0x0000;
    } else if (request.data.length === 2) {
      coilValue = (request.data[0] << 8) | request.data[1];
    } else {
      throw new ProtocolError("PROTOCOL_ERROR", "FC05 requires 1 or 2 bytes of data");
    }
    return new Uint8Array([
      unitId,
      functionCode,
      address >> 8,
      address & 0xff,
      (coilValue >> 8) & 0xff,
      coilValue & 0xff
    ]);
  }

  // FC06: Write Single Register
  if (functionCode === FC.WRITE_SINGLE_REGISTER) {
    if (request.data.length !== 2) {
      throw new ProtocolError("PROTOCOL_ERROR", "FC06 requires exactly 2 bytes");
    }
    return new Uint8Array([
      unitId,
      functionCode,
      address >> 8,
      address & 0xff,
      request.data[0],
      request.data[1]
    ]);
  }

  // FC15: Write Multiple Coils
  if (functionCode === FC.WRITE_MULTIPLE_COILS) {
    const coilCount = request.data.length * 8;
    const byteCount = request.data.length;
    const pdu = new Uint8Array(7 + byteCount);
    pdu.set(
      [
        unitId,
        functionCode,
        address >> 8,
        address & 0xff,
        coilCount >> 8,
        coilCount & 0xff,
        byteCount
      ],
      0
    );
    pdu.set(request.data, 7);
    return pdu;
  }

  // FC16: Write Multiple Registers (default)
  const registerCount = Math.max(1, Math.ceil(request.data.length / 2));
  const pdu = new Uint8Array(7 + request.data.length);
  pdu.set(
    [
      unitId,
      functionCode,
      address >> 8,
      address & 0xff,
      registerCount >> 8,
      registerCount & 0xff,
      request.data.length
    ],
    0
  );
  pdu.set(request.data, 7);
  return pdu;
}

// ─── Response Decoding ──────────────────────────────────────────────

/**
 * Result of decoding a Modbus PDU from a response frame.
 */
export interface ModbusDecodeResult {
  fields: Record<string, unknown>;
  isError: boolean;
  errorDescription?: string;
}

/**
 * Decode Modbus PDU fields from a response frame.
 *
 * This function parses the common Modbus response fields starting at
 * `unitIdOffset`.  Transport-specific fields (e.g. MBAP header for TCP)
 * must be added by the caller.
 *
 * @param frame - Complete response frame bytes
 * @param unitIdOffset - Byte offset of the unitId within the frame
 *   (6 for Modbus TCP, 0 for Modbus RTU)
 * @returns Decoded fields, error flag, and optional error description
 */
export function decodeModbusPduFields(
  frame: Uint8Array,
  unitIdOffset: number
): ModbusDecodeResult {
  if (frame.length < unitIdOffset + 2) {
    return {
      fields: { raw: Array.from(frame) },
      isError: true,
      errorDescription: "Frame too short to decode"
    };
  }

  const unitId = frame[unitIdOffset];
  const functionCode = frame[unitIdOffset + 1];
  const isError = functionCode >= 0x80;

  const fields: Record<string, unknown> = {
    unitId,
    functionCode: isError ? functionCode & 0x7f : functionCode,
    isException: isError
  };

  if (isError) {
    // Exception response: FC | 0x80, exception code
    fields.exceptionCode = frame.length > unitIdOffset + 2 ? frame[unitIdOffset + 2] : undefined;
    return {
      fields,
      isError: true,
      errorDescription: `Modbus exception code ${fields.exceptionCode}`
    };
  }

  // Parse response data based on function code
  if (frame.length > unitIdOffset + 2) {
    if (BIT_READ_FCS.has(functionCode)) {
      // FC01/FC02: byte count followed by bit-packed data
      const byteCount = frame[unitIdOffset + 2];
      fields.byteCount = byteCount;
      if (frame.length > unitIdOffset + 3) {
        const bitData = frame.slice(unitIdOffset + 3, unitIdOffset + 3 + byteCount);
        fields.bitData = Array.from(bitData);
      }
    } else if (REGISTER_READ_FCS.has(functionCode)) {
      // FC03/FC04: byte count followed by register data
      const byteCount = frame[unitIdOffset + 2];
      fields.byteCount = byteCount;
      if (frame.length > unitIdOffset + 3) {
        const registerData = frame.slice(unitIdOffset + 3, unitIdOffset + 3 + byteCount);
        fields.registerData = Array.from(registerData);
        // Parse as 16-bit register values
        const registers: number[] = [];
        for (let i = 0; i + 1 < registerData.length; i += 2) {
          registers.push((registerData[i] << 8) | registerData[i + 1]);
        }
        fields.registers = registers;
      }
    } else if (functionCode === FC.WRITE_SINGLE_COIL || functionCode === FC.WRITE_SINGLE_REGISTER) {
      // FC05/FC06: echo back address and value
      if (frame.length >= unitIdOffset + 6) {
        fields.address = (frame[unitIdOffset + 2] << 8) | frame[unitIdOffset + 3];
        fields.value = (frame[unitIdOffset + 4] << 8) | frame[unitIdOffset + 5];
      }
    } else if (functionCode === FC.WRITE_MULTIPLE_COILS || functionCode === FC.WRITE_MULTIPLE_REGISTERS) {
      // FC15/FC16: echo back address and quantity
      if (frame.length >= unitIdOffset + 6) {
        fields.address = (frame[unitIdOffset + 2] << 8) | frame[unitIdOffset + 3];
        fields.quantity = (frame[unitIdOffset + 4] << 8) | frame[unitIdOffset + 5];
      }
    }
  }

  return { fields, isError: false };
}

// ─── Read Response Data Extraction ──────────────────────────────────

/**
 * Extract the data bytes from a Modbus read response.
 *
 * @param frame - Complete response frame
 * @param fcOffset - Byte offset of the function code within the frame
 *   (7 for Modbus TCP, 1 for Modbus RTU)
 * @returns The data bytes (bit-packed or register bytes)
 */
export function extractReadResponseData(
  frame: Uint8Array,
  fcOffset: number
): Uint8Array {
  const respFc = frame[fcOffset];
  const byteCount = frame[fcOffset + 1];
  return frame.slice(fcOffset + 2, fcOffset + 2 + byteCount);
}
