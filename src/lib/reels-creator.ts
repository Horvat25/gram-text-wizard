/**
 * ═══════════════════════════════════════════════════════════════
 * CRIAÇÃO DE REELS 100% CLIENT-SIDE
 * ═══════════════════════════════════════════════════════════════
 *
 * Por que existe: as Edge Functions do Lovable Cloud não são
 * redeployadas via GitHub push — o agent-chat do servidor ficou
 * congelado com templates antigos ("não é só mais uma notícia...").
 * O frontend deploya com confiança via Publish, então TODO o fluxo
 * de criação mora aqui:
 *
 *   chat → intercepta pedido de Reels → roteiro (generate-story-script
 *   com tema ENRIQUECIDO) → legenda (generate-caption idem) → imagens
 *   do banco Neural Update → insert do post → render com Neural Voice.
 *
 * O conhecimento de IA viaja NO PAYLOAD (tema enriquecido), então até
 * funções antigas escrevem conteúdo informado.
 */

import { supabase } from "@/integrations/supabase/client";
import { pickLocalImageBankImages } from "@/lib/local-image-bank";
import { VIDEO_CONFIG } from "@/lib/video-config";

// ─── Detecção de intenção (mesma regra do antigo fast path do servidor) ───
export function isReelsRequest(message: string): boolean {
  const normalized = message
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const wantsCreate = /(cria|crie|faz|faca|gera|gere|monta|monte|produz|prepare|posta|publique|publica|coloca|bota|deixa)/.test(normalized);
  const wantsVideo = /(reels?|video|videos|shorts?|stories?)/.test(normalized);
  const isMarketing = /(marketing|afiliad)/.test(normalized);
  return wantsCreate && wantsVideo && !isMarketing;
}

export function extractReelsTopic(message: string): string {
  const topicMatch = message.match(/(?:sobre|tema|assunto)\s+(.+)$/i);
  const rawTopic = topicMatch?.[1]
    || message
      .replace(/^(cria|crie|faz|faca|gera|gere|monta|monte|produz|prepare|posta|publique|publica|coloca|bota|deixa)\s+/i, "")
      .replace(/\b(um|uma|o|os|a|as|pra mim|para mim|na fila|já|ja|agora|por favor|renderizar|renderiza|gerar)\b/gi, " ")
      .replace(/\b(reels?|vídeo|video|videos|shorts?|stories?)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  return rawTopic || "tecnologia e inteligência artificial";
}

export function wantsImmediatePublish(message: string): boolean {
  const normalized = message
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return /(poste|postar|publica|publique|publicar)/.test(normalized);
}

// ─── Conhecimento de IA 2026 — viaja no payload para as funções ───
const MODEL_KNOWLEDGE: Array<{ pattern: RegExp; context: string }> = [
  {
    pattern: /fable\s*5|fable\s*da\s*anthropic/i,
    context: "Fable 5 é o modelo de IA MAIS INTELIGENTE da Anthropic (criadora do Claude), lançado em 2026 como o novo flagship acima da linha Opus. Salto em raciocínio profundo, agentes autônomos e tarefas longas. NÃO é videogame — é o assunto do momento em inteligência artificial.",
  },
  {
    pattern: /opus\s*4|claude\s*opus/i,
    context: "Claude Opus 4.8 é o flagship da família Claude 4.x da Anthropic, voltado a raciocínio complexo e programação.",
  },
  {
    pattern: /sonnet\s*4|claude\s*sonnet/i,
    context: "Claude Sonnet 4.6 é o modelo da Anthropic que equilibra inteligência e custo, muito usado em produtos.",
  },
  {
    pattern: /haiku/i,
    context: "Claude Haiku 4.5 é o modelo rápido e econômico da Anthropic para alto volume.",
  },
  {
    pattern: /claude\s*code/i,
    context: "Claude Code é o agente de programação da Anthropic (CLI, desktop, web e IDEs), referência em coding agents.",
  },
  {
    pattern: /anthropic|claude/i,
    context: "Anthropic é a empresa de IA criadora da família de modelos Claude; em 2026 seu modelo mais avançado é o Fable 5.",
  },
];

export function enrichTopicWithKnowledge(topic: string): string {
  for (const { pattern, context } of MODEL_KNOWLEDGE) {
    if (pattern.test(topic)) {
      return `${topic} (CONTEXTO FACTUAL OBRIGATÓRIO: ${context} Não invente números, preços ou benchmarks — fale do impacto prático.)`;
    }
  }
  return topic;
}

// ─── Roteiro: generate-story-script (função genérica, deployada) ───
interface ScriptSegment {
  text: string;
  imagePrompt: string;
  imageUrl?: string;
  duration?: number;
}

async function generateScript(enrichedTopic: string): Promise<{ title: string; segments: ScriptSegment[] }> {
  try {
    const { data, error } = await supabase.functions.invoke("generate-story-script", {
      body: {
        topic: enrichedTopic,
        segmentCount: VIDEO_CONFIG.SEGMENT_COUNT,
        wordsPerSegment: VIDEO_CONFIG.WORDS_PER_SEGMENT,
        totalDuration: VIDEO_CONFIG.MAX_TOTAL_DURATION,
        style: VIDEO_CONFIG.SCRIPT_STYLE,
        brandName: VIDEO_CONFIG.BRAND_NAME,
      },
    });
    if (!error && data?.segments?.length >= 3) {
      return {
        title: data.title || enrichedTopic.split("(")[0].trim(),
        segments: data.segments.slice(0, VIDEO_CONFIG.SEGMENT_COUNT),
      };
    }
    console.warn("[reels-creator] generate-story-script falhou, usando roteiro local", error || data);
  } catch (e) {
    console.warn("[reels-creator] generate-story-script erro:", e);
  }

  // Fallback local NEUTRO (sem clichês fixos) — só usado se a função falhar
  const cleanTopic = enrichedTopic.split("(")[0].trim();
  return {
    title: cleanTopic,
    segments: [
      { text: `${cleanTopic}: isso muda o jogo agora.`, imagePrompt: `${cleanTopic} dramatic tech reveal, cinematic vertical 9:16, no text` },
      { text: `O anúncio pegou o mercado de surpresa.`, imagePrompt: `technology market reaction, newsroom energy, vertical 9:16, no text` },
      { text: `Na prática, isso afeta quem usa tecnologia todo dia.`, imagePrompt: `people using technology daily life, realistic, vertical 9:16, no text` },
      { text: `Especialistas já apontam o próximo passo dessa corrida.`, imagePrompt: `tech experts analyzing data, modern office, vertical 9:16, no text` },
      { text: `A análise completa está no blog Neural Update.`, imagePrompt: `premium tech editorial desk, cinematic, vertical 9:16, no text` },
    ],
  };
}

// ─── Legenda: generate-caption com tema enriquecido ───
async function generateCaption(enrichedTopic: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("generate-caption", {
      body: { topic: enrichedTopic, postType: "noticia", mediaType: "reel" },
    });
    if (!error && typeof data?.caption === "string" && data.caption.length > 50) {
      return data.caption;
    }
  } catch (e) {
    console.warn("[reels-creator] generate-caption erro:", e);
  }
  return null;
}

