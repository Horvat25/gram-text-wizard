import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Trash2,
  Edit,
  Loader2,
  Link2,
  Megaphone,
  ShoppingBag,
  Sparkles,
  Search,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface AffiliateLink {
  id: string;
  product_name: string;
  affiliate_url: string;
  description: string | null;
  is_active: boolean;
  posts_count: number;
  last_posted_at: string | null;
  created_at: string;
  media_format: string;
  post_frequency: number;
  marketing_strategy: string | null;
}

export default function AgentMarketingPanel() {
  const { currentWorkspace } = useWorkspace();
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLink, setEditingLink] = useState<AffiliateLink | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [analyzingSite, setAnalyzingSite] = useState(false);
  const [siteAnalysis, setSiteAnalysis] = useState('');
  const [analysisSources, setAnalysisSources] = useState<{
    site: boolean;
    web: boolean;
    site_source?: string;
    web_source?: string;
  } | null>(null);

  // Form state
  const [productName, setProductName] = useState('');
  const [affiliateUrl, setAffiliateUrl] = useState('');
  const [description, setDescription] = useState('');
  const [mediaFormat, setMediaFormat] = useState('image');
  const [postFrequency, setPostFrequency] = useState(4);
  const [marketingStrategy, setMarketingStrategy] = useState('');

  const analyzeSite = async () => {
    if (!affiliateUrl.trim()) {
      toast.error('Adicione o link de afiliado para analisar o site');
      return;
    }

    setAnalyzingSite(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-affiliate-description', {
        body: {
          action: 'analyze',
          productName: productName.trim() || null,
          affiliateUrl: affiliateUrl.trim(),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.analysisContext) {
        setSiteAnalysis(data.analysisContext);
        setAnalysisSources(data.sources || null);

        const sourceParts = [];
        if (data.sources?.site) sourceParts.push('site');
        if (data.sources?.web) sourceParts.push('web');
        toast.success(`Site analisado com sucesso${sourceParts.length ? ` (${sourceParts.join(' + ')})` : ''}.`);
      }
    } catch (err: any) {
      toast.error('Erro ao analisar site: ' + err.message);
    } finally {
      setAnalyzingSite(false);
    }
  };

  const generateDescription = async () => {
    if (!productName.trim()) {
      toast.error('Preencha o nome do produto primeiro');
      return;
    }

    if (affiliateUrl.trim() && !siteAnalysis.trim()) {
      toast.error('Clique em "Analisar site" antes de gerar a descrição');
      return;
    }

    setGeneratingDesc(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-affiliate-description', {
        body: {
          action: 'generate',
          productName: productName.trim(),
          affiliateUrl: affiliateUrl.trim() || null,
          analysisContext: siteAnalysis || null,
        }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.description) {
        setDescription(data.description);
        const sources = [];
        if (data.sources?.site) sources.push('site do produto');
        if (data.sources?.web) sources.push('pesquisa web');
        const sourceText = sources.length > 0 ? ` (baseado em: ${sources.join(' + ')})` : '';
        toast.success(`Descrição gerada!${sourceText} Revise e ajuste.`);
      }
    } catch (err: any) {
      toast.error('Erro ao gerar descrição: ' + err.message);
    } finally {
      setGeneratingDesc(false);
    }
  };

  const fetchLinks = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('affiliate_links')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLinks((data || []) as AffiliateLink[]);
    } catch (err: any) {
      console.error('Error fetching affiliate links:', err);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const resetForm = () => {
    setProductName('');
    setAffiliateUrl('');
    setDescription('');
    setMediaFormat('image');
    setPostFrequency(4);
    setMarketingStrategy('');
    setSiteAnalysis('');
    setAnalysisSources(null);
    setEditingLink(null);
  };

  const openEditForm = (link: AffiliateLink) => {
    setEditingLink(link);
    setProductName(link.product_name);
    setAffiliateUrl(link.affiliate_url);
    setDescription(link.description || '');
    setMediaFormat(link.media_format || 'image');
    setPostFrequency(link.post_frequency || 4);
    setMarketingStrategy(link.marketing_strategy || '');
    setSiteAnalysis('');
    setAnalysisSources(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!currentWorkspace || !productName.trim() || !affiliateUrl.trim()) {
      toast.error('Nome e link são obrigatórios');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        workspace_id: currentWorkspace.id,
        product_name: productName.trim(),
        affiliate_url: affiliateUrl.trim(),
        description: description.trim() || null,
      };

      if (editingLink) {
        const { error } = await supabase
          .from('affiliate_links')
          .update(payload)
          .eq('id', editingLink.id);
        if (error) throw error;
        toast.success('Link atualizado!');
      } else {
        const { error } = await supabase
          .from('affiliate_links')
          .insert(payload);
        if (error) throw error;
        toast.success('Link adicionado!');
      }

      resetForm();
      setShowForm(false);
      fetchLinks();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('affiliate_links')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Link removido');
      fetchLinks();
    } catch (err: any) {
      toast.error('Erro ao remover: ' + err.message);
    }
  };

  const toggleActive = async (link: AffiliateLink) => {
    try {
      const { error } = await supabase
        .from('affiliate_links')
        .update({ is_active: !link.is_active })
        .eq('id', link.id);
      if (error) throw error;
      fetchLinks();
    } catch (err: any) {
      toast.error('Erro ao atualizar');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            Links de Afiliado
          </h2>
          <p className="text-xs text-muted-foreground">
            O agente pesquisa sobre o produto e cria conteúdo de marketing automaticamente
          </p>
        </div>
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => { resetForm(); setShowForm(true); }}
        >
          <Plus className="h-3 w-3" />
          Adicionar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : links.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Nenhum link cadastrado</p>
          <p className="text-xs text-muted-foreground">Adicione links de afiliado e o agente pesquisa e cria conteúdo</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-2">
            {links.map((link) => (
              <motion.div
                key={link.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={cn(
                  "p-3 rounded-xl border transition-all",
                  link.is_active
                    ? "bg-card border-border"
                    : "bg-muted/30 border-border/50 opacity-60"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Link2 className="h-4 w-4 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{link.product_name}</h3>

                    {link.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{link.description}</p>
                    )}

                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] text-muted-foreground">
                        📊 {link.posts_count} post(s)
                      </span>
                      <a
                        href={link.affiliate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-primary truncate max-w-[200px] hover:underline"
                      >
                        {link.affiliate_url}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      checked={link.is_active}
                      onCheckedChange={() => toggleActive(link)}
                      className="scale-75"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEditForm(link)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(link.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { resetForm(); setShowForm(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editingLink ? 'Editar Link de Afiliado' : 'Novo Link de Afiliado'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome do Produto *</Label>
              <Input
                value={productName}
                onChange={(e) => {
                  setProductName(e.target.value);
                  setSiteAnalysis('');
                  setAnalysisSources(null);
                }}
                placeholder="Ex: ChatGPT Plus, Cursor Pro"
                className="h-8 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs">Link de Afiliado *</Label>
              <Input
                value={affiliateUrl}
                onChange={(e) => {
                  setAffiliateUrl(e.target.value);
                  setSiteAnalysis('');
                  setAnalysisSources(null);
                }}
                placeholder="https://..."
                className="h-8 text-sm"
              />

              <div className="mt-2 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={analyzeSite}
                  disabled={analyzingSite || !affiliateUrl.trim()}
                >
                  {analyzingSite ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Search className="h-3 w-3" />
                  )}
                  {analyzingSite ? 'Analisando site...' : 'Analisar site'}
                </Button>

                {analysisSources?.site && (
                  <Badge variant="secondary" className="text-[10px]">
                    Site analisado
                  </Badge>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Descrição</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-xs text-primary"
                  onClick={generateDescription}
                  disabled={generatingDesc || !productName.trim() || (!!affiliateUrl.trim() && !siteAnalysis.trim())}
                >
                  {generatingDesc ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {generatingDesc ? 'Gerando...' : 'Gerar com IA'}
                </Button>
              </div>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={affiliateUrl.trim() && !siteAnalysis.trim()
                  ? "Clique em 'Analisar site' antes de gerar a descrição"
                  : "Breve descrição do produto — ou clique em 'Gerar com IA'"
                }
                className="min-h-[60px] text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { resetForm(); setShowForm(false); }}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {editingLink ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
