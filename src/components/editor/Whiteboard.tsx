import { useMemo, useRef, useState } from "react";
import {
  ArrowUpRight, CheckSquare, Circle, Frame, Hand, Kanban, MousePointer2, Pencil, Square, StickyNote, Trash2, Type, CalendarRange, ThumbsUp, Grid2x2, Copy,
} from "lucide-react";
import { val, keyBetween, type Props as Regs } from "@/lib/crdt";
import type { Cursor } from "@/lib/useRoom";
import type { TextStore } from "@/lib/useTexts";
import { CollabField } from "./CollabField";

export type BoardKind = "sticky" | "rect" | "ellipse" | "text" | "frame" | "arrow" | "pen" | "check";
type Item = {
  id: string; kind: BoardKind; x: number; y: number; w: number; h: number; color: string; text: string;
  points: number[]; checked: boolean; votes: string[]; order: string;
};
type Tool = "select" | "hand" | BoardKind | "vote";

const COLORS = ["#fde68a", "#fecaca", "#bbf7d0", "#bfdbfe", "#e9d5ff", "#fed7aa", "#e7e5e4"];
const DEF: Record<BoardKind, { w: number; h: number; text: string }> = {
  sticky: { w: 180, h: 160, text: "New idea" },
  rect: { w: 200, h: 120, text: "" },
  ellipse: { w: 160, h: 120, text: "" },
  text: { w: 240, h: 40, text: "Text" },
  frame: { w: 520, h: 360, text: "Frame" },
  arrow: { w: 0, h: 0, text: "" },
  pen: { w: 0, h: 0, text: "" },
  check: { w: 240, h: 36, text: "To do" },
};

type Props = {
  pageId: string;
  userId: string;
  nodes: Record<string, Regs>;
  texts: TextStore;
  readOnly: boolean;
  cursors: Record<string, Cursor & { page?: string }>;
  mySession: string;
  op: (id: string, values: Record<string, unknown>, action: string, label: string) => Promise<unknown>;
  onCursor: (x: number, y: number) => void;
  onTyping: (id: string) => void;
};

