// ============================================================
// IMAGE RELEVANCE ENGINE — Heuristic, Zero AI Cost
// Used by: search-images-for-video, agent-chat
// ============================================================

export interface ImageCandidate {
  url: string;
  sourceId: string;
  source?: string;
  description?: string;    // Pexels: p.alt | Unsplash: p.description
  altDescription?: string; // Unsplash: p.alt_description
  tags?: string[];         // Unsplash: p.tags[].title
  score?: number;
  query?: string;
}

// ─── Tech entity dictionary ──────────────────────────────────
// Maps lowercase keywords → visual search terms in English
const TECH_ENTITY_MAP: Record<string, string[]> = {
  'openai':      ['openai', 'chatgpt', 'gpt'],
  'chatgpt':     ['chatgpt', 'openai'],
  'gpt':         ['gpt', 'openai'],
  'claude':      ['anthropic', 'claude', 'ai'],
  'anthropic':   ['anthropic', 'claude', 'ai'],
  'gemini':      ['google', 'gemini', 'ai'],
  'bard':        ['google', 'bard', 'ai'],
  'copilot':     ['microsoft', 'copilot'],
  'meta':        ['meta', 'facebook'],
  'llama':       ['meta', 'llama', 'ai'],
  'nvidia':      ['nvidia', 'gpu'],
  'tesla':       ['tesla', 'electric vehicle'],
  'spacex':      ['spacex', 'rocket', 'space'],
  'apple':       ['apple', 'iphone', 'mac'],
  'microsoft':   ['microsoft', 'azure', 'windows'],
  'google':      ['google', 'alphabet'],
  'amazon':      ['amazon', 'aws', 'cloud'],
  'deepmind':    ['deepmind', 'google', 'ai research'],
  'mistral':     ['mistral', 'ai model', 'server'],
  'xai':         ['xai', 'grok', 'ai'],
  'grok':        ['grok', 'xai', 'ai'],
  'robot':       ['robot', 'humanoid'],
  'humanoid':    ['humanoid', 'robot'],
  'quantum':     ['quantum', 'computer', 'laboratory'],
  'chip':        ['chip', 'semiconductor', 'wafer'],
  'bitcoin':     ['bitcoin', 'cryptocurrency', 'blockchain'],
  'blockchain':  ['blockchain', 'crypto', 'network'],
  'h100':        ['nvidia', 'h100', 'gpu', 'data center'],
  'rtx':         ['nvidia', 'rtx', 'gpu', 'graphics card'],
  'arm':         ['arm', 'semiconductor', 'chip'],
  'intel':       ['intel', 'chip', 'processor'],
  'samsung':     ['samsung', 'display', 'semiconductor'],
  'huawei':      ['huawei', 'technology'],
  'colossus':    ['data center', 'server rack', 'supercomputer'],
  'sora':        ['ai video', 'generated video', 'ai animation'],
  'sam altman':  ['openai', 'artificial intelligence', 'tech ceo'],
  'elon musk':   ['spacex', 'tesla', 'tech', 'electric vehicle'],
  'mark zuckerberg': ['meta', 'facebook', 'social media'],
  'sundar pichai': ['google', 'alphabet', 'ai'],
};

// Generic words to skip during entity extraction
const GENERIC_WORDS = new Set([
  'the', 'new', 'this', 'that', 'with', 'from', 'for', 'and', 'are', 'has',
  'was', 'will', 'can', 'its', 'not', 'more', 'says', 'said', 'update',
  'latest', 'first', 'last', 'now', 'after', 'over', 'about', 'how', 'why',
  'what', 'when', 'which', 'also', 'just', 'even', 'than', 'their', 'have',
  'been', 'made', 'make', 'year', 'time', 'report', 'model', 'launch',
  'release', 'announce', 'reveal', 'share', 'show', 'get', 'use', 'way',
  'nova', 'novo', 'com', 'para', 'que', 'uma', 'por', 'dos', 'das', 'del',
  'las', 'los', 'sua', 'seu', 'são', 'foi', 'ser', 'está', 'como', 'mas',
]);

