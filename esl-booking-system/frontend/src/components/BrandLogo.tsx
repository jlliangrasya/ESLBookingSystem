import { GraduationCap } from "lucide-react";
import { useContext } from "react";
import AuthContext from "@/context/AuthContext";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "white";
}

const BrandLogo: React.FC<BrandLogoProps> = ({ size = "md", variant = "default" }) => {
  const auth = useContext(AuthContext);
  const companyName = auth?.user?.company_name;

  const icon = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : "h-5 w-5";
  const wrap = size === "sm" ? "p-1" : size === "lg" ? "p-2.5" : "p-1.5";
  const text = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-xl";
  const isWhite = variant === "white";

  const displayName = companyName || "ESL Center";
  const [first, ...rest] = displayName.split(" ");
  const remainder = rest.join(" ");

  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className={`brand-gradient rounded-xl ${wrap} shadow-md`}>
        <GraduationCap className={`${icon} text-white`} />
      </div>
      <span className={`${text} font-bold tracking-tight`}>
        <span className={isWhite ? "text-white" : "text-primary"}>{first}</span>
        {remainder && (
          <span className={isWhite ? "text-white/80" : "text-gray-800"}> {remainder}</span>
        )}
      </span>
    </div>
  );
};

export default BrandLogo;
