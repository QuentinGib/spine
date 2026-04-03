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

export type DeepDiveStep =
  | { action: "ask"; question: string; options: [string, string] }
  | { action: "recommend" };

const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;

if (import.meta.env.DEV && !apiKey) {
  console.warn("[Spine] VITE_GROQ_API_KEY is not set. Add it to your .env file.");
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

// ─── Shared helper ────────────────────────────────────────────────────────────

/** Call Groq and return the first valid AIRecommendation from a batch of 3–5,
 *  retrying up to maxAttempts only if every candidate in the batch is forbidden. */
async function callWithRetry(
  systemPrompt: string,
  userPrompt: string,
  baseTemperature: number,
  forbiddenTitles: string[],
  maxAttempts = 3
): Promise<AIRecommendation> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Escalate temperature slightly on retries to diversify output
    const temperature = Math.min(baseTemperature + attempt * 0.15, 1.0);

    // On retry, tell the model its entire previous batch was forbidden
    const prompt =
      attempt === 0
        ? userPrompt
        : `${userPrompt}\n\n⚠️ RETRY ${attempt}: Every book in your previous batch was already in the reader's library or rejection list. Generate an entirely different set of books that do NOT appear in the forbidden list above.`;

    const response = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      temperature,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from Groq.");

    const batch = JSON.parse(content) as { recommendations: AIRecommendation[] };
    const candidates = Array.isArray(batch.recommendations) ? batch.recommendations : [];

    // Return the first candidate whose title is not in the forbidden list
    for (const rec of candidates) {
      if (rec.title && !forbiddenTitles.includes(normalizeTitle(rec.title))) {
        return rec;
      }
    }
    // All candidates were forbidden — retry with a higher temperature
  }

  throw new Error("Unable to find a recommendation outside your existing library. Please try again.");
}

// ─── Sure Thing & Wildcard ────────────────────────────────────────────────────

