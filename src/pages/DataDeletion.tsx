import { ArrowLeft, Trash2, Mail, Clock, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DataDeletion = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Link to="/">
          <Button variant="ghost" className="mb-8">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-4">Exclusão de Dados do Usuário</h1>
        <p className="text-muted-foreground text-lg mb-8">
          Respeitamos seu direito à privacidade e oferecemos opções claras para gerenciar seus dados.
        </p>

        <div className="grid gap-6 md:grid-cols-2 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                Exclusão Completa
              </CardTitle>
              <CardDescription>
                Remova todos os seus dados do nosso sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ao solicitar a exclusão completa, removeremos:
              </p>
              <ul className="text-sm space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  Conexão com sua conta Instagram
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  Tokens de acesso armazenados
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  Histórico de posts criados
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  Posts agendados
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  Dados de analytics
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Prazo de Processamento
              </CardTitle>
              <CardDescription>
                Quanto tempo leva para processar sua solicitação
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Nosso compromisso com você:
              </p>
              <ul className="text-sm space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  Confirmação em até 24 horas
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  Exclusão completa em até 30 dias
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  Notificação por email após conclusão
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Como Solicitar a Exclusão
            </CardTitle>
            <CardDescription>
              Siga os passos abaixo para solicitar a exclusão dos seus dados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  1
                </div>
                <div>
                  <h3 className="font-semibold">Envie um email</h3>
                  <p className="text-sm text-muted-foreground">
                    Envie um email para <strong>neural.update2000@gmail.com</strong> com o assunto 
                    "Solicitação de Exclusão de Dados".
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  2
                </div>
                <div>
                  <h3 className="font-semibold">Inclua suas informações</h3>
                  <p className="text-sm text-muted-foreground">
                    No corpo do email, inclua o nome de usuário da sua conta Instagram conectada 
                    e o email associado à sua conta.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  3
                </div>
                <div>
                  <h3 className="font-semibold">Aguarde confirmação</h3>
                  <p className="text-sm text-muted-foreground">
                    Você receberá uma confirmação em até 24 horas com os próximos passos e 
                    um código de rastreamento da sua solicitação.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  4
                </div>
                <div>
                  <h3 className="font-semibold">Conclusão</h3>
                  <p className="text-sm text-muted-foreground">
                    Após a exclusão completa, você receberá um email de confirmação informando 
                    que todos os seus dados foram removidos do nosso sistema.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <a href="mailto:neural.update2000@gmail.com?subject=Solicitação de Exclusão de Dados">
                <Button size="lg" className="w-full sm:w-auto">
                  <Mail className="mr-2 h-4 w-4" />
                  Enviar Email de Solicitação
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-2">Desconexão Rápida</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Se você deseja apenas desconectar sua conta do Instagram sem excluir todo o histórico, 
              você pode fazer isso diretamente na aba "Conectar" do aplicativo. Isso removerá a 
              conexão OAuth mas manterá seu histórico de posts para referência futura.
            </p>
            <p className="text-sm text-muted-foreground">
              Você também pode revogar o acesso do aplicativo diretamente nas configurações do Instagram: 
              <strong> Configurações → Aplicativos e sites → Ativos → Neural Update → Remover</strong>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DataDeletion;
