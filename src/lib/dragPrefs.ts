import { useEffect, useState } from "react";

export type DragPrefs = {
  guides: boolean; // snap to other elements' edges/centers
  grid: number; // 0 = off
  axis: "free" | "x" | "y";
  drop: "cursor" | "stack" | "center";
  nudge: number;
  frameCarry: boolean; // whiteboard frames move their contents
  lockOnSelect: boolean; // take a temporary edit lease when selecting
};

export const DEFAULT_PREFS: DragPrefs = { guides: true, grid: 0, axis: "free", drop: "cursor", nudge: 1, frameCarry: true, lockOnSelect: true };

export const WORKFLOWS: { id: string; name: string; hint: string; prefs: DragPrefs }[] = [
  { id: "free", name: "Freeform", hint: "Drop anywhere, snap to neighbours", prefs: DEFAULT_PREFS },
  { id: "layout", name: "Structured layout", hint: "8px grid, blocks stack under each other", prefs: { ...DEFAULT_PREFS, grid: 8, drop: "stack", nudge: 8 } },
  { id: "board", name: "Planning board", hint: "24px grid, frames carry their cards", prefs: { ...DEFAULT_PREFS, grid: 24, guides: false, nudge: 24 } },
  { id: "timeline", name: "Timeline", hint: "Only slide left/right, 16px grid", prefs: { ...DEFAULT_PREFS, grid: 16, axis: "x", nudge: 16 } },
];

export function useDragPrefs(projectId: string) {
  const key = `wc-drag:${projectId}`;
  const [prefs, setPrefs] = useState<DragPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<DragPrefs>) });
    } catch { /* ignore */ }
  }, [key]);
  const update = (patch: Partial<DragPrefs>) =>
    setPrefs((p) => {
      const n = { ...p, ...patch };
      localStorage.setItem(key, JSON.stringify(n));
      return n;
    });
  return [prefs, update] as const;
}

export const snapGrid = (v: number, grid: number) => (grid > 0 ? Math.round(v / grid) * grid : v);
