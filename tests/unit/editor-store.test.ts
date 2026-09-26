import { describe, expect, it } from "vitest";
import { addAnnotation, createAnnotation, createScene, setIn } from "@/engine";
import { createEditorStore } from "@/state/editor-store";

function setup(historyLimit = 200) {
  let t = 0;
  const store = createEditorStore(createScene(), { now: () => t, historyLimit, coalesceMs: 500 });
  return { store, tick: (ms: number) => (t += ms) };
}
const radius = (v: number) => (s: ReturnType<typeof createScene>) =>
  setIn(s, ["card", "radius"], v);

describe("editor store", () => {
  it("undoes and redoes", () => {
    const { store } = setup();
    const initial = store.getState().scene;
    store.update(radius(1));
    store.update(radius(2));
    expect(store.getState().canUndo).toBe(true);
    store.undo();
    expect(store.getState().scene.card.radius).toBe(1);
    store.undo();
    expect(store.getState().scene).toBe(initial);
    expect(store.getState().canUndo).toBe(false);
    store.redo();
    store.redo();
    expect(store.getState().scene.card.radius).toBe(2);
    expect(store.getState().canRedo).toBe(false);
  });

  it("coalesces rapid updates with the same key into one step", () => {
    const { store, tick } = setup();
    for (let v = 1; v <= 10; v++) {
      store.update(radius(v), { coalesce: "radius" });
      tick(50);
    }
    store.undo();
    expect(store.getState().scene.card.radius).toBe(createScene().card.radius);
    store.redo();
    tick(1000);
    store.update(radius(20), { coalesce: "radius" }); // after the window: new step
    store.undo();
    expect(store.getState().scene.card.radius).toBe(10);
  });

  it("clears redo on new edits, skips no-ops and transient updates", () => {
    const { store } = setup();
    let calls = 0;
    store.subscribe(() => calls++);
    store.update(radius(1));
    store.undo();
    store.update(radius(3));
    expect(store.getState().canRedo).toBe(false);
    const before = calls;
    store.update((s) => s);
    expect(calls).toBe(before);
    store.update(radius(4), { transient: true });
    store.undo();
    expect(store.getState().scene.card.radius).toBe(createScene().card.radius);
  });

  it("caps history and resets", () => {
    const { store } = setup(3);
    for (let v = 1; v <= 6; v++) store.update(radius(v));
    let undos = 0;
    while (store.getState().canUndo) {
      store.undo();
      undos++;
    }
    expect(undos).toBe(3);
    store.reset(createScene({ meta: { name: "fresh" } }));
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().scene.meta.name).toBe("fresh");
  });

  it("drops the selection when its annotation disappears", () => {
    const { store } = setup();
    store.update((s) => addAnnotation(s, createAnnotation("text", "t1")));
    store.select("t1");
    expect(store.getState().selection).toBe("t1");
    store.update((s) => ({ ...s, annotations: [] }));
    expect(store.getState().selection).toBeNull();
  });

  it("unsubscribes", () => {
    const { store } = setup();
    let n = 0;
    const off = store.subscribe(() => n++);
    store.update(radius(5));
    off();
    store.update(radius(6));
    expect(n).toBe(1);
  });
});
