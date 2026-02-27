import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { parseGoodreadsCsv, ParsedBook } from "@/lib/csvParser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload, Search, Star } from "lucide-react";
import { useBookCovers } from "@/hooks/useBookCover";
import BookCard from "@/components/BookCard";
import BookDetailModal from "@/components/BookDetailModal";

interface Book {
  id: string;
  title: string;
  author: string;
  rating: number;
}

interface GoogleBookResult {
  id: string;
  title: string;
  authors: string[];
  description?: string;
  coverUrl?: string;
}

type SortKey = "added" | "rating-desc" | "rating-asc" | "alpha";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "added", label: "Recently added" },
  { key: "rating-desc", label: "Highest rated" },
  { key: "rating-asc", label: "Lowest rated" },
  { key: "alpha", label: "A–Z" },
];

interface SelectedBook {
  id: string;
  title: string;
  author: string;
  rating: number;
  coverUrl: string | null;
}

export default function Library() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("added");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GoogleBookResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [ratingTarget, setRatingTarget] = useState<GoogleBookResult | null>(null);
  const [selectedRating, setSelectedRating] = useState(7);
  const searchRef = useRef<HTMLDivElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // ── Detail modal state ─────────────────────────────────────────────────────
  const [selectedBook, setSelectedBook] = useState<SelectedBook | null>(null);
  const [selectedBookDesc, setSelectedBookDesc] = useState<string | null>(null);
  const [loadingDesc, setLoadingDesc] = useState(false);

  // Fetch description from Google Books when a book is selected
  useEffect(() => {
    if (!selectedBook) return;

    setSelectedBookDesc(null);
    setLoadingDesc(true);

    const controller = new AbortController();
    const query = encodeURIComponent(`${selectedBook.title} ${selectedBook.author}`);

    fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1&key=${import.meta.env.VITE_GOOGLE_BOOKS_API_KEY}`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((data) => {
        setSelectedBookDesc(data.items?.[0]?.volumeInfo?.description ?? null);
        setLoadingDesc(false);
      })
      .catch(() => {
        // AbortError is expected on modal close — silently ignore
        setLoadingDesc(false);
      });

    return () => controller.abort();
  }, [selectedBook?.id]); // re-run only when a different book is selected

  // ── Covers ─────────────────────────────────────────────────────────────────
  const coverInputs = useMemo(
    () => books.map((b) => ({ title: b.title, author: b.author })),
    [books]
  );
  const covers = useBookCovers(coverInputs);

  // ── Sorting ────────────────────────────────────────────────────────────────
  const sortedBooks = useMemo(() => {
    const arr = [...books];
    switch (sortBy) {
      case "rating-desc":
        return arr.sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title));
      case "rating-asc":
        return arr.sort((a, b) => a.rating - b.rating || a.title.localeCompare(b.title));
      case "alpha":
        return arr.sort((a, b) => a.title.localeCompare(b.title));
      default:
        return arr;
    }
  }, [books, sortBy]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchBooks = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("library")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setBooks(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced live search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
            searchQuery
          )}&maxResults=6&key=${import.meta.env.VITE_GOOGLE_BOOKS_API_KEY}`
        );
        const data = await res.json();
        setSearchResults(
          (data.items || []).map((item: any) => ({
            id: item.id,
            title: item.volumeInfo.title || "Untitled",
            authors: item.volumeInfo.authors || ["Unknown"],
            description: item.volumeInfo.description,
            coverUrl: item.volumeInfo.imageLinks?.thumbnail?.replace("http://", "https://"),
          }))
        );
        setShowResults(true);
      } catch {
        toast({ title: "Search failed", variant: "destructive" });
      }
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── CSV import ─────────────────────────────────────────────────────────────
  const handleCsvUpload = async (file: File) => {
    if (!user) return;
    try {
      const text = await file.text();
      const parsed = parseGoodreadsCsv(text);
      if (parsed.length === 0) {
        toast({ title: "No books found", description: "Check your CSV format.", variant: "destructive" });
        return;
      }

      const existingTitles = new Set(books.map((b) => b.title.trim().toLowerCase()));
      const rows = parsed.reduce<{ rows: any[]; duplicates: number }>(
        (acc, b: ParsedBook) => {
          const normalizedTitle = b.title.trim().toLowerCase();
          if (existingTitles.has(normalizedTitle)) {
            acc.duplicates += 1;
            return acc;
          }
          existingTitles.add(normalizedTitle);
          acc.rows.push({ user_id: user.id, title: b.title, author: b.author, rating: b.rating });
          return acc;
        },
        { rows: [], duplicates: 0 }
      );

      if (rows.rows.length === 0) {
        toast({
          title: "Already in library",
          description: "All books in this CSV are already in your library.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("library").insert(rows.rows);
      if (error) throw error;

      toast({
        title: "Imported!",
        description:
          rows.rows.length === parsed.length
            ? `${rows.rows.length} books added.`
            : `${rows.rows.length} books added. Duplicates were skipped.`,
      });
      fetchBooks();
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCsvUpload(file);
    e.target.value = "";
  };

  // ── Search result actions ──────────────────────────────────────────────────
  const openRatingModal = (book: GoogleBookResult) => {
    setRatingTarget(book);
    setSelectedRating(7);
    setShowResults(false);
    setSearchQuery("");
  };

  const addBook = async () => {
    if (!ratingTarget || !user) return;
    const normalizedTitle = ratingTarget.title.trim().toLowerCase();
    const isDuplicate = books.some((b) => b.title.trim().toLowerCase() === normalizedTitle);
    if (isDuplicate) {
      toast({ title: "Already in your library.", variant: "destructive" });
      setRatingTarget(null);
      return;
    }
    const { error } = await supabase.from("library").insert({
      user_id: user.id,
      title: ratingTarget.title,
      author: ratingTarget.authors.join(", "),
      rating: selectedRating,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Added to your library!", description: ratingTarget.title });
      setRatingTarget(null);
      fetchBooks();
    }
  };

  const deleteBook = async (id: string) => {
    await supabase.from("library").delete().eq("id", id);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  };

  // ── Book card click → open detail modal ───────────────────────────────────
  const handleBookClick = (book: Book) => {
    setSelectedBook({
      id: book.id,
      title: book.title,
      author: book.author,
      rating: book.rating,
      coverUrl: covers.get(`${book.title}::${book.author}`) ?? null,
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-fade-in">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl sm:text-4xl font-display font-medium text-foreground">My Library</h2>
          <p className="mt-1.5 text-sm text-muted-foreground font-display italic">
            {books.length > 0
              ? `${books.length} book${books.length !== 1 ? "s" : ""} in your collection.`
              : "Your personal collection of reads."}
          </p>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-9 text-sm font-medium"
            onClick={() => csvInputRef.current?.click()}
          >
            <Upload size={13} strokeWidth={2} />
            <span className="hidden sm:inline">Upload Goodreads CSV</span>
            <span className="sm:hidden">Import CSV</span>
          </Button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      </div>

      {/* Search + sort */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

        <div ref={searchRef} className="relative w-full sm:max-w-xs">
          <div className="relative">
            <Search
              size={13}
              strokeWidth={2}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              placeholder="Search to add a book..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 bg-card text-sm border-border/60
                         focus-visible:ring-1 focus-visible:ring-primary/40"
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-[1.5px]
                              border-primary border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-card border border-border
                            rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.10)] overflow-hidden">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => openRatingModal(result)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60
                             transition-colors text-left"
                >
                  {result.coverUrl ? (
                    <img src={result.coverUrl} alt="" className="w-8 h-11 object-cover rounded flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-11 bg-muted rounded flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{result.authors.join(", ")}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {books.length > 0 && (
          <div className="flex items-center gap-0.5 bg-muted/60 rounded-full p-0.5 flex-shrink-0 overflow-x-auto scrollbar-none">
            {SORT_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150
                  whitespace-nowrap
                  ${sortBy === key
                    ? "bg-[#f5e3b8] text-[#7a5a0e] shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Rating dialog */}
      <Dialog open={!!ratingTarget} onOpenChange={(open) => !open && setRatingTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="font-display font-medium text-lg">Rate this book</DialogTitle>
          </DialogHeader>
          {ratingTarget && (
            <div className="space-y-6">
              <div className="flex gap-4">
                {ratingTarget.coverUrl ? (
                  <img src={ratingTarget.coverUrl} alt="" className="w-14 h-20 object-cover rounded shadow-sm flex-shrink-0" />
                ) : (
                  <div className="w-14 h-20 bg-muted rounded flex-shrink-0" />
                )}
                <div className="min-w-0 pt-0.5">
                  <h3 className="font-display font-medium text-foreground leading-snug">{ratingTarget.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{ratingTarget.authors.join(", ")}</p>
                  {ratingTarget.description && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-3 leading-relaxed">
                      {ratingTarget.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Your rating</span>
                  <span className="text-sm font-semibold text-primary flex items-center gap-1">
                    <Star size={12} className="fill-primary" />
                    {selectedRating} / 10
                  </span>
                </div>
                <div className="grid grid-cols-10 gap-1">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      onClick={() => setSelectedRating(n)}
                      className={`h-9 rounded text-xs font-semibold transition-all duration-100
                        ${n === selectedRating
                          ? "bg-primary text-primary-foreground shadow-sm scale-105"
                          : n < selectedRating
                          ? "bg-primary/15 text-primary/80"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={addBook} className="w-full h-10 font-medium">
                Add to Library
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Book grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2.5">
              <div className="aspect-[2/3] skeleton rounded" />
              <div className="space-y-1.5">
                <div className="h-2.5 skeleton rounded w-4/5" />
                <div className="h-2 skeleton rounded w-3/5" />
                <div className="h-2 skeleton rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : books.length === 0 ? (
        <div className="text-center py-28">
          <p className="font-display italic text-xl text-muted-foreground/50 mb-2">Your shelves are empty.</p>
          <p className="text-sm text-muted-foreground">
            Search for a book above or upload a Goodreads CSV to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-7">
          {sortedBooks.map((book) => (
            <BookCard
              key={book.id}
              id={book.id}
              title={book.title}
              author={book.author}
              rating={book.rating}
              coverUrl={covers.get(`${book.title}::${book.author}`) ?? null}
              onDelete={deleteBook}
              onClick={() => handleBookClick(book)}
            />
          ))}
        </div>
      )}

      {/* Book detail modal */}
      <BookDetailModal
        isOpen={!!selectedBook}
        onClose={() => setSelectedBook(null)}
        title={selectedBook?.title ?? ""}
        author={selectedBook?.author ?? ""}
        rating={selectedBook?.rating}
        description={selectedBookDesc}
        loadingDescription={loadingDesc}
      />

    </div>
  );
}
