import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Link to="/">
          <Button variant="ghost" className="mb-8">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-8">Termos de Serviço</h1>
        
        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">
            Última atualização: {new Date().toLocaleDateString("pt-BR")}
          </p>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar e usar o Neural Update ("Serviço", "Aplicativo", "nós"), você concorda em 
              cumprir e estar vinculado a estes Termos de Serviço. Se você não concordar com 
              qualquer parte destes termos, não poderá acessar o Serviço.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">2. Descrição do Serviço</h2>
            <p>
              O Neural Update é uma plataforma de criação e gerenciamento de conteúdo para redes sociais 
              que permite:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Criar legendas e conteúdo com auxílio de inteligência artificial</li>
              <li>Gerar imagens e vídeos para publicação</li>
              <li>Agendar e publicar conteúdo automaticamente no Instagram e TikTok</li>
              <li>Visualizar métricas e análises de desempenho</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">3. Elegibilidade</h2>
            <p>
              Para usar nosso Serviço, você deve:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Ter pelo menos 18 anos de idade</li>
              <li>Possuir uma conta comercial ou de criador no Instagram e/ou TikTok</li>
              <li>Ser o proprietário legítimo das contas que conectar ao Serviço</li>
              <li>Concordar com estes Termos de Serviço</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">4. Sua Conta</h2>
            <p>
              Você é responsável por manter a confidencialidade de suas credenciais de acesso e por 
              todas as atividades que ocorram sob sua conta. Você concorda em:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Fornecer informações precisas e atualizadas</li>
              <li>Manter a segurança de sua senha</li>
              <li>Notificar-nos imediatamente sobre qualquer uso não autorizado</li>
              <li>Não compartilhar suas credenciais com terceiros</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">5. Uso Aceitável</h2>
            <p>
              Ao usar nosso Serviço, você concorda em NÃO:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Violar leis aplicáveis ou direitos de terceiros</li>
              <li>Publicar conteúdo ilegal, ofensivo, difamatório ou discriminatório</li>
              <li>Usar o Serviço para spam ou práticas enganosas</li>
              <li>Tentar acessar sistemas ou dados não autorizados</li>
              <li>Interferir com a operação normal do Serviço</li>
              <li>Revender ou redistribuir o Serviço sem autorização</li>
              <li>Violar os termos de uso do Instagram, TikTok ou outras plataformas conectadas</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">6. Conteúdo do Usuário</h2>
            <p>
              Você mantém todos os direitos sobre o conteúdo que criar usando nosso Serviço. Ao usar 
              o Serviço, você nos concede uma licença limitada para:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Processar e armazenar seu conteúdo para fornecer o Serviço</li>
              <li>Publicar conteúdo nas plataformas conectadas conforme suas instruções</li>
              <li>Usar dados anonimizados para melhorar nossos serviços</li>
            </ul>
            <p>
              Você é o único responsável pelo conteúdo que publica e deve garantir que possui 
              os direitos necessários para publicá-lo.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">7. Integrações com Terceiros</h2>
            <p>
              Nosso Serviço se integra com plataformas de terceiros, incluindo:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Instagram/Meta:</strong> Para publicação de conteúdo e acesso a métricas. 
                O uso está sujeito aos Termos de Uso da Meta.
              </li>
              <li>
                <strong>TikTok:</strong> Para publicação de vídeos. O uso está sujeito aos 
                Termos de Serviço do TikTok.
              </li>
            </ul>
            <p>
              Você é responsável por cumprir os termos de uso dessas plataformas. Não somos 
              responsáveis por ações tomadas por essas plataformas em relação à sua conta.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">8. Propriedade Intelectual</h2>
            <p>
              O Serviço, incluindo seu design, código, funcionalidades e marca, é propriedade 
              do Neural Update e está protegido por leis de propriedade intelectual. Você não 
              pode copiar, modificar, distribuir ou criar obras derivadas sem nossa autorização.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">9. Limitação de Responsabilidade</h2>
            <p>
              O Serviço é fornecido "como está" e "conforme disponível". Na extensão máxima 
              permitida por lei, não nos responsabilizamos por:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Interrupções ou indisponibilidade do Serviço</li>
              <li>Perdas de dados ou conteúdo</li>
              <li>Ações tomadas por plataformas de terceiros</li>
              <li>Danos indiretos, incidentais ou consequenciais</li>
              <li>Resultados de conteúdo gerado por IA</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">10. Modificações do Serviço</h2>
            <p>
              Reservamo-nos o direito de modificar, suspender ou descontinuar qualquer aspecto 
              do Serviço a qualquer momento, com ou sem aviso prévio. Não seremos responsáveis 
              perante você ou terceiros por qualquer modificação, suspensão ou descontinuação.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">11. Rescisão</h2>
            <p>
              Podemos suspender ou encerrar seu acesso ao Serviço a qualquer momento, por 
              qualquer motivo, incluindo violação destes Termos. Você pode encerrar sua conta 
              a qualquer momento desconectando suas redes sociais e solicitando a exclusão de dados.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">12. Lei Aplicável</h2>
            <p>
              Estes Termos são regidos pelas leis da República Federativa do Brasil. Qualquer 
              disputa será resolvida nos tribunais competentes do Brasil.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">13. Alterações nos Termos</h2>
            <p>
              Podemos atualizar estes Termos periodicamente. Notificaremos sobre alterações 
              significativas através do Serviço ou por email. O uso continuado após as 
              alterações constitui aceitação dos novos Termos.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">14. Contato</h2>
            <p>
              Para dúvidas sobre estes Termos de Serviço, entre em contato:
            </p>
            <p className="font-medium">
              Email: neural.update2000@gmail.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
