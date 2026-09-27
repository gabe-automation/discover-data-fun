import { useLayoutEffect, useRef } from "react";
import * as Y from "yjs";
import type { SharedText } from "@/lib/sharedText";
import { cn } from "@/lib/utils";

// Textarea bound to a shared Y.Text; keeps your caret stable while others type.
export function CollabTextarea(props: {
  shared: SharedText;
  k: string;
  seed: string;
  disabled?: boolean;
  rows?: number;
  className?: string;
  onCommit?: ((v: string) => void) | undefined;
}) {
  const { shared, k, seed } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  const rel = useRef<{ s: Y.RelativePosition; e: Y.RelativePosition } | null>(null);
  const value = shared.has(k) ? shared.get(k) : seed;
  void shared.ver;

  const remember = () => {
    const el = ref.current;
    if (!el || !shared.has(k)) return;
    const t = shared.doc.getText(k);
    rel.current = {
      s: Y.createRelativePositionFromTypeIndex(t, el.selectionStart),
      e: Y.createRelativePositionFromTypeIndex(t, el.selectionEnd),
    };
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement !== el || !rel.current) return;
    const s = Y.createAbsolutePositionFromRelativePosition(rel.current.s, shared.doc);
    const e = Y.createAbsolutePositionFromRelativePosition(rel.current.e, shared.doc);
    if (s && e) el.setSelectionRange(s.index, e.index);
  }, [value, shared.doc]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={props.rows ?? 3}
      disabled={props.disabled}
      onSelect={remember}
      onKeyUp={remember}
      onChange={(e) => {
        shared.set(k, e.target.value, seed);
        remember();
      }}
      onBlur={(e) => props.onCommit?.(e.target.value)}
      className={cn(
        "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        props.className,
      )}
    />
  );
}
