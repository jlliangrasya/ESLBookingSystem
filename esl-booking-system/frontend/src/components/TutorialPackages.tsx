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
      <h2 className="text-3xl font-bold text-primary mb-6">
        {t("packages.title")}
      </h2>

      {/* Filters */}
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

      {/* Kids */}
      <h3 className="text-green-600 font-bold text-xl mb-4">
        {t("packages.kidsTitle")}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
        {kidsPackages.map((pkg, i) => {
          const price = subject === "Math" ? pkg.price + 300 : pkg.price;
          return (
            <Card key={i} className="shadow-lg border-0 bg-sky-50 hover:shadow-xl transition-shadow">
              <CardContent className="flex flex-col items-center py-6 gap-2">
                <span className="text-3xl">🎒</span>
                <CardTitle className="text-base font-bold mt-1">
                  {t("packages.freeSessions", { sessions: pkg.sessions, free: pkg.free })}
                </CardTitle>
                <p className="text-muted-foreground text-sm">
                  {t("packages.subject")} <strong>{subject === "English" ? t("packages.english") : t("packages.math")}</strong>
                </p>
                <p className="text-green-600 text-lg font-semibold">
                  {convertPrice(price, currency)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Adults */}
      <h3 className="text-gray-600 font-bold text-xl mb-4">
        {t("packages.adultsTitle")}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {adultsPackages.map((pkg, i) => (
          <Card key={i} className="shadow-lg border-0 bg-gray-50 hover:shadow-xl transition-shadow">
            <CardContent className="flex flex-col items-center py-6 gap-2">
              <span className="text-3xl">📘</span>
              <CardTitle className="text-base font-bold mt-1">
                {t("packages.freeSessions", { sessions: pkg.sessions, free: pkg.free })}
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {t("packages.subject")} <strong>{subject === "English" ? t("packages.english") : t("packages.math")}</strong>
              </p>
              <p className="text-primary text-lg font-semibold">
                {convertPrice(pkg.price, currency)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default TutorialPackages;
