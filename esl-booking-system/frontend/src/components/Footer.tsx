import { Mail, Phone, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Separator } from "@/components/ui/separator";

const Footer = () => {
  const { t } = useTranslation();
  return (
    <footer className="bg-gradient-to-b from-slate-900 to-slate-950 text-gray-300 relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 py-10 text-center">
        <div className="flex flex-wrap justify-center gap-6 text-sm">
          <a
            href="mailto:brightfolkscenter@gmail.com"
            className="flex items-center gap-2 hover:text-[#6BBAD0] transition-colors"
          >
            <Mail className="h-4 w-4" />
            brightfolkscenter@gmail.com
          </a>
          <Separator
            orientation="vertical"
            className="h-4 bg-gray-700 hidden sm:block self-center"
          />
          <a
            href="tel:+639123456789"
            className="flex items-center gap-2 hover:text-[#6BBAD0] transition-colors"
          >
            <Phone className="h-4 w-4" />
            0922-495-9040
          </a>
          <Separator
            orientation="vertical"
            className="h-4 bg-gray-700 hidden sm:block self-center"
          />
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Cebu City, Philippines
          </span>
        </div>
        <p className="mt-5 text-xs text-gray-500">
          {t("footer.rights", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
};

export default Footer;
