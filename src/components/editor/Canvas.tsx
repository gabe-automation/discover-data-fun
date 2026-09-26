import { useRef, useState, type ReactNode } from "react";
import { BLOCK_CSS, BREAKPOINTS, blockHtml, themeVars, type BlockType, type Breakpoint, type Theme } from "@/lib/blocks";
import { pageHeight, type Geo, type NodeView } from "@/lib/model";
import type { Caret, Cursor, Lease } from "@/lib/useRoom";

type Props = {
  nodes: NodeView[];
  bp: Breakpoint;
  theme: Theme;
  scale: number;
  selected: string[];
  mySession: string;
  leases: Record<string, Lease>;
  cursors: Record<string, Cursor>;
  carets: Record<string, Caret>;
  drags: Record<string, { bp: string } & Geo>;
  readOnly: boolean;
  grid: number;
  showGrid: boolean;
  editing: string | null;
  inlineEditor: ReactNode;
  onSelect: (ids: string[]) => void;
  onEdit: (id: string) => void;
  onCommit: (items: { id: string; g: Geo }[], kind: "moved" | "resized") => void;
  onLiveDrag: (id: string, g: Geo, done?: boolean) => void;
  onCursor: (x: number, y: number) => void;
  onDropBlock: (type: BlockType, x: number, y: number) => void;
};

const SNAP = 6;

