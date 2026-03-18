import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Loader2, Check } from "lucide-react";

interface RuleParam {
  name: string;
  type: string;
  default: number;
  min?: number;
  max?: number;
  description: string;
}

interface CatalogRule {
  ruleId: string;
  displayName: string;
  description: string;
  severity: string;
  enabledByDefault: boolean;
  params: RuleParam[];
  defaults: Record<string, number>;
  tactics: string[];
}

interface RuleCardProps {
  rule: CatalogRule;
  isInstalled: boolean;
  onInstall: (ruleId: string, params: Record<string, number>) => void;
  isPending: boolean;
  canInstall?: boolean;
}

function getSeverityVariant(severity: string): "destructive" | "secondary" | "outline" | "default" {
  switch (severity.toLowerCase()) {
    case "high":
      return "destructive";
    case "medium":
      return "default";
    case "low":
      return "secondary";
    default:
      return "outline";
  }
}

export function RuleCard({ rule, isInstalled, onInstall, isPending, canInstall = true }: RuleCardProps) {
  const [params, setParams] = useState<Record<string, number>>(rule.defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleParamChange = (name: string, value: string, param: RuleParam) => {
    const numValue = parseInt(value, 10);
    const newParams = { ...params, [name]: numValue };
    setParams(newParams);

    const newErrors = { ...errors };
    if (isNaN(numValue)) {
      newErrors[name] = "Must be a number";
    } else if (param.min !== undefined && numValue < param.min) {
      newErrors[name] = `Min: ${param.min}`;
    } else if (param.max !== undefined && numValue > param.max) {
      newErrors[name] = `Max: ${param.max}`;
    } else {
      delete newErrors[name];
    }
    setErrors(newErrors);
  };

  const handleInstall = () => {
    if (Object.keys(errors).length === 0) {
      onInstall(rule.ruleId, params);
    }
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <Card data-testid={`card-rule-${rule.ruleId}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">{rule.displayName}</CardTitle>
        </div>
        <Badge variant={getSeverityVariant(rule.severity)}>{rule.severity}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <CardDescription>{rule.description}</CardDescription>
        
        {rule.tactics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-sm text-muted-foreground">Tactics:</span>
            {rule.tactics.map((tactic) => (
              <Badge key={tactic} variant="outline" className="text-xs">
                {tactic}
              </Badge>
            ))}
          </div>
        )}

        {rule.params.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Parameters:</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rule.params.map((param) => (
                <div key={param.name} className="space-y-1">
                  <Label htmlFor={`${rule.ruleId}-${param.name}`} className="text-xs">
                    {param.description}
                  </Label>
                  <Input
                    id={`${rule.ruleId}-${param.name}`}
                    type="number"
                    value={params[param.name] ?? param.default}
                    onChange={(e) => handleParamChange(param.name, e.target.value, param)}
                    disabled={isInstalled || isPending}
                    min={param.min}
                    max={param.max}
                    className={errors[param.name] ? "border-destructive" : ""}
                    data-testid={`input-param-${param.name}`}
                  />
                  {errors[param.name] && (
                    <p className="text-xs text-destructive">{errors[param.name]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter>
        {isInstalled ? (
          <Badge variant="secondary" className="gap-1">
            <Check className="h-3 w-3" />
            Installed
          </Badge>
        ) : canInstall ? (
          <Button
            onClick={handleInstall}
            disabled={isPending || hasErrors}
            data-testid={`button-install-${rule.ruleId}`}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Installing...
              </>
            ) : (
              "Install Rule"
            )}
          </Button>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            No install permission
          </Badge>
        )}
      </CardFooter>
    </Card>
  );
}
