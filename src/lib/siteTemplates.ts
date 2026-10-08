import studioProduct from "@/assets/studio-product.jpg";
import assemblyVenue from "@/assets/assembly-venue.jpg";
import { BLOCKS, BREAKPOINTS, type BlockStyle, type BlockType, type BoxOpts, type Theme } from "./blocks";
import type { NodeView } from "./model";

export type TplBlock = { type: BlockType; y: number; text?: string; sub?: string; label?: string; href?: string; w?: number; h?: number; x?: number; style?: BlockStyle; box?: BoxOpts; attrs?: Record<string, string> };
export type SiteTemplate = { id: string; name: string; description: string; theme: Theme; blocks: TplBlock[] };

const stack = (items: Omit<TplBlock, "y">[], gap = 0): TplBlock[] => {
  let y = 0;
  return items.map((b) => {
    const h = b.h ?? BLOCKS[b.type].h;
    const out = { ...b, y };
    y += h + gap;
    return out;
  });
};

export const SITE_TEMPLATES: SiteTemplate[] = [
  {
    id: "landing", name: "Common Ground", description: "A product studio with bold typography, editorial imagery, and clear pricing.",
    theme: { primary: "#008A83", accent: "#183238", surface: "#F4F7F8", ink: "#183238" },
    blocks: stack([
      { type: "navbar", text: "COMMON GROUND", sub: "The platform · Our approach · Plans", label: "Explore", href: "#features", h: 84 },
      { type: "hero", text: "COMMON GROUND", sub: "A quieter way to bring your people, projects and ideas together.", label: "Explore the platform", href: "#features", h: 560, attrs: { "data-cover": studioProduct }, style: { font: "sans" } },
      { type: "heading", text: "Everything, in its right place.", h: 140 },
      { type: "cards", text: "01 / Find your focus|02 / Work together|03 / Move forward", sub: "One clear space for what matters.|Good ideas deserve good company.|From the first sketch to the finish line.", h: 330 },
      { type: "pricing", text: "Solo|Studio|Collective", sub: "$12|$32|$72", label: "Start building", href: "#features", h: 390 },
      { type: "testimonial", text: "Finally, a space that feels like ours.", sub: "The people behind the work", h: 245, style: { bg: "#d8ebe5" } },
      { type: "footer", text: "COMMON GROUND / 2026", sub: "Built for people who make things together.", h: 130 },
    ]),
  },
  {
    id: "portfolio", name: "Alex Rivera — Portfolio", description: "A visual design portfolio with a full-width project cover and selected work.",
    theme: { primary: "#183238", accent: "#008A83", surface: "#ffffff", ink: "#183238" },
    blocks: stack([
      { type: "navbar", text: "ALEX RIVERA / DESIGN", sub: "Selected work · About · Contact", label: "View work", href: "#work", h: 84 },
      { type: "hero", text: "ALEX RIVERA", sub: "Independent designer and maker creating thoughtful experiences for ambitious teams.", label: "View selected work", href: "#work", h: 520, attrs: { "data-cover": studioProduct }, style: { font: "sans" } },
      { type: "heading", text: "Selected work / 2024—26", h: 140 },
      { type: "cards", text: "01 / Fieldnotes|02 / Open House|03 / Goodform", sub: "Identity & digital experience|A fresh way to find home|Tools for everyday making", h: 340 },
      { type: "image", text: "Goodform / Product design", attrs: { "data-image": studioProduct }, w: 1080, h: 420, style: { radius: 20, shadow: true } },
      { type: "testimonial", text: "The best projects begin with a good conversation.", sub: "Currently available for select collaborations", h: 220, style: { bg: "#f2e4e1" } },
      { type: "footer", text: "ALEX RIVERA / 2026", sub: "Made with care. Get in touch above.", h: 120 },
    ]),
  },
  {
    id: "saas", name: "Tasklight — App launch", description: "A precise software launch page with product benefits and linked account actions.",
    theme: { primary: "#008A83", accent: "#183238", surface: "#F4F7F8", ink: "#183238" },
    blocks: stack([
      { type: "navbar", text: "TASKLIGHT", sub: "Overview · How it works · Plans", label: "Sign in", href: "#signin", h: 84 },
      { type: "hero", text: "TASKLIGHT", sub: "Your team's work, in one beautifully simple place. Spend less time organizing and more time making.", label: "Create an account", href: "#signup", h: 570, style: { bg: "#DCE5E7", font: "sans" } },
      { type: "heading", text: "Work that just flows.", h: 140 },
      { type: "cards", text: "See the whole picture|Keep everyone in sync|Make progress visible", sub: "One home for every project.|The right people, always in the loop.|Small steps that add up to big things.", h: 330 },
      { type: "pricing", text: "Free|Team|Company", sub: "$0|$24|$68", label: "Choose plan", href: "#signup", h: 390 },
      { type: "register", text: "Ready when you are.", label: "Sign up", href: "mailto:hello@tasklight.example", h: 240, w: 1080, style: { bg: "#dceef3", radius: 18 } },
      { type: "login", text: "Welcome back.", label: "Sign in", href: "mailto:hello@tasklight.example", h: 240, w: 1080 },
      { type: "footer", text: "TASKLIGHT / 2026", sub: "A better way to work together.", h: 130 },
    ]),
  },
  {
    id: "event", name: "Assembly — Conference", description: "An architectural conference cover with a bold program and registration section.",
    theme: { primary: "#008A83", accent: "#183238", surface: "#F4F7F8", ink: "#183238" },
    blocks: stack([
      { type: "navbar", text: "ASSEMBLY / 2026", sub: "The gathering · The program · The place", label: "See program", href: "#features", h: 84 },
      { type: "hero", text: "ASSEMBLY / 2026", sub: "Two days of conversation, discovery and new perspectives. Add your date and venue here.", label: "Explore the program", href: "#features", h: 570, attrs: { "data-cover": assemblyVenue }, style: { font: "sans" } },
      { type: "heading", text: "A gathering worth showing up for.", h: 140 },
      { type: "cards", text: "01 / Connect|02 / Discover|03 / Make", sub: "Meet the people behind the ideas.|Hear fresh perspectives.|Leave with something new.", h: 330 },
      { type: "section", text: "October 16—17 · The Glasshouse", sub: "Doors open at 9:00. Talks, workshops and a shared table run throughout both days.", h: 260, style: { bg: "#e3efe1" } },
      { type: "button", label: "Reserve your place", href: "https://example.com/tickets", w: 260, h: 58, style: { shadow: true } },
      { type: "testimonial", text: "Come curious. Leave inspired.", sub: "Your next chapter starts here", h: 220, style: { bg: "#f4ddd7" } },
      { type: "footer", text: "ASSEMBLY / 2026", sub: "Details and tickets coming soon.", h: 130 },
    ]),
  },
];

