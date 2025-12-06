import { Instagram, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useBrandSettings();
  const { accounts } = useInstagramAccounts();
  const { user, signOut } = useAuth();
  
  // Use brand logo from settings, or Instagram profile picture, or first letter as fallback
  const brandLogo = settings.brandLogoUrl;
  const brandName = settings.brandName || "Agente IA Instagram";
  const connectedUsername = accounts[0]?.username;
  const instagramProfilePic = accounts[0]?.profile_picture_url;
  
  // Priority: Brand logo > Instagram profile pic > Instagram icon
  const displayLogo = brandLogo || instagramProfilePic;

  const handleLogout = async () => {
    await signOut();
    toast.success("Logout realizado com sucesso!");
    navigate("/auth");
  };

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
        
        <div className="flex items-center gap-2">
          <Button
            variant={location.pathname === "/settings" ? "default" : "ghost"}
            size="icon"
            onClick={() => navigate("/settings")}
            title="Configurações"
          >
            <Settings className="h-5 w-5" />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {user?.email?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user?.user_metadata?.full_name || "Usuário"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                Configurações
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default Header;
