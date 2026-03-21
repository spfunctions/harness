import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Scheduler, type ScheduledTask } from "../../../src/daemon/scheduler.js";

let scheduler: Scheduler;

beforeEach(() => {
  scheduler = new Scheduler();
});

afterEach(() => {
  scheduler.stop();
});

function makeTask(
  name: string,
  overrides?: Partial<ScheduledTask>,
): ScheduledTask {
  return {
    name,
    interval: 100000, // long enough to not fire during tests
    handler: async () => {},
    enabled: true,
    ...overrides,
  };
}

describe("Scheduler", () => {
  it("register adds a task", () => {
    scheduler.register(makeTask("t1"));
    expect(scheduler.list()).toHaveLength(1);
    expect(scheduler.list()[0].name).toBe("t1");
  });

  it("unregister removes a task", () => {
    scheduler.register(makeTask("t1"));
    scheduler.unregister("t1");
    expect(scheduler.list()).toHaveLength(0);
  });

  it("start starts all enabled tasks", () => {
    scheduler.register(makeTask("t1"));
    scheduler.register(makeTask("t2", { enabled: false }));
    scheduler.start();
    const tasks = scheduler.list();
    expect(tasks.find((t) => t.name === "t1")?.nextRun).toBeDefined();
    expect(tasks.find((t) => t.name === "t2")?.nextRun).toBeUndefined();
  });

  it("stop clears all timers", () => {
    scheduler.register(makeTask("t1"));
    scheduler.start();
    scheduler.stop();
    // After stop, registering and starting again should work
    scheduler.start();
  });

  it("trigger manually executes a task", async () => {
    let called = false;
    scheduler.register(
      makeTask("t1", { handler: async () => { called = true; } }),
    );
    await scheduler.trigger("t1");
    expect(called).toBe(true);
  });

  it("trigger updates lastRun", async () => {
    scheduler.register(makeTask("t1"));
    await scheduler.trigger("t1");
    const task = scheduler.list().find((t) => t.name === "t1");
    expect(task?.lastRun).toBeDefined();
    expect(task!.lastRun!).toBeGreaterThan(0);
  });

  it("trigger non-existent task throws", async () => {
    await expect(scheduler.trigger("nope")).rejects.toThrow();
  });

  it("disable stops a task timer", () => {
    scheduler.register(makeTask("t1"));
    scheduler.start();
    scheduler.disable("t1");
    const task = scheduler.list().find((t) => t.name === "t1");
    expect(task?.enabled).toBe(false);
  });

  it("enable restarts a disabled task", () => {
    scheduler.register(makeTask("t1", { enabled: false }));
    scheduler.start();
    scheduler.enable("t1");
    const task = scheduler.list().find((t) => t.name === "t1");
    expect(task?.enabled).toBe(true);
    expect(task?.nextRun).toBeDefined();
  });

  it("task error does not propagate to trigger", async () => {
    scheduler.register(
      makeTask("err", {
        handler: async () => { throw new Error("boom"); },
      }),
    );
    // Should not throw
    await scheduler.trigger("err");
    const task = scheduler.list().find((t) => t.name === "err");
    expect(task?.lastRun).toBeDefined();
  });

  it("list returns all tasks with state", () => {
    scheduler.register(makeTask("a"));
    scheduler.register(makeTask("b", { enabled: false }));
    const list = scheduler.list();
    expect(list).toHaveLength(2);
    expect(list.map((t) => t.name).sort()).toEqual(["a", "b"]);
  });
});
