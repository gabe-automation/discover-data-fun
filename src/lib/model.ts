import { BLOCKS, BLOCK_CSS, BOX_KEYS, BREAKPOINTS, STYLE_KEYS, attrString, blockHtml, type BoxOpts, styleCss, themeVars, esc, type BlockStyle, type BlockType, type Breakpoint, type Theme } from "./blocks";
import { val, type Props } from "./crdt";

export type Geo = { x: number; y: number; w: number; h: number };
export type NodeView = {
  id: string;
  type: BlockType;
  parent: string | null;
  order: string;
  text: string;
  sub: string;
  label: string;
  href: string;
  page: string | null;
  style: BlockStyle;
  attrs: Record<string, string>;
  script: string;
  box: BoxOpts;
  geo: Record<Breakpoint, Geo>;
};

export function styleOf(p: Props): BlockStyle {
  const o: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) {
    const v = val<unknown>(p, `s.${k}`, undefined);
    if (v !== undefined && v !== "") o[k] = v;
  }
  return o as BlockStyle;
}

export function boxOf(p: Props): BoxOpts {
  const o: Record<string, unknown> = {};
  for (const k of BOX_KEYS) { const v = val<unknown>(p, `c.${k}`, undefined); if (v !== undefined && v !== null && v !== "") o[k] = v; }
  return o as BoxOpts;
}

export function geoFor(p: Props, bp: Breakpoint): Geo {
  const d: Geo = {
    x: val(p, "x@desktop", 0),
    y: val(p, "y@desktop", 0),
    w: val(p, "w@desktop", 200),
    h: val(p, "h@desktop", 80),
  };
  if (bp === "desktop") return d;
  const pageW = BREAKPOINTS[bp].width;
  const ratio = pageW / BREAKPOINTS.desktop.width;
  const derived: Geo =
    bp === "mobile"
      ? { x: 12, y: Math.round(d.y * 1.15), w: pageW - 24, h: d.h }
      : { x: Math.round(d.x * ratio), y: d.y, w: Math.min(pageW, Math.round(d.w * ratio)), h: d.h };
  return {
    x: val(p, `x@${bp}`, derived.x),
    y: val(p, `y@${bp}`, derived.y),
    w: val(p, `w@${bp}`, derived.w),
    h: val(p, `h@${bp}`, derived.h),
  };
}

export function toView(id: string, p: Props): NodeView | null {
  if (val(p, "deleted", false)) return null;
  const type = val<string>(p, "type", "") as BlockType;
  const def = BLOCKS[type];
  if (!def) return null;
  return {
    id,
    type,
    parent: val<string | null>(p, "parent", null),
    order: val(p, "order", "m"),
    text: val(p, "text", def.text),
    sub: val(p, "sub", def.sub),
    label: val(p, "label", def.label),
    href: val(p, "href", ""),
    page: val<string | null>(p, "page", null),
    style: styleOf(p),
    attrs: val<Record<string, string>>(p, "attrs", {}) ?? {},
    script: val(p, "script", ""),
    box: boxOf(p),
    geo: { desktop: geoFor(p, "desktop"), tablet: geoFor(p, "tablet"), mobile: geoFor(p, "mobile") },
  };
}

export function pageHeight(nodes: NodeView[], bp: Breakpoint): number {
  let m = 700;
  for (const n of nodes) m = Math.max(m, n.geo[bp].y + n.geo[bp].h + 120);
  return m;
}

const shortId = (id: string) => "n" + id.replace(/-/g, "").slice(0, 8);

export function generateExport(nodes: NodeView[], theme: Theme, title: string) {
  const sorted = [...nodes].sort((a, b) => a.geo.desktop.y - b.geo.desktop.y || a.geo.desktop.x - b.geo.desktop.x);
  const body = sorted
    .map((n) => `    <div class="wc-el" id="${shortId(n.id)}"${n.type === "input" ? "" : attrString(n.attrs)}>\n      ${blockHtml(n.type, n, shortId(n.id))}\n    </div>`)
    .join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="wc-page">
${body}
  </main>
  <div id="wc-live" class="wc-sr" aria-live="polite"></div>
  <script src="script.js"></script>
</body>
</html>
`;
  const rules = (bp: Breakpoint) =>
    sorted
      .map((n) => {
        const g = n.geo[bp];
        return `  #${shortId(n.id)}{${bp === "desktop" ? styleCss(n.style) : ""}left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px;z-index:${sorted.indexOf(n) + 1};}`;
      })
      .join("\n");
  const css = `:root{${themeVars(theme)}}
body{margin:0;background:var(--wc-surface);}
.wc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);}
${BLOCK_CSS.trim()}
.wc-page{width:${BREAKPOINTS.desktop.width}px;min-height:${pageHeight(nodes, "desktop")}px;margin:0 auto;}
${rules("desktop")}
@media ${BREAKPOINTS.tablet.query}{
  .wc-page{width:${BREAKPOINTS.tablet.width}px;min-height:${pageHeight(nodes, "tablet")}px;}
${rules("tablet")}
}
@media ${BREAKPOINTS.mobile.query}{
  .wc-page{width:${BREAKPOINTS.mobile.width}px;min-height:${pageHeight(nodes, "mobile")}px;}
${rules("mobile")}
}
`;
  const scripts = sorted.filter((n) => n.script.trim()).map((n) => {
    const sid = shortId(n.id);
    const code = n.script.replace(/<\/script/gi, "<\\/script").split("\n").map((l) => "    " + l).join("\n");
    return `// ${BLOCKS[n.type].name}${n.text ? ` "${n.text.slice(0, 30).replace(/\n/g, " ")}"` : ""} · #${sid}
(function (el, input) {
  if (!el) return;
  try {
${code}
  } catch (err) { console.error("[WebCraft] #${sid}", err); }
})(document.getElementById("${sid}"), document.querySelector("#${sid} input, #${sid} textarea, #${sid} select"));`;
  });
  const js = `// WebCraft site runtime\n// Add block-specific logic from Edit → Logic. It will appear below.\n\ndocument.addEventListener("click", (event) => {\n  if (!(event.target instanceof Element)) return;\n  const link = event.target.closest('a[href^="#"]');\n  if (!link) return;\n  const target = document.getElementById(link.getAttribute("href").slice(1));\n  if (target) {\n    event.preventDefault();\n    target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });\n  }\n});\n\n${scripts.length ? scripts.join("\n\n") : "// No block-specific logic has been added yet."}\n`;
  return { html, css, js };
}
