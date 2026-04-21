import { motion } from "framer-motion";
import { Instagram } from "lucide-react";
import { cn } from "@/lib/utils";

export type Platform = "instagram" | "tiktok" | "blog";

interface PlatformSelectorProps {
  selected: Platform;
  onSelect: (platform: Platform) => void;
}

const TikTokIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    className={className}
    fill="currentColor"
  >
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

const PlatformSelector = ({ selected, onSelect }: PlatformSelectorProps) => {
  return (
    <div className="flex justify-center gap-3 p-2">
      {/* Instagram Button */}
      <motion.button
        onClick={() => onSelect("instagram")}
        className={cn(
          "relative flex items-center gap-3 px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300",
          "min-w-[160px] justify-center",
          selected === "instagram"
            ? "bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-white shadow-lg shadow-pink-500/30 scale-105"
            : "bg-muted/50 text-muted-foreground hover:bg-muted border border-border"
        )}
        whileHover={{ scale: selected === "instagram" ? 1.05 : 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Instagram className="h-6 w-6" />
        <span>Instagram</span>
        {selected === "instagram" && (
          <motion.div
            layoutId="platform-indicator"
            className="absolute inset-0 rounded-2xl ring-2 ring-white/30"
            initial={false}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        )}
      </motion.button>

      {/* TikTok Button */}
      <motion.button
        onClick={() => onSelect("tiktok")}
        className={cn(
          "relative flex items-center gap-3 px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300",
          "min-w-[160px] justify-center",
          selected === "tiktok"
            ? "bg-gradient-to-r from-[#000000] via-[#25F4EE] to-[#FE2C55] text-white shadow-lg shadow-cyan-500/30 scale-105"
            : "bg-muted/50 text-muted-foreground hover:bg-muted border border-border"
        )}
        whileHover={{ scale: selected === "tiktok" ? 1.05 : 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <TikTokIcon className="h-6 w-6" />
        <span>TikTok</span>
        {selected === "tiktok" && (
          <motion.div
            layoutId="platform-indicator"
            className="absolute inset-0 rounded-2xl ring-2 ring-white/30"
            initial={false}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        )}
      </motion.button>
    </div>
  );
};

export default PlatformSelector;
