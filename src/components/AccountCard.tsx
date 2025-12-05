import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Instagram, Trash2, Clock, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { InstagramAccount } from '@/hooks/useInstagramAccounts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AccountCardProps {
  account: InstagramAccount;
  onDisconnect: (id: string) => void;
  tokenStatus: 'active' | 'expiring' | 'expired';
  daysUntilExpiry: number;
}

export function AccountCard({ account, onDisconnect, tokenStatus, daysUntilExpiry }: AccountCardProps) {
  const getStatusBadge = () => {
    switch (tokenStatus) {
      case 'active':
        return (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            Ativo
          </Badge>
        );
      case 'expiring':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Expirando
          </Badge>
        );
      case 'expired':
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            <XCircle className="w-3 h-3 mr-1" />
            Expirado
          </Badge>
        );
    }
  };

  return (
    <Card className="bg-card/50 border-border/50 hover:border-primary/30 transition-all">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
              <Instagram className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">
                @{account.username || 'Unknown'}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                ID: {account.instagram_user_id}
              </p>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground mb-1">Conectado em</p>
            <p className="font-medium">
              {account.connected_at 
                ? format(new Date(account.connected_at), "dd MMM yyyy", { locale: ptBR })
                : 'N/A'
              }
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Token expira em</p>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <p className={`font-medium ${
                tokenStatus === 'expired' ? 'text-red-400' :
                tokenStatus === 'expiring' ? 'text-yellow-400' :
                'text-green-400'
              }`}>
                {tokenStatus === 'expired' 
                  ? 'Expirado' 
                  : `${daysUntilExpiry} dias`
                }
              </p>
            </div>
          </div>
        </div>

        {tokenStatus === 'expired' && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">
              Token expirado. Reconecte a conta para continuar publicando.
            </p>
          </div>
        )}

        {tokenStatus === 'expiring' && (
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm text-yellow-400">
              Token expirando em breve. Reconecte para renovar.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={() => onDisconnect(account.id)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Desconectar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
