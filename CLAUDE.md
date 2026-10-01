# Instagram @neuralupdate (+ Página do Facebook) — ficha da plataforma

> Responder em pt-BR. Leis gerais e mapa: `../CLAUDE.md`. Painel geral: `../ESTADO-DA-OPERACAO.md`.
> O `README.md` desta pasta é o modelo padrão da Lovable: **não precisa ler**.

## O que é esta pasta

O repositório `Horvat25/gram-text-wizard`. Só uma parte dele importa pra operação:

| caminho | papel |
|---|---|
| `publicador/fila.json` | **a fila** (Reels, Stories, feed). A verdade é o `origin/main`, nunca a cópia local |
| `publicador/publicar.mjs` | o carteiro: publica no Insta e repete o Reel na Página do Facebook |
| `publicador/conferir-*.mjs` | os vigias (token, fila por tipo, Facebook) |
| `publicador/metricas-*.mjs` | coletores de números (só leitura) |
| `.github/workflows/` | o motor: tudo que roda sozinho está aqui |
| `funil-dm/` | testes do funil de comentário → DM |
| `cron-externo/` | Worker do Cloudflare que dispara o publicador quando o cron do GitHub atrasa |

O resto (`src/`, `supabase/`, `remotion/`, `dist/`) é o app antigo da Lovable. Não mexer sem motivo.

## Leia só quando a tarefa pedir

| tarefa | arquivo |
|---|---|
| saber o que está no ar / até quando | `ESTADO.md` (camada 1, ler sempre) |
| medir, comparar, tirar conclusão | `METRICAS.md` |
| entender ou mudar um robô | `AUTOMACAO.md` |
| enfileirar Stories | `../YouTube/gera-stories.js` + `../YouTube/insta-stories-fila.js` (passo a passo em `AUTOMACAO.md`) |
| post de feed (carrossel) | `../YouTube/carrossel/` |

## Leis desta plataforma (cada uma já custou caro)

1. **O GitHub Actions publica; o agente só prepara.** Publicar por fora já fez Reel sair 2x (20/08).
2. **Fila: `git fetch` e trabalhar sobre o `origin/main`.** O workflow reescreve a fila a cada
   rodada. Commitar cópia velha **republica post já publicado**. Acrescentar só os itens novos,
   num worktree limpo, e conferir o diff (só linhas `+`).
3. **Antes e depois de enfileirar: listar a fila do origin por horário e confirmar zero
   duplicata.** Duas IAs mexem nesta fila (Claude e SOL/GPT).
4. **Story pela API não aceita legenda, figurinha nem link.** Todo o recado vai queimado na arte.
5. **Stories NÃO são automáticos:** alguém gera o lote. Em 28–30/09 a fila ficou sem Story e ninguém viu.
6. **Token do Instagram vence em 60 dias e mata tudo em silêncio.** Publicação parou sem erro?
   Suspeite do token primeiro.
7. **Conformidade Amazon:** nunca preço, nota em estrelas ou nº de avaliações. Aviso de afiliado
   onde o link aparece.
8. **Legenda:** gancho → conteúdo → ação com pedido explícito → segue → 📚 fonte confiável → hashtags.
9. **Nada de automação de navegador.** Onde existe API oficial, usa a API.

## Fronteira com o YouTube

A grade é a mesma nas duas redes e os vídeos vêm prontos de `../YouTube/exports/`. Esta
plataforma **não produz vídeo**. Caiu nas duas redes = problema de conteúdo; caiu só aqui =
distribuição do Instagram. É o diagnóstico mais barato que existe.

## Prova antes de dizer "pronto"

Fila do `origin/main` agrupada por horário com zero duplicata, ou o post publicado de verdade
(`id_instagram` na fila). "Rodou sem erro" não é prova.
