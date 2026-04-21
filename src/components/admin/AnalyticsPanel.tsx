import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSeoSettings } from "@/hooks/useSeoSettings";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Eye, Users, TrendingUp, Search, Globe, Smartphone,
  ExternalLink, Save, Info, BarChart3, Settings as SettingsIcon, RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

interface PageView {
  id: string;
  page_path: string;
  page_type: string;
  article_slug: string | null;
  referrer: string | null;
  device_type: string | null;
  country: string | null;
  search_query: string | null;
  session_id: string | null;
  created_at: string;
}

const COLORS = ["hsl(var(--primary))", "hsl(280 90% 60%)", "hsl(190 90% 55%)", "hsl(40 90% 55%)", "hsl(140 70% 50%)"];

const AnalyticsPanel = () => {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const { settings, loading: settingsLoading } = useSeoSettings(currentWorkspace?.id);

  const [views, setViews] = useState<PageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  // SEO settings form
  const [siteUrl, setSiteUrl] = useState("");
  const [ga4Id, setGa4Id] = useState("");
  const [gscCode, setGscCode] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setSiteUrl(settings.site_url || "");
      setGa4Id(settings.ga4_measurement_id || "");
      setGscCode(settings.gsc_verification_code || "");
    }
  }, [settings]);

  const loadViews = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("page_views")
      .select("id, page_path, page_type, article_slug, referrer, device_type, country, search_query, session_id, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    setViews((data as PageView[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadViews();
  }, [currentWorkspace?.id, days]);

  const stats = useMemo(() => {
    const totalViews = views.length;
    const sessions = new Set(views.map(v => v.session_id).filter(Boolean)).size;
    const articleViews = views.filter(v => v.page_type === "article").length;

    // Daily timeline
    const dailyMap = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dailyMap.set(d, 0);
    }
    views.forEach(v => {
      const d = v.created_at.slice(0, 10);
      if (dailyMap.has(d)) dailyMap.set(d, (dailyMap.get(d) || 0) + 1);
    });
    const daily = Array.from(dailyMap.entries()).map(([date, count]) => ({
      date: date.slice(5),
      views: count,
    }));

    // Top pages
    const pageMap = new Map<string, number>();
    views.forEach(v => pageMap.set(v.page_path, (pageMap.get(v.page_path) || 0) + 1));
    const topPages = Array.from(pageMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    // Devices
    const deviceMap = new Map<string, number>();
    views.forEach(v => {
      const d = v.device_type || "unknown";
      deviceMap.set(d, (deviceMap.get(d) || 0) + 1);
    });
    const devices = Array.from(deviceMap.entries()).map(([name, value]) => ({ name, value }));

    // Referrers (sources)
    const refMap = new Map<string, number>();
    views.forEach(v => {
      let src = "Direto";
      if (v.referrer) {
        try {
          const host = new URL(v.referrer).hostname.replace(/^www\./, "");
          if (host) src = host;
        } catch {}
      }
      refMap.set(src, (refMap.get(src) || 0) + 1);
    });
    const sources = Array.from(refMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([source, count]) => ({ source, count }));

    // Top searches (Google etc)
    const searchMap = new Map<string, number>();
    views.forEach(v => {
      if (v.search_query) {
        const q = v.search_query.toLowerCase().trim();
        if (q) searchMap.set(q, (searchMap.get(q) || 0) + 1);
      }
    });
    const searches = Array.from(searchMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));

    // Countries
    const countryMap = new Map<string, number>();
    views.forEach(v => {
      const c = v.country || "—";
      countryMap.set(c, (countryMap.get(c) || 0) + 1);
    });
    const countries = Array.from(countryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([country, count]) => ({ country, count }));

    return { totalViews, sessions, articleViews, daily, topPages, devices, sources, searches, countries };
  }, [views, days]);

  const handleSaveSettings = async () => {
    if (!currentWorkspace) return;
    setSaving(true);
    try {
      const payload = {
        workspace_id: currentWorkspace.id,
        site_url: siteUrl.trim() || null,
        ga4_measurement_id: ga4Id.trim() || null,
        gsc_verification_code: gscCode.trim() || null,
        enable_internal_analytics: true,
      };
      const { error } = await supabase
        .from("seo_settings")
        .upsert(payload, { onConflict: "workspace_id" });
      if (error) throw error;
      toast({ title: "Configurações salvas", description: "GA4 e Search Console atualizados." });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const sitemapUrl = `${import.meta.env.VITE_SUPABASE_URL || ""}/functions/v1/sitemap-xml${siteUrl ? `?site=${encodeURIComponent(siteUrl)}` : ""}`;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid grid-cols-2 h-9">
          <TabsTrigger value="dashboard" className="text-xs gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="setup" className="text-xs gap-1.5">
            <SettingsIcon className="h-3.5 w-3.5" /> Configurar SEO
          </TabsTrigger>
        </TabsList>

        {/* ==================== DASHBOARD ==================== */}
        <TabsContent value="dashboard" className="mt-3 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {[7, 30, 90].map(d => (
                <Button
                  key={d}
                  variant={days === d ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDays(d)}
                >
                  {d}d
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={loadViews} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : views.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Ainda não há visitas registradas nos últimos {days} dias. Após publicar e divulgar artigos, os dados aparecerão aqui automaticamente.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card className="p-3">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Eye className="h-3.5 w-3.5" /> Visualizações
                  </div>
                  <div className="text-2xl font-bold">{stats.totalViews.toLocaleString("pt-BR")}</div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Users className="h-3.5 w-3.5" /> Sessões únicas
                  </div>
                  <div className="text-2xl font-bold">{stats.sessions.toLocaleString("pt-BR")}</div>
                </Card>
                <Card className="p-3 col-span-2 md:col-span-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <TrendingUp className="h-3.5 w-3.5" /> Leituras de artigo
                  </div>
                  <div className="text-2xl font-bold">{stats.articleViews.toLocaleString("pt-BR")}</div>
                </Card>
              </div>

              {/* Daily timeline */}
              <Card className="p-3">
                <div className="text-xs font-semibold mb-2 text-muted-foreground">Visitas por dia</div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                      />
                      <Line type="monotone" dataKey="views" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Two column: Top pages + Sources */}
              <div className="grid md:grid-cols-2 gap-3">
                <Card className="p-3">
                  <div className="text-xs font-semibold mb-2 text-muted-foreground">Páginas mais visitadas</div>
                  <div className="space-y-1.5">
                    {stats.topPages.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs gap-2">
                        <span className="truncate font-mono text-[11px]">{p.path}</span>
                        <Badge variant="secondary" className="shrink-0">{p.count}</Badge>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-3">
                  <div className="text-xs font-semibold mb-2 text-muted-foreground flex items-center gap-1.5">
                    <Globe className="h-3 w-3" /> De onde vêm os visitantes
                  </div>
                  <div className="space-y-1.5">
                    {stats.sources.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="truncate">{s.source}</span>
                        <Badge variant="outline" className="shrink-0">{s.count}</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* Searches + Devices */}
              <div className="grid md:grid-cols-2 gap-3">
                <Card className="p-3">
                  <div className="text-xs font-semibold mb-2 text-muted-foreground flex items-center gap-1.5">
                    <Search className="h-3 w-3" /> Termos pesquisados no Google
                  </div>
                  {stats.searches.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">
                      Nenhum termo capturado ainda. O Google não envia mais queries por padrão — use o Search Console para dados completos.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {stats.searches.map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="truncate">"{s.query}"</span>
                          <Badge variant="secondary" className="shrink-0">{s.count}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card className="p-3">
                  <div className="text-xs font-semibold mb-2 text-muted-foreground flex items-center gap-1.5">
                    <Smartphone className="h-3 w-3" /> Dispositivos
                  </div>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.devices} dataKey="value" nameKey="name" outerRadius={50} label={{ fontSize: 10 }}>
                          {stats.devices.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ==================== SETUP ==================== */}
        <TabsContent value="setup" className="mt-3 space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs space-y-2">
              <p className="font-medium">Como configurar analytics profissional (passo a passo):</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Crie uma conta grátis no <a href="https://analytics.google.com" target="_blank" rel="noopener" className="text-primary underline">Google Analytics</a> e copie o ID (formato <code>G-XXXXXXXX</code>)</li>
                <li>Crie uma propriedade no <a href="https://search.google.com/search-console" target="_blank" rel="noopener" className="text-primary underline">Google Search Console</a> e escolha verificação por <strong>tag HTML</strong> — copie o código</li>
                <li>Cole os dois aqui embaixo e salve</li>
                <li>Envie o sitemap (URL embaixo) no Search Console</li>
              </ol>
            </AlertDescription>
          </Alert>

          <Card className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="site-url" className="text-xs">URL do seu site</Label>
              <Input
                id="site-url"
                placeholder="https://seudominio.com.br"
                value={siteUrl}
                onChange={e => setSiteUrl(e.target.value)}
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Usado no sitemap. Use o domínio definitivo da Localweb quando estiver conectado.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ga4" className="text-xs">Google Analytics 4 — Measurement ID</Label>
              <Input
                id="ga4"
                placeholder="G-XXXXXXXXXX"
                value={ga4Id}
                onChange={e => setGa4Id(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gsc" className="text-xs">Google Search Console — Código de verificação</Label>
              <Input
                id="gsc"
                placeholder="abc123xyz... (apenas o conteúdo do content=)"
                value={gscCode}
                onChange={e => setGscCode(e.target.value)}
                className="h-8 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Cole apenas o valor (ex: do <code>&lt;meta content="VALOR"&gt;</code>).
              </p>
            </div>

            <Button onClick={handleSaveSettings} disabled={saving || settingsLoading} size="sm" className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar configurações
            </Button>
          </Card>

          <Card className="p-4 space-y-2">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> URLs importantes
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <p className="text-muted-foreground mb-0.5">Sitemap (envie ao Search Console):</p>
                <code className="block p-2 bg-muted rounded text-[10px] font-mono break-all select-all">{sitemapUrl}</code>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Robots.txt:</p>
                <code className="block p-2 bg-muted rounded text-[10px] font-mono break-all select-all">{siteUrl || "https://seusite.com"}/robots.txt</code>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsPanel;
