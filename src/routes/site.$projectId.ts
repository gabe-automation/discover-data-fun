import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/site/$projectId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!/^[0-9a-f-]{36}$/i.test(params.projectId)) return new Response("Not found", { status: 404 });
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const sb = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
              h.set("apikey", key);
              return fetch(input, { ...init, headers: h });
            },
          },
        });
        const { data } = await sb.from("published_sites").select("html, pages_html").eq("project_id", params.projectId).maybeSingle();
        if (!data) {
          return new Response("<!doctype html><title>Not published</title><body style='font-family:sans-serif;display:grid;place-items:center;height:100vh'><p>This site hasn't been published yet.</p></body>", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
        }
        const pageId = new URL(request.url).searchParams.get("page");
        const pages = data.pages_html && typeof data.pages_html === "object" && !Array.isArray(data.pages_html) ? data.pages_html as Record<string, unknown> : {};
        const html = pageId ? pages[pageId] : data.html;
        if (typeof html !== "string") return new Response("Page not found", { status: 404 });
        return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=30", "content-security-policy": "sandbox allow-scripts allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation" } });
      },
    },
  },
});
