// Google-Docs-style text co-editing: every text field is a Yjs Y.Text (sequence CRDT).
// Updates are persisted as rows in text_updates and fanned out through realtime.
import { useCallback, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { supabase } from "@/integrations/supabase/client";

const toB64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]!);
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function useSharedText(projectId: string, canEdit: boolean) {
  const doc = useMemo(() => new Y.Doc(), [projectId]);
  const [ver, setVer] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const bump = () => setVer((v) => v + 1);
    const onUpdate = (u: Uint8Array, origin: unknown) => {
      bump();
      if (origin === "local") {
        supabase.from("text_updates").insert({ project_id: projectId, node_id: projectId, update: toB64(u) }).then(({ error }) => {
          if (error) console.error("text sync failed", error.message);
        });
      }
    };
    doc.on("update", onUpdate);
    (async () => {
      const { data } = await supabase.from("text_updates").select("id, update").eq("project_id", projectId).order("id").limit(5000);
      if (cancelled || !data) return;
      for (const r of data) Y.applyUpdate(doc, fromB64(r.update), "remote");
      // compaction: fold history into one snapshot row
      if (canEdit && data.length > 300) {
        const lastId = data[data.length - 1]!.id;
        const snap = toB64(Y.encodeStateAsUpdate(doc));
        const { error } = await supabase.from("text_updates").insert({ project_id: projectId, node_id: projectId, update: snap });
        if (!error) await supabase.from("text_updates").delete().eq("project_id", projectId).lte("id", lastId);
      }
    })();
    const ch = supabase
      .channel(`text:${projectId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "text_updates", filter: `project_id=eq.${projectId}` }, (p) => {
        const row = p.new as { update: string };
        Y.applyUpdate(doc, fromB64(row.update), "remote");
      })
      .subscribe();
    return () => {
      cancelled = true;
      doc.off("update", onUpdate);
      supabase.removeChannel(ch);
    };
  }, [doc, projectId, canEdit]);

  const has = useCallback((key: string) => doc.getMap("meta").has(key), [doc]);
  const get = useCallback((key: string) => doc.getText(key).toString(), [doc]);

  /** Apply a textarea edit as a minimal insert/delete so concurrent typing merges. */
  const set = useCallback(
    (key: string, next: string, seed: string) => {
      const t = doc.getText(key);
      const meta = doc.getMap("meta");
      doc.transact(() => {
        if (!meta.has(key)) {
          meta.set(key, true);
          if (t.length === 0 && seed) t.insert(0, seed);
        }
        const cur = t.toString();
        if (cur === next) return;
        let a = 0;
        while (a < cur.length && a < next.length && cur[a] === next[a]) a++;
        let b = 0;
        while (b < cur.length - a && b < next.length - a && cur[cur.length - 1 - b] === next[next.length - 1 - b]) b++;
        const del = cur.length - a - b;
        if (del > 0) t.delete(a, del);
        const ins = next.slice(a, next.length - b);
        if (ins) t.insert(a, ins);
      }, "local");
    },
    [doc],
  );

  return { doc, ver, has, get, set };
}
export type SharedText = ReturnType<typeof useSharedText>;
