import { useState } from "react";
import { BookOpen } from "lucide-react";

interface BookCoverProps {
  coverUrl: string | null;
  title: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "w-10 h-14",
  md: "w-16 h-24",
  lg: "w-32 h-48",
};

export default function BookCover({ coverUrl, title, size = "sm" }: BookCoverProps) {
  const [failed, setFailed] = useState(false);

  if (!coverUrl || failed) {
    return (
      <div
        className={`${sizeClasses[size]} rounded bg-muted flex items-center justify-center flex-shrink-0`}
      >
        <BookOpen size={size === "lg" ? 28 : size === "md" ? 18 : 14} className="text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <img
      src={coverUrl}
      alt={`Cover of ${title}`}
      className={`${sizeClasses[size]} rounded object-cover flex-shrink-0 shadow-sm`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
