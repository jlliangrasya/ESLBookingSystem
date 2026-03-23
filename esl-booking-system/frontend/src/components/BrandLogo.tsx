import { GraduationCap } from "lucide-react";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
}

const BrandLogo: React.FC<BrandLogoProps> = ({ size = "md" }) => {
  const icon = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : "h-5 w-5";
  const wrap = size === "sm" ? "p-1" : size === "lg" ? "p-2" : "p-1.5";
  const text = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-xl";

  return (
    <div className="flex items-center gap-2 select-none">
      <div className={`bg-primary rounded-lg ${wrap}`}>
        <GraduationCap className={`${icon} text-white`} />
      </div>
      <span className={`${text} font-bold tracking-tight`}>
        <span className="text-primary">ESL</span>
        <span className="text-gray-800"> Center</span>
      </span>
    </div>
  );
};

export default BrandLogo;