// ─── Forbidden visual terms for tech content ─────────────────
export const FORBIDDEN_TERMS = [
  'woman', 'man', 'girl', 'boy',
  'fashion', 'beauty', 'fitness', 'body',
  'sexy', 'posing', 'sensual', 'attractive', 'glamour', 'bikini',
  'wedding', 'party', 'celebration', 'lifestyle', 'influencer',
  'makeup', 'hairstyle', 'dress', 'outfit', 'smiling person',
  'people smiling', 'couple', 'children', 'baby', 'crowd',
  'stock photo person', 'business person smiling',
];

// Marketing CDNs that serve company ads/people photos for tech topics
export const MARKETING_CDNS = [
  'prismic.io',
  'cdn.sanity.io',
  'images.ctfassets.net',
  'assets.anthropic.com',
  'images.openai.com',
  'cdn.openai.com',
  'storage.googleapis.com/openai',
  '/og-image',
  '/social-card',
  '/social-share',
  '/opengraph',
  '/hero-image',
  '/marketing/',
  '/ads/',
  '/blog-images/',
  '/press-release/',
];

// ─── ETAPA 1: Entity Extraction ──────────────────────────────
export function extractEntities(title: string): string[] {
  const entities: string[] = [];
  const titleLower = title.toLowerCase();

  // 1. Match known tech entity dictionary
  for (const [key, values] of Object.entries(TECH_ENTITY_MAP)) {
    if (titleLower.includes(key)) {
      entities.push(...values);
    }
  }

  // 2. Capitalized proper nouns (OpenAI, Nvidia, Tesla, Microsoft...)
  const capitalMatches = title.match(/\b[A-Z][a-zA-Záéíóú]{2,}\b/g) || [];
  for (const word of capitalMatches) {
    const lower = word.toLowerCase();
    if (!GENERIC_WORDS.has(lower) && !entities.includes(lower)) {
      entities.push(lower);
    }
  }

  // 3. Tokens with numbers (H100, GPT-4, M3, RTX4090, Colossus-100k)
  const numericTokens = title.match(/\b[A-Za-z]+[\s-]?\d+[A-Za-z]*\b/g) || [];
  for (const token of numericTokens) {
    const lower = token.toLowerCase();
    if (!entities.includes(lower)) entities.push(lower);
  }

  // Deduplicate, limit to 8 most relevant
  return [...new Set(entities)].slice(0, 8);
}

// ─── ETAPA 2: Forbidden Content Check ───────────────────────
// Returns true if image should be DISCARDED
export function containsForbidden(candidate: ImageCandidate, entities: string[]): boolean {
  const url = (candidate.url || '').toLowerCase();

  // Marketing CDN check (no exceptions — these are always company ads)
  if (MARKETING_CDNS.some(cdn => url.includes(cdn))) {
    console.log(`[engine] ⛔ Marketing CDN rejected: ${url.substring(0, 70)}`);
    return true;
  }

  const searchText = [
    url,
    (candidate.description || '').toLowerCase(),
    (candidate.altDescription || '').toLowerCase(),
    ...(candidate.tags || []).map(t => t.toLowerCase()),
  ].join(' ');

  for (const term of FORBIDDEN_TERMS) {
    if (searchText.includes(term)) {
      // Exception: if a strong tech entity is also present
      // e.g. "Elon Musk portrait" is allowed because "elon musk" is a strong entity
      const hasStrongEntity = entities.length > 0 && entities.some(e =>
        e.length > 3 && searchText.includes(e)
      );
      if (!hasStrongEntity) {
        console.log(`[engine] ⛔ Forbidden term "${term}": ${url.substring(0, 70)}`);
        return true;
      }
    }
  }

  // Human signal in URL path
  const humanUrlSignals = [
    '/people/', '/person/', '/face/', '/portrait/', '/rostos/',
    'politician', 'eleicao', 'election', 'futebol', 'soccer',
    'jersey', 'stadium', 'athlete', 'rally', 'protest',
  ];
  if (humanUrlSignals.some(s => url.includes(s))) {
    console.log(`[engine] ⛔ Human URL signal: ${url.substring(0, 70)}`);
    return true;
  }

  return false;
}

