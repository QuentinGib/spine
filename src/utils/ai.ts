import Groq from "groq-sdk";

export type RecommendationMode = "Sure Thing" | "Wildcard" | "Deep Dive";

export type LibraryBook = {
  title: string;
  author: string;
  rating?: number | null;
};

export type AIRecommendation = {
  title: string;
  author: string;
  blurb: string;
};

const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;

if (!apiKey) {
  console.error("Missing VITE_GROQ_API_KEY. Add it to .env.local and restart the dev server.");
}

const groq = new Groq({
  apiKey: apiKey || "dummy-key",
  dangerouslyAllowBrowser: true, 
});

function normalizeTitle(title: string): string {
  return (title || "").trim().toLowerCase();
}

function buildForbiddenTitles(library: LibraryBook[], extraForbiddenTitles: string[] = []): string[] {
  const out = new Set<string>();
  for (const b of library) {
    const t = normalizeTitle(b.title);
    if (t) out.add(t);
  }
  for (const t of extraForbiddenTitles) {
    const nt = normalizeTitle(t);
    if (nt) out.add(nt);
  }
  return Array.from(out);
}

export async function generateRecommendation(opts: {
  mode: Exclude<RecommendationMode, "Deep Dive">;
  topRatedBooks: LibraryBook[];
  fullLibrary: LibraryBook[];
  rejectedTitles?: string[];
  extraContext?: string;
}): Promise<AIRecommendation> {
  // Truncate to save tokens and maximize speed
  const forbiddenTitles = buildForbiddenTitles(opts.fullLibrary, opts.rejectedTitles ?? []).slice(0, 300);
  const topRated = (opts.topRatedBooks || []).slice(0, 30).map((b) => ({
    title: b.title,
    author: b.author,
  }));

  const modeLabel = opts.mode === "Sure Thing" ? "The Sure Thing" : "The Wildcard";

  const systemPrompt = `You are an expert book recommendation engine. 
Task: ${modeLabel}. 
You must output ONLY valid JSON in this exact format: {"title": "Book Title", "author": "Author Name", "blurb": "A compelling 2-sentence pitch."}`;

  const userPrompt = `Input: user's top-rated books (inferred taste):
${JSON.stringify(topRated)}

Hard constraints:
- Recommend EXACTLY ONE book.
- Do NOT recommend any book whose title (case-insensitive) is in this forbidden list: ${JSON.stringify(forbiddenTitles)}
- ${opts.mode === "Sure Thing" ? "Pick the most predictive, high-confidence match." : "Preserve emotional resonance/pacing, but choose a completely different genre."}
${opts.extraContext ? `Additional context: ${opts.extraContext}` : ""}`;

  const response = await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" },
    temperature: opts.mode === "Sure Thing" ? 0.3 : 0.8,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from Groq.");
  
  return JSON.parse(content) as AIRecommendation;
}

export async function generateDeepDiveQuestion(opts: {
  topRatedBooks: LibraryBook[];
  fullLibrary: LibraryBook[];
}): Promise<string> {
  const topRated = (opts.topRatedBooks || []).slice(0, 30).map((b) => ({ title: b.title, author: b.author }));

  const response = await groq.chat.completions.create({
    messages: [
      { role: "system", content: 'You are a book recommender running a "Deep Dive" flow. Ask exactly ONE short clarifying question (<= 25 words) about the user\'s current mood based on their taste. Do not recommend a book yet. Return only the question text.' },
      { role: "user", content: `Top rated books: ${JSON.stringify(topRated)}` }
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.7,
  });

  return (response.choices[0]?.message?.content || "").trim().replace(/^"+|"+$/g, "");
}

export async function generateDeepDiveRecommendation(opts: {
  topRatedBooks: LibraryBook[];
  fullLibrary: LibraryBook[];
  rejectedTitles?: string[];
  moodAnswer: string;
}): Promise<AIRecommendation> {
  const forbiddenTitles = buildForbiddenTitles(opts.fullLibrary, opts.rejectedTitles ?? []).slice(0, 300);
  const topRated = (opts.topRatedBooks || []).slice(0, 30).map((b) => ({ title: b.title, author: b.author }));

  const response = await groq.chat.completions.create({
    messages: [
      { role: "system", content: 'You are an expert book recommendation engine. You must output ONLY valid JSON in this exact format: {"title": "Book Title", "author": "Author Name", "blurb": "A compelling 2-sentence pitch."}' },
      { role: "user", content: `Task: The Deep Dive.
User's top-rated books: ${JSON.stringify(topRated)}
User's mood answer: "${opts.moodAnswer}"
Hard constraints:
- Recommend EXACTLY ONE book perfectly suited to their mood.
- Do NOT recommend any book in this forbidden list: ${JSON.stringify(forbiddenTitles)}` }
    ],
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" },
    temperature: 0.5,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from Groq.");
  
  return JSON.parse(content) as AIRecommendation;
}