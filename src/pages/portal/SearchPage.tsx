import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { ArticleCard, type ArticleCardData } from "@/components/portal/ArticleCard";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<ArticleCardData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = (searchParams.get("q") ?? "").trim();
    setQuery(q);
    if (!q) {
      setResults([]);
      return;
    }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("articles")
        .select("slug,title,excerpt,hero_image_url,category,published_at,reading_time_minutes")
        .eq("status", "published")
        .or(`title.ilike.%${q}%,excerpt.ilike.%${q}%,content.ilike.%${q}%`)
        .order("published_at", { ascending: false })
        .limit(40);
      setResults((data ?? []) as ArticleCardData[]);
      setLoading(false);
    })();
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams({ q: query.trim() });
  };

  return (
    <PortalLayout seo={{ title: query ? `Busca: ${query}` : "Buscar" }}>
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-bold mb-6">Buscar no portal</h1>
        <form onSubmit={handleSubmit} className="flex gap-2 mb-8">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite uma palavra-chave…"
            autoFocus
          />
          <Button type="submit">Buscar</Button>
        </form>

        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !initialQ ? (
          <p className="text-muted-foreground">Digite um termo para iniciar a busca.</p>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma notícia encontrada para "{initialQ}".</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {results.length} {results.length === 1 ? "resultado" : "resultados"} para "{initialQ}"
            </p>
            <div>
              {results.map((a) => (
                <ArticleCard key={a.slug} article={a} variant="horizontal" />
              ))}
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
};

export default SearchPage;
