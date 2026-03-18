import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  loading?: boolean;
  iconColor?: string;
  iconBg?: string;
  progress?: number;
}

export default function StatsCard({
  title,
  value,
  icon: Icon,
  change,
  changeType = "neutral",
  loading = false,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
  progress,
}: StatsCardProps) {
  if (loading) {
    return (
      <Card className="stats-card animate-pulse">
        <CardContent className="p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-muted rounded-lg"></div>
            <div className="ml-4 flex-1">
              <div className="h-4 bg-muted rounded w-24 mb-2"></div>
              <div className="h-8 bg-muted rounded w-16"></div>
            </div>
          </div>
          <div className="mt-4">
            <div className="h-4 bg-muted rounded w-32"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getChangeIcon = () => {
    if (changeType === "positive") return TrendingUp;
    if (changeType === "negative") return TrendingDown;
    return null;
  };

  const getChangeColor = () => {
    if (changeType === "positive") return "text-green-600 dark:text-green-400";
    if (changeType === "negative") return "text-red-600 dark:text-red-400";
    return "text-muted-foreground";
  };

  const ChangeIcon = getChangeIcon();

  return (
    <Card className="stats-card">
      <CardContent className="p-6">
        <div className="flex items-center">
          <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center", iconBg)}>
            <Icon className={cn("text-xl w-6 h-6", iconColor)} />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
        </div>
        
        {progress !== undefined && (
          <div className="mt-4">
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-purple-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground mt-1 block">
              {progress}% of capacity
            </span>
          </div>
        )}
        
        {change && !progress && (
          <div className="mt-4">
            <span className={cn("text-sm font-medium flex items-center", getChangeColor())}>
              {ChangeIcon && <ChangeIcon className="w-4 h-4 mr-1" />}
              {change}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
