import {
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  createTrackedEffect,
  flush,
  onCleanup,
  resetErrorHalt
} from "../src/index.js";

afterEach(() => flush());

it("should run effect", () => {
  const [$x, setX] = createSignal(0),
    effect = vi.fn($x);

  createRoot(() =>
    createTrackedEffect(() => {
      effect();
    })
  );
  expect(effect).toHaveBeenCalledTimes(0);
  flush();
  expect(effect).toHaveBeenCalledTimes(1);

  setX(1);
  flush();
  expect(effect).toHaveBeenCalledTimes(2);
});

it("should run effect on change", () => {
  const [$x, setX] = createSignal(10);
  const [$y, setY] = createSignal(10);

  const $a = createMemo(() => $x() + $y());
  const $b = createMemo(() => $a());

  const effect = vi.fn($b);

  createRoot(() =>
    createTrackedEffect(() => {
      effect();
    })
  );

  expect(effect).toHaveBeenCalledTimes(0);

  setX(20);
  flush();
  expect(effect).toHaveBeenCalledTimes(1);

  setY(20);
  flush();
  expect(effect).toHaveBeenCalledTimes(2);

  setX(20);
  setY(20);
  flush();
  expect(effect).toHaveBeenCalledTimes(2);
});

it("should stop effect", () => {
  const [$x, setX] = createSignal(10);
  const effect = vi.fn($x);

  const stopEffect = createRoot(dispose => {
    createTrackedEffect(() => {
      effect();
    });
    return dispose;
  });

  stopEffect();

  setX(20);
  flush();
  expect(effect).toHaveBeenCalledTimes(0);
});

it("should run all disposals before each new run", () => {
  const effect = vi.fn();
  const dispose = vi.fn();

  const [$x, setX] = createSignal(0);

  createRoot(() =>
    createTrackedEffect(() => {
      $x();
      effect();
      return dispose;
    })
  );
  flush();

  expect(effect).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(0);

  for (let i = 1; i <= 3; i += 1) {
    setX(i);
    flush();
    expect(effect).toHaveBeenCalledTimes(i + 1);
    expect(dispose).toHaveBeenCalledTimes(i);
  }
});

it("should conditionally observe", () => {
  const [$x, setX] = createSignal(0);
  const [$y, setY] = createSignal(0);
  const [$condition, setCondition] = createSignal(true);

  const $a = createMemo(() => ($condition() ? $x() : $y()));
  const effect = vi.fn($a);

  createRoot(() =>
    createTrackedEffect(() => {
      effect();
    })
  );
  flush();

  expect(effect).toHaveBeenCalledTimes(1);

  setY(1);
  flush();
  expect(effect).toHaveBeenCalledTimes(1);

  setX(1);
  flush();
  expect(effect).toHaveBeenCalledTimes(2);

  setCondition(false);
  flush();
  expect(effect).toHaveBeenCalledTimes(2);

  setY(2);
  flush();
  expect(effect).toHaveBeenCalledTimes(3);

  setX(3);
  flush();
  expect(effect).toHaveBeenCalledTimes(3);
});

it("should not warn on signal writes inside tracked effect", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const [$trigger, setTrigger] = createSignal(0);
  const [$target, setTarget] = createSignal(0);

  createRoot(() =>
    createTrackedEffect(() => {
      $trigger();
      setTarget(n => n + 1);
    })
  );
  flush();

  expect($target()).toBe(1);
  expect(warn).not.toHaveBeenCalled();

  setTrigger(1);
  flush();
  expect($target()).toBe(2);
  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});

it("should apply changes in effect in same flush", async () => {
  const [$x, setX] = createSignal(0),
    [$y, setY] = createSignal(0);

  const $a = createMemo(() => {
      return $x() + 1;
    }),
    $b = createMemo(() => {
      return $a() + 2;
    });

  createRoot(() =>
    createTrackedEffect(() => {
      $y();
      setX(n => n + 1);
    })
  );
  flush();

  expect($x()).toBe(1);
  expect($b()).toBe(4);
  expect($a()).toBe(2);

  setY(1);

  flush();

  expect($x()).toBe(2);
  expect($b()).toBe(5);
  expect($a()).toBe(3);

  setY(2);

  flush();

  expect($x()).toBe(3);
  expect($b()).toBe(6);
  expect($a()).toBe(4);
});

it("should run render effect before user effects", () => {
  const [$x, setX] = createSignal(0);

  let mark = "";
  createRoot(() => {
    createTrackedEffect(() => {
      $x();
      mark += "b";
    });
    createRenderEffect($x, () => {
      mark += "a";
    });
  });

  flush();
  expect(mark).toBe("ab");
  setX(1);
  flush();
  expect(mark).toBe("abab");
});

it("should throw when creating tracked-effect children inside (__DEV__ only)", () => {
  createRoot(() => {
    createTrackedEffect(() => {
      expect(() => createTrackedEffect(() => {})).toThrow(
        "Cannot create reactive primitives inside createTrackedEffect or owner-backed onSettled"
      );
      expect(() => createMemo(() => 1)).toThrow(
        "Cannot create reactive primitives inside createTrackedEffect or owner-backed onSettled"
      );
      expect(() => onCleanup(() => {})).toThrow(
        "Cannot use onCleanup inside createTrackedEffect or onSettled; return a cleanup function instead"
      );
    });
  });
  flush();
});

