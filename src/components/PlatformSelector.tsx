import { motion } from "framer-motion";
import { Instagram } from "lucide-react";
import { cn } from "@/lib/utils";

export type Platform = "instagram";

interface PlatformSelectorProps {
  selected: Platform;
  onSelect: (platform: Platform) => void;
}

const PlatformSelector = ({ selected, onSelect }: PlatformSelectorProps) => {
  return (
    <div className="flex justify-center gap-3 p-2">
      <motion.button
        onClick={() => onSelect("instagram")}
        className={cn(
          "relative flex items-center gap-3 px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300",
          "min-w-[160px] justify-center",
          "bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-white shadow-lg shadow-pink-500/30 scale-105"
        )}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Instagram className="h-6 w-6" />
        <span>Instagram</span>
      </motion.button>
    </div>
  );
};

export default PlatformSelector;
