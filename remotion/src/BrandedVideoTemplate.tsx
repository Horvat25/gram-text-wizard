import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Sequence,
  Video,
  OffthreadVideo,
} from "remotion";

interface BrandedVideoProps {
  videoUrl: string;
  headline: string;
  handle?: string;
  tagline?: string;
  sourceCredit?: string;
}

// Header bar with Neural Update branding
function BrandHeader() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideDown = spring({ frame, fps, config: { damping: 20, stiffness: 100 } });
  const y = interpolate(slideDown, [0, 1], [-120, 0]);

  // Subtle pulse on the lightning bolt
  const pulse = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.95, 1.05]);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 180,
        transform: `translateY(${y}px)`,
        background: "linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 80%, transparent 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
        paddingTop: 20,
      }}
    >
      {/* Brand name */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 42,
            transform: `scale(${pulse})`,
          }}
        >
          ⚡
        </span>
        <span
          style={{
            fontSize: 48,
            fontWeight: 900,
            color: "#FFD700",
            fontFamily: "sans-serif",
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          NEURAL UPDATE
        </span>
      </div>
      {/* Tagline */}
      <div
        style={{
          fontSize: 22,
          color: "rgba(255,255,255,0.6)",
          fontFamily: "sans-serif",
          letterSpacing: 6,
          textTransform: "uppercase",
          marginTop: 4,
        }}
      >
        IA • TECNOLOGIA • FUTURO
      </div>
    </div>
  );
}

// Footer bar with headline and handle
function BrandFooter({
  headline,
  handle,
  sourceCredit,
}: {
  headline: string;
  handle: string;
  sourceCredit?: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideUp = spring({ frame: frame - 10, fps, config: { damping: 20, stiffness: 100 } });
  const y = interpolate(slideUp, [0, 1], [200, 0]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 320,
        transform: `translateY(${y}px)`,
        background: "linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.8) 70%, transparent 100%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "0 48px 60px",
        zIndex: 10,
      }}
    >
      {/* Headline */}
      <div
        style={{
          fontSize: 40,
          fontWeight: 800,
          color: "#FFD700",
          fontFamily: "sans-serif",
          lineHeight: 1.2,
          textTransform: "uppercase",
          marginBottom: 16,
          maxHeight: 150,
          overflow: "hidden",
        }}
      >
        {headline}
      </div>

      {/* Handle + source */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 24,
            color: "rgba(255,255,255,0.7)",
            fontFamily: "sans-serif",
            fontWeight: 600,
          }}
        >
          {handle}
        </span>
        {sourceCredit && (
          <span
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.4)",
              fontFamily: "sans-serif",
            }}
          >
            📹 {sourceCredit}
          </span>
        )}
      </div>
    </div>
  );
}

// Watermark overlay (always visible)
function Watermark() {
  const frame = useCurrentFrame();
  const opacity = interpolate(Math.sin(frame * 0.03), [-1, 1], [0.15, 0.25]);

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%) rotate(-30deg)",
        fontSize: 80,
        fontWeight: 900,
        color: `rgba(255,255,255,${opacity})`,
        fontFamily: "sans-serif",
        letterSpacing: 8,
        textTransform: "uppercase",
        pointerEvents: "none",
        zIndex: 5,
        whiteSpace: "nowrap",
      }}
    >
      NEURAL UPDATE
    </div>
  );
}

export const BrandedVideoTemplate = ({
  videoUrl,
  headline,
  handle = "@neuralupdate",
  tagline = "IA • Tecnologia • Futuro",
  sourceCredit,
}: BrandedVideoProps) => {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* Background video - fills the central area */}
      <div
        style={{
          position: "absolute",
          top: 140,
          bottom: 260,
          left: 0,
          right: 0,
          overflow: "hidden",
        }}
      >
        <OffthreadVideo
          src={videoUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </div>

      {/* Branded overlays */}
      <BrandHeader />
      <Watermark />
      <BrandFooter
        headline={headline}
        handle={handle}
        sourceCredit={sourceCredit}
      />
    </AbsoluteFill>
  );
};
