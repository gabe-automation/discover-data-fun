<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Persistent node locks live in `node_locks` and are enforced inside `apply_node_op`; why: clients can't bypass them.
- AI planner runs in `src/lib/planner.functions.ts` (auth server fn, streamed Responses call); why: keeps the key server-side.
- Published project pages are snapshots in `published_sites.pages_html`, served with `?page=<id>`; why: each configured button destination remains public without exposing editable project data.
