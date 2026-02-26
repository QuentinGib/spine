import { CSSProperties, useState, useEffect, useCallback } from "react";
import BookDetailModal from "@/components/BookDetailModal";
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

// ─── Shelf visual constants ───────────────────────────────────────────────────
//
// Cream wall ledge: matches app background, depth via shadow only — no 3D transform.
// Width is set via className to stay responsive.

const SHELF_PLANK: CSSProperties = {
  // width handled by className (w-64 sm:w-80)
  height: "10px",
  background: "hsl(var(--background))",
  // Crisp top edge defines the ledge surface; diffuse shadow below for protrusion depth
  borderTop: "1px solid rgba(0,0,0,0.07)",
  boxShadow: "0 4px 18px rgba(0,0,0,0.07), 0 1px 5px rgba(0,0,0,0.05)",
  borderRadius: "0 0 4px 4px",
};

// ─── Types ────────────────────────────────────────────────────────────────────

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
    emptyLine: "We'll study your taste and find the one book you were born to read next.",
  },
  Wildcard: {
    icon: Shuffle,
    tagline: "Same emotional resonance, totally different genre.",
    color: "text-accent",
    emptyLine: "We'll find the unexpected book that delivers your exact emotional experience.",
  },
  "Deep Dive": {
    icon: BookOpen,
    tagline: "A recommendation shaped by your current mood.",
    color: "text-primary",
    emptyLine: "Tell us your mood and we'll find the perfect book for this moment.",
  },
};

interface Props {
  type: "Sure Thing" | "Wildcard" | "Deep Dive";
}

