import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { supabase } from "@/integrations/supabase/client";

// Character-level text CRDT (Yjs). One Y.Doc per block; each field is a Y.Text.
// Updates are persisted append-only in text_updates and streamed via realtime.
const b64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]!);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const REMOTE = "remote";

export type TextStore = ReturnType<typeof useTexts>;

export function useTexts(projectId: string, canEdit: boolean, ready: boolean) {
  const docs = useRef(new Map<string, Y.Doc>());
  const pending = useRef(new Map<string, Uint8Array[]>());
  const [version, setVersion] = useState(0);
  const bumpT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bump = useCallback(() => {
    if (bumpT.current) return;
    bumpT.current = setTimeout(() => { bumpT.current = null; setVersion((v) => v + 1); }, 120);
  }, []);

  const getDoc = useCallback((id: string) => {
    let d = docs.current.get(id);
    if (!d) {
      d = new Y.Doc();
      d.on("update", (u: Uint8Array, origin: unknown) => {
        if (origin !== REMOTE) {
          const l = pending.current.get(id) ?? [];
          l.push(u);
          pending.current.set(id, l);
        }
        bump();
      });
      docs.current.set(id, d);
    }
    return d;
  }, [bump]);

  // flush local updates
  useEffect(() => {
    if (!canEdit) return;
    const t = setInterval(() => {
      const rows: { project_id: string; node_id: string; update: string }[] = [];
      for (const [id, list] of pending.current) {
        if (list.length) rows.push({ project_id: projectId, node_id: id, update: b64(Y.mergeUpdates(list)) });
      }
      pending.current.clear();
      if (rows.length) supabase.from("text_updates").insert(rows).then(({ error }) => error && console.error(error));
    }, 200);
    return () => clearInterval(t);
  }, [projectId, canEdit]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("text_updates").select("id, node_id, update").eq("project_id", projectId).order("id").limit(5000);
      if (cancelled || !data) return;
      const stats = new Map<string, { n: number; max: number }>();
      for (const r of data) {
        Y.applyUpdate(getDoc(r.node_id), unb64(r.update), REMOTE);
        const s = stats.get(r.node_id) ?? { n: 0, max: 0 };
        s.n++; s.max = Math.max(s.max, r.id);
        stats.set(r.node_id, s);
      }
      // compaction: fold long histories into one snapshot
      if (canEdit) {
        for (const [id, s] of stats) {
          if (s.n < 40) continue;
          const snap = b64(Y.encodeStateAsUpdate(getDoc(id)));
          const { error } = await supabase.from("text_updates").insert({ project_id: projectId, node_id: id, update: snap });
          if (!error) await supabase.from("text_updates").delete().eq("node_id", id).eq("project_id", projectId).lte("id", s.max);
        }
      }
      bump();
    })();
    const ch = supabase
      .channel(`text:${projectId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "text_updates", filter: `project_id=eq.${projectId}` }, (p) => {
        const r = p.new as { node_id: string; update: string };
        Y.applyUpdate(getDoc(r.node_id), unb64(r.update), REMOTE);
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [projectId, ready, canEdit, getDoc, bump]);

  const plain = useCallback((id: string, field: string): string | undefined => {
    const d = docs.current.get(id);
    if (!d || !d.getMap("meta").get(field)) return undefined;
    return d.getText(field).toString();
  }, []);

  return { getDoc, plain, version };
}
