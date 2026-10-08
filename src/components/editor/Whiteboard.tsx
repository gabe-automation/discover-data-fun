import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight, Circle, Frame, Hand, LayoutTemplate, Minus, MousePointer2, Pencil, Square, StickyNote, ThumbsUp, Trash2, Type, ZoomIn, ZoomOut, Copy, Lock, Pin, Unlock, Undo2, Redo2, CheckCircle2, Circle as CircleIcon, ListTodo, Diamond, Code2, Webhook,
} from "lucide-react";
import { snapGrid, type DragPrefs } from "@/lib/dragPrefs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { keyBetween, val, type Props } from "@/lib/crdt";
import type { Cursor, Lease, NodeLock } from "@/lib/useRoom";
import type { SharedText } from "@/lib/sharedText";
import { CollabTextarea } from "./CollabTextarea";

type Shape = "sticky" | "rect" | "ellipse" | "text" | "line" | "arrow" | "pen" | "frame" | "task" | "decision" | "code" | "api";
type Status = "" | "todo" | "doing" | "review" | "done";
const STATUS_NEXT: Record<string, Status> = { "": "todo", todo: "doing", doing: "review", review: "done", done: "todo" };
const STATUS_LABEL: Record<string, string> = { todo: "To do", doing: "In progress", review: "In review", done: "Done" };
const TRACKABLE: Shape[] = ["task", "sticky", "rect", "code", "api", "decision"];
type Tool = "select" | "hand" | Shape;
type WB = { id: string; shape: Shape; x: number; y: number; w: number; h: number; color: string; text: string; points: number[]; order: string; votes: number; myVote: boolean; status: Status };
type G = { x: number; y: number; w: number; h: number };

const BOARD_W = 3200, BOARD_H = 2200;
const COLORS = ["#fde68a", "#fbcfe8", "#bbf7d0", "#bfdbfe", "#fed7aa", "#ddd6fe", "#e7e5e4", "#1c1917"];
const NAMES: Record<Shape, string> = { sticky: "Sticky note", rect: "Process step", ellipse: "Start / end", text: "Text", line: "Line", arrow: "Connector", pen: "Drawing", frame: "Frame", task: "Task", decision: "Decision", code: "Code snippet", api: "API endpoint" };
const CLICK_SIZES: Partial<Record<Shape, { w: number; h: number; text: string }>> = {
  sticky: { w: 180, h: 160, text: "" }, text: { w: 240, h: 48, text: "Type here" }, task: { w: 260, h: 120, text: "New task" },
  decision: { w: 180, h: 180, text: "Condition?" }, code: { w: 320, h: 180, text: "// code\nfunction run() {\n  return true;\n}" }, api: { w: 300, h: 120, text: "GET /api/items\nReturns the list of items" },
};
const isLine = (s: Shape) => s === "line" || s === "arrow";

type Ops = {
  op: (id: string, values: Record<string, unknown>, action: string, label: string) => Promise<unknown>;
  acquire: (id: string, label: string) => Promise<boolean>;
  release: (id: string, label: string) => void;
  sendDrag: (d: { id: string; bp: string } & G & { done?: boolean }) => void;
  sendCursor: (x: number, y: number, page?: string) => void;
};

