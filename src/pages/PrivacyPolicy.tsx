import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Link to="/">
          <Button variant="ghost" className="mb-8">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-8">Política de Privacidade</h1>
        
        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">
            Última atualização: {new Date().toLocaleDateString('pt-BR')}
          </p>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">1. Introdução</h2>
            <p>
              A Neural Update ("nós", "nosso" ou "aplicativo") está comprometida em proteger sua privacidade. 
              Esta Política de Privacidade explica como coletamos, usamos, divulgamos e protegemos suas informações 
              quando você usa nosso aplicativo de gerenciamento de conteúdo para Instagram.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">2. Informações que Coletamos</h2>
            <p>Coletamos os seguintes tipos de informações:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Informações da Conta Instagram:</strong> Quando você conecta sua conta do Instagram, 
                acessamos seu nome de usuário, ID do usuário e token de acesso para permitir a publicação de conteúdo.
              </li>
              <li>
                <strong>Conteúdo de Posts:</strong> Armazenamos as legendas, imagens, vídeos e hashtags dos posts que 
                você cria através do nosso aplicativo.
              </li>
              <li>
                <strong>Dados de Uso:</strong> Coletamos informações sobre como você interage com o aplicativo, 
                incluindo posts criados, agendados e publicados.
              </li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">3. Como Usamos Suas Informações</h2>
            <p>Utilizamos as informações coletadas para:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Permitir a criação e publicação de posts no Instagram</li>
              <li>Agendar publicações conforme suas preferências</li>
              <li>Fornecer análises e insights sobre seu conteúdo</li>
              <li>Melhorar nossos serviços e experiência do usuário</li>
              <li>Comunicar atualizações importantes sobre o serviço</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">4. Compartilhamento de Informações</h2>
            <p>
              Não vendemos, alugamos ou compartilhamos suas informações pessoais com terceiros, exceto:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Com a Meta/Instagram:</strong> Para publicar conteúdo em sua conta conforme solicitado.
              </li>
              <li>
                <strong>Por Obrigação Legal:</strong> Quando exigido por lei ou ordem judicial.
              </li>
              <li>
                <strong>Provedores de Serviço:</strong> Utilizamos serviços de hospedagem e banco de dados 
                seguros para armazenar suas informações.
              </li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">5. Segurança dos Dados</h2>
            <p>
              Implementamos medidas de segurança técnicas e organizacionais para proteger suas informações, incluindo:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Criptografia de dados em trânsito e em repouso</li>
              <li>Tokens de acesso armazenados de forma segura</li>
              <li>Acesso restrito a dados pessoais</li>
              <li>Monitoramento regular de segurança</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">6. Seus Direitos</h2>
            <p>Você tem o direito de:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Acessar seus dados pessoais</li>
              <li>Corrigir informações incorretas</li>
              <li>Solicitar a exclusão de seus dados</li>
              <li>Desconectar sua conta do Instagram a qualquer momento</li>
              <li>Exportar seus dados</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">7. Retenção de Dados</h2>
            <p>
              Mantemos suas informações enquanto sua conta estiver ativa ou conforme necessário para 
              fornecer nossos serviços. Você pode solicitar a exclusão de seus dados a qualquer momento 
              através da nossa página de exclusão de dados.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">8. Uso de APIs do Facebook/Instagram</h2>
            <p>
              Nosso aplicativo utiliza as APIs do Facebook e Instagram para:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Autenticar usuários via OAuth</li>
              <li>Publicar conteúdo em contas comerciais do Instagram</li>
              <li>Acessar métricas básicas de engajamento</li>
            </ul>
            <p>
              Seguimos rigorosamente as políticas de uso de dados da Meta e não armazenamos 
              informações além do necessário para fornecer nossos serviços.
            </p>
          </section>


          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">11. Contato</h2>
            <p>
              Se você tiver dúvidas sobre esta Política de Privacidade ou sobre o tratamento de 
              seus dados, entre em contato conosco:
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

export default PrivacyPolicy;
