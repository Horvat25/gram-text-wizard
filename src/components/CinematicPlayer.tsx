import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  RotateCcw,
  Maximize,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { StorySegment } from "@/hooks/useNarrativeStory";

interface CinematicPlayerProps {
  segments: StorySegment[];
  narrationUrl: string;
  title: string;
  totalDuration: number;
  onComplete?: () => void;
}

const TRANSITION_VARIANTS = [
  // Fade with zoom
  {
    initial: { opacity: 0, scale: 1.1 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
  // Slide from right
  {
    initial: { opacity: 0, x: 100 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -100 },
  },
  // Zoom in
  {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.2 },
  },
  // Fade up
  {
    initial: { opacity: 0, y: 50 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -50 },
  },
];

const CinematicPlayer = ({ 
  segments, 
  narrationUrl, 
  title, 
  totalDuration,
  onComplete 
}: CinematicPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentSegment = segments[currentSegmentIndex];
  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  // Ken Burns effect for current image
  const segmentDuration = currentSegment?.duration || 5;

  // Update current segment based on time
  useEffect(() => {
    if (!isPlaying) return;
    
    const segment = segments.find((seg, index) => {
      const nextSeg = segments[index + 1];
      const segEnd = nextSeg ? nextSeg.startTime : totalDuration;
      return currentTime >= seg.startTime && currentTime < segEnd;
    });
    
    if (segment) {
      const newIndex = segments.indexOf(segment);
      if (newIndex !== currentSegmentIndex) {
        setCurrentSegmentIndex(newIndex);
      }
    }
  }, [currentTime, segments, isPlaying, currentSegmentIndex, totalDuration]);

  // Timer for playback
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentTime(prev => {
          const next = prev + 0.1;
          if (next >= totalDuration) {
            setIsPlaying(false);
            onComplete?.();
            return totalDuration;
          }
          return next;
        });
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, totalDuration, onComplete]);

  // Sync audio with playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !narrationUrl) return;

    if (isPlaying) {
      audio.currentTime = currentTime;
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  }, [isPlaying, narrationUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const togglePlay = useCallback(() => {
    if (currentTime >= totalDuration) {
      setCurrentTime(0);
      setCurrentSegmentIndex(0);
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, currentTime, totalDuration]);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setCurrentSegmentIndex(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen?.();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen?.();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn("Fullscreen not supported:", err);
    }
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const newTime = percent * totalDuration;
    setCurrentTime(newTime);
    
    // Find corresponding segment
    const segment = segments.find((seg, index) => {
      const nextSeg = segments[index + 1];
      const segEnd = nextSeg ? nextSeg.startTime : totalDuration;
      return newTime >= seg.startTime && newTime < segEnd;
    });
    if (segment) {
      setCurrentSegmentIndex(segments.indexOf(segment));
    }
    
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  }, [totalDuration, segments]);

  const transitionVariant = TRANSITION_VARIANTS[currentSegmentIndex % TRANSITION_VARIANTS.length];

  if (segments.length === 0) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative rounded-xl overflow-hidden bg-black mx-auto",
        isFullscreen 
          ? "fixed inset-0 z-50 rounded-none" 
          : "aspect-[9/16] w-full max-w-[280px] max-h-[400px]"
      )}
    >
      {/* Hidden audio element */}
      {narrationUrl && (
        <audio ref={audioRef} src={narrationUrl} preload="auto" />
      )}

      {/* Image slideshow with transitions */}
      <div className="absolute inset-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSegmentIndex}
            {...transitionVariant}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            <motion.img
              src={currentSegment?.imageUrl}
              alt={`Cena ${currentSegmentIndex + 1}`}
              className="w-full h-full object-cover"
              initial={{ scale: 1 }}
              animate={{ scale: 1.08 }}
              transition={{ duration: segmentDuration, ease: "linear" }}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Gradient overlays for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

      {/* Title at top */}
      <motion.div 
        className="absolute top-4 left-4 right-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="text-white/90 text-sm font-medium tracking-wide uppercase">
          {title}
        </h3>
      </motion.div>

      {/* Segment indicators */}
      <div className="absolute top-12 left-4 right-4 flex gap-1">
        {segments.map((_, index) => (
          <div
            key={index}
            className={cn(
              "h-0.5 flex-1 rounded-full transition-all duration-300",
              index < currentSegmentIndex 
                ? "bg-white" 
                : index === currentSegmentIndex 
                  ? "bg-white/80" 
                  : "bg-white/30"
            )}
          >
            {index === currentSegmentIndex && (
              <motion.div
                className="h-full bg-white rounded-full"
                initial={{ width: "0%" }}
                animate={{ 
                  width: `${((currentTime - currentSegment.startTime) / currentSegment.duration) * 100}%` 
                }}
                transition={{ duration: 0.1, ease: "linear" }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Animated captions/subtitles */}
      <div className="absolute bottom-24 left-4 right-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSegmentIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
            className="text-center"
          >
            <p className="text-white text-lg font-medium leading-relaxed drop-shadow-lg px-2">
              {currentSegment?.text}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Scene counter */}
      <div className="absolute bottom-20 right-4">
        <span className="text-white/60 text-xs font-mono">
          {currentSegmentIndex + 1}/{segments.length}
        </span>
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3">
        {/* Progress bar */}
        <div 
          className="w-full h-1 bg-white/20 rounded-full cursor-pointer"
          onClick={handleProgressClick}
        >
          <motion.div
            className="h-full bg-white rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 text-white hover:bg-white/20"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" fill="currentColor" />
              ) : (
                <Play className="h-5 w-5" fill="currentColor" />
              )}
            </Button>
            
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white/70 hover:bg-white/20"
              onClick={handleReset}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>

            <span className="text-white/70 text-xs font-mono ml-2">
              {Math.floor(currentTime)}s / {totalDuration}s
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white/70 hover:bg-white/20"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white/70 hover:bg-white/20"
              onClick={toggleFullscreen}
            >
              <Maximize className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Play button overlay when paused */}
      {!isPlaying && currentTime === 0 && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="absolute inset-0 flex items-center justify-center bg-black/30"
          onClick={togglePlay}
        >
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
            <Play className="h-8 w-8 text-white ml-1" fill="currentColor" />
          </div>
        </motion.button>
      )}
    </div>
  );
};

export default CinematicPlayer;
