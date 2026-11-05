// detalha-rotina.mjs — relatório SÓ DE LEITURA de TODO "ROTINA" que chegou ao @neuralupdate.
//
// POR QUE EXISTE (05/11/2026, ordem da Direção): o 1º cadastro do Rotina que Paga veio de uma conversa 1 a 1,
// e a contagem diária mostrou ROTINA com `dm_enviadas: 0`. Precisamos saber, pra cada ROTINA, se houve
// resposta, se houve DM e onde a conversa parou, e também achar quem mandou ROTINA DIRETO na DM (Story).
//
// ⚠️ PRIVACIDADE: este repositório é PÚBLICO. O arquivo gerado NÃO leva @ de ninguém e NÃO leva texto de
// mensagem. Só: vídeo, data/hora, "respondeu em público?", "recebeu DM?", nº de mensagens, quem falou por
// último e em que hora. Quem precisa do nome é o Marcelo, que acha a pessoa pelo vídeo + hora na caixa de
// entrada dele. Nunca gravar usuário, texto de comentário ou de DM aqui.
//
//   node publicador/detalha-rotina.mjs [--seco] [--autoteste]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://graph.facebook.com/v21.0';
const SECO = process.argv.includes('--seco');
const AUTOTESTE = process.argv.includes('--autoteste');
const SAIDA = process.env.DETALHE_SAIDA || path.join(AQUI, 'rotina-detalhe.json');
const MEU = (process.env.IG_USERNAME || 'neuralupdate').toLowerCase();
const DESDE = process.env.DETALHE_DESDE || '2026-10-16T00:00:00Z';

const EXATA = /(^|[^\p{L}])rotina([^\p{L}]|$)/iu;
const APROX = /rotin/i;
export const classe = t => (EXATA.test(t || '') ? 'exata' : APROX.test(t || '') ? 'aproximada' : null);
const abreComRotina = t => /voc[eê] comentou rotina/i.test(t || '');
const brt = iso => new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 16) + '-03:00';
const horas = (a, b) => Math.round(((new Date(b) - new Date(a)) / 3600000) * 10) / 10;

// Núcleo puro e testável. conversa = { pessoa, msgs:[{de:'nos'|'pessoa', em, rotina:boolean, abertura:boolean}] }
export function resumoConversa(conv) {
  const ms = [...conv.msgs].sort((a, b) => new Date(a.em) - new Date(b.em));
  const nossas = ms.filter(m => m.de === 'nos');
  const dela = ms.filter(m => m.de === 'pessoa');
  const ultima = ms[ms.length - 1];
  return {
    msgs: ms.length, nossas: nossas.length, dela: dela.length,
    abriu_por_automacao: nossas.some(m => m.abertura),
    primeira_nossa_em: nossas[0]?.em || null,
    ultima_de: ultima ? ultima.de : null,
    ultima_em: ultima ? ultima.em : null,
    pessoa_respondeu_a_dm: nossas.length > 0 && dela.some(m => new Date(m.em) > new Date(nossas[0].em)),
  };
}

if (AUTOTESTE) {
  if (classe('Rotina!') !== 'exata' || classe('quero rotina') !== 'exata' || classe('rotinas') !== 'aproximada' || classe('oi') !== null) throw new Error('classe falhou');
  const r = resumoConversa({ pessoa: 'x', msgs: [
    { de: 'nos', em: '2026-10-16T10:00:00Z', abertura: true },
    { de: 'pessoa', em: '2026-10-16T10:05:00Z' },
    { de: 'nos', em: '2026-10-16T10:06:00Z' }] });
  if (r.msgs !== 3 || !r.abriu_por_automacao || !r.pessoa_respondeu_a_dm || r.ultima_de !== 'nos') throw new Error('resumo falhou ' + JSON.stringify(r));
  console.log('autoteste detalha-rotina: OK');
  process.exit(0);
}

const IG_USER_ID = process.env.IG_USER_ID;
const IG_TOKEN = process.env.IG_TOKEN;
if (!IG_USER_ID || !IG_TOKEN) { console.error('faltam IG_USER_ID / IG_TOKEN'); process.exit(1); }

const get = async (caminho, params = {}) => {
  const u = new URL(caminho.startsWith('http') ? caminho : API + caminho);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', IG_TOKEN);
  return (await fetch(u)).json();
};

async function paginas(primeira, max = 30) {
  const todos = [];
  let p = primeira;
  for (let i = 0; i < max; i++) {
    if (p.error) return { itens: todos, erro: (p.error.message || 'erro').slice(0, 160) };
    todos.push(...(p.data || []));
    if (!p.paging?.next) break;
    p = await get(p.paging.next);
  }
  return { itens: todos, erro: null };
}

