// Gera a fila de posts de foto e texto de 27 e 28/11/2026 (Direção). Rodar: node publicador/fb-posts/gera-27e28nov.mjs
// Horários em UTC (BRT = Z − 3). Os Reels saem 11Z, 17Z e 21Z: nenhum post a menos de 1 h deles. Mesma grade de 22–26/11.
// Fotos novas (nenhuma repetida dos posts anteriores nem dos vídeos do lote 27–28/11). Céu e horários calculados (astronomy-engine).
import fs from 'node:fs';
const IMG = 'publicador/fb-posts/img/';
const P = [];
const add = (quando, tipo, slug, texto, imagem) => P.push({ slug, quando, tipo, texto: texto.trim(), ...(imagem ? { imagem: IMG + imagem } : {}) });

// ===== sexta 27/11 =====
add('2026-11-27T10:00:00Z', 'texto', '27nov-dias-mais-longos', `
Os dias mais longos do ano estão chegando, e quem mora mais ao sul ganha mais.

Hoje, em São Paulo, o Sol nasce às 5h11 e se põe às 18h37: são 13 horas e 26 minutos de luz. No dia 21 de dezembro, o solstício de verão, vão ser 13 horas e 36 minutos.

Em Porto Alegre, a diferença é maior: o dia de 21 de dezembro vai ter mais de 14 horas de Sol.

Já em Manaus, quase em cima da linha do Equador, o dia quase não muda o ano inteiro: fica perto de 12 horas, em junho ou em dezembro.

O motivo é a inclinação da Terra. Em dezembro, o hemisfério sul fica virado pro Sol, e quanto mais longe do Equador, mais comprido fica o caminho do Sol no céu.

O solstício cai na segunda, 21/12, às 17h50 (horário de Brasília). A partir dali, os dias começam a encurtar de novo. ☀️
`);

add('2026-11-27T12:30:00Z', 'foto', '27nov-mercurio-colorido', `
Mercúrio não tem essas cores. Essa é uma foto "pintada" de propósito.

A sonda MESSENGER, da NASA, fotografou Mercúrio em vários filtros, e os cientistas exageraram as diferenças de cor pra mostrar do que cada pedaço é feito. A olho nu, ele seria cinza, parecido com a nossa Lua.

Os riscos azul-claros que saem das crateras são material jogado por impactos recentes. As áreas castanhas são planícies feitas de lava muito fluida. E o círculo grande castanho, acima e à direita do centro, é a bacia Caloris: uma cratera de uns 1.500 quilômetros, mais ou menos a distância em linha reta de São Paulo a Salvador.

Mercúrio tem 4.879 quilômetros de diâmetro, pouco mais que a largura do Brasil de leste a oeste. É o menor planeta do Sistema Solar.

📷 NASA/Johns Hopkins University Applied Physics Laboratory/Carnegie Institution of Washington (MESSENGER, cores realçadas)
`, 'mercurio-cores.jpg');

add('2026-11-27T14:00:00Z', 'texto', '27nov-quantas-estrelas-voce-ve', `
Num céu bem escuro, longe de qualquer cidade, dá pra ver umas 2 a 3 mil estrelas ao mesmo tempo, sem binóculo nem telescópio.

No centro de uma cidade grande como São Paulo, numa noite limpa, sobram poucas dezenas. O resto continua lá: é a luz dos postes e das janelas, espalhada no ar, que apaga as mais fracas.

Faça o teste: olhe pro céu hoje à noite e conte quantas estrelas você acha dentro de um quadrado formado com as mãos. Depois, numa viagem pro interior, repita.

A diferença assusta. E explica por que os maiores observatórios ficam no alto de montanhas e no meio do deserto, longe de tudo. 🌌
`);

