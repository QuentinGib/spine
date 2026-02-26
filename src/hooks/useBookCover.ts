import { useState, useEffect } from "react";

const coverCache = new Map<string, string | null>();

// ─── Single cover ─────────────────────────────────────────────────────────────

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
    fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1&key=${import.meta.env.VITE_GOOGLE_BOOKS_API_KEY}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const thumbnail =
          data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail?.replace("http://", "https://") ?? null;
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

// ─── Batch covers ─────────────────────────────────────────────────────────────

const CHUNK_SIZE = 8; // concurrent requests per batch

async function fetchCover(title: string, author: string): Promise<{ key: string; url: string | null }> {
  const key = `${title}::${author}`;
  const query = encodeURIComponent(`${title} ${author}`);
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1&key=${import.meta.env.VITE_GOOGLE_BOOKS_API_KEY}`
  );
  const data = await res.json();
  const url = data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail?.replace("http://", "https://") ?? null;
  return { key, url };
}

export function useBookCovers(books: { title: string; author: string }[]): Map<string, string | null> {
  const [covers, setCovers] = useState<Map<string, string | null>>(new Map());

  // Stable string key — only re-runs when the book list actually changes
  const depKey = books.map((b) => `${b.title}::${b.author}`).join("|");

  useEffect(() => {
    if (books.length === 0) return;

    // Pre-populate from cache immediately
    const fromCache = new Map<string, string | null>();
    books.forEach((b) => {
      const k = `${b.title}::${b.author}`;
      if (coverCache.has(k)) fromCache.set(k, coverCache.get(k) ?? null);
    });
    if (fromCache.size > 0) setCovers(new Map(fromCache));

    const toFetch = books.filter((b) => !coverCache.has(`${b.title}::${b.author}`));
    if (toFetch.length === 0) return;

    let cancelled = false;

    const fetchAll = async () => {
      const accumulated = new Map(fromCache);

      // Process in parallel chunks to avoid rate limits
      for (let i = 0; i < toFetch.length; i += CHUNK_SIZE) {
        if (cancelled) break;
        const chunk = toFetch.slice(i, i + CHUNK_SIZE);

        const results = await Promise.allSettled(
          chunk.map((book) => fetchCover(book.title, book.author))
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            const { key, url } = result.value;
            coverCache.set(key, url);
            accumulated.set(key, url);
          }
          // On rejection, leave uncached — will retry on next mount
        }

        if (!cancelled) setCovers(new Map(accumulated));
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [depKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return covers;
}
