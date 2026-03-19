import { Mail, Phone, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Separator } from "@/components/ui/separator";

const Footer = () => {
  const { t } = useTranslation();
  return (
    <footer className="bg-gray-900 text-gray-300 py-8 mt-12">
      <div className="max-w-5xl mx-auto px-4 text-center">
        <div className="flex flex-wrap justify-center gap-6 text-sm">
          <a
            href="mailto:brightfolks@gmail.com"
            className="flex items-center gap-2 hover:text-primary transition-colors"
          >
            <Mail className="h-4 w-4" />
            brightfolks@gmail.com
          </a>
          <Separator orientation="vertical" className="h-4 bg-gray-600 hidden sm:block self-center" />
          <a
            href="tel:+639123456789"
            className="flex items-center gap-2 hover:text-primary transition-colors"
          >
            <Phone className="h-4 w-4" />
            0912-345-6789
          </a>
          <Separator orientation="vertical" className="h-4 bg-gray-600 hidden sm:block self-center" />
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Tacloban City, Philippines
          </span>
        </div>
        <p className="mt-4 text-xs text-gray-500">
          {t("footer.rights", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
};

export default Footer;
