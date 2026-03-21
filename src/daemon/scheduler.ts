export type ScheduledTask = {
  name: string;
  interval: number; // ms
  handler: () => Promise<void>;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
};

export class Scheduler {
  private tasks = new Map<string, ScheduledTask>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private running = false;

  register(task: ScheduledTask): void {
    this.tasks.set(task.name, task);
    if (this.running && task.enabled) {
      this.startTask(task);
    }
  }

  unregister(name: string): void {
    this.stopTask(name);
    this.tasks.delete(name);
  }

  start(): void {
    this.running = true;
    for (const task of this.tasks.values()) {
      if (task.enabled) {
        this.startTask(task);
      }
    }
  }

  stop(): void {
    this.running = false;
    for (const name of this.timers.keys()) {
      this.stopTask(name);
    }
  }

  async trigger(name: string): Promise<void> {
    const task = this.tasks.get(name);
    if (!task) throw new Error(`Task ${name} not found`);
    try {
      await task.handler();
      task.lastRun = Date.now();
    } catch {
      // Task errors should not propagate to caller
      task.lastRun = Date.now();
    }
  }

  enable(name: string): void {
    const task = this.tasks.get(name);
    if (!task) return;
    task.enabled = true;
    if (this.running) {
      this.startTask(task);
    }
  }

  disable(name: string): void {
    const task = this.tasks.get(name);
    if (!task) return;
    task.enabled = false;
    this.stopTask(name);
  }

  list(): ScheduledTask[] {
    return Array.from(this.tasks.values()).map((t) => ({
      ...t,
      handler: t.handler, // Keep reference but it won't serialize
    }));
  }

  private startTask(task: ScheduledTask): void {
    if (this.timers.has(task.name)) return; // Already running
    const timer = setInterval(async () => {
      try {
        await task.handler();
        task.lastRun = Date.now();
        task.nextRun = Date.now() + task.interval;
      } catch {
        // Task error — don't stop other tasks
        task.lastRun = Date.now();
      }
    }, task.interval);
    this.timers.set(task.name, timer);
    task.nextRun = Date.now() + task.interval;
  }

  private stopTask(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(name);
    }
  }
}
