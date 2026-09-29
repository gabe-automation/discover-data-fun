import { BLOCKS, type BlockType } from "./blocks";

export type TplBlock = { type: BlockType; y: number; text?: string; sub?: string; label?: string; w?: number; h?: number; x?: number };
export type SiteTemplate = { id: string; name: string; description: string; blocks: TplBlock[] };

const stack = (items: Omit<TplBlock, "y">[], gap = 32): TplBlock[] => {
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
      { type: "navbar", text: "Launchpad", sub: "Features · Pricing · Docs", label: "Sign up" },
      { type: "hero", text: "Ship your idea this week", sub: "Everything a small team needs to launch, in one calm place.", label: "Start free" },
      { type: "cards", text: "Plan|Build|Launch", sub: "Turn goals into tasks.|Design together live.|Publish in one click." },
      { type: "pricing", text: "Solo|Team|Company", sub: "$0|$29|$99", label: "Choose" },
      { type: "testimonial", text: "We launched two weeks early.", sub: "Priya N., Product lead" },
      { type: "footer", text: "© 2026 Launchpad", sub: "Twitter · Blog · Email" },
    ]),
  },
  {
    id: "portfolio", name: "Portfolio", description: "Personal intro, work samples and contact.",
    blocks: stack([
      { type: "navbar", text: "Alex Rivera", sub: "Work · About · Contact", label: "Hire me" },
      { type: "hero", text: "Designer who codes", sub: "I build thoughtful interfaces for small brands.", label: "See projects" },
      { type: "heading", text: "Selected work" },
      { type: "image", text: "Project cover", w: 1080, h: 420 },
      { type: "cards", text: "Brand refresh|Mobile app|Marketing site", sub: "Oak & Iron, 2026|Fieldnote, 2025|Harbor Co, 2025" },
      { type: "footer", text: "© 2026 Alex Rivera", sub: "Dribbble · GitHub · Email" },
    ]),
  },
  {
    id: "saas", name: "App with sign-in", description: "Landing with login and register forms.",
    blocks: [
      ...stack([
        { type: "navbar", text: "Tasklight", sub: "Product · Pricing", label: "Log in" },
        { type: "hero", text: "Your team's tasks, finally clear", sub: "Plan, assign and track in one place.", label: "Get started" },
      ]),
      { type: "login", y: 516, x: 180 },
      { type: "register", y: 516, x: 640 },
      { type: "footer", y: 912, text: "© 2026 Tasklight", sub: "Status · Privacy · Terms" },
    ],
  },
  {
    id: "event", name: "Event page", description: "Announcement, schedule and RSVP button.",
    blocks: stack([
      { type: "navbar", text: "DevDays 2026", sub: "Schedule · Speakers · Venue", label: "RSVP" },
      { type: "hero", text: "Two days of hands-on building", sub: "Taipei · October 14–15", label: "Get a ticket" },
      { type: "cards", text: "Day 1: Workshops|Day 2: Talks|Evening: Demo night", sub: "Bring a laptop.|12 speakers.|Show what you made." },
      { type: "button", label: "Reserve my seat", x: 510 },
      { type: "footer", text: "© 2026 DevDays", sub: "Code of conduct · Contact" },
    ]),
  },
];
