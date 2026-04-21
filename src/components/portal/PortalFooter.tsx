import { Link } from "react-router-dom";
import { ARTICLE_CATEGORIES } from "@/lib/article-helpers";

export const PortalFooter = () => {
  return (
    <footer className="border-t border-border bg-muted/30 mt-20">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">N</span>
              </div>
              <span className="font-bold text-lg">
                Neural<span className="text-primary">Update</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              O portal de notícias de tecnologia e futuro, atualizado em tempo real pela IA.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-3">Categorias</h3>
            <ul className="space-y-2">
              {ARTICLE_CATEGORIES.slice(0, 5).map((cat) => (
                <li key={cat.slug}>
                  <Link
                    to={`/categoria/${cat.slug}`}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {cat.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-3">Institucional</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/sobre" className="text-sm text-muted-foreground hover:text-foreground">
                  Sobre
                </Link>
              </li>
              <li>
                <Link to="/privacy-policy" className="text-sm text-muted-foreground hover:text-foreground">
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link to="/terms-of-service" className="text-sm text-muted-foreground hover:text-foreground">
                  Termos de Uso
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-3">Acesso</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">
                  Painel Editorial
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Neural Update. Conteúdo curado e produzido pelo Agente Horvat.
          </p>
          <p className="text-xs text-muted-foreground">
            Tecnologia · IA · Futuro
          </p>
        </div>
      </div>
    </footer>
  );
};
