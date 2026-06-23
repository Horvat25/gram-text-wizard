import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Loader2, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadVideoToStorage } from "@/lib/video-encoder";
import { useWorkspace } from "@/hooks/useWorkspace";

/**
 * ImportReelDialog — importa Reels JÁ PRONTOS (MP4 do TikTok/YouTube/Higgsfield)
 * pra fila. NÃO gera vídeo: sobe o(s) arquivo(s) pro bucket post-videos e cria
 * post media_type='reels'. Usa o login atual (sem service key).
 *
 * Em LOTE, casa cada arquivo com /tiktok-import-manifest.json (legenda + hashtags
 * + orientação reais dos sidecars), PULA os horizontais (não são 9:16) e AGENDA
 * automaticamente 2/dia em horário de pico (BRT).
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BLOG = "https://neural-update.com.br";

interface ManifestEntry {
  caption: string;
  hashtags: string[];
  orientation: string;
  format?: string;
}

function prettifyName(file: string) {
  return file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function defaultCaption(name: string) {
  return `${prettifyName(name)}\n\nMais ciência e tecnologia no nosso blog Neural Update 👉 ${BLOG}`;
}

// 2 por dia (12h e 19h BRT = UTC-3), começando amanhã.
function buildSchedule(count: number): string[] {
  const HOURS_BRT = [12, 19];
  const slots: string[] = [];
  const now = new Date();
  let day = 1;
  while (slots.length < count) {
    for (const h of HOURS_BRT) {
      if (slots.length >= count) break;
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + day);
      d.setUTCHours(h + 3, 0, 0, 0); // BRT→UTC
      slots.push(d.toISOString());
    }
    day++;
  }
  return slots;
}

export function ImportReelDialog({ open, onOpenChange }: Props) {
  const { currentWorkspace } = useWorkspace();
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFiles([]);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setCaption("");
    setBusy(false);
    setProgress("");
  };

  const onPick = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const list = Array.from(picked);
    setFiles(list);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(list[0]));
    if (list.length === 1) setCaption(defaultCaption(list[0].name));
    else setCaption("");
  };

  const handleImport = async () => {
    console.log("[ImportReel] click Import", { files: files.length, workspace: currentWorkspace?.id });
    if (files.length === 0) { toast.error("Escolha um ou mais arquivos MP4"); return; }
    if (!currentWorkspace) { toast.error("Selecione um workspace primeiro"); return; }
    setBusy(true);
    setProgress("Preparando...");
    toast.info(`Iniciando importação de ${files.length} arquivo(s)...`);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log("[ImportReel] user:", user?.id);
      if (!user) { toast.error("Você precisa estar logado"); setBusy(false); return; }

      // Manifesto com legendas/hashtags/orientação reais dos sidecars.
      let manifest: Record<string, ManifestEntry> = {};
      try {
        const res = await fetch("/tiktok-import-manifest.json", { cache: "no-cache" });
        if (res.ok) manifest = await res.json();
      } catch { /* sem manifesto → usa nome do arquivo */ }

      // Pula horizontais (não são 9:16 → ficariam com tarja preta no celular).
      const toImport = files.filter((f) => manifest[f.name]?.orientation !== "horizontal");
      const skipped = files.filter((f) => manifest[f.name]?.orientation === "horizontal");
      if (skipped.length) {
        toast.info(`Pulando ${skipped.length} vídeo(s) horizontal(is) — não são formato Reels.`);
      }
      if (toImport.length === 0) { toast.error("Nenhum vídeo vertical (9:16) para importar."); setBusy(false); return; }

      const schedule = buildSchedule(toImport.length);
      let ok = 0;
      const failures: string[] = [];

      for (let i = 0; i < toImport.length; i++) {
        const f = toImport[i];
        const meta = manifest[f.name];
        setProgress(`Subindo ${i + 1}/${toImport.length}: ${f.name}`);
        try {
          const video_url = await uploadVideoToStorage(f, supabase, "post-videos");
          const cap = (files.length === 1 && caption.trim())
            ? caption.trim()
            : (meta?.caption ? `${meta.caption}${meta.hashtags?.length ? "\n\n" + meta.hashtags.join(" ") : ""}` : defaultCaption(f.name));
          const hashtags = meta?.hashtags?.length
            ? meta.hashtags
            : (cap.match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 30);
          const { error } = await supabase.from("posts").insert({
            caption: cap,
            hashtags,
            post_type: meta?.format || "conhecimento",
            status: "scheduled",
            scheduled_for: schedule[i],
            video_url,
            media_type: "reels",
            platforms: ["instagram"],
            user_id: user.id,
            workspace_id: currentWorkspace.id,
          } as any);
          if (error) throw error;
          ok++;
        } catch (e: any) {
          console.error("[ImportReel]", f.name, e);
          failures.push(f.name);
        }
      }

      if (ok > 0) toast.success(`${ok} Reels importado(s) e AGENDADO(s) (2/dia, pico BRT)! 🎬`);
      if (failures.length) toast.error(`Falhou: ${failures.join(", ")}`);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      console.error("[ImportReel]", e);
      toast.error(e?.message || "Falha ao importar");
      setBusy(false);
      setProgress("");
    }
  };

  const multiple = files.length > 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { if (!o) reset(); onOpenChange(o); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Reels prontos</DialogTitle>
          <DialogDescription>
            Selecione um ou VÁRIOS MP4 já prontos. Em lote: usa a legenda completa de cada vídeo,
            pula os horizontais e AGENDA automático (2/dia, horário de pico). Tudo 9:16, certinho pro celular.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/*"
            multiple
            className="hidden"
            onChange={(e) => onPick(e.target.files)}
          />
          <Button variant="outline" className="w-full" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload className="h-4 w-4 mr-2" />
            {files.length === 0 ? "Escolher arquivo(s) MP4" : multiple ? `${files.length} vídeos selecionados` : files[0].name}
          </Button>

          {previewUrl && !multiple && (
            <video src={previewUrl} controls className="w-full max-h-64 rounded-md bg-black" />
          )}

          {multiple ? (
            <>
              <div className="text-sm text-muted-foreground max-h-32 overflow-auto rounded-md border p-2">
                {files.map((f) => <div key={f.name}>• {prettifyName(f.name)}</div>)}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                Legendas completas + agendamento automático (2/dia). Horizontais são pulados.
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="reel-caption">Legenda (Instagram)</Label>
              <Textarea
                id="reel-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={6}
                placeholder="Legenda do Reels + hashtags..."
                disabled={busy}
              />
            </div>
          )}

          {busy && progress && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />{progress}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleImport} disabled={busy || files.length === 0}>
            {busy
              ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</>)
              : multiple ? `Importar e agendar ${files.length}` : "Importar pra fila"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportReelDialog;
