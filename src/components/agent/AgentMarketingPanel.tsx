import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Trash2,
  ExternalLink,
  Megaphone,
  Edit,
  Loader2,
  Link2,
  ShoppingBag,
  Tag
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
  image_url: string | null;
  category: string;
  commission_info: string | null;
  is_active: boolean;
  posts_count: number;
  last_posted_at: string | null;
  created_at: string;
}

const CATEGORIES = [
  { value: 'tech', label: '🖥️ Tecnologia' },
  { value: 'cursos', label: '📚 Cursos' },
  { value: 'tools', label: '🔧 Ferramentas' },
  { value: 'ai', label: '🤖 IA & Automação' },
  { value: 'hosting', label: '☁️ Hosting' },
  { value: 'geral', label: '📦 Geral' },
];

export default function AgentMarketingPanel() {
  const { currentWorkspace } = useWorkspace();
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLink, setEditingLink] = useState<AffiliateLink | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [productName, setProductName] = useState('');
  const [affiliateUrl, setAffiliateUrl] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState('tech');
  const [commissionInfo, setCommissionInfo] = useState('');

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
    setImageUrl('');
    setCategory('tech');
    setCommissionInfo('');
    setEditingLink(null);
  };

  const openEditForm = (link: AffiliateLink) => {
    setEditingLink(link);
    setProductName(link.product_name);
    setAffiliateUrl(link.affiliate_url);
    setDescription(link.description || '');
    setImageUrl(link.image_url || '');
    setCategory(link.category || 'tech');
    setCommissionInfo(link.commission_info || '');
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
        image_url: imageUrl.trim() || null,
        category,
        commission_info: commissionInfo.trim() || null,
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

  const getCategoryLabel = (cat: string) => {
    return CATEGORIES.find(c => c.value === cat)?.label || '📦 Geral';
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
            O agente intercala posts de marketing automaticamente (1 a cada 5-10 posts)
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
          <p className="text-xs text-muted-foreground">Adicione links de afiliado para o agente promover automaticamente</p>
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
                  {link.image_url ? (
                    <img 
                      src={link.image_url} 
                      alt={link.product_name}
                      className="w-12 h-12 rounded-lg object-cover shrink-0"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Link2 className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm truncate">{link.product_name}</h3>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {getCategoryLabel(link.category)}
                      </Badge>
                    </div>
                    
                    {link.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{link.description}</p>
                    )}
                    
                    <div className="flex items-center gap-3 mt-1.5">
                      {link.commission_info && (
                        <span className="text-[10px] text-primary font-medium">
                          💰 {link.commission_info}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        📊 {link.posts_count} post(s)
                      </span>
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
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Ex: ChatGPT Plus, Cursor Pro"
                className="h-8 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs">Link de Afiliado *</Label>
              <Input
                value={affiliateUrl}
                onChange={(e) => setAffiliateUrl(e.target.value)}
                placeholder="https://..."
                className="h-8 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descrição do produto para o agente usar na legenda"
                className="min-h-[60px] text-sm"
              />
            </div>

            <div>
              <Label className="text-xs">Imagem do Produto (URL)</Label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="h-8 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Comissão</Label>
                <Input
                  value={commissionInfo}
                  onChange={(e) => setCommissionInfo(e.target.value)}
                  placeholder="Ex: 30%"
                  className="h-8 text-sm"
                />
              </div>
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
