import { config } from '../config.js';

function randomFloat(min: number, max: number, decimals = 1): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Baseline state that drifts slowly
let baselineCpu = 25;
let baselineMemory = 55;
let baselineDisk = 42;

export function generateMetrics(overrides?: Partial<{
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  disk_percent: number;
  disk_used_gb: number;
  heap_used_mb: number;
  gc_pause_ms: number;
}>): Record<string, unknown> {
  // Drift baseline slightly
  baselineCpu = Math.max(5, Math.min(60, baselineCpu + randomFloat(-2, 2)));
  baselineMemory = Math.max(30, Math.min(75, baselineMemory + randomFloat(-1, 1)));
  baselineDisk = Math.max(30, Math.min(55, baselineDisk + randomFloat(-0.1, 0.2)));

  const cpuPercent = overrides?.cpu_percent ?? randomFloat(baselineCpu - 5, baselineCpu + 10);
  const memoryPercent = overrides?.memory_percent ?? randomFloat(baselineMemory - 3, baselineMemory + 5);
  const memoryTotalMb = 2048;
  const memoryUsedMb = overrides?.memory_used_mb ?? Math.round(memoryTotalMb * memoryPercent / 100);
  const diskTotalGb = 100;
  const diskPercent = overrides?.disk_percent ?? randomFloat(baselineDisk - 1, baselineDisk + 1);
  const diskUsedGb = overrides?.disk_used_gb ?? parseFloat((diskTotalGb * diskPercent / 100).toFixed(1));
  const heapMaxMb = 1024;
  const heapUsedMb = overrides?.heap_used_mb ?? randomFloat(300, 600);
  const gcPauseMs = overrides?.gc_pause_ms ?? randomFloat(5, 50);

  return {
    '@timestamp': new Date().toISOString(),
    hostname: config.service.hostname,
    service: config.service.name,
    metric_type: 'system',
    cpu_percent: Math.max(0, Math.min(100, cpuPercent)),
    memory_percent: Math.max(0, Math.min(100, memoryPercent)),
    memory_used_mb: memoryUsedMb,
    memory_total_mb: memoryTotalMb,
    disk_percent: Math.max(0, Math.min(100, diskPercent)),
    disk_used_gb: diskUsedGb,
    disk_total_gb: diskTotalGb,
    network_in_bytes: randomInt(10000, 500000),
    network_out_bytes: randomInt(50000, 2000000),
    open_connections: randomInt(10, 100),
    active_threads: randomInt(5, 30),
    gc_pause_ms: gcPauseMs,
    heap_used_mb: heapUsedMb,
    heap_max_mb: heapMaxMb,
  };
}
