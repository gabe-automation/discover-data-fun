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
  const fix = (h: string) => h.replace(/\?page=([0-9a-f-]{36})/gi, (_, id: string) => (id === homeId ? "index.html" : `page-${id}.html`));
  for (const [id, html] of Object.entries(pages)) z.file(id === homeId ? "index.html" : `page-${id}.html`, fix(html));
  z.file(".htaccess", "DirectoryIndex index.html\nOptions -Indexes\n");
  z.file("README.txt", `Upload every file in this folder${host ? ` to your ${host}` : ""} website root (usually public_html).\nindex.html is your home page.\n`);
  const blob = await z.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "site"}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
