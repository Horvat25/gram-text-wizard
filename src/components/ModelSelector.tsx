import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DollarSign, Sparkles, Video, Image as ImageIcon } from "lucide-react";

export type MediaType = "image" | "video" | "reels" | "carousel";
export type AIModel = "gemini" | "dalle3" | "minimax";

interface ModelSelectorProps {
  mediaType: MediaType;
  selectedModel: AIModel;
  onMediaTypeChange: (type: MediaType) => void;
  onModelChange: (model: AIModel) => void;
}

const MEDIA_TYPES = [
  { value: "image" as MediaType, label: "Imagem", icon: ImageIcon },
  { value: "video" as MediaType, label: "Vídeo", icon: Video },
  { value: "reels" as MediaType, label: "Reels", icon: Video },
  { value: "carousel" as MediaType, label: "Carrossel", icon: ImageIcon },
];

const AI_MODELS = {
  image: [
    {
      value: "gemini" as AIModel,
      label: "Gemini Flash Image",
      description: "Gratuito via Lovable AI",
      cost: "Grátis",
      costLevel: 0,
    },
    {
      value: "dalle3" as AIModel,
      label: "OpenAI DALL-E 3",
      description: "Premium, suporta texto",
      cost: "$$$",
      costLevel: 3,
    },
  ],
  video: [
    {
      value: "minimax" as AIModel,
      label: "Minimax Video-01",
      description: "Econômico via Replicate",
      cost: "$",
      costLevel: 1,
    },
  ],
  reels: [
    {
      value: "minimax" as AIModel,
      label: "Minimax Video-01",
      description: "Vídeos curtos (5-6s)",
      cost: "$",
      costLevel: 1,
    },
  ],
  carousel: [
    {
      value: "gemini" as AIModel,
      label: "Gemini Flash Image",
      description: "Múltiplas imagens gratuitas",
      cost: "Grátis",
      costLevel: 0,
    },
  ],
};

const CostIndicator = ({ level }: { level: number }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map((i) => (
      <DollarSign
        key={i}
        className={`h-3 w-3 ${i <= level ? "text-amber-500" : "text-muted-foreground/30"}`}
      />
    ))}
  </div>
);

const ModelSelector = ({
  mediaType,
  selectedModel,
  onMediaTypeChange,
  onModelChange,
}: ModelSelectorProps) => {
  const availableModels = AI_MODELS[mediaType];
  const currentModel = availableModels.find((m) => m.value === selectedModel);

  // Auto-select first model when media type changes
  const handleMediaTypeChange = (type: MediaType) => {
    onMediaTypeChange(type);
    const models = AI_MODELS[type];
    if (models.length > 0 && !models.find((m) => m.value === selectedModel)) {
      onModelChange(models[0].value);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Media Type */}
        <div className="space-y-2">
          <Label>Tipo de Mídia</Label>
          <div className="flex gap-2">
            {MEDIA_TYPES.map((type) => {
              const Icon = type.icon;
              const isSelected = mediaType === type.value;
              return (
                <button
                  key={type.value}
                  onClick={() => handleMediaTypeChange(type.value)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{type.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* AI Model */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Modelo de IA
          </Label>
          <Select value={selectedModel} onValueChange={(v) => onModelChange(v as AIModel)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  <div className="flex items-center justify-between gap-4 w-full">
                    <div className="flex flex-col">
                      <span className="font-medium">{model.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {model.description}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Cost and Model Info Badge */}
          {currentModel && (
            <div className="flex items-center gap-2 mt-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <CostIndicator level={currentModel.costLevel} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Custo estimado por geração</p>
                </TooltipContent>
              </Tooltip>

              {selectedModel === "dalle3" && (
                <Badge variant="secondary" className="text-xs">
                  Suporta texto na imagem
                </Badge>
              )}
              {selectedModel === "gemini" && (
                <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 border-green-600/30">
                  Gratuito
                </Badge>
              )}
              {selectedModel === "minimax" && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-600/30">
                  Geração em background
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default ModelSelector;