it("should throw uncaught tracked effect errors during flush", () => {
  createRoot(() => {
    createTrackedEffect(() => {
      throw new Error("tracked boom");
    });
  });

  expect(() => flush()).toThrow("tracked boom");
  resetErrorHalt();
});

it("should throw on invalid cleanup values", () => {
  createRoot(() => {
    createTrackedEffect(() => ({}) as any);
  });

  expect(() => flush()).toThrow(
    "trackedEffect callback returned an invalid cleanup value. Return a cleanup function or undefined."
  );
  resetErrorHalt();
});

it("should run the final returned cleanup at the node's own disposal", () => {
  // Same rule as createEffect: the final cleanup fires when the tracked
  // effect node itself disposes (unwind order), not via a hook on the parent.
  const [$x, setX] = createSignal(0);
  const cleanup = vi.fn();

  const dispose = createRoot(dispose => {
    createTrackedEffect(() => {
      $x();
      return cleanup;
    });
    return dispose;
  });
  flush();
  expect(cleanup).toHaveBeenCalledTimes(0);

  setX(1);
  flush();
  expect(cleanup).toHaveBeenCalledTimes(1); // previous run's cleanup

  dispose();
  expect(cleanup).toHaveBeenCalledTimes(2); // final cleanup, exactly once
});

it("should work with dynamic conditional tracking", () => {
  const [$type, setType] = createSignal<"a" | "b">("a");
  const [$valueA, setValueA] = createSignal("Alice");
  const [$valueB, setValueB] = createSignal("Bob");
  const log = vi.fn();

  createRoot(() => {
    createTrackedEffect(() => {
      if ($type() === "a") {
        log($valueA());
      } else {
        log($valueB());
      }
    });
  });

  flush();
  expect(log).toHaveBeenCalledWith("Alice");
  expect(log).toHaveBeenCalledTimes(1);

  // Changing valueB shouldn't trigger (not tracked when type is "a")
  setValueB("Bobby");
  flush();
  expect(log).toHaveBeenCalledTimes(1);

  // Changing type should trigger and now track valueB
  setType("b");
  flush();
  expect(log).toHaveBeenCalledWith("Bobby");
  expect(log).toHaveBeenCalledTimes(2);

  // Now changing valueA shouldn't trigger
  setValueA("Alicia");
  flush();
  expect(log).toHaveBeenCalledTimes(2);

  // But changing valueB should
  setValueB("Robert");
  flush();
  expect(log).toHaveBeenCalledWith("Robert");
  expect(log).toHaveBeenCalledTimes(3);
});

describe("render-phase writes are observed (#3291)", () => {
  // Tracked effects bypass the heap and run in the same pass's user queue,
  // reading with committed visibility. A signal written during a render
  // (ownedWrite: the writers below are render-effect effect phases.)
  // effect's effect phase is staged, not committed, when that pass's tracked
  // runs execute — the read must arm the node so the commit wakes them.

  it("first run: a tracked effect subscribing after a render-phase write sees the committed value", () => {
    const [s, setS] = createSignal(0, { ownedWrite: true });
    const seen: number[] = [];
    createRoot(() => {
      createTrackedEffect(() => {
        seen.push(s());
      });
      // schedule:true — the effect phase runs inside the flush's render phase,
      // before the tracked effect's (queued) first run.
      createRenderEffect(
        () => 1,
        () => {
          setS(1);
        },
        { schedule: true } as any
      );
    });
    flush();
    expect(s()).toBe(1);
    expect(seen).toEqual([0, 1]);
  });

  it("re-run: an already-subscribed tracked effect ends on the committed value", () => {
    const [s, setS] = createSignal(0, { ownedWrite: true });
    const [trig, setTrig] = createSignal(0);
    const seen: number[] = [];
    createRoot(() => {
      createTrackedEffect(() => {
        seen.push(s());
      });
      createRenderEffect(
        () => trig(),
        t => {
          if (t) setS(t);
        }
      );
    });
    flush();
    expect(seen).toEqual([0]);
    setTrig(1);
    flush();
    expect(s()).toBe(1);
    // The same-pass re-run reads the stale committed value (tracked effects
    // never see staged values); the commit then wakes it once more.
    expect(seen[seen.length - 1]).toBe(1);
    expect(seen.filter(v => v === 1)).toHaveLength(1);
  });

  it("a memo staged during the render phase wakes its tracked reader at commit", () => {
    const [src, setSrc] = createSignal(0, { ownedWrite: true });
    const [trig, setTrig] = createSignal(0);
    const m = createMemo(() => src() * 10);
    const seen: number[] = [];
    createRoot(() => {
      createTrackedEffect(() => {
        seen.push(m());
      });
      createRenderEffect(
        () => trig(),
        t => {
          if (t) setSrc(t);
        }
      );
    });
    flush();
    setTrig(1);
    flush();
    expect(m()).toBe(10);
    expect(seen[seen.length - 1]).toBe(10);
  });

  it("no spurious run when the tracked effect already saw the committed value", () => {
    const [s, setS] = createSignal(0, { ownedWrite: true });
    const runs = vi.fn(() => {
      s();
    });
    createRoot(() => createTrackedEffect(runs));
    flush();
    setS(1);
    flush();
    expect(runs).toHaveBeenCalledTimes(2);
    flush();
    expect(runs).toHaveBeenCalledTimes(2);
  });
});
