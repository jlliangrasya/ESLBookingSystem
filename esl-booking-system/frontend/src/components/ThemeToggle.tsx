import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

// index.html applies the saved theme before first paint; this just mirrors it.
const readTheme = (): Theme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

const applyTheme = (theme: Theme) => {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage blocked (private mode) — theme still applies for this session
  }
};

const ThemeToggle = ({ variant = "default" }: { variant?: "default" | "white" }) => {
  const [theme, setTheme] = useState<Theme>(readTheme);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={`rounded-full h-9 w-9 ${variant === "white" ? "text-white/70 hover:text-white hover:bg-white/10" : "text-muted-foreground hover:text-primary"}`}
      title={label}
      aria-label={label}
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
};

export default ThemeToggle;