export function Whiteboard(p: {
  pageId: string;
  nodes: Record<string, Props>;
  userId: string;
  session: string;
  leases: Record<string, Lease>;
  cursors: Record<string, Cursor>;
  drags: Record<string, { bp: string } & G>;
  readOnly: boolean;
  shared: SharedText;
  ops: Ops;
  projectId: string;
  prefs: DragPrefs;
  locks: Record<string, NodeLock>;
  canOverride: (l: NodeLock) => boolean;
  onLock: (id: string, mode: NodeLock["mode"] | null, label: string) => void;
}) {
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0]!);
  const [zoom, setZoom] = useState(0.8);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [local, setLocal] = useState<{ id: string; g: G } | null>(null);
  const [draft, setDraft] = useState<{ shape: Shape; g: G; points: number[] } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const held = useRef<{ id: string; label: string } | null>(null);
  type Step = { id: string; before: Record<string, unknown>; after: Record<string, unknown>; label: string };
  const undoStack = useRef<Step[][]>([]);
  const redoStack = useRef<Step[][]>([]);
  const batch = useRef<Step[] | null>(null);
  const [histVer, setHistVer] = useState(0);
  void histVer;
  function wop(id: string, values: Record<string, unknown>, action: string, lbl: string) {
    const cur = p.nodes[id];
    const before: Record<string, unknown> = cur && !val(cur, "deleted", false) ? Object.fromEntries(Object.keys(values).map((k) => [k, val<unknown>(cur, k, null)])) : { deleted: true };
    const step = { id, before, after: values, label: lbl };
    if (batch.current) batch.current.push(step);
    else { undoStack.current.push([step]); if (undoStack.current.length > 100) undoStack.current.shift(); redoStack.current = []; setHistVer((v) => v + 1); }
    return p.ops.op(id, values, action, lbl);
  }
  async function inBatch(fn: () => Promise<unknown>) {
    batch.current = [];
    try { await fn(); } finally {
      const b = batch.current; batch.current = null;
      if (b.length) { undoStack.current.push(b); redoStack.current = []; setHistVer((v) => v + 1); }
    }
  }
  function travel(from: React.MutableRefObject<Step[][]>, to: React.MutableRefObject<Step[][]>, key: "before" | "after", verb: string) {
    if (p.readOnly) return;
    const g = from.current.pop();
    if (!g) { toast.info(`Nothing to ${verb}`); return; }
    for (const st of [...g].reverse()) p.ops.op(st.id, st[key], verb === "undo" ? "undid" : "redid", st.label);
    to.current.push(g);
    setHistVer((v) => v + 1);
  }
  const undo = () => travel(undoStack, redoStack, "before", "undo");
  const redo = () => travel(redoStack, undoStack, "after", "redo");

  const items = useMemo(() => {
    const out: WB[] = [];
    for (const [id, pr] of Object.entries(p.nodes)) {
      if (val<string>(pr, "kind", "") !== "wb" || val(pr, "page", "") !== p.pageId || val(pr, "deleted", false)) continue;
      let votes = 0;
      for (const [k, r] of Object.entries(pr)) if (k.startsWith("vote:") && r.v === true) votes++;
      out.push({
        id, shape: val(pr, "shape", "rect") as Shape, x: val(pr, "x", 0), y: val(pr, "y", 0), w: val(pr, "w", 100), h: val(pr, "h", 100),
        color: val(pr, "color", COLORS[0]!), text: val(pr, "text", ""), points: val<number[]>(pr, "points", []), order: val(pr, "order", "m"),
        votes, myVote: val(pr, `vote:${p.userId}`, false), status: val<Status>(pr, "status", ""),
      });
    }
    return out.sort((a, b) => (a.shape === "frame" ? -1 : 0) - (b.shape === "frame" ? -1 : 0) || (a.order < b.order ? -1 : 1));
  }, [p.nodes, p.pageId, p.userId]);
  const maxOrder = items.reduce<string | null>((m, v) => (!m || v.order > m ? v.order : m), null);
  const label = (w: WB) => `${NAMES[w.shape]}${w.text ? ` “${w.text.slice(0, 20)}”` : ""}`;
  const textOf = (w: WB) => (p.shared.has(`${w.id}:text`) ? p.shared.get(`${w.id}:text`) : w.text);
  void p.shared.ver;

  useEffect(() => () => { if (held.current) p.ops.release(held.current.id, held.current.label); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toBoard = (e: { clientX: number; clientY: number }) => {
    const r = boardRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };
  const lockedByOther = (id: string) => { const l = p.leases[id]; return l && l.holder_session !== p.session ? l : null; };

  const pinned = (id: string) => { const l = p.locks[id]; return l && !p.canOverride(l) ? l : null; };
  const frozen = (id: string) => pinned(id)?.mode === "full";

  async function select(id: string | null) {
    if (id === selected) return;
    if (held.current) { p.ops.release(held.current.id, held.current.label); held.current = null; }
    setSelected(id);
    setEditing(null);
    if (!id || p.readOnly || !p.prefs.lockOnSelect) return;
    const w = items.find((x) => x.id === id);
    if (!w) return;
    const ok = await p.ops.acquire(id, label(w));
    if (ok) held.current = { id, label: label(w) };
    else toast.info(`${label(w)} is locked by ${p.leases[id]?.holder_name ?? "a teammate"}.`);
  }

  async function create(shape: Shape, g: G, extra: Record<string, unknown> = {}, order?: string) {
    const id = crypto.randomUUID();
    await wop(id, {
      kind: "wb", page: p.pageId, shape, deleted: false, order: order ?? keyBetween(maxOrder, null),
      x: Math.round(g.x), y: Math.round(g.y), w: Math.round(g.w), h: Math.round(g.h),
      color: shape === "frame" ? "#e7e5e4" : shape === "text" ? "#1c1917" : shape === "code" ? "#1c1917" : color, ...(shape === "task" ? { status: "todo" } : {}), ...extra,
    }, "added", NAMES[shape]);
    return id;
  }

  function onBoardDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if (tool === "hand" || e.shiftKey && tool === "select") {
      const el = scrollRef.current!;
      const sx = e.clientX, sy = e.clientY, ox = el.scrollLeft, oy = el.scrollTop;
      const mv = (ev: PointerEvent) => { el.scrollLeft = ox - (ev.clientX - sx); el.scrollTop = oy - (ev.clientY - sy); };
      const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
      return;
    }
    if (tool === "select") { select(null); return; }
    if (p.readOnly) return;
    const start = toBoard(e);
    const shape = tool;
    const cs = CLICK_SIZES[shape];
    if (cs) {
      const size = { w: cs.w, h: cs.h };
      create(shape, { x: start.x - size.w / 2, y: start.y - size.h / 2, ...size }, { text: cs.text }).then((id) => { setTool("select"); setSelected(id); setEditing(id); });
      return;
    }
    const pts: number[] = [start.x, start.y];
    let g: G = { x: start.x, y: start.y, w: 0, h: 0 };
    const mv = (ev: PointerEvent) => {
      const c = toBoard(ev);
      if (shape === "pen") {
        pts.push(c.x, c.y);
        const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1);
        g = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      } else g = { x: start.x, y: start.y, w: c.x - start.x, h: c.y - start.y };
      setDraft({ shape, g, points: [...pts] });
    };
    const up = async () => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
      setDraft(null);
      if (shape === "pen") {
        if (pts.length < 6) return;
        const rel = pts.map((v, i) => Math.round(v - (i % 2 === 0 ? g.x : g.y)));
        await create("pen", { ...g, w: Math.max(g.w, 4), h: Math.max(g.h, 4) }, { points: rel });
        return;
      }
      if (Math.abs(g.w) < 8 && Math.abs(g.h) < 8) g = { ...g, w: isLine(shape) ? 160 : 200, h: isLine(shape) ? 0 : 140 };
      const norm = isLine(shape) ? g : { x: Math.min(g.x, g.x + g.w), y: Math.min(g.y, g.y + g.h), w: Math.abs(g.w), h: Math.abs(g.h) };
      const id = await create(shape, norm, shape === "frame" ? { text: "Frame" } : {}, shape === "frame" ? keyBetween(null, items[0]?.order ?? null) : undefined);
      setTool("select");
      setSelected(id);
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }

  function startMove(e: React.PointerEvent, w: WB, resize: boolean) {
    if (tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    select(w.id);
    if (p.readOnly || editing === w.id) return;
    if (lockedByOther(w.id)) return;
    const pl = pinned(w.id);
    if (pl) { toast.info(`${label(w)} is ${pl.mode === "move" ? "pinned" : "locked"} by ${pl.locked_by_name}.`); return; }
    const start = toBoard(e);
    const orig: G = { x: w.x, y: w.y, w: w.w, h: w.h };
    let last = orig, moved = false;
    // frames carry their contents along
    const inside = w.shape === "frame" && !resize && p.prefs.frameCarry ? items.filter((o) => o.id !== w.id && o.x >= w.x && o.y >= w.y && o.x + Math.abs(o.w) <= w.x + w.w && o.y + Math.abs(o.h) <= w.y + w.h) : [];
    const mv = (ev: PointerEvent) => {
      const c = toBoard(ev);
      let dx = c.x - start.x, dy = c.y - start.y;
      if (!resize && p.prefs.axis === "x") dy = 0;
      if (!resize && p.prefs.axis === "y") dx = 0;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      const G = ev.altKey ? 0 : p.prefs.grid;
      last = resize
        ? { ...orig, w: isLine(w.shape) ? orig.w + dx : Math.max(30, snapGrid(orig.x + orig.w + dx, G) - orig.x), h: isLine(w.shape) ? orig.h + dy : Math.max(24, snapGrid(orig.y + orig.h + dy, G) - orig.y) }
        : { ...orig, x: Math.round(snapGrid(orig.x + dx, G)), y: Math.round(snapGrid(orig.y + dy, G)) };
      setLocal({ id: w.id, g: last });
      p.ops.sendDrag({ id: w.id, bp: "wb", ...last });
    };
    const up = () => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
      setLocal(null);
      if (!moved) return;
      p.ops.sendDrag({ id: w.id, bp: "wb", ...last, done: true });
      void inBatch(async () => {
        await wop(w.id, { x: Math.round(last.x), y: Math.round(last.y), w: Math.round(last.w), h: Math.round(last.h) }, resize ? "resized" : "moved", label(w));
        const dx = last.x - orig.x, dy = last.y - orig.y;
        await Promise.all(inside.filter((o) => !lockedByOther(o.id) && !pinned(o.id)).map((o) => wop(o.id, { x: o.x + dx, y: o.y + dy }, "moved", label(o))));
      });
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }

  const sel = items.find((x) => x.id === selected) ?? null;
  const selLocked = sel ? lockedByOther(sel.id) : null;
  const selPin = sel ? pinned(sel.id) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
      if (sel && !p.readOnly && !selLocked && !selPin && (e.key === "Delete" || e.key === "Backspace")) { wop(sel.id, { deleted: true }, "deleted", label(sel)); select(null); }
      const map: Record<string, Tool> = { v: "select", h: "hand", k: "task", s: "sticky", r: "rect", d: "decision", o: "ellipse", a: "arrow", c: "code", i: "api", t: "text", f: "frame", p: "pen" };
      if (!e.metaKey && !e.ctrlKey && map[e.key]) setTool(map[e.key]!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function template(kind: "sprint" | "flow" | "api" | "bugs" | "retro") {
    const el = scrollRef.current!;
    const ox = Math.round(el.scrollLeft / zoom + 60), oy = Math.round(el.scrollTop / zoom + 60);
    const frames = (titles: string[], cols: number, fw: number, fh: number) =>
      Promise.all(titles.map((t, i) => create("frame", { x: ox + (i % cols) * (fw + 24), y: oy + Math.floor(i / cols) * (fh + 24), w: fw, h: fh }, { text: t }, keyBetween(null, items[0]?.order ?? null))));
    const tasks = (list: [string, number, Status][]) => Promise.all(list.map(([t, col, st], i) =>
      create("task", { x: ox + 20 + col * 324, y: oy + 50 + list.slice(0, i).filter((x) => x[1] === col).length * 140, w: 260, h: 120 }, { text: t, status: st, color: COLORS[(i + col) % 6]! })));
    await inBatch(async () => {
      if (kind === "sprint") {
        await frames(["Backlog", "In progress", "Code review", "Done"], 4, 300, 620);
        await tasks([["Set up auth flow", 0, "todo"], ["Design pricing page", 0, "todo"], ["Build signup form", 1, "doing"], ["API: /orders endpoint", 2, "review"], ["Project setup & CI", 3, "done"]]);
      } else if (kind === "flow") {
        const y = oy + 80;
        await create("ellipse", { x: ox, y, w: 160, h: 80 }, { text: "Start", color: COLORS[2]! });
        await create("arrow", { x: ox + 170, y: y + 40, w: 70, h: 0 }, { color: "#1c1917" });
        await create("rect", { x: ox + 250, y, w: 200, h: 80 }, { text: "User submits form", color: COLORS[3]! });
        await create("arrow", { x: ox + 460, y: y + 40, w: 70, h: 0 }, { color: "#1c1917" });
        await create("decision", { x: ox + 540, y: y - 50, w: 180, h: 180 }, { text: "Valid input?", color: COLORS[0]! });
        await create("arrow", { x: ox + 730, y: y + 40, w: 70, h: 0 }, { color: "#1c1917" });
        await create("rect", { x: ox + 810, y, w: 200, h: 80 }, { text: "Save & confirm", color: COLORS[3]! });
        await create("arrow", { x: ox + 630, y: y + 140, w: 0, h: 90 }, { color: "#1c1917" });
        await create("rect", { x: ox + 530, y: y + 240, w: 200, h: 80 }, { text: "Show error message", color: COLORS[1]! });
        await create("arrow", { x: ox + 1020, y: y + 40, w: 70, h: 0 }, { color: "#1c1917" });
        await create("ellipse", { x: ox + 1100, y, w: 160, h: 80 }, { text: "End", color: COLORS[2]! });
      } else if (kind === "api") {
        await frames(["Endpoints", "Data models"], 2, 640, 560);
        await Promise.all(["GET /api/products\nList products (paginated)", "POST /api/orders\nCreate an order", "GET /api/orders/:id\nOrder details", "DELETE /api/orders/:id\nCancel order"].map((t, i) =>
          create("api", { x: ox + 20, y: oy + 50 + i * 125, w: 600, h: 110 }, { text: t, color: COLORS[3]! })));
        await create("code", { x: ox + 684, y: oy + 50, w: 600, h: 220 }, { text: "type Product = {\n  id: string;\n  name: string;\n  price: number;\n}", color: "#1c1917" });
        await create("code", { x: ox + 684, y: oy + 290, w: 600, h: 220 }, { text: "type Order = {\n  id: string;\n  items: Product[];\n  status: 'pending' | 'paid';\n}", color: "#1c1917" });
      } else if (kind === "bugs") {
        await frames(["New", "Confirmed", "Fixing", "Fixed"], 4, 300, 560);
        await tasks([["Bug: login button unresponsive on Safari", 0, "todo"], ["Bug: price rounds wrong", 1, "todo"], ["Bug: images slow on mobile", 2, "doing"], ["Bug: footer overlaps", 3, "done"]]);
      } else await frames(["Went well", "To improve", "Action items"], 3, 380, 560);
    });
    toast.success("Template added");
  }

  const tools: { t: Tool; icon: typeof Square; k: string; name: string }[] = [
    { t: "select", icon: MousePointer2, k: "V", name: "Select" }, { t: "hand", icon: Hand, k: "H", name: "Pan" },
    { t: "task", icon: ListTodo, k: "K", name: "Task card" }, { t: "sticky", icon: StickyNote, k: "S", name: "Sticky note" },
    { t: "rect", icon: Square, k: "R", name: "Process step" }, { t: "decision", icon: Diamond, k: "D", name: "Decision" },
    { t: "ellipse", icon: Circle, k: "O", name: "Start / end" }, { t: "arrow", icon: ArrowUpRight, k: "A", name: "Connector" },
    { t: "code", icon: Code2, k: "C", name: "Code snippet" }, { t: "api", icon: Webhook, k: "I", name: "API endpoint" },
    { t: "text", icon: Type, k: "T", name: "Text" }, { t: "frame", icon: Frame, k: "F", name: "Frame / lane" }, { t: "pen", icon: Pencil, k: "P", name: "Pen" },
  ];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* toolbar */}
      <div className="absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border bg-card p-1 shadow-lift [&>*]:shrink-0">
        <Button size="icon" variant="ghost" className="size-8" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={p.readOnly || !undoStack.current.length} onClick={undo}><Undo2 className="size-4" /></Button>
        <Button size="icon" variant="ghost" className="size-8" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={p.readOnly || !redoStack.current.length} onClick={redo}><Redo2 className="size-4" /></Button>
        <span className="mx-1 h-6 w-px bg-border" />
        {tools.map(({ t, icon: I, k, name }) => (
          <button key={t} title={`${name} (${k})`} aria-label={name} disabled={p.readOnly && t !== "select" && t !== "hand"} onClick={() => setTool(t)}
            className={`grid size-8 place-items-center rounded-lg disabled:opacity-40 ${tool === t ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
            <I className="size-4" />
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        {COLORS.map((c) => (
          <button key={c} aria-label={`Color ${c}`} onClick={() => { setColor(c); if (sel && !selLocked && !p.readOnly) wop(sel.id, { color: c }, "recolored", label(sel)); }}
            className={`size-5 rounded-full border ${color === c ? "ring-2 ring-ring ring-offset-1" : ""}`} style={{ background: c }} />
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" disabled={p.readOnly}><LayoutTemplate className="size-4" /> Plan</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Planning templates</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => template("sprint")}>Sprint board</DropdownMenuItem>
            <DropdownMenuItem onClick={() => template("flow")}>User flow (flowchart)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => template("api")}>API design</DropdownMenuItem>
            <DropdownMenuItem onClick={() => template("bugs")}>Bug triage</DropdownMenuItem>
            <DropdownMenuItem onClick={() => template("retro")}>Sprint retrospective</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* selection bar */}
      {sel && (
        <div className="absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 overflow-x-auto rounded-lg border bg-card px-3 py-1.5 text-sm shadow-lift [&>*]:shrink-0">
          <span className="font-medium">{NAMES[sel.shape]}</span>
          {selPin && !selLocked && (
            <span className="flex items-center gap-1 text-muted-foreground">{selPin.mode === "move" ? <Pin className="size-3.5" /> : <Lock className="size-3.5" />} {selPin.mode === "move" ? "Pinned" : "Locked"} by {selPin.locked_by_name}</span>
          )}
          {!p.readOnly && !selLocked && (!p.locks[sel.id] || p.canOverride(p.locks[sel.id]!)) && (
            <span className="flex items-center gap-0.5 border-r pr-2">
              <Button size="icon" variant={!p.locks[sel.id] ? "secondary" : "ghost"} className="size-7" title="Unlocked" aria-label="Unlock" onClick={() => p.onLock(sel.id, null, label(sel))}><Unlock className="size-3.5" /></Button>
              <Button size="icon" variant={p.locks[sel.id]?.mode === "move" ? "secondary" : "ghost"} className="size-7" title="Pin: others can't move it" aria-label="Pin" onClick={() => p.onLock(sel.id, "move", label(sel))}><Pin className="size-3.5" /></Button>
              <Button size="icon" variant={p.locks[sel.id]?.mode === "full" ? "secondary" : "ghost"} className="size-7" title="Lock: others can't change it" aria-label="Lock" onClick={() => p.onLock(sel.id, "full", label(sel))}><Lock className="size-3.5" /></Button>
            </span>
          )}
          {selLocked ? (
            <span className="flex items-center gap-1 text-muted-foreground"><Lock className="size-3.5" /> {selLocked.holder_name} is editing</span>
          ) : !p.readOnly && !selPin && (
            <>
              <Button size="icon" variant="ghost" className="size-7" aria-label="Duplicate" onClick={() => create(sel.shape, { x: sel.x + 24, y: sel.y + 24, w: sel.w, h: sel.h }, { text: textOf(sel), color: sel.color, points: sel.points, status: sel.status })}><Copy className="size-3.5" /></Button>
              <Button size="icon" variant="ghost" className="size-7" aria-label="Delete" onClick={() => { wop(sel.id, { deleted: true }, "deleted", label(sel)); select(null); }}><Trash2 className="size-3.5" /></Button>
            </>
          )}
        </div>
      )}

      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-lg border bg-card p-1 shadow-lift">
        <Button size="icon" variant="ghost" className="size-7" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} aria-label="Zoom out"><ZoomOut className="size-4" /></Button>
        <span className="w-10 text-center text-xs">{Math.round(zoom * 100)}%</span>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} aria-label="Zoom in"><ZoomIn className="size-4" /></Button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-dotgrid"
        onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((z) => Math.min(2, Math.max(0.3, z - e.deltaY * 0.002))); } }}>
        <div style={{ width: BOARD_W * zoom, height: BOARD_H * zoom }} className="relative">
          <div ref={boardRef} className="absolute left-0 top-0 origin-top-left"
            style={{ width: BOARD_W, height: BOARD_H, transform: `scale(${zoom})`, cursor: tool === "hand" ? "grab" : tool === "select" ? "default" : "crosshair" }}
            onPointerDown={onBoardDown}
            onPointerMove={(e) => { const c = toBoard(e); p.ops.sendCursor(c.x, c.y, p.pageId); }}>
            {items.map((w) => {
              const remote = p.drags[w.id];
              const g = local?.id === w.id ? local.g : remote && remote.bp === "wb" ? remote : w;
              const lock = lockedByOther(w.id);
              return (
                <ShapeView key={w.id} w={w} g={g} text={textOf(w)} selected={selected === w.id} lock={lock} readOnly={p.readOnly}
                  editing={editing === w.id} shared={p.shared}
                  onDown={(e) => startMove(e, w, false)} onResize={(e) => startMove(e, w, true)}
                  onEdit={() => { if (!p.readOnly && !lock && !frozen(w.id) && ["sticky", "text", "frame", "rect", "ellipse", "task", "decision", "code", "api"].includes(w.shape)) setEditing(w.id); }}
                  onCommit={(v) => { if (v !== w.text) wop(w.id, { text: v }, "edited", label(w)); }}
                  onStatus={(st) => { if (!p.readOnly && !lock && !frozen(w.id)) wop(w.id, { status: st }, st === "done" ? "completed" : "updated status of", label(w)); }}
                  onVote={() => wop(w.id, { [`vote:${p.userId}`]: !w.myVote }, w.myVote ? "unvoted" : "voted", label(w))} />
              );
            })}
            {draft && <ShapeView w={{ id: "draft", shape: draft.shape, color, text: "", points: draft.points, order: "", votes: 0, myVote: false, status: "", ...draft.g }} g={draft.g} text="" draft />}
            {Object.entries(p.cursors).map(([s, c]) => s === p.session || c.page !== p.pageId ? null : (
              <div key={s} className="pointer-events-none absolute z-[9999] transition-all duration-75" style={{ left: c.x, top: c.y }}>
                <svg width="20" height="20" viewBox="0 0 24 24" style={{ color: c.color }} fill="currentColor"><path d="M3 2l18 8-8 3-3 8z" /></svg>
                <span className="ml-3 rounded px-1.5 py-0.5 font-sans text-xs text-primary-foreground" style={{ background: c.color }}>{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

function ShapeView(props: {
  w: WB; g: G; text: string; selected?: boolean; lock?: Lease | null; readOnly?: boolean; editing?: boolean; draft?: boolean; shared?: SharedText;
  onDown?: (e: React.PointerEvent) => void; onResize?: (e: React.PointerEvent) => void; onEdit?: () => void; onCommit?: (v: string) => void; onVote?: () => void; onStatus?: (s: Status) => void;
}) {
  const { w, g } = props;
  const line = isLine(w.shape);
  const box = line ? { x: Math.min(g.x, g.x + g.w), y: Math.min(g.y, g.y + g.h), w: Math.max(Math.abs(g.w), 12), h: Math.max(Math.abs(g.h), 12) } : g;
  const outline = props.selected ? "2px solid var(--primary)" : props.lock ? `2px dashed ${props.lock.holder_color}` : undefined;
  const dark = w.color === "#1c1917";
  let inner: React.ReactNode = null;
  if (line) {
    const x1 = g.w >= 0 ? 0 : box.w, y1 = g.h >= 0 ? 0 : box.h, x2 = box.w - x1, y2 = box.h - y1;
    const stroke = w.color === "#fde68a" ? "#1c1917" : w.color;
    inner = (
      <svg width={box.w} height={box.h} className="overflow-visible">
        <defs><marker id={`ah-${w.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill={stroke} /></marker></defs>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={3} strokeLinecap="round" markerEnd={w.shape === "arrow" ? `url(#ah-${w.id})` : undefined} />
      </svg>
    );
  } else if (w.shape === "pen") {
    const pts = props.draft ? w.points.map((v, i) => v - (i % 2 === 0 ? g.x : g.y)) : w.points;
    const d = pts.reduce((s, v, i) => s + (i % 2 === 0 ? `${i === 0 ? "M" : "L"}${v} ` : `${v} `), "");
    inner = <svg width={box.w} height={box.h} className="overflow-visible"><path d={d} fill="none" stroke={w.color === "#fde68a" ? "#1c1917" : w.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></svg>;
  } else {
    const base = "h-full w-full font-sans";
    const cls =
      w.shape === "sticky" ? `${base} rounded-sm p-3 text-[15px] leading-snug shadow-md` :
      w.shape === "rect" ? `${base} grid place-items-center rounded-lg border-2 p-2 text-center text-sm` :
      w.shape === "ellipse" ? `${base} grid place-items-center rounded-[50%] border-2 p-4 text-center text-sm` :
      w.shape === "frame" ? `${base} rounded-xl border-2 border-dashed` :
      w.shape === "task" ? `${base} rounded-lg border border-l-[6px] bg-card p-3 pt-8 text-sm shadow-md` :
      w.shape === "decision" ? `${base} grid place-items-center p-8 text-center text-sm font-medium` :
      w.shape === "code" ? `${base} overflow-hidden rounded-lg p-3 pt-8 font-mono text-[12px] leading-relaxed shadow-md` :
      w.shape === "api" ? `${base} rounded-lg border-2 bg-card p-3 pt-8 font-mono text-[13px] shadow-sm` : `${base} text-xl font-semibold`;
    const style: React.CSSProperties =
      w.shape === "sticky" ? { background: w.color, color: dark ? "#fafaf9" : "#1c1917" } :
      w.shape === "rect" || w.shape === "ellipse" ? { background: `color-mix(in srgb, ${w.color} 45%, white)`, borderColor: dark ? w.color : `color-mix(in srgb, ${w.color} 100%, black 25%)` } :
      w.shape === "frame" ? { background: "color-mix(in srgb, white 55%, transparent)", borderColor: "#a8a29e" } :
      w.shape === "task" ? { borderLeftColor: dark ? "#57534e" : `color-mix(in srgb, ${w.color} 100%, black 20%)`, color: "#1c1917", background: "#fff" } :
      w.shape === "decision" ? { background: `color-mix(in srgb, ${w.color} 55%, white)`, clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)", color: "#1c1917" } :
      w.shape === "code" ? { background: "#1c1917", color: "#e7e5e4" } :
      w.shape === "api" ? { borderColor: `color-mix(in srgb, ${w.color} 100%, black 25%)`, color: "#1c1917", background: "#fff" } : { color: w.color === "#fde68a" ? "#1c1917" : w.color };
    inner = (
      <div className={cls} style={style} onDoubleClick={props.onEdit}>
        {w.shape === "frame" && <div className="-mt-7 text-sm font-semibold text-muted-foreground">{props.text}</div>}
        {props.editing && props.shared ? (
          <CollabTextarea shared={props.shared} k={`${w.id}:text`} seed={w.text} rows={w.shape === "text" ? 1 : 4}
            className="h-full resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" onCommit={props.onCommit} />
        ) : w.shape !== "frame" && <div className={`whitespace-pre-wrap break-words ${w.status === "done" ? "line-through opacity-60" : ""}`}>{props.text || (w.shape === "sticky" ? <span className="opacity-40">Double-click to write</span> : null)}</div>}
      </div>
    );
  }
  return (
    <div className="absolute" style={{ left: box.x, top: box.y, width: box.w, height: box.h, outline, outlineOffset: 3, pointerEvents: props.draft ? "none" : undefined, opacity: props.draft ? 0.6 : 1 }}
      onPointerDown={props.onDown}>
      {inner}
      {props.lock && <span className="absolute -top-6 left-0 whitespace-nowrap rounded-full px-2 py-0.5 font-sans text-[11px] text-primary-foreground" style={{ background: props.lock.holder_color }}>🔒 {props.lock.holder_name}</span>}
      {TRACKABLE.includes(w.shape) && !props.draft && (
        <span className="absolute left-2 top-2 z-10 flex items-center gap-1 font-sans" onPointerDown={(e) => e.stopPropagation()}>
          <button disabled={props.readOnly} aria-label={w.status === "done" ? "Mark not done" : "Mark done"} title={w.status === "done" ? "Mark not done" : "Mark done"}
            onClick={() => props.onStatus?.(w.status === "done" ? (w.shape === "task" ? "todo" : "") : "done")}
            className={w.status === "done" ? "text-success" : "text-muted-foreground hover:text-foreground"}>
            {w.status === "done" ? <CheckCircle2 className="size-4" /> : <CircleIcon className="size-4" />}
          </button>
          {w.status === "done" ? (
            <span className="rounded-full bg-success px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">✓ Done</span>
          ) : w.shape === "task" ? (
            <button disabled={props.readOnly} onClick={() => props.onStatus?.(STATUS_NEXT[w.status || "todo"]!)} title="Click to change status"
              className="rounded-full border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-foreground">{STATUS_LABEL[w.status || "todo"]}</button>
          ) : null}
        </span>
      )}
      {w.shape === "api" && !props.draft && (
        <span className="absolute right-2 top-2 rounded bg-secondary px-1.5 font-mono text-[10px] font-bold">{(props.text.match(/^(GET|POST|PUT|PATCH|DELETE)/i)?.[1] ?? "API").toUpperCase()}</span>
      )}
      {w.shape === "code" && !props.draft && <span className="absolute right-2 top-2 font-mono text-[10px] text-stone-400">code</span>}
      {w.shape === "sticky" && !props.draft && (
        <button onPointerDown={(e) => e.stopPropagation()} onClick={props.onVote} disabled={props.readOnly}
          className={`absolute -bottom-3 right-2 flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 font-sans text-[11px] shadow-sm ${w.myVote ? "border-primary text-primary" : ""}`}>
          <ThumbsUp className="size-3" /> {w.votes}
        </button>
      )}
      {props.selected && !props.readOnly && !props.lock && w.shape !== "pen" && (
        <div className="absolute -bottom-1.5 -right-1.5 size-3 cursor-se-resize rounded-sm border-2 border-primary bg-card" onPointerDown={props.onResize} />
      )}
    </div>
  );
}
