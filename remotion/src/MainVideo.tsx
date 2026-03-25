import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Sequence,
  Img,
  staticFile,
} from "remotion";

const SCREENS = [
  { file: "screen-home.png", label: "1. Open Neural Update", subLabel: "gram-text-wizard.lovable.app" },
  { file: "screen-settings-dna.png", label: "2. Open Settings", subLabel: "Configure agent DNA & platforms" },
  { file: "screen-accounts.png", label: "3. Connect TikTok", subLabel: "Settings → Accounts → Connect TikTok" },
  { file: "screen-tiktok-create.png", label: "4. Create TikTok Video", subLabel: "AI generates narrated video content" },
  { file: "screen-queue.png", label: "5. Schedule & Publish", subLabel: "Auto-publish to TikTok via Content Posting API" },
];

const SCENE_DURATION = 75; // 2.5s each
const TRANSITION = 15;

function Scene({ screenFile, label, subLabel }: { screenFile: string; label: string; subLabel: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterSpring = spring({ frame, fps, config: { damping: 20, stiffness: 120 } });
  const phoneY = interpolate(enterSpring, [0, 1], [200, 0]);
  const phoneOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });

  const labelY = interpolate(
    spring({ frame: frame - 10, fps, config: { damping: 18 } }),
    [0, 1], [40, 0]
  );
  const labelOpacity = interpolate(frame, [10, 22], [0, 1], { extrapolateRight: "clamp" });

  const subOpacity = interpolate(frame, [18, 30], [0, 1], { extrapolateRight: "clamp" });
  const subY = interpolate(
    spring({ frame: frame - 18, fps, config: { damping: 18 } }),
    [0, 1], [20, 0]
  );

  // Subtle zoom on screenshot
  const zoom = interpolate(frame, [0, SCENE_DURATION], [1, 1.05], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      {/* Background gradient */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(160deg, #0a0a1a 0%, #111128 40%, #1a0a2e 100%)",
      }} />

      {/* Floating accent shapes */}
      <div style={{
        position: "absolute", top: "10%", right: "-5%",
        width: 300, height: 300, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,212,255,0.15), transparent 70%)",
        filter: "blur(40px)",
        transform: `translateY(${Math.sin(frame * 0.05) * 10}px)`,
      }} />
      <div style={{
        position: "absolute", bottom: "15%", left: "-8%",
        width: 250, height: 250, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,0,128,0.12), transparent 70%)",
        filter: "blur(35px)",
        transform: `translateY(${Math.cos(frame * 0.04) * 8}px)`,
      }} />

      {/* Phone frame with screenshot */}
      <div style={{
        position: "absolute", top: 280, left: "50%",
        transform: `translateX(-50%) translateY(${phoneY}px) scale(${zoom})`,
        opacity: phoneOpacity,
        width: 820, height: 1050,
        borderRadius: 32,
        overflow: "hidden",
        boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 40px rgba(0,212,255,0.1)",
        border: "2px solid rgba(255,255,255,0.1)",
      }}>
        <Img
          src={staticFile(`images/${screenFile}`)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>

      {/* Label */}
      <div style={{
        position: "absolute", top: 120, left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center",
        transform: `translateY(${labelY}px)`,
        opacity: labelOpacity,
      }}>
        <div style={{
          fontSize: 52, fontWeight: 800, color: "white",
          fontFamily: "sans-serif", textAlign: "center",
          textShadow: "0 4px 20px rgba(0,0,0,0.5)",
          letterSpacing: -1,
        }}>
          {label}
        </div>
      </div>

      {/* Sub-label */}
      <div style={{
        position: "absolute", top: 190, left: 0, right: 0,
        display: "flex", justifyContent: "center",
        transform: `translateY(${subY}px)`,
        opacity: subOpacity,
      }}>
        <div style={{
          fontSize: 28, color: "rgba(0,212,255,0.9)",
          fontFamily: "sans-serif", textAlign: "center",
          fontWeight: 500,
          padding: "8px 24px",
          background: "rgba(0,212,255,0.08)",
          borderRadius: 12,
          border: "1px solid rgba(0,212,255,0.15)",
        }}>
          {subLabel}
        </div>
      </div>

      {/* Bottom URL bar */}
      <div style={{
        position: "absolute", bottom: 60, left: 0, right: 0,
        display: "flex", justifyContent: "center",
        opacity: subOpacity,
      }}>
        <div style={{
          fontSize: 22, color: "rgba(255,255,255,0.4)",
          fontFamily: "monospace",
        }}>
          gram-text-wizard.lovable.app
        </div>
      </div>
    </AbsoluteFill>
  );
}

