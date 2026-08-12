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
const exp = info?.data?.expires_at;

if (!exp) { console.log('sem data de expiração declarada (token de vida longa)'); process.exit(0); }
if (exp === 0) { console.log('token não expira'); process.exit(0); }

const dias = Math.floor((exp * 1000 - Date.now()) / 86400000);
console.log(`vence em ${dias} dia(s) — ${new Date(exp * 1000).toISOString().slice(0, 10)}`);
if (dias < 10) {
  console.error(`ATENÇÃO: faltam ${dias} dias. Gere um token novo AGORA, antes que pare sozinho.`);
  process.exit(1);
}
