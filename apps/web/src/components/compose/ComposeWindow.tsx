import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TiptapImage from "@tiptap/extension-image";
import { toast } from "sonner";
import {
  Bold,
  File as FileIcon,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Paperclip,
  Send,
  Trash2,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";
import { sendMessage, type AttachmentInput, type InlineAttachmentInput } from "@/lib/api";
import { cn, formatBytes } from "@/lib/utils";

const MAX_FILE_ATTACHMENT_SIZE = 15 * 1024 * 1024; // 15MB, mirrors the server-side cap
const MAX_FILE_ATTACHMENTS = 10;

interface StagedFile {
  id: string;
  name: string;
  size: number;
  contentType: string;
  contentBase64: string;
}

export interface ComposeInitial {
  to?: string;
  cc?: string;
  subject?: string;
  bodyHtml?: string;
  replyToMessageId?: string;
}

interface ComposeWindowProps {
  onClose: () => void;
  initial?: ComposeInitial;
}

const DATA_URI_RE = /^data:([^;]+);base64,(.*)$/s;

/**
 * Replaces every `data:` image src in the composed HTML with a `cid:`
 * reference and returns the extracted binary as inline attachments — emails
 * embed images as MIME parts (what every real mail client does), not as
 * base64 baked into the HTML, which bloats the message and gets flagged by
 * spam filters.
 */
function extractInlineImages(html: string): { html: string; attachments: InlineAttachmentInput[] } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const attachments: InlineAttachmentInput[] = [];

  doc.querySelectorAll("img").forEach((img, index) => {
    const src = img.getAttribute("src");
    const match = src ? DATA_URI_RE.exec(src) : null;
    if (!match) return;

    const [, contentType, contentBase64] = match;
    const cid = `${crypto.randomUUID()}@njin-mail`;
    const ext = contentType!.split("/")[1] ?? "png";
    img.setAttribute("src", `cid:${cid}`);
    attachments.push({
      cid,
      filename: img.getAttribute("alt") || `image-${index + 1}.${ext}`,
      contentType: contentType!,
      contentBase64: contentBase64!,
    });
  });

  return { html: doc.body.innerHTML, attachments };
}

type WindowState = "normal" | "maximized" | "minimized";

function parseEmailList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,;]/)
        .map((v) => v.trim())
        .filter(Boolean)
    )
  );
}

