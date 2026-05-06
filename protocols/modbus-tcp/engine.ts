import type { ReadRequest, WriteRequest } from "../../packages/shared-types";
import { ProtocolError } from "../../packages/shared-types";
import type { ProtocolAdapter } from "../../packages/protocol-core";
import { TcpTransport } from "../../packages/transport-core/tcp-transport";
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
  extractReadResponseData,
  validateReadFunctionCode,
  validateWriteFunctionCode,
  normalizeFrameInput
} from "../_shared/modbus-common";

interface ModbusTcpConfig {
  host: string;
  port: number;
  unitId?: number;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
  writeTimeoutMs?: number;
}

interface ModbusTcpRuntime {
  transactionId: number;
}

function nextTransactionId(runtime: ModbusTcpRuntime) {
  runtime.transactionId = (runtime.transactionId + 1) & 0xffff;
  return runtime.transactionId;
}

/**
 * Build a Modbus TCP read request frame with MBAP header.
 * MBAP header: `[transactionId(2), protocolId(2), length(2), unitId(1)]` + PDU
 */
function buildReadFrame(request: ReadRequest, unitId: number, transactionId: number) {
  const address = parseAddress(request.address);
  const functionCode = request.functionCode ?? FC.READ_HOLDING_REGISTERS;
  validateReadFunctionCode(functionCode);

  const pdu = buildReadPDU(unitId, functionCode, address, request.length);
  const frame = new Uint8Array(6 + pdu.length); // 6-byte MBAP header + PDU
  frame[0] = transactionId >> 8;
  frame[1] = transactionId & 0xff;
  frame[2] = 0; // protocol ID
  frame[3] = 0;
  frame[4] = 0; // length high byte
  frame[5] = pdu.length; // length low byte
  frame.set(pdu, 6);
  return frame;
}

/**
 * Build a Modbus TCP write request frame with MBAP header.
 */
function buildWriteFrame(request: WriteRequest, unitId: number, transactionId: number) {
  const pdu = buildWritePDU(request, unitId);
  const frame = new Uint8Array(6 + pdu.length);
  frame[0] = transactionId >> 8;
  frame[1] = transactionId & 0xff;
  frame[2] = 0;
  frame[3] = 0;
  frame[4] = 0;
  frame[5] = pdu.length;
  frame.set(pdu, 6);
  return frame;
}

export class ModbusTcpEngine extends AdapterBackedDriver<ModbusTcpConfig, ModbusTcpRuntime> {
  protected protocolId = "modbus-tcp";
  protected defaultConfig: ModbusTcpConfig = {
    host: "127.0.0.1",
    port: 502,
    unitId: 1,
    connectTimeoutMs: 5000,
    readTimeoutMs: 3000,
    writeTimeoutMs: 3000
  };

  protected buildAdapter(_config: ModbusTcpConfig): ProtocolAdapter<ModbusTcpRuntime, ModbusTcpConfig> {
    return {
      protocolId: this.protocolId,
      initializeRuntime: () => ({ transactionId: 0 }),
      createTransport: (config) => new TcpTransport({
        host: config.host,
        port: config.port,
        connectTimeoutMs: config.connectTimeoutMs
      }),
      createReadPlan: (request, context) => {
        const transactionId = nextTransactionId(context.runtime);
        const unitId = request.unitId ?? context.config.unitId ?? 1;
        const functionCode = request.functionCode ?? FC.READ_HOLDING_REGISTERS;
        validateReadFunctionCode(functionCode);

        return {
          id: `modbus-read-${transactionId}`,
          type: "modbus-read",
          stages: [
            {
              id: "request-response",
              send: () => buildReadFrame(request, unitId, transactionId),
              expectResponse: true,
              matcher: (frame) => frame.length >= 9
                && frame[0] === (transactionId >> 8)
                && frame[1] === (transactionId & 0xff)
                && frame[6] === unitId
                && (frame[7] === functionCode || frame[7] === (functionCode | 0x80)),
              timeoutMs: request.timeoutMs ?? context.config.readTimeoutMs ?? 3000,
              onResponse: (frame) => {
                if (frame[7] >= 0x80) {
                  throw new ProtocolError("PROTOCOL_ERROR", `Modbus exception code ${frame[8]}`, frame);
                }
              }
            }
          ],
          finalize: ({ responses }) => {
            const resp = responses[0];
            if (!resp || resp.length < 9) return new Uint8Array();

            const respFc = resp[7];
            const byteCount = resp[8];
            const data = resp.slice(9, 9 + byteCount);

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
        const transactionId = nextTransactionId(context.runtime);
        const unitId = request.unitId ?? context.config.unitId ?? 1;
        const functionCode = request.functionCode ?? (request.data.length === 2 ? FC.WRITE_SINGLE_REGISTER : FC.WRITE_MULTIPLE_REGISTERS);
        validateWriteFunctionCode(functionCode);

        return {
          id: `modbus-write-${transactionId}`,
          type: "modbus-write",
          stages: [
            {
              id: "request-response",
              send: () => buildWriteFrame(request, unitId, transactionId),
              expectResponse: true,
              matcher: (frame) => frame.length >= 9
                && frame[0] === (transactionId >> 8)
                && frame[1] === (transactionId & 0xff)
                && frame[6] === unitId
                && (frame[7] === functionCode || frame[7] === (functionCode | 0x80)),
              timeoutMs: request.timeoutMs ?? context.config.writeTimeoutMs ?? 3000,
              onResponse: (frame) => {
                if (frame[7] >= 0x80) {
                  throw new ProtocolError("PROTOCOL_ERROR", `Modbus exception code ${frame[8]}`, frame);
                }
              }
            }
          ],
          finalize: () => true
        };
      },
      decodeFrame: async (frame) => {
        if (frame.length < 7) {
          return {
            fields: { raw: Array.from(frame) },
            isError: true,
            errorDescription: "Frame too short to decode"
          };
        }

        const transactionId = (frame[0] << 8) | frame[1];
        const protocolId = (frame[2] << 8) | frame[3];
        const length = (frame[4] << 8) | frame[5];

        // Decode PDU fields starting at unitId offset (byte 6 for TCP)
        const result = decodeModbusPduFields(frame, 6);

        // Add MBAP header fields
        result.fields.transactionId = transactionId;
        result.fields.protocolId = protocolId;
        result.fields.length = length;

        return result;
      },
      encodeFrame: async (input, context) => {
        const frameInput = normalizeFrameInput(input);
        const unitId = frameInput.unitId ?? context.config.unitId ?? 1;
        const transactionId = nextTransactionId(context.runtime);
        const fc = frameInput.functionCode ?? frameInput.fc;

        if (frameInput.data instanceof Uint8Array) {
          return buildWriteFrame({
            address: String(frameInput.address ?? frameInput.addr ?? 0),
            data: frameInput.data,
            functionCode: fc
          }, unitId, transactionId);
        }

        // If coils array is provided, pack bits and use FC15
        if (Array.isArray(frameInput.coils)) {
          const packed = packBits(frameInput.coils);
          return buildWriteFrame({
            address: String(frameInput.address ?? frameInput.addr ?? 0),
            data: packed,
            functionCode: fc ?? FC.WRITE_MULTIPLE_COILS
          }, unitId, transactionId);
        }

        return buildReadFrame({
          address: String(frameInput.address ?? frameInput.addr ?? 0),
          length: frameInput.length ?? frameInput.len ?? 1,
          functionCode: fc
        }, unitId, transactionId);
      }
    };
  }
}

// Re-export utility functions for use by consumers
export { packBits, unpackBits };
