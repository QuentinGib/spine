import { useState } from "react";
import { X, Star, BookOpen } from "lucide-react";

interface BookCardProps {
  id: string;
  title: string;
  author: string;
  rating: number;
  coverUrl: string | null;
  onDelete: (id: string) => void;
}

export default function BookCard({ id, title, author, rating, coverUrl, onDelete }: BookCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="group relative flex flex-col rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow duration-200 bg-card">
      {/* Delete button */}
      <button
        onClick={() => onDelete(id)}
        className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-background/75 backdrop-blur-sm flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-background transition-all opacity-0 group-hover:opacity-100"
        title="Remove from library"
      >
        <X size={11} />
      </button>

      {/* Cover — 2:3 aspect ratio */}
      <div className="aspect-[2/3] bg-muted flex items-center justify-center overflow-hidden">
        {coverUrl && !imgFailed ? (
          <img
            src={coverUrl}
            alt={`Cover of ${title}`}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
            loading="lazy"
          />
        ) : (
          <BookOpen size={28} className="text-muted-foreground/25" />
        )}
      </div>

      {/* Info */}
      <div className="px-2 pt-2 pb-2.5 space-y-0.5">
        <p className="text-xs font-medium text-foreground truncate leading-snug">{title}</p>
        <p className="text-[10px] text-muted-foreground truncate">{author}</p>
        <p className="flex items-center gap-0.5 pt-0.5">
          <Star size={9} className="text-primary fill-primary" />
          <span className="text-[10px] text-primary font-medium">{rating}/10</span>
        </p>
      </div>
    </div>
  );
}
