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

export type MediaType = "image" | "video" | "reels";
export type AIModel = "dalle3" | "gemini" | "runway";

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
];

const AI_MODELS = {
  image: [
    {
      value: "dalle3" as AIModel,
      label: "OpenAI DALL-E 3",
      description: "Melhor para imagens com texto",
      cost: "$$$",
      costLevel: 3,
    },
    {
      value: "gemini" as AIModel,
      label: "Gemini Flash",
      description: "Rápido e gratuito*",
      cost: "$",
      costLevel: 1,
    },
  ],
  video: [
    {
      value: "runway" as AIModel,
      label: "Runway Gen-3",
      description: "Alta qualidade, via Replicate",
      cost: "$$$$$",
      costLevel: 5,
    },
  ],
  reels: [
    {
      value: "runway" as AIModel,
      label: "Runway Gen-3",
      description: "Vídeos curtos (5-10s)",
      cost: "$$$$$",
      costLevel: 5,
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
              {selectedModel === "runway" && (
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
