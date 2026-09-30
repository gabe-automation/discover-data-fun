import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { maxClock, mergeProps, type Props } from "./crdt";
import type { Json } from "@/integrations/supabase/types";

export type Lease = {
  node_id: string;
  holder_id: string;
  holder_session: string;
  holder_name: string;
  holder_color: string;
  expires_at: string;
};
export type Activity = {
  id: number;
  actor_name: string;
  action: string;
  target: string;
  outcome: string;
  detail: { holder?: string; type?: string; page?: string } | null;
  created_at: string;
  node_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};
export type NodeLock = { node_id: string; mode: "move" | "full"; allowed: string[]; locked_by: string; locked_by_name: string };
export type Peer = { session: string; userId: string; name: string; color: string; status: "editing" | "watching" | "idle" };
export type Cursor = { x: number; y: number; name: string; color: string; t: number; page?: string };
export type Me = { id: string; name: string; color: string };

const LEASE_TTL = 15;

export function useRoom(projectId: string, me: Me | null) {
  const [session, setSession] = useState("");
  const [nodes, setNodes] = useState<Record<string, Props>>({});
  const [leases, setLeases] = useState<Record<string, Lease>>({});
  const [locks, setLocks] = useState<Record<string, NodeLock>>({});
  const [activity, setActivity] = useState<Activity[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [drags, setDrags] = useState<Record<string, { bp: string; x: number; y: number; w: number; h: number }>>({});
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const clock = useRef(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const statusRef = useRef<Peer["status"]>("watching");

  useEffect(() => {
    setSession(crypto.randomUUID());
    const t = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(t);
  }, []);

  const actor = me && session ? `${me.id.slice(0, 8)}:${session.slice(0, 6)}` : "";

  const ingestNode = useCallback((id: string, p: Props) => {
    clock.current = Math.max(clock.current, maxClock(p));
    setNodes((prev) => ({ ...prev, [id]: mergeProps(prev[id] ?? {}, p) }));
  }, []);

  // initial snapshot + realtime subscription
  useEffect(() => {
    if (!me || !session) return;
    let cancelled = false;
    (async () => {
      const [n, l, a, nl] = await Promise.all([
        supabase.from("nodes").select("id, props").eq("project_id", projectId),
        supabase.from("leases").select("*").eq("project_id", projectId),
        supabase.from("activity").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(60),
        supabase.from("node_locks").select("*").eq("project_id", projectId),
      ]);
      if (cancelled) return;
      const map: Record<string, Props> = {};
      for (const row of n.data ?? []) {
        const p = row.props as unknown as Props;
        map[row.id] = p;
        clock.current = Math.max(clock.current, maxClock(p));
      }
      setNodes(map);
      const lm: Record<string, Lease> = {};
      for (const row of l.data ?? []) lm[row.node_id] = row as Lease;
      setLeases(lm);
      const lk: Record<string, NodeLock> = {};
      for (const row of nl.data ?? []) lk[row.node_id] = row as NodeLock;
      setLocks(lk);
      setActivity((a.data ?? []) as unknown as Activity[]);
      setLoaded(true);
    })();

    const ch = supabase.channel(`room:${projectId}`, { config: { presence: { key: session } } });
    ch.on("postgres_changes", { event: "*", schema: "public", table: "nodes", filter: `project_id=eq.${projectId}` }, (payload) => {
      const row = payload.new as { id?: string; props?: Props };
      if (row?.id && row.props) ingestNode(row.id, row.props);
    })
      .on("postgres_changes", { event: "*", schema: "public", table: "leases" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as Partial<Lease> & { project_id?: string };
          if (old.node_id) setLeases((p) => { const c = { ...p }; delete c[old.node_id!]; return c; });
          return;
        }
        const row = payload.new as Lease & { project_id: string };
        if (row.project_id !== projectId) return;
        setLeases((p) => ({ ...p, [row.node_id]: row }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "node_locks", filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as Partial<NodeLock>;
          if (old.node_id) setLocks((p) => { const c = { ...p }; delete c[old.node_id!]; return c; });
          return;
        }
        const row = payload.new as NodeLock;
        setLocks((p) => ({ ...p, [row.node_id]: row }));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity", filter: `project_id=eq.${projectId}` }, (payload) => {
        setActivity((p) => [payload.new as Activity, ...p].slice(0, 100));
      })
      .on("broadcast", { event: "cursor" }, ({ payload }) => {
        const c = payload as Cursor & { session: string };
        setCursors((p) => ({ ...p, [c.session]: { ...c, t: Date.now() } }));
      })
      .on("broadcast", { event: "drag" }, ({ payload }) => {
        const d = payload as { id: string; bp: string; x: number; y: number; w: number; h: number; done?: boolean | undefined };
        setDrags((p) => {
          const c = { ...p };
          if (d.done) delete c[d.id];
          else c[d.id] = d;
          return c;
        });
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState<Peer>();
        const list: Peer[] = [];
        for (const metas of Object.values(state)) if (metas[0]) list.push(metas[0]);
        setPeers(list);
        const alive = new Set(list.map((x) => x.session));
        setCursors((p) => Object.fromEntries(Object.entries(p).filter(([k]) => alive.has(k))));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ session, userId: me.id, name: me.name, color: me.color, status: statusRef.current });
        }
      });
    channelRef.current = ch;
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [projectId, me, session, ingestNode]);

  const setStatus = useCallback(
    (s: Peer["status"]) => {
      if (statusRef.current === s || !me) return;
      statusRef.current = s;
      channelRef.current?.track({ session, userId: me.id, name: me.name, color: me.color, status: s });
    },
    [me, session],
  );

  const lastCursor = useRef(0);
  const sendCursor = useCallback(
    (x: number, y: number, page?: string) => {
      const t = Date.now();
      if (t - lastCursor.current < 50 || !me) return;
      lastCursor.current = t;
      channelRef.current?.send({ type: "broadcast", event: "cursor", payload: { session, x, y, page, name: me.name, color: me.color } });
    },
    [me, session],
  );

  const lastDrag = useRef(0);
  const sendDrag = useCallback((d: { id: string; bp: string; x: number; y: number; w: number; h: number; done?: boolean | undefined }) => {
    const t = Date.now();
    if (!d.done && t - lastDrag.current < 40) return;
    lastDrag.current = t;
    channelRef.current?.send({ type: "broadcast", event: "drag", payload: d });
  }, []);

  const refetchNode = useCallback(async (id: string) => {
    const { data } = await supabase.from("nodes").select("props").eq("id", id).maybeSingle();
    setNodes((prev) => {
      const c = { ...prev };
      if (data) c[id] = data.props as unknown as Props;
      else delete c[id];
      return c;
    });
  }, []);

  const op = useCallback(
    async (nodeId: string, values: Record<string, unknown>, action: string, label: string) => {
      if (!actor) return "not-ready";
      clock.current += 1;
      const c = clock.current;
      const regs: Props = {};
      for (const [k, v] of Object.entries(values)) regs[k] = { v, c, a: actor };
      setNodes((prev) => ({ ...prev, [nodeId]: mergeProps(prev[nodeId] ?? {}, regs) }));
      const { data, error } = await supabase.rpc("apply_node_op", {
        _op_id: crypto.randomUUID(),
        _project: projectId,
        _node: nodeId,
        _session: session,
        _clock: c,
        _actor: actor,
        _props: values as Json,
        _action: action,
        _label: label,
      });
      if (error || data === "blocked" || data === "forbidden" || data === "locked") {
        await refetchNode(nodeId);
        if (data === "locked") toast.warning(`${label} is locked — ask the person who locked it or the owner.`);
        else if (data === "blocked") toast.warning(`${label} is being edited by someone else — your change was blocked.`);
        else if (data === "forbidden") toast.error("You have view-only access to this project.");
        else if (error) toast.error("Couldn't save that change.");
      }
      return data ?? "error";
    },
    [actor, projectId, session, refetchNode],
  );

  const acquire = useCallback(
    async (nodeId: string, label: string, heartbeat = false) => {
      if (!session) return false;
      const { data } = await supabase.rpc("acquire_lease", {
        _project: projectId, _node: nodeId, _session: session, _ttl: LEASE_TTL, _label: label, _heartbeat: heartbeat,
      });
      return !!data;
    },
    [projectId, session],
  );

  const release = useCallback(
    async (nodeId: string, label: string) => {
      if (!session) return;
      await supabase.rpc("release_lease", { _project: projectId, _node: nodeId, _session: session, _label: label });
    },
    [projectId, session],
  );

  const setLock = useCallback(
    async (nodeId: string, mode: NodeLock["mode"] | null, allowed: string[], label: string) => {
      const { data, error } = await supabase.rpc("set_node_lock", { _project: projectId, _node: nodeId, _mode: mode as string, _allowed: allowed, _label: label });
      if (error || data !== "ok") { toast.error("Only the person who locked it or the owner can change this lock."); return false; }
      if (mode === null) setLocks((p) => { const c = { ...p }; delete c[nodeId]; return c; });
      return true;
    },
    [projectId],
  );

  const activeLeases: Record<string, Lease> = {};
  for (const [k, l] of Object.entries(leases)) if (new Date(l.expires_at).getTime() > now) activeLeases[k] = l;
  const liveCursors = Object.fromEntries(Object.entries(cursors).filter(([, c]) => now - c.t < 8000));

  return {
    session, loaded, nodes, leases: activeLeases, locks, setLock, activity, peers, cursors: liveCursors, drags,
    op, acquire, release, sendCursor, sendDrag, setStatus,
  };
}