export function ComposeWindow({ onClose, initial }: ComposeWindowProps) {
  const queryClient = useQueryClient();
  const [windowState, setWindowState] = useState<WindowState>("normal");
  const [showCcBcc, setShowCcBcc] = useState(!!initial?.cc);
  const [to, setTo] = useState(initial?.to ?? "");
  const [cc, setCc] = useState(initial?.cc ?? "");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [richMode, setRichMode] = useState(!!initial?.bodyHtml);
  const [plainText, setPlainText] = useState("");
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    content: initial?.bodyHtml ?? "",
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TiptapImage,
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[160px] flex-1 text-sm text-neutral-800 outline-none [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-neutral-900 [&_a]:underline [&_img]:max-w-full [&_img]:rounded",
      },
    },
  });

  function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;

    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran gambar maksimal 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result as string, alt: file.name }).run();
    };
    reader.readAsDataURL(file);
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    if (stagedFiles.length + files.length > MAX_FILE_ATTACHMENTS) {
      toast.error(`Maksimal ${MAX_FILE_ATTACHMENTS} file lampiran`);
      return;
    }

    for (const file of files) {
      if (file.size > MAX_FILE_ATTACHMENT_SIZE) {
        toast.error(`${file.name} melebihi batas ukuran ${formatBytes(MAX_FILE_ATTACHMENT_SIZE)}`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const contentBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        setStagedFiles((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
            contentBase64,
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
  }

  function removeStagedFile(id: string) {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function toggleRichMode() {
    if (!editor) return;
    if (!richMode) {
      // switching plain -> rich: seed the editor with the plain text
      editor.commands.setContent(plainText ? `<p>${plainText.replace(/\n/g, "<br>")}</p>` : "");
    } else {
      // switching rich -> plain: flatten formatting into plain text
      setPlainText(editor.getText());
    }
    setRichMode(!richMode);
  }

  function openLinkPopover() {
    const existing = editor?.getAttributes("link").href as string | undefined;
    setLinkUrl(existing ?? "");
    setLinkPopoverOpen(true);
  }

  function applyLink() {
    if (!editor) return;
    const url = linkUrl.trim();
    if (url) {
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkPopoverOpen(false);
  }

  function removeLink() {
    editor?.chain().focus().unsetLink().run();
    setLinkPopoverOpen(false);
  }

  const sendMutation = useMutation({
    mutationFn: sendMessage,
    onSuccess: () => {
      toast.success("Pesan terkirim");
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      onClose();
    },
    onError: () => {
      toast.error("Gagal mengirim pesan. Coba lagi.");
    },
  });

  function handleSend() {
    const toList = parseEmailList(to);
    if (toList.length === 0) {
      toast.error("Isi alamat penerima terlebih dahulu");
      return;
    }
    const ccList = parseEmailList(cc);
    const bccList = parseEmailList(bcc);
    const body = richMode ? editor?.getHTML() ?? "" : plainText;
    if (!body.trim()) {
      toast.error("Isi pesan terlebih dahulu");
      return;
    }

    const { html: outgoingHtml, attachments: inlineAttachments } = richMode
      ? extractInlineImages(body)
      : { html: body, attachments: [] };

    const attachments: AttachmentInput[] = stagedFiles.map((f) => ({
      filename: f.name,
      contentType: f.contentType,
      contentBase64: f.contentBase64,
    }));

    sendMutation.mutate({
      to: toList,
      cc: ccList.length ? ccList : undefined,
      bcc: bccList.length ? bccList : undefined,
      subject: subject.trim() || "(Tanpa subjek)",
      text: richMode ? undefined : body,
      html: richMode ? outgoingHtml : undefined,
      inlineAttachments: inlineAttachments.length ? inlineAttachments : undefined,
      attachments: attachments.length ? attachments : undefined,
      replyToMessageId: initial?.replyToMessageId,
    });
  }

  if (windowState === "minimized") {
    return (
      <div className="fixed inset-x-3 bottom-0 z-40 overflow-hidden rounded-t-lg border border-b-0 border-neutral-800 bg-neutral-900 shadow-2xl sm:inset-x-auto sm:right-6 sm:w-72">
        <button
          type="button"
          onClick={() => setWindowState("normal")}
          className="flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="truncate text-sm text-neutral-100">{subject || "Pesan baru"}</span>
          <span className="flex shrink-0 items-center gap-1">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          </span>
        </button>
      </div>
    );
  }

  const maximized = windowState === "maximized";

  return (
    <div
      className={cn(
        "fixed z-40 flex flex-col overflow-hidden border border-neutral-300 bg-white shadow-2xl",
        maximized
          ? "inset-3 rounded-lg sm:inset-8"
          : "inset-x-0 bottom-0 h-[85vh] rounded-t-lg sm:inset-x-auto sm:right-6 sm:h-[32rem] sm:w-[28rem]"
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between bg-neutral-900 px-3 py-2">
        <span className="truncate text-sm font-medium text-neutral-100">
          {subject || "Pesan baru"}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWindowState("minimized")}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            aria-label="Perkecil"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setWindowState(maximized ? "normal" : "maximized")}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            aria-label={maximized ? "Kembalikan" : "Perbesar"}
          >
            {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            aria-label="Tutup"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="flex shrink-0 flex-col border-b border-neutral-200 px-3">
        <div className="flex items-center border-b border-neutral-100 py-2">
          <label className="w-12 shrink-0 text-xs text-neutral-400">Kepada</label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="nama@domain.com"
            className="flex-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
          />
          {!showCcBcc && (
            <button
              type="button"
              onClick={() => setShowCcBcc(true)}
              className="shrink-0 text-xs text-neutral-400 hover:text-neutral-700"
            >
              Cc/Bcc
            </button>
          )}
        </div>

        {showCcBcc && (
          <>
            <div className="flex items-center border-b border-neutral-100 py-2">
              <label className="w-12 shrink-0 text-xs text-neutral-400">Cc</label>
              <input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="flex-1 text-sm text-neutral-900 outline-none"
              />
            </div>
            <div className="flex items-center border-b border-neutral-100 py-2">
              <label className="w-12 shrink-0 text-xs text-neutral-400">Bcc</label>
              <input
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                className="flex-1 text-sm text-neutral-900 outline-none"
              />
            </div>
          </>
        )}

        <div className="flex items-center py-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subjek"
            className="flex-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
          />
        </div>
      </div>

      {/* Mode toggle + formatting toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <ToolbarButton
            active={false}
            onClick={() => fileInputRef.current?.click()}
            icon={Paperclip}
            label="Lampirkan file"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />
          {richMode && editor && (
            <>
              <ToolbarButton
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
                icon={Bold}
                label="Tebal"
              />
              <ToolbarButton
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                icon={Italic}
                label="Miring"
              />
              <ToolbarButton
                active={editor.isActive("underline")}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                icon={UnderlineIcon}
                label="Garis bawah"
              />
              <ToolbarButton
                active={editor.isActive("bulletList")}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                icon={List}
                label="Daftar"
              />
              <ToolbarButton
                active={editor.isActive("orderedList")}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                icon={ListOrdered}
                label="Daftar bernomor"
              />
              <ToolbarButton
                active={editor.isActive("link")}
                onClick={openLinkPopover}
                icon={LinkIcon}
                label="Tautan"
              />
              <ToolbarButton
                active={false}
                onClick={() => imageInputRef.current?.click()}
                icon={ImageIcon}
                label="Sisipkan gambar"
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelected}
                className="hidden"
              />
            </>
          )}
        </div>
        <button
          type="button"
          onClick={toggleRichMode}
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            richMode
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
          )}
        >
          Rich Text Editor
        </button>
      </div>

      {linkPopoverOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinkPopoverOpen(false);
            }}
            placeholder="https://contoh.com"
            className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-500"
          />
          <button
            type="button"
            onClick={applyLink}
            className="shrink-0 rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Sisipkan
          </button>
          {editor?.isActive("link") && (
            <button
              type="button"
              onClick={removeLink}
              className="shrink-0 text-xs font-medium text-neutral-500 hover:text-neutral-800"
            >
              Hapus
            </button>
          )}
          <button
            type="button"
            onClick={() => setLinkPopoverOpen(false)}
            className="shrink-0 rounded p-1 text-neutral-400 hover:text-neutral-700"
            aria-label="Tutup"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {stagedFiles.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-2 border-b border-neutral-200 px-3 py-2">
          {stagedFiles.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 py-1 pl-2 pr-1 text-xs text-neutral-700"
            >
              <FileIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              <span className="max-w-[10rem] truncate">{f.name}</span>
              <span className="shrink-0 text-neutral-400">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => removeStagedFile(f.id)}
                className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                aria-label={`Hapus lampiran ${f.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-y-auto px-3 py-2">
        {richMode ? (
          <EditorContent editor={editor} className="flex flex-1 flex-col" />
        ) : (
          <textarea
            value={plainText}
            onChange={(e) => setPlainText(e.target.value)}
            placeholder="Tulis pesan..."
            className="flex-1 resize-none text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-neutral-200 px-3 py-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={sendMutation.isPending}
          className="flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sendMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Kirim
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          aria-label="Buang draf"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Bold;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900",
        active && "bg-neutral-200 text-neutral-900"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
