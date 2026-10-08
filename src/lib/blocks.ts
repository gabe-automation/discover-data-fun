export type BlockType =
  | "navbar" | "hero" | "heading" | "text" | "button" | "image" | "cards"
  | "pricing" | "testimonial" | "login" | "register" | "divider" | "footer"
  | "input" | "flex" | "grid" | "stack" | "absolute" | "section";

export const CONTAINER_TYPES: BlockType[] = ["flex", "grid", "stack", "absolute", "section"];
export const isContainer = (t: BlockType) => CONTAINER_TYPES.includes(t);
export type BoxOpts = { gap?: number; cols?: number; dir?: "row" | "column"; align?: "start" | "center" | "end" | "stretch"; justify?: "start" | "center" | "end" | "between"; wrap?: boolean };
export const BOX_KEYS: (keyof BoxOpts)[] = ["gap", "cols", "dir", "align", "justify", "wrap"];

// Attribute names users may set. Event handlers (on*) are excluded: logic goes in the block script.
export function cleanAttrs(a: Record<string, string> | undefined): [string, string][] {
  if (!a) return [];
  return Object.entries(a).filter(([k]) => /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(k) && !/^on/i.test(k) && !/^(style|class|id|src|href|srcdoc|formaction)$/i.test(k));
}
export const attrString = (a: Record<string, string> | undefined) => cleanAttrs(a).map(([k, v]) => ` ${k}="${esc(String(v))}"`).join("");

export type Breakpoint = "desktop" | "tablet" | "mobile";
export const BREAKPOINTS: Record<Breakpoint, { width: number; label: string; query: string }> = {
  desktop: { width: 1200, label: "Desktop", query: "" },
  tablet: { width: 768, label: "Tablet", query: "(max-width: 1024px)" },
  mobile: { width: 390, label: "Mobile", query: "(max-width: 640px)" },
};

export type BlockDef = { name: string; w: number; h: number; text: string; sub: string; label: string };

export const BLOCKS: Record<BlockType, BlockDef> = {
  navbar: { name: "Navbar", w: 1200, h: 72, text: "Studio North", sub: "Work · About · Journal", label: "Contact" },
  hero: { name: "Hero", w: 1080, h: 380, text: "Craft that feels unhurried", sub: "A small studio building calm, honest websites for people who care about detail.", label: "See our work" },
  heading: { name: "Heading", w: 640, h: 72, text: "A heading worth reading", sub: "", label: "" },
  text: { name: "Text", w: 520, h: 120, text: "Write something short and clear here. Good copy earns attention one sentence at a time.", sub: "", label: "" },
  button: { name: "Button", w: 180, h: 52, text: "", sub: "", label: "Get started" },
  image: { name: "Image", w: 480, h: 300, text: "Studio workspace in morning light", sub: "", label: "" },
  cards: { name: "Card grid", w: 1080, h: 260, text: "Research|Design|Build", sub: "We listen before we sketch.|Layouts with room to breathe.|Clean code, handed over.", label: "" },
  pricing: { name: "Pricing table", w: 1080, h: 320, text: "Starter|Studio|Partner", sub: "$19|$49|$129", label: "Choose plan" },
  testimonial: { name: "Testimonial", w: 720, h: 200, text: "They made our site feel like us — only calmer.", sub: "Mara Lindqvist, Founder at Oak & Iron", label: "" },
  login: { name: "Login form", w: 380, h: 300, text: "Welcome back", sub: "", label: "Sign in" },
  register: { name: "Register form", w: 380, h: 360, text: "Create your account", sub: "", label: "Create account" },
  divider: { name: "Divider", w: 1080, h: 24, text: "", sub: "", label: "" },
  footer: { name: "Footer", w: 1200, h: 120, text: "© 2026 Studio North", sub: "Instagram · Newsletter · Email", label: "" },
  input: { name: "Input field", w: 380, h: 84, text: "Email address", sub: "you@example.com", label: "" },
  flex: { name: "Flex row", w: 960, h: 160, text: "Item one|Item two|Item three", sub: "", label: "" },
  grid: { name: "Grid", w: 960, h: 280, text: "One|Two|Three|Four|Five|Six", sub: "", label: "" },
  stack: { name: "Stack", w: 420, h: 260, text: "First|Second|Third", sub: "", label: "" },
  absolute: { name: "Absolute box", w: 520, h: 300, text: "Back layer|Middle layer|Front layer", sub: "", label: "" },
  section: { name: "Section", w: 1200, h: 320, text: "Section title", sub: "Use sections to group content with comfortable spacing.", label: "" },
};

