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

export type MediaType = "image" | "reels" | "carousel" | "narrative";
export type AIModel = "gemini" | "dalle3" | "narrative";

interface ModelSelectorProps {
  mediaType: MediaType;
  selectedModel: AIModel;
  onMediaTypeChange: (type: MediaType) => void;
  onModelChange: (model: AIModel) => void;
}

const MEDIA_TYPES = [
  { value: "image" as MediaType, label: "Imagem", icon: ImageIcon },
  { value: "reels" as MediaType, label: "Reels/Vídeo", icon: Video, badge: "🎬" },
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
  reels: [
    {
      value: "narrative" as AIModel,
      label: "Reels Cinematográfico",
      description: "Imagem + Narração + Música (Bark/MusicGen)",
      cost: "FREE",
      costLevel: 0,
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
  narrative: [
    {
      value: "narrative" as AIModel,
      label: "Pipeline Narrativo Completo",
      description: "Imagem → Vídeo → Narração → Música",
      cost: "$",
      costLevel: 1,
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MEDIA_TYPES.map((type) => {
              const Icon = type.icon;
              const isSelected = mediaType === type.value;
              return (
                <button
                  key={type.value}
                  onClick={() => handleMediaTypeChange(type.value)}
                  className={`relative flex items-center justify-center gap-2 py-2 px-3 rounded-lg border transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{type.label}</span>
                  {"badge" in type && type.badge && (
                    <Badge variant="secondary" className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">
                      {type.badge}
                    </Badge>
                  )}
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
              {selectedModel === "narrative" && (
                <Badge variant="secondary" className="text-xs bg-purple-500/10 text-purple-600 border-purple-600/30">
                  Narração + Música
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
