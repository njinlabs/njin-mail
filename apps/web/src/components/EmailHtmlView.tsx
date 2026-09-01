import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { ShieldAlert } from "lucide-react";

interface Props {
  html: string;
}

const REMOTE_URL_RE = /^https?:\/\//i;
const REMOTE_STYLE_URL_RE = /url\(\s*['"]?https?:\/\//i;

/**
 * Sanitizes email HTML and, unless `allowRemote` is set, strips remote image
 * sources / CSS url() references (the classic tracking-pixel vector) so
 * nothing loads off-device until the user opts in for that message — the
 * same default Thunderbird and most mail clients use. Links are forced to
 * open in a new tab without giving the email page a handle back (`noopener`).
 */
function sanitizeEmailHtml(html: string, allowRemote: boolean): { clean: string; blockedRemote: boolean } {
  let blockedRemote = false;

  const hook = (node: Element) => {
    if (!node.tagName) return;

    if (node.tagName === "IMG") {
      const src = node.getAttribute("src");
      if (src && REMOTE_URL_RE.test(src) && !allowRemote) {
        node.setAttribute("data-blocked-src", src);
        node.removeAttribute("src");
        blockedRemote = true;
      }
    }

    const style = node.getAttribute("style");
    if (style && REMOTE_STYLE_URL_RE.test(style) && !allowRemote) {
      node.removeAttribute("style");
      blockedRemote = true;
    }

    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  };

  DOMPurify.addHook("afterSanitizeAttributes", hook);
  const clean = DOMPurify.sanitize(html, {
    FORBID_TAGS: ["iframe", "object", "embed", "form"],
    ADD_ATTR: ["target"],
  });
  DOMPurify.removeHook("afterSanitizeAttributes");

  return { clean, blockedRemote };
}

const IFRAME_STYLES = `
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 14px; color: #262626; word-wrap: break-word; }
  img { max-width: 100%; height: auto; }
  a { color: #171717; }
`;

export function EmailHtmlView({ html }: Props) {
  const [allowRemote, setAllowRemote] = useState(false);
  const [height, setHeight] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setAllowRemote(false);
    setHeight(0);
  }, [html]);

  const { clean, blockedRemote } = useMemo(
    () => sanitizeEmailHtml(html, allowRemote),
    [html, allowRemote]
  );

  const doc = `<!doctype html><html><head><meta charset="utf-8" /><style>${IFRAME_STYLES}</style></head><body>${clean}</body></html>`;

  function handleLoad() {
    const body = iframeRef.current?.contentDocument?.body;
    if (body) setHeight(body.scrollHeight + 8);
  }

  return (
    <div>
      {blockedRemote && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            Konten dari luar (gambar) diblokir untuk melindungi privasi Anda.
          </span>
          <button
            type="button"
            onClick={() => setAllowRemote(true)}
            className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Tampilkan konten
          </button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Isi email"
        // No allow-scripts: the email body can never run JS. allow-same-origin
        // is safe to include *without* allow-scripts (the dangerous case is
        // only when both are combined) — it's needed so the parent can read
        // contentDocument to auto-size the frame; without it that access is
        // blocked and the iframe silently renders at height 0.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={doc}
        onLoad={handleLoad}
        style={{ width: "100%", height, border: "none", display: "block" }}
      />
    </div>
  );
}
