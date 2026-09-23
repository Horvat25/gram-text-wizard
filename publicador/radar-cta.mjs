// RADAR DE CTA — aprender com quem já vende por "Comenta X que eu te mando no direct".
// Pedido do Marcelo (23/09): a venda 1 a 1 pela DM é o caminho, mas precisamos aprender RÁPIDO como os bons fazem.
// Usa a Business Discovery da Graph API (lê posts PÚBLICOS de contas comerciais/criador pelo @) com o nosso token.
// Para cada conta: últimos ~50 posts, quais pedem comentário, QUAL palavra, ONDE (legenda), e o engajamento
// (comentários ÷ curtidas) dos posts COM pedido × SEM pedido. SÓ LEITURA: não comenta, não segue, não publica.
// Lista de contas: publicador/radar-cta-contas.json (conta que não existe/não é comercial é marcada e pulada).
// Uso: IG_USER_ID=... IG_TOKEN=... node publicador/radar-cta.mjs
import fs from 'node:fs';
const API = 'https://graph.facebook.com/v21.0';
const { IG_USER_ID, IG_TOKEN } = process.env;
if (!IG_USER_ID || !IG_TOKEN) { console.error('faltam IG_USER_ID / IG_TOKEN'); process.exit(1); }
const contas = JSON.parse(fs.readFileSync('publicador/radar-cta-contas.json', 'utf8')).contas;
const CTA = /coment[ae]\s*(?:a palavra\s*)?["“'«]?([A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9🔥🚀✨💛❤️👇]{2,20})["”'»]?/i;
const PEDE = /coment[ae]|me chama|manda (?:um|a palavra)|te (?:mando|envio)|no direct|na dm/i;
const media = a => a.length ? a.reduce((p, q) => p + q, 0) / a.length : null;
const resultado = [];
for (const c of contas) {
  const campos = `business_discovery.username(${c.usuario}){username,followers_count,media_count,media.limit(50){caption,comments_count,like_count,media_type,media_product_type,timestamp,permalink}}`;
  const u = new URL(`${API}/${IG_USER_ID}`); u.searchParams.set('fields', campos); u.searchParams.set('access_token', IG_TOKEN);
  try {
    const r = await fetch(u); const j = await r.json();
    if (j.error) { resultado.push({ usuario: c.usuario, grupo: c.grupo, ok: false, erro: j.error.message?.slice(0, 120) }); continue; }
    const bd = j.business_discovery, posts = bd.media?.data || [];
    const linhas = posts.map(p => { const cap = p.caption || '', pede = PEDE.test(cap), m = cap.match(CTA);
      return { quando: p.timestamp?.slice(0, 10), tipo: p.media_product_type || p.media_type, pede, palavra: pede && m ? m[1].toUpperCase() : null,
        trecho: pede ? (cap.match(/[^\n]*(coment[ae]|direct|dm|me chama)[^\n]*/i) || [''])[0].slice(0, 140) : null,
        comentarios: p.comments_count ?? 0, curtidas: p.like_count ?? null, link: p.permalink }; });
    const com = linhas.filter(l => l.pede), sem = linhas.filter(l => !l.pede);
    const razao = l => l.filter(x => x.curtidas).map(x => x.comentarios / x.curtidas);
    const palavras = {}; for (const l of com) if (l.palavra) palavras[l.palavra] = (palavras[l.palavra] || 0) + 1;
    resultado.push({ usuario: bd.username, grupo: c.grupo, ok: true, seguidores: bd.followers_count, posts_lidos: linhas.length,
      pct_posts_pedindo: +(com.length / Math.max(1, linhas.length)).toFixed(2), palavras,
      comentarios_por_curtida_com_pedido: media(razao(com)) == null ? null : +media(razao(com)).toFixed(3),
      comentarios_por_curtida_sem_pedido: media(razao(sem)) == null ? null : +media(razao(sem)).toFixed(3),
      melhores_pedidos: com.sort((a, b) => b.comentarios - a.comentarios).slice(0, 5) });
  } catch (e) { resultado.push({ usuario: c.usuario, grupo: c.grupo, ok: false, erro: e.message }); }
  await new Promise(r => setTimeout(r, 1500)); // gentil com o limite da API
}
const saida = { gerado_em: new Date().toISOString(), contas_lidas: resultado.filter(r => r.ok).length, contas_invalidas: resultado.filter(r => !r.ok).map(r => `${r.usuario}: ${r.erro}`), resultado };
fs.writeFileSync('publicador/radar-cta.json', JSON.stringify(saida, null, 1));
console.log(`contas lidas ${saida.contas_lidas}/${contas.length}`);
for (const r of resultado.filter(r => r.ok)) console.log(`@${r.usuario} (${r.seguidores}) · ${Math.round(r.pct_posts_pedindo * 100)}% pedem · com ${r.comentarios_por_curtida_com_pedido} × sem ${r.comentarios_por_curtida_sem_pedido} · ${JSON.stringify(r.palavras)}`);
for (const x of saida.contas_invalidas) console.log(`  ✗ ${x}`);
