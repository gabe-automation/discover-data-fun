export type BlockType =
  | "navbar" | "hero" | "heading" | "text" | "button" | "image" | "cards"
  | "pricing" | "testimonial" | "login" | "register" | "divider" | "footer";

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
};

export type Theme = { primary: string; accent: string; surface: string; ink: string };
export const DEFAULT_THEME: Theme = { primary: "#c2410c", accent: "#4d7c0f", surface: "#faf7f2", ink: "#1c1917" };

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const split = (s: string) => s.split("|").map((x) => x.trim());

export type BlockContent = { text: string; sub: string; label: string };

export function blockHtml(type: BlockType, c: BlockContent, id: string): string {
  const t = esc(c.text), s = esc(c.sub), l = esc(c.label);
  switch (type) {
    case "navbar":
      return `<nav class="wc-nav" aria-label="Main"><strong class="wc-brand">${t}</strong><ul>${split(c.sub).map((x) => `<li><a href="#">${esc(x)}</a></li>`).join("")}</ul><a class="wc-btn" href="#">${l}</a></nav>`;
    case "hero":
      return `<section class="wc-hero"><h1>${t}</h1><p>${s}</p><a class="wc-btn" href="#" data-action="cta">${l}</a></section>`;
    case "heading":
      return `<h2 class="wc-heading">${t}</h2>`;
    case "text":
      return `<p class="wc-text">${t}</p>`;
    case "button":
      return `<button class="wc-btn" type="button" data-action="button">${l}</button>`;
    case "image":
      return `<figure class="wc-image"><div class="wc-image-art" role="img" aria-label="${t}"></div><figcaption>${t}</figcaption></figure>`;
    case "cards": {
      const titles = split(c.text), subs = split(c.sub);
      return `<section class="wc-cards">${titles.map((x, i) => `<article class="wc-card"><h3>${esc(x)}</h3><p>${esc(subs[i] ?? "")}</p></article>`).join("")}</section>`;
    }
    case "pricing": {
      const titles = split(c.text), prices = split(c.sub);
      return `<section class="wc-pricing">${titles.map((x, i) => `<article class="wc-plan${i === 1 ? " wc-plan-featured" : ""}"><h3>${esc(x)}</h3><p class="wc-price">${esc(prices[i] ?? "")}<span>/mo</span></p><button class="wc-btn" type="button" data-action="plan">${l}</button></article>`).join("")}</section>`;
    }
    case "testimonial":
      return `<blockquote class="wc-quote"><p>“${t}”</p><footer>— ${s}</footer></blockquote>`;
    case "login":
    case "register":
      return `<form class="wc-form" data-form="${type}" aria-labelledby="${id}-t"><h3 id="${id}-t">${t}</h3>${type === "register" ? `<label>Name<input name="name" required></label>` : ""}<label>Email<input type="email" name="email" required></label><label>Password<input type="password" name="password" required minlength="6"></label><button class="wc-btn" type="submit">${l}</button></form>`;
    case "divider":
      return `<hr class="wc-divider">`;
    case "footer":
      return `<footer class="wc-footer"><span>${t}</span><span>${s}</span></footer>`;
  }
}

export function themeVars(t: Theme): string {
  return `--wc-primary:${t.primary};--wc-accent:${t.accent};--wc-surface:${t.surface};--wc-ink:${t.ink};`;
}

