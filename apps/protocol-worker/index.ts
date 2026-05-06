import type { IProtocolDriver, PollTask, SessionEvent, SessionStatus, TrafficEvent } from "../../packages/shared-types";
import { ModbusTcpEngine } from "../../protocols/modbus-tcp/engine";
import { ModbusRtuEngine } from "../../protocols/modbus-rtu/engine";
import { CustomTcpEngine } from "../../protocols/custom-tcp/engine";
import { CustomSerialEngine } from "../../protocols/custom-serial/engine";
import { Dnp3Engine } from "../../protocols/dnp3/engine";
import { Iec61850Engine } from "../../protocols/iec61850/engine";
import { OpcUaEngine } from "../../protocols/opcua/engine";
import { Iec104Engine } from "../../protocols/iec104/engine";
import { BacnetIpEngine } from "../../protocols/bacnet-ip/engine";

interface ParentPortLike {
  on(event: "message", listener: (message: WorkerMessage) => void): void;
  postMessage(message: WorkerResponse): void;
}

interface WorkerMessage {
  id: number;
  type:
    | "init"
    | "connect"
    | "disconnect"
    | "read"
    | "write"
    | "invokeCapability"
    | "startPolling"
    | "stopPolling"
    | "destroy";
  sessionId: string;
  data?: {
    protocolId?: string;
    config?: unknown;
    request?: unknown;
    task?: PollTask;
    taskId?: string;
  };
}

interface WorkerResponse {
  id?: number;
  type?: "traffic" | "status" | "session-event";
  sessionId?: string;
  success?: boolean;
  data?: unknown;
  error?: string;
}

const parentPort = (process as NodeJS.Process & { parentPort?: ParentPortLike }).parentPort as ParentPortLike | undefined;
const drivers = new Map<string, IProtocolDriver>();

function createDriver(protocolId: string) {
  switch (protocolId) {
    case "modbus-tcp":
      return new ModbusTcpEngine();
    case "modbus-rtu":
      return new ModbusRtuEngine();
    case "custom-tcp":
      return new CustomTcpEngine();
    case "custom-serial":
      return new CustomSerialEngine();
    case "dnp3":
      return new Dnp3Engine();
    case "iec61850":
      return new Iec61850Engine();
    case "opcua":
      return new OpcUaEngine();
    case "iec104":
      return new Iec104Engine();
    case "bacnet-ip":
      return new BacnetIpEngine();
    default:
      throw new Error(`Unsupported protocol: ${protocolId}`);
  }
}

function postStatus(sessionId: string, status: SessionStatus, error?: string) {
  parentPort?.postMessage({
    type: "status",
    sessionId,
    data: {
      status,
      error
    }
  });
}

parentPort?.on("message", async (message: WorkerMessage) => {
  const { id, type, sessionId, data } = message;

  try {
    switch (type) {
      case "init": {
        const protocolId = data?.protocolId;
        if (!protocolId) {
          throw new Error("Protocol id is required");
        }

        const driver = createDriver(protocolId);
        await driver.onInit(data?.config);
        driver.onTraffic((packet: TrafficEvent) => {
          parentPort?.postMessage({
            type: "traffic",
            sessionId,
            data: packet
          });
        });
        driver.onSessionEvent?.((event: SessionEvent) => {
          parentPort?.postMessage({
            type: "session-event",
            sessionId,
            data: event
          });
        });
        drivers.set(sessionId, driver);
        parentPort?.postMessage({ id, success: true });
        break;
      }
      case "connect": {
        const driver = drivers.get(sessionId);
        if (!driver) {
          throw new Error(`Session ${sessionId} not initialized`);
        }

        postStatus(sessionId, "connecting");
        await driver.connect(sessionId);
        postStatus(sessionId, "connected");
        parentPort?.postMessage({ id, success: true });
        break;
      }
      case "disconnect": {
        const driver = drivers.get(sessionId);
        if (!driver) {
          throw new Error(`Session ${sessionId} not initialized`);
        }

        await driver.disconnect(sessionId);
        postStatus(sessionId, "disconnected");
        parentPort?.postMessage({ id, success: true });
        break;
      }
      case "read": {
        const driver = drivers.get(sessionId);
        if (!driver) {
          throw new Error(`Session ${sessionId} not initialized`);
        }

        const result = await driver.read(sessionId, data?.request as never);
        parentPort?.postMessage({ id, success: true, data: result });
        break;
      }
      case "write": {
        const driver = drivers.get(sessionId);
        if (!driver) {
          throw new Error(`Session ${sessionId} not initialized`);
        }

        const result = await driver.write(sessionId, data?.request as never);
        parentPort?.postMessage({ id, success: true, data: result });
        break;
      }
      case "invokeCapability": {
        const driver = drivers.get(sessionId);
        if (!driver || !driver.invokeCapability) {
          throw new Error(`Session ${sessionId} does not support capability invocation`);
        }

        const capability = data as { action?: string; payload?: unknown } | undefined;
        if (!capability?.action) {
          throw new Error("Capability action is required");
        }

        const result = await driver.invokeCapability(sessionId, capability.action, capability.payload);
        parentPort?.postMessage({ id, success: true, data: result });
        break;
      }
      case "startPolling": {
        const driver = drivers.get(sessionId);
        if (!driver || !data?.task) {
          throw new Error(`Session ${sessionId} not initialized`);
        }

        await driver.startPolling(sessionId, data.task);
        parentPort?.postMessage({ id, success: true });
        break;
      }
      case "stopPolling": {
        const driver = drivers.get(sessionId);
        if (!driver || !data?.taskId) {
          throw new Error(`Session ${sessionId} not initialized`);
        }

        await driver.stopPolling(sessionId, data.taskId);
        parentPort?.postMessage({ id, success: true });
        break;
      }
      case "destroy": {
        const driver = drivers.get(sessionId);
        if (driver) {
          await driver.onDestroy();
          drivers.delete(sessionId);
        }
        postStatus(sessionId, "disconnected");
        parentPort?.postMessage({ id, success: true });
        break;
      }
      default:
        throw new Error(`Unsupported message type: ${String(type)}`);
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown worker error";
    postStatus(sessionId, "error", messageText);
    parentPort?.postMessage({
      id,
      success: false,
      error: messageText
    });
  }
});