async function main() {
  // Reels publicados (da fila): slug por id
  const fila = JSON.parse(fs.readFileSync(path.join(AQUI, 'fila.json'), 'utf8'));
  const reels = fila.filter(x => x.tipo === 'reels' && x.id_instagram && new Date(x.publicado_em || x.quando) >= new Date(DESDE));

  // 1) conversas -> por pessoa (em memória; o nome NUNCA sai daqui)
  const conv = await paginas(await get(`/${IG_USER_ID}/conversations`, {
    platform: 'instagram', limit: '50',
    fields: 'participants,messages.limit(25){message,from,created_time}',
  }), 40);
  const porPessoa = new Map();
  for (const c of conv.itens) {
    const outros = (c.participants?.data || []).map(p => (p.username || '').toLowerCase()).filter(n => n && n !== MEU);
    const msgs = (c.messages?.data || []).map(m => ({
      de: (m.from?.username || '').toLowerCase() === MEU ? 'nos' : 'pessoa',
      em: m.created_time, rotina: !!classe(m.message), abertura: abreComRotina(m.message),
    }));
    for (const n of outros) porPessoa.set(n, { pessoa: n, msgs });
  }

  // 2) comentários ROTINA por Reel
  const comentarios = [];
  const comentouRotina = new Set();
  let reelsLidos = 0, erros = [];
  for (const r of reels) {
    const cs = await paginas(await get(`/${r.id_instagram}/comments`, { fields: 'id,text,username,timestamp,replies{id,username,timestamp}', limit: '100' }), 10);
    if (cs.erro) { erros.push(`${r.slug}: ${cs.erro}`); continue; }
    reelsLidos++;
    for (const c of cs.itens) {
      const cl = classe(c.text);
      if (!cl) continue;
      const nome = (c.username || '').toLowerCase();
      if (nome === MEU) continue; // nosso próprio comentário fixo
      comentouRotina.add(nome);
      const rp = (c.replies?.data || []).filter(x => (x.username || '').toLowerCase() === MEU).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
      const cv = porPessoa.get(nome);
      const res = cv ? resumoConversa(cv) : null;
      comentarios.push({
        origem: 'comentario', video: r.slug, classe: cl, comentou_em: brt(c.timestamp),
        resposta_publica: !!rp, resposta_publica_em: rp ? brt(rp.timestamp) : null,
        dm_aberta: !!res && res.nossas > 0, abriu_por_automacao: res ? res.abriu_por_automacao : false,
        horas_ate_dm: res?.primeira_nossa_em ? horas(c.timestamp, res.primeira_nossa_em) : null,
        msgs: res ? res.msgs : 0, ultima_de: res ? res.ultima_de : null, ultima_em: res?.ultima_em ? brt(res.ultima_em) : null,
        pessoa_respondeu_a_dm: res ? res.pessoa_respondeu_a_dm : false,
      });
    }
  }
  comentarios.sort((a, b) => a.comentou_em.localeCompare(b.comentou_em));

  // 3) ROTINA que chegou DIRETO na DM (quem não comentou ROTINA em Reel nenhum)
  const diretas = [];
  for (const cv of porPessoa.values()) {
    const rot = cv.msgs.filter(m => m.de === 'pessoa' && m.rotina);
    if (!rot.length) continue;
    if (comentouRotina.has(cv.pessoa)) continue;
    const res = resumoConversa(cv);
    const primeira = rot.map(m => m.em).sort()[0];
    const nossaDepois = cv.msgs.filter(m => m.de === 'nos' && new Date(m.em) > new Date(primeira)).sort((a, b) => new Date(a.em) - new Date(b.em))[0];
    diretas.push({
      origem: 'dm_direta', rotina_em: brt(primeira), respondida: !!nossaDepois,
      horas_ate_resposta: nossaDepois ? horas(primeira, nossaDepois.em) : null,
      msgs: res.msgs, ultima_de: res.ultima_de, ultima_em: res.ultima_em ? brt(res.ultima_em) : null,
      pessoa_respondeu_depois: res.pessoa_respondeu_a_dm,
    });
  }
  diretas.sort((a, b) => a.rotina_em.localeCompare(b.rotina_em));

  const sem = {
    comentarios_sem_dm: comentarios.filter(c => !c.dm_aberta).length,
    comentarios_sem_nenhuma_resposta: comentarios.filter(c => !c.dm_aberta && !c.resposta_publica).length,
    comentarios_dm_parada_na_nossa: comentarios.filter(c => c.dm_aberta && c.ultima_de === 'nos' && !c.pessoa_respondeu_a_dm).length,
    diretas_sem_resposta: diretas.filter(d => !d.respondida).length,
  };
  const saida = {
    gerado_em: new Date().toISOString(), desde: DESDE, reels_lidos: reelsLidos, reels_com_erro: erros.length,
    conversas_lidas: conv.itens.length, erro_conversas: conv.erro,
    totais: { comentarios_rotina: comentarios.length, dm_diretas_rotina: diretas.length, ...sem },
    comentarios, dm_diretas: diretas, erros: erros.slice(0, 5),
  };
  console.log(JSON.stringify(saida.totais), `conversas=${conv.itens.length}`, conv.erro ? 'ERRO_CONVERSAS=' + conv.erro : '');
  if (!SECO) fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 1) + '\n', 'utf8');
}

main().catch(e => { console.error('ERRO: ' + (e.message || e)); process.exit(1); });