export function Canvas(p: Props) {
  const pageW = BREAKPOINTS[p.bp].width;
  const pageH = pageHeight(p.nodes, p.bp);
  const pageRef = useRef<HTMLDivElement>(null);
  const [local, setLocal] = useState<Record<string, Geo> | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const toPage = (e: { clientX: number; clientY: number }) => {
    const r = pageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / p.scale, y: (e.clientY - r.top) / p.scale };
  };
  const lockedByOther = (id: string) => {
    const l = p.leases[id];
    return !!l && l.holder_session !== p.mySession;
  };

  function snap(ids: Set<string>, g: Geo, resizing: boolean): { g: Geo; gx: number[]; gy: number[] } {
    const out = { ...g };
    const gx: number[] = [];
    const gy: number[] = [];
    if (p.grid > 0) {
      const r = (v: number) => Math.round(v / p.grid) * p.grid;
      if (resizing) { out.w = r(g.x + g.w) - g.x; out.h = r(g.y + g.h) - g.y; }
      else { out.x = r(g.x); out.y = r(g.y); }
    } else {
      const xs: number[] = [0, pageW, pageW / 2];
      const ys: number[] = [0];
      for (const n of p.nodes) {
        if (ids.has(n.id)) continue;
        const o = n.geo[p.bp];
        xs.push(o.x, o.x + o.w, o.x + o.w / 2);
        ys.push(o.y, o.y + o.h, o.y + o.h / 2);
      }
      const tryAxis = (edges: number[], targets: number[], apply: (d: number) => void, hits: number[]) => {
        let best: { d: number; t: number } | null = null;
        for (const e of edges) for (const t of targets) {
          const d = t - e;
          if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t };
        }
        if (best) { apply(best.d); hits.push(best.t); }
      };
      if (resizing) {
        tryAxis([g.x + g.w], xs, (d) => (out.w += d), gx);
        tryAxis([g.y + g.h], ys, (d) => (out.h += d), gy);
      } else {
        tryAxis([g.x, g.x + g.w, g.x + g.w / 2], xs, (d) => (out.x += d), gx);
        tryAxis([g.y, g.y + g.h, g.y + g.h / 2], ys, (d) => (out.y += d), gy);
      }
    }
    out.x = Math.round(out.x); out.y = Math.max(0, Math.round(out.y));
    out.w = Math.max(24, Math.round(out.w)); out.h = Math.max(16, Math.round(out.h));
    return { g: out, gx, gy };
  }

  function startDrag(e: React.PointerEvent, n: NodeView, resizing: boolean) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (p.editing === n.id) return;
    let sel = p.selected;
    if (e.shiftKey) {
      sel = sel.includes(n.id) ? sel.filter((x) => x !== n.id) : [...sel, n.id];
      p.onSelect(sel);
      return;
    }
    if (!sel.includes(n.id)) { sel = [n.id]; p.onSelect(sel); }
    if (p.readOnly || n.pinned || lockedByOther(n.id)) return;
    const moving = resizing ? [n] : p.nodes.filter((x) => sel.includes(x.id) && !x.pinned && !lockedByOther(x.id));
    const ids = new Set(moving.map((x) => x.id));
    const start = toPage(e);
    const orig = Object.fromEntries(moving.map((x) => [x.id, x.geo[p.bp]]));
    const o = n.geo[p.bp];
    let last: Record<string, Geo> = orig;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const cur = toPage(ev);
      const dx = cur.x - start.x, dy = cur.y - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      const raw = resizing ? { ...o, w: o.w + dx, h: o.h + dy } : { ...o, x: o.x + dx, y: o.y + dy };
      const s = ev.altKey ? { g: { ...raw, x: Math.round(raw.x), y: Math.round(raw.y), w: Math.round(raw.w), h: Math.round(raw.h) }, gx: [], gy: [] } : snap(ids, raw, resizing);
      const ddx = s.g.x - o.x, ddy = s.g.y - o.y;
      const next: Record<string, Geo> = {};
      for (const m of moving) {
        const g0 = orig[m.id]!;
        next[m.id] = m.id === n.id ? s.g : { ...g0, x: g0.x + ddx, y: Math.max(0, g0.y + ddy) };
        p.onLiveDrag(m.id, next[m.id]!);
      }
      last = next;
      setLocal(next);
      setGuides({ x: s.gx, y: s.gy });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGuides({ x: [], y: [] });
      if (moved) {
        for (const [id, g] of Object.entries(last)) p.onLiveDrag(id, g, true);
        p.onCommit(Object.entries(last).map(([id, g]) => ({ id, g })), resizing ? "resized" : "moved");
      }
      setLocal(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startMarquee(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const s = toPage(e);
    let moved = false;
    let rect = { x: s.x, y: s.y, w: 0, h: 0 };
    const move = (ev: PointerEvent) => {
      const c = toPage(ev);
      rect = { x: Math.min(s.x, c.x), y: Math.min(s.y, c.y), w: Math.abs(c.x - s.x), h: Math.abs(c.y - s.y) };
      if (rect.w + rect.h > 4) { moved = true; setMarquee(rect); }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMarquee(null);
      if (!moved) { p.onSelect([]); return; }
      const hit = p.nodes.filter((n) => {
        const g = n.geo[p.bp];
        return g.x < rect.x + rect.w && g.x + g.w > rect.x && g.y < rect.y + rect.h && g.y + g.h > rect.y;
      }).map((n) => n.id);
      p.onSelect(e.shiftKey ? Array.from(new Set([...p.selected, ...hit])) : hit);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const sorted = [...p.nodes].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  const typing: Record<string, Caret[]> = {};
  for (const c of Object.values(p.carets)) (typing[c.nodeId] ??= []).push(c);

  return (
    <div className="relative mx-auto origin-top-left" style={{ width: pageW * p.scale, height: pageH * p.scale }}>
      <style>{BLOCK_CSS}</style>
      <div
        ref={pageRef}
        className="wc-page absolute left-0 top-0 origin-top-left shadow-lift"
        style={{
          width: pageW, height: pageH, transform: `scale(${p.scale})`, ...cssVars(p.theme),
          backgroundImage: p.showGrid && p.grid > 0 ? `linear-gradient(to right, rgba(0,0,0,.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.06) 1px, transparent 1px)` : undefined,
          backgroundSize: p.showGrid && p.grid > 0 ? `${p.grid}px ${p.grid}px` : undefined,
        }}
        onPointerDown={startMarquee}
        onPointerMove={(e) => { const c = toPage(e); p.onCursor(c.x, c.y); }}
        onDragOver={(e) => { if (!p.readOnly) e.preventDefault(); }}
        onDrop={(e) => {
          const t = e.dataTransfer.getData("application/x-webcraft-block") as BlockType;
          if (!t) return;
          const c = toPage(e);
          p.onDropBlock(t, c.x, c.y);
        }}
      >
        {sorted.map((n, i) => {
          const remote = p.drags[n.id];
          const g = local?.[n.id] ?? (remote && remote.bp === p.bp ? remote : n.geo[p.bp]);
          const lease = p.leases[n.id];
          const other = lockedByOther(n.id);
          const isSel = p.selected.includes(n.id);
          const who = typing[n.id];
          return (
            <div
              key={n.id}
              className="wc-el group"
              style={{
                left: g.x, top: g.y, width: g.w, height: g.h, zIndex: i + 1,
                overflow: "visible",
                cursor: p.readOnly ? "default" : other ? "not-allowed" : n.pinned ? "pointer" : "move",
                outline: isSel ? "2px solid var(--primary)" : other ? `2px dashed ${lease!.holder_color}` : undefined,
                outlineOffset: 2,
                transition: remote ? "left 60ms linear, top 60ms linear" : undefined,
              }}
              onPointerDown={(e) => startDrag(e, n, false)}
              onDoubleClick={(e) => { e.stopPropagation(); if (!p.readOnly) p.onEdit(n.id); }}
            >
              {remote && remote.bp === p.bp && (
                <div className="pointer-events-none absolute border-2 border-dashed opacity-50" style={{ left: n.geo[p.bp].x - g.x, top: n.geo[p.bp].y - g.y, width: n.geo[p.bp].w, height: n.geo[p.bp].h, borderColor: "var(--ring)" }} />
              )}
              <div
                className="pointer-events-none h-full w-full overflow-hidden group-hover:outline group-hover:outline-1 group-hover:outline-[var(--ring)]"
                dangerouslySetInnerHTML={{ __html: blockHtml(n.type, n, n.id) }}
              />
              {p.editing === n.id && <div className="absolute inset-0 z-20">{p.inlineEditor}</div>}
              {lease && (
                <span
                  className="absolute -top-3 right-1 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[10px] font-medium text-primary-foreground"
                  style={{ background: lease.holder_color }}
                >
                  🔒 {other ? lease.holder_name : "You"}
                </span>
              )}
              {n.pinned && <span className="absolute -top-3 left-1 z-10 rounded-full bg-secondary px-1.5 py-0.5 font-sans text-[10px]">📌</span>}
              {who && (
                <div className="absolute -bottom-3 left-1 z-10 flex gap-1">
                  {who.map((c) => (
                    <span key={c.session} className="rounded-full px-2 py-0.5 font-sans text-[10px] text-primary-foreground" style={{ background: c.color }}>✎ {c.name} typing</span>
                  ))}
                </div>
              )}
              {isSel && p.selected.length === 1 && !p.readOnly && !other && !n.pinned && (
                <div
                  className="absolute -bottom-1.5 -right-1.5 z-10 size-3 cursor-se-resize rounded-sm border-2 border-primary bg-card"
                  onPointerDown={(e) => startDrag(e, n, true)}
                />
              )}
            </div>
          );
        })}
        {marquee && (
          <div className="pointer-events-none absolute z-[9997] border border-primary bg-primary/10" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />
        )}
        {guides.x.map((x, i) => (
          <div key={`gx${i}`} className="pointer-events-none absolute top-0 z-[9998] w-px bg-guide" style={{ left: x, height: pageH }} />
        ))}
        {guides.y.map((y, i) => (
          <div key={`gy${i}`} className="pointer-events-none absolute left-0 z-[9998] h-px bg-guide" style={{ top: y, width: pageW }} />
        ))}
        {Object.entries(p.cursors).map(([s, c]) =>
          s === p.mySession ? null : (
            <div key={s} className="pointer-events-none absolute z-[9999] transition-all duration-75" style={{ left: c.x, top: c.y }}>
              <svg width="18" height="18" viewBox="0 0 24 24" style={{ color: c.color }} fill="currentColor"><path d="M3 2l18 8-8 3-3 8z" /></svg>
              <span className="ml-3 rounded px-1.5 py-0.5 font-sans text-[11px] text-primary-foreground" style={{ background: c.color }}>{c.name}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function cssVars(t: Theme): React.CSSProperties {
  const o: Record<string, string> = {};
  for (const part of themeVars(t).split(";")) {
    const [k, v] = part.split(":");
    if (k && v) o[k] = v;
  }
  return o as React.CSSProperties;
}