/** Template blocks as page nodes, for thumbnails. */
export function templateViews(t: SiteTemplate): NodeView[] {
  let mobileBottom = 0;
  return t.blocks.map((b, i) => {
    const def = BLOCKS[b.type];
    const w = Math.min(b.w ?? def.w, 1200), h = b.h ?? def.h;
    const g = { x: b.x ?? Math.round((1200 - w) / 2), y: b.y, w, h };
    const tablet = { x: Math.max(12, Math.round(g.x * BREAKPOINTS.tablet.width / BREAKPOINTS.desktop.width)), y: g.y, w: Math.min(BREAKPOINTS.tablet.width - 24, Math.round(g.w * BREAKPOINTS.tablet.width / BREAKPOINTS.desktop.width)), h: g.h };
    const mobileHeight = b.type === "pricing" ? Math.max(g.h, 720) : b.type === "cards" ? Math.max(g.h, 390) : g.h;
    const mobile = { x: 12, y: Math.max(g.y, mobileBottom), w: BREAKPOINTS.mobile.width - 24, h: mobileHeight };
    mobileBottom = mobile.y + mobile.h;
    return {
      id: `${t.id}-${i}-0000-0000-000000000000`, type: b.type, parent: null, order: String(i).padStart(3, "0"),
      text: b.text ?? def.text, sub: b.sub ?? def.sub, label: b.label ?? def.label, href: b.href ?? "", page: null,
      style: b.style ?? {}, attrs: b.attrs ?? {}, script: "", box: b.box ?? {}, geo: { desktop: g, tablet, mobile },
    };
  });
}
