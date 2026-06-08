/**
 * ═══════════════════════════════════════════════════════════════
 * VIDEO PIPELINE — CONFIGURAÇÃO CENTRAL (ÚNICA FONTE DE VERDADE)
 * ═══════════════════════════════════════════════════════════════
 * 
 * ATENÇÃO: Este arquivo controla TODOS os parâmetros de vídeo.
 * Qualquer mudança aqui afeta: chat do agente, auto-render, 
 * criação direta e edge functions.
 * 
 * NÃO duplique estas constantes em outros arquivos.
 * Importe sempre daqui: import { VIDEO_CONFIG } from '@/lib/video-config'
 */

export const VIDEO_CONFIG = {
  // ─── Estrutura do Script ────────────────────────────
  /** Número de segmentos (cenas) por vídeo — Reels enxuto de até 40s */
  SEGMENT_COUNT: 5,
  /** Duração base de cada segmento em segundos (estimativa; áudio define a real) */
  SEGMENT_DURATION_BASE: 5,
  /** Palavras por segmento — menos = mais rítmico, prende atenção */
  WORDS_PER_SEGMENT: 11,

  // ─── Limites de Segurança ──────────────────────────
  /** Duração mínima de um segmento (segundos) */
  MIN_SEGMENT_DURATION: 3,
  /** Duração máxima esperada de um segmento */
  MAX_SEGMENT_DURATION: 9,
  /** Máximo de segmentos por vídeo */
  MAX_SEGMENTS: 6,
  /** Duração total máxima (conteúdo + CTA) — Reels curtos performam melhor */
  MAX_TOTAL_DURATION: 40,
  /** Buffer extra de timeout para renderização (segundos) */
  RENDER_TIMEOUT_BUFFER: 10,

  // ─── Renderização Visual ──────────────────────────
  WIDTH: 720,
  HEIGHT: 1280,
  FPS: 24,
  /** Duração do crossfade entre imagens (segundos) — curto pra ficar ágil */
  TRANSITION_DURATION: 0.45,
  /** Duração do efeito hook no primeiro segmento (segundos) */
  HOOK_DURATION: 3.0,
  /** Bitrate do vídeo WebM (bps) */
  VIDEO_BITRATE: 3_000_000,

  // ─── CTA ──────────────────────────────────────────
  /** Duração mínima do CTA (segundos) */
  CTA_MIN_DURATION: 3.5,
  /** Duração máxima do CTA (segundos) */
  CTA_MAX_DURATION: 5,

  // ─── Áudio ────────────────────────────────────────
  /** Volume da narração principal (0-1) */
  NARRATION_VOLUME: 1.0,
  /** Volume do áudio CTA (0-1) */
  CTA_VOLUME: 0.9,
  /** Volume da trilha sonora COM narração (0-1) */
  MUSIC_VOLUME_WITH_NARRATION: 0.22,
  /** Volume da trilha sonora SEM narração (0-1) */
  MUSIC_VOLUME_WITHOUT_NARRATION: 0.45,
  /** Duração do fade-out da trilha (segundos antes do fim) */
  MUSIC_FADEOUT_SECONDS: 3,
  /** Gap entre narração e CTA (segundos) */
  NARRATION_CTA_GAP: 0.3,

  // ─── Branding ─────────────────────────────────────
  BRAND_NAME: 'Neural Update',
  BRAND_SUBTITLE: 'IA • Tecnologia • Futuro',
  BRAND_COLOR_PRIMARY: '#7B2CFF',
  BRAND_COLOR_ACCENT: '#a855f7',
  BRAND_COLOR_BG: '#0B0F1A',
  BRAND_COLOR_BG_DARK: '#1a1040',

  // ─── TTS ──────────────────────────────────────────
  /** Voz padrão: Thalita (Microsoft Edge Neural, 100% grátis, PT-BR natural) */
  DEFAULT_VOICE: 'thalita',
  /** Voz ElevenLabs Sarah (fallback) */
  ELEVENLABS_VOICE_ID: 'EXAVITQu4vr4xnSDxMaL',
  ELEVENLABS_MODEL: 'eleven_turbo_v2_5',

  // ─── Script Generation ────────────────────────────
  SCRIPT_STYLE: 'gancho explosivo nos primeiros 3 segundos, ritmo acelerado, frases curtas e diretas',
} as const;

/** Tipo para acesso tipado */
export type VideoConfig = typeof VIDEO_CONFIG;