export type Theme = { primary: string; accent: string; surface: string; ink: string };
export const DEFAULT_THEME: Theme = { primary: "#008A83", accent: "#183238", surface: "#F4F7F8", ink: "#183238" };

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const split = (s: string) => s.split("|").map((x) => x.trim());

export type BlockContent = { text: string; sub: string; label: string; href?: string; attrs?: Record<string, string>; box?: BoxOpts };

const JUST = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" } as const;
const ALIGN = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const;
function boxStyle(type: BlockType, b: BoxOpts = {}): string {
  const gap = `gap:${b.gap ?? 16}px;`;
  if (type === "grid") return `display:grid;grid-template-columns:repeat(${Math.max(1, Math.min(12, b.cols ?? 3))},minmax(0,1fr));${gap}align-items:${ALIGN[b.align ?? "stretch"]};`;
  if (type === "absolute") return "position:relative;";
  const dir = type === "stack" ? "column" : b.dir ?? "row";
  return `display:flex;flex-direction:${dir};${gap}flex-wrap:${b.wrap ? "wrap" : "nowrap"};justify-content:${JUST[b.justify ?? "start"]};align-items:${ALIGN[b.align ?? "stretch"]};`;
}

// Only allow destinations that cannot execute script in the visitor's browser.
export function safeHref(raw?: string): string {
  const value = raw?.trim() ?? "";
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) {
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? value : ""; } catch { return ""; }
  }
  if (/^\?page=[0-9a-f-]{36}$/i.test(value) || (/^(\/[^/]|#[a-zA-Z0-9_-])/i.test(value) && !/[\s"'<>]/.test(value))) return value;
  return "";
}

export function blockHtml(type: BlockType, c: BlockContent, id: string): string {
  const t = esc(c.text), s = esc(c.sub), l = esc(c.label);
  const href = esc(safeHref(c.href));
  const action = (label: string) => href ? `<a class="wc-btn" href="${href}">${label}</a>` : `<span class="wc-btn wc-btn-unset" title="Set a destination in WebCraft">${label}</span>`;
  switch (type) {
    case "navbar":
      return `<nav class="wc-nav" aria-label="Main"><strong class="wc-brand">${t}</strong><ul>${split(c.sub).map((x) => `<li><span>${esc(x)}</span></li>`).join("")}</ul>${action(l)}</nav>`;
    case "hero":
      return `<section class="wc-hero${c.attrs?.["data-cover"] ? " wc-hero-cover" : ""}">${c.attrs?.["data-cover"] ? `<img class="wc-cover" src="${esc(c.attrs["data-cover"])}" alt="" width="1536" height="1024">` : ""}<h1>${t}</h1><p>${s}</p>${action(l)}</section>`;
    case "heading":
      return `<h2 class="wc-heading" id="work">${t}</h2>`;
    case "text":
      return `<p class="wc-text">${t}</p>`;
    case "button":
      return action(l);
    case "image":
      return `<figure class="wc-image">${c.attrs?.["data-image"] ? `<img class="wc-image-photo" src="${esc(c.attrs["data-image"])}" alt="${t}" loading="lazy" width="1536" height="1024">` : `<div class="wc-image-art" role="img" aria-label="${t}"></div>`}<figcaption>${t}</figcaption></figure>`;
    case "cards": {
      const titles = split(c.text), subs = split(c.sub);
      return `<section class="wc-cards" id="features">${titles.map((x, i) => `<article class="wc-card"><h3>${esc(x)}</h3><p>${esc(subs[i] ?? "")}</p></article>`).join("")}</section>`;
    }
    case "pricing": {
      const titles = split(c.text), prices = split(c.sub);
      return `<section class="wc-pricing">${titles.map((x, i) => `<article class="wc-plan${i === 1 ? " wc-plan-featured" : ""}"><h3>${esc(x)}</h3><p class="wc-price">${esc(prices[i] ?? "")}<span>/mo</span></p>${action(l)}</article>`).join("")}</section>`;
    }
    case "testimonial":
      return `<blockquote class="wc-quote"><p>“${t}”</p><footer>— ${s}</footer></blockquote>`;
    case "login":
    case "register":
      return `<section class="wc-form" id="${type === "register" ? "signup" : "signin"}" aria-labelledby="${id}-t"><h3 id="${id}-t">${t}</h3><p>${type === "register" ? "Join us to get started." : "Already have an account?"}</p>${action(l)}</section>`;
    case "divider":
      return `<hr class="wc-divider">`;
    case "footer":
      return `<footer class="wc-footer"><span>${t}</span><span>${s}</span></footer>`;
    case "input": {
      const a = { type: "text", name: "field", ...(c.attrs ?? {}) };
      return `<label class="wc-field"><span>${t}</span><input placeholder="${s}"${attrString(a)}><small class="wc-field-msg" aria-live="polite"></small></label>`;
    }
    case "section":
      return `<section class="wc-section"><h2>${t}</h2><p>${s}</p></section>`;
    case "flex": case "grid": case "stack": case "absolute": {
      const items = split(c.text).filter(Boolean);
      const inner = items.map((x, i) => `<div class="wc-item"${type === "absolute" ? ` style="left:${i * 14}%;top:${i * 16}%;z-index:${i + 1}"` : ""}>${esc(x)}</div>`).join("");
      return `<div class="wc-box wc-box-${type}" style="${boxStyle(type, c.box)}">${inner}</div>`;
    }
  }
}

export function themeVars(t: Theme): string {
  return `--wc-primary:${t.primary};--wc-accent:${t.accent};--wc-surface:${t.surface};--wc-ink:${t.ink};`;
}

// Shared block styles — used by the live canvas AND the exported styles.css.
export const BLOCK_CSS = `
.wc-page{position:relative;background:var(--wc-surface);color:var(--wc-ink);font-family:'Manrope',system-ui,sans-serif;}
.wc-page:has(.wc-hero){background:color-mix(in srgb,var(--wc-surface) 96%,var(--wc-accent))}
.wc-page *{box-sizing:border-box;}
.wc-el{position:absolute;overflow:hidden;}
.wc-page h1,.wc-page h2,.wc-page h3{font-family:Sora,system-ui,sans-serif;letter-spacing:0;}
.wc-btn{display:inline-flex;align-items:center;justify-content:center;height:100%;min-height:40px;padding:0 22px;border-radius:6px;background:var(--wc-primary);color:var(--wc-surface);font:600 15px/1 system-ui,sans-serif;border:0;text-decoration:none;cursor:pointer;}
.wc-btn:hover{filter:brightness(.88);transform:translateY(-1px)}.wc-btn:focus-visible{outline:3px solid var(--wc-accent);outline-offset:3px}.wc-btn-unset{opacity:.6;cursor:default}.wc-btn-unset:hover{filter:none;transform:none}
.wc-el>.wc-btn{width:100%;}
.wc-nav{height:100%;display:flex;align-items:center;gap:32px;padding:0 40px;border-bottom:1px solid color-mix(in srgb,var(--wc-ink) 12%,transparent);font-family:system-ui,sans-serif;}
.wc-nav .wc-brand{font:700 20px Sora,system-ui,sans-serif;}
.wc-nav ul{display:flex;gap:24px;list-style:none;margin:0 auto 0 0;padding:0;}
.wc-nav a{color:inherit;text-decoration:none;font-size:14px;}
.wc-nav .wc-btn{height:40px;color:var(--wc-surface);}
.wc-hero{height:100%;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:28px;padding:64px 80px;border-bottom:1px solid color-mix(in srgb,var(--wc-ink) 13%,transparent);background:var(--wc-surface);position:relative;}
.wc-hero h1{font-size:72px;font-family:Sora,system-ui,sans-serif;line-height:1.03;margin:0;max-width:850px;font-weight:700;}
.wc-hero p{font:20px/1.55 system-ui,sans-serif;max-width:570px;margin:0;opacity:.72;}
.wc-hero .wc-btn{height:48px;}
.wc-cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;}
.wc-hero-cover>*:not(img){position:relative;z-index:1;max-width:680px;}
.wc-hero-cover{background:var(--wc-surface);justify-content:flex-end;padding:40px;}
.wc-hero-cover h1,.wc-hero-cover p{background:var(--wc-surface);padding:10px 16px;}
.wc-image-photo{width:100%;height:calc(100% - 24px);object-fit:cover;}
.wc-heading{margin:0;padding:52px 80px 16px;font-size:44px;line-height:1.1;font-weight:500;}
.wc-text{margin:0;font:17px/1.6 system-ui,sans-serif;opacity:.8;}
.wc-image{margin:0;height:100%;display:flex;flex-direction:column;gap:8px;}
.wc-image-art{flex:1;border-radius:14px;background:linear-gradient(135deg,var(--wc-accent),color-mix(in srgb,var(--wc-primary) 70%,var(--wc-surface)));}
.wc-image figcaption{font:13px system-ui,sans-serif;opacity:.6;}
.wc-cards,.wc-pricing{height:100%;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0;padding:20px 56px 72px;}
.wc-card,.wc-plan{border-top:1px solid color-mix(in srgb,var(--wc-ink) 22%,transparent);padding:26px 24px;background:transparent;}
.wc-card h3,.wc-plan h3{margin:0 0 8px;font-size:22px;}
.wc-card p{margin:0;font:15px/1.5 system-ui,sans-serif;opacity:.75;}
.wc-plan{display:flex;flex-direction:column;gap:12px;}
.wc-plan-featured{border-color:var(--wc-primary);box-shadow:0 0 0 2px var(--wc-primary) inset;}
.wc-price{font-size:40px;margin:0 0 auto;}
.wc-price span{font:14px system-ui,sans-serif;opacity:.6;}
.wc-plan .wc-btn{height:44px;}
.wc-quote{margin:0;height:100%;padding:32px 80px;border-top:1px solid color-mix(in srgb,var(--wc-ink) 15%,transparent);display:flex;flex-direction:column;justify-content:center;gap:12px;background:color-mix(in srgb,var(--wc-accent) 9%,var(--wc-surface));}
.wc-quote p{margin:0;font-size:26px;line-height:1.3;font-style:italic;}
.wc-quote footer{font:14px system-ui,sans-serif;opacity:.65;}
.wc-form{height:100%;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:12px;padding:28px 80px;border-top:1px solid color-mix(in srgb,var(--wc-ink) 14%,transparent);font-family:system-ui,sans-serif;}
.wc-form h3{margin:0 0 4px;font:600 22px Sora,system-ui,sans-serif;}
.wc-form label{display:flex;flex-direction:column;gap:4px;font-size:13px;}
.wc-form input{height:38px;border-radius:8px;border:1px solid color-mix(in srgb,var(--wc-ink) 20%,transparent);padding:0 10px;background:white;font:inherit;}
.wc-form p{font:15px/1.5 system-ui,sans-serif;opacity:.7}.wc-form .wc-btn{height:44px;margin-top:12px;}
.wc-divider{border:0;border-top:1px solid color-mix(in srgb,var(--wc-ink) 18%,transparent);margin:11px 0;}
.wc-footer{height:100%;display:flex;justify-content:space-between;align-items:center;padding:0 40px;font:14px system-ui,sans-serif;opacity:.75;border-top:1px solid color-mix(in srgb,var(--wc-ink) 12%,transparent);}
.wc-field{height:100%;display:flex;flex-direction:column;justify-content:center;gap:6px;font:500 14px system-ui,sans-serif;}
.wc-field input{height:44px;border-radius:10px;border:1px solid color-mix(in srgb,var(--wc-ink) 22%,transparent);padding:0 14px;background:#fff;color:var(--wc-ink);font:15px system-ui,sans-serif;}
.wc-field input:focus{outline:2px solid var(--wc-primary);outline-offset:1px}.wc-field input:invalid:not(:placeholder-shown){border-color:#b91c1c}
.wc-field-msg{min-height:14px;font-size:12px;color:#b91c1c;font-weight:400}
.wc-section{height:100%;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:48px 80px;background:color-mix(in srgb,var(--wc-accent) 7%,var(--wc-surface));}
.wc-section h2{margin:0;font-size:36px;font-weight:500}.wc-section p{margin:0;font:17px/1.6 system-ui,sans-serif;opacity:.75;max-width:640px}
.wc-box{height:100%;padding:16px;border-radius:14px;border:1px dashed color-mix(in srgb,var(--wc-ink) 22%,transparent);font:15px system-ui,sans-serif;}
.wc-item{flex:1;min-width:0;min-height:56px;display:flex;align-items:center;justify-content:center;padding:14px;border-radius:10px;background:color-mix(in srgb,var(--wc-primary) 10%,var(--wc-surface));border:1px solid color-mix(in srgb,var(--wc-primary) 25%,transparent);text-align:center;}
.wc-box-absolute .wc-item{position:absolute;width:46%;height:46%;box-shadow:0 10px 24px -14px rgba(0,0,0,.4);}
@media (max-width:1024px){.wc-hero{padding:36px}.wc-hero h1{font-size:52px}.wc-nav{gap:16px;padding:0 24px}.wc-heading{padding:40px 24px 16px}}
@media (max-width:640px){.wc-hero{padding:24px;gap:18px}.wc-hero h1{font-size:36px;overflow-wrap:anywhere}.wc-hero p{font-size:16px}.wc-nav{padding:0 16px;gap:12px}.wc-nav ul{display:none}.wc-brand{margin-right:auto}.wc-heading{font-size:28px}.wc-cards,.wc-pricing{padding:20px;gap:10px;grid-template-columns:1fr}.wc-card,.wc-plan{padding:18px}.wc-quote,.wc-form,.wc-section{padding:24px}.wc-footer{padding:16px;gap:12px;flex-wrap:wrap}.wc-box-flex{flex-direction:column!important}.wc-box-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
`;

// Per-block design overrides (stored as "s.<key>" properties on the node).
export type BlockStyle = {
  bg?: string; color?: string; btn?: string; radius?: number; pad?: number;
  align?: "left" | "center" | "right"; opacity?: number; scale?: number;
  border?: string; shadow?: boolean; font?: "serif" | "sans" | "mono";
};
export const STYLE_KEYS: (keyof BlockStyle)[] = ["bg", "color", "btn", "radius", "pad", "align", "opacity", "scale", "border", "shadow", "font"];
const FONTS = { serif: "Georgia,'Times New Roman',serif", sans: "system-ui,-apple-system,sans-serif", mono: "ui-monospace,Menlo,monospace" };

export function styleDecls(s: BlockStyle): [string, string][] {
  const o: [string, string][] = [];
  if (s.bg) o.push(["background", s.bg]);
  if (s.color) o.push(["color", s.color], ["--wc-ink", s.color]);
  if (s.btn) o.push(["--wc-primary", s.btn]);
  if (s.radius) o.push(["border-radius", `${s.radius}px`]);
  if (s.pad) o.push(["padding", `${s.pad}px`]);
  if (s.align) o.push(["text-align", s.align]);
  if (s.opacity !== undefined && s.opacity < 1) o.push(["opacity", String(s.opacity)]);
  if (s.scale && s.scale !== 1) o.push(["zoom", String(s.scale)]);
  if (s.border) o.push(["border", `2px solid ${s.border}`]);
  if (s.shadow) o.push(["box-shadow", "0 18px 40px -18px rgba(0,0,0,.35)"]);
  if (s.font) o.push(["font-family", FONTS[s.font]]);
  return o;
}
export const styleCss = (s: BlockStyle) => styleDecls(s).map(([k, v]) => `${k}:${v};`).join("");
export function styleObj(s: BlockStyle): Record<string, string> {
  return Object.fromEntries(styleDecls(s).map(([k, v]) => [k.startsWith("--") ? k : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v]));
}
