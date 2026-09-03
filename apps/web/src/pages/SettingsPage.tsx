import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSettings, updateSettings } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { data: session, isLoading: sessionLoading } = useSession();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!sessionLoading && !session) navigate("/login", { replace: true });
  }, [session, sessionLoading, navigate]);

  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings, enabled: !!session });

  useEffect(() => {
    if (settingsQuery.data) setDisplayName(settingsQuery.data.displayName ?? "");
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: () => updateSettings(displayName.trim() || null),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], data);
      toast.success("Pengaturan disimpan");
    },
    onError: () => toast.error("Gagal menyimpan pengaturan"),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  if (!session) return null;

  return (
    <div className="flex min-h-dvh flex-col bg-white text-neutral-900">
      <header className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-4 py-2.5 text-neutral-100">
        <Link
          to="/mail"
          className="rounded-md p-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
          aria-label="Kembali ke Mail"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="text-base font-semibold tracking-tight">Pengaturan</span>
      </header>

      <div className="flex flex-1 justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="displayName" className="text-sm font-medium text-neutral-700">
                Nama Pengirim
              </label>
              <input
                id="displayName"
                type="text"
                maxLength={200}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nama yang ditampilkan pada email terkirim"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none ring-neutral-900/10 placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-4"
              />
              <p className="text-xs text-neutral-500">
                Muncul sebagai nama pengirim pada email yang Anda kirim, misalnya "{displayName || "Nama Anda"} &lt;{session.user.email}&gt;".
              </p>
            </div>

            <button
              type="submit"
              disabled={mutation.isPending || settingsQuery.isLoading}
              className={cn(
                "flex items-center justify-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
