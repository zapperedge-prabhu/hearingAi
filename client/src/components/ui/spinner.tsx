import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Spinner({ className, size = "md" }: SpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6", 
    lg: "h-8 w-8"
  };

  return (
    <div
      className={cn(
        "animate-spin rounded-full border-2 border-current border-t-transparent",
        sizeClasses[size],
        className
      )}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

interface LoadingSpinnerProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ message = "Loading...", size = "md", className }: LoadingSpinnerProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center space-y-2 py-8", className)}>
      <Spinner size={size} className="text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}