// ─── Thinking indicator ───────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-center justify-center gap-1.5 py-4">
      <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-blink [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-blink [animation-delay:200ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-blink [animation-delay:400ms]" />
    </div>
  );
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
  const [showDetail, setShowDetail] = useState(false);

  const handleConfirmAlreadyRead = async () => {
    setSubmitting(true);
    await onAlreadyRead(rating);
    setSubmitting(false);
  };

  return (
    <div className="text-center space-y-6 py-4 animate-fade-in">

      {/* ── Book on shelf ── */}
      <div className="flex flex-col items-center">
        {/* Cover — clickable to open detail modal */}
        <button
          onClick={() => setShowDetail(true)}
          className="cursor-pointer group/cover rounded focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label={`View details for ${recommendation.recommended_book_title}`}
        >
          <div className="shadow-[0_18px_56px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.09)] rounded
                          transition-transform duration-300 ease-out
                          group-hover/cover:-translate-y-1">
            <BookCoverComponent
              coverUrl={coverUrl}
              title={recommendation.recommended_book_title}
              size="lg"
            />
          </div>
        </button>

        {/* Shelf plank — cream ledge, responsive width */}
        <div className="w-64 sm:w-80" style={SHELF_PLANK} />
      </div>

      {/* Book detail modal */}
      <BookDetailModal
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        title={recommendation.recommended_book_title}
        author={recommendation.recommended_book_author}
        description={recommendation.blurb}
      />

      {/* ── Text details below the shelf ── */}
      <div className="space-y-2 pt-1">
        <h3 className="text-2xl font-display font-medium text-foreground leading-snug">
          {recommendation.recommended_book_title}
        </h3>
        <p className="text-sm text-muted-foreground font-display italic">
          by {recommendation.recommended_book_author}
        </p>
        <p className="text-sm text-foreground/75 leading-relaxed max-w-md mx-auto pt-1">
          {recommendation.blurb}
        </p>
      </div>

      {/* ── Actions ── */}
      {showRating ? (
        /* Already-read rating widget */
        <div className="pt-2 space-y-4 text-left max-w-xs mx-auto">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Rate it</span>
            <span className="text-sm font-semibold text-primary flex items-center gap-1">
              <Star size={12} className="fill-primary" />
              {rating} / 10
            </span>
          </div>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className={`h-9 rounded text-xs font-semibold transition-all duration-100
                  ${n === rating
                    ? "bg-primary text-primary-foreground shadow-sm scale-105"
                    : n < rating
                    ? "bg-primary/15 text-primary/80"
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
              className="flex-1 h-10 font-medium"
            >
              {submitting ? <ThinkingDots /> : "Add to Library & Get New Pick"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowRating(false)}
              disabled={submitting}
              size="sm"
              className="h-10"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        /* Normal actions */
        <div className="flex flex-col items-center gap-2.5 pt-1">
          <Button
            onClick={onNotFeelingIt}
            variant="outline"
            disabled={generating}
            className="gap-2 h-10 px-5 font-medium"
          >
            <RefreshCw size={13} strokeWidth={2} className={generating ? "animate-spin" : ""} />
            Not Feeling It
          </Button>
          <button
            onClick={() => setShowRating(true)}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground
                       transition-colors duration-150 disabled:opacity-40"
          >
            <Check size={11} strokeWidth={2} />
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

  // ─── Library data helper ────────────────────────────────────────────────────

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

  // ─── Sure Thing / Wildcard ──────────────────────────────────────────────────

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

  // ─── Already Read flow ──────────────────────────────────────────────────────

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
        await generateStandardRecommendation(undefined, [recommendation.recommended_book_title]);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setGenerating(false);
    }
  };

  // ─── Deep Dive ──────────────────────────────────────────────────────────────

  const startDeepDive = async () => {
    if (!initialPrompt.trim()) return;
    setChatPhase("asking");
    setGenerating(true);

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

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <ThinkingDots />
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-xl mx-auto animate-fade-in space-y-10">

      {/* Page header */}
      <div className="text-center space-y-2.5">
        <Icon size={26} strokeWidth={1.75} className={`${config.color} mx-auto`} />
        <h2 className="text-4xl font-display italic font-medium text-foreground">{type}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{config.tagline}</p>
      </div>

      {recommendation ? (
        <RecommendationCard
          recommendation={recommendation}
          generating={generating}
          onNotFeelingIt={handleNotFeelingIt}
          onAlreadyRead={handleAlreadyRead}
        />

      ) : type === "Deep Dive" && chatPhase !== "done" ? (

        /* ── Deep Dive conversation ── */
        <div className="space-y-5">
          {chatPhase === "idle" ? (

            /* Initial mood prompt */
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  What are you in the mood for?
                </p>
                <p className="text-xs text-muted-foreground">
                  The more specific you are, the better the match.
                </p>
              </div>
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
                className="w-full px-4 py-3 rounded-lg border border-border/60 bg-card text-sm
                           text-foreground placeholder:text-muted-foreground/50 font-display italic
                           focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none
                           leading-relaxed"
              />
              <Button
                onClick={startDeepDive}
                disabled={generating || !initialPrompt.trim()}
                className="w-full h-11 font-medium"
              >
                {generating ? <ThinkingDots /> : "Start Deep Dive →"}
              </Button>
            </div>

          ) : (

            /* Active conversation */
            <div className="space-y-3">

              {/* Message thread */}
              <div className="space-y-2.5">
                {chatMessages.map((msg, i) => {
                  const isInitialPrompt = i === 0 && msg.role === "user";
                  if (isInitialPrompt) {
                    return (
                      <p key={i} className="text-center text-sm font-display italic text-muted-foreground py-1">
                        "{msg.content}"
                      </p>
                    );
                  }
                  return (
                    <div
                      key={i}
                      className={`text-sm leading-relaxed rounded-xl px-4 py-3
                        ${msg.role === "assistant"
                          ? "bg-muted/50 text-foreground border-l-[3px] border-primary/25"
                          : "bg-primary/10 text-foreground ml-10 text-right border border-primary/10"
                        }`}
                    >
                      {msg.content}
                    </div>
                  );
                })}
              </div>

              {/* Interaction area */}
              {generating ? (
                <ThinkingDots />
              ) : pendingOptions ? (
                /* Binary-choice buttons */
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {pendingOptions.map((option) => (
                    <Button
                      key={option}
                      variant="outline"
                      className="h-auto py-3 px-4 text-sm leading-snug whitespace-normal
                                 text-center font-medium hover:bg-muted/60"
                      onClick={() => sendAnswer(option)}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              ) : (
                /* Fallback text input */
                <div className="flex gap-2 pt-1">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendAnswer(chatInput)}
                    placeholder="Your answer..."
                    className="flex-1 h-10 px-3 rounded-lg border border-border/60 bg-card text-sm
                               text-foreground placeholder:text-muted-foreground/50
                               focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <Button onClick={() => sendAnswer(chatInput)} size="sm" className="h-10 px-4">
                    Send
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

      ) : (

        /* ── No recommendation yet (Sure Thing / Wildcard) ── */
        <div className="text-center py-20 space-y-5">
          <p className="font-display italic text-2xl text-muted-foreground/45 leading-snug">
            Ready for your<br />next great read?
          </p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            {config.emptyLine}
          </p>
          <Button
            onClick={() => generateStandardRecommendation()}
            disabled={generating}
            size="lg"
            className="mt-1 h-11 px-8 font-medium"
          >
            {generating ? <ThinkingDots /> : "Get a Recommendation →"}
          </Button>
        </div>
      )}

    </div>
  );
}