add('2026-11-27T15:30:00Z', 'foto', '27nov-netuno-aneis-webb', `
Netuno tem anéis. Fazia mais de 30 anos que ninguém via eles assim.

A última vez tinha sido em 1989, quando a sonda Voyager 2 passou por lá. Em 2022, o telescópio espacial James Webb, olhando em infravermelho, mostrou de novo os anéis finos e as faixas de poeira em volta do planeta.

E repara no "estrelão" brilhante no alto, com as pontas em forma de estrela: não é uma estrela. É Tritão, a maior lua de Netuno. Ela aparece tão forte porque é coberta de gelo de nitrogênio, que reflete muita luz.

Tritão ainda tem uma mania rara: gira em volta de Netuno no sentido contrário ao que o planeta gira. Os cientistas acham que ela foi capturada, que nasceu longe e acabou presa pela gravidade de Netuno.

Netuno está a uns 4,5 bilhões de quilômetros do Sol. Lá, um ano dura 165 anos da Terra.

📷 NASA, ESA, CSA, STScI (telescópio James Webb)
`, 'netuno-aneis-webb.jpg');

add('2026-11-27T18:30:00Z', 'texto', '27nov-estrela-pisca-planeta-nao', `
Um jeito simples de saber se aquele ponto brilhante no céu é estrela ou planeta: repara se ele pisca.

As estrelas estão tão longe que, daqui, cada uma é praticamente um ponto sem tamanho. A luz passa pelo ar da atmosfera, que mexe o tempo todo com camadas quentes e frias, e esse ponto minúsculo é empurrado pra lá e pra cá. É o pisca-pisca.

Os planetas estão bem mais perto e, mesmo a olho nu, são um disquinho, não um ponto. O ar também mexe na luz deles, mas os tremores de cada pedacinho do disco se compensam, e o brilho fica firme.

Perto do horizonte, onde a luz atravessa muito mais ar, até planeta pode tremer um pouco. Lá no alto, a regra funciona bem.

Hoje à noite dá pra testar: Saturno, alto pro norte logo que escurece, brilha firme. As estrelas em volta piscam. ✨
`);

add('2026-11-27T22:30:00Z', 'foto', '27nov-galaxia-sombrero', `
Essa é a Galáxia do Sombrero, fotografada pelo telescópio Hubble. Dá pra entender o apelido.

Ela fica a uns 28 milhões de anos-luz, na constelação de Virgem, e a gente vê ela quase de lado. Por isso o disco aparece como a aba de um chapéu, cortada por uma faixa escura de poeira, e o miolo brilhante parece a copa.

Esse brilho do centro vem de bilhões de estrelas velhas apertadas em volta de um buraco negro gigante, que, pelas medições, tem perto de um bilhão de vezes a massa do Sol.

E a luz que formou essa imagem saiu de lá há 28 milhões de anos, quando ainda nem existia ser humano na Terra. 🌌

📷 NASA e Hubble Heritage Team (STScI/AURA)
`, 'sombrero-hubble.jpg');

add('2026-11-28T00:00:00Z', 'texto', '27nov-por-que-marte-e-vermelho', `
Marte é vermelho pelo mesmo motivo que um portão velho fica vermelho: ferrugem.

O chão de Marte tem muito ferro. Ao longo de bilhões de anos, esse ferro reagiu com o pouco de oxigênio e de água que passou por lá e virou óxido de ferro, o mesmo da ferrugem.

O vento de Marte vive levantando essa poeira fininha, que cobre o planeta inteiro e fica suspensa no ar. Por isso até o céu de lá tem um tom de caramelo durante o dia.

Mas é uma camada de tinta: logo embaixo da poeira, as rochas são escuras, cinza, quase pretas. Quando um jipe da NASA arranha o chão com a roda, aparece por baixo uma terra bem menos vermelha.

Esta semana, quem acorda antes do Sol pode conferir: Marte é o pontinho laranja no alto, no nordeste, de madrugada. 🔴
`);

