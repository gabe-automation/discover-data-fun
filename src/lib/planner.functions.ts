import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlanTask = { title: string; priority: "high" | "medium" | "low"; detail: string };
export type PlanMilestone = { title: string; when: string; tasks: PlanTask[] };
export type Plan = { summary: string; milestones: PlanMilestone[] };

const SYSTEM = `You are a pragmatic project planner. Turn the team's goal into a short, realistic plan.
Reply with ONLY a JSON object, no markdown fences, in this exact shape:
{"summary": string, "milestones": [{"title": string, "when": string, "tasks": [{"title": string, "priority": "high"|"medium"|"low", "detail": string}]}]}
Rules: 3 to 5 milestones in time order. 2 to 5 tasks per milestone, ordered by priority (high first).
Task titles under 8 words. "detail" is one short sentence. "when" is a relative timeframe like "Week 1" or "Days 1-3".`;

export const generatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), goal: z.string().trim().min(3).max(1500), context: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; plan: Plan } | { ok: false; error: string }> => {
    const { data: canEdit } = await context.supabase.rpc("can_edit", { _project: data.projectId, _user: context.userId });
    if (!canEdit) return { ok: false, error: "Only editors can generate a plan on this project." };
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, error: "AI isn't set up for this project yet." };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        input: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Goal: ${data.goal}${data.context ? `\nContext: ${data.context}` : ""}` },
        ],
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      let msg = "";
      try { msg = (JSON.parse(body) as { error?: { message?: string }; message?: string }).error?.message ?? JSON.parse(body).message ?? ""; } catch { /* not json */ }
      if (res.status === 429) return { ok: false, error: "The planner is busy right now. Please try again in a minute." };
      if (res.status === 402) return { ok: false, error: msg || "AI credits have run out for this workspace." };
      console.error("planner gateway error", res.status, body.slice(0, 500));
      return { ok: false, error: msg || `The planner couldn't respond (error ${res.status}).` };
    }

    // consume the SSE stream and collect output text
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload) as { type?: string; delta?: string; error?: { message?: string } };
          if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
          if (ev.type === "error" || ev.type === "response.failed") return { ok: false, error: ev.error?.message ?? "The planner stopped unexpectedly." };
        } catch { /* partial */ }
      }
    }
    if (!text.trim()) return { ok: false, error: "The planner didn't return a plan for that goal." };
    const m = text.match(/\{[\s\S]*\}/);
    try {
      const raw = JSON.parse(m ? m[0] : text) as Plan;
      const pr = (p: string): PlanTask["priority"] => (p === "high" || p === "low" ? p : "medium");
      const plan: Plan = {
        summary: String(raw.summary ?? ""),
        milestones: (raw.milestones ?? []).slice(0, 6).map((ms) => ({
          title: String(ms.title ?? "Milestone"),
          when: String(ms.when ?? ""),
          tasks: (ms.tasks ?? []).slice(0, 6).map((t) => ({ title: String(t.title ?? ""), priority: pr(t.priority), detail: String(t.detail ?? "") })),
        })),
      };
      if (!plan.milestones.length) throw new Error("empty");
      return { ok: true, plan };
    } catch {
      return { ok: false, error: "The planner's answer couldn't be read. Try rephrasing your goal." };
    }
  });
