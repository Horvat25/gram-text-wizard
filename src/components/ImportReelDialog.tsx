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
 * ImportReelDialog — importa um Reels JÁ PRONTO (MP4 do YouTube/Higgsfield) pra fila.
 * NÃO gera vídeo: sobe o arquivo pro bucket post-videos e cria um post media_type='reels'
 * status='draft' (você revisa e agenda/publica). Usa o login atual (sem service key).
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

export function ImportReelDialog({ open, onOpenChange }: Props) {
  const { currentWorkspace } = useWorkspace();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setCaption("");
    setBusy(false);
  };

  const onPick = (f: File | null) => {
    if (!f) return;
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    if (!caption.trim()) {
      setCaption(`${prettifyName(f.name)}\n\nMais ciência e tecnologia no nosso blog Neural Update 👉 ${BLOG}`);
    }
  };

  const handleImport = async () => {
    if (!file) { toast.error("Escolha um arquivo MP4 primeiro"); return; }
    if (!currentWorkspace) { toast.error("Selecione um workspace primeiro"); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Você precisa estar logado"); setBusy(false); return; }

      toast.info("Subindo o vídeo...");
      const video_url = await uploadVideoToStorage(file, supabase, "post-videos");

      const hashtags = (caption.match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 30);
      const { error } = await supabase.from("posts").insert({
        caption: caption.trim(),
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

      toast.success("Reels importado pra fila como rascunho! 🎬");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      console.error("[ImportReel]", e);
      toast.error(e?.message || "Falha ao importar o Reels");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { if (!o) reset(); onOpenChange(o); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Reels pronto</DialogTitle>
          <DialogDescription>
            Escolha um MP4 já pronto (YouTube/Higgsfield). Ele sobe pro Storage e entra na fila como
            rascunho — sem gerar vídeo. Ajuste a legenda pro Instagram e importe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] || null)}
          />
          <Button variant="outline" className="w-full" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload className="h-4 w-4 mr-2" />
            {file ? file.name : "Escolher arquivo MP4"}
          </Button>

          {previewUrl && (
            <video src={previewUrl} controls className="w-full max-h-64 rounded-md bg-black" />
          )}

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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleImport} disabled={busy || !file}>
            {busy ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</>) : "Importar pra fila"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportReelDialog;