// ===== sábado 28/11 =====
add('2026-11-28T10:00:00Z', 'texto', '28nov-guia-do-ceu-fim-de-semana', `
Guia do céu pro fim de semana, calculado pra São Paulo (em quase todo o Brasil muda pouco):

🪐 Saturno: logo que escurece, alto no céu, pro norte. É o ponto amarelado que não pisca. Às 21h ele ainda está bem alto.

🌖 Lua: nasce tarde, perto das 23h no sábado e das 23h40 no domingo, no leste, já menos que cheia.

✨ Júpiter e Marte: sobem no nordeste perto da meia-noite. Júpiter é o ponto muito brilhante; Marte, o laranja e mais fraco, logo ao lado.

🌟 Vênus: o astro mais brilhante do céu, no leste, de madrugada, das 3h até o Sol nascer, perto das 5h10.

E guarda a madrugada de domingo pra segunda: a Lua vai passar colada em Júpiter. Lá pelas 4h30, os dois ficam a menos de um grau, no alto, pro nordeste.
`);

add('2026-11-28T12:30:00Z', 'foto', '28nov-valles-marineris', `
Esse risco escuro atravessando Marte é um cânion. O maior do Sistema Solar.

O Valles Marineris tem uns 4 mil quilômetros de comprimento, quase a distância em linha reta do Oiapoque ao Chuí. Chega a 200 quilômetros de largura e até 7 quilômetros de profundidade.

Pra comparar: o Grand Canyon, nos Estados Unidos, tem 1,8 quilômetro de profundidade. Num ponto mais fundo do Valles Marineris, cabem uns quatro Grand Canyons empilhados.

Ele não foi cavado por um rio. Os cientistas acham que a crosta de Marte rachou, há bilhões de anos, quando a região dos vulcões gigantes ao lado (as manchas escuras à esquerda) inchou e esticou o chão.

A imagem é um mosaico de 102 fotos das sondas Viking, da NASA.

📷 NASA/JPL-Caltech/USGS (Viking)
`, 'marte-valles.jpg');

add('2026-11-28T14:00:00Z', 'texto', '28nov-quanto-voce-pesaria', `
Quanto uma balança marcaria pra uma pessoa de 70 quilos em outros lugares do Sistema Solar:

🌕 Lua: 11,6 kg. Dá pra pular seis vezes mais alto.
🔴 Marte: 26 kg.
🟠 Mercúrio: 26 kg (é menor que Marte, mas é muito mais denso).
🪐 Saturno: 75 kg. Quase igual à Terra, apesar de ser gigante, porque ele é feito quase só de gás leve.
🟤 Júpiter: 177 kg.
☀️ Na superfície do Sol: quase 2 toneladas.

O seu corpo, a sua massa, continua igual em todos esses lugares. O que muda é a força com que cada mundo puxa você.

E aqui na Terra a balança também varia um pouquinho: no alto de uma montanha ou perto da linha do Equador, você pesa uma fração de por cento a menos.
`);

add('2026-11-28T15:30:00Z', 'foto', '28nov-galaxia-rodamoinho', `
Uma galáxia com outra pendurada no braço.

É a Galáxia do Rodamoinho, a M51, a uns 31 milhões de anos-luz. Os braços em espiral estão cheios de pontos cor-de-rosa: nuvens de gás onde estrelas novas estão nascendo agora. Os aglomerados azuis são estrelas jovens e muito quentes.

E a galáxia menor, na ponta de um dos braços, é a NGC 5195. As duas estão se cruzando há centenas de milhões de anos, e a gravidade da pequena é um dos motivos de os braços da grande estarem tão bem desenhados.

Foi numa galáxia assim que, em 1845, um astrônomo irlandês viu pela primeira vez que algumas "nebulosas" tinham forma de espiral. Ninguém sabia ainda que eram outras galáxias. 🌀

📷 NASA, ESA, S. Beckwith (STScI) e Hubble Heritage Team (STScI/AURA)
`, 'rodamoinho-m51.jpg');

