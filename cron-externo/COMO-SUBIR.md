# Gatilho externo do publicador — como subir

O cron do GitHub falhou em 27, 28 e 29/08/2026, engolindo manhãs inteiras e custando
posts. Este Worker do Cloudflare vira o relógio: ele chama o workflow do GitHub nos
horários certos, e o GitHub só executa.

Os dois cron continuam ligados (GitHub + Cloudflare). Não duplica post: o publicador
tem trava de concorrência e só solta o que já venceu.

## O que você precisa fazer (uma vez, ~5 min)

### 1. Um token do GitHub com escopo de workflow

github.com/settings/tokens → **Generate new token (classic)**
- Nome: `cron-externo-instagram`
- Expiração: **sem expiração** (ou 1 ano — anote pra renovar)
- Marque: **`workflow`** (só isso)

Copie o token. Ele só aparece uma vez.

### 2. Subir o Worker

Na pasta `instagram/cron-externo`:

```bash
npx wrangler login          # abre o navegador, entra na conta Cloudflare
npx wrangler secret put GH_TOKEN    # cola o token do passo 1
npx wrangler deploy
```

⚠️ Se o npm reclamar de "Lock compromised", rode antes:
```bash
npm cache clean --force
```

### 3. Conferir

```bash
npx wrangler tail          # mostra os disparos em tempo real
```

Deve aparecer `10 11 * * * -> HTTP 204` nos horários.

## Alternativa sem terminal (se o wrangler der trabalho)

dash.cloudflare.com → Workers & Pages → Create → Worker → cole o `worker.js`
→ Settings → Variables → adicione `GH_TOKEN` como **Secret**
→ Settings → Triggers → Cron Triggers → adicione os 4 horários do `wrangler.toml`.

## Emergência

Se algum dia nada disso rodar e o post estiver parado:

```bash
bash publicador/destrava.sh
```

Dispara na hora, usando o token que já está no gerenciador de credenciais do Windows.
