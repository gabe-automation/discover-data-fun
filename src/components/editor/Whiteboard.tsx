import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight, Circle, Frame, Hand, LayoutTemplate, Minus, MousePointer2, Pencil, Square, StickyNote, ThumbsUp, Trash2, Type, ZoomIn, ZoomOut, Copy, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { keyBetween, val, type Props } from "@/lib/crdt";
import type { Cursor, Lease } from "@/lib/useRoom";
import type { SharedText } from "@/lib/sharedText";
import { CollabTextarea } from "./CollabTextarea";

type Shape = "sticky" | "rect" | "ellipse" | "text" | "line" | "arrow" | "pen" | "frame";
type Tool = "select" | "hand" | Shape;
type WB = { id: string; shape: Shape; x: number; y: number; w: number; h: number; color: string; text: string; points: number[]; order: string; votes: number; myVote: boolean };
type G = { x: number; y: number; w: number; h: number };

const BOARD_W = 3200, BOARD_H = 2200;
const COLORS = ["#fde68a", "#fbcfe8", "#bbf7d0", "#bfdbfe", "#fed7aa", "#ddd6fe", "#e7e5e4", "#1c1917"];
const NAMES: Record<Shape, string> = { sticky: "Sticky note", rect: "Rectangle", ellipse: "Ellipse", text: "Text", line: "Line", arrow: "Arrow", pen: "Drawing", frame: "Frame" };
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

  const items = useMemo(() => {
    const out: WB[] = [];
    for (const [id, pr] of Object.entries(p.nodes)) {
      if (val(pr, "kind", "") !== "wb" || val(pr, "page", "") !== p.pageId || val(pr, "deleted", false)) continue;
      let votes = 0;
      for (const [k, r] of Object.entries(pr)) if (k.startsWith("vote:") && r.v === true) votes++;
      out.push({
        id, shape: val(pr, "shape", "rect") as Shape, x: val(pr, "x", 0), y: val(pr, "y", 0), w: val(pr, "w", 100), h: val(pr, "h", 100),
        color: val(pr, "color", COLORS[0]!), text: val(pr, "text", ""), points: val<number[]>(pr, "points", []), order: val(pr, "order", "m"),
        votes, myVote: val(pr, `vote:${p.userId}`, false),
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

  async function select(id: string | null) {
    if (id === selected) return;
    if (held.current) { p.ops.release(held.current.id, held.current.label); held.current = null; }
    setSelected(id);
    setEditing(null);
    if (!id || p.readOnly) return;
    const w = items.find((x) => x.id === id);
    if (!w) return;
    const ok = await p.ops.acquire(id, label(w));
    if (ok) held.current = { id, label: label(w) };
    else toast.info(`${label(w)} is locked by ${p.leases[id]?.holder_name ?? "a teammate"}.`);
  }

  async function create(shape: Shape, g: G, extra: Record<string, unknown> = {}, order?: string) {
    const id = crypto.randomUUID();
    await p.ops.op(id, {
      kind: "wb", page: p.pageId, shape, deleted: false, order: order ?? keyBetween(maxOrder, null),
      x: Math.round(g.x), y: Math.round(g.y), w: Math.round(g.w), h: Math.round(g.h),
      color: shape === "frame" ? "#e7e5e4" : shape === "text" ? "#1c1917" : color, ...extra,
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
    if (shape === "sticky" || shape === "text") {
      const size = shape === "sticky" ? { w: 180, h: 160 } : { w: 240, h: 48 };
      create(shape, { x: start.x - size.w / 2, y: start.y - size.h / 2, ...size }, { text: shape === "text" ? "Type here" : "" }).then((id) => { setTool("select"); setSelected(id); setEditing(id); });
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
    const start = toBoard(e);
    const orig: G = { x: w.x, y: w.y, w: w.w, h: w.h };
    let last = orig, moved = false;
    // frames carry their contents along
    const inside = w.shape === "frame" && !resize ? items.filter((o) => o.id !== w.id && o.x >= w.x && o.y >= w.y && o.x + Math.abs(o.w) <= w.x + w.w && o.y + Math.abs(o.h) <= w.y + w.h) : [];
    const mv = (ev: PointerEvent) => {
      const c = toBoard(ev);
      const dx = c.x - start.x, dy = c.y - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      last = resize ? { ...orig, w: isLine(w.shape) ? orig.w + dx : Math.max(30, orig.w + dx), h: isLine(w.shape) ? orig.h + dy : Math.max(24, orig.h + dy) } : { ...orig, x: Math.round(orig.x + dx), y: Math.round(orig.y + dy) };
      setLocal({ id: w.id, g: last });
      p.ops.sendDrag({ id: w.id, bp: "wb", ...last });
    };
    const up = () => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
      setLocal(null);
      if (!moved) return;
      p.ops.sendDrag({ id: w.id, bp: "wb", ...last, done: true });
      p.ops.op(w.id, { x: Math.round(last.x), y: Math.round(last.y), w: Math.round(last.w), h: Math.round(last.h) }, resize ? "resized" : "moved", label(w));
      const dx = last.x - orig.x, dy = last.y - orig.y;
      for (const o of inside) if (!lockedByOther(o.id)) p.ops.op(o.id, { x: o.x + dx, y: o.y + dy }, "moved", label(o));
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }

  const sel = items.find((x) => x.id === selected) ?? null;
  const selLocked = sel ? lockedByOther(sel.id) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "INPUT") return;
      if (sel && !p.readOnly && !selLocked && (e.key === "Delete" || e.key === "Backspace")) { p.ops.op(sel.id, { deleted: true }, "deleted", label(sel)); select(null); }
      const map: Record<string, Tool> = { v: "select", h: "hand", s: "sticky", r: "rect", o: "ellipse", t: "text", l: "line", a: "arrow", p: "pen", f: "frame" };
      if (!e.metaKey && !e.ctrlKey && map[e.key]) setTool(map[e.key]!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function template(kind: "kanban" | "timeline" | "swot" | "matrix" | "retro") {
    const el = scrollRef.current!;
    const ox = Math.round(el.scrollLeft / zoom + 60), oy = Math.round(el.scrollTop / zoom + 60);
    const frames = (titles: string[], cols: number, fw: number, fh: number) =>
      Promise.all(titles.map((t, i) => create("frame", { x: ox + (i % cols) * (fw + 24), y: oy + Math.floor(i / cols) * (fh + 24), w: fw, h: fh }, { text: t })));
    if (kind === "kanban") {
      await frames(["To do", "In progress", "Review", "Done"], 4, 300, 620);
      await Promise.all(["Hero copy", "Pricing tiers", "Signup form"].map((t, i) => create("sticky", { x: ox + 30, y: oy + 60 + i * 180, w: 240, h: 150 }, { text: t, color: COLORS[i]! })));
    } else if (kind === "timeline") {
      await create("arrow", { x: ox, y: oy + 200, w: 1300, h: 0 }, { color: "#1c1917" });
      await Promise.all(["Week 1 · Discover", "Week 2 · Wireframes", "Week 3 · Build", "Week 4 · Launch"].map((t, i) =>
        create("sticky", { x: ox + 40 + i * 320, y: oy + (i % 2 ? 240 : 20), w: 220, h: 150 }, { text: t, color: COLORS[i]! })));
    } else if (kind === "swot") await frames(["Strengths", "Weaknesses", "Opportunities", "Threats"], 2, 520, 360);
    else if (kind === "matrix") await frames(["Do first · urgent & important", "Schedule · important", "Delegate · urgent", "Drop · neither"], 2, 520, 360);
    else await frames(["Went well", "To improve", "Action items"], 3, 380, 560);
    toast.success("Template added");
  }

  const tools: { t: Tool; icon: typeof Square; k: string; name: string }[] = [
    { t: "select", icon: MousePointer2, k: "V", name: "Select" }, { t: "hand", icon: Hand, k: "H", name: "Pan" },
    { t: "sticky", icon: StickyNote, k: "S", name: "Sticky note" }, { t: "rect", icon: Square, k: "R", name: "Rectangle" },
    { t: "ellipse", icon: Circle, k: "O", name: "Ellipse" }, { t: "text", icon: Type, k: "T", name: "Text" },
    { t: "line", icon: Minus, k: "L", name: "Line" }, { t: "arrow", icon: ArrowUpRight, k: "A", name: "Arrow" },
    { t: "pen", icon: Pencil, k: "P", name: "Pen" }, { t: "frame", icon: Frame, k: "F", name: "Frame / section" },
  ];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* toolbar */}
      <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-card p-1 shadow-lift">
        {tools.map(({ t, icon: I, k, name }) => (
          <button key={t} title={`${name} (${k})`} aria-label={name} disabled={p.readOnly && t !== "select" && t !== "hand"} onClick={() => setTool(t)}
            className={`grid size-8 place-items-center rounded-lg disabled:opacity-40 ${tool === t ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
            <I className="size-4" />
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        {COLORS.map((c) => (
          <button key={c} aria-label={`Color ${c}`} onClick={() => { setColor(c); if (sel && !selLocked && !p.readOnly) p.ops.op(sel.id, { color: c }, "recolored", label(sel)); }}
            className={`size-5 rounded-full border ${color === c ? "ring-2 ring-ring ring-offset-1" : ""}`} style={{ background: c }} />
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" disabled={p.readOnly}><LayoutTemplate className="size-4" /> Plan</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Planning templates</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => template("kanban")}>Kanban board</DropdownMenuItem>
            <DropdownMenuItem onClick={() => template("timeline")}>Project timeline</DropdownMenuItem>
            <DropdownMenuItem onClick={() => template("matrix")}>Priority matrix</DropdownMenuItem>
            <DropdownMenuItem onClick={() => template("swot")}>SWOT analysis</DropdownMenuItem>
            <DropdownMenuItem onClick={() => template("retro")}>Retrospective</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* selection bar */}
      {sel && (
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border bg-card px-3 py-1.5 text-sm shadow-lift">
          <span className="font-medium">{NAMES[sel.shape]}</span>
          {selLocked ? (
            <span className="flex items-center gap-1 text-muted-foreground"><Lock className="size-3.5" /> {selLocked.holder_name} is editing</span>
          ) : !p.readOnly && (
            <>
              <Button size="icon" variant="ghost" className="size-7" aria-label="Duplicate" onClick={() => create(sel.shape, { x: sel.x + 24, y: sel.y + 24, w: sel.w, h: sel.h }, { text: textOf(sel), color: sel.color, points: sel.points })}><Copy className="size-3.5" /></Button>
              <Button size="icon" variant="ghost" className="size-7" aria-label="Delete" onClick={() => { p.ops.op(sel.id, { deleted: true }, "deleted", label(sel)); select(null); }}><Trash2 className="size-3.5" /></Button>
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
                  onEdit={() => { if (!p.readOnly && !lock && ["sticky", "text", "frame", "rect", "ellipse"].includes(w.shape)) setEditing(w.id); }}
                  onCommit={(v) => { if (v !== w.text) p.ops.op(w.id, { text: v }, "edited", label(w)); }}
                  onVote={() => p.ops.op(w.id, { [`vote:${p.userId}`]: !w.myVote }, w.myVote ? "unvoted" : "voted", label(w))} />
              );
            })}
            {draft && <ShapeView w={{ id: "draft", shape: draft.shape, color, text: "", points: draft.points, order: "", votes: 0, myVote: false, ...draft.g }} g={draft.g} text="" draft />}
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
  onDown?: (e: React.PointerEvent) => void; onResize?: (e: React.PointerEvent) => void; onEdit?: () => void; onCommit?: (v: string) => void; onVote?: () => void;
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
      w.shape === "frame" ? `${base} rounded-xl border-2 border-dashed` : `${base} text-xl font-semibold`;
    const style: React.CSSProperties =
      w.shape === "sticky" ? { background: w.color, color: dark ? "#fafaf9" : "#1c1917" } :
      w.shape === "rect" || w.shape === "ellipse" ? { background: `color-mix(in srgb, ${w.color} 45%, white)`, borderColor: dark ? w.color : `color-mix(in srgb, ${w.color} 100%, black 25%)` } :
      w.shape === "frame" ? { background: "color-mix(in srgb, white 55%, transparent)", borderColor: "#a8a29e" } : { color: w.color === "#fde68a" ? "#1c1917" : w.color };
    inner = (
      <div className={cls} style={style} onDoubleClick={props.onEdit}>
        {w.shape === "frame" && <div className="-mt-7 text-sm font-semibold text-muted-foreground">{props.text}</div>}
        {props.editing && props.shared ? (
          <CollabTextarea shared={props.shared} k={`${w.id}:text`} seed={w.text} rows={w.shape === "text" ? 1 : 4}
            className="h-full resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" onCommit={props.onCommit} />
        ) : w.shape !== "frame" && <div className="whitespace-pre-wrap break-words">{props.text || (w.shape === "sticky" ? <span className="opacity-40">Double-click to write</span> : null)}</div>}
      </div>
    );
  }
  return (
    <div className="absolute" style={{ left: box.x, top: box.y, width: box.w, height: box.h, outline, outlineOffset: 3, pointerEvents: props.draft ? "none" : undefined, opacity: props.draft ? 0.6 : 1 }}
      onPointerDown={props.onDown}>
      {inner}
      {props.lock && <span className="absolute -top-6 left-0 whitespace-nowrap rounded-full px-2 py-0.5 font-sans text-[11px] text-primary-foreground" style={{ background: props.lock.holder_color }}>🔒 {props.lock.holder_name}</span>}
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
