import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Search, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ARTICLE_CATEGORIES } from "@/lib/article-helpers";
import { cn } from "@/lib/utils";
import logoUrl from "@/assets/neural-update-logo.png";

export const PortalHeader = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    navigate(`/busca?q=${encodeURIComponent(query.trim())}`);
    setSearchOpen(false);
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2.5 shrink-0 group"
            aria-label="Neural Update — Início"
          >
            <div className="relative h-9 w-9 rounded-lg overflow-hidden ring-1 ring-border/60 group-hover:ring-primary/60 transition-all">
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display font-bold text-base tracking-tight">
                Neural<span className="portal-gradient-text">Update</span>
              </span>
              <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
                <span className="inline-block h-1 w-1 rounded-full bg-primary portal-live-dot mr-1 align-middle" />
                Tecnologia · IA · Futuro
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5" aria-label="Categorias">
            {ARTICLE_CATEGORIES.slice(0, 5).map((cat) => (
              <NavLink
                key={cat.slug}
                to={`/categoria/${cat.slug}`}
                className={({ isActive }) =>
                  cn(
                    "relative px-3 py-2 text-[13px] font-medium rounded-md transition-colors",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {cat.label}
                    {isActive && (
                      <span className="absolute left-3 right-3 -bottom-px h-px portal-gradient" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
            <NavLink
              to="/sobre"
              className={({ isActive }) =>
                cn(
                  "px-3 py-2 text-[13px] font-medium rounded-md transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              Sobre
            </NavLink>
          </nav>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 hover:text-primary"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Buscar"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {searchOpen && (
          <form onSubmit={handleSearch} className="pb-3">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar notícias…"
              className="w-full bg-card/60 border-border/60 focus-visible:ring-primary"
            />
          </form>
        )}

        {menuOpen && (
          <nav className="md:hidden pb-4 flex flex-col gap-1" aria-label="Menu mobile">
            {ARTICLE_CATEGORIES.slice(0, 5).map((cat) => (
              <NavLink
                key={cat.slug}
                to={`/categoria/${cat.slug}`}
                onClick={() => setMenuOpen(false)}
                className="px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
              >
                {cat.label}
              </NavLink>
            ))}
            <NavLink
              to="/sobre"
              onClick={() => setMenuOpen(false)}
              className="px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
            >
              Sobre
            </NavLink>
          </nav>
        )}
      </div>
    </header>
  );
};
