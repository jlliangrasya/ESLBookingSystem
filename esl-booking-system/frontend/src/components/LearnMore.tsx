import { BookOpen, Lightbulb, Clock, PencilLine } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: BookOpen,
    title: "Services Offered",
    description: "We offer online English tutorials for all ages and levels.",
  },
  {
    icon: Lightbulb,
    title: "Personalized Lessons",
    description: "Each lesson is customized to the student's needs and pace.",
  },
  {
    icon: Clock,
    title: "Flexible Schedule",
    description: "Book your classes at your convenience with flexible hours.",
  },
  {
    icon: PencilLine,
    title: "Subjects",
    description:
      "Grammar, Speaking, Reading Comprehension, Vocabulary, and more.",
  },
];

const LearnMore = () => {
  return (
    <div className="max-w-6xl mx-auto px-4 text-center">
      <h2 className="text-3xl font-bold text-primary mb-10">
        Why Choose Eunitalk?
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map(({ icon: Icon, title, description }) => (
          <Card
            key={title}
            className="group hover:-translate-y-2 transition-transform duration-300 shadow-md border-0 bg-white"
          >
            <CardContent className="flex flex-col items-center text-center pt-8 pb-6 px-5 gap-3">
              <div className="p-3 bg-sky-100 rounded-full">
                <Icon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-primary text-base">{title}</h3>
              <p className="text-muted-foreground text-sm">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default LearnMore;
