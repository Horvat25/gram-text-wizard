/**
 * Gatilho externo do publicador do Instagram — Cloudflare Worker.
 *
 * POR QUE EXISTE: o cron do GitHub Actions não é garantido em repositório gratuito.
 * Em 27, 28 e 29/08/2026 ele engoliu períodos inteiros (manhãs completas) sem avisar,
 * e cada falha custou post. O agendador do Cloudflare é independente e confiável, então
 * ele passa a ser o relógio, e o GitHub vira só o executor.
 *
 * Isso NÃO substitui o cron do GitHub — soma. Os dois disparam o mesmo workflow, que tem
 * `concurrency` e só publica o que já venceu, então disparo repetido não duplica post.
 */
export default {
  async scheduled(event, env, ctx) {
    const r = await fetch(
      'https://api.github.com/repos/Horvat25/gram-text-wizard/actions/workflows/instagram.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GH_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'neural-update-cron',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    );
    // 204 = aceito. Qualquer outra coisa aparece no log do Worker (wrangler tail).
    console.log(`${event.cron} -> HTTP ${r.status}`);
  },
};
