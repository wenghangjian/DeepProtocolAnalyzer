import React from "react";
import { Button } from "../ui";

interface RawFrameOperationsProps {
  canOperate: boolean;
  form: { payload: string; timeoutMs: string };
  onFormChange: (form: { payload: string; timeoutMs: string }) => void;
  onSendFrame: () => void;
  onWaitFrame: () => void;
}

export default function RawFrameOperations({ canOperate, form, onFormChange, onSendFrame, onWaitFrame }: RawFrameOperationsProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-xs font-semibold text-slate-400">HEX Payload</span>
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-500 min-h-[88px] resize-y font-mono"
            value={form.payload}
            onChange={(e) => onFormChange({ ...form, payload: e.target.value })}
            placeholder="68 05 64 05 c0 01 00 00"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400">Timeout (ms)</span>
          <input
            className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            value={form.timeoutMs}
            onChange={(e) => onFormChange({ ...form, timeoutMs: e.target.value })}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" data-testid="send-frame" aria-label="Send raw protocol frame" onClick={onSendFrame} disabled={!canOperate}>
          Send Frame
        </Button>
        <Button variant="secondary" size="sm" data-testid="wait-frame" aria-label="Wait for next incoming frame" onClick={onWaitFrame} disabled={!canOperate}>
          Wait Next Frame
        </Button>
      </div>
    </div>
  );
}
