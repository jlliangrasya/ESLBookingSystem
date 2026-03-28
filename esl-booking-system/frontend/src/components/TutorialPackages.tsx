import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import ScrollReveal from "@/components/ScrollReveal";

const features = [
  {
    icon: "📅",
    color: "bg-[#EEF6FA]",
    titleKey: "features.scheduleTitle",
    descKey: "features.scheduleDesc",
  },
  {
    icon: "🔍",
    color: "bg-emerald-50",
    titleKey: "features.slotsTitle",
    descKey: "features.slotsDesc",
  },
  {
    icon: "📊",
    color: "bg-purple-50",
    titleKey: "features.progressTitle",
    descKey: "features.progressDesc",
  },
  {
    icon: "✏️",
    color: "bg-amber-50",
    titleKey: "features.teacherTitle",
    descKey: "features.teacherDesc",
  },
  {
    icon: "📈",
    color: "bg-rose-50",
    titleKey: "features.growthTitle",
    descKey: "features.growthDesc",
  },
  {
    icon: "🌐",
    color: "bg-indigo-50",
    titleKey: "features.accessTitle",
    descKey: "features.accessDesc",
  },
];

const TutorialPackages = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-6xl mx-auto px-4 text-center">
      <ScrollReveal animation="fade-up">
        <div className="inline-flex items-center gap-2 text-[#2E6B9E] text-xs font-semibold px-4 py-1.5 rounded-full bg-[#EEF6FA] border border-[#D0E8F0] mb-4 shadow-sm">
          {t("features.badge")}
        </div>
      </ScrollReveal>

      <ScrollReveal animation="fade-up" delay={100}>
        <h2 className="text-3xl font-bold brand-gradient-text mb-3">
          {t("features.title")}
        </h2>
      </ScrollReveal>

      <ScrollReveal animation="fade-up" delay={150}>
        <p className="text-gray-500 mb-10 max-w-md mx-auto text-sm">
          {t("features.subtitle")}
        </p>
      </ScrollReveal>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {features.map((f, i) => (
          <ScrollReveal key={i} animation="fade-up" delay={200 + i * 80}>
            <Card className="glow-card border-0 bg-white rounded-2xl h-full hover:scale-[1.02] transition-all duration-300">
              <CardContent className="flex flex-col items-center py-8 gap-3 text-center">
                <div className={`w-13 h-13 rounded-xl ${f.color} flex items-center justify-center text-3xl p-3`}>
                  {f.icon}
                </div>
                <h3 className="text-base font-bold text-gray-800">
                  {t(f.titleKey)}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  {t(f.descKey)}
                </p>
              </CardContent>
            </Card>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
};

export default TutorialPackages;
