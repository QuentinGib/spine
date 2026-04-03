import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Star } from "lucide-react";

interface BookDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  author: string;
  rating?: number;
  description?: string | null;
  loadingDescription?: boolean;
  onRatingChange?: (newRating: number) => void;
}

export default function BookDetailModal({
  isOpen,
  onClose,
  title,
  author,
  rating,
  description,
  loadingDescription = false,
  onRatingChange,
}: BookDetailModalProps) {
  const [pendingRating, setPendingRating] = useState<number | null>(null);

  // Reset pending rating whenever a new book is opened
  useEffect(() => {
    setPendingRating(null);
  }, [title]);

  const displayRating = pendingRating ?? rating;
  const isDirty = pendingRating !== null && pendingRating !== rating;

  const handleSave = () => {
    if (pendingRating !== null && onRatingChange) {
      onRatingChange(pendingRating);
      setPendingRating(null);
    }
  };

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // Render via portal so fixed positioning is always relative to the viewport.
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-8
                  transition-opacity duration-200 ease-out
                  ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      onClick={onClose}
    >
      {/* Full-screen backdrop */}
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[3px]" />

      {/* Card — bottom-sheet on mobile, centered card on desktop */}
      <div
        className={`relative z-10 w-full sm:max-w-md bg-card
                    rounded-t-3xl sm:rounded-2xl
                    shadow-[0_-8px_40px_rgba(0,0,0,0.12),0_32px_80px_rgba(0,0,0,0.18)]
                    max-h-[88vh] overflow-y-auto
                    transition-all duration-300 ease-out
                    ${isOpen
                      ? "translate-y-0 opacity-100 sm:scale-100"
                      : "translate-y-full opacity-0 sm:translate-y-3 sm:scale-95"
                    }`}
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Drag handle — mobile only */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 z-10 w-7 h-7 rounded-full
                     bg-muted/70 hover:bg-muted flex items-center justify-center
                     text-muted-foreground hover:text-foreground
                     transition-colors duration-150"
          aria-label="Close"
        >
          <X size={13} strokeWidth={2.5} />
        </button>

        <div className="p-7 pt-6 sm:pt-10 space-y-4">

          {/* Title + author */}
          <div className="space-y-1">
            <h3 className="font-display font-medium text-xl leading-snug text-foreground pr-6">
              {title}
            </h3>
            <p className="text-sm font-display italic text-muted-foreground">
              {author}
            </p>
          </div>

          {/* Rating editor */}
          {rating != null && onRatingChange && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your rating</span>
                <span className="text-sm font-semibold text-primary flex items-center gap-1">
                  <Star size={11} className="fill-primary" />
                  {displayRating}/10
                </span>
              </div>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPendingRating(n)}
                    className={`h-8 rounded text-xs font-semibold transition-all duration-100
                      ${n === displayRating
                        ? "bg-primary text-primary-foreground shadow-sm scale-105"
                        : n < (displayRating ?? 0)
                        ? "bg-primary/15 text-primary/80"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {isDirty && (
                <button
                  onClick={handleSave}
                  className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium
                             transition-opacity hover:opacity-90 mt-1"
                >
                  Save rating
                </button>
              )}
            </div>
          )}

          {/* Description */}
          <div className="border-t border-border/50 pt-4">
            {loadingDescription ? (
              <div className="space-y-2.5">
                <div className="h-2.5 skeleton rounded w-full" />
                <div className="h-2.5 skeleton rounded w-[92%]" />
                <div className="h-2.5 skeleton rounded w-[85%]" />
                <div className="h-2.5 skeleton rounded w-[88%]" />
                <div className="h-2.5 skeleton rounded w-[76%]" />
              </div>
            ) : description ? (
              <p className="text-sm text-foreground/75 leading-relaxed">
                {description}
              </p>
            ) : (
              <p className="text-sm font-display italic text-muted-foreground/50 text-center py-2">
                No description available.
              </p>
            )}
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}
