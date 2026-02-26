import { GoogleGenAI } from "@google/genai";

export type RecommendationMode = "Sure Thing" | "Wildcard" | "Deep Dive";

export type LibraryBook = {
  title: string;
  author: string;
  rating?: number | null;
};

export type GeminiRecommendation = {
  title: string;
  author: string;
  blurb: string;
};

const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

function getClient(): GoogleGenAI {
  if (!apiKey) {
    throw new Error("Missing VITE_GEMINI_API_KEY. Add it to .env.local and restart the dev server.");
  }
  return new GoogleGenAI({ apiKey });
}

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

function extractFirstJsonObject(text: string): any {
  // Try to recover JSON even if model wraps it with text/code fences.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object.");
  }
  const slice = text.slice(start, end + 1);
  return JSON.parse(slice);
}

function assertValidRecommendation(obj: any): GeminiRecommendation {
  if (!obj || typeof obj !== "object") throw new Error("Invalid recommendation payload.");
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const author = typeof obj.author === "string" ? obj.author.trim() : "";
  const blurb = typeof obj.blurb === "string" ? obj.blurb.trim() : "";
  if (!title || !author || !blurb) throw new Error("Recommendation JSON missing required fields.");
  return { title, author, blurb };
}

const MODEL_CANDIDATES = ["gemini-2.5-flash"] as const;

async function generateTextWithFallback(prompt: string): Promise<string> {
  const ai = getClient();
  let lastErr: unknown;
  for (const model of MODEL_CANDIDATES) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      return res.text ?? "";
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gemini request failed.");
}

export async function generateGeminiRecommendation(opts: {
  mode: Exclude<RecommendationMode, "Deep Dive">;
  topRatedBooks: LibraryBook[];
  fullLibrary: LibraryBook[];
  rejectedTitles?: string[];
  extraContext?: string;
}): Promise<GeminiRecommendation> {
  const forbiddenTitles = buildForbiddenTitles(opts.fullLibrary, opts.rejectedTitles ?? []);
  const topRated = (opts.topRatedBooks || []).map((b) => ({
    title: b.title,
    author: b.author,
    rating: b.rating ?? null,
  }));

  const modeLabel = opts.mode === "Sure Thing" ? "The Sure Thing" : "The Wildcard";

  const prompt = [
    `You are a book recommendation engine.`,
    ``,
    `Task: ${modeLabel}`,
    ``,
    `Input: user's top-rated books (rating 8-10). Use them to infer taste, themes, pacing, emotional tone, and typical genres:`,
    JSON.stringify(topRated, null, 2),
    ``,
    `Hard constraints:`,
    `- Recommend EXACTLY ONE book.`,
    `- Do NOT recommend any book whose title (case-insensitive) is in this forbiddenTitles list:`,
    JSON.stringify(forbiddenTitles, null, 2),
    `- Return ONLY valid JSON with this exact shape: {"title": string, "author": string, "blurb": string}`,
    `- No markdown, no code fences, no extra keys.`,
    ``,
    opts.mode === "Sure Thing"
      ? `Sure Thing requirements: Pick the most predictive, high-confidence match based on dominant patterns.`
      : `Wildcard requirements: Preserve emotional resonance/pacing, but choose a clearly different genre than the user's usual patterns.`,
    opts.extraContext ? `` : "",
    opts.extraContext ? `Additional context from the user:\n${opts.extraContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Two attempts to ensure clean JSON
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await generateTextWithFallback(
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous output was invalid. Return ONLY the JSON object.`
    );
    try {
      const obj = extractFirstJsonObject(text);
      const rec = assertValidRecommendation(obj);
      if (forbiddenTitles.includes(normalizeTitle(rec.title))) {
        throw new Error("Model recommended a forbidden title.");
      }
      return rec;
    } catch (e) {
      if (attempt === 1) throw e instanceof Error ? e : new Error("Failed to parse Gemini JSON.");
    }
  }
  throw new Error("Failed to generate recommendation.");
}

export async function generateDeepDiveQuestion(opts: {
  topRatedBooks: LibraryBook[];
  fullLibrary: LibraryBook[];
}): Promise<string> {
  const forbiddenTitles = buildForbiddenTitles(opts.fullLibrary);
  const topRated = (opts.topRatedBooks || []).map((b) => ({ title: b.title, author: b.author, rating: b.rating ?? null }));

  const prompt = [
    `You are a book recommender running a "Deep Dive" flow.`,
    `You will ask the user ONE clarifying question about their current mood (only one question).`,
    `Base your question on their taste inferred from these top-rated books:`,
    JSON.stringify(topRated, null, 2),
    ``,
    `Constraints:`,
    `- Ask exactly ONE question.`,
    `- Keep it short (<= 25 words).`,
    `- Do not recommend a book yet.`,
    `- Do not mention the forbidden titles list, but do consider it internally:`,
    JSON.stringify(forbiddenTitles, null, 2),
    ``,
    `Return only the question text, no quotes, no markdown.`,
  ].join("\n");

  const text = await generateTextWithFallback(prompt);
  return (text || "").trim().replace(/^"+|"+$/g, "");
}

export async function generateDeepDiveRecommendation(opts: {
  topRatedBooks: LibraryBook[];
  fullLibrary: LibraryBook[];
  rejectedTitles?: string[];
  moodAnswer: string;
}): Promise<GeminiRecommendation> {
  const forbiddenTitles = buildForbiddenTitles(opts.fullLibrary, opts.rejectedTitles ?? []);
  const topRated = (opts.topRatedBooks || []).map((b) => ({ title: b.title, author: b.author, rating: b.rating ?? null }));

  const prompt = [
    `You are a book recommendation engine.`,
    ``,
    `Task: The Deep Dive`,
    ``,
    `User's top-rated books:`,
    JSON.stringify(topRated, null, 2),
    ``,
    `User's mood answer:`,
    opts.moodAnswer,
    ``,
    `Hard constraints:`,
    `- Recommend EXACTLY ONE book.`,
    `- Do NOT recommend any book whose title (case-insensitive) is in forbiddenTitles:`,
    JSON.stringify(forbiddenTitles, null, 2),
    `- Return ONLY valid JSON with this exact shape: {"title": string, "author": string, "blurb": string}`,
    `- No markdown, no code fences, no extra keys.`,
  ].join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await generateTextWithFallback(
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous output was invalid. Return ONLY the JSON object.`
    );
    try {
      const obj = extractFirstJsonObject(text);
      const rec = assertValidRecommendation(obj);
      if (forbiddenTitles.includes(normalizeTitle(rec.title))) {
        throw new Error("Model recommended a forbidden title.");
      }
      return rec;
    } catch (e) {
      if (attempt === 1) throw e instanceof Error ? e : new Error("Failed to parse Gemini JSON.");
    }
  }
  throw new Error("Failed to generate Deep Dive recommendation.");
}