export function Whiteboard(p: Props) {
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0]!);
  const [view, setView] = useState({ x: 40, y: 40, z: 1 });
  const [sel, setSel] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, Partial<Item>>>({});
  const [draft, setDraft] = useState<Item | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const [id, r] of Object.entries(p.nodes)) {
      if (val<string>(r, "type", "") !== "wb" || val(r, "page", "") !== p.pageId || val(r, "deleted", false)) continue;
      const kind = val<BoardKind>(r, "kind", "sticky");
      out.push({
        id, kind, x: val(r, "x", 0), y: val(r, "y", 0), w: val(r, "w", 100), h: val(r, "h", 100),
        color: val(r, "color", COLORS[0]!), text: p.texts.plain(id, "text") ?? val(r, "text", ""),
        points: val(r, "points", []), checked: val(r, "checked", false), votes: val(r, "votes", []), order: val(r, "order", "m"),
      });
    }
    return out.sort((a, b) => (a.kind === "frame" ? -1 : 0) - (b.kind === "frame" ? -1 : 0) || (a.order < b.order ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.nodes, p.pageId, p.texts.version]);
  const maxOrder = items.reduce<string | null>((m, i) => (!m || i.order > m ? i.order : m), null);

  const toBoard = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.z, y: (e.clientY - r.top - view.y) / view.z };
  };
  const name = (k: BoardKind) => `Whiteboard ${k}`;

  function create(kind: BoardKind, x: number, y: number, extra: Record<string, unknown> = {}, order?: string) {
    const id = crypto.randomUUID();
    const d = DEF[kind];
    p.op(id, {
      type: "wb", page: p.pageId, kind, x: Math.round(x), y: Math.round(y), w: d.w, h: d.h,
      color: kind === "frame" ? "#f5f5f4" : kind === "rect" || kind === "ellipse" ? "#ffffff" : color,
      text: d.text, order: order ?? keyBetween(maxOrder, null), deleted: false, ...extra,
    }, "created", name(kind));
    return id;
  }

  function template(kind: "kanban" | "timeline" | "swot", x: number, y: number) {
    let ord = maxOrder;
    const next = () => (ord = keyBetween(ord, null));
    if (kind === "kanban") {
      ["To do", "In progress", "Done"].forEach((t, i) => {
        create("frame", x + i * 280, y, { w: 260, h: 480, text: t, color: "#f5f5f4" }, next());
        create("sticky", x + i * 280 + 20, y + 50, { w: 220, h: 100, text: i === 0 ? "Plan homepage" : i === 1 ? "Design hero" : "Set up project", color: COLORS[i + 1] }, next());
      });
    } else if (kind === "timeline") {
      create("arrow", x, y + 60, { points: [0, 0, 1000, 0], color: "#57534e" }, next());
      ["Discover", "Design", "Build", "Test", "Launch"].forEach((t, i) => {
        create("sticky", x + i * 210, y - 70, { w: 170, h: 90, text: `Week ${i + 1}\n${t}`, color: COLORS[i % COLORS.length] }, next());
        create("check", x + i * 210, y + 90, { w: 180, text: `${t} done` }, next());
      });
    } else {
      ["Strengths", "Weaknesses", "Opportunities", "Threats"].forEach((t, i) => {
        create("frame", x + (i % 2) * 320, y + Math.floor(i / 2) * 260, { w: 300, h: 240, text: t, color: COLORS[i] }, next());
      });
    }
  }

  function commit(id: string, patch: Partial<Item>, action = "moved") {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    p.op(id, patch as Record<string, unknown>, action, name(it.kind));
  }

  function onBgDown(e: React.PointerEvent) {
    if (e.button === 1 || tool === "hand" || e.altKey) return pan(e);
    const b = toBoard(e);
    if (p.readOnly || tool === "select" || tool === "vote") {
      setSel([]); setEditing(null);
      return pan(e);
    }
    if (tool === "pen" || tool === "arrow") {
      const pts = [0, 0];
      const d: Item = { id: "draft", kind: tool, x: b.x, y: b.y, w: 0, h: 0, color: tool === "arrow" ? "#57534e" : color, text: "", points: pts, checked: false, votes: [], order: "z" };
      setDraft(d);
      const move = (ev: PointerEvent) => {
        const c = toBoard(ev);
        const np = tool === "pen" ? [...d.points, Math.round(c.x - b.x), Math.round(c.y - b.y)] : [0, 0, Math.round(c.x - b.x), Math.round(c.y - b.y)];
        d.points = np;
        setDraft({ ...d });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setDraft(null);
        if (d.points.length >= 4) create(tool, b.x, b.y, { points: d.points, color: d.color });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }
    const d = DEF[tool];
    const id = create(tool, b.x - d.w / 2, b.y - d.h / 2);
    setSel([id]);
    if (tool !== "rect" && tool !== "ellipse") setEditing(id);
    setTool("select");
  }

  function pan(e: React.PointerEvent) {
    const s = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    const move = (ev: PointerEvent) => setView((v) => ({ ...v, x: s.vx + ev.clientX - s.x, y: s.vy + ev.clientY - s.y }));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onItemDown(e: React.PointerEvent, it: Item, resize = false) {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (tool === "hand") return pan(e);
    if (tool === "vote" && !p.readOnly) {
      const has = it.votes.includes(p.userId);
      commit(it.id, { votes: has ? it.votes.filter((v) => v !== p.userId) : [...it.votes, p.userId] }, has ? "unvoted" : "voted");
      return;
    }
    let s = sel;
    if (e.shiftKey) s = sel.includes(it.id) ? sel.filter((x) => x !== it.id) : [...sel, it.id];
    else if (!sel.includes(it.id)) s = [it.id];
    setSel(s);
    if (editing && editing !== it.id) setEditing(null);
    if (p.readOnly || editing === it.id) return;
    // frames carry the items inside them
    let moving = resize ? [it] : items.filter((x) => s.includes(x.id));
    if (!resize) for (const f of moving.filter((m) => m.kind === "frame")) {
      for (const x of items) if (x.kind !== "frame" && x.x >= f.x && x.y >= f.y && x.x + x.w <= f.x + f.w && x.y + x.h <= f.y + f.h && !moving.includes(x)) moving = [...moving, x];
    }
    const st = toBoard(e);
    let moved = false;
    let last: Record<string, Partial<Item>> = {};
    const move = (ev: PointerEvent) => {
      const c = toBoard(ev);
      const dx = Math.round(c.x - st.x), dy = Math.round(c.y - st.y);
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      last = {};
      for (const m of moving) last[m.id] = resize ? { w: Math.max(40, m.w + dx), h: Math.max(24, m.h + dy) } : { x: m.x + dx, y: m.y + dy };
      setLocal(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) for (const [id, patch] of Object.entries(last)) commit(id, patch, resize ? "resized" : "moved");
      setTimeout(() => setLocal({}), 300);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function removeSel() {
    for (const id of sel) commit(id, { deleted: true } as Partial<Item>, "deleted");
    setSel([]);
  }
  function duplicateSel() {
    for (const id of sel) {
      const it = items.find((i) => i.id === id);
      if (it) create(it.kind, it.x + 24, it.y + 24, { w: it.w, h: it.h, color: it.color, text: it.text, points: it.points });
    }
  }

  const tools: { t: Tool; icon: typeof Square; label: string }[] = [
    { t: "select", icon: MousePointer2, label: "Select (drag empty space to pan)" },
    { t: "hand", icon: Hand, label: "Pan" },
    { t: "sticky", icon: StickyNote, label: "Sticky note" },
    { t: "rect", icon: Square, label: "Rectangle" },
    { t: "ellipse", icon: Circle, label: "Ellipse" },
    { t: "text", icon: Type, label: "Text" },
    { t: "frame", icon: Frame, label: "Frame / group" },
    { t: "arrow", icon: ArrowUpRight, label: "Arrow" },
    { t: "pen", icon: Pencil, label: "Pen" },
    { t: "check", icon: CheckSquare, label: "Checklist item" },
    { t: "vote", icon: ThumbsUp, label: "Dot-vote (click items)" },
  ];

  const center = () => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (r.width / 2 - view.x) / view.z - 300, y: (r.height / 2 - view.y) / view.z - 150 };
  };
  const one = sel.length === 1 ? items.find((i) => i.id === sel[0]) : undefined;

  return (
    <div className="relative h-full w-full overflow-hidden bg-dotgrid">
      <div
        ref={ref}
        className="absolute inset-0"
        style={{ cursor: tool === "hand" ? "grab" : tool === "select" ? "default" : "crosshair", touchAction: "none" }}
        onPointerDown={onBgDown}
        onPointerMove={(e) => { const b = toBoard(e); p.onCursor(b.x, b.y); }}
        onWheel={(e) => {
          const r = ref.current!.getBoundingClientRect();
          const mx = e.clientX - r.left, my = e.clientY - r.top;
          setView((v) => {
            const z = Math.min(3, Math.max(0.2, v.z * (e.deltaY < 0 ? 1.1 : 0.9)));
            return { z, x: mx - ((mx - v.x) * z) / v.z, y: my - ((my - v.y) * z) / v.z };
          });
        }}
      >
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          {items.map((raw) => {
            const it = { ...raw, ...local[raw.id] };
            const isSel = sel.includes(it.id);
            if (it.kind === "pen" || it.kind === "arrow") return <Stroke key={it.id} it={it} sel={isSel} onDown={(e) => onItemDown(e, raw)} />;
            const round = it.kind === "ellipse" ? "9999px" : it.kind === "sticky" ? "4px" : "8px";
            return (
              <div
                key={it.id}
                className="absolute font-sans"
                style={{
                  left: it.x, top: it.y, width: it.w, height: it.kind === "check" ? undefined : it.h, minHeight: it.kind === "check" ? 36 : undefined,
                  background: it.kind === "text" || it.kind === "check" ? "transparent" : it.color,
                  borderRadius: round,
                  border: it.kind === "rect" || it.kind === "ellipse" ? "2px solid #44403c" : it.kind === "frame" ? "1px solid #d6d3d1" : undefined,
                  boxShadow: it.kind === "sticky" ? "0 6px 16px -8px rgba(0,0,0,.35)" : undefined,
                  outline: isSel ? "2px solid var(--primary)" : undefined, outlineOffset: 2,
                  color: "#1c1917",
                }}
                onPointerDown={(e) => onItemDown(e, raw)}
                onDoubleClick={(e) => { e.stopPropagation(); if (!p.readOnly) setEditing(it.id); }}
              >
                {it.kind === "check" ? (
                  <label className="flex items-start gap-2 p-1 text-sm" onPointerDown={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={it.checked} disabled={p.readOnly} onChange={(e) => commit(it.id, { checked: e.target.checked }, e.target.checked ? "checked" : "unchecked")} />
                    {editing !== it.id && <span className={it.checked ? "text-stone-500 line-through" : ""}>{it.text}</span>}
                  </label>
                ) : editing !== it.id ? (
                  <div
                    className={`h-full w-full overflow-hidden whitespace-pre-wrap ${it.kind === "frame" ? "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-600" : it.kind === "text" ? "text-lg" : "grid place-items-center p-3 text-center text-sm"}`}
                  >
                    {it.text}
                  </div>
                ) : null}
                {editing === it.id && (
                  <div className={it.kind === "check" ? "absolute inset-y-0 left-7 right-0" : "absolute inset-0"}>
                    <CollabField
                      doc={p.texts.getDoc(it.id)}
                      field="text"
                      initial={raw.text}
                      autoFocus
                      className="h-full w-full resize-none bg-transparent p-2 text-sm outline-none"
                      onTyping={() => p.onTyping(it.id)}
                      onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }}
                    />
                  </div>
                )}
                {it.votes.length > 0 && (
                  <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{it.votes.length}</span>
                )}
                {isSel && sel.length === 1 && !p.readOnly && (
                  <div className="absolute -bottom-1.5 -right-1.5 size-3 cursor-se-resize rounded-sm border-2 border-primary bg-card" onPointerDown={(e) => onItemDown(e, raw, true)} />
                )}
              </div>
            );
          })}
          {draft && <Stroke it={draft} sel={false} onDown={() => {}} />}
          {Object.entries(p.cursors).map(([s, c]) =>
            s === p.mySession || c.page !== p.pageId ? null : (
              <div key={s} className="pointer-events-none absolute z-50 transition-all duration-75" style={{ left: c.x, top: c.y }}>
                <svg width="18" height="18" viewBox="0 0 24 24" style={{ color: c.color }} fill="currentColor"><path d="M3 2l18 8-8 3-3 8z" /></svg>
                <span className="ml-3 rounded px-1.5 py-0.5 text-[11px] text-primary-foreground" style={{ background: c.color }}>{c.name}</span>
              </div>
            ),
          )}
        </div>
      </div>

      {/* toolbar */}
      {!p.readOnly && (
        <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-card p-1 shadow-lift">
          {tools.map(({ t, icon: Icon, label }) => (
            <button key={t} title={label} aria-label={label} onClick={() => setTool(t)} className={`grid size-8 place-items-center rounded-lg ${tool === t ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
              <Icon className="size-4" />
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-border" />
          {COLORS.map((c) => (
            <button key={c} aria-label={`Color ${c}`} onClick={() => { setColor(c); for (const id of sel) commit(id, { color: c }, "recolored"); }} className={`size-5 rounded-full border ${color === c ? "ring-2 ring-ring ring-offset-1" : ""}`} style={{ background: c }} />
          ))}
        </div>
      )}

      {/* planning templates */}
      {!p.readOnly && (
        <div className="absolute left-3 top-3 flex flex-col gap-1 rounded-xl border bg-card p-2 shadow-lift">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Planning</p>
          <button onClick={() => { const c = center(); template("kanban", c.x, c.y); }} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-secondary"><Kanban className="size-4" /> Kanban board</button>
          <button onClick={() => { const c = center(); template("timeline", c.x, c.y); }} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-secondary"><CalendarRange className="size-4" /> Timeline</button>
          <button onClick={() => { const c = center(); template("swot", c.x, c.y); }} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-secondary"><Grid2x2 className="size-4" /> SWOT grid</button>
        </div>
      )}

      {/* selection bar */}
      {sel.length > 0 && !p.readOnly && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-card p-1 text-sm shadow-lift">
          <span className="px-2 text-muted-foreground">{sel.length} selected{one?.votes.length ? ` · ${one.votes.length} votes` : ""}</span>
          <button onClick={duplicateSel} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-secondary"><Copy className="size-4" /> Duplicate</button>
          <button onClick={removeSel} className="flex items-center gap-1 rounded-md px-2 py-1 text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /> Delete</button>
        </div>
      )}

      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border bg-card p-1 text-xs shadow-lift">
        <button className="rounded px-2 py-1 hover:bg-secondary" onClick={() => setView((v) => ({ ...v, z: Math.max(0.2, v.z * 0.8) }))}>−</button>
        <span className="w-10 text-center">{Math.round(view.z * 100)}%</span>
        <button className="rounded px-2 py-1 hover:bg-secondary" onClick={() => setView((v) => ({ ...v, z: Math.min(3, v.z * 1.25) }))}>+</button>
        <button className="rounded px-2 py-1 hover:bg-secondary" onClick={() => setView({ x: 40, y: 40, z: 1 })}>Reset</button>
      </div>
      {items.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-muted-foreground">Empty whiteboard — pick a tool above, or start from a planning template.</p>
      )}
    </div>
  );
}

function Stroke({ it, sel, onDown }: { it: Item; sel: boolean; onDown: (e: React.PointerEvent) => void }) {
  const pts = it.points;
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  for (let i = 0; i < pts.length; i += 2) { minX = Math.min(minX, pts[i]!); maxX = Math.max(maxX, pts[i]!); minY = Math.min(minY, pts[i + 1]!); maxY = Math.max(maxY, pts[i + 1]!); }
  const pad = 12;
  const d = pts.reduce((s, v, i) => s + (i % 2 === 0 ? `${i === 0 ? "M" : "L"}${v - minX + pad},` : `${v - minY + pad} `), "");
  const n = pts.length;
  const ex = (pts[n - 2] ?? 0) - minX + pad, ey = (pts[n - 1] ?? 0) - minY + pad;
  const ang = Math.atan2((pts[n - 1] ?? 0) - (pts[n - 3] ?? 0), (pts[n - 2] ?? 0) - (pts[n - 4] ?? 0));
  return (
    <svg className="absolute overflow-visible" style={{ left: it.x + minX - pad, top: it.y + minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 }}>
      <path d={d} stroke="transparent" strokeWidth={14} fill="none" style={{ pointerEvents: "stroke", cursor: "move" }} onPointerDown={onDown} />
      <path d={d} stroke={sel ? "var(--primary)" : it.kind === "pen" ? darken(it.color) : it.color} strokeWidth={it.kind === "pen" ? 3 : 2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
      {it.kind === "arrow" && n >= 4 && (
        <path d={`M${ex},${ey} L${ex - 12 * Math.cos(ang - 0.45)},${ey - 12 * Math.sin(ang - 0.45)} M${ex},${ey} L${ex - 12 * Math.cos(ang + 0.45)},${ey - 12 * Math.sin(ang + 0.45)}`} stroke={sel ? "var(--primary)" : it.color} strokeWidth={2.5} strokeLinecap="round" pointerEvents="none" />
      )}
    </svg>
  );
}
const darken = (hex: string) => (hex.startsWith("#fde") ? "#a16207" : hex.startsWith("#fec") ? "#b91c1c" : hex.startsWith("#bbf") ? "#15803d" : hex.startsWith("#bfd") ? "#1d4ed8" : hex.startsWith("#e9d") ? "#7e22ce" : hex.startsWith("#fed") ? "#c2410c" : "#44403c");
