import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Copy } from "lucide-react";
import { downloadAllAsZip, copyToClipboard } from "@/lib/download-utils";
import { toast } from "sonner";

interface DownloadActionsProps {
  caption: string;
  hashtags: string[];
  imageUrl: string;
  previewRef: React.RefObject<HTMLDivElement>;
}

const DownloadActions = ({ caption, hashtags, imageUrl, previewRef }: DownloadActionsProps) => {
  const handleDownloadAll = async () => {
    if (!previewRef.current) {
      toast.error("Erro ao capturar preview");
      return;
    }

    try {
      await downloadAllAsZip(imageUrl, caption, hashtags, previewRef.current);
      toast.success("Download completo! Verifique a pasta ZIP");
    } catch (error) {
      toast.error("Erro ao fazer download");
    }
  };

  const handleCopyCaption = async () => {
    const hashtagsText = hashtags.map(tag => `#${tag}`).join(" ");
    const fullText = `${caption}\n\n${hashtagsText}`;
    
    const success = await copyToClipboard(fullText);
    if (success) {
      toast.success("Legenda copiada!");
    } else {
      toast.error("Erro ao copiar");
    }
  };

  const hasContent = caption || hashtags.length > 0 || imageUrl;

  return (
    <Card>
      <CardContent className="pt-6">
        {hasContent ? (
          <div className="flex gap-2">
            <Button
              onClick={handleDownloadAll}
              variant="default"
              className="flex-1"
              disabled={!imageUrl || !caption}
            >
              <Download className="mr-2 h-4 w-4" />
              Baixar Tudo (ZIP)
            </Button>
            <Button
              onClick={handleCopyCaption}
              variant="outline"
              disabled={!caption && hashtags.length === 0}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center">
            Gere um post para habilitar downloads
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default DownloadActions;
