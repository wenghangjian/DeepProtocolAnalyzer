import { describe, it, expect } from "vitest";
import {
  toHex,
  toBin,
  toAscii,
  crc16Modbus,
  lrc,
  decodeModbusTcp,
  decodeModbusRtu,
  decodeRawWithChecksum,
  decodeStructured,
  matchesSearch,
  MODBUS_FC_NAMES,
} from "../traffic-decoders";
import type { TrafficEvent } from "../traffic-decoders";

describe("toHex", () => {
  it("converts bytes to hex string", () => {
    expect(toHex(new Uint8Array([0x01, 0xff, 0x0a]))).toBe("01 ff 0a");
  });

  it("handles empty array", () => {
    expect(toHex(new Uint8Array([]))).toBe("");
  });

  it("pads single-digit hex", () => {
    expect(toHex(new Uint8Array([0x00, 0x0f]))).toBe("00 0f");
  });
});

describe("toBin", () => {
  it("converts bytes to binary string", () => {
    expect(toBin(new Uint8Array([0xff]))).toBe("11111111");
  });

  it("pads to 8 digits", () => {
    expect(toBin(new Uint8Array([0x01]))).toBe("00000001");
  });
});

describe("toAscii", () => {
  it("converts printable bytes to characters", () => {
    expect(toAscii(new Uint8Array([0x48, 0x65, 0x6c]))).toBe("Hel");
  });

  it("replaces non-printable with dots", () => {
    expect(toAscii(new Uint8Array([0x00, 0x01, 0x02]))).toBe("...");
  });
});

describe("crc16Modbus", () => {
  it("computes CRC for known data", () => {
    // Modbus RTU: UnitID=1, FC=03, Addr=0000, Qty=0001 → CRC should be valid
    const data = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x01]);
    const crc = crc16Modbus(data);
    expect(crc).toBeGreaterThan(0);
    expect(crc).toBeLessThan(0x10000);
  });

  it("returns 0xFFFF for empty data", () => {
    expect(crc16Modbus(new Uint8Array([]))).toBe(0xffff);
  });
});

describe("lrc", () => {
  it("computes LRC for known data", () => {
    // ASCII Modbus: :010300000001 → LRC = 0xFB
    const data = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x01]);
    expect(lrc(data)).toBe(0xfb);
  });
});

describe("MODBUS_FC_NAMES", () => {
  it("has all standard function codes", () => {
    expect(MODBUS_FC_NAMES[0x01]).toBe("Read Coils");
    expect(MODBUS_FC_NAMES[0x03]).toBe("Read Holding Registers");
    expect(MODBUS_FC_NAMES[0x06]).toBe("Write Single Register");
    expect(MODBUS_FC_NAMES[0x10]).toBe("Write Multiple Registers");
  });
});

describe("decodeModbusTcp", () => {
  it("returns null for too-short frames", () => {
    expect(decodeModbusTcp(new Uint8Array([0x00, 0x01]))).toBeNull();
  });

  it("returns null when protocol ID is not Modbus", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x00, 0x01, 0x00, 0x03, 0x01, 0x03, 0x00]);
    expect(decodeModbusTcp(bytes)).toBeNull();
  });

  it("decodes a valid read holding registers response", () => {
    // TransactionID=0001, ProtocolID=0000, Length=0005, UnitID=01, FC=03, ByteCount=02, RegData=0064
    const bytes = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00, 0x05, 0x01, 0x03, 0x02, 0x00, 0x64]);
    const fields = decodeModbusTcp(bytes);
    expect(fields).not.toBeNull();
    expect(fields![0].label).toBe("Transaction ID");
    expect(fields![4].label).toBe("Function Code");
    expect(fields![4].value).toContain("Read Holding Registers");
  });

  it("decodes an exception response", () => {
    // TransactionID=0001, ProtocolID=0000, Length=0003, UnitID=01, FC=83, ExcCode=02
    const bytes = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00, 0x03, 0x01, 0x83, 0x02]);
    const fields = decodeModbusTcp(bytes);
    expect(fields).not.toBeNull();
    expect(fields!.some((f) => f.label === "Exception Code")).toBe(true);
  });

  it("decodes write single register", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x01, 0x06, 0x00, 0x01, 0x00, 0x0a]);
    const fields = decodeModbusTcp(bytes);
    expect(fields).not.toBeNull();
    expect(fields!.some((f) => f.label === "Address")).toBe(true);
    expect(fields!.some((f) => f.label === "Value")).toBe(true);
  });
});

