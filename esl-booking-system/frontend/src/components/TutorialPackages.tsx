import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ScrollReveal from "@/components/ScrollReveal";

const currencyOptions = ["RMB", "USD", "KRW", "VND"] as const;
type Currency = (typeof currencyOptions)[number];

const rates: Record<Currency, number> = { RMB: 1, USD: 0.14, KRW: 190, VND: 3300 };
const symbols: Record<Currency, string> = { RMB: "¥", USD: "$", KRW: "₩", VND: "₫" };

const convertPrice = (price: number, currency: Currency) =>
  `${symbols[currency]} ${(price * rates[currency]).toLocaleString()}`;

const kidsPackages = [
  { sessions: 40, free: 1, price: 1250 },
  { sessions: 60, free: 1, price: 1750 },
  { sessions: 100, free: 5, price: 2800 },
  { sessions: 150, free: 5, price: 4000 },
];

const adultsPackages = [
  { sessions: 40, free: 1, price: 1400 },
  { sessions: 60, free: 1, price: 2100 },
  { sessions: 100, free: 5, price: 3500 },
  { sessions: 150, free: 5, price: 5200 },
];

const TutorialPackages = () => {
  const [currency, setCurrency] = useState<Currency>("RMB");
  const [subject, setSubject] = useState<"English" | "Math">("English");
  const { t } = useTranslation();

  return (
    <div className="max-w-6xl mx-auto px-4 text-center">
      <ScrollReveal animation="fade-up">
        <div className="inline-flex items-center gap-2 text-[#2E6B9E] text-xs font-semibold px-4 py-1.5 rounded-full bg-[#EEF6FA] border border-[#D0E8F0] mb-4 shadow-sm">
          Pricing Plans
        </div>
      </ScrollReveal>
      <ScrollReveal animation="fade-up" delay={100}>
        <h2 className="text-3xl font-bold brand-gradient-text mb-3">
          {t("packages.title")}
        </h2>
      </ScrollReveal>
      <ScrollReveal animation="fade-up" delay={150}>
        <p className="text-gray-500 mb-8 max-w-md mx-auto text-sm">
          Choose the perfect package for your learning journey
        </p>
      </ScrollReveal>

      {/* Filters */}
      <ScrollReveal animation="fade-up" delay={200}>
        <div className="flex flex-wrap justify-center items-center gap-4 mb-10">
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t("packages.viewIn")} />
            </SelectTrigger>
            <SelectContent>
              {currencyOptions.map((cur) => (
                <SelectItem key={cur} value={cur}>
                  {t("packages.viewIn")} {cur}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Button
              variant={subject === "English" ? "default" : "outline"}
              onClick={() => setSubject("English")}
              className="rounded-full px-5"
            >
              {t("packages.english")}
            </Button>
            <Button
              variant={subject === "Math" ? "default" : "outline"}
              onClick={() => setSubject("Math")}
              className="rounded-full px-5"
            >
              {t("packages.math")}
            </Button>
          </div>
        </div>
      </ScrollReveal>

      {/* Kids */}
      <ScrollReveal animation="fade-up" delay={250}>
        <h3 className="text-emerald-600 font-bold text-xl mb-5 flex items-center justify-center gap-3">
          <span className="w-10 h-px bg-emerald-200" />
          {t("packages.kidsTitle")}
          <span className="w-10 h-px bg-emerald-200" />
        </h3>
      </ScrollReveal>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-14">
        {kidsPackages.map((pkg, i) => {
          const price = subject === "Math" ? pkg.price + 300 : pkg.price;
          const isBest = i === 2;
          return (
            <ScrollReveal key={i} animation="fade-up" delay={300 + i * 80}>
              <Card
                className={`glow-card border-0 bg-white rounded-2xl relative overflow-hidden transition-all duration-300 h-full ${
                  isBest ? "ring-2 ring-emerald-300 scale-[1.03]" : "hover:scale-[1.02]"
                }`}
              >
                {isBest && (
                  <div className="absolute top-0 left-0 right-0 bg-emerald-500 text-white text-[10px] font-semibold py-1 text-center tracking-wide uppercase">
                    Most Popular
                  </div>
                )}
                <CardContent className={`flex flex-col items-center py-6 gap-2 ${isBest ? "pt-9" : ""}`}>
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-2xl">🎒</div>
                  <CardTitle className="text-base font-bold mt-1">
                    {t("packages.freeSessions", { sessions: pkg.sessions, free: pkg.free })}
                  </CardTitle>
                  <p className="text-gray-500 text-sm">
                    {t("packages.subject")} <strong className="text-gray-700">{subject === "English" ? t("packages.english") : t("packages.math")}</strong>
                  </p>
                  <p className="text-emerald-600 text-xl font-bold">
                    {convertPrice(price, currency)}
                  </p>
                </CardContent>
              </Card>
            </ScrollReveal>
          );
        })}
      </div>

      {/* Adults */}
      <ScrollReveal animation="fade-up">
        <h3 className="text-[#2E6B9E] font-bold text-xl mb-5 flex items-center justify-center gap-3">
          <span className="w-10 h-px bg-[#D0E8F0]" />
          {t("packages.adultsTitle")}
          <span className="w-10 h-px bg-[#D0E8F0]" />
        </h3>
      </ScrollReveal>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {adultsPackages.map((pkg, i) => {
          const isBest = i === 2;
          return (
            <ScrollReveal key={i} animation="fade-up" delay={100 + i * 80}>
              <Card
                className={`glow-card border-0 bg-white rounded-2xl relative overflow-hidden transition-all duration-300 h-full ${
                  isBest ? "ring-2 ring-[#D0E8F0] scale-[1.03]" : "hover:scale-[1.02]"
                }`}
              >
                {isBest && (
                  <div className="absolute top-0 left-0 right-0 brand-gradient text-white text-[10px] font-semibold py-1 text-center tracking-wide uppercase">
                    Best Value
                  </div>
                )}
                <CardContent className={`flex flex-col items-center py-6 gap-2 ${isBest ? "pt-9" : ""}`}>
                  <div className="w-12 h-12 rounded-xl bg-[#D0E8F0] flex items-center justify-center text-2xl">📘</div>
                  <CardTitle className="text-base font-bold mt-1">
                    {t("packages.freeSessions", { sessions: pkg.sessions, free: pkg.free })}
                  </CardTitle>
                  <p className="text-gray-500 text-sm">
                    {t("packages.subject")} <strong className="text-gray-700">{subject === "English" ? t("packages.english") : t("packages.math")}</strong>
                  </p>
                  <p className="brand-gradient-text text-xl font-bold">
                    {convertPrice(pkg.price, currency)}
                  </p>
                </CardContent>
              </Card>
            </ScrollReveal>
          );
        })}
      </div>
    </div>
  );
};

export default TutorialPackages;
