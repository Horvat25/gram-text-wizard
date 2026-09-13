// legenda-facebook.mjs — a legenda do Insta adaptada pra Página do Facebook (13/09/2026).
//
// A legenda do Insta fala de coisas que só existem lá: comentar QUERO e receber o link na
// DM (a automação é do Business Suite do Instagram), "link na bio" e @neuralupdate. No
// Facebook essas linhas viram promessa vazia — saem. A chamada do projetor também sai:
// o link dele só é entregue pela DM do Insta (visto no 1º teste, Reel das 18h de 13/09).
export function legendaFacebook(legenda = '') {
  return legenda.split('\n')
    .filter(l => !/\bQUERO\b|\bDM\b|link na bio|projetor/i.test(l))
    .join('\n').replace(/@neuralupdate/g, 'Neural Update').replace(/\n{3,}/g, '\n\n').trim();
}