describe("decodeModbusRtu", () => {
  it("returns null for too-short frames", () => {
    expect(decodeModbusRtu(new Uint8Array([0x01, 0x03]))).toBeNull();
  });

  it("decodes a valid RTU frame", () => {
    // UnitID=01, FC=03, ByteCount=02, Data=0064, CRC
    const data = new Uint8Array([0x01, 0x03, 0x02, 0x00, 0x64]);
    const crc = crc16Modbus(data);
    const bytes = new Uint8Array([...data, crc & 0xff, (crc >> 8) & 0xff]);
    const fields = decodeModbusRtu(bytes);
    expect(fields).not.toBeNull();
    expect(fields![0].label).toBe("Unit ID");
    expect(fields![2].value).toContain("Valid");
  });

  it("detects invalid CRC", () => {
    const bytes = new Uint8Array([0x01, 0x03, 0x02, 0x00, 0x64, 0x00, 0x00]);
    const fields = decodeModbusRtu(bytes);
    expect(fields).not.toBeNull();
    expect(fields![2].value).toContain("Invalid");
  });
});

describe("decodeRawWithChecksum", () => {
  it("handles empty frame", () => {
    const fields = decodeRawWithChecksum(new Uint8Array([]));
    expect(fields[0].value).toBe("Empty frame");
  });

  it("provides length and hex for any frame", () => {
    const fields = decodeRawWithChecksum(new Uint8Array([0x01, 0x02, 0x03]));
    expect(fields[0].label).toBe("Length");
    expect(fields[1].label).toBe("Hex");
  });
});

describe("decodeStructured", () => {
  it("uses parsedFields when available", () => {
    const item: TrafficEvent = {
      id: "1",
      direction: "rx",
      timestamp: Date.now(),
      rawBytes: new Uint8Array([0x01]),
      length: 1,
      isError: false,
      parsedFields: { Function: "03", Address: "100" }
    };
    const fields = decodeStructured(item);
    expect(fields.some((f) => f.label === "Function")).toBe(true);
    expect(fields.some((f) => f.label === "Raw Hex")).toBe(true);
  });

  it("falls back to raw checksum for unknown protocols", () => {
    const item: TrafficEvent = {
      id: "1",
      direction: "tx",
      timestamp: Date.now(),
      rawBytes: new Uint8Array([0x01, 0x02, 0x03]),
      length: 3,
      isError: false,
    };
    const fields = decodeStructured(item);
    expect(fields.length).toBeGreaterThan(0);
  });
});

describe("matchesSearch", () => {
  const item: TrafficEvent = {
    id: "1",
    direction: "tx",
    timestamp: Date.now(),
    rawBytes: new Uint8Array([0xde, 0xad]),
    length: 2,
    isError: false,
  };

  it("matches empty query", () => {
    expect(matchesSearch(item, "")).toBe(true);
  });

  it("matches hex bytes (space-separated)", () => {
    expect(matchesSearch(item, "de")).toBe(true);
    expect(matchesSearch(item, "ad")).toBe(true);
  });

  it("matches direction", () => {
    expect(matchesSearch(item, "tx")).toBe(true);
  });

  it("does not match non-existent hex", () => {
    expect(matchesSearch(item, "ffff")).toBe(false);
  });

  it("matches parsedFields", () => {
    const withFields = { ...item, parsedFields: { Code: "03" } };
    expect(matchesSearch(withFields, "03")).toBe(true);
  });
});