export async function generateRecommendation(opts: {
  mode: Exclude<RecommendationMode, "Deep Dive">;
  topRatedBooks: LibraryBook[];
  fullLibrary: LibraryBook[];
  rejectedTitles?: string[];
  extraContext?: string;
}): Promise<AIRecommendation> {
  const forbiddenTitles = buildForbiddenTitles(opts.fullLibrary, opts.rejectedTitles ?? []).slice(0, 300);
  const topRated = (opts.topRatedBooks || []).slice(0, 30).map((b) => ({
    title: b.title,
    author: b.author,
  }));

  const isSureThing = opts.mode === "Sure Thing";

  const systemPrompt = isSureThing
    ? `You are a literary sommelier — a connoisseur who reads the contours of a reader's taste to identify the one book they were born to read next.

Your task: "The Sure Thing" — the highest-confidence recommendation possible, based on a holistic analysis of their entire reading history.

Method:
1. Study the reader's FULL library of rated books as a complete ecosystem.
   - Analyze their HIGHEST-rated books to identify their core loves: patterns in prose style, narrative structure, thematic depth, emotional register, and moral complexity.
   - Crucially, analyze their LOWEST-rated books to identify their aversions and dealbreakers: what specific tropes, pacing flaws, or stylistic choices actively ruin a book for them?
2. Synthesize a precise, bounded taste profile that defines both what they deeply crave and what they actively reject.
3. Identify the single book that most naturally and inevitably fits inside these boundaries. This is not just a safe genre-match, but a meticulously chosen book that maximizes their loves while strictly avoiding their known dislikes.

Output ONLY a raw, valid JSON object following this EXACT structure, ensuring all strings are properly closed with quotes:
{
  "recommendations": [
    {"title": "Exact Book Title", "author": "Full Author Name", "blurb": "Exactly 2 sentences fulfilling the prompt requirements."},
    {"title": "Exact Book Title", "author": "Full Author Name", "blurb": "Exactly 2 sentences fulfilling the prompt requirements."},
    {"title": "Exact Book Title", "author": "Full Author Name", "blurb": "Exactly 2 sentences fulfilling the prompt requirements."}
  ]
}

Do not add markdown formatting or conversational text.

Only recommend real, published books. The blurb must feel tailored, not generic.`
    : `You are a curator of unexpected literary experiences — a specialist in emotional translation across genres.

Your task: "The Wildcard" — a book that delivers the reader's core emotional experience through an entirely unexpected vessel.

Method:
1. Identify the reader's "emotional fingerprint": the core feeling their highest-rated books consistently deliver beneath the surface of genre. This might be: the vertigo of moral ambiguity, the ache of quiet longing, the propulsive thrill of unraveling secrets, the warmth of found family, the unsettling beauty of unreliable reality.
2. Study their lowest-rated books to identify clear aversions — tropes, tones, or structures they actively disliked — and ensure the recommendation avoids all of them.
3. Identify their dominant genre(s).
4. Choose a book from a COMPLETELY different genre — ideally one the reader would never select themselves — that delivers that exact emotional fingerprint with equal intensity.

The surprise should feel like a revelation: "I would never have picked this, but it gave me exactly what I didn't know I was looking for."

Output ONLY a raw, valid JSON object following this EXACT structure, ensuring all strings are properly closed with quotes:
{
  "recommendations": [
    {"title": "Exact Book Title", "author": "Full Author Name", "blurb": "Exactly 2 sentences fulfilling the prompt requirements."},
    {"title": "Exact Book Title", "author": "Full Author Name", "blurb": "Exactly 2 sentences fulfilling the prompt requirements."},
    {"title": "Exact Book Title", "author": "Full Author Name", "blurb": "Exactly 2 sentences fulfilling the prompt requirements."}
  ]
}

Do not add markdown formatting or conversational text.

Only recommend real, published books. The genre shift must be genuine and significant — not a minor variation.`;

// Get all rated books
  const allRated = (opts.fullLibrary || []).filter((b) => b.rating != null);

  // Sort from lowest to highest rating
  const sortedByRating = [...allRated].sort((a, b) => (a.rating || 0) - (b.rating || 0));

  // Always send the 10 lowest-rated + 40 highest-rated books (with overlap protection for small libraries)
  const bottom10 = sortedByRating.slice(0, 10);
  const top40 = sortedByRating.slice(-40);
  const bottom10Ids = new Set(bottom10.map((b) => b.title));
  const extremeBooks = [...bottom10, ...top40.filter((b) => !bottom10Ids.has(b.title))];

  const ratedLibrary = extremeBooks.map((b) => ({
    title: b.title,
    author: b.author,
    rating: b.rating,
  }));

  // Bottom 5 books for Wildcard aversion signal
  const wildcardLowRated = sortedByRating.slice(0, 5).map((b) => ({
    title: b.title,
    author: b.author,
    rating: b.rating,
  }));

  const userPrompt = isSureThing
    ? `Reader's rated library — 10 lowest-rated books followed by up to 40 highest-rated books (all include ratings):
${JSON.stringify(ratedLibrary)}

Do NOT recommend any book whose title (case-insensitive) appears in this list:
${JSON.stringify(forbiddenTitles)}
${opts.extraContext ? `\nAdditional context: ${opts.extraContext}` : ""}

Recommend 3 to 5 books, sorted by confidence (best match first).`
    : `Reader's top-rated books (8+/10) — emotional fingerprint source:
${JSON.stringify(topRated)}

Reader's lowest-rated books — aversions to avoid:
${JSON.stringify(wildcardLowRated)}

Do NOT recommend any book whose title (case-insensitive) appears in this list:
${JSON.stringify(forbiddenTitles)}
${opts.extraContext ? `\nAdditional context: ${opts.extraContext}` : ""}

Recommend 3 to 5 books, sorted by confidence (best match first).`;

  return callWithRetry(systemPrompt, userPrompt, isSureThing ? 0.3 : 0.85, forbiddenTitles);
}

// ─── Deep Dive: Multi-turn mood diagnosis ─────────────────────────────────────

