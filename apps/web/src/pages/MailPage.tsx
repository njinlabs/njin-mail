import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import type { MessageDetailDto } from "@njin-mail/shared";
import {
  Archive,
  AlertOctagon,
  ArrowLeft,
  Download,
  File as FileIcon,
  FileText,
  Flag,
  Folder as FolderIcon,
  Forward,
  Inbox,
  Loader2,
  LogOut,
  Mail,
  MailOpen,
  Menu,
  Printer,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  Settings,
  SquarePen,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  attachmentDownloadUrl,
  getFolders,
  getMessage,
  getMessages,
  logout,
  markMessageUnread,
  moveMessage,
  syncFolderMessages,
  toggleMessageFlag,
  type MoveDestination,
} from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import { cn, formatBytes, formatFolderName } from "@/lib/utils";
import { EmailHtmlView } from "@/components/EmailHtmlView";
import { ComposeWindow, type ComposeInitial } from "@/components/compose/ComposeWindow";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const specialUseIcons: Record<string, LucideIcon> = {
  "\\Inbox": Inbox,
  "\\Sent": Send,
  "\\Drafts": FileText,
  "\\Trash": Trash2,
  "\\Junk": AlertOctagon,
};

const specialUseNames: Record<string, string> = {
  "\\Inbox": "Kotak Masuk",
  "\\Sent": "Terkirim",
  "\\Drafts": "Draf",
  "\\Trash": "Sampah",
  "\\Junk": "Spam",
};

function folderLabel(folder: { name: string; displayName: string; specialUse: string | null }): string {
  return specialUseNames[folder.specialUse ?? ""] ?? formatFolderName(folder.displayName);
}

function initial(label: string | null | undefined): string {
  const trimmed = label?.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "?";
}

function displayName(from: { name: string | null; address: string | null } | null): string {
  if (!from) return "(Tanpa pengirim)";
  return from.name || from.address || "(Tanpa pengirim)";
}

function withPrefix(subject: string | null, prefix: string): string {
  const s = subject ?? "";
  return new RegExp(`^${prefix}:`, "i").test(s) ? s : `${prefix}: ${s}`;
}

function formatMessageDate(date: string | null): string {
  return date ? format(new Date(date), "dd MMM yyyy HH:mm", { locale: idLocale }) : "";
}

function originalBodyHtml(data: MessageDetailDto): string {
  return data.bodyHtml ?? `<p>${(data.bodyText ?? "").replace(/\n/g, "<br>")}</p>`;
}

function buildReplyQuote(data: MessageDetailDto): string {
  return `<p></p><p></p><blockquote style="margin:0 0 0 0.5em;padding-left:1em;border-left:2px solid #d4d4d4;color:#525252;">Pada ${formatMessageDate(data.date)}, ${displayName(data.from)} menulis:<br>${originalBodyHtml(data)}</blockquote>`;
}

function buildForwardQuote(data: MessageDetailDto): string {
  const toLabel = data.to.map((t) => t.address || t.name).filter(Boolean).join(", ");
  return `<p></p><p>---------- Pesan diteruskan ----------<br>Dari: ${displayName(data.from)}<br>Tanggal: ${formatMessageDate(data.date)}<br>Subjek: ${data.subject ?? ""}<br>Kepada: ${toLabel}</p>${originalBodyHtml(data)}`;
}

