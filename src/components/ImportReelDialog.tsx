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
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadVideoToStorage } from "@/lib/video-encoder";
import { useWorkspace } from "@/hooks/useWorkspace";

/**
 * ImportReelDialog — importa Reels JÁ PRONTOS (MP4 do YouTube/TikTok/Higgsfield)
 * pra fila. NÃO gera vídeo: sobe o(s) arquivo(s) pro bucket post-videos e cria
 * post media_type='reels' status='draft'. Usa o login atual (sem service key).
 *
 * Suporta VÁRIOS arquivos de uma vez: selecione todos os MP4 e ele importa em
 * lote, gerando uma legenda a partir do nome de cada arquivo (edite depois na fila).
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BLOG = "https://neural-update.com.br";

function prettifyName(file: string) {
  return file
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function defaultCaption(name: string) {
  return `${prettifyName(name)}\n\nMais ciência e tecnologia no nosso blog Neural Update 👉 ${BLOG}`;
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
    // Caption editável só faz sentido para 1 arquivo; em lote cada um usa o nome.
    if (list.length === 1) {
      setCaption(defaultCaption(list[0].name));
    } else {
      setCaption("");
    }
  };

  const handleImport = async () => {
    if (files.length === 0) { toast.error("Escolha um ou mais arquivos MP4"); return; }
    if (!currentWorkspace) { toast.error("Selecione um workspace primeiro"); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Você precisa estar logado"); setBusy(false); return; }

      let ok = 0;
      const failures: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress(`Subindo ${i + 1}/${files.length}: ${f.name}`);
        try {
          const video_url = await uploadVideoToStorage(f, supabase, "post-videos");
          // 1 arquivo → usa a legenda editada; vários → legenda do nome de cada um.
          const cap = (files.length === 1 && caption.trim())
            ? caption.trim()
            : defaultCaption(f.name);
          const hashtags = (cap.match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 30);
          const { error } = await supabase.from("posts").insert({
            caption: cap,
            hashtags,
            post_type: "conhecimento",
            status: "draft",
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

      if (ok > 0) toast.success(`${ok} Reels importado(s) pra fila como rascunho! 🎬`);
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
            Escolha um ou VÁRIOS MP4 já prontos. Eles sobem pro Storage e entram na fila como
            rascunho — sem gerar vídeo. Em lote, a legenda vem do nome do arquivo (edite depois na fila).
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
            {files.length === 0
              ? "Escolher arquivo(s) MP4"
              : multiple
                ? `${files.length} vídeos selecionados`
                : files[0].name}
          </Button>

          {previewUrl && !multiple && (
            <video src={previewUrl} controls className="w-full max-h-64 rounded-md bg-black" />
          )}

          {multiple ? (
            <div className="text-sm text-muted-foreground max-h-32 overflow-auto rounded-md border p-2">
              {files.map((f) => <div key={f.name}>• {prettifyName(f.name)}</div>)}
            </div>
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
              : multiple ? `Importar ${files.length} pra fila` : "Importar pra fila"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportReelDialog;
