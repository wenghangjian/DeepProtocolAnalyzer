import type { ReadRequest, WriteRequest } from "../../packages/shared-types";
import { ProtocolError } from "../../packages/shared-types";
import type { ProtocolAdapter } from "../../packages/protocol-core";
import { SerialTransport } from "../../packages/transport-core/serial-transport";
import { AdapterBackedDriver } from "../_shared/adapter-driver";
import {
  FC,
  BIT_READ_FCS,
  VALID_READ_FCS,
  VALID_WRITE_FCS,
  parseAddress,
  packBits,
  unpackBits,
  buildReadPDU,
  buildWritePDU,
  decodeModbusPduFields,
  validateReadFunctionCode,
  validateWriteFunctionCode,
  normalizeFrameInput
} from "../_shared/modbus-common";

interface ModbusRtuConfig {
  path: string;
  baudRate: number;
  unitId?: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  readTimeoutMs?: number;
  writeTimeoutMs?: number;
}

// ─── CRC-16 (Modbus RTU) ────────────────────────────────────────────

function calculateCrc(data: Uint8Array) {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc;
}

function appendCrc(data: Uint8Array) {
  const crc = calculateCrc(data);
  const frame = new Uint8Array(data.length + 2);
  frame.set(data, 0);
  frame[data.length] = crc & 0xff;
  frame[data.length + 1] = crc >> 8;
  return frame;
}

function ensureValidCrc(frame: Uint8Array) {
  if (frame.length < 4) {
    throw new ProtocolError("PROTOCOL_ERROR", "Incomplete Modbus RTU frame", frame);
  }
  const payload = frame.slice(0, -2);
  const receivedCrc = frame[frame.length - 2] | (frame[frame.length - 1] << 8);
  const expectedCrc = calculateCrc(payload);
  if (receivedCrc !== expectedCrc) {
    throw new ProtocolError("PROTOCOL_ERROR", "CRC validation failed", frame);
  }
}

// ─── Frame Builders ─────────────────────────────────────────────────

/**
 * Build a Modbus RTU read request frame.
 * RTU frame: `[unitId(1), functionCode(1), data..., crcLo(1), crcHi(1)]`
 */
function buildReadFrame(request: ReadRequest, unitId: number) {
  const address = parseAddress(request.address);
  const functionCode = request.functionCode ?? FC.READ_HOLDING_REGISTERS;
  validateReadFunctionCode(functionCode);

  const pdu = buildReadPDU(unitId, functionCode, address, request.length);
  return appendCrc(pdu);
}

/**
 * Build a Modbus RTU write request frame.
 */
function buildWriteFrame(request: WriteRequest, unitId: number) {
  const pdu = buildWritePDU(request, unitId);
  return appendCrc(pdu);
}

export class ModbusRtuEngine extends AdapterBackedDriver<ModbusRtuConfig> {
  protected protocolId = "modbus-rtu";
  protected defaultConfig: ModbusRtuConfig = {
    path: "COM1",
    baudRate: 9600,
    unitId: 1,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    readTimeoutMs: 3000,
    writeTimeoutMs: 3000
  };

  protected buildAdapter(_config: ModbusRtuConfig): ProtocolAdapter<Record<string, unknown>, ModbusRtuConfig> {
    return {
      protocolId: this.protocolId,
      createTransport: (config) => new SerialTransport({
        path: config.path,
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits,
        parity: config.parity
      }),
      createReadPlan: (request, context) => {
        const unitId = request.unitId ?? context.config.unitId ?? 1;
        const functionCode = request.functionCode ?? FC.READ_HOLDING_REGISTERS;
        validateReadFunctionCode(functionCode);

        return {
          id: `modbus-rtu-read-${Date.now()}`,
          type: "modbus-rtu-read",
          stages: [
            {
              id: "request-response",
              send: () => buildReadFrame(request, unitId),
              expectResponse: true,
              matcher: (frame) => frame.length >= 5
                && frame[0] === unitId
                && (frame[1] === functionCode || frame[1] === (functionCode | 0x80)),
              timeoutMs: request.timeoutMs ?? context.config.readTimeoutMs ?? 3000,
              onResponse: (frame) => {
                ensureValidCrc(frame);
                if (frame[1] >= 0x80) {
                  throw new ProtocolError("PROTOCOL_ERROR", `Modbus exception code ${frame[2]}`, frame);
                }
              }
            }
          ],
          finalize: ({ responses }) => {
            const resp = responses[0];
            if (!resp || resp.length < 5) return new Uint8Array();

            const respFc = resp[1];
            const byteCount = resp[2];
            const data = resp.slice(3, 3 + byteCount);

            // For bit-packed responses (FC01/FC02), return the raw bit-packed bytes
            // The caller can use unpackBits() to extract individual boolean values
            if (BIT_READ_FCS.has(respFc)) {
              return data;
            }

            // For register responses (FC03/FC04), return register bytes
            return data;
          }
        };
      },
      createWritePlan: (request, context) => {
        const unitId = request.unitId ?? context.config.unitId ?? 1;
        const functionCode = request.functionCode ?? (request.data.length === 2 ? FC.WRITE_SINGLE_REGISTER : FC.WRITE_MULTIPLE_REGISTERS);
        validateWriteFunctionCode(functionCode);

        return {
          id: `modbus-rtu-write-${Date.now()}`,
          type: "modbus-rtu-write",
          stages: [
            {
              id: "request-response",
              send: () => buildWriteFrame(request, unitId),
              expectResponse: true,
              matcher: (frame) => frame.length >= 5
                && frame[0] === unitId
                && (frame[1] === functionCode || frame[1] === (functionCode | 0x80)),
              timeoutMs: request.timeoutMs ?? context.config.writeTimeoutMs ?? 3000,
              onResponse: (frame) => {
                ensureValidCrc(frame);
                if (frame[1] >= 0x80) {
                  throw new ProtocolError("PROTOCOL_ERROR", `Modbus exception code ${frame[2]}`, frame);
                }
              }
            }
          ],
          finalize: () => true
        };
      },
      decodeFrame: async (frame) => {
        if (frame.length < 3) {
          return {
            fields: { raw: Array.from(frame) },
            isError: true,
            errorDescription: "Frame too short to decode"
          };
        }

        // Decode PDU fields starting at unitId offset (byte 0 for RTU)
        return decodeModbusPduFields(frame, 0);
      },
      encodeFrame: async (input, context) => {
        const frameInput = normalizeFrameInput(input);
        const unitId = frameInput.unitId ?? context.config.unitId ?? 1;
        const fc = frameInput.functionCode ?? frameInput.fc;

        if (frameInput.data instanceof Uint8Array) {
          return buildWriteFrame({
            address: String(frameInput.address ?? frameInput.addr ?? 0),
            data: frameInput.data,
            functionCode: fc
          }, unitId);
        }

        // If coils array is provided, pack bits and use FC15
        if (Array.isArray(frameInput.coils)) {
          const packed = packBits(frameInput.coils);
          return buildWriteFrame({
            address: String(frameInput.address ?? frameInput.addr ?? 0),
            data: packed,
            functionCode: fc ?? FC.WRITE_MULTIPLE_COILS
          }, unitId);
        }

        return buildReadFrame({
          address: String(frameInput.address ?? frameInput.addr ?? 0),
          length: frameInput.length ?? frameInput.len ?? 1,
          functionCode: fc
        }, unitId);
      }
    };
  }
}

// Re-export utility functions for use by consumers
export { packBits, unpackBits };
