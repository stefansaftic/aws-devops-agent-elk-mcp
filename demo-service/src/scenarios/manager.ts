export interface Scenario {
  id: string;
  name: string;
  description: string;
  duration: string;
  durationMs: number;
  icon: string;
  start: () => void;
  stop: () => void;
}

interface ActiveScenario {
  scenario: Scenario;
  startedAt: Date;
  expiresAt: Date;
  timer: ReturnType<typeof setTimeout>;
}

const activeScenarios = new Map<string, ActiveScenario>();
const registeredScenarios = new Map<string, Scenario>();

export function registerScenario(scenario: Scenario): void {
  registeredScenarios.set(scenario.id, scenario);
}

export function getRegisteredScenarios(): Scenario[] {
  return Array.from(registeredScenarios.values());
}

export function startScenario(id: string): { success: boolean; message: string } {
  const scenario = registeredScenarios.get(id);
  if (!scenario) {
    return { success: false, message: `Unknown scenario: ${id}` };
  }

  if (activeScenarios.has(id)) {
    return { success: false, message: `Scenario "${scenario.name}" is already active` };
  }

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + scenario.durationMs);

  // Start the scenario
  scenario.start();

  // Auto-stop after duration
  const timer = setTimeout(() => {
    stopScenario(id);
  }, scenario.durationMs);

  activeScenarios.set(id, { scenario, startedAt, expiresAt, timer });

  console.log(`[Scenario] Started: ${scenario.name} (duration: ${scenario.duration})`);
  return { success: true, message: `Scenario "${scenario.name}" started for ${scenario.duration}` };
}

export function stopScenario(id: string): { success: boolean; message: string } {
  const active = activeScenarios.get(id);
  if (!active) {
    return { success: false, message: `Scenario "${id}" is not active` };
  }

  clearTimeout(active.timer);
  active.scenario.stop();
  activeScenarios.delete(id);

  console.log(`[Scenario] Stopped: ${active.scenario.name}`);
  return { success: true, message: `Scenario "${active.scenario.name}" stopped` };
}

export function stopAllScenarios(): { success: boolean; message: string } {
  const count = activeScenarios.size;
  for (const [id] of activeScenarios) {
    stopScenario(id);
  }
  return { success: true, message: `Stopped ${count} active scenario(s)` };
}

export function getStatus(): {
  active: Array<{
    id: string;
    name: string;
    startedAt: string;
    expiresAt: string;
    remainingSeconds: number;
  }>;
  available: Array<{
    id: string;
    name: string;
    description: string;
    duration: string;
    icon: string;
    isActive: boolean;
  }>;
} {
  const now = Date.now();

  return {
    active: Array.from(activeScenarios.entries()).map(([id, active]) => ({
      id,
      name: active.scenario.name,
      startedAt: active.startedAt.toISOString(),
      expiresAt: active.expiresAt.toISOString(),
      remainingSeconds: Math.max(0, Math.round((active.expiresAt.getTime() - now) / 1000)),
    })),
    available: Array.from(registeredScenarios.values()).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      duration: s.duration,
      icon: s.icon,
      isActive: activeScenarios.has(s.id),
    })),
  };
}
