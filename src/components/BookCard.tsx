import { useState } from "react";
import { X, Star, BookOpen } from "lucide-react";

interface BookCardProps {
  id: string;
  title: string;
  author: string;
  rating: number;
  coverUrl: string | null;
  onDelete: (id: string) => void;
  onClick?: () => void;
}

export default function BookCard({ id, title, author, rating, coverUrl, onDelete, onClick }: BookCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      className="group relative flex flex-col cursor-pointer"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >

      {/* Delete — stops propagation so it doesn't open the detail modal */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(id); }}
        className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full
                   bg-background/80 backdrop-blur-sm flex items-center justify-center
                   text-muted-foreground/50 hover:text-destructive hover:bg-background
                   transition-all duration-150
                   opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 shadow-sm"
        title="Remove from library"
        aria-label="Remove from library"
      >
        <X size={10} strokeWidth={2.5} />
      </button>

      {/* Cover */}
      <div
        className="cover-lift aspect-[2/3] rounded overflow-hidden bg-muted
                   flex items-center justify-center
                   shadow-[0_2px_8px_rgba(100,70,20,0.08)]
                   group-hover:-translate-y-[3px]
                   group-hover:shadow-[0_10px_24px_rgba(100,70,20,0.15)]"
      >
        {coverUrl && !imgFailed ? (
          <img
            src={coverUrl}
            alt={`Cover of ${title}`}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
            loading="lazy"
          />
        ) : (
          <BookOpen size={24} className="text-muted-foreground/20" strokeWidth={1.5} />
        )}
      </div>

      {/* Metadata */}
      <div className="pt-2.5 space-y-0.5">
        <p className="text-[11px] font-medium text-foreground truncate leading-snug">{title}</p>
        <p className="text-[10px] text-muted-foreground truncate leading-snug">{author}</p>
        <p className="flex items-center gap-1 pt-0.5">
          <Star size={8} className="text-primary fill-primary flex-shrink-0" />
          <span className="text-[10px] text-primary font-semibold tracking-wide">{rating}/10</span>
        </p>
      </div>

    </div>
  );
}
