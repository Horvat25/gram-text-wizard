import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState } from "react";

interface InstagramPreviewProps {
  caption: string;
  hashtags: string[];
  imageUrl?: string;
  username?: string;
  avatarUrl?: string;
  likes?: number;
  comments?: number;
}

const InstagramPreview = ({
  caption,
  hashtags,
  imageUrl,
  username = "sua_marca",
  avatarUrl,
  likes = Math.floor(Math.random() * 5000 + 1000),
  comments = Math.floor(Math.random() * 100 + 20),
}: InstagramPreviewProps) => {
  const [showFullCaption, setShowFullCaption] = useState(false);
  
  const displayCaption = caption || "Sua legenda aparecerá aqui...";
  const shouldTruncate = displayCaption.length > 125;
  const truncatedCaption = shouldTruncate && !showFullCaption
    ? displayCaption.slice(0, 125) + "..."
    : displayCaption;

  const allHashtags = hashtags.length > 0 ? hashtags.map(tag => `#${tag}`).join(" ") : "";

  return (
    <Card className="w-full max-w-[470px] mx-auto overflow-hidden border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold text-sm text-foreground">{username}</span>
        </div>
        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Image */}
      <div className="relative aspect-square bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Post preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-background">
            <div className="text-center p-6">
              <div className="text-4xl mb-2">📸</div>
              <p className="text-sm text-muted-foreground">Sua imagem aparecerá aqui</p>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Heart className="h-6 w-6 text-foreground hover:text-muted-foreground cursor-pointer transition-colors" />
            <MessageCircle className="h-6 w-6 text-foreground hover:text-muted-foreground cursor-pointer transition-colors" />
            <Send className="h-6 w-6 text-foreground hover:text-muted-foreground cursor-pointer transition-colors" />
          </div>
          <Bookmark className="h-6 w-6 text-foreground hover:text-muted-foreground cursor-pointer transition-colors" />
        </div>

        {/* Likes */}
        <div className="font-semibold text-sm text-foreground">
          {likes.toLocaleString("pt-BR")} curtidas
        </div>

        {/* Caption */}
        <div className="text-sm">
          <span className="font-semibold text-foreground mr-2">{username}</span>
          <span className="text-foreground whitespace-pre-wrap">
            {truncatedCaption}
            {shouldTruncate && !showFullCaption && (
              <button
                onClick={() => setShowFullCaption(true)}
                className="text-muted-foreground ml-1 hover:text-foreground transition-colors"
              >
                mais
              </button>
            )}
          </span>
        </div>

        {/* Hashtags */}
        {allHashtags && (
          <div className="text-sm">
            <span className="text-[#0095f6] hover:text-[#0095f6]/80 cursor-pointer transition-colors">
              {allHashtags}
            </span>
          </div>
        )}

        {/* Comments preview */}
        {comments > 0 && (
          <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Ver todos os {comments} comentários
          </button>
        )}

        {/* Fake comments */}
        <div className="space-y-1 text-sm">
          <div>
            <span className="font-semibold text-foreground mr-2">maria_silva</span>
            <span className="text-foreground">Adorei! 😍</span>
          </div>
          <div>
            <span className="font-semibold text-foreground mr-2">joao_santos</span>
            <span className="text-foreground">Conteúdo incrível! 🔥</span>
          </div>
        </div>

        {/* Timestamp */}
        <div className="text-[10px] uppercase text-muted-foreground">
          HÁ 2 HORAS
        </div>
      </div>
    </Card>
  );
};

export default InstagramPreview;
