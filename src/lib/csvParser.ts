export interface ParsedBook {
  title: string;
  author: string;
  rating: number;
}

export function parseGoodreadsCsv(csvText: string): ParsedBook[] {
  const lines = csvText.split("\n");
  if (lines.length < 2) return [];

  // Parse header to find column indices
  const header = parseCSVLine(lines[0]);
  const titleIdx = header.findIndex((h) => h.toLowerCase().trim() === "title");
  const authorIdx = header.findIndex((h) => h.toLowerCase().trim() === "author");
  const ratingIdx = header.findIndex((h) => h.toLowerCase().trim() === "my rating");

  if (titleIdx === -1 || authorIdx === -1 || ratingIdx === -1) {
    throw new Error("CSV must have Title, Author, and My Rating columns");
  }

  const books: ParsedBook[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const title = cols[titleIdx]?.trim();
    const author = cols[authorIdx]?.trim();
    const rawRating = parseFloat(cols[ratingIdx]?.trim());

    if (title && author && rawRating > 0) {
      books.push({
        title,
        author,
        rating: Math.min(10, Math.round(rawRating * 2)),
      });
    }
  }

  return books;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
