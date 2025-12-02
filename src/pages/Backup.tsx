import { useState } from "react";
import { Download, Upload, ArrowLeft, FileJson, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { exportData, importData, clearAllData } from "@/lib/local-storage";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Backup = () => {
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);

  const handleExportData = () => {
    setIsExporting(true);
    try {
      const dataString = exportData();
      const blob = new Blob([dataString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `instagram-manager-backup-${format(new Date(), "yyyy-MM-dd-HHmmss")}.json`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success("Backup exportado com sucesso!");
    } catch (error) {
      console.error("Error exporting data:", error);
      toast.error("Erro ao exportar backup");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportData = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const success = importData(text);
        
        if (success) {
          toast.success("Backup importado com sucesso!");
          setTimeout(() => window.location.reload(), 1000);
        } else {
          toast.error("Formato de arquivo inválido");
        }
      } catch (error) {
        console.error("Error importing data:", error);
        toast.error("Erro ao importar backup");
      }
    };
    input.click();
  };

  const handleClearData = () => {
    try {
      clearAllData();
      toast.success("Todos os dados foram apagados");
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Error clearing data:", error);
      toast.error("Erro ao apagar dados");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Backup & Restore</h1>
            <p className="text-sm text-muted-foreground">
              Exporte e importe seus dados (100% local)
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 max-w-4xl mx-auto">
          {/* Export Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                Exportar Dados
              </CardTitle>
              <CardDescription>
                Baixe todos os seus posts, métricas e configurações em JSON
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                <FileJson className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm mb-1">Backup Local (JSON)</p>
                  <p className="text-sm text-muted-foreground">
                    Inclui posts, métricas, contexto do agente e configurações.
                    Todos os dados ficam salvos no seu navegador.
                  </p>
                </div>
              </div>
              <Button onClick={handleExportData} disabled={isExporting} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                {isExporting ? "Exportando..." : "Exportar Backup"}
              </Button>
            </CardContent>
          </Card>

          {/* Import Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                Importar Dados
              </CardTitle>
              <CardDescription>
                Restaure um backup anterior em JSON
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg border border-warning/50 bg-warning/5">
                <p className="text-sm font-medium text-warning mb-1">⚠️ Atenção</p>
                <p className="text-sm text-muted-foreground">
                  Importar um backup substituirá todos os dados atuais.
                  Exporte um backup antes de continuar.
                </p>
              </div>
              <Button onClick={handleImportData} variant="outline" className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                Selecionar Arquivo JSON
              </Button>
            </CardContent>
          </Card>

          {/* Clear Data Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                Apagar Todos os Dados
              </CardTitle>
              <CardDescription>
                Remove permanentemente todos os dados do navegador
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5 mb-4">
                <p className="text-sm font-medium text-destructive mb-1">🔴 Perigo</p>
                <p className="text-sm text-muted-foreground">
                  Esta ação não pode ser desfeita. Todos os posts, métricas e configurações
                  serão permanentemente removidos.
                </p>
              </div>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Apagar Todos os Dados
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. Isso irá permanentemente deletar
                      todos os seus posts, métricas, contexto do agente e configurações.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearData} className="bg-destructive hover:bg-destructive/90">
                      Sim, apagar tudo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>💡 Como Funciona</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-medium">✅ 100% Remixável</p>
                <p className="text-sm text-muted-foreground">
                  Todos os dados ficam salvos no LocalStorage do seu navegador.
                  Quando você remixar o projeto, basta exportar e importar seus dados.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">✅ Sem Backend</p>
                <p className="text-sm text-muted-foreground">
                  Não usa Lovable Cloud ou qualquer backend externo. Perfeito para projetos
                  que você quer copiar e compartilhar.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">✅ Portabilidade Total</p>
                <p className="text-sm text-muted-foreground">
                  Exporte seus dados em JSON e leve para qualquer lugar. Funciona em
                  qualquer navegador e não depende de servidor.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Backup;
