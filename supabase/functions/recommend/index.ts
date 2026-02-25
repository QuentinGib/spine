import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, books, rejected, phase, extraContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const bookList = (books || [])
      .map((b: any) => `"${b.title}" by ${b.author} (rated ${b.rating}/10)`)
      .join("\n");

    const rejectedList = (rejected || []).join(", ");

    // Deep Dive: ask questions phase
    if (type === "Deep Dive" && phase === "ask_questions") {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "You are a warm, thoughtful book recommender. Ask the user 1-2 brief questions about their current mood, what kind of emotional experience they're craving, or what themes resonate with them right now. Be conversational and concise. Do not recommend a book yet.",
            },
            {
              role: "user",
              content: `Here are some books I've rated highly:\n${bookList}\n\nPlease ask me about my current mood so you can recommend something perfect.`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "Usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const question = data.choices?.[0]?.message?.content || "What kind of mood are you in right now?";

      return new Response(JSON.stringify({ question }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate recommendation
    let systemPrompt = "";
    if (type === "Sure Thing") {
      systemPrompt = `You are a book recommendation expert. Based on the user's highly-rated books, recommend ONE book they will almost certainly love. It should be a highly predictive, accurate match based on themes, writing style, and emotional resonance of their favorites. Return ONLY valid JSON: {"title": "...", "author": "...", "blurb": "..."}. The blurb should be 2-3 sentences explaining why they'll love it. Do not recommend any book from their library or the rejected list.`;
    } else if (type === "Wildcard") {
      systemPrompt = `You are a creative book recommender. Based on the user's highly-rated books, recommend ONE book that has similar emotional resonance but is in a COMPLETELY different genre. Surprise them. Return ONLY valid JSON: {"title": "...", "author": "...", "blurb": "..."}. The blurb should be 2-3 sentences. Do not recommend any book from their library or the rejected list.`;
    } else {
      systemPrompt = `You are a thoughtful book recommender. Based on the user's highly-rated books AND the conversation about their current mood, recommend ONE perfect book. Return ONLY valid JSON: {"title": "...", "author": "...", "blurb": "..."}. The blurb should be 2-3 sentences. Do not recommend any book from their library or the rejected list.`;
    }

    let userContent = `My highly-rated books:\n${bookList}`;
    if (rejectedList) userContent += `\n\nDo NOT recommend any of these: ${rejectedList}`;
    if (extraContext) userContent += `\n\nConversation context:\n${extraContext}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from possible markdown code blocks
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse AI response");

    const parsed = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("recommend error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