// Shared block styles — used by the live canvas AND the exported styles.css.
export const BLOCK_CSS = `
.wc-page{position:relative;background:var(--wc-surface);color:var(--wc-ink);font-family:Georgia,'Times New Roman',serif;}
.wc-page *{box-sizing:border-box;}
.wc-el{position:absolute;overflow:hidden;}
.wc-btn{display:inline-flex;align-items:center;justify-content:center;height:100%;min-height:40px;padding:0 22px;border-radius:999px;background:var(--wc-primary);color:var(--wc-surface);font:600 15px/1 system-ui,sans-serif;border:0;text-decoration:none;cursor:pointer;}
.wc-el>.wc-btn{width:100%;}
.wc-nav{height:100%;display:flex;align-items:center;gap:32px;padding:0 40px;border-bottom:1px solid color-mix(in srgb,var(--wc-ink) 12%,transparent);font-family:system-ui,sans-serif;}
.wc-nav .wc-brand{font:600 20px Georgia,serif;}
.wc-nav ul{display:flex;gap:24px;list-style:none;margin:0 auto 0 0;padding:0;}
.wc-nav a{color:inherit;text-decoration:none;font-size:14px;}
.wc-nav .wc-btn{height:40px;color:var(--wc-surface);}
.wc-hero{height:100%;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:20px;padding:40px;}
.wc-hero h1{font-size:clamp(32px,5vw,64px);line-height:1.02;margin:0;letter-spacing:-.02em;}
.wc-hero p{font:18px/1.5 system-ui,sans-serif;max-width:560px;margin:0;opacity:.75;}
.wc-hero .wc-btn{height:48px;}
.wc-heading{margin:0;font-size:40px;line-height:1.1;letter-spacing:-.02em;}
.wc-text{margin:0;font:17px/1.6 system-ui,sans-serif;opacity:.8;}
.wc-image{margin:0;height:100%;display:flex;flex-direction:column;gap:8px;}
.wc-image-art{flex:1;border-radius:14px;background:linear-gradient(135deg,var(--wc-accent),color-mix(in srgb,var(--wc-primary) 70%,var(--wc-surface)));}
.wc-image figcaption{font:13px system-ui,sans-serif;opacity:.6;}
.wc-cards,.wc-pricing{height:100%;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;}
.wc-card,.wc-plan{border:1px solid color-mix(in srgb,var(--wc-ink) 14%,transparent);border-radius:16px;padding:24px;background:color-mix(in srgb,var(--wc-surface) 80%,white);}
.wc-card h3,.wc-plan h3{margin:0 0 8px;font-size:22px;}
.wc-card p{margin:0;font:15px/1.5 system-ui,sans-serif;opacity:.75;}
.wc-plan{display:flex;flex-direction:column;gap:12px;}
.wc-plan-featured{border-color:var(--wc-primary);box-shadow:0 0 0 2px var(--wc-primary) inset;}
.wc-price{font-size:40px;margin:0 0 auto;}
.wc-price span{font:14px system-ui,sans-serif;opacity:.6;}
.wc-plan .wc-btn{height:44px;}
.wc-quote{margin:0;height:100%;padding:28px 32px;border-left:4px solid var(--wc-accent);display:flex;flex-direction:column;justify-content:center;gap:12px;}
.wc-quote p{margin:0;font-size:26px;line-height:1.3;font-style:italic;}
.wc-quote footer{font:14px system-ui,sans-serif;opacity:.65;}
.wc-form{height:100%;display:flex;flex-direction:column;gap:12px;padding:24px;border-radius:16px;border:1px solid color-mix(in srgb,var(--wc-ink) 14%,transparent);font-family:system-ui,sans-serif;}
.wc-form h3{margin:0 0 4px;font:600 22px Georgia,serif;}
.wc-form label{display:flex;flex-direction:column;gap:4px;font-size:13px;}
.wc-form input{height:38px;border-radius:8px;border:1px solid color-mix(in srgb,var(--wc-ink) 20%,transparent);padding:0 10px;background:white;font:inherit;}
.wc-form .wc-btn{height:44px;margin-top:auto;}
.wc-divider{border:0;border-top:1px solid color-mix(in srgb,var(--wc-ink) 18%,transparent);margin:11px 0;}
.wc-footer{height:100%;display:flex;justify-content:space-between;align-items:center;padding:0 40px;font:14px system-ui,sans-serif;opacity:.75;border-top:1px solid color-mix(in srgb,var(--wc-ink) 12%,transparent);}
`;
