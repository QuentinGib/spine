import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (!isLogin) {
      toast({ title: "Welcome to Spine", description: "Your account has been created." });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[340px] animate-fade-in space-y-10">

        {/* Brand */}
        <div className="flex flex-col items-center space-y-3">
          <img src="/logo_simple.png" alt="Spine" className="h-16 w-auto" />
          <h1 className="font-display italic font-medium text-4xl text-foreground tracking-normal">
            Spine
          </h1>
          <p className="font-display italic text-sm text-muted-foreground">
            Your reading life, curated.
          </p>
        </div>

        {/* Hairline divider */}
        <div className="border-t border-border/70" />

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-11 bg-card border-border/60 focus-visible:ring-1 focus-visible:ring-primary/50
                         text-sm placeholder:text-muted-foreground/50 rounded-lg"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="h-11 bg-card border-border/60 focus-visible:ring-1 focus-visible:ring-primary/50
                         text-sm placeholder:text-muted-foreground/50 rounded-lg"
              placeholder="••••••••"
            />
          </div>

          <Button
            type="submit"
            className="w-full h-11 font-medium text-sm tracking-wide rounded-lg"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-blink [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-blink [animation-delay:200ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-blink [animation-delay:400ms]" />
              </span>
            ) : isLogin ? "Sign In" : "Create Account"}
          </Button>
        </form>

        {/* Toggle */}
        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? "New to Spine?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-foreground font-medium underline-offset-4 hover:underline transition-colors"
          >
            {isLogin ? "Create an account" : "Sign in"}
          </button>
        </p>

      </div>
    </div>
  );
}
