import { BookOpen, Lightbulb, Clock, PencilLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";

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
      <h2 className="text-3xl font-bold text-primary mb-10">
        {t("learnMore.title")}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {featureKeys.map(({ icon: Icon, titleKey, descKey }) => (
          <Card
            key={titleKey}
            className="group hover:-translate-y-2 transition-transform duration-300 shadow-md border-0 bg-white"
          >
            <CardContent className="flex flex-col items-center text-center pt-8 pb-6 px-5 gap-3">
              <div className="p-3 bg-sky-100 rounded-full">
                <Icon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-primary text-base">{t(titleKey)}</h3>
              <p className="text-muted-foreground text-sm">{t(descKey)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default LearnMore;