// ─── ETAPA 3: Relevance Scoring ─────────────────────────────
export function scoreImage(candidate: ImageCandidate, entities: string[], query: string = ''): number {
  let score = 0;

  const desc     = (candidate.description || '').toLowerCase();
  const altDesc  = (candidate.altDescription || '').toLowerCase();
  const tags     = (candidate.tags || []).join(' ').toLowerCase();
  const url      = (candidate.url || '').toLowerCase();
  const fullText = `${desc} ${altDesc} ${tags} ${url}`;

  // Entity matching — strongest signal
  for (const entity of entities) {
    if (entity.length < 3) continue;
    if (desc.includes(entity))    { score += 4; continue; }
    if (altDesc.includes(entity)) { score += 3; continue; }
    if (tags.includes(entity))    { score += 3; continue; }
    if (url.includes(entity))     { score += 2; }
  }

  // Query word matching
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  score += queryWords.filter(w => fullText.includes(w)).length * 2;

  // Tech context bonuses
  const techBonuses: [string, number][] = [
    ['data center',           3],
    ['datacenter',            3],
    ['server',                2],
    ['gpu',                   3],
    ['chip',                  2],
    ['semiconductor',         2],
    ['processor',             2],
    ['circuit board',         2],
    ['hardware',              2],
    ['artificial intelligence', 2],
    ['machine learning',      2],
    ['neural network',        2],
    ['robot',                 2],
    ['humanoid',              2],
    ['drone',                 1],
    ['satellite',             1],
    ['laptop',                1],
    ['computer',              1],
    ['code',                  1],
    ['software',              1],
    ['laboratory',            2],
    ['research',              1],
    ['electric vehicle',      2],
    ['solar',                 1],
    ['technology',            1],
    ['display',               1],
    ['smartphone',            1],
    ['supercomputer',         3],
    ['data visualization',    2],
  ];

  for (const [term, bonus] of techBonuses) {
    if (fullText.includes(term)) score += bonus;
  }

  // Penalties
  const penalties: [string, number][] = [
    ['people',         -2],
    ['business team',  -3],
    ['meeting',        -2],
    ['office workers', -2],
    ['handshake',      -2],
    ['stock photo',    -3],
    ['generic',        -2],
  ];

  for (const [term, penalty] of penalties) {
    if (fullText.includes(term)) score += penalty;
  }

  // Trusted news/tech source bonus
  const trustedDomains = [
    'wired', 'techcrunch', 'arstechnica', 'theverge', 'engadget',
    'reuters', 'bloomberg', 'apnews', 'theguardian', 'zdnet',
  ];
  if (trustedDomains.some(d => url.includes(d))) score += 3;

  return Math.max(0, score);
}

// ─── ETAPA 4: Smart Selection ────────────────────────────────
export function selectBestImages(
  candidates: ImageCandidate[],
  entities: string[],
  query: string = '',
  count: number = 4,
  minScore: number = 2,
): ImageCandidate[] {
  // Step 1: Filter forbidden + score all
  const scored: ImageCandidate[] = [];

  for (const c of candidates) {
    if (containsForbidden(c, entities)) continue;
    scored.push({ ...c, score: scoreImage(c, entities, query) });
  }

  // Step 2: Sort by score DESC
  scored.sort((a, b) => (b.score || 0) - (a.score || 0));

  // Step 3: Pick top N with minimum score
  let selected = scored.filter(c => (c.score || 0) >= minScore).slice(0, count);

  // Step 4: Fallback — relax min score if not enough
  if (selected.length < count) {
    const additional = scored
      .filter(c => !selected.find(s => s.sourceId === c.sourceId))
      .slice(0, count - selected.length);
    selected = [...selected, ...additional];
  }

  return selected.slice(0, count);
}

// ─── Helper: Build query from entities ───────────────────────
export function buildEntityQuery(entities: string[], fallback: string = 'technology'): string {
  if (entities.length === 0) return fallback;
  // Take 2-3 most meaningful entities
  return entities.slice(0, 3).join(' ');
}