export default function MailPage() {
  const navigate = useNavigate();
  const { folderId, messageId } = useParams();
  const queryClient = useQueryClient();
  const { data: session, isLoading: sessionLoading, isError: sessionError } = useSession();
  const [composeState, setComposeState] = useState<{ key: string; initial?: ComposeInitial } | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSearchQuery("");
    setSidebarOpen(false);
  }, [folderId]);

  useEffect(() => {
    if (!sessionLoading && sessionError) navigate("/login", { replace: true });
  }, [sessionLoading, sessionError, navigate]);

  const foldersQuery = useQuery({
    queryKey: ["folders"],
    queryFn: getFolders,
    enabled: !!session,
  });
  const folders = foldersQuery.data?.folders ?? [];

  useEffect(() => {
    if (!folderId && folders.length > 0) {
      const inbox = folders.find((f) => f.specialUse === "\\Inbox") ?? folders[0]!;
      navigate(`/mail/${inbox.id}`, { replace: true });
    }
  }, [folderId, folders, navigate]);

  const syncMutation = useMutation({
    mutationFn: (id: string) => syncFolderMessages(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
    },
  });

  useEffect(() => {
    if (folderId) syncMutation.mutate(folderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  const messagesQuery = useQuery({
    queryKey: ["messages", folderId],
    queryFn: () => getMessages(folderId as string),
    enabled: !!folderId,
  });
  const messages = messagesQuery.data?.messages ?? [];

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) =>
      [m.subject, m.from?.name, m.from?.address, m.snippet]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    );
  }, [messages, searchQuery]);

  const messageQuery = useQuery({
    queryKey: ["message", messageId],
    queryFn: () => getMessage(messageId as string),
    enabled: !!messageId,
  });

  useEffect(() => {
    if (messageQuery.data?.flags.includes("\\Seen")) {
      queryClient.invalidateQueries({ queryKey: ["messages", folderId] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageQuery.data?.id]);

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  const unreadMutation = useMutation({
    mutationFn: (id: string) => markMessageUnread(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", folderId] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      navigate(`/mail/${folderId}`);
    },
    onError: () => toast.error("Gagal menandai belum dibaca"),
  });

  const flagMutation = useMutation({
    mutationFn: (id: string) => toggleMessageFlag(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ["message", id] });
    },
    onError: () => toast.error("Gagal menandai pesan"),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, destination }: { id: string; destination: MoveDestination }) =>
      moveMessage(id, destination),
    onSuccess: (_result, { destination }) => {
      queryClient.invalidateQueries({ queryKey: ["messages", folderId] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      const labels: Record<MoveDestination, string> = {
        junk: "Spam",
        trash: "Sampah",
        archive: "Arsip",
      };
      toast.success(`Pesan dipindahkan ke ${labels[destination]}`);
      navigate(`/mail/${folderId}`);
    },
    onError: () => toast.error("Gagal memindahkan pesan"),
  });

  if (sessionLoading || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  const activeFolder = folders.find((f) => f.id === folderId);

  function handleReply() {
    const data = messageQuery.data;
    if (!data) return;
    setComposeState({
      key: crypto.randomUUID(),
      initial: {
        to: data.from?.address ?? "",
        subject: withPrefix(data.subject, "Re"),
        bodyHtml: buildReplyQuote(data),
        replyToMessageId: data.id,
      },
    });
  }

  function handleReplyAll() {
    const data = messageQuery.data;
    if (!data || !session) return;
    const selfEmail = session.user.email.toLowerCase();
    const toAddrs = [data.from?.address, ...data.to.map((t) => t.address)].filter(
      (a): a is string => !!a && a.toLowerCase() !== selfEmail
    );
    const ccAddrs = data.cc
      .map((c) => c.address)
      .filter((a): a is string => !!a && a.toLowerCase() !== selfEmail);
    setComposeState({
      key: crypto.randomUUID(),
      initial: {
        to: Array.from(new Set(toAddrs)).join(", "),
        cc: Array.from(new Set(ccAddrs)).join(", "),
        subject: withPrefix(data.subject, "Re"),
        bodyHtml: buildReplyQuote(data),
        replyToMessageId: data.id,
      },
    });
  }

  function handleForward() {
    const data = messageQuery.data;
    if (!data) return;
    setComposeState({
      key: crypto.randomUUID(),
      initial: {
        subject: withPrefix(data.subject, "Fwd"),
        bodyHtml: buildForwardQuote(data),
      },
    });
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="flex h-dvh flex-col bg-white text-neutral-900 print:h-auto">
      {/* Top bar */}
      <header className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-2.5 text-neutral-100 sm:gap-4 sm:px-4 print:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="shrink-0 rounded-md p-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white md:hidden"
          aria-label="Buka menu folder"
        >
          <Menu className="h-5 w-5" />
        </button>

        <span className="shrink-0 text-base font-semibold tracking-tight sm:text-lg">
          Mail Client
        </span>

        <div className="mx-auto hidden w-full max-w-xl items-center gap-2 rounded-md bg-neutral-800 px-3 py-1.5 text-sm text-neutral-400 sm:flex">
          <Search className="h-4 w-4 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari email di folder ini"
            className="w-full bg-transparent text-neutral-200 outline-none placeholder:text-neutral-500"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 text-sm sm:ml-0 sm:gap-3">
          <span className="hidden text-neutral-300 md:inline">{session.user.email}</span>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="rounded-md p-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
            aria-label="Pengaturan"
          >
            <Settings className="h-4 w-4" />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                aria-label="Keluar"
              >
                <LogOut className="h-4 w-4 sm:hidden" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Yakin ingin keluar?</AlertDialogTitle>
                <AlertDialogDescription>
                  Kamu perlu masuk lagi dengan email dan password untuk mengakses email kamu.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={() => logoutMutation.mutate()}>
                  Keluar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden print:block print:overflow-visible">
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 text-neutral-200 transition-transform duration-200 md:static md:z-auto md:w-56 md:translate-x-0 print:hidden",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="px-4 pb-1 pt-3 text-xs font-medium text-neutral-500">
            {session.user.email}
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
            {foldersQuery.isLoading ? (
              <div className="flex items-center justify-center py-6 text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              folders.map((folder) => {
                const Icon = specialUseIcons[folder.specialUse ?? ""] ?? FolderIcon;
                const active = folder.id === folderId;
                return (
                  <Link
                    key={folder.id}
                    to={`/mail/${folder.id}`}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                      active ? "bg-neutral-700 text-white" : "text-neutral-300 hover:bg-neutral-800"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{folderLabel(folder)}</span>
                    </span>
                    {folder.unreadCount > 0 && (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 text-xs",
                          active ? "bg-white/20" : "bg-neutral-700 text-neutral-200"
                        )}
                      >
                        {folder.unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })
            )}
          </nav>
        </aside>

        {/* Message list */}
        <section
          className={cn(
            "w-full shrink-0 flex-col overflow-hidden border-r border-neutral-200 md:flex md:w-96 print:hidden",
            messageId ? "hidden" : "flex"
          )}
        >
          <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-700">
              {activeFolder ? folderLabel(activeFolder) : "..."}
            </h2>
            <button
              type="button"
              onClick={() => {
                if (folderId) syncMutation.mutate(folderId);
                queryClient.invalidateQueries({ queryKey: ["folders"] });
              }}
              disabled={syncMutation.isPending}
              className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed"
              aria-label="Segarkan"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", syncMutation.isPending && "animate-spin")} />
            </button>
          </header>

          <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-2 sm:hidden">
            <Search className="h-4 w-4 shrink-0 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari email di folder ini"
              className="w-full text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {messagesQuery.isLoading ? (
              <div className="flex h-full items-center justify-center text-neutral-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                {searchQuery ? "Tidak ada pesan yang cocok" : "Tidak ada pesan"}
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {filteredMessages.map((m) => {
                  const unread = !m.flags.includes("\\Seen");
                  const selected = m.id === messageId;
                  return (
                    <li key={m.id}>
                      <Link
                        to={`/mail/${folderId}/${m.id}`}
                        className={cn(
                          "flex gap-3 px-4 py-3 hover:bg-neutral-50",
                          selected && "bg-neutral-100 hover:bg-neutral-100"
                        )}
                      >
                        <div className="relative shrink-0">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-600">
                            {initial(m.from?.name || m.from?.address)}
                          </div>
                          {unread && (
                            <span className="absolute -left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-neutral-900" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                "truncate text-sm",
                                unread ? "font-semibold text-neutral-900" : "text-neutral-700"
                              )}
                            >
                              {displayName(m.from)}
                            </span>
                            <span className="shrink-0 text-xs text-neutral-400">
                              {m.date
                                ? format(new Date(m.date), "dd MMM yyyy", { locale: idLocale })
                                : ""}
                            </span>
                          </div>
                          <div
                            className={cn(
                              "truncate text-sm",
                              unread ? "font-medium text-neutral-900" : "text-neutral-600"
                            )}
                          >
                            {m.subject || "(Tanpa subjek)"}
                          </div>
                          {m.snippet && (
                            <div className="truncate text-xs text-neutral-400">{m.snippet}</div>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Message detail */}
        <main
          className={cn(
            "w-full flex-col overflow-hidden bg-white md:flex md:flex-1 print:block print:overflow-visible",
            messageId ? "flex" : "hidden"
          )}
        >
          {!messageId ? (
            <div className="hidden h-full flex-col items-center justify-center gap-2 text-neutral-300 md:flex">
              <Mail className="h-10 w-10" />
              <span className="text-sm text-neutral-400">Pilih pesan untuk dibaca</span>
            </div>
          ) : messageQuery.isLoading ? (
            <div className="flex h-full items-center justify-center text-neutral-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : messageQuery.data ? (
            <div className="flex h-full flex-col overflow-hidden">
              <button
                type="button"
                onClick={() => navigate(`/mail/${folderId}`)}
                className="flex items-center gap-1.5 px-6 pt-4 text-sm text-neutral-500 hover:text-neutral-800 md:hidden print:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
                Kembali
              </button>

              <div className="px-6 pb-4 pt-4 md:pt-6">
                <h1 className="text-xl font-semibold text-neutral-900">
                  {messageQuery.data.subject || "(Tanpa subjek)"}
                </h1>
              </div>

              <div className="flex items-start justify-between gap-4 px-6 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-sm font-medium text-neutral-600">
                    {initial(messageQuery.data.from?.name || messageQuery.data.from?.address)}
                  </div>
                  <div className="text-sm">
                    <div className="font-medium text-neutral-900">
                      {displayName(messageQuery.data.from)}
                    </div>
                    <div className="text-neutral-500">
                      Kepada:{" "}
                      {messageQuery.data.to.map((t) => t.address || t.name).filter(Boolean).join(", ") ||
                        "-"}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-neutral-400">
                  {messageQuery.data.date
                    ? format(new Date(messageQuery.data.date), "dd MMM yyyy HH:mm", { locale: idLocale })
                    : ""}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-6 pb-4 print:hidden">
                <button
                  type="button"
                  onClick={handleReply}
                  className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
                >
                  <Reply className="h-3.5 w-3.5" />
                  Balas
                </button>
                {(() => {
                  const data = messageQuery.data;
                  const isFlagged = data.flags.includes("\\Flagged");
                  const actions = [
                    { icon: ReplyAll, label: "Balas Semua", onClick: handleReplyAll },
                    { icon: Forward, label: "Teruskan", onClick: handleForward },
                    {
                      icon: Archive,
                      label: "Arsipkan",
                      onClick: () => moveMutation.mutate({ id: data.id, destination: "archive" }),
                      disabled: moveMutation.isPending,
                    },
                    {
                      icon: MailOpen,
                      label: "Belum Dibaca",
                      onClick: () => unreadMutation.mutate(data.id),
                      disabled: unreadMutation.isPending,
                    },
                    {
                      icon: Flag,
                      label: isFlagged ? "Batal Tandai" : "Tandai",
                      onClick: () => flagMutation.mutate(data.id),
                      disabled: flagMutation.isPending,
                      active: isFlagged,
                    },
                    {
                      icon: AlertOctagon,
                      label: "Spam",
                      onClick: () => moveMutation.mutate({ id: data.id, destination: "junk" }),
                      disabled: moveMutation.isPending,
                    },
                    { icon: Printer, label: "Cetak", onClick: handlePrint },
                    {
                      icon: Trash2,
                      label: "Hapus",
                      onClick: () => moveMutation.mutate({ id: data.id, destination: "trash" }),
                      disabled: moveMutation.isPending,
                    },
                  ];
                  return actions.map(({ icon: Icon, label, onClick, disabled, active }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={onClick}
                      disabled={disabled}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50",
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ));
                })()}
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6 print:overflow-visible">
                {messageQuery.data.bodyHtml ? (
                  <EmailHtmlView key={messageQuery.data.id} html={messageQuery.data.bodyHtml} />
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-neutral-800">
                    {messageQuery.data.bodyText || "(Tidak ada isi pesan)"}
                  </p>
                )}

                {messageQuery.data.attachments.length > 0 && (
                  <div className="mt-6 border-t border-neutral-200 pt-4">
                    <div className="mb-2 text-xs font-medium text-neutral-500">
                      {messageQuery.data.attachments.length} Lampiran
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {messageQuery.data.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={attachmentDownloadUrl(messageQuery.data!.id, att.id)}
                          download={att.filename ?? undefined}
                          className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                        >
                          <FileIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                          <span className="max-w-[10rem] truncate">{att.filename ?? "File"}</span>
                          {att.size != null && (
                            <span className="shrink-0 text-xs text-neutral-400">
                              {formatBytes(att.size)}
                            </span>
                          )}
                          <Download className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {!composeState && (
        <button
          type="button"
          onClick={() => setComposeState({ key: crypto.randomUUID() })}
          className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg hover:bg-neutral-800 print:hidden"
          aria-label="Tulis pesan baru"
        >
          <SquarePen className="h-5 w-5" />
        </button>
      )}

      {composeState && (
        <ComposeWindow
          key={composeState.key}
          initial={composeState.initial}
          onClose={() => setComposeState(null)}
        />
      )}
    </div>
  );
}
