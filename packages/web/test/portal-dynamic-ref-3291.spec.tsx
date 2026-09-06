/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 *
 * Repro for https://github.com/solidjs/solid/issues/3291
 * A signal written from a ref callback is never observed by an effect
 * when the element is rendered via <Dynamic> inside a <Portal>.
 */
import { describe, expect, test } from "vitest";
import { createRoot, createSignal, createTrackedEffect, flush } from "solid-js";
import { Dynamic, Portal, render } from "@solidjs/web";

describe("issue #3291: ref signal not observed through <Dynamic> in <Portal>", () => {
  test("repro: effect should see the element written from ref", () => {
    const [el, setEl] = createSignal<HTMLElement>();

    const observations: boolean[] = [];
    let effectRuns = 0;
    createTrackedEffect(() => {
      effectRuns++;
      observations.push(!!el());
    });
    flush();

    const Wrapper = (props: Record<string, unknown>) => <Dynamic {...props} component="div" />;

    const div = document.createElement("div");
    document.body.appendChild(div);

    const disposer = createRoot(dispose => {
      render(
        () => (
          <Portal>
            <Wrapper ref={setEl} />
          </Portal>
        ),
        div
      );
      return dispose;
    });

    // The signal should now hold the element.
    const element = el();
    expect(element).toBeInstanceOf(HTMLElement);

    // Regression assertion (#3291): the effect MUST be re-run after the ref
    // write, and that run must observe a truthy element.
    expect(observations).toContain(true);
    expect(effectRuns).toBeGreaterThan(1);

    disposer();
  });
});
