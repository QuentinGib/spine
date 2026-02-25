import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { parseGoodreadsCsv, ParsedBook } from "@/lib/csvParser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, Search, Minus, Star, Plus } from "lucide-react";
import { useBookCovers } from "@/hooks/useBookCover";
import BookCover from "@/components/BookCover";

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
}

export default function Library() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GoogleBookResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingRating, setAddingRating] = useState<{ book: GoogleBookResult; rating: number } | null>(null);

  const covers = useBookCovers(books.map((b) => ({ title: b.title, author: b.author })));

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

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const handleCsvUpload = async (file: File) => {
    if (!user) return;
    try {
      const text = await file.text();
      const parsed = parseGoodreadsCsv(text);
      if (parsed.length === 0) {
        toast({ title: "No books found", description: "Check your CSV format.", variant: "destructive" });
        return;
      }

      const rows = parsed.map((b: ParsedBook) => ({
        user_id: user.id,
        title: b.title,
        author: b.author,
        rating: b.rating,
      }));

      const { error } = await supabase.from("library").insert(rows);
      if (error) throw error;

      toast({ title: "Imported!", description: `${parsed.length} books added.` });
      fetchBooks();
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) handleCsvUpload(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCsvUpload(file);
  };

  const searchGoogleBooks = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchQuery)}&maxResults=5`
      );
      const data = await res.json();
      setSearchResults(
        (data.items || []).map((item: any) => ({
          id: item.id,
          title: item.volumeInfo.title || "Untitled",
          authors: item.volumeInfo.authors || ["Unknown"],
        }))
      );
    } catch {
      toast({ title: "Search failed", variant: "destructive" });
    }
    setSearching(false);
  };

  const addBook = async (book: GoogleBookResult, rating: number) => {
    if (!user) return;
    const { error } = await supabase.from("library").insert({
      user_id: user.id,
      title: book.title,
      author: book.authors.join(", "),
      rating,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Added!", description: `${book.title} added to your library.` });
      setAddingRating(null);
      setSearchResults([]);
      setSearchQuery("");
      fetchBooks();
    }
  };

  const deleteBook = async (id: string) => {
    await supabase.from("library").delete().eq("id", id);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-3xl font-semibold font-display text-foreground">My Library</h2>
        <p className="mt-1 text-muted-foreground">Your personal collection of reads.</p>
      </div>

      {/* CSV Upload */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
        }`}
      >
        <Upload className="mx-auto mb-3 text-muted-foreground" size={28} />
        <p className="text-sm text-muted-foreground">
          Drag & drop a Goodreads CSV, or{" "}
          <label className="text-primary cursor-pointer hover:underline">
            browse
            <input type="file" accept=".csv" onChange={handleFileInput} className="hidden" />
          </label>
        </p>
      </div>

      {/* Search */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Search for a book..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchGoogleBooks()}
            className="h-11 bg-card"
          />
          <Button onClick={searchGoogleBooks} disabled={searching} variant="outline" className="h-11 px-4">
            <Search size={16} />
          </Button>
        </div>

        {searchResults.length > 0 && (
          <div className="bg-card border border-border rounded-lg divide-y divide-border">
            {searchResults.map((result) => (
              <div key={result.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{result.title}</p>
                  <p className="text-xs text-muted-foreground">{result.authors.join(", ")}</p>
                </div>
                {addingRating?.book.id === result.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={addingRating.rating}
                      onChange={(e) =>
                        setAddingRating({ ...addingRating, rating: Math.min(10, Math.max(1, parseInt(e.target.value) || 1)) })
                      }
                      className="w-16 h-8 text-center text-sm"
                    />
                    <span className="text-xs text-muted-foreground">/10</span>
                    <Button size="sm" onClick={() => addBook(result, addingRating.rating)} className="h-8">
                      Add
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingRating({ book: result, rating: 7 })}
                    className="text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Book List */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : books.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">Your library is empty. Add some books to get started!</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {books.map((book) => (
            <div key={book.id} className="flex items-center gap-3 px-4 py-3 group">
              <BookCover
                coverUrl={covers.get(`${book.title}::${book.author}`) ?? null}
                title={book.title}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{book.title}</p>
                <p className="text-xs text-muted-foreground">{book.author}</p>
              </div>
              <div className="flex items-center gap-3 ml-4">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Star size={12} className="text-primary fill-primary" />
                  {book.rating}
                </span>
                <button
                  onClick={() => deleteBook(book.id)}
                  className="text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove"
                >
                  <Minus size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
