import { useState, useEffect } from "react";

const coverCache = new Map<string, string | null>();

export function useBookCover(title: string, author: string): string | null {
  const key = `${title}::${author}`;
  const [coverUrl, setCoverUrl] = useState<string | null>(coverCache.get(key) ?? null);

  useEffect(() => {
    if (coverCache.has(key)) {
      setCoverUrl(coverCache.get(key) ?? null);
      return;
    }

    let cancelled = false;
    const query = encodeURIComponent(`${title} ${author}`);
    fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const thumbnail =
          data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail?.replace("http://", "https://") || null;
        coverCache.set(key, thumbnail);
        setCoverUrl(thumbnail);
      })
      .catch(() => {
        coverCache.set(key, null);
      });

    return () => { cancelled = true; };
  }, [key, title, author]);

  return coverUrl;
}

// Batch version for lists - fetches covers for multiple books
export function useBookCovers(books: { title: string; author: string }[]): Map<string, string | null> {
  const [covers, setCovers] = useState<Map<string, string | null>>(new Map());

  useEffect(() => {
    if (books.length === 0) return;

    const toFetch = books.filter((b) => !coverCache.has(`${b.title}::${b.author}`));
    
    // Set cached ones immediately
    const initial = new Map<string, string | null>();
    books.forEach((b) => {
      const key = `${b.title}::${b.author}`;
      if (coverCache.has(key)) initial.set(key, coverCache.get(key)!);
    });
    if (initial.size > 0) setCovers(new Map(initial));

    if (toFetch.length === 0) return;

    let cancelled = false;

    // Fetch in small batches to avoid rate limits
    const fetchCovers = async () => {
      const results = new Map(initial);
      for (const book of toFetch) {
        if (cancelled) break;
        const key = `${book.title}::${book.author}`;
        try {
          const query = encodeURIComponent(`${book.title} ${book.author}`);
          const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`);
          const data = await res.json();
          const thumbnail =
            data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail?.replace("http://", "https://") || null;
          coverCache.set(key, thumbnail);
          results.set(key, thumbnail);
          if (!cancelled) setCovers(new Map(results));
        } catch {
          coverCache.set(key, null);
          results.set(key, null);
        }
      }
    };

    fetchCovers();
    return () => { cancelled = true; };
  }, [books.map((b) => `${b.title}::${b.author}`).join("|")]);

  return covers;
}
