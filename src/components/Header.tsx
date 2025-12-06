import { Instagram, Settings } from "lucide-react";
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
  
  // Use brand logo from settings, or Instagram profile picture, or first letter as fallback
  const brandLogo = settings.brandLogoUrl;
  const brandName = settings.brandName || "Agente IA Instagram";
  const connectedUsername = accounts[0]?.username;
  const instagramProfilePic = accounts[0]?.profile_picture_url;
  
  // Priority: Brand logo > Instagram profile pic > Instagram icon
  const displayLogo = brandLogo || instagramProfilePic;

  return (
    <header className="border-b bg-card sticky top-0 z-50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div 
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate("/")}
        >
          {displayLogo ? (
            <Avatar className="h-10 w-10 rounded-xl">
              <AvatarImage src={displayLogo} alt={brandName} className="object-cover" />
              <AvatarFallback className="bg-gradient-instagram rounded-xl text-white font-bold">
                {(connectedUsername || brandName).charAt(0).toUpperCase()}
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
        
        <Button
          variant={location.pathname === "/settings" ? "default" : "ghost"}
          size="icon"
          onClick={() => navigate("/settings")}
          title="Configurações"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
};

export default Header;
