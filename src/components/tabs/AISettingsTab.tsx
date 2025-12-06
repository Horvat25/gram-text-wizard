import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2, Sparkles, Image, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

interface AISettings {
  captionInstructions: string;
  imageStyles: string[];
  brandName: string;
  brandVoice: string;
  targetAudience: string;
  useEmojis: boolean;
  emojiAmount: string;
  preferredHashtagCount: number;
}

const STYLE_PRESETS = [
  { label: 'Minimalista', value: 'Minimalista, clean, cores neutras, muito espaço em branco' },
  { label: 'Tech', value: 'Futurista, tons de azul e roxo, elementos de tecnologia, gradientes' },
  { label: 'Vibrante', value: 'Cores vibrantes, alto contraste, energia visual, moderno' },
  { label: 'Natural', value: 'Tons terrosos, orgânico, iluminação natural, calmo' },
  { label: 'Luxo', value: 'Elegante, dourado, preto, sofisticado, premium' },
  { label: 'Artístico', value: 'Ilustração artística, criativo, cores únicas, expressivo' },
];

const DEFAULT_SETTINGS: AISettings = {
  captionInstructions: '',
  imageStyles: [],
  brandName: '',
  brandVoice: 'Conversacional e autêntico',
  targetAudience: '',
  useEmojis: true,
  emojiAmount: 'moderado',
  preferredHashtagCount: 10,
};

const STORAGE_KEY = 'ai_generation_settings';

export function AISettingsTab() {
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      }
    } catch (error) {
      console.error('Error loading AI settings:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      toast.success('Configurações de IA salvas com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
    toast.success('Configurações restauradas para o padrão');
  };

  const updateSetting = <K extends keyof AISettings>(key: K, value: AISettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Configurações da IA</h2>
          <p className="text-muted-foreground">
            Personalize como a IA gera suas legendas e imagens
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Restaurar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Caption Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Geração de Legendas
            </CardTitle>
            <CardDescription>
              Configure como a IA deve criar suas legendas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brandName">Nome da Marca/Perfil</Label>
              <Input
                id="brandName"
                placeholder="Ex: Neural Update"
                value={settings.brandName}
                onChange={(e) => updateSetting('brandName', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A IA usará esse nome para personalizar as legendas
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetAudience">Público-Alvo</Label>
              <Input
                id="targetAudience"
                placeholder="Ex: Empreendedores, profissionais de tecnologia"
                value={settings.targetAudience}
                onChange={(e) => updateSetting('targetAudience', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="brandVoice">Tom de Voz</Label>
              <Input
                id="brandVoice"
                placeholder="Ex: Conversacional e autêntico, profissional, divertido"
                value={settings.brandVoice}
                onChange={(e) => updateSetting('brandVoice', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="captionInstructions">Instruções Customizadas</Label>
              <Textarea
                id="captionInstructions"
                placeholder="Ex: Sempre mencione nosso site no final. Use linguagem jovem. Evite termos muito técnicos..."
                value={settings.captionInstructions}
                onChange={(e) => updateSetting('captionInstructions', e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Essas instruções serão adicionadas a cada geração de legenda
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Usar Emojis</Label>
                <p className="text-xs text-muted-foreground">
                  Incluir emojis nas legendas
                </p>
              </div>
              <Switch
                checked={settings.useEmojis}
                onCheckedChange={(checked) => updateSetting('useEmojis', checked)}
              />
            </div>

            {settings.useEmojis && (
              <div className="space-y-2">
                <Label htmlFor="emojiAmount">Quantidade de Emojis</Label>
                <select
                  id="emojiAmount"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={settings.emojiAmount}
                  onChange={(e) => updateSetting('emojiAmount', e.target.value)}
                >
                  <option value="poucos">Poucos (1-2)</option>
                  <option value="moderado">Moderado (3-5)</option>
                  <option value="muitos">Muitos (6+)</option>
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="hashtagCount">Quantidade de Hashtags</Label>
              <Input
                id="hashtagCount"
                type="number"
                min={5}
                max={30}
                value={settings.preferredHashtagCount}
                onChange={(e) => updateSetting('preferredHashtagCount', parseInt(e.target.value) || 10)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Image Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5 text-primary" />
              Geração de Imagens
            </CardTitle>
            <CardDescription>
              Configure o estilo visual das imagens geradas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label>Estilos Pré-definidos (selecione um ou mais)</Label>
              <div className="grid grid-cols-2 gap-2">
                {STYLE_PRESETS.map((style) => {
                  const isSelected = settings.imageStyles.includes(style.value);
                  return (
                    <Button
                      key={style.label}
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        const newStyles = isSelected
                          ? settings.imageStyles.filter(s => s !== style.value)
                          : [...settings.imageStyles, style.value];
                        updateSetting('imageStyles', newStyles);
                      }}
                      className="w-full"
                    >
                      {style.label}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Os estilos selecionados serão combinados na geração da imagem
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 mt-4">
              <h4 className="font-medium mb-2">Dicas para melhores resultados:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Seja específico sobre cores e atmosfera</li>
                <li>• Mencione o tipo de iluminação desejada</li>
                <li>• Descreva a composição (centralizado, espaço negativo)</li>
                <li>• Evite descrições muito longas (menos é mais)</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview Card */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10">
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-2">Resumo das Configurações</h3>
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div>
              <span className="text-muted-foreground">Marca:</span>
              <p className="font-medium">{settings.brandName || 'Não definido'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Tom:</span>
              <p className="font-medium">{settings.brandVoice || 'Não definido'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Público:</span>
              <p className="font-medium">{settings.targetAudience || 'Não definido'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