// ─── Criação completa ───
export interface CreateReelsResult {
  postId: string;
  title: string;
  sceneCount: number;
  imagesFromBank: number;
}

export async function createReelsClientSide(options: {
  message: string;
  userId: string;
  workspaceId: string;
}): Promise<CreateReelsResult> {
  const topic = extractReelsTopic(options.message);
  const publishNow = wantsImmediatePublish(options.message);
  const enrichedTopic = enrichTopicWithKnowledge(topic);

  // 1. Roteiro + legenda em paralelo (legenda não depende do roteiro)
  const [script, caption] = await Promise.all([
    generateScript(enrichedTopic),
    generateCaption(enrichedTopic),
  ]);

  // 2. Imagens do banco Neural Update (client-side, manifesto local)
  const imageQuery = [topic, ...script.segments.map(s => `${s.text} ${s.imagePrompt}`)].join(" ");
  const bankImages = await pickLocalImageBankImages(imageQuery, script.segments.length);
  bankImages.forEach((asset, index) => {
    if (index < script.segments.length) {
      script.segments[index].imageUrl = asset.url;
    }
  });

  // 3. Post direto no Supabase (RLS do workspace permite — mesmo caminho do usePosts)
  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      caption: caption || `🎬 ${script.title}`,
      hashtags: [],
      post_type: "noticia",
      status: "draft",
      media_type: "reels",
      platforms: ["instagram"],
      image_url: bankImages[0]?.url || null,
      carousel_images: bankImages.map(a => a.url),
      user_id: options.userId,
      workspace_id: options.workspaceId,
      overlay_metadata: {
        type: "narrated_video",
        pipeline: "client-direct",
        render_status: "assets_ready",
        needs_processing: true,
        created_by_agent: true,
        publish_after_render: publishNow,
        topic,
        script: {
          title: script.title,
          segments: script.segments.map(s => ({
            text: s.text,
            imagePrompt: s.imagePrompt,
            imageUrl: s.imageUrl || null,
            duration: 5,
          })),
          segmentCount: script.segments.length,
          totalDuration: script.segments.length * 5,
        },
      },
    } as any)
    .select()
    .single();

  if (error || !post) {
    throw new Error(error?.message || "Falha ao criar o post do Reels");
  }

  return {
    postId: (post as any).id,
    title: script.title,
    sceneCount: script.segments.length,
    imagesFromBank: bankImages.length,
  };
}
