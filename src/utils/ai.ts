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

/** Call Groq and return a validated AIRecommendation, retrying up to maxAttempts
 *  if the model returns a title that sits in forbiddenTitles. */
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

    // On retry, append an explicit violation notice to the user prompt
    const prompt =
      attempt === 0
        ? userPrompt
        : `${userPrompt}\n\n⚠️ RETRY ${attempt}: Your previous response recommended a title that is already in the reader's library or rejection list. This is a hard constraint — pick a completely different book that does NOT appear in the forbidden list above.`;

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

    const result = JSON.parse(content) as AIRecommendation;

    // Post-response validation: reject if the title is in the forbidden list
    if (!forbiddenTitles.includes(normalizeTitle(result.title))) {
      return result;
    }
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

Your task: "The Sure Thing" — the highest-confidence recommendation possible.

Method:
1. Study the reader's top-rated books as a body of work. What patterns emerge across genre, theme, prose style, narrative structure, pacing, emotional register, and moral complexity?
2. Synthesize a precise taste profile from these signals.
3. Identify the single book that most naturally and inevitably extends this profile — not a safe genre-match, but the book that feels written for them.

Output ONLY valid JSON:
{"title": "Book Title", "author": "Full Author Name", "blurb": "Exactly 2 sentences. First: articulate precisely why this book fits their specific taste. Second: a line that creates genuine, irresistible anticipation."}

Only recommend real, published books. The blurb must feel tailored, not generic.`
    : `You are a curator of unexpected literary experiences — a specialist in emotional translation across genres.

Your task: "The Wildcard" — a book that delivers the reader's core emotional experience through an entirely unexpected vessel.

Method:
1. Identify the reader's "emotional fingerprint": the core feeling their highest-rated books consistently deliver beneath the surface of genre. This might be: the vertigo of moral ambiguity, the ache of quiet longing, the propulsive thrill of unraveling secrets, the warmth of found family, the unsettling beauty of unreliable reality.
2. Identify their dominant genre(s).
3. Choose a book from a COMPLETELY different genre — ideally one the reader would never select themselves — that delivers that exact emotional fingerprint with equal intensity.

The surprise should feel like a revelation: "I would never have picked this, but it gave me exactly what I didn't know I was looking for."

Output ONLY valid JSON:
{"title": "Book Title", "author": "Full Author Name", "blurb": "Exactly 2 sentences. First: name the emotional core you identified and the genre pivot explicitly. Second: make the unexpected choice feel irresistible."}

Only recommend real, published books. The genre shift must be genuine and significant — not a minor variation.`;

  const userPrompt = `Reader's top-rated books (8+/10):
${JSON.stringify(topRated)}

Do NOT recommend any book whose title (case-insensitive) appears in this list:
${JSON.stringify(forbiddenTitles)}
${opts.extraContext ? `\nAdditional context: ${opts.extraContext}` : ""}

Recommend exactly one book.`;

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
- Output ONLY valid JSON:
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
        content: `Reader's taste profile (top-rated books): ${JSON.stringify(topRated)}\n\nConversation so far:\n${historyText}\n\nWhat is your next move?`,
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
  const topRated = (opts.topRatedBooks || []).slice(0, 30).map((b) => ({
    title: b.title,
    author: b.author,
  }));

  const moodTranscript = opts.conversationHistory
    .map((m) => `${m.role === "assistant" ? "Q" : "A"}: ${m.content}`)
    .join("\n");

  const systemPrompt = `You are a literary sommelier completing a "Deep Dive" book prescription.

You have conducted a mood interview with the reader. You have two sources of signal: their long-term taste profile (top-rated books) and their answers to a diagnostic mood questionnaire.

Your task: prescribe the single most precisely calibrated book for this exact moment in their reading life. The recommendation must feel inevitable — as if the entire conversation was always leading here. It should honor both who they are as a reader and who they are right now.

Output ONLY valid JSON:
{"title": "Book Title", "author": "Full Author Name", "blurb": "Exactly 2 sentences. Tie the recommendation explicitly to what the reader revealed in their mood answers — be specific, not generic. The second sentence should create anticipation that feels personally addressed to them."}

Only recommend real, published books.`;

  const userPrompt = `Reader's top-rated books:
${JSON.stringify(topRated)}

Mood interview transcript:
${moodTranscript}

Do NOT recommend any book whose title (case-insensitive) appears in this list:
${JSON.stringify(forbiddenTitles)}

Prescribe exactly one book.`;

  return callWithRetry(systemPrompt, userPrompt, 0.5, forbiddenTitles);
}
