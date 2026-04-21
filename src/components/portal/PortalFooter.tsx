import { Link } from "react-router-dom";
import { ARTICLE_CATEGORIES } from "@/lib/article-helpers";
import logoUrl from "@/assets/neural-update-logo.png";

export const PortalFooter = () => {
  return (
    <footer className="relative mt-24 border-t border-border/40">
      <div className="absolute top-0 inset-x-0 portal-divider" aria-hidden />
      <div className="container mx-auto px-4 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-9 w-9 rounded-lg overflow-hidden ring-1 ring-border/60">
                <img src={logoUrl} alt="" className="h-full w-full object-cover" />
              </div>
              <span className="font-display font-bold text-base tracking-tight">
                Neural<span className="portal-gradient-text">Update</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Notícias de tecnologia, inteligência artificial e futuro,
              curadas e produzidas em tempo real pelo Agente Horvat.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary portal-live-dot" />
              Atualizado ao vivo
            </div>
          </div>

          <div>
            <h3 className="font-display font-semibold text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4">
              Editorias
            </h3>
            <ul className="space-y-2.5">
              {ARTICLE_CATEGORIES.slice(0, 5).map((cat) => (
                <li key={cat.slug}>
                  <Link
                    to={`/categoria/${cat.slug}`}
                    className="text-sm text-foreground/80 hover:text-primary transition-colors"
                  >
                    {cat.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display font-semibold text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4">
              Institucional
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link to="/sobre" className="text-sm text-foreground/80 hover:text-primary transition-colors">
                  Sobre
                </Link>
              </li>
              <li>
                <Link to="/privacy-policy" className="text-sm text-foreground/80 hover:text-primary transition-colors">
                  Privacidade
                </Link>
              </li>
              <li>
                <Link to="/terms-of-service" className="text-sm text-foreground/80 hover:text-primary transition-colors">
                  Termos
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-display font-semibold text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4">
              Newsroom
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link to="/busca" className="text-sm text-foreground/80 hover:text-primary transition-colors">
                  Buscar
                </Link>
              </li>
              <li>
                <Link to="/sobre" className="text-sm text-foreground/80 hover:text-primary transition-colors">
                  Quem é o Agente Horvat
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-border/40 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Neural Update. Todos os direitos reservados.
          </p>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Brasil · 2026
          </p>
        </div>
      </div>
    </footer>
  );
};
