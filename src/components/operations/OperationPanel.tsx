import React from "react";
import type { SessionState } from "../../../packages/shared-types";
import ModbusOperations from "./ModbusOperations";
import RawFrameOperations from "./RawFrameOperations";

interface OperationPanelProps {
  session: SessionState | null;
  canOperate: boolean;
  modbusForm: { address: string; length: string; functionCode: string; unitId: string; timeoutMs: string; writeHex: string };
  rawForm: { payload: string; timeoutMs: string };
  pollForm: { intervalMs: string };
  onModbusFormChange: (form: { address: string; length: string; functionCode: string; unitId: string; timeoutMs: string; writeHex: string }) => void;
  onRawFormChange: (form: { payload: string; timeoutMs: string }) => void;
  onPollFormChange: (form: { intervalMs: string }) => void;
  onModbusRead: () => void;
  onModbusWrite: () => void;
  onSendRawFrame: () => void;
  onWaitForFrame: () => void;
  onStartPolling: () => void;
  onStopPolling: (taskId: string) => void;
}

function isModbusProtocol(protocolId?: string) {
  return protocolId === "modbus-tcp" || protocolId === "modbus-rtu";
}

export default function OperationPanel({
  session,
  canOperate,
  modbusForm,
  rawForm,
  pollForm,
  onModbusFormChange,
  onRawFormChange,
  onPollFormChange,
  onModbusRead,
  onModbusWrite,
  onSendRawFrame,
  onWaitForFrame,
  onStartPolling,
  onStopPolling,
}: OperationPanelProps) {
  if (!session) {
    return (
      <section className="p-4 rounded-xl border border-slate-700/50 bg-slate-800">
        <h3 className="m-0 mb-3 text-sm font-bold text-slate-200">Operations</h3>
        <div className="p-4 border border-dashed border-slate-700 rounded-xl text-slate-500 text-xs text-center">
          Create and select a session before executing protocol operations.
        </div>
      </section>
    );
  }

  const isModbus = isModbusProtocol(session.protocolId);

  return (
    <>
      <section className="p-4 rounded-xl border border-slate-700/50 bg-slate-800">
        <h3 className="m-0 mb-3 text-sm font-bold text-slate-200">
          {isModbus ? "Modbus Register Operations" : "Raw Frame Operations"}
        </h3>
        {isModbus ? (
          <ModbusOperations
            session={session}
            canOperate={canOperate}
            form={modbusForm}
            onFormChange={onModbusFormChange}
            onRead={onModbusRead}
            onWrite={onModbusWrite}
          />
        ) : (
          <RawFrameOperations
            canOperate={canOperate}
            form={rawForm}
            onFormChange={onRawFormChange}
            onSendFrame={onSendRawFrame}
            onWaitFrame={onWaitForFrame}
          />
        )}
      </section>

      {/* Polling Tasks (Modbus only) */}
      {isModbus && (
        <section className="p-4 rounded-xl border border-slate-700/50 bg-slate-800">
          <h3 className="m-0 mb-3 text-sm font-bold text-slate-200">Polling Tasks</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-400">Interval (ms)</span>
              <input
                className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                value={pollForm.intervalMs}
                onChange={(e) => onPollFormChange({ intervalMs: e.target.value })}
              />
            </label>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg border border-slate-600 bg-transparent text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onStartPolling}
            disabled={!canOperate}
          >
            Start Polling
          </button>
          {session.tasks.length === 0 ? (
            <div className="mt-3 p-3 border border-dashed border-slate-700 rounded-xl text-slate-500 text-xs text-center">
              No active polling tasks.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {session.tasks.map((task) => (
                <div key={task.taskId} className="p-3 rounded-lg border border-slate-700/50 bg-slate-800/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-200">{task.taskId}</span>
                    <span className="text-2xs px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400">{task.intervalMs} ms</span>
                  </div>
                  <p className="m-0 mb-2 text-2xs text-slate-400">Address {task.address} · Length {task.length}</p>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-lg border border-slate-600 bg-transparent text-slate-400 text-2xs font-semibold hover:bg-slate-700 hover:text-slate-200 transition-colors cursor-pointer"
                    onClick={() => onStopPolling(task.taskId)}
                  >
                    Stop
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
