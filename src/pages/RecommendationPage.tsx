import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Sparkles, Shuffle, BookOpen, RefreshCw, Check, Star } from "lucide-react";
import { useBookCover } from "@/hooks/useBookCover";
import BookCoverComponent from "@/components/BookCover";
import {
  generateDeepDiveNextStep,
  generateDeepDiveRecommendation,
  generateRecommendation as generateGroqRecommendation,
} from "@/utils/ai";

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
  options?: [string, string];
};

const typeConfig = {
  "Sure Thing": {
    icon: Sparkles,
    tagline: "A book we're confident you'll love.",
    color: "text-primary",
  },
  Wildcard: {
    icon: Shuffle,
    tagline: "Same emotional resonance, totally different genre.",
    color: "text-accent",
  },
  "Deep Dive": {
    icon: BookOpen,
    tagline: "A recommendation shaped by your current mood.",
    color: "text-primary",
  },
};

interface Props {
  type: "Sure Thing" | "Wildcard" | "Deep Dive";
}

// ─── Recommendation Card ──────────────────────────────────────────────────────

function RecommendationCard({
  recommendation,
  generating,
  onNotFeelingIt,
  onAlreadyRead,
}: {
  recommendation: { recommended_book_title: string; recommended_book_author: string; blurb: string };
  generating: boolean;
  onNotFeelingIt: () => void;
  onAlreadyRead: (rating: number) => Promise<void>;
}) {
  const coverUrl = useBookCover(
    recommendation.recommended_book_title,
    recommendation.recommended_book_author
  );
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(7);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirmAlreadyRead = async () => {
    setSubmitting(true);
    await onAlreadyRead(rating);
    setSubmitting(false);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-8 text-center space-y-4">
      <div className="flex justify-center">
        <BookCoverComponent
          coverUrl={coverUrl}
          title={recommendation.recommended_book_title}
          size="lg"
        />
      </div>
      <h3 className="text-2xl font-display font-semibold text-foreground">
        {recommendation.recommended_book_title}
      </h3>
      <p className="text-muted-foreground font-medium">by {recommendation.recommended_book_author}</p>
      <p className="text-sm text-foreground/80 leading-relaxed max-w-lg mx-auto">
        {recommendation.blurb}
      </p>

      {showRating ? (
        /* ── Already-read rating widget ── */
        <div className="pt-2 space-y-4 text-left max-w-xs mx-auto">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Rate it</span>
            <span className="text-sm font-semibold text-primary flex items-center gap-1">
              <Star size={13} className="fill-primary" />
              {rating} / 10
            </span>
          </div>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className={`h-8 rounded-md text-xs font-medium transition-colors ${
                  n === rating
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : n < rating
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleConfirmAlreadyRead}
              disabled={submitting || generating}
              className="flex-1"
            >
              {submitting ? "Adding..." : "Add to Library & Get New Pick"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowRating(false)}
              disabled={submitting}
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        /* ── Normal actions ── */
        <div className="flex flex-col items-center gap-2 pt-2">
          <Button
            onClick={onNotFeelingIt}
            variant="outline"
            disabled={generating}
            className="gap-2"
          >
            <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
            Not Feeling It
          </Button>
          <button
            onClick={() => setShowRating(true)}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <Check size={12} />
            I've already read this
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RecommendationPage({ type }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [recommendation, setRecommendation] = useState<{
    recommended_book_title: string;
    recommended_book_author: string;
    blurb: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Deep Dive state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatPhase, setChatPhase] = useState<"idle" | "asking" | "done">("idle");
  const [initialPrompt, setInitialPrompt] = useState("");

  const config = typeConfig[type];

  const fetchRecommendation = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("active_recommendations")
      .select("*")
      .eq("user_id", user.id)
      .eq("type", type)
      .maybeSingle();

    if (data) {
      setRecommendation(data);
      if (type === "Deep Dive") setChatPhase("done");
    } else {
      setRecommendation(null);
      if (type === "Deep Dive") setChatPhase("idle");
    }
    setLoading(false);
  }, [user, type]);

  useEffect(() => {
    fetchRecommendation();
    setChatMessages([]);
    setChatInput("");
    setInitialPrompt("");
  }, [fetchRecommendation]);

  // ─── Library data helper ───────────────────────────────────────────────────

  const fetchLibraryData = async () => {
    const [{ data: topRated }, { data: fullLibrary }, { data: rejected }] = await Promise.all([
      supabase.from("library").select("title, author, rating").eq("user_id", user!.id).gte("rating", 8),
      supabase.from("library").select("title, author, rating").eq("user_id", user!.id),
      supabase.from("rejected_recommendations").select("rejected_title").eq("user_id", user!.id),
    ]);
    return {
      topRated: topRated || [],
      fullLibrary: fullLibrary || [],
      rejectedTitles: (rejected || []).map((r: any) => r.rejected_title),
    };
  };

  // ─── Sure Thing / Wildcard ─────────────────────────────────────────────────

  const generateStandardRecommendation = async (
    extraContext?: string,
    extraForbiddenTitles?: string[]
  ) => {
    if (!user || type === "Deep Dive") return;
    setGenerating(true);
    try {
      const { topRated, fullLibrary, rejectedTitles } = await fetchLibraryData();

      const rec = await generateGroqRecommendation({
        mode: type,
        topRatedBooks: topRated,
        fullLibrary,
        rejectedTitles: [...rejectedTitles, ...(extraForbiddenTitles ?? [])],
        extraContext,
      });

      await supabase.from("active_recommendations").insert({
        user_id: user.id,
        type,
        recommended_book_title: rec.title,
        recommended_book_author: rec.author,
        blurb: rec.blurb,
      });

      setRecommendation({
        recommended_book_title: rec.title,
        recommended_book_author: rec.author,
        blurb: rec.blurb,
      });
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const handleNotFeelingIt = async () => {
    if (!user || !recommendation) return;
    setGenerating(true);

    await supabase.from("rejected_recommendations").insert({
      user_id: user.id,
      rejected_title: recommendation.recommended_book_title,
    });

    await supabase
      .from("active_recommendations")
      .delete()
      .eq("user_id", user.id)
      .eq("type", type);

    setRecommendation(null);

    if (type === "Deep Dive") {
      setChatPhase("idle");
      setChatMessages([]);
      setInitialPrompt("");
      setGenerating(false);
    } else {
      await generateStandardRecommendation();
    }
  };

  // ─── Already Read flow ─────────────────────────────────────────────────────

  const handleAlreadyRead = async (rating: number) => {
    if (!user || !recommendation) return;
    setGenerating(true);
    try {
      const { error } = await supabase.from("library").insert({
        user_id: user.id,
        title: recommendation.recommended_book_title,
        author: recommendation.recommended_book_author,
        rating,
      });
      if (error) throw error;

      await supabase
        .from("active_recommendations")
        .delete()
        .eq("user_id", user.id)
        .eq("type", type);

      toast({
        title: "Added to your library!",
        description: `${recommendation.recommended_book_title} — ${rating}/10`,
      });

      setRecommendation(null);

      if (type === "Deep Dive") {
        setChatPhase("idle");
        setChatMessages([]);
        setInitialPrompt("");
        setGenerating(false);
      } else {
        // Pass the just-read title explicitly as a second layer of protection
        // (the library insert already covers it, but LLMs can ignore long lists)
        await generateStandardRecommendation(undefined, [recommendation.recommended_book_title]);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setGenerating(false);
    }
  };

  // ─── Deep Dive ─────────────────────────────────────────────────────────────

  const startDeepDive = async () => {
    if (!initialPrompt.trim()) return;
    setChatPhase("asking");
    setGenerating(true);

    // The initial mood description becomes the first user turn in the conversation
    const seedMessage: ChatMessage = { role: "user", content: initialPrompt };
    const seedHistory = [seedMessage];
    setChatMessages(seedHistory);

    try {
      const { topRated, fullLibrary } = await fetchLibraryData();
      const step = await generateDeepDiveNextStep({
        topRatedBooks: topRated,
        fullLibrary,
        conversationHistory: [{ role: "user", content: initialPrompt }],
      });

      if (step.action === "ask") {
        setChatMessages([seedMessage, { role: "assistant", content: step.question, options: step.options }]);
      } else {
        // Enough signal from the initial prompt alone — finalize immediately
        await finalizeDeepDive(seedHistory);
        return;
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setChatPhase("idle");
    }
    setGenerating(false);
  };

  const finalizeDeepDive = async (conversationHistory: ChatMessage[]) => {
    try {
      const { topRated, fullLibrary, rejectedTitles } = await fetchLibraryData();

      const rec = await generateDeepDiveRecommendation({
        topRatedBooks: topRated,
        fullLibrary,
        rejectedTitles,
        conversationHistory: conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      });

      await supabase.from("active_recommendations").insert({
        user_id: user!.id,
        type: "Deep Dive",
        recommended_book_title: rec.title,
        recommended_book_author: rec.author,
        blurb: rec.blurb,
      });

      setRecommendation({
        recommended_book_title: rec.title,
        recommended_book_author: rec.author,
        blurb: rec.blurb,
      });
      setChatPhase("done");
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const sendAnswer = async (answer: string) => {
    if (!answer.trim()) return;
    const updatedMessages: ChatMessage[] = [...chatMessages, { role: "user", content: answer }];
    setChatMessages(updatedMessages);
    setChatInput("");
    setGenerating(true);

    // Client-side hard cap: seed (index 0) doesn't count, so binary answers = userMessages - 1
    const binaryAnswerCount = updatedMessages.filter((m) => m.role === "user").length - 1;
    if (binaryAnswerCount >= 5) {
      await finalizeDeepDive(updatedMessages);
      return;
    }

    try {
      const { topRated, fullLibrary } = await fetchLibraryData();
      const step = await generateDeepDiveNextStep({
        topRatedBooks: topRated,
        fullLibrary,
        conversationHistory: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
      });

      if (step.action === "ask") {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: step.question, options: step.options },
        ]);
        setGenerating(false);
      } else {
        await finalizeDeepDive(updatedMessages);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setGenerating(false);
    }
  };

  const Icon = config.icon;

  const lastMessage = chatMessages[chatMessages.length - 1];
  const pendingOptions =
    lastMessage?.role === "assistant" && lastMessage?.options ? lastMessage.options : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in space-y-8">
      <div className="text-center space-y-2">
        <Icon size={32} className={config.color} />
        <h2 className="text-3xl font-semibold font-display text-foreground">{type}</h2>
        <p className="text-muted-foreground">{config.tagline}</p>
      </div>

      {recommendation ? (
        <RecommendationCard
          recommendation={recommendation}
          generating={generating}
          onNotFeelingIt={handleNotFeelingIt}
          onAlreadyRead={handleAlreadyRead}
        />
      ) : type === "Deep Dive" && chatPhase !== "done" ? (
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          {chatPhase === "idle" ? (
            /* ── Initial mood prompt ── */
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">
                  What are you in the mood for?
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Describe your current headspace — the more specific, the better.
                </p>
                <textarea
                  value={initialPrompt}
                  onChange={(e) => setInitialPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && initialPrompt.trim()) {
                      e.preventDefault();
                      startDeepDive();
                    }
                  }}
                  placeholder={`"Something dark and twisty for a rainy day"\n"I want to feel hopeful again"\n"Epic and immersive — I need to disappear"`}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
              <Button
                onClick={startDeepDive}
                disabled={generating || !initialPrompt.trim()}
                className="w-full"
              >
                {generating ? "Thinking..." : "Start Deep Dive →"}
              </Button>
            </div>
          ) : (
            /* ── Active conversation ── */
            <>
              <div className="space-y-3">
                {chatMessages.map((msg, i) => {
                  const isInitialPrompt = i === 0 && msg.role === "user";
                  return (
                    <div
                      key={i}
                      className={`text-sm p-3 rounded-lg ${
                        msg.role === "assistant"
                          ? "bg-muted text-foreground"
                          : isInitialPrompt
                          ? "bg-muted/40 text-muted-foreground border border-border/50 italic"
                          : "bg-primary/10 text-foreground ml-8"
                      }`}
                    >
                      {isInitialPrompt ? `"${msg.content}"` : msg.content}
                    </div>
                  );
                })}
              </div>

              {generating ? (
                <p className="text-sm text-muted-foreground text-center animate-pulse">Thinking...</p>
              ) : pendingOptions ? (
                /* Binary-choice buttons */
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {pendingOptions.map((option) => (
                    <Button
                      key={option}
                      variant="outline"
                      className="h-auto py-3 px-4 text-sm leading-snug whitespace-normal text-center"
                      onClick={() => sendAnswer(option)}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              ) : (
                /* Fallback text input */
                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendAnswer(chatInput)}
                    placeholder="Your answer..."
                    className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button onClick={() => sendAnswer(chatInput)} size="sm" className="h-10">
                    Send
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">No recommendation yet.</p>
          <Button onClick={() => generateStandardRecommendation()} disabled={generating}>
            {generating ? "Generating..." : "Get a Recommendation"}
          </Button>
        </div>
      )}
    </div>
  );
}
