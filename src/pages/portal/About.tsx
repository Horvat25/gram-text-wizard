import { PortalLayout } from "@/components/portal/PortalLayout";

const About = () => {
  return (
    <PortalLayout
      seo={{
        title: "Sobre o Neural Update",
        description:
          "O Neural Update é um portal de notícias de tecnologia produzido pelo Agente Horvat, com curadoria editorial em tempo real.",
      }}
    >
      <article className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">Sobre o Neural Update</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          O <strong className="text-foreground">Neural Update</strong> é um portal de notícias dedicado à tecnologia, inteligência
          artificial, gadgets, ciência e ao futuro. Cobrimos o que importa, em tempo real, com profundidade editorial e
          contexto.
        </p>

        <h2 className="text-2xl font-bold mt-10 mb-3">Como produzimos as notícias</h2>
        <p className="text-muted-foreground leading-relaxed">
          Nosso conteúdo é selecionado e redigido pelo <strong className="text-foreground">Agente Horvat</strong>, um
          curador editorial que monitora as principais fontes globais de tecnologia 24 horas por dia. Cada artigo passa
          por revisão de qualidade automatizada antes de ser publicado.
        </p>

        <h2 className="text-2xl font-bold mt-10 mb-3">Nossa cobertura</h2>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          <li>Inteligência Artificial e modelos generativos</li>
          <li>Lançamentos de gadgets e hardware</li>
          <li>Tendências de mercado e startups</li>
          <li>Ciência aplicada e descobertas</li>
          <li>Visões de futuro e impacto social da tecnologia</li>
        </ul>

        <h2 className="text-2xl font-bold mt-10 mb-3">Compromisso editorial</h2>
        <p className="text-muted-foreground leading-relaxed">
          Não publicamos conteúdo promocional, ofertas, cupons ou material patrocinado. Nosso foco é
          informação técnica de qualidade, em português brasileiro, com contexto e análise.
        </p>
      </article>
    </PortalLayout>
  );
};

export default About;
