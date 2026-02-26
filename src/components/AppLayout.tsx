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
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/85 backdrop-blur-md">
        <div className="container mx-auto grid grid-cols-[1fr_auto_1fr] items-center h-16 px-6">

          {/* Left: Brand — italic Playfair evokes a book spine */}
          <h1 className="font-display italic font-medium text-xl tracking-normal text-foreground select-none">
            Spine
          </h1>

          {/* Center: Navigation pill cluster */}
          <nav className="flex items-center gap-0.5 rounded-full bg-muted/70 p-1">
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
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

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

      <main className="container mx-auto px-4 py-10 max-w-6xl">
        {children}
      </main>
    </div>
  );
}
