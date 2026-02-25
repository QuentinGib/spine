import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Sparkles, Shuffle, BookOpen, RefreshCw } from "lucide-react";
import { useBookCover } from "@/hooks/useBookCover";
import BookCoverComponent from "@/components/BookCover";

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

function RecommendationCard({
  recommendation,
  generating,
  onNotFeelingIt,
}: {
  recommendation: { recommended_book_title: string; recommended_book_author: string; blurb: string };
  generating: boolean;
  onNotFeelingIt: () => void;
}) {
  const coverUrl = useBookCover(recommendation.recommended_book_title, recommendation.recommended_book_author);

  return (
    <div className="bg-card border border-border rounded-lg p-8 text-center space-y-4">
      <div className="flex justify-center">
        <BookCoverComponent coverUrl={coverUrl} title={recommendation.recommended_book_title} size="lg" />
      </div>
      <h3 className="text-2xl font-display font-semibold text-foreground">
        {recommendation.recommended_book_title}
      </h3>
      <p className="text-muted-foreground font-medium">
        by {recommendation.recommended_book_author}
      </p>
      <p className="text-sm text-foreground/80 leading-relaxed max-w-lg mx-auto">
        {recommendation.blurb}
      </p>
      <Button onClick={onNotFeelingIt} variant="outline" className="mt-6" disabled={generating}>
        <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
        Not Feeling It
      </Button>
    </div>
  );
}

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

  // Deep Dive chat state
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatPhase, setChatPhase] = useState<"idle" | "asking" | "done">("idle");

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
  }, [fetchRecommendation]);

  const generateRecommendation = async (extraContext?: string) => {
    if (!user) return;
    setGenerating(true);

    try {
      const { data: books } = await supabase
        .from("library")
        .select("title, author, rating")
        .eq("user_id", user.id)
        .gte("rating", 8);

      const { data: rejected } = await supabase
        .from("rejected_recommendations")
        .select("rejected_title")
        .eq("user_id", user.id);

      const res = await supabase.functions.invoke("recommend", {
        body: {
          type,
          books: books || [],
          rejected: (rejected || []).map((r) => r.rejected_title),
          extraContext,
        },
      });

      if (res.error) throw new Error(res.error.message);

      const rec = res.data;

      // Save to active_recommendations
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
      if (type === "Deep Dive") setChatPhase("done");
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const handleNotFeelingIt = async () => {
    if (!user || !recommendation) return;
    setGenerating(true);

    // Log rejection
    await supabase.from("rejected_recommendations").insert({
      user_id: user.id,
      rejected_title: recommendation.recommended_book_title,
    });

    // Clear active
    await supabase
      .from("active_recommendations")
      .delete()
      .eq("user_id", user.id)
      .eq("type", type);

    setRecommendation(null);

    // Generate new
    if (type === "Deep Dive") {
      setChatPhase("idle");
      setChatMessages([]);
      setGenerating(false);
    } else {
      await generateRecommendation();
    }
  };

  // Deep Dive chat logic
  const startDeepDive = async () => {
    setChatPhase("asking");
    setGenerating(true);

    try {
      const { data: books } = await supabase
        .from("library")
        .select("title, author, rating")
        .eq("user_id", user!.id)
        .gte("rating", 8);

      const res = await supabase.functions.invoke("recommend", {
        body: {
          type: "Deep Dive",
          books: books || [],
          rejected: [],
          phase: "ask_questions",
        },
      });

      if (res.error) throw new Error(res.error.message);
      setChatMessages([{ role: "assistant", content: res.data.question }]);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setChatPhase("idle");
    }
    setGenerating(false);
  };

  const sendChatResponse = async () => {
    if (!chatInput.trim()) return;
    const newMessages = [...chatMessages, { role: "user", content: chatInput }];
    setChatMessages(newMessages);
    setChatInput("");
    setGenerating(true);

    // After user answers, generate the recommendation
    const contextStr = newMessages.map((m) => `${m.role}: ${m.content}`).join("\n");
    await generateRecommendation(contextStr);
  };

  const Icon = config.icon;

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
        />
      ) : type === "Deep Dive" && chatPhase !== "done" ? (
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          {chatPhase === "idle" ? (
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                I'll ask you a couple of questions about your mood before recommending.
              </p>
              <Button onClick={startDeepDive} disabled={generating}>
                {generating ? "Thinking..." : "Start Deep Dive"}
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`text-sm p-3 rounded-lg ${
                      msg.role === "assistant"
                        ? "bg-muted text-foreground"
                        : "bg-primary/10 text-foreground ml-8"
                    }`}
                  >
                    {msg.content}
                  </div>
                ))}
              </div>
              {!generating && (
                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendChatResponse()}
                    placeholder="Your answer..."
                    className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button onClick={sendChatResponse} size="sm" className="h-10">
                    Send
                  </Button>
                </div>
              )}
              {generating && (
                <p className="text-sm text-muted-foreground text-center">Thinking...</p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">No recommendation yet.</p>
          <Button onClick={() => generateRecommendation()} disabled={generating}>
            {generating ? "Generating..." : "Get a Recommendation"}
          </Button>
        </div>
      )}
    </div>
  );
}
