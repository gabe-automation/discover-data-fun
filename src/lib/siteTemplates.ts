import { BLOCKS, type BlockType } from "./blocks";

export type TplBlock = { type: BlockType; y: number; text?: string; sub?: string; label?: string; href?: string; w?: number; h?: number; x?: number };
export type SiteTemplate = { id: string; name: string; description: string; blocks: TplBlock[] };

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
    id: "landing", name: "Product landing", description: "Hero, features, pricing and a testimonial.",
    blocks: stack([
      { type: "navbar", text: "COMMON GROUND", sub: "The platform · Our approach · Plans", label: "Join the waitlist", href: "#contact", h: 84 },
      { type: "hero", text: "Make room for better work.", sub: "A quieter way to bring your people, projects and ideas together.", label: "Explore the platform", href: "#features", h: 520 },
      { type: "heading", text: "Everything, in its right place.", h: 140 },
      { type: "cards", text: "01 / Find your focus|02 / Work together|03 / Move forward", sub: "One clear space for what matters.|Good ideas deserve good company.|From the first sketch to the finish line.", h: 330 },
      { type: "testimonial", text: "Finally, a space that feels like ours.", sub: "The people behind the work", h: 245 },
      { type: "footer", text: "COMMON GROUND / 2026", sub: "Built for people who make things together.", h: 130 },
    ]),
  },
  {
    id: "portfolio", name: "Portfolio", description: "Personal intro, work samples and contact.",
    blocks: stack([
      { type: "navbar", text: "ALEX RIVERA / DESIGN", sub: "Selected work · About · Contact", label: "Let's talk", href: "mailto:hello@example.com", h: 84 },
      { type: "hero", text: "I make digital feel human.", sub: "Independent designer and maker creating thoughtful experiences for ambitious teams.", label: "View selected work", href: "#work", h: 480 },
      { type: "heading", text: "Selected work / 2024—26", h: 140 },
      { type: "cards", text: "01 / Fieldnotes|02 / Open House|03 / Goodform", sub: "Identity & digital experience|A fresh way to find home|Tools for everyday making", h: 340 },
      { type: "testimonial", text: "The best projects begin with a good conversation.", sub: "Currently available for select collaborations", h: 220 },
      { type: "footer", text: "ALEX RIVERA / 2026", sub: "Made with care. Get in touch above.", h: 120 },
    ]),
  },
  {
    id: "saas", name: "App launch", description: "An editorial product page with clear sign-in actions.",
    blocks: stack([
      { type: "navbar", text: "TASKLIGHT", sub: "Overview · How it works · Plans", label: "Sign in", h: 84 },
      { type: "hero", text: "A little more clarity, every day.", sub: "Your team's work, in one beautifully simple place. Spend less time organizing and more time making.", label: "Create an account", h: 530 },
      { type: "heading", text: "Work that just flows.", h: 140 },
      { type: "cards", text: "See the whole picture|Keep everyone in sync|Make progress visible", sub: "One home for every project.|The right people, always in the loop.|Small steps that add up to big things.", h: 330 },
      { type: "register", text: "Ready when you are.", label: "Sign up", h: 220, w: 1080 },
      { type: "footer", text: "TASKLIGHT / 2026", sub: "A better way to work together.", h: 130 },
    ]),
  },
  {
    id: "event", name: "Event page", description: "Announcement, schedule and RSVP button.",
    blocks: stack([
      { type: "navbar", text: "ASSEMBLY / 2026", sub: "The gathering · The program · The place", label: "Get tickets", h: 84 },
      { type: "hero", text: "For the things we make together.", sub: "Two days of conversation, discovery and new perspectives. Add your date and venue here.", label: "Save your seat", h: 530 },
      { type: "heading", text: "A gathering worth showing up for.", h: 140 },
      { type: "cards", text: "01 / Connect|02 / Discover|03 / Make", sub: "Meet the people behind the ideas.|Hear fresh perspectives.|Leave with something new.", h: 330 },
      { type: "testimonial", text: "Come curious. Leave inspired.", sub: "Your next chapter starts here", h: 220 },
      { type: "footer", text: "ASSEMBLY / 2026", sub: "Details and tickets coming soon.", h: 130 },
    ]),
  },
];
