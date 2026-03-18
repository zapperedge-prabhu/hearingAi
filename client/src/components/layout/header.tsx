import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { RoleSelector } from "@/components/role-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { HelpPanel } from "@/components/HelpPanel";

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <>
      <header className="h-20 bg-background shadow-sm border-b border-border flex items-center justify-between px-8">
        <div className="flex items-center">
          <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        </div>
        
        <div className="flex items-center flex-1 justify-end space-x-4">
          {/* Extended Role & Organization Selector */}
          <div className="flex items-center space-x-3 bg-muted/30 rounded-lg px-8 py-3 border min-w-[700px] max-w-[900px]">
            <RoleSelector />
          </div>
          
          {/* Help Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsHelpOpen(true)}
            data-testid="button-help"
            className="text-muted-foreground hover:text-foreground"
            title="Open Help Center"
          >
            <HelpCircle className="h-5 w-5" />
          </Button>
          
          {/* Theme Toggle */}
          <ThemeToggle />
        </div>
      </header>

      <HelpPanel isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
}
