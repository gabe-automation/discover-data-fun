CREATE TABLE public.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'canvas' CHECK (kind IN ('canvas','whiteboard')),
  title text NOT NULL DEFAULT 'Untitled page',
  sort text NOT NULL DEFAULT 'm',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pages TO authenticated;
GRANT ALL ON public.pages TO service_role;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read pages" ON public.pages FOR SELECT TO authenticated USING (public.is_member(project_id, auth.uid()));
CREATE POLICY "editors add pages" ON public.pages FOR INSERT TO authenticated WITH CHECK (public.can_edit(project_id, auth.uid()));
CREATE POLICY "editors update pages" ON public.pages FOR UPDATE TO authenticated USING (public.can_edit(project_id, auth.uid()));
CREATE POLICY "editors delete pages" ON public.pages FOR DELETE TO authenticated USING (public.can_edit(project_id, auth.uid()));

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL,
  mentions uuid[] NOT NULL DEFAULT '{}',
  activity_id bigint REFERENCES public.activity(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read messages" ON public.messages FOR SELECT TO authenticated USING (public.is_member(project_id, auth.uid()));
CREATE POLICY "members send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_member(project_id, auth.uid()));
CREATE POLICY "delete own messages" ON public.messages FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.text_updates (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  node_id uuid NOT NULL,
  update text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX text_updates_project_idx ON public.text_updates(project_id, id);
GRANT SELECT, INSERT, DELETE ON public.text_updates TO authenticated;
GRANT USAGE ON SEQUENCE public.text_updates_id_seq TO authenticated;
GRANT ALL ON public.text_updates TO service_role;
ALTER TABLE public.text_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read text" ON public.text_updates FOR SELECT TO authenticated USING (public.is_member(project_id, auth.uid()));
CREATE POLICY "editors write text" ON public.text_updates FOR INSERT TO authenticated WITH CHECK (public.can_edit(project_id, auth.uid()));
CREATE POLICY "editors compact text" ON public.text_updates FOR DELETE TO authenticated USING (public.can_edit(project_id, auth.uid()));

ALTER TABLE public.activity ADD COLUMN node_id uuid, ADD COLUMN before jsonb, ADD COLUMN after jsonb;

ALTER PUBLICATION supabase_realtime ADD TABLE public.pages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.text_updates;

CREATE OR REPLACE FUNCTION public.force_release_lease(_project uuid, _node uuid, _label text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  if public.project_role_of(_project, auth.uid()) is distinct from 'owner' then return false; end if;
  delete from public.leases where node_id = _node and project_id = _project;
  insert into public.activity(project_id, actor_id, actor_name, action, target, node_id) values (_project, auth.uid(), public._actor_name(), 'force-unlocked', _label, _node);
  return true;
end $$;

CREATE OR REPLACE FUNCTION public.apply_node_op(_op_id text, _project uuid, _node uuid, _session text, _clock bigint, _actor text, _props jsonb, _action text, _label text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  l public.leases%rowtype;
  cur jsonb; k text; v jsonb; reg jsonb; merged jsonb;
  bef jsonb := '{}'::jsonb; aft jsonb := '{}'::jsonb;
begin
  if not public.can_edit(_project, auth.uid()) then
    insert into public.activity(project_id, actor_id, actor_name, action, target, outcome, node_id)
      values (_project, auth.uid(), public._actor_name(), _action, _label, 'blocked:no-permission', _node);
    return 'forbidden';
  end if;
  begin
    insert into public.seen_ops(op_id, project_id) values (_op_id, _project);
  exception when unique_violation then return 'duplicate';
  end;
  select * into l from public.leases where node_id = _node and expires_at > now();
  if found and l.holder_session <> _session then
    insert into public.activity(project_id, actor_id, actor_name, action, target, outcome, detail, node_id, after)
      values (_project, auth.uid(), public._actor_name(), _action, _label, 'blocked', jsonb_build_object('holder', l.holder_name), _node, _props);
    return 'blocked';
  end if;
  select props into cur from public.nodes where id = _node and project_id = _project for update;
  if not found then
    cur := '{}'::jsonb;
    insert into public.nodes(id, project_id, props) values (_node, _project, '{}');
  end if;
  merged := cur;
  for k, v in select * from jsonb_each(_props) loop
    reg := cur -> k;
    bef := bef || jsonb_build_object(k, coalesce(reg->'v', 'null'::jsonb));
    if reg is null or (reg->>'c')::bigint < _clock or ((reg->>'c')::bigint = _clock and (reg->>'a') < _actor) then
      merged := merged || jsonb_build_object(k, jsonb_build_object('v', v, 'c', _clock, 'a', _actor));
      aft := aft || jsonb_build_object(k, v);
    end if;
  end loop;
  update public.nodes set props = merged, updated_at = now() where id = _node;
  insert into public.activity(project_id, actor_id, actor_name, action, target, outcome, node_id, before, after, detail)
    values (_project, auth.uid(), public._actor_name(), _action, _label, 'applied', _node, bef, aft,
      jsonb_build_object('type', merged->'type'->'v', 'page', merged->'page'->'v'));
  return 'applied';
end $function$;