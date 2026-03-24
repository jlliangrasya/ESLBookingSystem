import { useEffect, useRef, useState } from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
  animation?: "fade-up" | "fade-right" | "fade-in" | "scale-in";
  delay?: number;
  threshold?: number;
}

const animationMap = {
  "fade-up": "animate-fade-in-up",
  "fade-right": "animate-fade-in-right",
  "fade-in": "animate-fade-in",
  "scale-in": "animate-scale-in",
};

const ScrollReveal = ({
  children,
  className = "",
  animation = "fade-up",
  delay = 0,
  threshold = 0.15,
}: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      className={`${className} ${visible ? animationMap[animation] : "opacity-0"}`}
      style={visible && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
};

export default ScrollReveal;
