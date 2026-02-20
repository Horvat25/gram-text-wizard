/**
 * Browser-based video encoder using Canvas + MediaRecorder
 * Creates real MP4-compatible video files from images and audio
 * Uses H.264 codec where available for Instagram compatibility
 * BRANDING: Neural Update watermark + marketing CTA at end
 * 
 * FIX: Uses fix-webm-duration to properly set duration metadata
 * Without this fix, WebM videos downloaded to mobile show as 0 seconds
 */

import { ensureAudioReady, getAudioContext } from "./audio-unlock";
import fixWebmDuration from "fix-webm-duration";

interface VideoSegment {
  imageUrl: string;
  duration: number; // in seconds
  text?: string;
}

interface VideoEncoderOptions {
  width?: number;
  height?: number;
  fps?: number;
  audioUrl?: string;
  ctaAudioUrl?: string; // Narration for the CTA at the end
  backgroundMusicUrl?: string; // Background music track
  segments: VideoSegment[];
  onProgress?: (progress: number) => void;
  brandName?: string;
  instagramHandle?: string;
}

/**
 * Load an image and return it as HTMLImageElement with retry logic
 */
async function loadImage(url: string, retries = 3): Promise<HTMLImageElement> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        
        const timeout = setTimeout(() => {
          reject(new Error(`Image load timeout: ${url}`));
        }, 15000);
        
        image.onload = () => {
          clearTimeout(timeout);
          resolve(image);
        };
        image.onerror = () => {
          clearTimeout(timeout);
          reject(new Error(`Failed to load image: ${url}`));
        };
        image.src = url;
      });
      return img;
    } catch (error) {
      console.warn(`Image load attempt ${attempt}/${retries} failed:`, error);
      if (attempt === retries) {
        throw error;
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(`Failed to load image after ${retries} attempts: ${url}`);
}

/**
 * Draw image on canvas with cover fit
 */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number
) {
  const imgRatio = img.width / img.height;
  const canvasRatio = width / height;
  
  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;
  
  if (imgRatio > canvasRatio) {
    drawWidth = height * imgRatio;
    offsetX = (width - drawWidth) / 2;
  } else {
    drawHeight = width / imgRatio;
    offsetY = (height - drawHeight) / 2;
  }
  
  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
}

/**
 * Apply Ken Burns effect (subtle zoom/pan) to a specific region
 */
function applyKenBurnsToRegion(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  regionX: number,
  regionY: number,
  regionWidth: number,
  regionHeight: number,
  progress: number,
  effectType: number
) {
  ctx.save();
  
  // Clip to the region
  ctx.beginPath();
  ctx.rect(regionX, regionY, regionWidth, regionHeight);
  ctx.clip();
  
  const scale = 1 + (progress * 0.08);
  const centerX = regionX + regionWidth / 2;
  const centerY = regionY + regionHeight / 2;
  
  ctx.translate(centerX, centerY);
  ctx.scale(scale, scale);
  
  const panX = (effectType % 2 === 0 ? 1 : -1) * progress * 15;
  const panY = (effectType % 3 === 0 ? 1 : -1) * progress * 10;
  
  ctx.translate(-centerX + panX, -centerY + panY);
  
  // Draw image to cover the region
  const imgRatio = img.width / img.height;
  const regionRatio = regionWidth / regionHeight;
  
  let drawWidth = regionWidth;
  let drawHeight = regionHeight;
  let offsetX = regionX;
  let offsetY = regionY;
  
  if (imgRatio > regionRatio) {
    drawWidth = regionHeight * imgRatio;
    offsetX = regionX + (regionWidth - drawWidth) / 2;
  } else {
    drawHeight = regionWidth / imgRatio;
    offsetY = regionY + (regionHeight - drawHeight) / 2;
  }
  
  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  
  ctx.restore();
}

/**
 * Draw split images - one on top (0-38%), one on bottom (62-100%)
 * Leaves middle (38-62%) clear for text overlay
 */
function drawSplitImages(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  progress: number,
  effectType: number
) {
  // Top image region: 0% to 38% of height
  const topHeight = height * 0.38;
  applyKenBurnsToRegion(ctx, img, 0, 0, width, topHeight, progress, effectType);
  
  // Bottom image region: 62% to 100% of height
  const bottomY = height * 0.62;
  const bottomHeight = height * 0.38;
  applyKenBurnsToRegion(ctx, img, 0, bottomY, width, bottomHeight, progress, effectType + 1);
  
  // Add subtle gradient overlays for smooth transitions to center
  ctx.save();
  
  // Gradient at bottom of top image
  const topGradient = ctx.createLinearGradient(0, topHeight - 40, 0, topHeight);
  topGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  topGradient.addColorStop(1, "rgba(0, 0, 0, 0.8)");
  ctx.fillStyle = topGradient;
  ctx.fillRect(0, topHeight - 40, width, 40);
  
  // Gradient at top of bottom image
  const bottomGradient = ctx.createLinearGradient(0, bottomY, 0, bottomY + 40);
  bottomGradient.addColorStop(0, "rgba(0, 0, 0, 0.8)");
  bottomGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = bottomGradient;
  ctx.fillRect(0, bottomY, width, 40);
  
  ctx.restore();
}

