// levanta-comentarios.mjs — levanta os comentários SEM RESPOSTA do @neuralupdate e da Página (SÓ LEITURA).
//
// POR QUE EXISTE (13/11/2026, pedido do Marcelo via Direção): criar relacionamento com o público. Precisa-se
// saber quem comentou e ficou sem resposta, e quem comenta mais (o "fã nº 1").
//
// ⚠️ PRIVACIDADE: este repositório é PÚBLICO e o IG_TOKEN só existe no GitHub. O resultado leva @ e texto de
// gente de verdade, então NUNCA vai em claro: é CIFRADO aqui com a chave PÚBLICA abaixo (RSA-OAEP + AES-256-GCM)
// e só quem tem a chave privada (guardada fora do repositório) abre. Log, e-mail e arquivo só mostram contagens.
//
//   node publicador/levanta-comentarios.mjs [--autoteste]

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://graph.facebook.com/v21.0';
const SAIDA = process.env.LEVANTA_SAIDA || path.join(AQUI, 'levantamento-comentarios.enc.json');
const MEU = (process.env.IG_USERNAME || 'neuralupdate').toLowerCase();
const FB_PAGE_ID = process.env.FB_PAGE_ID || '962589380261249';

const CHAVE_PUBLICA = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEApnyYXiWgo7GPjZuOvazn
upAXNmBKrpaeIXFHU8WKscuP2GVfPrYN1hMxx/E8yvjm6tBUs8J9zrMSVhRi014p
PAMqAyMp+C9vjJO4rZp5/cgkWeSG1//qVOj5Ye9pJ2dd7dZfUeUbH8e52OXtl/8G
vyuRV+T052W8TFq9KJrZEFgfZRE9I+qz2FMDFAU4yE28W2knuBLBjVPhCNBl9iFn
FdLwsYW/9JLENvOXx0QMpZUCuTi36GEkU41ZEilkqntHUKZrQaIOcOEp01ZNRdF+
YnZXgbjuTxpKS4b9wp6SgT+0A8MZ2jEeL2q+NO2EBQ59o7IKeoQwgvfmpHgEKsVi
jmou6rXu3uSRjNvEy1+trO9zlJgZ5of0ZyF4TkYWNymwEGz+neLpRVkXd2y894qQ
Mn588p/bggR9qdl7HoQosuKLSZtalaK21952/K/JjWn8ebHOAYtEqh2J5VTGk4Ln
lqcYfcwfiXkzS1tn4Z363bTdbTkSoK1hgf7xxiqA2VcthPUONfA3yS7MpjHbGndU
9pp+r2A/NeuJd2/EVbfdommjkU8sAhpskEeRdMFr0B6I1DZjkIIxVCkASc8ztntu
wrerazhi6F+G+a8gasePxcFKeVcwKPoap8aFR3CdZYTJHAjwqpWRMJODhVy2WhCC
et6OD22e6wS6cwgi86sSVrkCAwEAAQ==
-----END PUBLIC KEY-----
`;

export function cifra(objeto, chavePublica = CHAVE_PUBLICA) {
  const aes = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', aes, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(objeto), 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  const k = crypto.publicEncrypt({ key: chavePublica, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, aes);
  return { alg: 'RSA-OAEP-SHA256+AES-256-GCM', k: k.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64'), ct: ct.toString('base64') };
}

if (process.argv.includes('--autoteste')) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = cifra({ a: 1, nome: 'teste ção' }, publicKey.export({ type: 'spki', format: 'pem' }));
  const aes = crypto.privateDecrypt({ key: privateKey, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(env.k, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', aes, Buffer.from(env.iv, 'base64'));
  d.setAuthTag(Buffer.from(env.tag, 'base64'));
  const txt = Buffer.concat([d.update(Buffer.from(env.ct, 'base64')), d.final()]).toString('utf8');
  if (JSON.parse(txt).nome !== 'teste ção') throw new Error('cifra falhou');
  if (JSON.stringify(env).includes('teste')) throw new Error('texto em claro no envelope');
  console.log('autoteste levanta-comentarios: OK (cifra ida e volta)');
  process.exit(0);
}

const IG_USER_ID = process.env.IG_USER_ID;
const IG_TOKEN = process.env.IG_TOKEN;
let FB_TOKEN = process.env.FB_TOKEN || process.env.IG_TOKEN;
if (!IG_USER_ID || !IG_TOKEN) { console.error('faltam IG_USER_ID / IG_TOKEN'); process.exit(1); }

const get = async (caminho, params = {}, token = IG_TOKEN) => {
  const u = new URL(caminho.startsWith('http') ? caminho : API + caminho);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', token);
  return (await fetch(u)).json();
};
async function paginas(primeira, max = 30, token = IG_TOKEN) {
  const todos = [];
  let p = primeira;
  for (let i = 0; i < max; i++) {
    if (p.error) return { itens: todos, erro: (p.error.message || 'erro').slice(0, 140) };
    todos.push(...(p.data || []));
    if (!p.paging?.next) break;
    p = await get(p.paging.next, {}, token);
  }
  return { itens: todos, erro: null };
}

async function main() {
  const fila = JSON.parse(fs.readFileSync(path.join(AQUI, 'fila.json'), 'utf8'));
  const slugPorId = new Map(fila.filter(x => x.id_instagram).map(x => [x.id_instagram, x.slug]));
  const erros = [];

  // ── Instagram
  const midias = await paginas(await get(`/${IG_USER_ID}/media`, { fields: 'id,media_product_type,timestamp,permalink', limit: '100' }), 5);
  if (midias.erro) erros.push('ig media: ' + midias.erro);
  const comentarios = [];
  let ig_midias = 0;
  for (const m of midias.itens) {
    const cs = await paginas(await get(`/${m.id}/comments`, { fields: 'id,text,username,timestamp,like_count,replies.limit(50){id,username,text,timestamp}', limit: '100' }), 10);
    if (cs.erro) { erros.push('ig comentarios: ' + cs.erro); continue; }
    ig_midias++;
    for (const c of cs.itens) {
      const nome = (c.username || '').toLowerCase();
      if (!nome || nome === MEU) continue;
      const fio = (c.replies?.data || []).map(r => ({ id: r.id, quem: (r.username || '').toLowerCase(), texto: r.text || '', em: r.timestamp, nosso: (r.username || '').toLowerCase() === MEU }));
      const respondido = fio.some(r => r.nosso);
      // RÉPLICA (25/11): alguém escreveu no fio DEPOIS da nossa primeira resposta.
      const nossa = fio.filter(r => r.nosso).sort((a, b) => (a.em < b.em ? -1 : 1))[0] || null;
      const replicas = nossa ? fio.filter(r => !r.nosso && r.em > nossa.em) : [];
      comentarios.push({ rede: 'ig', id: c.id, midia: m.id, tipo: m.media_product_type, video: slugPorId.get(m.id) || null, link: m.permalink, em: c.timestamp, quem: nome, texto: c.text || '', curtidas: c.like_count || 0, respondido, fio, nossa, replicas });
    }
  }

  // ── Página do Facebook (posts e vídeos/Reels)
  // O secret FB_TOKEN está inválido (13/11); o publicar.mjs tira o token da Página do IG_TOKEN (de usuário). Igual aqui.
  try {
    const t = await get(`/${FB_PAGE_ID}`, { fields: 'access_token' }, IG_TOKEN);
    if (t.access_token) FB_TOKEN = t.access_token; else erros.push('token da Pagina: ' + (t.error?.message || 'nao veio').slice(0, 100));
  } catch (e) { erros.push('token da Pagina: ' + (e.message || e)); }
  let fb_itens = 0;
  for (const rota of ['posts', 'videos']) {
    const campos = rota === 'posts' ? 'id,created_time,message,permalink_url' : 'id,created_time,description,permalink_url';
    const lista = await paginas(await get(`/${FB_PAGE_ID}/${rota}`, { fields: campos, limit: '50' }, FB_TOKEN), 4, FB_TOKEN);
    if (lista.erro) { erros.push(`fb ${rota}: ${lista.erro}`); continue; }
    for (const it of lista.itens) {
      const cs = await paginas(await get(`/${it.id}/comments`, { fields: 'id,message,from,created_time,like_count,comment_count,comments.limit(25){from}', limit: '100' }, FB_TOKEN), 6, FB_TOKEN);
      if (cs.erro) { erros.push(`fb comentarios: ${cs.erro}`); continue; }
      fb_itens++;
      for (const c of cs.itens) {
        const nome = (c.from?.name || '').toLowerCase();
        const idDe = c.from?.id || null;
        if (!c.from || String(idDe) === String(FB_PAGE_ID) || nome === 'neural update') continue;
        const respondido = (c.comments?.data || []).some(r => String(r.from?.id) === String(FB_PAGE_ID));
        comentarios.push({ rede: 'fb', id: c.id, midia: it.id, tipo: rota, video: null, link: it.permalink_url || null, em: c.created_time, quem: c.from.name, texto: c.message || '', curtidas: c.like_count || 0, respondido });
      }
    }
  }

  const resumo = {
    gerado_em: new Date().toISOString(), ig_midias_lidas: ig_midias, fb_itens_lidos: fb_itens,
    comentarios_total: comentarios.length, sem_resposta: comentarios.filter(c => !c.respondido).length,
    por_rede: { ig: comentarios.filter(c => c.rede === 'ig').length, fb: comentarios.filter(c => c.rede === 'fb').length },
    erros: [...new Set(erros)].slice(0, 6),
  };
  // só contagens em claro; o conteúdo vai cifrado
  console.log(JSON.stringify(resumo));
  const envelope = cifra({ resumo, comentarios });
  fs.writeFileSync(SAIDA, JSON.stringify({ resumo_publico: resumo, envelope }, null, 1) + '\n', 'utf8');
}

main().catch(e => { console.error('ERRO: ' + (e.message || e)); process.exit(1); });
