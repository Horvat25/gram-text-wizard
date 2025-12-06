import { Instagram, Settings, Package, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useBrandSettings();
  const { accounts } = useInstagramAccounts();
  
  // Use brand logo from settings, or first letter of brand name as fallback
  const brandLogo = settings.brandLogoUrl;
  const brandName = settings.brandName || "Agente IA Instagram";
  const connectedUsername = accounts[0]?.username;

  return (
    <header className="border-b bg-card sticky top-0 z-50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div 
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate("/")}
        >
          {brandLogo ? (
            <Avatar className="h-10 w-10 rounded-xl">
              <AvatarImage src={brandLogo} alt={brandName} className="object-cover" />
              <AvatarFallback className="bg-gradient-instagram rounded-xl text-white font-bold">
                {brandName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="bg-gradient-instagram p-2 rounded-xl">
              <Instagram className="w-6 h-6 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold">{brandName}</h1>
            <p className="text-xs text-muted-foreground">
              {connectedUsername ? `@${connectedUsername}` : "Automação de Conteúdo"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={location.pathname === "/insights" ? "default" : "ghost"}
            size="icon"
            onClick={() => navigate("/insights")}
            title="Insights do Agente"
          >
            <Brain className="h-5 w-5" />
          </Button>
          <Button
            variant={location.pathname === "/backup" ? "default" : "ghost"}
            size="icon"
            onClick={() => navigate("/backup")}
            title="Backup"
          >
            <Package className="h-5 w-5" />
          </Button>
          <Button
            variant={location.pathname === "/settings" ? "default" : "ghost"}
            size="icon"
            onClick={() => navigate("/settings")}
            title="Configurações"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;