/**
 * Draw text overlay with styling - CENTERED on screen
 * Position: Middle of screen (40-60% height area)
 */
function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number
) {
  if (!text) return;
  
  const fontSize = Math.floor(width * 0.048);
  const padding = width * 0.06;
  const maxWidth = width - (padding * 2);
  
  ctx.font = `bold ${fontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  const lineHeight = fontSize * 1.35;
  const totalTextHeight = lines.length * lineHeight;
  
  // CENTER position - exactly middle of screen (40-60% zone)
  const centerY = height / 2;
  const boxPadding = width * 0.035;
  const boxWidth = maxWidth + boxPadding * 2;
  const boxHeight = totalTextHeight + boxPadding * 2;
  const boxX = (width - boxWidth) / 2;
  const boxY = centerY - boxHeight / 2;
  
  // Semi-transparent background box with gradient
  ctx.save();
  const bgGradient = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxHeight);
  bgGradient.addColorStop(0, "rgba(0, 0, 0, 0.85)");
  bgGradient.addColorStop(0.5, "rgba(20, 20, 40, 0.9)");
  bgGradient.addColorStop(1, "rgba(0, 0, 0, 0.85)");
  ctx.fillStyle = bgGradient;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 16);
  ctx.fill();
  
  // Subtle border
  ctx.strokeStyle = "rgba(138, 43, 226, 0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  
  // Draw text with shadow
  ctx.fillStyle = "white";
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  
  const startY = centerY - (totalTextHeight / 2) + (lineHeight / 2);
  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    ctx.fillText(line, width / 2, y);
  });
  
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Draw watermark (Neural Update branding) - STATIC, no animations
 * Position: Top-right corner, optimized for mobile viewing
 * Size: Increased 50% for better visibility on small screens
 */
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  brandName: string = "Neural Update"
) {
  // MOBILE OPTIMIZED: Increased from 0.028 to 0.042 (50% larger)
  const fontSize = Math.floor(width * 0.042);
  const padding = width * 0.04;
  
  ctx.save();
  
  // Position: top-right corner (static)
  ctx.font = `700 ${fontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  
  const text = `⚡ ${brandName}`;
  const metrics = ctx.measureText(text);
  const pillPadding = fontSize * 0.6;
  const pillWidth = metrics.width + pillPadding * 2;
  const pillHeight = fontSize + pillPadding * 1.4;
  const pillX = width - padding - pillWidth;
  const pillY = padding;
  
  // Add subtle shadow for depth
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  
  // Static gradient background with stronger colors
  const gradient = ctx.createLinearGradient(pillX, pillY, pillX + pillWidth, pillY + pillHeight);
  gradient.addColorStop(0, "rgba(139, 92, 246, 0.95)");
  gradient.addColorStop(1, "rgba(109, 40, 217, 0.95)");
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
  ctx.fill();
  
  // Add border for visibility
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  
  // Reset shadow for text
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  // Draw text with slight shadow for readability
  ctx.fillStyle = "white";
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 3;
  ctx.fillText(text, width - padding - pillPadding, padding + pillPadding * 0.7);
  
  ctx.restore();
}

/**
 * Draw marketing CTA frame (follow page)
 * MOBILE OPTIMIZED: Larger text, cleaner layout, better readability
 */
function drawMarketingCTA(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  instagramHandle: string = "@neuralupdate"
) {
  // Clean dark gradient background (less distracting)
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, width * 0.8
  );
  gradient.addColorStop(0, "hsl(270, 60%, 12%)");
  gradient.addColorStop(0.6, "hsl(270, 50%, 6%)");
  gradient.addColorStop(1, "rgb(8, 8, 12)");
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Subtle animated particles (fewer, larger)
  ctx.save();
  for (let i = 0; i < 15; i++) {
    const x = ((Math.sin(i * 2 + progress * 2) + 1) / 2) * width;
    const y = ((Math.cos(i * 3 + progress * 1.5) + 1) / 2) * height;
    const size = 3 + Math.sin(progress * 3 + i) * 2;
    const alpha = 0.2 + Math.sin(progress * 2 + i * 0.5) * 0.15;
    
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(139, 92, 246, ${alpha})`;
    ctx.fill();
  }
  ctx.restore();
  
  // Center Y position
  const centerY = height / 2;
  
  // MOBILE OPTIMIZED: Larger pulsing icon
  ctx.save();
  const pulseScale = 1 + Math.sin(progress * Math.PI * 3) * 0.08;
  const iconSize = width * 0.18 * pulseScale;
  
  // Outer glow
  const glowGradient = ctx.createRadialGradient(
    width / 2, centerY - height * 0.15, iconSize * 0.5,
    width / 2, centerY - height * 0.15, iconSize * 1.8
  );
  glowGradient.addColorStop(0, "rgba(139, 92, 246, 0.5)");
  glowGradient.addColorStop(1, "rgba(139, 92, 246, 0)");
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.arc(width / 2, centerY - height * 0.15, iconSize * 1.8, 0, Math.PI * 2);
  ctx.fill();
  
  // Icon background
  const iconGradient = ctx.createLinearGradient(
    width / 2 - iconSize, centerY - height * 0.15 - iconSize,
    width / 2 + iconSize, centerY - height * 0.15 + iconSize
  );
  iconGradient.addColorStop(0, "#8B5CF6");
  iconGradient.addColorStop(0.5, "#A855F7");
  iconGradient.addColorStop(1, "#7C3AED");
  
  ctx.fillStyle = iconGradient;
  ctx.beginPath();
  ctx.arc(width / 2, centerY - height * 0.15, iconSize, 0, Math.PI * 2);
  ctx.fill();
  
  // Lightning bolt icon (larger)
  ctx.fillStyle = "white";
  ctx.font = `bold ${iconSize * 1.3}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⚡", width / 2, centerY - height * 0.15);
  ctx.restore();
  
  // MOBILE OPTIMIZED: Brand name - 30% larger
  ctx.save();
  const titleFontSize = Math.floor(width * 0.12);
  ctx.font = `800 ${titleFontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  // Text gradient
  const textGradient = ctx.createLinearGradient(
    width / 2 - width * 0.35, 0,
    width / 2 + width * 0.35, 0
  );
  textGradient.addColorStop(0, "#A855F7");
  textGradient.addColorStop(0.5, "#FFFFFF");
  textGradient.addColorStop(1, "#8B5CF6");
  
  ctx.fillStyle = textGradient;
  ctx.shadowColor = "rgba(139, 92, 246, 0.6)";
  ctx.shadowBlur = 25;
  ctx.fillText("Neural Update", width / 2, centerY + height * 0.02);
  ctx.restore();
  
  // Subtitle - simplified for mobile
  ctx.save();
  const subtitleFontSize = Math.floor(width * 0.045);
  ctx.font = `500 ${subtitleFontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.fillText("IA • Tecnologia • Futuro", width / 2, centerY + height * 0.1);
  ctx.restore();
  
  // MOBILE OPTIMIZED: Follow CTA button - larger and more prominent
  ctx.save();
  const buttonWidth = width * 0.7;
  const buttonHeight = height * 0.09;
  const buttonX = (width - buttonWidth) / 2;
  const buttonY = centerY + height * 0.18;
  
  // Button glow
  ctx.shadowColor = "rgba(139, 92, 246, 0.7)";
  ctx.shadowBlur = 30 + Math.sin(progress * Math.PI * 2) * 12;
  
  // Button gradient
  const buttonGradient = ctx.createLinearGradient(buttonX, buttonY, buttonX + buttonWidth, buttonY);
  buttonGradient.addColorStop(0, "#8B5CF6");
  buttonGradient.addColorStop(0.5, "#A855F7");
  buttonGradient.addColorStop(1, "#7C3AED");
  
  ctx.fillStyle = buttonGradient;
  ctx.beginPath();
  ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, buttonHeight / 2);
  ctx.fill();
  
  // Button border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Button text - larger
  ctx.shadowBlur = 0;
  const buttonFontSize = Math.floor(width * 0.06);
  ctx.font = `700 ${buttonFontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SEGUIR AGORA", width / 2, buttonY + buttonHeight / 2);
  ctx.restore();
  
  // Instagram handle - larger and more visible
  ctx.save();
  const handleFontSize = Math.floor(width * 0.07);
  ctx.font = `700 ${handleFontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "white";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 8;
  ctx.fillText(instagramHandle, width / 2, centerY + height * 0.31);
  ctx.restore();
  
  // Bottom tagline - simpler
  ctx.save();
  const taglineFontSize = Math.floor(width * 0.04);
  ctx.font = `500 ${taglineFontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.fillText("O futuro é agora 🚀", width / 2, height - height * 0.06);
  ctx.restore();
}

/**
 * Transition types for professional video editing
 * Enhanced with more cinematic effects
 */
type TransitionType = 'crossfade' | 'slide' | 'zoom' | 'wipe' | 'blur' | 'none';

/**
 * Get transition duration in seconds
 * IMPROVED: Longer transitions for smoother flow (30% of segment, max 1.2s)
 */
function getTransitionDuration(segmentDuration: number): number {
  return Math.min(segmentDuration * 0.30, 1.2);
}

/**
 * Render a single frame to the canvas with professional transitions
 * Uses split image layout: top image + center text + bottom image
 * Supports crossfade transitions between segments
 * 
 * FIX: Text overlay is delayed until AFTER the transition completes
 * This ensures the narration matches the displayed image
 */
function renderFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  segments: VideoSegment[],
  images: HTMLImageElement[],
  currentTime: number,
  totalDuration: number,
  ctaDuration: number,
  brandName: string,
  instagramHandle: string
): void {
  const contentDuration = totalDuration - ctaDuration;
  
  // Check if we're in CTA phase
  if (currentTime >= contentDuration) {
    const ctaProgress = (currentTime - contentDuration) / ctaDuration;
    drawMarketingCTA(ctx, width, height, ctaProgress, instagramHandle);
    return;
  }
  
  // Find current segment and calculate transition state
  let elapsed = 0;
  let segmentIndex = 0;
  let segmentProgress = 0;
  let timeIntoSegment = 0;
  
  for (let i = 0; i < segments.length; i++) {
    if (currentTime < elapsed + segments[i].duration) {
      segmentIndex = i;
      timeIntoSegment = currentTime - elapsed;
      segmentProgress = timeIntoSegment / segments[i].duration;
      break;
    }
    elapsed += segments[i].duration;
  }

  const segment = segments[segmentIndex];
  const currentImg = images[segmentIndex];
  const segmentDuration = segment.duration;
  const transitionDuration = getTransitionDuration(segmentDuration);
  
  // Calculate if we're in a transition zone
  const isEnteringTransition = timeIntoSegment < transitionDuration && segmentIndex > 0;
  const isExitingTransition = timeIntoSegment > (segmentDuration - transitionDuration) && segmentIndex < segments.length - 1;
  
  // Clear canvas with dark background for center area
  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, width, height);
  
  // Determine transition type based on segment index for variety
  // IMPROVED: More variety with 6 transition types
  const transitionTypes: TransitionType[] = ['crossfade', 'wipe', 'zoom', 'blur', 'slide', 'crossfade'];
  const transitionType = transitionTypes[segmentIndex % transitionTypes.length];

  if (isEnteringTransition && segmentIndex > 0) {
    // Entering from previous segment - blend with previous image
    const prevImg = images[segmentIndex - 1];
    const transitionProgress = timeIntoSegment / transitionDuration; // 0 to 1
    
    drawTransition(ctx, prevImg, currentImg, width, height, transitionProgress, transitionType, segmentIndex - 1, segmentIndex);
  } else if (isExitingTransition && segmentIndex < segments.length - 1) {
    // Exiting to next segment - blend with next image
    const nextImg = images[segmentIndex + 1];
    const transitionProgress = (timeIntoSegment - (segmentDuration - transitionDuration)) / transitionDuration; // 0 to 1
    
    drawTransition(ctx, currentImg, nextImg, width, height, transitionProgress, transitionType, segmentIndex, segmentIndex + 1);
  } else {
    // Normal segment - just show current image with Ken Burns
    drawSplitImages(ctx, currentImg, width, height, segmentProgress, segmentIndex);
  }

  // Draw watermark
  drawWatermark(ctx, width, height, brandName);

  // 🔧 FIX: Only show text AFTER the entering transition completes
  // This ensures the narration matches the displayed image
  // During exit transition, we still show current text as it's still the current segment's audio
  const showText = !isEnteringTransition; // Hide text during entering transition
  
  if (showText && segment.text) {
    // IMPROVED: Smoother text fade-in with longer duration
    const textFadeInDuration = 0.25; // 250ms fade-in (was 150ms)
    const timeSinceTransition = timeIntoSegment - transitionDuration;
    
    // Calculate text opacity based on timing
    let textOpacity = 1;
    if (segmentIndex === 0) {
      // First segment: fade in from start
      textOpacity = Math.min(1, timeIntoSegment / textFadeInDuration);
    } else if (timeSinceTransition >= 0) {
      // Other segments: fade in after transition completes
      textOpacity = Math.min(1, timeSinceTransition / textFadeInDuration);
    } else {
      textOpacity = 0; // During transition, hide text
    }
    
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, textOpacity));
    drawTextOverlay(ctx, segment.text, width, height);
    ctx.restore();
  }
}

/**
 * Draw a transition between two images
 * Supports multiple transition types for professional look
 */
function drawTransition(
  ctx: CanvasRenderingContext2D,
  fromImg: HTMLImageElement,
  toImg: HTMLImageElement,
  width: number,
  height: number,
  progress: number, // 0 = fully "from", 1 = fully "to"
  type: TransitionType,
  fromIndex: number,
  toIndex: number
): void {
  // Ease the progress for smoother transitions
  const easedProgress = easeInOutCubic(progress);
  
  switch (type) {
    case 'crossfade':
      // Simple crossfade - most common and professional
      drawCrossfadeTransition(ctx, fromImg, toImg, width, height, easedProgress, fromIndex, toIndex);
      break;
      
    case 'slide':
      // Slide from right to left
      drawSlideTransition(ctx, fromImg, toImg, width, height, easedProgress, fromIndex, toIndex);
      break;
      
    case 'zoom':
      // Zoom out from current, zoom in to next
      drawZoomTransition(ctx, fromImg, toImg, width, height, easedProgress, fromIndex, toIndex);
      break;
    
    case 'wipe':
      // Horizontal wipe transition
      drawWipeTransition(ctx, fromImg, toImg, width, height, easedProgress, fromIndex, toIndex);
      break;
    
    case 'blur':
      // Blur out/in transition (simulated with scale)
      drawBlurTransition(ctx, fromImg, toImg, width, height, easedProgress, fromIndex, toIndex);
      break;
      
    default:
      // Fallback to simple crossfade
      drawCrossfadeTransition(ctx, fromImg, toImg, width, height, easedProgress, fromIndex, toIndex);
  }
}

/**
 * Easing function for smooth transitions
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Crossfade transition - blend two images with alpha
 */
function drawCrossfadeTransition(
  ctx: CanvasRenderingContext2D,
  fromImg: HTMLImageElement,
  toImg: HTMLImageElement,
  width: number,
  height: number,
  progress: number,
  fromIndex: number,
  toIndex: number
): void {
  // Draw "from" image at decreasing opacity
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  drawSplitImages(ctx, fromImg, width, height, 1.0, fromIndex);
  ctx.restore();
  
  // Draw "to" image at increasing opacity
  ctx.save();
  ctx.globalAlpha = progress;
  drawSplitImages(ctx, toImg, width, height, 0.0, toIndex);
  ctx.restore();
}

/**
 * Slide transition - new image slides in from right
 */
function drawSlideTransition(
  ctx: CanvasRenderingContext2D,
  fromImg: HTMLImageElement,
  toImg: HTMLImageElement,
  width: number,
  height: number,
  progress: number,
  fromIndex: number,
  toIndex: number
): void {
  const offset = width * (1 - progress);
  
  // Draw "from" image sliding left
  ctx.save();
  ctx.translate(-width * progress, 0);
  drawSplitImages(ctx, fromImg, width, height, 1.0, fromIndex);
  ctx.restore();
  
  // Draw "to" image sliding in from right
  ctx.save();
  ctx.translate(offset, 0);
  drawSplitImages(ctx, toImg, width, height, 0.0, toIndex);
  ctx.restore();
}

/**
 * Zoom transition - zoom out from current, zoom in to next
 */
function drawZoomTransition(
  ctx: CanvasRenderingContext2D,
  fromImg: HTMLImageElement,
  toImg: HTMLImageElement,
  width: number,
  height: number,
  progress: number,
  fromIndex: number,
  toIndex: number
): void {
  const centerX = width / 2;
  const centerY = height / 2;
  
  // Draw "from" image zooming out with fade
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  const fromScale = 1 + progress * 0.15; // Zoom out slightly
  ctx.translate(centerX, centerY);
  ctx.scale(fromScale, fromScale);
  ctx.translate(-centerX, -centerY);
  drawSplitImages(ctx, fromImg, width, height, 1.0, fromIndex);
  ctx.restore();
  
  // Draw "to" image zooming in with fade
  ctx.save();
  ctx.globalAlpha = progress;
  const toScale = 0.85 + progress * 0.15; // Start zoomed out, end at 1
  ctx.translate(centerX, centerY);
  ctx.scale(toScale, toScale);
  ctx.translate(-centerX, -centerY);
  drawSplitImages(ctx, toImg, width, height, 0.0, toIndex);
  ctx.restore();
}

/**
 * Wipe transition - horizontal wipe from left to right
 * Professional TV-style transition
 */
function drawWipeTransition(
  ctx: CanvasRenderingContext2D,
  fromImg: HTMLImageElement,
  toImg: HTMLImageElement,
  width: number,
  height: number,
  progress: number,
  fromIndex: number,
  toIndex: number
): void {
  // Draw "to" image full screen first (revealed part)
  drawSplitImages(ctx, toImg, width, height, 0.0, toIndex);
  
  // Draw "from" image with clipping (shrinking from right)
  ctx.save();
  const wipeX = width * (1 - progress);
  ctx.beginPath();
  ctx.rect(wipeX, 0, width - wipeX, height);
  ctx.clip();
  drawSplitImages(ctx, fromImg, width, height, 1.0, fromIndex);
  
  // Add a white edge line for visual polish
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(wipeX, 0);
  ctx.lineTo(wipeX, height);
  ctx.stroke();
  
  ctx.restore();
}

/**
 * Blur transition - simulated with rapid zoom and opacity
 * Creates a dreamy transition effect
 */
function drawBlurTransition(
  ctx: CanvasRenderingContext2D,
  fromImg: HTMLImageElement,
  toImg: HTMLImageElement,
  width: number,
  height: number,
  progress: number,
  fromIndex: number,
  toIndex: number
): void {
  const centerX = width / 2;
  const centerY = height / 2;
  
  // First half: "from" image zooms in and fades
  if (progress < 0.5) {
    const localProgress = progress * 2; // 0 to 1 in first half
    ctx.save();
    ctx.globalAlpha = 1 - localProgress;
    const scale = 1 + localProgress * 0.2; // Zoom in
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);
    drawSplitImages(ctx, fromImg, width, height, 1.0, fromIndex);
    ctx.restore();
    
    // Start fading in "to" at reduced opacity
    ctx.save();
    ctx.globalAlpha = localProgress * 0.5;
    drawSplitImages(ctx, toImg, width, height, 0.0, toIndex);
    ctx.restore();
  } else {
    // Second half: "to" image zooms out from large and fades in
    const localProgress = (progress - 0.5) * 2; // 0 to 1 in second half
    ctx.save();
    ctx.globalAlpha = 0.5 + localProgress * 0.5;
    const scale = 1.2 - localProgress * 0.2; // Start zoomed in, end at 1
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);
    drawSplitImages(ctx, toImg, width, height, 0.0, toIndex);
    ctx.restore();
  }
}

/**
 * Get the best supported video codec for recording
 * Prioritize H.264 (MP4) over VP8/VP9 (WebM) for Instagram compatibility
 */
function getBestCodec(): { mimeType: string; isMP4: boolean } {
  // Try MP4/H.264 first (best for Instagram)
  const mp4Codecs = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // H.264 Baseline + AAC
    'video/mp4;codecs=avc1.4D401E,mp4a.40.2', // H.264 Main + AAC
    'video/mp4;codecs=avc1.64001E,mp4a.40.2', // H.264 High + AAC
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];
  
  for (const codec of mp4Codecs) {
    if (MediaRecorder.isTypeSupported(codec)) {
      console.log(`[VideoEncoder] MP4 codec supported: ${codec}`);
      return { mimeType: codec, isMP4: true };
    }
  }
  
  // Fallback to WebM
  const webmCodecs = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  
  for (const codec of webmCodecs) {
    if (MediaRecorder.isTypeSupported(codec)) {
      console.log(`[VideoEncoder] WebM codec supported: ${codec}`);
      return { mimeType: codec, isMP4: false };
    }
  }
  
  return { mimeType: 'video/webm', isMP4: false };
}

/**
 * Generate video from images and audio
 * Returns a Blob of the video file
 */
export async function generateVideoFromSegments(
  options: VideoEncoderOptions
): Promise<Blob> {
  const {
    width = 1080,
    height = 1920,
    fps = 24,
    audioUrl,
    ctaAudioUrl,
    backgroundMusicUrl,
    segments,
    onProgress,
    brandName = "Neural Update",
    instagramHandle = "@neuralupdate",
  } = options;

  const ctaDuration = 6; // 6 seconds for marketing CTA at end

  console.log("[VideoEncoder] Starting video generation with branding...");
  console.log(`[VideoEncoder] Segments: ${segments.length}, FPS: ${fps}`);
  console.log("[VideoEncoder] Segment details:", segments.map((s, i) => ({
    index: i,
    duration: s.duration,
    hasImage: !!s.imageUrl,
    textPreview: s.text?.substring(0, 30) + "..."
  })));
  
  // Validate segments have content and duration
  const validSegments = segments.filter(s => s.imageUrl && s.duration > 0);
  if (validSegments.length === 0) {
    throw new Error("Nenhum segmento válido para gerar vídeo. Verifique se as imagens foram geradas.");
  }
  
  if (validSegments.length !== segments.length) {
    console.warn(`[VideoEncoder] ${segments.length - validSegments.length} segments filtered out (missing image or zero duration)`);
  }
  
  // Use validated segments
  const workingSegments = validSegments.length < segments.length 
    ? validSegments 
    : segments;
  console.log(`[VideoEncoder] Brand: ${brandName}, Handle: ${instagramHandle}`);
  console.log(`[VideoEncoder] Working with ${workingSegments.length} valid segments`);

  // Pre-load all images
  const imagePromises = workingSegments.map(async (seg, index) => {
    try {
      console.log(`[VideoEncoder] Loading image ${index + 1}/${workingSegments.length}`);
      return await loadImage(seg.imageUrl);
    } catch (error) {
      console.error(`Failed to load image for segment ${index}:`, error);
      const fallbackCanvas = document.createElement("canvas");
      fallbackCanvas.width = width;
      fallbackCanvas.height = height;
      const ctx = fallbackCanvas.getContext("2d")!;
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Cena ${index + 1}`, width / 2, height / 2);
      
      const img = new Image();
      img.src = fallbackCanvas.toDataURL();
      await new Promise(r => setTimeout(r, 100));
      return img;
    }
  });
  
  const images = await Promise.all(imagePromises);
  console.log(`[VideoEncoder] All ${images.length} images loaded`);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Calculate total duration (content + CTA) - ensure minimum duration
  const contentDuration = workingSegments.reduce((sum, seg) => sum + seg.duration, 0);
  if (contentDuration <= 0) {
    throw new Error(`Duração do conteúdo inválida: ${contentDuration}s. Verifique se os segmentos têm duração definida.`);
  }
  const totalDuration = contentDuration + ctaDuration;
  console.log(`[VideoEncoder] Content: ${contentDuration.toFixed(1)}s, CTA: ${ctaDuration}s, Total: ${totalDuration.toFixed(1)}s`);

  // Create video stream from canvas
  const stream = canvas.captureStream(fps);

  // Add audio tracks if available (main narration + CTA audio + background music)
  let audioElement: HTMLAudioElement | null = null;
  let ctaAudioElement: HTMLAudioElement | null = null;
  let musicAudioElement: HTMLAudioElement | null = null;
  let audioContext: AudioContext | null = null;
  let ctaAudioStarted = false;
  
  if (audioUrl || ctaAudioUrl || backgroundMusicUrl) {
    try {
      // 🔊 Use the pre-unlocked global AudioContext
      audioContext = await ensureAudioReady();
      console.log("[VideoEncoder] AudioContext state:", audioContext.state);
      
      const destination = audioContext.createMediaStreamDestination();
      
      // Load main narration audio
      if (audioUrl) {
        console.log("[VideoEncoder] Setting up main audio from:", audioUrl.substring(0, 50) + "...");
        audioElement = new Audio();
        audioElement.crossOrigin = "anonymous";
        audioElement.src = audioUrl;
        audioElement.volume = 1.0;
        
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            console.warn("[VideoEncoder] Audio load timeout, continuing without audio");
            resolve();
          }, 15000); // Increased timeout
          
          audioElement!.oncanplaythrough = () => {
            clearTimeout(timeout);
            console.log("[VideoEncoder] Main audio loaded, duration:", audioElement!.duration);
            resolve();
          };
          audioElement!.onerror = (e) => {
            clearTimeout(timeout);
            console.warn("[VideoEncoder] Audio load error:", e);
            resolve();
          };
          audioElement!.load();
        });

        // Only connect if audio loaded successfully
        if (audioElement.readyState >= 2) {
          try {
            const source = audioContext.createMediaElementSource(audioElement);
            source.connect(destination);
            // ⚠️ NÃO conectar a audioContext.destination - isso faz o áudio tocar nos alto-falantes
            // O áudio só deve estar no vídeo final, não reproduzido durante a renderização
            console.log("[VideoEncoder] Main audio connected to video stream only (not speakers)");
          } catch (e) {
            console.warn("[VideoEncoder] Could not connect audio source:", e);
          }
        }
      }
      
      // Load CTA audio
      if (ctaAudioUrl) {
        console.log("[VideoEncoder] Setting up CTA audio...");
        ctaAudioElement = new Audio();
        ctaAudioElement.crossOrigin = "anonymous";
        ctaAudioElement.src = ctaAudioUrl;
        ctaAudioElement.volume = 1.0;
        
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            console.warn("[VideoEncoder] CTA audio load timeout");
            resolve();
          }, 10000);
          
          ctaAudioElement!.oncanplaythrough = () => {
            clearTimeout(timeout);
            console.log("[VideoEncoder] CTA audio loaded, duration:", ctaAudioElement!.duration);
            resolve();
          };
          ctaAudioElement!.onerror = () => {
            clearTimeout(timeout);
            console.warn("[VideoEncoder] CTA audio load error");
            resolve();
          };
          ctaAudioElement!.load();
        });

        // Only connect if audio loaded successfully
        if (ctaAudioElement.readyState >= 2) {
          try {
            const ctaSource = audioContext.createMediaElementSource(ctaAudioElement);
            ctaSource.connect(destination);
            // ⚠️ NÃO conectar a audioContext.destination - áudio só no vídeo
            console.log("[VideoEncoder] CTA audio connected to video stream only (not speakers)");
          } catch (e) {
            console.warn("[VideoEncoder] Could not connect CTA audio source:", e);
          }
        }
      }
      
      // Load background music
      if (backgroundMusicUrl) {
        console.log("[VideoEncoder] Setting up background music...");
        musicAudioElement = new Audio();
        musicAudioElement.crossOrigin = "anonymous";
        musicAudioElement.src = backgroundMusicUrl;
        musicAudioElement.volume = 0.15; // Low volume for background
        musicAudioElement.loop = true; // Loop the music
        
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            console.warn("[VideoEncoder] Background music load timeout");
            resolve();
          }, 10000);
          
          musicAudioElement!.oncanplaythrough = () => {
            clearTimeout(timeout);
            console.log("[VideoEncoder] Background music loaded, duration:", musicAudioElement!.duration);
            resolve();
          };
          musicAudioElement!.onerror = () => {
            clearTimeout(timeout);
            console.warn("[VideoEncoder] Background music load error");
            resolve();
          };
          musicAudioElement!.load();
        });

        // Only connect if audio loaded successfully
        if (musicAudioElement.readyState >= 2) {
          try {
            const musicSource = audioContext.createMediaElementSource(musicAudioElement);
            // Create gain node for volume control
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 0.15; // Background volume
            musicSource.connect(gainNode);
            gainNode.connect(destination);
            console.log("[VideoEncoder] Background music connected to video stream");
          } catch (e) {
            console.warn("[VideoEncoder] Could not connect background music source:", e);
          }
        }
      }

      // Add combined audio track to stream
      const audioTracks = destination.stream.getAudioTracks();
      console.log("[VideoEncoder] Audio tracks available:", audioTracks.length);
      audioTracks.forEach(track => {
        stream.addTrack(track);
      });
    } catch (e) {
      console.warn("[VideoEncoder] Failed to add audio track:", e);
      audioElement = null;
      ctaAudioElement = null;
      musicAudioElement = null;
    }
  } else {
    console.log("[VideoEncoder] No audio URLs provided, generating video without audio");
  }

  // Get best available codec (prefer MP4 for Instagram)
  const { mimeType, isMP4 } = getBestCodec();
  console.log(`[VideoEncoder] Using codec: ${mimeType} (MP4: ${isMP4})`);

  // Try to create MediaRecorder with retry on different codecs
  let recorder: MediaRecorder;
  let actualMimeType = mimeType;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8000000,
    });
  } catch (e) {
    console.warn(`[VideoEncoder] Failed with codec ${mimeType}, trying fallback...`);
    // Fallback: try without specific codec
    const fallbackCodecs = ['video/webm;codecs=vp8', 'video/webm', ''];
    let created = false;
    for (const fallback of fallbackCodecs) {
      try {
        if (fallback && !MediaRecorder.isTypeSupported(fallback)) continue;
        recorder = new MediaRecorder(stream, fallback ? { mimeType: fallback, videoBitsPerSecond: 6000000 } : { videoBitsPerSecond: 6000000 });
        actualMimeType = fallback || 'video/webm';
        console.log(`[VideoEncoder] Fallback codec succeeded: ${actualMimeType}`);
        created = true;
        break;
      } catch { continue; }
    }
    if (!created) {
      throw new Error("Nenhum codec de vídeo suportado neste navegador.");
    }
  }

  const chunks: Blob[] = [];
  recorder!.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  return new Promise((resolve, reject) => {
    const maxTimeout = setTimeout(() => {
      console.error("[VideoEncoder] Generation timeout after 3 minutes");
      recorder!.stop();
      reject(new Error("Video generation timeout"));
    }, 180000);

    recorder!.onstop = async () => {
      clearTimeout(maxTimeout);
      console.log(`[VideoEncoder] Recording stopped, chunks: ${chunks.length}`);
      const rawBlob = new Blob(chunks, { type: actualMimeType });
      console.log(`[VideoEncoder] Raw blob size: ${(rawBlob.size / 1024 / 1024).toFixed(2)} MB, type: ${rawBlob.type}`);
      
      // FIX: Apply duration fix for WebM videos
      // MediaRecorder doesn't write duration metadata, causing "0 seconds" issue on mobile
      let finalBlob = rawBlob;
      if (!actualMimeType.includes('mp4')) {
        try {
          console.log(`[VideoEncoder] Fixing WebM duration metadata (${totalDuration.toFixed(1)}s)...`);
          finalBlob = await fixWebmDuration(rawBlob, totalDuration * 1000, { logger: false });
          console.log(`[VideoEncoder] Duration metadata fixed! Final size: ${(finalBlob.size / 1024 / 1024).toFixed(2)} MB`);
        } catch (fixError) {
          console.warn("[VideoEncoder] Could not fix duration metadata:", fixError);
          // Continue with raw blob if fix fails
        }
      }
      
      resolve(finalBlob);
    };

    recorder!.onerror = (e: Event) => {
      console.error("[VideoEncoder] Recorder error event:", e);
      // Don't reject immediately — some browsers fire error but still produce valid output
      // Only reject if we have no chunks at all
      if (chunks.length === 0) {
        clearTimeout(maxTimeout);
        reject(new Error("MediaRecorder error — nenhum dado gravado. Tente recarregar a página."));
      } else {
        console.warn("[VideoEncoder] Error fired but chunks exist, attempting to continue...");
      }
    };

    // Start recording
    recorder!.start(100);
    console.log("[VideoEncoder] Recording started");

    // Start audio if available
    if (audioElement) {
      audioElement.currentTime = 0;
      audioElement.play().catch(console.warn);
    }
    
    // Start background music at the beginning
    if (musicAudioElement) {
      musicAudioElement.currentTime = 0;
      musicAudioElement.play().catch(console.warn);
    }

    // Track timeline using performance.now() directly.
    // We use a START time and calculate elapsed from that.
    // The key insight: we want the VIDEO to be exactly totalDuration seconds.
    // If the browser throttles the tab, the animation will "jump" but the video
    // will still end at the correct total duration based on real wall-clock time.
    const startTime = performance.now();
    let lastProgress = 0;

    const animate = (now: number) => {
      // Calculate elapsed time from start (wall-clock time)
      const elapsed = (now - startTime) / 1000;

      // If we've reached total duration, stop recording
      if (elapsed >= totalDuration) {
        console.log("[VideoEncoder] Animation complete, stopping recorder. Final elapsed:", elapsed.toFixed(2), "s");
        if (audioElement) {
          audioElement.pause();
        }
        if (ctaAudioElement) {
          ctaAudioElement.pause();
        }
        if (musicAudioElement) {
          musicAudioElement.pause();
        }
        // ⚠️ NÃO fechar o AudioContext global - ele é reutilizado
        recorder!.stop();
        return;
      }

      // Start CTA audio when entering CTA phase
      if (elapsed >= contentDuration && !ctaAudioStarted && ctaAudioElement) {
        ctaAudioStarted = true;
        console.log("[VideoEncoder] Starting CTA audio at", elapsed.toFixed(2), "s");
        ctaAudioElement.currentTime = 0;
        ctaAudioElement.play().catch(console.warn);
      }

      // Render current frame with watermark and CTA support
      renderFrame(
        ctx, width, height, workingSegments, images,
        elapsed, totalDuration, ctaDuration,
        brandName, instagramHandle
      );

      const progress = Math.round((elapsed / totalDuration) * 100);
      if (progress !== lastProgress) {
        lastProgress = progress;
        onProgress?.(progress);
      }

      requestAnimationFrame(animate);
    };

    console.log("[VideoEncoder] Starting animation loop, target duration:", totalDuration.toFixed(2), "s");
    requestAnimationFrame(animate);
  });
}

/**
 * Convert WebM blob to base64 data URL
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload video blob to Supabase storage
 * Determines format from blob type
 */
export async function uploadVideoToStorage(
  blob: Blob,
  supabase: any,
  bucketName: string = "post-videos"
): Promise<string> {
  const isMP4 = blob.type.includes('mp4');
  const format = isMP4 ? 'mp4' : 'webm';
  
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 10);
  const fileName = `cinematic-${timestamp}-${randomId}.${format}`;

  console.log(`[VideoEncoder] Uploading ${format} video: ${fileName} (type: ${blob.type})`);

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(fileName, blob, {
      contentType: blob.type || (isMP4 ? "video/mp4" : "video/webm"),
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);

  console.log(`[VideoEncoder] Upload complete: ${publicUrlData.publicUrl}`);
  return publicUrlData.publicUrl;
}