// Intro scene
function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 15, stiffness: 80 } });
  const titleScale = interpolate(titleSpring, [0, 1], [0.5, 1]);
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  const subOpacity = interpolate(frame, [20, 35], [0, 1], { extrapolateRight: "clamp" });
  const subY = interpolate(
    spring({ frame: frame - 20, fps, config: { damping: 18 } }),
    [0, 1], [30, 0]
  );

  const badgesOpacity = interpolate(frame, [35, 50], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(160deg, #0a0a1a 0%, #0d0d2b 50%, #1a0a2e 100%)",
      }} />

      {/* Large glow */}
      <div style={{
        position: "absolute", top: "30%", left: "50%",
        width: 500, height: 500, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,212,255,0.2), transparent 60%)",
        filter: "blur(60px)",
        transform: `translate(-50%, -50%) scale(${interpolate(frame, [0, 60], [0.8, 1.2], { extrapolateRight: "clamp" })})`,
      }} />

      {/* TikTok logo accent */}
      <div style={{
        position: "absolute", top: "25%", left: "50%",
        transform: `translate(-50%, -50%) scale(${titleScale})`,
        opacity: titleOpacity,
        fontSize: 120,
      }}>
        🎵
      </div>

      {/* Title */}
      <div style={{
        position: "absolute", top: "42%", left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center",
        transform: `scale(${titleScale})`,
        opacity: titleOpacity,
      }}>
        <div style={{
          fontSize: 72, fontWeight: 900, color: "white",
          fontFamily: "sans-serif", textAlign: "center",
          letterSpacing: -2,
          lineHeight: 1.1,
        }}>
          Neural Update
        </div>
        <div style={{
          fontSize: 40, fontWeight: 300, color: "rgba(255,255,255,0.6)",
          fontFamily: "sans-serif", marginTop: 8,
        }}>
          ×
        </div>
        <div style={{
          fontSize: 68, fontWeight: 800,
          fontFamily: "sans-serif",
          background: "linear-gradient(90deg, #00f2ea, #ff0050)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginTop: 4,
        }}>
          TikTok Integration
        </div>
      </div>

      {/* Subtitle */}
      <div style={{
        position: "absolute", top: "68%", left: 0, right: 0,
        display: "flex", justifyContent: "center",
        transform: `translateY(${subY}px)`,
        opacity: subOpacity,
      }}>
        <div style={{
          fontSize: 32, color: "rgba(255,255,255,0.7)",
          fontFamily: "sans-serif", textAlign: "center",
          maxWidth: 700, lineHeight: 1.4,
        }}>
          End-to-end demo: Login Kit + Content Posting API
        </div>
      </div>

      {/* Badges */}
      <div style={{
        position: "absolute", top: "78%", left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: 20,
        opacity: badgesOpacity,
      }}>
        {["Login Kit", "Content Posting API", "video.publish"].map((badge) => (
          <div key={badge} style={{
            fontSize: 22, color: "rgba(0,212,255,0.9)",
            padding: "10px 20px",
            background: "rgba(0,212,255,0.08)",
            borderRadius: 10,
            border: "1px solid rgba(0,212,255,0.2)",
            fontFamily: "monospace",
          }}>
            {badge}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

// Outro scene
function OutroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const s = spring({ frame, fps, config: { damping: 15 } });
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(160deg, #0a0a1a 0%, #0d0d2b 50%, #1a0a2e 100%)",
      }} />

      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        opacity,
        transform: `scale(${interpolate(s, [0, 1], [0.9, 1])})`,
      }}>
        <div style={{
          fontSize: 64, fontWeight: 900, color: "white",
          fontFamily: "sans-serif", textAlign: "center",
          marginBottom: 30,
        }}>
          ✅ Integration Complete
        </div>
        <div style={{
          fontSize: 32, color: "rgba(255,255,255,0.6)",
          fontFamily: "sans-serif", textAlign: "center",
          lineHeight: 1.6, maxWidth: 700,
        }}>
          OAuth Login → Video Creation → Auto Publish
        </div>
        <div style={{
          marginTop: 60,
          fontSize: 26, color: "rgba(0,212,255,0.7)",
          fontFamily: "monospace",
        }}>
          gram-text-wizard.lovable.app
        </div>
      </div>
    </AbsoluteFill>
  );
}

export const MainVideo = () => {
  const INTRO_DURATION = 90;
  const OUTRO_DURATION = 75;

  return (
    <AbsoluteFill style={{ background: "#0a0a1a" }}>
      {/* Intro */}
      <Sequence from={0} durationInFrames={INTRO_DURATION}>
        <IntroScene />
      </Sequence>

      {/* Screens */}
      {SCREENS.map((screen, i) => (
        <Sequence
          key={i}
          from={INTRO_DURATION + i * (SCENE_DURATION - TRANSITION)}
          durationInFrames={SCENE_DURATION}
        >
          <Scene screenFile={screen.file} label={screen.label} subLabel={screen.subLabel} />
        </Sequence>
      ))}

      {/* Outro */}
      <Sequence
        from={INTRO_DURATION + SCREENS.length * (SCENE_DURATION - TRANSITION)}
        durationInFrames={OUTRO_DURATION}
      >
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};
