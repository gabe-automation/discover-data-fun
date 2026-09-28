import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WORKFLOWS, type DragPrefs } from "@/lib/dragPrefs";

export function DragSettings({ prefs, onChange }: { prefs: DragPrefs; onChange: (p: Partial<DragPrefs>) => void }) {
  const active = WORKFLOWS.find((w) => JSON.stringify(w.prefs) === JSON.stringify(prefs));
  const seg = <K extends keyof DragPrefs>(k: K, opts: [DragPrefs[K], string][]) => (
    <div className="flex rounded-md border p-0.5">
      {opts.map(([v, l]) => (
        <button key={String(v)} onClick={() => onChange({ [k]: v } as Partial<DragPrefs>)}
          className={`flex-1 rounded px-2 py-1 text-xs ${prefs[k] === v ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>{l}</button>
      ))}
    </div>
  );
  const check = (k: "guides" | "frameCarry" | "lockOnSelect", label: string) => (
    <label className="flex items-center justify-between text-xs">{label}
      <input type="checkbox" checked={prefs[k]} onChange={(e) => onChange({ [k]: e.target.checked })} className="size-4 accent-[var(--primary)]" />
    </label>
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" title="Drag & drop settings"><SlidersHorizontal className="size-4" /> {active?.name ?? "Custom"}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-4" align="end">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Workflow preset</p>
          <div className="grid grid-cols-2 gap-1.5">
            {WORKFLOWS.map((w) => (
              <button key={w.id} onClick={() => onChange(w.prefs)} title={w.hint}
                className={`rounded-md border px-2 py-1.5 text-left text-xs ${active?.id === w.id ? "border-primary bg-secondary" : "hover:bg-secondary"}`}>
                <span className="block font-medium">{w.name}</span>
                <span className="block text-[10px] leading-tight text-muted-foreground">{w.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium">Snap to grid</p>
          {seg("grid", [[0, "Off"], [8, "8"], [16, "16"], [24, "24"], [48, "48"]])}
          <p className="text-xs font-medium">Drag direction</p>
          {seg("axis", [["free", "Any"], ["x", "Left/right"], ["y", "Up/down"]])}
          <p className="text-xs font-medium">New blocks land</p>
          {seg("drop", [["cursor", "Where dropped"], ["stack", "Below last"], ["center", "Centered"]])}
          <p className="text-xs font-medium">Arrow-key step</p>
          {seg("nudge", [[1, "1"], [8, "8"], [16, "16"], [24, "24"]])}
        </div>
        <div className="space-y-2 border-t pt-3">
          {check("guides", "Snap to other elements")}
          {check("frameCarry", "Frames carry their contents")}
          {check("lockOnSelect", "Hold selected item while I edit")}
        </div>
        <p className="text-[11px] text-muted-foreground">Saved for you on this project. Hold Alt while dragging to ignore snapping.</p>
      </PopoverContent>
    </Popover>
  );
}
