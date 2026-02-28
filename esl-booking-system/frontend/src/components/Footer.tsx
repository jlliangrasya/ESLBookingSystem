import { Mail, Phone, MapPin } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const Footer = () => {
  return (
    <footer className="bg-gray-900 text-gray-300 py-8 mt-12">
      <div className="max-w-5xl mx-auto px-4 text-center">
        <div className="flex flex-wrap justify-center gap-6 text-sm">
          <a
            href="mailto:eunitalk@gmail.com"
            className="flex items-center gap-2 hover:text-primary transition-colors"
          >
            <Mail className="h-4 w-4" />
            eunitalk@gmail.com
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
          &copy; {new Date().getFullYear()} Eunitalk. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
