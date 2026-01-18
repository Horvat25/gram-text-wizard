import { Card, CardContent } from '@/components/ui/card';
import { 
  Brain, 
  Target, 
  TrendingUp, 
  Zap,
  CheckCircle,
  BarChart3
} from 'lucide-react';
import { motion } from 'framer-motion';

interface AgentStatsProps {
  stats: {
    totalDecisions: number;
    postsCreated: number;
    hypothesesConfirmed: number;
    hypothesesTotal: number;
    avgExpectedEngagement: number;
    avgActualEngagement: number;
  };
}

export default function AgentStats({ stats }: AgentStatsProps) {
  const accuracyRate = stats.hypothesesTotal > 0 
    ? (stats.hypothesesConfirmed / stats.hypothesesTotal * 100)
    : 0;

  const statCards = [
    {
      icon: Brain,
      label: 'Decisões Tomadas',
      value: stats.totalDecisions,
      color: 'text-primary',
      bgColor: 'bg-primary/10'
    },
    {
      icon: Zap,
      label: 'Posts Criados',
      value: stats.postsCreated,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10'
    },
    {
      icon: Target,
      label: 'Taxa de Acerto',
      value: accuracyRate > 0 ? `${accuracyRate.toFixed(0)}%` : 'N/A',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      subtitle: stats.hypothesesTotal > 0 
        ? `${stats.hypothesesConfirmed}/${stats.hypothesesTotal} hipóteses`
        : 'Coletando dados'
    },
    {
      icon: TrendingUp,
      label: 'Engajamento Real',
      value: `${stats.avgActualEngagement.toFixed(1)}%`,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      subtitle: stats.avgExpectedEngagement > 0 
        ? `Esperado: ${stats.avgExpectedEngagement.toFixed(1)}%`
        : undefined
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <Card className="border-border/50 hover:border-primary/30 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl ${stat.bgColor}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                  <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                  {stat.subtitle && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{stat.subtitle}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
