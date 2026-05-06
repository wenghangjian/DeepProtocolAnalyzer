/**
 * Performance Benchmarking Utilities
 *
 * Provides throughput, memory, concurrency, and system metrics benchmarks
 * for validating spec §16 requirements:
 *   - 500 msg/sec per session
 *   - 20 concurrent sessions
 *   - 8-hour stability
 *   - Memory <50MB/hr
 *   - CPU <5%
 */

// ── Throughput Benchmark ──────────────────────────────────────────────

export interface ThroughputResult {
  totalMessages: number;
  durationMs: number;
  messagesPerSecond: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errors: number;
}

export async function benchmarkThroughput(
  sendFn: (data: Buffer) => Promise<void>,
  receiveFn: () => Promise<Buffer>,
  options: {
    durationMs?: number;
    targetMsgPerSec?: number;
    messageSize?: number;
    concurrent?: number;
  } = {}
): Promise<ThroughputResult> {
  const durationMs = options.durationMs ?? 10_000;
  const targetMsgPerSec = options.targetMsgPerSec ?? 500;
  const messageSize = options.messageSize ?? 100;
  const concurrent = options.concurrent ?? 1;

  const latencies: number[] = [];
  let totalMessages = 0;
  let errors = 0;
  const payload = Buffer.alloc(messageSize, 0xab);

  const deadline = Date.now() + durationMs;
  const intervalMs = 1000 / targetMsgPerSec;

  async function runWorker(): Promise<void> {
    while (Date.now() < deadline) {
      const start = performance.now();
      try {
        await sendFn(payload);
        await receiveFn();
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
        totalMessages++;
      } catch {
        errors++;
      }

      // Pace to target rate per worker
      const elapsed = performance.now() - start;
      const sleepMs = Math.max(0, intervalMs - elapsed);
      if (sleepMs > 0) {
        await sleep(sleepMs);
      }
    }
  }

  const workers = Array.from({ length: concurrent }, () => runWorker());
  const actualStart = performance.now();
  await Promise.all(workers);
  const actualDuration = performance.now() - actualStart;

  latencies.sort((a, b) => a - b);

  return {
    totalMessages,
    durationMs: actualDuration,
    messagesPerSecond: (totalMessages / actualDuration) * 1000,
    avgLatencyMs: latencies.length > 0 ? latencies.reduce((s, v) => s + v, 0) / latencies.length : 0,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    p99LatencyMs: percentile(latencies, 0.99),
    errors
  };
}

// ── Memory Benchmark ──────────────────────────────────────────────────

export interface MemoryResult {
  startHeapMB: number;
  endHeapMB: number;
  deltaHeapMB: number;
  startRssMB: number;
  endRssMB: number;
  deltaRssMB: number;
  peakHeapMB: number;
  durationMs: number;
}

export async function benchmarkMemory(
  operationFn: () => Promise<void>,
  options: {
    durationMs?: number;
    sampleIntervalMs?: number;
  } = {}
): Promise<MemoryResult> {
  const durationMs = options.durationMs ?? 60_000;
  const sampleIntervalMs = options.sampleIntervalMs ?? 1_000;

  // Force GC if available
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }

  const startMem = process.memoryUsage();
  let peakHeapMB = bytesToMB(startMem.heapUsed);

  const deadline = Date.now() + durationMs;
  let sampleTimer: ReturnType<typeof setInterval> | null = null;

  // Sample peak memory at intervals
  await new Promise<void>((resolve) => {
    sampleTimer = setInterval(() => {
      const current = process.memoryUsage();
      const currentHeapMB = bytesToMB(current.heapUsed);
      if (currentHeapMB > peakHeapMB) {
        peakHeapMB = currentHeapMB;
      }
      if (Date.now() >= deadline) {
        if (sampleTimer) clearInterval(sampleTimer);
        resolve();
      }
    }, sampleIntervalMs);

    // Run the operation in a loop until deadline
    (async () => {
      while (Date.now() < deadline) {
        try {
          await operationFn();
        } catch {
          // Continue benchmarking even if operation fails
        }
      }
      if (sampleTimer) clearInterval(sampleTimer);
      resolve();
    })();
  });

  if (sampleTimer) clearInterval(sampleTimer);

  // Force GC if available before final measurement
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }

  const endMem = process.memoryUsage();
  const startHeapMB = bytesToMB(startMem.heapUsed);
  const endHeapMB = bytesToMB(endMem.heapUsed);
  const startRssMB = bytesToMB(startMem.rss);
  const endRssMB = bytesToMB(endMem.rss);

  return {
    startHeapMB,
    endHeapMB,
    deltaHeapMB: endHeapMB - startHeapMB,
    startRssMB,
    endRssMB,
    deltaRssMB: endRssMB - startRssMB,
    peakHeapMB,
    durationMs
  };
}

// ── Concurrent Session Benchmark ──────────────────────────────────────

export interface ConcurrencyResult {
  sessionCount: number;
  totalMessages: number;
  avgMessagesPerSec: number;
  avgLatencyMs: number;
  errors: number;
  durationMs: number;
}

