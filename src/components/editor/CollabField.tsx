import { useEffect, useRef } from "react";
import * as Y from "yjs";

type Props = {
  doc: Y.Doc;
  field: string;
  initial: string;
  disabled?: boolean;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  onTyping?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

/** Textarea bound to a Y.Text: concurrent typers merge character by character. */
export function CollabField(p: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const yt = p.doc.getText(p.field);
    const meta = p.doc.getMap("meta");
    if (!meta.get(p.field) && !p.disabled) {
      p.doc.transact(() => {
        if (yt.length === 0 && p.initial) yt.insert(0, p.initial);
        meta.set(p.field, true);
      });
    }
    el.value = meta.get(p.field) ? yt.toString() : p.initial;
    const obs = (e: Y.YTextEvent, tr: Y.Transaction) => {
      if (tr.local) return;
      let s = el.selectionStart, en = el.selectionEnd, idx = 0;
      for (const d of e.delta) {
        if (d.retain) idx += d.retain;
        else if (typeof d.insert === "string") {
          const n = d.insert.length;
          if (idx < s) s += n;
          if (idx < en) en += n;
          idx += n;
        } else if (d.delete) {
          const n = d.delete;
          if (idx < s) s = Math.max(idx, s - n);
          if (idx < en) en = Math.max(idx, en - n);
        }
      }
      el.value = yt.toString();
      if (document.activeElement === el) el.setSelectionRange(s, en);
    };
    yt.observe(obs);
    return () => yt.unobserve(obs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.doc, p.field]);

  function onInput() {
    const el = ref.current!;
    const yt = p.doc.getText(p.field);
    const nv = el.value, ov = yt.toString();
    let a = 0;
    while (a < nv.length && a < ov.length && nv[a] === ov[a]) a++;
    let b = 0;
    while (b < nv.length - a && b < ov.length - a && nv[nv.length - 1 - b] === ov[ov.length - 1 - b]) b++;
    p.doc.transact(() => {
      if (ov.length - a - b > 0) yt.delete(a, ov.length - a - b);
      if (nv.length - a - b > 0) yt.insert(a, nv.slice(a, nv.length - b));
      p.doc.getMap("meta").set(p.field, true);
    });
    p.onTyping?.();
  }

  return (
    <textarea
      ref={ref}
      rows={p.rows ?? 3}
      autoFocus={p.autoFocus}
      disabled={p.disabled}
      placeholder={p.placeholder}
      className={p.className ?? "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"}
      style={p.style}
      onInput={onInput}
      onBlur={p.onBlur}
      onKeyDown={p.onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
