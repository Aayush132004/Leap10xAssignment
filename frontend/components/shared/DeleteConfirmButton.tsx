"use client";

import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface DeleteConfirmButtonProps {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  triggerLabel?: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  triggerClassName?: string;
  /** Prevents the trigger's click from bubbling — needed when nested inside a <Link>/<Card> row. */
  stopPropagation?: boolean;
}

/**
 * The one delete confirmation used everywhere in the app (agents list/detail, calls
 * list/detail): a real confirm dialog instead of the browser's native confirm(), with a
 * loading state on the destructive action and the failure surfaced in the dialog itself
 * rather than silently failing.
 */
export function DeleteConfirmButton({
  title,
  description,
  onConfirm,
  triggerLabel = "Delete",
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerClassName,
  stopPropagation,
}: DeleteConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault(); // keep the dialog open until we know the delete succeeded
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!deleting) {
          setOpen(next);
          if (!next) setError(null);
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant={triggerVariant}
          size={triggerSize}
          className={triggerClassName}
          onClick={(e) => {
            if (stopPropagation) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(true);
            }
          }}
        >
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => stopPropagation && e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
