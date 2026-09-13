# Funil do direct — livro de testes

Pedido do Marcelo (12/09/2026): *"o atendimento tem que ser focado em vendas… quero que você se
auto melhore nisso com dados"*. Este arquivo é a memória dos testes: **uma mudança por semana,
sempre medida contra a versão anterior**. Nada muda por opinião.

## Como funciona

- Automação nativa do Business Suite (grátis): **"QUERO → venda do projetor astronauta"**
  (id `1343055872214596`, Caixa de Entrada → Automações). Palavras: QUERO · Quero · quero · CÉU.
  Manda **uma** mensagem só; a conversa depois disso é humana (a caixa de entrada do Insta).
- Quem pede o comentário: a legenda dos reels das 18h ("💬 Comenta QUERO que eu te mando o link
  no direct") — a partir do reel de 13/09.

## As 4 réguas (lidas toda terça)

| régua | de onde vem | o que diz |
|---|---|---|
| **pedidos** = comentários QUERO/CÉU por reel | `publicador/metricas.json` → `pedidos_dm` (robô diário) | a legenda/vídeo convence a pedir? |
| **cliques** no link do direct | painel de afiliado da Shopee (link `s.shopee.com.br/4VcdexRFg5`) | a mensagem convence a abrir? |
| **vendas** | painel de afiliado da Shopee | a oferta fecha? |
| **respostas** ("é pra você ou presente?") | caixa de entrada do Insta | a conversa está viva? |

⚠️ O link `4VcdexRFg5` também já apareceu em legendas antigas. Pra medir SÓ o direct, gerar no
painel da Shopee um link com Sub ID `dm` e trocar na mensagem (precisa do login do Marcelo).

## Regra de decisão

- Menos de **30 pedidos** na semana → não dá pra julgar a mensagem; o gargalo é o pedido
  (legenda/vídeo). Mexer lá, não no direct.
- Com 30+ pedidos: clique/pedido abaixo de **25%** → mudar a abertura/benefício; clique alto e
  venda zero → o problema é a oferta/página, não a mensagem.
- Uma variável por vez. Guardar o texto de cada versão aqui.

## Versões

### v1 — 12/09/2026 (no ar)

Vendedor: benefício → prova → link → urgência honesta → aviso de afiliado → pergunta que abre
conversa. Só o astronauta (sem Kindle). **Vai com a foto do projetor** (arte "seu quarto pode virar isso" sem o botão de bio). Resposta pública: "Te mandei no direct ✨".

```
Oi! 🌌 Que bom que você quer esse céu em casa.

É o projetor astronauta: você apaga a luz e o quarto inteiro vira uma galáxia, com estrelas e nebulosas no teto e nas paredes.

✨ 8 modos de nebulosa e estrelas piscando
🎮 Controle remoto e ângulo ajustável (modelo grande)
⭐ Nota 4,9 e mais de 20 mil vendidos na Shopee

Presente certeiro pra quem ama o espaço, criança ou adulto.

👉 Confere o preço de hoje e garante o seu:
https://s.shopee.com.br/4VcdexRFg5

O valor muda com as promoções da Shopee, então vale olhar agora.

Link de afiliado: posso receber comissão, sem custo extra pra você.

É pra você ou pra dar de presente? Me conta que eu te ajudo 😉
```

Recursos citados = só os do anúncio (VSL v1). Nota 4,9 / 20 mil+ vendidos = print do Marcelo de
10/09 — **reconferir a cada versão**, os números envelhecem. Nunca citar preço fixo.

**Próximos candidatos (um por semana, na ordem):** abrir
com a pergunta (presente × pra você) · prova social primeiro · link com Sub ID `dm`.