export async function generateDeepDiveNextStep(opts: {
  topRatedBooks: LibraryBook[];
  fullLibrary: LibraryBook[];
  conversationHistory: { role: "assistant" | "user"; content: string }[];
}): Promise<DeepDiveStep> {
  const topRated = (opts.topRatedBooks || []).slice(0, 20).map((b) => ({
    title: b.title,
    author: b.author,
  }));
  const lowRated = (opts.fullLibrary || [])
    .filter((b) => b.rating != null)
    .sort((a, b) => (a.rating || 0) - (b.rating || 0))
    .slice(0, 5)
    .map((b) => ({ title: b.title, author: b.author, rating: b.rating }));

  // Count only binary answers — the seed (index 0, role "user") is the initial prompt, not an answer
  const binaryAnswerCount = Math.max(
    0,
    opts.conversationHistory.filter((m) => m.role === "user").length - 1
  );

  // Hard cap — also enforced client-side
  if (binaryAnswerCount >= 5) {
    return { action: "recommend" };
  }

  const systemPrompt = `You are conducting a "Deep Dive" literary mood interview.

A reader has described what they're in the mood for. Your mission: ask sharp, precisely tailored binary-choice questions that sculpt the recommendation space down to a single perfect book.

HOW TO GENERATE QUESTIONS
Read the reader's initial description carefully. Identify the specific emotions, experiences, or desires they expressed. Every question must directly probe a meaningful axis of tension within WHAT THEY SAID — not a generic library dimension.

Think like a diagnostician: each question should eliminate half the remaining possibility space.

Good examples of TAILORED questions (notice they emerge from the reader's actual words):
  Reader said "dark and twisty" → "Psychological unravelling from within, or a labyrinthine external plot?"
  Reader said "need to escape" → "A fully invented world, or a real place made strange and new?"
  Reader said "feel hopeful again" → "Quiet everyday resilience, or a triumphant against-all-odds arc?"
  Reader said "can't stop reading" → "Propulsive plot twists, or compulsive character obsession?"
  Reader said "something literary" → "Dense and demanding prose you have to work for, or elegant and lucid?"

BAD examples (generic, not derived from the reader's words — AVOID THESE):
  "Slow-burn immersion or fast-paced momentum?" ← too generic
  "A world to disappear into or a mirror held up to your own life?" ← not derived from what they said

RULES
- The reader has answered ${binaryAnswerCount} binary question(s) so far.
- You MUST ask at least 3 questions before recommending.
- After ${binaryAnswerCount >= 4 ? "reaching the limit" : "5 binary answers"}, you MUST output {"action": "recommend"}.
- Never probe a dimension already explored in this conversation.
- Keep option labels concise: 3–7 words each.
- Output ONLY a raw, valid JSON object starting with { and ending with }. Do NOT wrap the response in markdown code blocks (\`\`\`json). Do NOT add any conversational text.
  {"action": "ask", "question": "...", "options": ["Option A", "Option B"]}
  or {"action": "recommend"}`;

  // Format history so the model sees exactly what has already been explored
  const historyText =
    opts.conversationHistory.length === 0
      ? "(none)"
      : opts.conversationHistory
          .map((m, i) => {
            if (i === 0 && m.role === "user") return `Reader's initial mood: "${m.content}"`;
            return m.role === "assistant"
              ? `You asked: "${m.content}"`
              : `Reader chose: "${m.content}"`;
          })
          .join("\n");

  const response = await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Reader's top-rated books (loves): ${JSON.stringify(topRated)}\nReader's lowest-rated books (aversions): ${JSON.stringify(lowRated)}\n\nConversation so far:\n${historyText}\n\nWhat is your next move?`,
      },
    ],
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" },
    temperature: 0.75,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from Groq.");

  return JSON.parse(content) as DeepDiveStep;
}

// ─── Deep Dive: Final recommendation ─────────────────────────────────────────

export async function generateDeepDiveRecommendation(opts: {
  topRatedBooks: LibraryBook[];
  fullLibrary: LibraryBook[];
  rejectedTitles?: string[];
  conversationHistory: { role: "assistant" | "user"; content: string }[];
}): Promise<AIRecommendation> {
  const forbiddenTitles = buildForbiddenTitles(opts.fullLibrary, opts.rejectedTitles ?? []).slice(0, 300);
  const topRated = (opts.topRatedBooks || []).slice(0, 20).map((b) => ({
    title: b.title,
    author: b.author,
  }));
  const lowRated = (opts.fullLibrary || [])
    .filter((b) => b.rating != null)
    .sort((a, b) => (a.rating || 0) - (b.rating || 0))
    .slice(0, 5)
    .map((b) => ({ title: b.title, author: b.author, rating: b.rating }));

  const moodTranscript = opts.conversationHistory
    .map((m) => `${m.role === "assistant" ? "Q" : "A"}: ${m.content}`)
    .join("\n");

  const systemPrompt = `You are a literary sommelier completing a "Deep Dive" book prescription.

You have conducted a mood interview with the reader. You have three sources of signal: their highest-rated books (loves), their lowest-rated books (aversions), and their answers to a diagnostic mood questionnaire.

Your task: prescribe the single most precisely calibrated book for this exact moment in their reading life. The recommendation must feel inevitable — as if the entire conversation was always leading here. It should honor both who they are as a reader and who they are right now, while strictly avoiding patterns from their lowest-rated books.

Output ONLY a raw, valid JSON object following this EXACT structure, ensuring all strings are properly closed with quotes:
{
  "recommendations": [
    {"title": "Exact Book Title", "author": "Full Author Name", "blurb": "Exactly 2 sentences fulfilling the prompt requirements."},
    {"title": "Exact Book Title", "author": "Full Author Name", "blurb": "Exactly 2 sentences fulfilling the prompt requirements."},
    {"title": "Exact Book Title", "author": "Full Author Name", "blurb": "Exactly 2 sentences fulfilling the prompt requirements."}
  ]
}

Do not add markdown formatting or conversational text.

Only recommend real, published books.`;

  const userPrompt = `Reader's top-rated books (loves):
${JSON.stringify(topRated)}

Reader's lowest-rated books (aversions to avoid):
${JSON.stringify(lowRated)}

Mood interview transcript:
${moodTranscript}

Do NOT recommend any book whose title (case-insensitive) appears in this list:
${JSON.stringify(forbiddenTitles)}

Prescribe 3 to 5 books, sorted by confidence (best match first).`;

  return callWithRetry(systemPrompt, userPrompt, 0.5, forbiddenTitles);
}
