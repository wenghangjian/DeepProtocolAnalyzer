import React from "react";
import type { SessionState } from "../../../packages/shared-types";
import { Button } from "../ui";

interface ModbusOperationsProps {
  session: SessionState;
  canOperate: boolean;
  form: { address: string; length: string; functionCode: string; unitId: string; timeoutMs: string; writeHex: string };
  onFormChange: (form: { address: string; length: string; functionCode: string; unitId: string; timeoutMs: string; writeHex: string }) => void;
  onRead: () => void;
  onWrite: () => void;
}

export default function ModbusOperations({ session, canOperate, form, onFormChange, onRead, onWrite }: ModbusOperationsProps) {
  function updateField(key: string, value: string) {
    onFormChange({ ...form, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400">Address</span>
          <input
            className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            value={form.address}
            onChange={(e) => updateField("address", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400">Length</span>
          <input
            className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            value={form.length}
            onChange={(e) => updateField("length", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400">Function Code</span>
          <input
            className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            value={form.functionCode}
            onChange={(e) => updateField("functionCode", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400">Unit ID</span>
          <input
            className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            value={form.unitId}
            onChange={(e) => updateField("unitId", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400">Timeout (ms)</span>
          <input
            className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            value={form.timeoutMs}
            onChange={(e) => updateField("timeoutMs", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400">Write Payload (HEX)</span>
          <input
            className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-500"
            value={form.writeHex}
            onChange={(e) => updateField("writeHex", e.target.value)}
            placeholder="00 01"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" data-testid="modbus-read" aria-label="Read Modbus registers" onClick={onRead} disabled={!canOperate}>
          Read Registers
        </Button>
        <Button variant="secondary" size="sm" data-testid="modbus-write" aria-label="Write payload to Modbus registers" onClick={onWrite} disabled={!canOperate}>
          Write Payload
        </Button>
      </div>
    </div>
  );
}
