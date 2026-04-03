import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { BookOpen, Sparkles, Shuffle, MessageCircle, LogOut } from "lucide-react";

const navItems = [
  { to: "/", label: "Library", icon: BookOpen },
  { to: "/sure-thing", label: "Sure Thing", icon: Sparkles },
  { to: "/wildcard", label: "Wildcard", icon: Shuffle },
  { to: "/deep-dive", label: "Deep Dive", icon: MessageCircle },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">

      {/* ── Top header ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/85 backdrop-blur-md"
              style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="container mx-auto grid grid-cols-[1fr_auto_1fr] items-center h-14 md:h-16 px-4 md:px-6">

          {/* Left: Brand */}
          <div className="flex items-center gap-2 select-none">
            <img src="/logo_simple.png" alt="Spine" className="h-8 w-auto" />
            <h1 className="font-display italic font-medium text-xl tracking-normal text-foreground">Spine</h1>
          </div>

          {/* Center: Navigation pill cluster — desktop only */}
          <nav className="hidden md:flex items-center gap-0.5 rounded-full bg-muted/70 p-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
                   transition-all duration-200 whitespace-nowrap select-none
                   ${isActive
                     ? "bg-[#f5e3b8] text-[#7a5a0e] shadow-sm"
                     : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                   }`
                }
              >
                <Icon size={13} strokeWidth={1.75} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Mobile: empty center placeholder */}
          <div className="md:hidden" />

          {/* Right: Utility actions */}
          <div className="flex justify-end">
            <button
              onClick={handleSignOut}
              className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground
                         hover:text-foreground hover:bg-muted transition-colors duration-150"
              title="Sign out"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </div>

        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <main className="container mx-auto px-4 pt-8 md:py-10 max-w-6xl mobile-content-pad md:pb-10">
        {children}
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer className="hidden md:block text-center pb-6 pt-2">
        <a
          href="mailto:spinereco@gmail.com"
          className="text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors duration-150"
        >
          spinereco@gmail.com
        </a>
      </footer>

      {/* ── Bottom navigation — mobile only ───────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50
                   bg-background/95 backdrop-blur-md border-t border-border/50"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-stretch h-16">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className="flex-1 flex"
            >
              {({ isActive }) => (
                <div
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5
                              transition-all duration-200 select-none
                              ${isActive ? "text-[#7a5a0e]" : "text-muted-foreground"}`}
                >
                  {/* Active pill indicator */}
                  <div
                    className={`flex items-center justify-center w-12 h-7 rounded-full
                                transition-all duration-200
                                ${isActive ? "bg-[#f5e3b8]" : ""}`}
                  >
                    <Icon
                      size={17}
                      strokeWidth={isActive ? 2 : 1.75}
                    />
                  </div>
                  <span className="text-[10px] font-medium leading-none">{label}</span>
                </div>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

    </div>
  );
}
