import { useState } from "react";
import { BookOpen } from "lucide-react";

interface BookCoverProps {
  coverUrl: string | null;
  title: string;
  size?: "sm" | "md" | "xl" | "lg";
}

const sizeClasses = {
  sm: "w-10 h-14",
  md: "w-16 h-24",
  xl: "w-24 h-36",
  lg: "w-32 h-48",
};

const iconSizes = { sm: 14, md: 18, xl: 22, lg: 28 };

export default function BookCover({ coverUrl, title, size = "sm" }: BookCoverProps) {
  const [failed, setFailed] = useState(false);

  if (!coverUrl || failed) {
    return (
      <div
        className={`${sizeClasses[size]} rounded bg-muted flex items-center justify-center flex-shrink-0`}
      >
        <BookOpen size={iconSizes[size]} className="text-muted-foreground/40" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={coverUrl}
      alt={`Cover of ${title}`}
      className={`${sizeClasses[size]} rounded object-cover flex-shrink-0`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