add('2026-11-28T18:30:00Z', 'texto', '28nov-via-lactea-andromeda-50', `
Você talvez tenha aprendido que a Via Láctea vai bater em Andrômeda daqui a uns 4 ou 5 bilhões de anos. A conta mudou.

Em 2025, um grupo de astrônomos refez a simulação usando dados mais recentes dos telescópios Hubble e Gaia, e incluindo outras galáxias da vizinhança. O resultado, publicado na revista Nature Astronomy: a chance de as duas se fundirem nos próximos 10 bilhões de anos é de uns 50%. Nos próximos 5 bilhões, uns 2%.

O que pesa na conta é a Grande Nuvem de Magalhães, aquela galáxia pequena que a gente vê a olho nu no céu do sul. A gravidade dela puxa a Via Láctea de lado e pode fazer Andrômeda passar raspando, em vez de bater de frente.

Ou seja: o famoso "choque das galáxias" virou cara ou coroa. E uma galáxia que só se vê do hemisfério sul está no meio dessa história.
`);

add('2026-11-28T22:30:00Z', 'foto', '28nov-galaxia-barrada-ngc1300', `
Repara na barra reta no meio dessa galáxia, de onde saem os braços.

É a NGC 1300, uma galáxia espiral barrada a uns 60 a 70 milhões de anos-luz, na constelação de Erídano, que no Brasil passa alta nas noites de verão.

A barra é uma faixa de estrelas e gás que gira como um bloco só, e ela funciona como um funil: leva gás dos braços até o centro da galáxia.

E a Via Láctea, a nossa galáxia, também tem uma barra assim no meio. Se alguém de muito longe tirasse uma foto da gente, a nossa casa seria parecida com essa. 🌌

📷 NASA, ESA e Hubble Heritage Team (STScI/AURA)
`, 'ngc1300-hubble.jpg');

add('2026-11-29T00:00:00Z', 'foto', '28nov-lua-encosta-em-jupiter', `
Na madrugada de domingo pra segunda, a Lua vai passar colada em Júpiter, e dá pra ver de qualquer lugar do Brasil sem telescópio.

Pra quem está em São Paulo: os dois sobem juntos no nordeste perto da meia-noite. Às 3h, estão a pouco mais de um grau. Lá pelas 4h30, ficam a menos de um grau, quase em cima da sua cabeça, um pouco pro norte, antes de o céu clarear (o Sol nasce perto das 5h10).

Júpiter é o ponto muito brilhante grudado na Lua. Marte, laranja e mais fraco, fica uns seis graus abaixo.

Parece que estão encostados, mas é só perspectiva: Júpiter está a uns 755 milhões de quilômetros, umas 2 mil vezes mais longe que a Lua.

Essa foto é Júpiter visto por baixo, pelo polo sul, feita pela sonda Juno: cada redemoinho é uma tempestade maior que muitos países.

📷 NASA/JPL-Caltech/SwRI/MSSS (Juno), processamento de Roman Tkachenko
`, 'jupiter-de-baixo.jpg');

// Stories do Facebook (os mesmos do Insta, publicados pelo robô de hora em hora)
for (const s of ['noticia-2026-11-27', 'aula-2026-11-27', 'noticia-2026-11-28', 'aula-2026-11-28']) {
  const dia = s.slice(-10), hora = s.startsWith('noticia') ? '11:05' : '19:00';
  P.push({ slug: 'fb-story-' + s, quando: `${dia}T${hora}:00.000Z`, tipo: 'story', imagem: `publicador/fb-posts/stories/story-${s}.jpg` });
}

const FILA = 'publicador/fb-posts/fila.json';
const atual = fs.existsSync(FILA) ? JSON.parse(fs.readFileSync(FILA, 'utf8')) : [];
const novos = P.filter(p => !atual.some(a => a.slug === p.slug));
fs.writeFileSync(FILA, JSON.stringify([...atual, ...novos], null, 2) + '\n');
console.log('adicionados', novos.length, 'total', atual.length + novos.length);
