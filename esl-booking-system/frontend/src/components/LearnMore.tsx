import { BookOpen, Lightbulb, Clock, PencilLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import ScrollReveal from "@/components/ScrollReveal";

const featureKeys = [
  { icon: BookOpen, titleKey: "learnMore.servicesTitle", descKey: "learnMore.servicesDesc" },
  { icon: Lightbulb, titleKey: "learnMore.personalizedTitle", descKey: "learnMore.personalizedDesc" },
  { icon: Clock, titleKey: "learnMore.flexibleTitle", descKey: "learnMore.flexibleDesc" },
  { icon: PencilLine, titleKey: "learnMore.subjectsTitle", descKey: "learnMore.subjectsDesc" },
];

const LearnMore = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-6xl mx-auto px-4 text-center">
      <ScrollReveal animation="fade-up">
        <div className="inline-flex items-center gap-2 text-[#2E6B9E] text-xs font-semibold px-4 py-1.5 rounded-full bg-white/70 border border-[#D0E8F0] mb-4 shadow-sm">
          Why Choose Us
        </div>
      </ScrollReveal>
      <ScrollReveal animation="fade-up" delay={100}>
        <h2 className="text-3xl font-bold brand-gradient-text mb-3">
          {t("learnMore.title")}
        </h2>
      </ScrollReveal>
      <ScrollReveal animation="fade-up" delay={150}>
        <p className="text-gray-500 mb-12 max-w-lg mx-auto">
          Discover what makes our platform the best choice for ESL learning
        </p>
      </ScrollReveal>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {featureKeys.map(({ icon: Icon, titleKey, descKey }, index) => (
          <ScrollReveal key={titleKey} animation="fade-up" delay={200 + index * 100}>
            <Card className="group glow-card border-0 bg-white rounded-2xl relative overflow-hidden h-full">
              <div className="absolute top-0 left-0 right-0 h-1 brand-gradient opacity-80" />
              <CardContent className="flex flex-col items-center text-center pt-8 pb-6 px-5 gap-3">
                <div className="p-3.5 brand-gradient rounded-2xl shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all duration-300">
                  <Icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="font-semibold text-gray-800 text-base">{t(titleKey)}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{t(descKey)}</p>
              </CardContent>
            </Card>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
};

export default LearnMore;