export async function benchmarkConcurrency(
  createSessionFn: () => Promise<string>,
  sendFn: (sessionId: string, data: Buffer) => Promise<void>,
  destroySessionFn: (sessionId: string) => Promise<void>,
  options: {
    sessionCount?: number;
    durationMs?: number;
    targetMsgPerSec?: number;
  } = {}
): Promise<ConcurrencyResult> {
  const sessionCount = options.sessionCount ?? 20;
  const durationMs = options.durationMs ?? 30_000;
  const targetMsgPerSec = options.targetMsgPerSec ?? 500;

  const sessionIds: string[] = [];
  const latencies: number[] = [];
  let totalMessages = 0;
  let errors = 0;

  // Create all sessions
  for (let i = 0; i < sessionCount; i++) {
    try {
      const id = await createSessionFn();
      sessionIds.push(id);
    } catch {
      errors++;
    }
  }

  const payload = Buffer.alloc(100, 0xab);
  const deadline = Date.now() + durationMs;
  const intervalMs = 1000 / targetMsgPerSec;

  async function runSession(sessionId: string): Promise<void> {
    while (Date.now() < deadline) {
      const start = performance.now();
      try {
        await sendFn(sessionId, payload);
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
        totalMessages++;
      } catch {
        errors++;
      }

      const elapsed = performance.now() - start;
      const sleepMs = Math.max(0, intervalMs - elapsed);
      if (sleepMs > 0) {
        await sleep(sleepMs);
      }
    }
  }

  const actualStart = performance.now();
  await Promise.all(sessionIds.map((id) => runSession(id)));
  const actualDuration = performance.now() - actualStart;

  // Destroy all sessions
  for (const id of sessionIds) {
    try {
      await destroySessionFn(id);
    } catch {
      // Ignore cleanup errors
    }
  }

  latencies.sort((a, b) => a - b);

  return {
    sessionCount: sessionIds.length,
    totalMessages,
    avgMessagesPerSec: (totalMessages / actualDuration) * 1000,
    avgLatencyMs: latencies.length > 0 ? latencies.reduce((s, v) => s + v, 0) / latencies.length : 0,
    errors,
    durationMs: actualDuration
  };
}

// ── System Metrics ────────────────────────────────────────────────────

export interface SystemMetrics {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  arrayBuffersMB: number;
  uptimeSeconds: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  cpuPercent: number;
}

export function getSystemMetrics(): SystemMetrics {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();

  return {
    heapUsedMB: bytesToMB(mem.heapUsed),
    heapTotalMB: bytesToMB(mem.heapTotal),
    rssMB: bytesToMB(mem.rss),
    externalMB: bytesToMB(mem.external),
    arrayBuffersMB: bytesToMB(mem.arrayBuffers ?? 0),
    uptimeSeconds: process.uptime(),
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    cpuPercent: calculateCpuPercent(cpu)
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, index)];
}

function bytesToMB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

function calculateCpuPercent(currentCpu: NodeJS.CpuUsage): number {
  const now = Date.now();
  const elapsed = now - lastCpuTime;
  if (elapsed === 0) return 0;

  const userDiff = currentCpu.user - lastCpuUsage.user;
  const systemDiff = currentCpu.system - lastCpuUsage.system;
  const totalCpuTime = (userDiff + systemDiff) / 1000; // microseconds to ms

  lastCpuUsage = currentCpu;
  lastCpuTime = now;

  return Math.round((totalCpuTime / elapsed) * 100 * 100) / 100;
}

// ── Spec Validation ───────────────────────────────────────────────────

export interface SpecValidation {
  throughputPass: boolean;
  memoryPass: boolean;
  cpuPass: boolean;
  concurrencyPass: boolean;
  details: {
    throughput: { actual: number; required: number; unit: string };
    memory: { actual: number; required: number; unit: string };
    cpu: { actual: number; required: number; unit: string };
    concurrency: { actual: number; required: number; unit: string };
  };
}

export function validateAgainstSpec(
  throughput?: ThroughputResult,
  memory?: MemoryResult,
  system?: SystemMetrics,
  concurrency?: ConcurrencyResult
): SpecValidation {
  const throughputActual = throughput?.messagesPerSecond ?? 0;
  const memoryDeltaPerHour = memory
    ? (memory.deltaHeapMB / (memory.durationMs / 3600000))
    : 0;
  const cpuActual = system?.cpuPercent ?? 0;
  const concurrencyErrors = concurrency?.errors ?? 0;

  return {
    throughputPass: throughputActual >= 500,
    memoryPass: memoryDeltaPerHour < 50,
    cpuPass: cpuActual < 5,
    concurrencyPass: concurrencyErrors === 0 && (concurrency?.sessionCount ?? 0) >= 20,
    details: {
      throughput: { actual: throughputActual, required: 500, unit: "msg/sec" },
      memory: { actual: memoryDeltaPerHour, required: 50, unit: "MB/hr" },
      cpu: { actual: cpuActual, required: 5, unit: "%" },
      concurrency: { actual: concurrency?.sessionCount ?? 0, required: 20, unit: "sessions" }
    }
  };
}
