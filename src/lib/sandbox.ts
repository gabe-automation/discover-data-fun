import { esc } from "./blocks";

/** Opens site HTML in a new tab inside a sandboxed frame, so block scripts can't reach the editor's session. */
export function openSandboxed(html: string, title = "Preview"): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe sandbox="allow-scripts allow-forms allow-popups allow-modals" srcdoc="${esc(html)}"></iframe></body></html>`);
  w.document.close();
  return true;
}

export async function downloadSiteZip(pages: Record<string, string>, homeId: string | null, name: string, host?: string) {
  const JSZip = (await import("jszip")).default;
  const z = new JSZip();
  const media = new Map<string, string>();
  for (const html of Object.values(pages)) {
    for (const match of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
      const src = match[1];
      if (!src || media.has(src) || src.startsWith("data:")) continue;
      const response = await fetch(src);
      if (!response.ok) throw new Error("A site image could not be packaged. Please try again.");
      const filename = `assets/image-${media.size + 1}.${src.split("?")[0]?.split(".").pop()?.match(/^(png|jpg|jpeg|webp|gif|svg)$/i)?.[0] ?? "jpg"}`;
      z.file(filename, await response.arrayBuffer());
      media.set(src, filename);
    }
  }
  const fix = (h: string) => h.replace(/\?page=([0-9a-f-]{36})/gi, (_, id: string) => (id === homeId ? "index.html" : `page-${id}.html`));
  for (const [id, html] of Object.entries(pages)) {
    let packaged = fix(html);
    for (const [src, filename] of media) packaged = packaged.replaceAll(src, filename);
    z.file(id === homeId ? "index.html" : `page-${id}.html`, packaged);
  }
  z.file(".htaccess", "DirectoryIndex index.html\nOptions -Indexes\n");
  z.file("404.html", "<!doctype html><meta charset=\"utf-8\"><title>Page not found</title><main style=\"font:16px system-ui;padding:3rem\"><h1>Page not found</h1><p><a href=\"index.html\">Return home</a></p></main>");
  z.file("README.txt", `PRECONFIGURED WEBCRAFT SITE\n\nThis package is ready for ${host ?? "standard static"} hosting. No build command or code setup is needed.\n\n1. Upload every file in this folder to your website root (usually public_html).\n2. Keep index.html, .htaccess and the page-*.html files together.\n3. Open your domain and confirm the home page and page links work.\n\nTo update the site later, download a fresh package and replace these files.\n`);
  const blob = await z.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "site"}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
