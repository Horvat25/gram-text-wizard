import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Type, X } from "lucide-react";

export interface OverlayMetadata {
  text: string;
  x: number;
  y: number;
  font: string;
  size: number;
  color: string;
  opacity: number;
}

interface TextOverlayEditorProps {
  overlay: OverlayMetadata;
  onChange: (overlay: OverlayMetadata) => void;
  onRemove: () => void;
  imageUrl?: string;
}

const FONTS = [
  { value: "Inter", label: "Inter (Sans-serif)" },
  { value: "Playfair Display", label: "Playfair (Serif)" },
  { value: "Roboto Mono", label: "Roboto Mono (Monospace)" },
  { value: "Bebas Neue", label: "Bebas Neue (Display)" },
  { value: "Dancing Script", label: "Dancing Script (Cursive)" },
];

const COLORS = [
  { value: "#ffffff", label: "Branco" },
  { value: "#000000", label: "Preto" },
  { value: "#ef4444", label: "Vermelho" },
  { value: "#3b82f6", label: "Azul" },
  { value: "#22c55e", label: "Verde" },
  { value: "#eab308", label: "Amarelo" },
  { value: "#a855f7", label: "Roxo" },
];

const TextOverlayEditor = ({
  overlay,
  onChange,
  onRemove,
  imageUrl,
}: TextOverlayEditorProps) => {
  const updateOverlay = (updates: Partial<OverlayMetadata>) => {
    onChange({ ...overlay, ...updates });
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Editor de Texto</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Preview */}
      {imageUrl && (
        <div className="relative aspect-square w-full max-w-[200px] mx-auto border rounded-lg overflow-hidden bg-muted">
          <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
          {overlay.text && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${overlay.x}%`,
                top: `${overlay.y}%`,
                transform: "translate(-50%, -50%)",
                fontFamily: overlay.font,
                fontSize: `${overlay.size / 4}px`,
                color: overlay.color,
                opacity: overlay.opacity / 100,
                textShadow: overlay.color === "#ffffff" ? "0 1px 2px rgba(0,0,0,0.5)" : "0 1px 2px rgba(255,255,255,0.5)",
                whiteSpace: "nowrap",
              }}
            >
              {overlay.text}
            </div>
          )}
        </div>
      )}

      {/* Text Input */}
      <div className="space-y-2">
        <Label htmlFor="overlayText">Texto</Label>
        <Input
          id="overlayText"
          value={overlay.text}
          onChange={(e) => updateOverlay({ text: e.target.value })}
          placeholder="Digite o texto..."
        />
      </div>

      {/* Position */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Posição X: {overlay.x}%</Label>
          <Slider
            value={[overlay.x]}
            onValueChange={([v]) => updateOverlay({ x: v })}
            min={0}
            max={100}
            step={1}
          />
        </div>
        <div className="space-y-2">
          <Label>Posição Y: {overlay.y}%</Label>
          <Slider
            value={[overlay.y]}
            onValueChange={([v]) => updateOverlay({ y: v })}
            min={0}
            max={100}
            step={1}
          />
        </div>
      </div>

      {/* Font */}
      <div className="space-y-2">
        <Label>Fonte</Label>
        <Select value={overlay.font} onValueChange={(v) => updateOverlay({ font: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONTS.map((font) => (
              <SelectItem key={font.value} value={font.value}>
                <span style={{ fontFamily: font.value }}>{font.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Size */}
      <div className="space-y-2">
        <Label>Tamanho: {overlay.size}px</Label>
        <Slider
          value={[overlay.size]}
          onValueChange={([v]) => updateOverlay({ size: v })}
          min={12}
          max={72}
          step={2}
        />
      </div>

      {/* Color */}
      <div className="space-y-2">
        <Label>Cor</Label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((color) => (
            <button
              key={color.value}
              onClick={() => updateOverlay({ color: color.value })}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                overlay.color === color.value
                  ? "border-primary scale-110"
                  : "border-transparent hover:scale-105"
              }`}
              style={{ backgroundColor: color.value }}
              title={color.label}
            />
          ))}
          <Input
            type="color"
            value={overlay.color}
            onChange={(e) => updateOverlay({ color: e.target.value })}
            className="w-8 h-8 p-0 border-0 cursor-pointer"
          />
        </div>
      </div>

      {/* Opacity */}
      <div className="space-y-2">
        <Label>Opacidade: {overlay.opacity}%</Label>
        <Slider
          value={[overlay.opacity]}
          onValueChange={([v]) => updateOverlay({ opacity: v })}
          min={10}
          max={100}
          step={5}
        />
      </div>
    </div>
  );
};

export default TextOverlayEditor;
