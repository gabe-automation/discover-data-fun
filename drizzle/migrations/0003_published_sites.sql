create table public.published_sites (
  project_id uuid primary key references public.projects(id) on delete cascade,
  title text not null default '',
  html text not null,
  published_by uuid,
  updated_at timestamptz not null default now()
);
grant select on public.published_sites to anon;
grant select, insert, update, delete on public.published_sites to authenticated;
grant all on public.published_sites to service_role;
alter table public.published_sites enable row level security;
create policy "anyone reads published sites" on public.published_sites for select to anon, authenticated using (true);
create policy "editors publish" on public.published_sites for insert to authenticated with check (public.can_edit(project_id, auth.uid()));
create policy "editors republish" on public.published_sites for update to authenticated using (public.can_edit(project_id, auth.uid()));
create policy "editors unpublish" on public.published_sites for delete to authenticated using (public.can_edit(project_id, auth.uid()));