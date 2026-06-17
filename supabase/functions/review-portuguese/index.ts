import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * REVISOR DE PORTUGUÊS BRASILEIRO
 * 
 * Regra: "IA pensa o texto. Código escreve o texto."
 * 
 * Este serviço REVISA e CORRIGE textos antes de serem renderizados
 * programaticamente (Canvas, SVG, CSS). Assim, o texto final é 100%
 * correto porque foi revisado por IA especialista e escrito por código.
 * 
 * Usa: google/gemini-2.5-flash-lite (mais rápido e barato para tarefas simples)
 */

interface ReviewRequest {
  text: string;           // Texto a revisar
  type?: 'headline' | 'caption' | 'script' | 'cta' | 'general';
  maxLength?: number;     // Limite de caracteres (opcional)
  context?: string;       // Contexto adicional para a revisão
}

interface ReviewResponse {
  success: boolean;
  original: string;
  corrected: string;
  wasModified: boolean;
  corrections?: string[];  // Lista de correções feitas
  error?: string;
}

// ─── Corretor determinístico PT-BR (SEM IA, SEM crédito) ───
// Conserta os erros de acento mais comuns em vocabulário de tech/notícias.
// Roda SEMPRE como baseline — garante PT decente mesmo se a IA falhar (ex.:
// créditos esgotados). Palavra inteira, preservando MAIÚSCULA/Capitalização.
const PT_ACCENT_FIXES: Record<string, string> = {
  inteligencia: "inteligência", tecnologico: "tecnológico", tecnologia: "tecnologia",
  lancamento: "lançamento", lancou: "lançou", lanca: "lança",
  revolucao: "revolução", revolucionar: "revolucionar",
  analise: "análise", analises: "análises", usuario: "usuário", usuarios: "usuários",
  experiencia: "experiência", inovacao: "inovação", inovacoes: "inovações",
  bilhoes: "bilhões", milhoes: "milhões", bilhao: "bilhão", milhao: "milhão",
  voce: "você", video: "vídeo", videos: "vídeos", audio: "áudio",
  codigo: "código", codigos: "códigos", grafico: "gráfico", graficos: "gráficos",
  automatico: "automático", automatica: "automática", estrategia: "estratégia",
  proprio: "próprio", propria: "própria", ultimo: "último", ultima: "última",
  proximo: "próximo", proxima: "próxima", rapido: "rápido", rapida: "rápida",
  facil: "fácil", dificil: "difícil", possivel: "possível", impossivel: "impossível",
  nivel: "nível", numero: "número", numeros: "números", publico: "público",
  politica: "política", ciencia: "ciência", eficiencia: "eficiência",
  referencia: "referência", tendencia: "tendência", consequencia: "consequência",
  seguranca: "segurança", mudanca: "mudança", mudancas: "mudanças",
  avanco: "avanço", avancos: "avanços", comeco: "começo", servico: "serviço",
  servicos: "serviços", preco: "preço", precos: "preços", decisao: "decisão",
  versao: "versão", versoes: "versões", geracao: "geração", geracoes: "gerações",
  criacao: "criação", automacao: "automação", aplicacao: "aplicação",
  aplicacoes: "aplicações", informacao: "informação", informacoes: "informações",
  programacao: "programação", padrao: "padrão", padroes: "padrões",
  amanha: "amanhã", nao: "não", entao: "então", tambem: "também", alem: "além",
  porem: "porém", ninguem: "ninguém", alguem: "alguém", historia: "história",
  memoria: "memória", industria: "indústria", maquina: "máquina", maquinas: "máquinas",
  pagina: "página", paginas: "páginas", robo: "robô", robos: "robôs",
  unico: "único", unica: "única", obvio: "óbvio", logica: "lógica",
  metrica: "métrica", metricas: "métricas", dolar: "dólar", dolares: "dólares",
  modelos: "modelos", algoritmo: "algoritmo", privacidade: "privacidade",
};

