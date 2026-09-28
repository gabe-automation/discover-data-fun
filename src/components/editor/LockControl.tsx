import { useState } from "react";
import { Lock, Pin, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NodeLock } from "@/lib/useRoom";

type Member = { id: string; name: string; color: string };

export function LockControl(props: {
  lock: NodeLock | undefined;
  myId: string;
  isOwner: boolean;
  readOnly: boolean;
  members: Member[];
  onSet: (mode: NodeLock["mode"] | null, allowed: string[]) => Promise<boolean>;
}) {
  const { lock } = props;
  const [allowed, setAllowed] = useState<string[]>(lock?.allowed ?? []);
  const manage = !props.readOnly && (!lock || lock.locked_by === props.myId || props.isOwner);
  const others = props.members.filter((m) => m.id !== (lock?.locked_by ?? props.myId));
  const toggle = (id: string) => {
    const n = allowed.includes(id) ? allowed.filter((x) => x !== id) : [...allowed, id];
    setAllowed(n);
    if (lock) props.onSet(lock.mode, n);
  };
  return (
    <section className="mb-4 mt-1 space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lock</h3>
        {lock && <span className="text-[11px] text-muted-foreground">{lock.mode === "move" ? "Pinned" : "Locked"} by {lock.locked_by_name}</span>}
      </div>
      <div className="grid grid-cols-3 gap-1">
        <Button size="sm" variant={!lock ? "secondary" : "ghost"} disabled={!manage} onClick={() => props.onSet(null, [])}><Unlock className="size-3.5" /> Open</Button>
        <Button size="sm" variant={lock?.mode === "move" ? "secondary" : "ghost"} disabled={!manage} title="Nobody else can move, resize or delete it — text and style stay editable" onClick={() => props.onSet("move", allowed)}><Pin className="size-3.5" /> Pin</Button>
        <Button size="sm" variant={lock?.mode === "full" ? "secondary" : "ghost"} disabled={!manage} title="Nobody else can change it at all" onClick={() => props.onSet("full", allowed)}><Lock className="size-3.5" /> Lock</Button>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        <strong>Pin</strong> stops others moving or resizing it. <strong>Lock</strong> stops all changes. The project owner can always edit.
      </p>
      {manage && others.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium">Still allowed to change it:</p>
          {others.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={allowed.includes(m.id)} onChange={() => toggle(m.id)} className="accent-[var(--primary)]" />
              <span className="size-2 rounded-full" style={{ background: m.color }} /> {m.name}
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
