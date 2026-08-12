// conferir-token.mjs — o token do Instagram vence em 60 dias e morre calado.
// Este check grita ANTES: falha o workflow (e o GitHub manda email) quando
// faltam menos de 10 dias, dando tempo de gerar outro sem perder post nenhum.

const API = 'https://graph.facebook.com/v21.0';
const { IG_USER_ID, IG_TOKEN } = process.env;

if (!IG_USER_ID || !IG_TOKEN) {
  console.error('FALTAM OS SECRETS: cadastre IG_USER_ID e IG_TOKEN em Settings > Secrets > Actions');
  process.exit(1);
}

// 1) o token ainda funciona? e é da conta certa?
const u = new URL(`${API}/${IG_USER_ID}`);
u.searchParams.set('fields', 'username');
u.searchParams.set('access_token', IG_TOKEN);
const conta = await (await fetch(u)).json();

if (conta.error) {
  console.error(`TOKEN MORTO: ${conta.error.message}`);
  console.error('Gere um novo no Graph API Explorer e troque o secret IG_TOKEN.');
  process.exit(1);
}
if (conta.username !== 'neuralupdate') {
  console.error(`TOKEN DA CONTA ERRADA: @${conta.username}`);
  process.exit(1);
}
console.log(`token ok — @${conta.username}`);

// 2) quanto tempo ainda resta? (best-effort: nem todo token expõe expires_at)
const d = new URL(`${API}/debug_token`);
d.searchParams.set('input_token', IG_TOKEN);
d.searchParams.set('access_token', IG_TOKEN);
const info = await (await fetch(d)).json();
// A Meta tem DOIS prazos e eles são independentes:
//   expires_at            — validade do token em si (pode ser 0 = nunca)
//   data_access_expires_at — validade do ACESSO AOS DADOS, 90 dias
// Um token "que nunca expira" para de funcionar quando o segundo vence. Foi
// quase a armadilha de 12/ago/2026: o depurador da Meta anuncia só o primeiro.
const prazos = [
  ['token', info?.data?.expires_at],
  ['acesso aos dados', info?.data?.data_access_expires_at],
].filter(([, v]) => v);   // 0 e undefined saem: não têm prazo

if (!prazos.length) { console.log('sem prazo declarado em nenhum dos dois campos'); process.exit(0); }

let alarme = false;
for (const [nome, quando] of prazos) {
  const dias = Math.floor((quando * 1000 - Date.now()) / 86400000);
  const data = new Date(quando * 1000).toISOString().slice(0, 10);
  console.log(`${nome}: vence em ${dias} dia(s) — ${data}`);
  if (dias < 10) {
    console.error(`ATENÇÃO: ${nome} vence em ${dias} dias. Gere um token novo AGORA.`);
    alarme = true;
  }
}
if (alarme) process.exit(1);
