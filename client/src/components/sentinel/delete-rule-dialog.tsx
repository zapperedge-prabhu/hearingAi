import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

interface DeleteRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleName: string;
  onConfirm: () => void;
  isPending: boolean;
}

export function DeleteRuleDialog({
  open,
  onOpenChange,
  ruleName,
  onConfirm,
  isPending,
}: DeleteRuleDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Rule</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this rule?
            <br />
            <br />
            <strong>Rule:</strong> {ruleName}
            <br />
            <br />
            This will remove the detection rule from your Sentinel workspace. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} data-testid="button-cancel-delete">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground"
            data-testid="button-confirm-delete"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Rule"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