function applyCasePattern(original: string, replacement: string): string {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function localPtBrFix(text: string): string {
  return text.replace(/[A-Za-zÀ-ÿ]+/g, (word) => {
    const key = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const fix = PT_ACCENT_FIXES[key];
    return fix ? applyCasePattern(word, fix) : word;
  });
}

// Sistema de prompt para revisão de português
function buildReviewPrompt(text: string, type: string, maxLength?: number, context?: string): string {
  const typeInstructions: Record<string, string> = {
    headline: `Este é um HEADLINE/TÍTULO para post de notícias de tecnologia.
- Deve ser impactante e curto (máximo 10 palavras)
- Use LETRAS MAIÚSCULAS se apropriado para impacto
- Máximo 2 linhas
- SEMPRE traduzir "AI" para "IA"
- VERIFICAR TODOS os acentos: é, ê, á, ã, õ, ç, ü
- Erros frequentes: "Inteligencia"→"Inteligência", "lancamento"→"lançamento", "revolucao"→"revolução", "analise"→"análise"`,
    caption: `Esta é uma LEGENDA COMPLETA para Instagram (pode ter 800 a 1500 caracteres, 3 a 4 parágrafos).
- Tom envolvente e conversacional
- PRESERVE TODOS os parágrafos, quebras de linha, emojis e hashtags exatamente como estão
- PRESERVE a linha "📰 Fonte: ..." se existir
- NÃO encurte o texto, NÃO resuma, NÃO remova parágrafos — só corrija ortografia/gramática
- Mantenha o tamanho final muito próximo do original (apenas correções pontuais)`,
    script: `Este é um SCRIPT de narração para vídeo.
- Tom natural e fluido para leitura em voz alta
- Frases curtas e claras
- Ritmo adequado para TTS`,
    cta: `Este é um CALL-TO-ACTION (chamada para ação).
- Curto e direto
- Imperativo ou convidativo
- Ex: "ARRASTE PARA MAIS", "SAIBA MAIS", "COMPARTILHE"`,
    general: `Texto geral para uso em mídia social.`
  };

  const basePrompt = `Você é um REVISOR ESPECIALISTA em Português Brasileiro (PT-BR).

TAREFA: Revisar e corrigir o texto abaixo, retornando APENAS o texto corrigido.

TIPO DE CONTEÚDO:
${typeInstructions[type] || typeInstructions.general}

${context ? `CONTEXTO ADICIONAL:\n${context}\n` : ''}
${maxLength ? `LIMITE: Máximo ${maxLength} caracteres.\n` : ''}

REGRAS DE CORREÇÃO:
1. ORTOGRAFIA: Corrija todos os erros de digitação e ortografia
2. ACENTUAÇÃO: Aplique acentos corretamente (é, ê, ã, õ, ç, etc.)
3. GRAMÁTICA: Corrija concordância verbal e nominal
4. TRADUÇÃO TÉCNICA:
   - "AI" → "IA" (Inteligência Artificial)
   - "Machine Learning" → "Aprendizado de Máquina" ou "ML"
   - Mantenha siglas conhecidas: GPT, API, etc.
5. ANO: Estamos em 2026, não mencione anos anteriores como "atual"
6. CLAREZA: Se algo estiver confuso, melhore a redação mantendo o sentido

FORMATO DE RESPOSTA:
- Retorne SOMENTE o texto corrigido
- NÃO inclua explicações, comentários ou formatação
- NÃO use aspas, markdown ou prefixos
- Se o texto já estiver correto, retorne-o exatamente como está

TEXTO PARA REVISAR:
${text}

TEXTO CORRIGIDO:`;

  return basePrompt;
}

// Extrai texto limpo da resposta da IA
function extractCleanText(response: string): string {
  let cleaned = response.trim();
  
  // Remove markdown code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
  
  // Remove aspas envolventes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  
  // Remove prefixos comuns
  const prefixes = [
    'Texto corrigido:',
    'Correção:',
    'Resultado:',
    'Resposta:',
    'Aqui está:',
  ];
  for (const prefix of prefixes) {
    if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
      cleaned = cleaned.slice(prefix.length).trim();
    }
  }
  
  return cleaned.trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ReviewRequest = await req.json();
    const { text, type = 'general', maxLength, context } = body;

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Texto é obrigatório",
          original: text || '',
          corrected: text || '',
          wasModified: false
        } as ReviewResponse),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Texto muito curto ou só espaços - retornar como está
    if (text.trim().length < 3) {
      return new Response(
        JSON.stringify({
          success: true,
          original: text,
          corrected: text,
          wasModified: false
        } as ReviewResponse),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Baseline determinístico: corrige acentos comuns SEM IA. Usado em todos os
    // fallbacks pra que, mesmo sem créditos, a headline não saia com erro de PT.
    const baseline = localPtBrFix(text);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.warn("[review-portuguese] Sem API key — aplicando correção local determinística");
      return new Response(
        JSON.stringify({
          success: true,
          original: text,
          corrected: baseline,
          wasModified: baseline !== text
        } as ReviewResponse),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[review-portuguese] Reviewing ${type}: "${text.substring(0, 50)}..."`);

    const prompt = buildReviewPrompt(text, type, maxLength, context);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash", // Flash: mais preciso para revisão ortográfica
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1, // Baixa para consistência
        // 4096 tokens cobre legendas profundas (até ~1500 chars / ~700 tokens) com folga.
        // O bug anterior (max_tokens: 500) cortava legendas no meio da palavra.
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[review-portuguese] API error:", response.status, errorText);

      // Fallback: correção local determinística (créditos esgotados, etc.)
      return new Response(
        JSON.stringify({
          success: true,
          original: text,
          corrected: baseline,
          wasModified: baseline !== text,
          error: `API error: ${response.status} (usando correção local)`
        } as ReviewResponse),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const rawResponse = choice?.message?.content || text;
    const finishReason = choice?.finish_reason;
    const corrected = extractCleanText(rawResponse);

    // 🛡️ GUARDA ANTI-TRUNCAMENTO: se a IA cortou a resposta (finish_reason=length)
    // OU se o texto revisado é significativamente menor que o original (>30% perdido),
    // descarta a "correção" e retorna o original. Revisão ortográfica raramente
    // reduz texto em mais de 30% — quando reduz, é truncamento.
    const wasTruncated = finishReason === 'length' || finishReason === 'MAX_TOKENS';
    const lostTooMuch = corrected.length < text.length * 0.7;
    if (wasTruncated || lostTooMuch) {
      console.warn(`[review-portuguese] ⚠️ Truncamento detectado (finish=${finishReason}, original=${text.length}, corrigido=${corrected.length}). Usando correção local.`);
      return new Response(
        JSON.stringify({
          success: true,
          original: text,
          corrected: baseline,
          wasModified: baseline !== text,
          error: `truncated_response (finish_reason=${finishReason})`,
        } as ReviewResponse),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se houve mudança significativa
    const wasModified = corrected.toLowerCase().trim() !== text.toLowerCase().trim();

    // Rede de segurança: passa o resultado da IA pelo corretor local também
    // (idempotente — pega qualquer acento comum que a IA tenha deixado passar).
    let finalText = localPtBrFix(corrected);
    if (maxLength && finalText.length > maxLength) {
      // Truncar de forma inteligente (não cortar palavras)
      finalText = finalText.substring(0, maxLength);
      const lastSpace = finalText.lastIndexOf(' ');
      if (lastSpace > maxLength * 0.8) {
        finalText = finalText.substring(0, lastSpace);
      }
      finalText = finalText.trim();
      if (!finalText.endsWith('.') && !finalText.endsWith('!') && !finalText.endsWith('?')) {
        finalText += '...';
      }
    }

    console.log(`[review-portuguese] ✅ Reviewed: "${text.substring(0, 30)}..." → "${finalText.substring(0, 30)}..."`);

    return new Response(
      JSON.stringify({
        success: true,
        original: text,
        corrected: finalText,
        wasModified
      } as ReviewResponse),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[review-portuguese] Error:", error);
    
    // Em caso de erro, aplicar correção local pra não soltar PT errado
    const text = (await req.json().catch(() => ({ text: '' }))).text || '';
    const fixed = text ? localPtBrFix(text) : '';

    return new Response(
      JSON.stringify({
        success: true,
        original: text,
        corrected: fixed,
        wasModified: fixed !== text,
        error: error.message || "Erro ao revisar texto (usando correção local)"
      } as ReviewResponse),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
