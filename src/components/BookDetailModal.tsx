import { useEffect } from "react";
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
}

export default function BookDetailModal({
  isOpen,
  onClose,
  title,
  author,
  rating,
  description,
  loadingDescription = false,
}: BookDetailModalProps) {

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
        className={`relative z-10 w-full sm:max-w-sm bg-card
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

          {/* Title + author + rating */}
          <div className="space-y-1">
            <h3 className="font-display font-medium text-xl leading-snug text-foreground pr-6">
              {title}
            </h3>
            <p className="text-sm font-display italic text-muted-foreground">
              {author}
            </p>
            {rating != null && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <Star size={11} className="fill-primary text-primary flex-shrink-0" />
                <span className="text-sm font-semibold text-primary">{rating}/10</span>
              </div>
            )}
          </div>

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
