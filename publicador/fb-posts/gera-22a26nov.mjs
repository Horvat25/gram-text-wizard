// Gera a fila de posts de foto e texto de 22 a 26/11/2026 (Direção). Rodar: node publicador/fb-posts/gera-22a26nov.mjs
// Horários em UTC (BRT = Z − 3). Os Reels saem 11Z, 17Z e 21Z: nenhum post a menos de 1 h deles.
// Grade fixa por dia: 10:00Z, 12:30Z, 14:00Z, 15:30Z, 18:30Z, 22:30Z e 00:00Z do dia seguinte. Foto e texto alternando.
// Céu do dia calculado com astronomy-engine para São Paulo. Fontes de cada número: FONTES.md.
import fs from 'node:fs';
const IMG = 'publicador/fb-posts/img/';
const P = [];
const add = (quando, tipo, slug, texto, imagem) => P.push({ slug, quando, tipo, texto: texto.trim(), ...(imagem ? { imagem: IMG + imagem } : {}) });

// ===== domingo 22/11 =====
add('2026-11-22T10:00:00Z', 'foto', '22nov-nascer-da-terra', `
Repara: essa é a Terra nascendo no horizonte da Lua.

A foto foi feita em 24 de dezembro de 1968 pelo astronauta Bill Anders, da Apollo 8, a primeira missão a levar gente até a Lua. A nave estava dando voltas em torno dela quando a Terra apareceu por trás do horizonte. A foto nem estava no roteiro: a tripulação correu atrás de um filme colorido pra não perder o momento.

A Terra aparece pela metade porque, do lado escuro, já era noite. Segundo a NASA, as Américas estavam ali, escondidas debaixo das nuvens. O Brasil inteiro cabe nessa bolinha azul.

Ela estava a uns 386 mil quilômetros dos astronautas.

Eles viajaram até lá pra estudar a Lua. E a foto mais famosa da viagem acabou sendo a da Terra. 🌍

📷 NASA (Bill Anders, Apollo 8)
`, 'nascer-da-terra.jpg');

add('2026-11-22T12:30:00Z', 'texto', '22nov-bandeira-ceu-do-rio', `
As estrelas da bandeira do Brasil não estão ali por acaso. Elas são um retrato do céu.

É o céu do Rio de Janeiro às 8h30 da manhã de 15 de novembro de 1889, o dia da Proclamação da República. A bandeira foi adotada quatro dias depois, em 19 de novembro.

Detalhe curioso: às 8h30 o Sol já estava alto e ninguém via estrela nenhuma. O desenho mostra onde elas estavam, não o que dava pra ver.

E o céu da bandeira está espelhado. Ele foi desenhado como se a gente olhasse a esfera do céu por fora, e não aqui de baixo.

Cada estrela representa um estado. Desde 1992 são 27, contando o Distrito Federal. Sirius, a estrela mais brilhante do céu noturno, representa o Mato Grosso.

A única estrela acima da faixa branca é Espiga, da constelação de Virgem. Ela representa o Pará, e a posição lembra que o Brasil também tem terra no hemisfério norte.

E esta semana Espiga está fácil de achar: antes do amanhecer, por volta das 4h40, ela aparece baixa no leste, coladinha em Vênus, o ponto mais brilhante do céu naquela hora. 🇧🇷
`);

add('2026-11-22T14:00:00Z', 'foto', '22nov-grande-mancha-vermelha', `
Essa mancha laranja é uma tempestade. E ela é mais larga que a Terra.

É a Grande Mancha Vermelha de Júpiter, fotografada de perto pela sonda Juno em 10 de julho de 2017, a menos de 10 mil quilômetros do topo das nuvens.

Em 2017, ela media uns 16.350 km de largura, 1,3 vez o tamanho da Terra. Pra ter ideia: é quase quatro vezes a largura do Brasil, de leste a oeste.

Ela vem sendo acompanhada desde o século 19 e está encolhendo aos poucos. Ninguém sabe dizer se um dia vai sumir.

Repara nos redemoinhos em volta, que parecem tinta mexida num copo d'água. Cada um deles também é uma tempestade, e vários seriam enormes aqui na Terra.

E dá pra ver Júpiter daqui: nesta semana, antes do amanhecer, ele é o ponto mais forte no nordeste, com Marte, mais fraquinho e avermelhado, bem do lado. 🪐

📷 NASA/JPL-Caltech/SwRI/MSSS; processamento: Kevin M. Gill (CC BY)
`, 'grande-mancha-vermelha.jpg');

add('2026-11-22T15:30:00Z', 'texto', '22nov-estrela-de-neutrons', `
Um cubinho de açúcar feito desse material pesaria tanto quanto uma montanha.

Quando uma estrela bem maior que o Sol morre, o núcleo dela desaba sobre si mesmo. Os átomos são esmagados até sobrar quase só nêutrons, encostados uns nos outros. O que fica é uma estrela de nêutrons.

Ela guarda até duas vezes a massa do Sol numa bola do tamanho de uma cidade, com uns 20 km de diâmetro. Caberia com folga dentro do município de São Paulo.

Segundo a NASA, um cubinho de açúcar dessa matéria pesaria cerca de 1 bilhão de toneladas aqui na Terra.

E elas giram. A mais rápida que se conhece dá 716 voltas por segundo: uma coisa com mais massa que o Sol girando duas vezes mais rápido que a lâmina de um liquidificador.

Só existe uma coisa mais compacta que isso no universo: um buraco negro. 🌀
`);

add('2026-11-22T18:30:00Z', 'foto', '22nov-pegada-na-lua', `
Essa pegada tem 57 anos. E deve continuar exatamente assim por muito, muito tempo.

A foto foi feita em 20 de julho de 1969, na missão Apollo 11. O astronauta Buzz Aldrin fotografou a marca da própria bota de propósito: os cientistas queriam entender como o solo da Lua se comporta quando alguém pisa nele.

Olha como as bordas ficaram firmes, quase como areia molhada. O pó da Lua é feito de grãozinhos pontudos, que se encaixam uns nos outros. Aqui na Terra, o vento e a água arredondam os grãos. Lá, não tem nem um nem outro.

Por isso a marca não some. O único "apagador" é uma chuva finíssima de micrometeoritos, que desgasta as rochas de lá em mais ou menos um milímetro a cada milhão de anos. O Museu Americano de História Natural estima que as pegadas da Apollo durem pelo menos um milhão de anos.

Muito depois de a gente ir embora, essa bota ainda vai estar desenhada no chão da Lua. 👣

📷 NASA (Apollo 11)
`, 'pegada-na-lua.jpg');

add('2026-11-22T22:30:00Z', 'texto', '22nov-como-achar-saturno', `
Hoje à noite dá pra ver Saturno a olho nu. Sem telescópio e sem aplicativo.

Como achar (horários de São Paulo, valem pra semana toda):

🔭 Logo que escurecer, olha pro lado norte, bem alto no céu. Procura um ponto amarelado, firme, que não pisca. Esse é Saturno.

🕗 Por volta das 20h30, ele chega ao ponto mais alto da noite. Depois vai descendo pro oeste e se põe perto das 2h30 da madrugada.

🌕 Neste domingo, a Lua quase cheia fica à direita dele e mais baixa. Ajuda a não se perder.

Quem tiver um telescópio pequeno vai notar uma coisa diferente: os anéis estão quase de lado. Em março de 2025, a Terra passou bem pelo plano deles, e eles praticamente sumiram de vista. Agora estão inclinados só uns 6 graus e aparecem como uma linha fina atravessando o planeta.

E faz sentido. Os anéis se espalham por dezenas de milhares de quilômetros, mas a NASA calcula que os principais têm, em geral, uns 10 metros de espessura. Mais ou menos a altura de um prédio de três andares. 🪐
`);

add('2026-11-23T00:00:00Z', 'foto', '22nov-buraco-negro-m87', `
Essa é a primeira foto de um buraco negro da história.

Ele fica no centro da galáxia M87, a uns 55 milhões de anos-luz, e tem a massa de 6,5 bilhões de sóis. A imagem foi divulgada em 10 de abril de 2019 pelo Event Horizon Telescope, uma rede de radiotelescópios espalhados pelo mundo, trabalhando juntos como se fossem um telescópio do tamanho da Terra.

Repara: o anel laranja não é o buraco negro. É gás quentíssimo girando em volta dele. A mancha escura no meio é a sombra, a região de onde nem a luz consegue sair.

Pra ter ideia de como um buraco negro é compacto: se a Terra inteira fosse espremida até virar um, ela teria menos de 2 centímetros de diâmetro, o tamanho de uma bolinha de gude. O Sol viraria uma bola de uns 6 km.

Pode ficar tranquilo: o Sol não tem massa suficiente pra virar buraco negro. Isso não vai acontecer com ele. ⚫

📷 EHT Collaboration
`, 'buraco-negro-m87.jpg');

// ===== segunda 23/11 =====
add('2026-11-23T10:00:00Z', 'texto', '23nov-sombra-some-ao-meio-dia', `
Nesta semana, em algumas cidades do Brasil, a sua sombra vai sumir perto do meio-dia.

Isso acontece quando o Sol passa exatamente em cima da cabeça, a 90 graus. Só é possível entre os trópicos, e só em dois dias por ano em cada cidade.

Neste fim de novembro, o Sol a pino está passando pelo Sudeste e pelo Centro-Oeste:

☀️ Vitória (ES): 22 e 23/11, perto das 11h27 (horário de Brasília)
☀️ Campo Grande (MS): hoje, 23/11, às 11h24 (horário local)
☀️ São José do Rio Preto (SP): quarta, 25/11, às 12h04 (horário de Brasília)
☀️ Ribeirão Preto (SP): sexta, 27/11, às 11h58 (horário de Brasília)

No Rio de Janeiro, a vez chega em 10 de dezembro e de novo em 2 de janeiro. Em Belo Horizonte, foi no sábado.

E em São Paulo? Nunca. A capital fica um pouquinho ao sul do Trópico de Capricórnio. No dia mais alto do ano, 21 de dezembro, o Sol chega a 89,9 graus: quase, mas não exatamente.

Repara que o horário não é meio-dia cravado no relógio. O "meio-dia do Sol" muda de cidade pra cidade, conforme a posição de cada uma no mapa.

Teste fácil: põe uma garrafa no chão no horário certo e olha a sombra desaparecer embaixo dela. ☀️
`);

add('2026-11-23T12:30:00Z', 'foto', '23nov-brasil-a-noite-iss', `
Repara no aglomerado grande de luz no litoral, à direita: é São Paulo, visto do espaço à noite.

A foto foi tirada da Estação Espacial Internacional na madrugada de 12 de junho de 2014, dia da abertura da Copa do Mundo no Brasil, pelo astronauta Steve Swanson. Segundo a NASA, a cidade do litoral à esquerda de São Paulo é o Rio de Janeiro, e as luzes perto do centro da foto são Belo Horizonte.

A estação voa a uns 400 km de altura. É pouco mais que a distância em linha reta entre São Paulo e o Rio, uns 360 km. Se desse pra dirigir pra cima, chegar lá seria uma viagem mais curta que muita gente faz no feriado.

Só que lá em cima tudo é rápido. A estação anda a uns 28 mil km/h e dá uma volta na Terra a cada 90 minutos. Atravessar o Brasil inteiro, do norte ao sul, leva menos de 10 minutos.

A faixa esverdeada na borda do planeta é o brilho da própria atmosfera, que acontece mesmo de noite. 🌎

📷 NASA (Steve Swanson, Estação Espacial Internacional)
`, 'brasil-a-noite-iss.jpg');

add('2026-11-23T14:00:00Z', 'texto', '23nov-eclipse-de-sobral', `
Uma das teorias mais famosas da ciência foi confirmada no céu do Ceará.

Em 29 de maio de 1919, a Lua cobriu o Sol inteiro sobre Sobral, no interior do Ceará, por 5 minutos e 13 segundos. Uma equipe britânica estava lá com telescópios. Outra estava na Ilha do Príncipe, na costa da África.

O objetivo era fotografar as estrelas que aparecem perto do Sol durante o eclipse. Einstein tinha previsto que a gravidade do Sol entorta a luz das estrelas que passam rente a ele. Pela conta dele, elas iam parecer deslocadas 1,75 segundo de arco, um ângulo do tamanho de uma moeda vista a 3 km de distância. Pela física de Newton, o desvio seria a metade.

As melhores chapas de Sobral mostraram 1,98, com margem de erro de 0,12. Muito mais perto de Einstein do que de Newton.

O resultado foi anunciado em Londres em 6 de novembro de 1919 e virou manchete no mundo inteiro.

E o Brasil não foi só o cenário: foi o diretor do Observatório Nacional, Henrique Morize, quem indicou Sobral como bom lugar pra observar.

Quando visitou o Brasil, em 1925, Einstein teria dito que a pergunta formulada pela mente dele foi respondida pelo céu do Brasil. 🌑
`);

add('2026-11-23T15:30:00Z', 'foto', '23nov-europa-oceano', `
Debaixo dessa casca de gelo pode ter mais água do que em todos os oceanos da Terra juntos.

Essa é Europa, uma das luas de Júpiter, numa imagem montada com fotos da sonda Galileo, do fim dos anos 1990, e reprocessada pela NASA em 2014.

Ela é um pouco menor que a nossa Lua. Mesmo assim, há fortes indícios de que, embaixo do gelo, existe um oceano de água salgada. A NASA estima que ele pode ter mais que o dobro da água de todos os oceanos da Terra.

Repara nas linhas avermelhadas cruzando a superfície. São rachaduras e cristas no gelo, provavelmente coloridas por sais e outros materiais que vieram de baixo.

Água líquida, sal e energia: é por isso que Europa é um dos lugares mais promissores pra procurar vida fora da Terra.

A sonda Europa Clipper, lançada em outubro de 2024, deve chegar a Júpiter em abril de 2030 pra investigar isso de perto. 🧊

📷 NASA/JPL-Caltech/SETI Institute
`, 'europa.jpg');

add('2026-11-23T18:30:00Z', 'texto', '23nov-cruzeiro-do-sul-de-madrugada', `
Procurou o Cruzeiro do Sul à noite e não achou? Não é você. Nesta época ele está escondido.

Em novembro, no começo da noite, o Cruzeiro fica abaixo do horizonte em São Paulo. Ele só nasce perto das 22h, no sul-sudeste, e vai subindo de madrugada. Às 4h, já está a uns 33 graus de altura, mais ou menos um terço do caminho entre o horizonte e o ponto acima da sua cabeça, ainda meio deitado.

Como reconhecer:

✝️ Quatro estrelas formando uma cruz pequena, mais uma estrelinha fraca fora do lugar, a "Intrometida".
⚠️ Cuidado com o Falso Cruzeiro, mais alto e um pouco à direita: é uma cruz maior, mais espaçada, mais apagada e sem a Intrometida.

E ele ainda ensina onde fica o sul. Pega o braço comprido da cruz, do topo até o pé, e prolonga umas quatro vezes e meia na mesma direção. Ali fica o polo sul do céu. Desce reto dali até o horizonte: aquele ponto é o sul.

A estrela do pé da cruz, a Estrela de Magalhães, é a que representa São Paulo na bandeira do Brasil. 🧭
`);

add('2026-11-23T22:30:00Z', 'foto', '23nov-olympus-mons', `
Esse é o maior vulcão do Sistema Solar. A base dele ocuparia quase o Rio Grande do Sul inteiro.

É o Monte Olimpo, em Marte, numa montagem de imagens feitas da órbita do planeta.

Ele tem uns 22 km de altura em relação ao nível médio de Marte. Isso é duas vezes e meia o Everest e mais de sete vezes o Pico da Neblina, o ponto mais alto do Brasil, com 2.995 metros.

A base tem mais de 600 km de largura. A NASA compara a área dela à do estado americano do Arizona, que tem quase o mesmo tamanho do Rio Grande do Sul.

Repara na borda: em volta do vulcão tem um paredão de até 6 km de altura, que cai de uma vez até as planícies.

E ele é tão largo e de subida tão suave que quem estivesse no chão de Marte não conseguiria ver o vulcão inteiro, nem de longe. A própria curvatura do planeta esconderia uma parte dele. 🌋

📷 NASA/JPL/USGS
`, 'olympus-mons.jpg');

add('2026-11-24T00:00:00Z', 'texto', '23nov-estrela-cadente', `
Aquela estrela cadente que você viu riscar o céu provavelmente era do tamanho de um grão de areia.

Estrela cadente não é estrela. É um pedacinho de rocha ou poeira do espaço, muitas vezes deixado para trás por um cometa, que entra na atmosfera a dezenas de milhares de quilômetros por hora.

Nessa velocidade, o ar na frente dele é esmagado e esquenta tanto que o grão vira um risco de luz e some em um segundo, lá no alto, bem longe do chão.

Segundo a NASA, a maior parte desses fragmentos tem entre o tamanho de um grão de areia e o de uma ervilha.

E são muitos. A NASA estima que caem na Terra cerca de 44 toneladas de material do espaço por dia, quase tudo em forma de poeira fininha, que vai parar no mar, no mato e nos telhados.

Ou seja: a Terra fica um pouquinho mais pesada todo dia, com poeira que viajou bilhões de quilômetros até aqui. ☄️
`);

// ===== terça 24/11 =====
add('2026-11-24T10:00:00Z', 'foto', '24nov-encontro-das-aguas', `
Repara embaixo, à direita da cidade: uma faixa escura e uma faixa marrom correndo juntas no mesmo rio, sem se misturar.

É o Encontro das Águas, em Manaus, fotografado da Estação Espacial Internacional em 7 de julho de 2004. A mancha clara no meio da floresta é a cidade.

O rio barrento é o Solimões. A cor vem da lama que ele arranca da Cordilheira dos Andes e carrega por milhares de quilômetros. O rio escuro é o Negro: ele nasce em terras baixas, com pouca erosão, e ganha a cor de chá preto da matéria orgânica que cai da floresta.

Quando os dois se encontram, seguem lado a lado antes de se misturar de vez, porque têm temperatura, velocidade e densidade diferentes. Segundo a NASA, a zona de mistura vai por centenas de quilômetros rio abaixo. A partir dali, o rio passa a se chamar Amazonas.

Dá pra ver a fronteira entre as duas águas da janela de um barco. E, pelo visto, também do espaço, a 400 km de altura. 🌊

📷 NASA (Estação Espacial Internacional, Expedição 9)
`, 'encontro-das-aguas.jpg');

add('2026-11-24T12:30:00Z', 'texto', '24nov-observatorio-nacional', `
O horário oficial do Brasil é medido num morro do bairro de São Cristóvão, no Rio de Janeiro.

Lá funciona o Observatório Nacional, uma das instituições científicas mais antigas do país. Ele foi criado por decreto de Dom Pedro I em 15 de outubro de 1827. No ano que vem, faz 200 anos.

Desde 1913, por lei, é ele quem gera e distribui a Hora Legal Brasileira. Hoje ela sai de um conjunto de relógios atômicos de césio.

No começo, o observatório ficava no Morro do Castelo, no centro do Rio. Em 1922, mudou pro Morro de São Januário, em São Cristóvão, onde está até hoje.

E ele tem um pé na história da física: o observatório ajudou a preparar a observação do eclipse de 1919 em Sobral, no Ceará, aquela que confirmou a teoria de Einstein.

Na próxima vez que alguém falar em "horário de Brasília", lembra: quem cuida dele fica no Rio, há quase dois séculos. 🕰️
`);

add('2026-11-24T14:00:00Z', 'foto', '24nov-sol-filamento', `
Essa linha escura atravessando o Sol é mais comprida que o dobro da distância entre a Terra e a Lua.

A foto é do observatório solar SDO, da NASA, em 10 de fevereiro de 2015. A linha é um filamento: uma faixa de material mais frio flutuando na atmosfera do Sol. Nessa imagem, o que é mais frio aparece escuro e o que é mais quente aparece claro.

Esticado, esse filamento passaria de 850 mil quilômetros. Daria pra enfileirar 67 Terras ao longo dele. A Lua está a uns 384 mil km da gente.

E mesmo assim ele é só um risco no Sol. O Sol tem 109 vezes a largura da Terra e concentra 99,8% de toda a massa do Sistema Solar. Planetas, luas, asteroides e a gente cabemos nos 0,2% que sobram.

Filamentos assim podem ficar parados por dias. Às vezes, explodem e lançam nuvens de gás pro espaço. Quando uma dessas nuvens acerta a Terra, pode acender auroras no céu. ☀️

📷 NASA/Goddard/SDO
`, 'sol-filamento.jpg');

add('2026-11-24T15:30:00Z', 'texto', '24nov-superlua-como-ver', `
Hoje tem superlua. E o melhor momento pra ver é logo depois do pôr do sol.

A Lua fica cheia hoje às 11h54 (horário de Brasília), a 360.754 km da Terra. É a segunda Lua cheia mais perto de 2026. A mais perto de todas vem no mês que vem: a da véspera de Natal, em 24 de dezembro, a 356.729 km.

Como ver, em São Paulo:

🌇 O Sol se põe às 18h35.
🌕 A Lua nasce às 18h57, no leste, 22 minutos depois.
👀 Olha pro leste nos primeiros minutos depois que ela nascer. Rente ao horizonte, ela parece enorme e meio alaranjada.

Em outras cidades, os horários mudam alguns minutos.

Esse tamanho gigante perto do horizonte é, em boa parte, uma ilusão do cérebro, que compara a Lua com prédios e árvores. A diferença real de uma superlua pra uma Lua cheia comum existe, mas é pequena pro olho.

E a Lua continua se aproximando: amanhã, às 18h02, ela passa pelo ponto mais perto da Terra no mês, a 359.335 km.

Se o céu estiver nublado, calma: amanhã à noite ela ainda vai estar quase toda cheia. 🌕
`);

add('2026-11-24T18:30:00Z', 'foto', '24nov-penhascos-cosmicos', `
Parece uma cordilheira ao luar. Mas são nuvens de gás e poeira onde estão nascendo estrelas.

Essa região é chamada de Penhascos Cósmicos. Ela fica na Nebulosa de Carina, a uns 7.600 anos-luz, e foi uma das primeiras imagens do telescópio James Webb, divulgada em julho de 2022.

Repara no "vapor" que parece subir das montanhas. É gás quente sendo arrancado da nuvem pela radiação de estrelas jovens e muito massivas, que ficam acima da área da foto.

Os picos mais altos têm uns 7 anos-luz de altura. A luz levaria sete anos pra ir da base até a ponta.

E a Nebulosa de Carina é coisa do céu do sul. No Brasil, nesta época, ela aparece de madrugada: por volta das 4h, fica alta no sul-sudeste, um pouco acima do Cruzeiro do Sul. Num céu escuro, dá pra ver a nebulosa a olho nu, como uma mancha clara no meio da Via Láctea. ✨

📷 NASA, ESA, CSA, STScI (telescópio James Webb)
`, 'penhascos-cosmicos.jpg');

add('2026-11-24T22:30:00Z', 'texto', '24nov-canopus-a-estrela-guia', `
Tem uma estrela que já serviu de bússola pra sondas espaciais. E ela está no céu do Brasil hoje à noite.

É Canopus, a segunda estrela mais brilhante do céu noturno, atrás só de Sirius. Ela fica a uns 310 anos-luz e brilha milhares de vezes mais que o Sol.

Por ser muito brilhante e ficar longe do caminho que o Sol faz no céu, Canopus virou referência de navegação no espaço. Desde os anos 1960, várias sondas usaram sensores apontados pra ela pra saber pra que lado estavam viradas.

Como achar, em São Paulo:

🌅 Ela nasce no sudeste por volta das 18h, ainda de dia.
🕙 Às 22h, está a uns 33 graus de altura no sudeste: um ponto branco, forte e isolado.
🕛 De madrugada, sobe ainda mais.

Da maior parte da Europa e dos Estados Unidos, Canopus nunca aparece. É uma estrela do nosso céu: na bandeira do Brasil, ela representa Goiás. ✨
`);

add('2026-11-25T00:00:00Z', 'foto', '24nov-nebulosa-anel-do-sul', `
É assim que uma estrela parecida com o Sol termina a vida.

Essa é a Nebulosa do Anel do Sul, a uns 2.500 anos-luz, vista pelo telescópio James Webb em dois tipos de luz infravermelha: à esquerda, o infravermelho próximo; à direita, o infravermelho médio.

No centro tem duas estrelas. Uma delas é uma anã branca: o que sobrou de uma estrela que, ao longo de milhares de anos, foi soltando as camadas de fora. Essas camadas formam as conchas de gás em volta. Na imagem da direita, repara: a anã branca aparece como o ponto avermelhado bem no meio, coberta de poeira.

O Sol deve passar por algo parecido daqui a uns 5 bilhões de anos. Vai inchar, virar uma gigante vermelha, soltar as camadas de fora e terminar como uma anã branca do tamanho da Terra, brilhando cada vez menos.

O gás que ele soltar vai se espalhar pelo espaço e, um dia, pode virar parte de novas estrelas e planetas. Nada se perde. ✨

📷 NASA, ESA, CSA, STScI (telescópio James Webb)
`, 'nebulosa-anel-do-sul.jpg');

// ===== quarta 25/11 =====
add('2026-11-25T10:00:00Z', 'texto', '25nov-planetas-entre-terra-e-lua', `
Todos os planetas do Sistema Solar cabem, lado a lado, no espaço entre a Terra e a Lua. Mas não hoje.

Somando a largura de Mercúrio, Vênus, Marte, Júpiter, Saturno, Urano e Netuno, dá uns 380 mil quilômetros.

A distância até a Lua muda, porque a órbita dela não é um círculo perfeito. No dia 13 deste mês, no ponto mais longe, o vão entre a superfície da Terra e a da Lua passava de 397 mil km. Os planetas cabiam com uns 17 mil km de folga.

Hoje, às 18h02 (horário de Brasília), a Lua passa pelo ponto mais perto da Terra no mês: 359.335 km de centro a centro. Tirando o raio da Terra e o da Lua, sobra um vão de uns 351 mil km. Aí os planetas não cabem: faltam uns 29 mil quilômetros, mais que duas Terras.

É por isso que a Lua cheia de ontem foi uma superlua.

Em 12 dias, a distância até a Lua encolheu mais de 46 mil km. E ninguém aqui embaixo sentiu nada. 🌕
`);

add('2026-11-25T12:30:00Z', 'foto', '25nov-marcos-pontes', `
Esse é o primeiro brasileiro a ir pro espaço, trabalhando dentro da Estação Espacial Internacional.

Marcos Pontes, nascido em Bauru (SP), era piloto de testes e tenente-coronel da Força Aérea. Ele decolou do Cazaquistão na noite de 29 de março de 2006 (horário de Brasília), a bordo da nave russa Soyuz TMA-8.

A viagem foi batizada de Missão Centenário, em homenagem aos 100 anos do voo do 14-Bis, de Santos Dumont, em 1906.

Foram cerca de oito dias a bordo da estação, com oito experimentos científicos brasileiros. Ele voltou à Terra em 8 de abril de 2006.

A foto é de 3 de abril de 2006. Repara no alto, em cima da escotilha: uma fileira de bandeiras dos países que participam da estação.

Um menino de Bauru que virou piloto, astronauta e, por uns dias, morador da órbita da Terra. 🇧🇷

📷 NASA
`, 'marcos-pontes-iss.jpg');

add('2026-11-25T14:00:00Z', 'texto', '25nov-universo-do-caburai-ao-chui', `
Se a história do universo fosse o Brasil de ponta a ponta, onde a gente apareceria?

Do Monte Caburaí, em Roraima, ao Arroio Chuí, no Rio Grande do Sul, são 4.394 km: a maior distância norte-sul do país. Agora estica os 13,8 bilhões de anos do universo nessa linha. O Big Bang fica lá em Roraima. O dia de hoje fica no Chuí.

Nessa escala, cada milhão de anos vale uns 320 metros.

🌌 As primeiras estrelas: poucas dezenas de quilômetros depois da largada, ainda em Roraima.
🌍 O Sol e a Terra: só se formam a uns 1.450 km do fim, mais ou menos na altura de Mato Grosso do Sul.
🦖 Os dinossauros desaparecem a 21 km do Chuí.
🧍 O ser humano moderno surge a menos de 100 metros da linha de chegada.
⛵ A chegada dos portugueses, em 1500, fica a 17 centímetros do fim.
⏳ Uma vida inteira de 80 anos: dois centímetros e meio.

Toda a história humana cabe no último passo de uma viagem do tamanho do Brasil. 🇧🇷
`);

add('2026-11-25T15:30:00Z', 'foto', '25nov-plutao', `
Plutão ainda não completou nem uma volta em torno do Sol desde que foi descoberto.

Ele foi encontrado em 18 de fevereiro de 1930 pelo americano Clyde Tombaugh. Uma volta completa de Plutão leva 248 anos. A primeira volta inteira desde a descoberta só termina em 2178.

Essa foto é da sonda New Horizons, que passou por ele em 14 de julho de 2015, depois de mais de nove anos de viagem. As cores foram realçadas pela NASA pra destacar as diferenças do terreno.

Repara no coração claro, à direita. Ele leva o nome de Tombaugh, o descobridor, e a metade esquerda dele é uma planície enorme de gelo de nitrogênio.

E o tamanho: Plutão tem uns 2.377 km de diâmetro. É mais estreito que o Brasil, que tem 4.319 km de leste a oeste. Mesmo assim, a superfície inteira dele tem área parecida com a da Rússia.

Pequeno, gelado e longe. E mesmo assim tem montanhas de gelo, céu azulado e um coração. 🤍

📷 NASA/Johns Hopkins University Applied Physics Laboratory/Southwest Research Institute
`, 'plutao.jpg');

add('2026-11-25T18:30:00Z', 'texto', '25nov-como-achar-pleiades', `
Aquele grupinho apertado de estrelas que parece uma manchinha no céu de novembro tem nome: Plêiades.

Também chamado de Sete-Estrelo, é um aglomerado de estrelas jovens, a uns 444 anos-luz, nascidas há cerca de 100 milhões de anos. Quando elas acenderam, os dinossauros ainda andavam pela Terra.

Como achar (horários de São Paulo):

🕘 Depois das 21h, olha pro nordeste.
⭐ Procura um grupinho de estrelas azuladas, parecendo uma pequena concha. A olho nu dá pra contar umas seis ou sete.
🕛 Perto da meia-noite, elas chegam ao ponto mais alto, no norte, a uns 42 graus de altura.

Dica: depois das 22h, as Três Marias já estão no leste. Siga a linha delas pra esquerda. Ela passa por uma estrela alaranjada, Aldebarã, e chega nas Plêiades.

Com um binóculo, o grupinho vira dezenas de estrelas.

No Japão, esse aglomerado se chama Subaru, e é ele que aparece no logotipo da montadora. 🔭
`);

add('2026-11-25T22:30:00Z', 'foto', '25nov-nebulosa-tarantula', `
Repara no centro da foto: aquele montinho de pontos azuis são estrelas enormes e muito jovens. Foram elas que abriram esse buraco no gás.

Essa é a Nebulosa da Tarântula, vista pelo telescópio James Webb em 2022. Ela fica a uns 161 mil anos-luz, na Grande Nuvem de Magalhães, uma galáxia vizinha da nossa.

É a maior e mais brilhante região de nascimento de estrelas de todo o grupo de galáxias onde a Via Láctea está. O nome vem dos filamentos de gás, que lembram as pernas de uma aranha.

O vento e a radiação das estrelas do centro empurram o gás e a poeira pra longe. Nas bordas, onde o material fica mais denso, novas estrelas continuam se formando.

E essa galáxia é do nosso céu: a Grande Nuvem de Magalhães aparece a olho nu no Brasil, num lugar escuro. Nesta época, em São Paulo e no Sul, ela fica no sul-sudeste a noite toda. 🕷️

📷 NASA, ESA, CSA e STScI (telescópio James Webb)
`, 'nebulosa-tarantula.jpg');

add('2026-11-26T00:00:00Z', 'texto', '25nov-tempo-na-cabeca', `
Sua cabeça envelhece um pouquinho mais rápido que os seus pés.

Parece piada, mas é física. Einstein mostrou que a gravidade mexe com o tempo: quanto mais perto de uma massa grande, como a Terra, mais devagar o tempo passa.

Em 2010, cientistas do NIST, nos Estados Unidos, mediram isso com relógios atômicos ultraprecisos. Bastou levantar um deles 33 centímetros pra ver que ele andava um pouco mais rápido que o de baixo.

A diferença é ridícula: ao longo de uma vida de 79 anos, dá uns 90 bilionésimos de segundo. Mas é real.

E não é só curiosidade de laboratório. Os satélites de GPS voam a uns 20 mil km de altura, onde a gravidade é mais fraca. Somando isso com a velocidade deles, os relógios lá em cima adiantam uns 38 milionésimos de segundo por dia. Se ninguém corrigisse, o GPS do celular erraria a sua posição em vários quilômetros por dia.

Ou seja: toda vez que você abre o mapa no celular, está usando a relatividade de Einstein. ⏱️
`);

// ===== quinta 26/11 =====
add('2026-11-26T10:00:00Z', 'foto', '26nov-lua-menor-que-o-brasil', `
A Lua é mais estreita que o Brasil.

Ela tem 3.475 km de diâmetro. O Brasil tem 4.319 km de largura, da Ponta do Seixas, na Paraíba, até a Serra da Contamana, no Acre. Se desse pra pôr a Lua em cima do mapa, sobrava Brasil dos dois lados.

Mas tem uma pegadinha: a Lua é uma bola, e o mapa é plano. Somando a superfície inteira dela, dá uns 38 milhões de km², quase quatro vezes e meia a área do Brasil.

Essa imagem foi montada pela NASA com dados da sonda LRO, que está em órbita da Lua desde 2009.

Repara nas manchas escuras. Os antigos acharam que eram mares, e o nome ficou. Mas lá não tem água: são planícies de lava que esfriou há bilhões de anos. As partes claras são terrenos mais antigos, cheios de crateras.

Pequena perto da Terra, grande perto do Brasil, e sempre mostrando a mesma face pra gente. 🌕

📷 NASA/Goddard (dados da sonda Lunar Reconnaissance Orbiter)
`, 'lua-cheia.jpg');

add('2026-11-26T12:30:00Z', 'texto', '26nov-pico-dos-dias', `
O maior observatório astronômico em território brasileiro fica no alto de uma serra em Minas Gerais.

É o Observatório do Pico dos Dias, em Brazópolis, no sul de Minas, a 1.864 metros de altitude, na Serra da Mantiqueira. Ele é operado pelo Laboratório Nacional de Astrofísica, que fica na cidade vizinha de Itajubá.

O principal instrumento é um telescópio com espelho de 1,6 metro, que começou a funcionar em 1981. Ao lado dele há telescópios menores e, desde 2017, um telescópio russo de 75 cm que vigia lixo espacial.

Por que tão alto? Quanto mais alto, menos ar, umidade e luz de cidade entre o telescópio e as estrelas.

Mesmo assim, o Sudeste tem muita nuvem. Por isso os astrônomos brasileiros também usam telescópios maiores no Chile, onde o céu é seco e limpo boa parte do ano. O Brasil é sócio do telescópio SOAR, de 4,1 metros, no Cerro Pachón, e do Observatório Gemini.

Ciência feita por brasileiros, com um pé na Mantiqueira e outro nos Andes. 🔭
`);

add('2026-11-26T14:00:00Z', 'foto', '26nov-omega-centauri', `
Isso não é uma galáxia. É uma bola com até 10 milhões de estrelas, dentro da nossa.

É Omega Centauri, o maior aglomerado globular da Via Láctea, a uns 17 mil anos-luz. A foto foi feita com o telescópio de 2,2 metros do observatório La Silla, do ESO, no Chile.

Muitos astrônomos acham que ele é o que sobrou do núcleo de uma pequena galáxia engolida pela Via Láctea há muito tempo. Em 2024, um estudo com dados do Hubble encontrou sinais de um buraco negro de pelo menos 8.200 vezes a massa do Sol no centro dele.

E dá pra ver daqui. A olho nu, num céu escuro, ele parece uma estrelinha meio borrada. Foi por isso que, na Antiguidade, ele entrou nos catálogos como estrela, e o nome ficou.

Nesta época, só de madrugada: em São Paulo, ele nasce perto da 1h30 e às 4h está a uns 25 graus de altura, no sudeste. ✨

📷 ESO
`, 'omega-centauri.jpg');

add('2026-11-26T15:30:00Z', 'texto', '26nov-meteorito-bendego', `
O maior meteorito já encontrado no Brasil pesa 5,36 toneladas e sobreviveu até a um incêndio.

É o Bendegó, um bloco de ferro e níquel que caiu do espaço no sertão da Bahia. Ele foi achado em 1784 por um menino que cuidava do gado, perto de onde hoje é a cidade de Monte Santo.

Tirar ele de lá foi uma saga. Na primeira tentativa, ainda em 1784, o carro de boi perdeu o freio e o meteorito foi parar num riacho, onde ficou por mais de cem anos. Só em 1888 uma expedição conseguiu levá-lo até o litoral e, de navio, até o Rio de Janeiro.

Desde então, ele está no Museu Nacional, na Quinta da Boa Vista. Em 2 de setembro de 2018, o museu pegou fogo e boa parte do acervo foi perdida. O Bendegó continuou lá, inteiro.

Quando foi encontrado, era o segundo maior meteorito conhecido no mundo. Hoje se conhecem outros maiores, mas ele segue sendo o maior do Brasil.

Uma pedra que atravessou o espaço e caiu na Terra não ia se render a um incêndio. ☄️
`);

add('2026-11-26T18:30:00Z', 'foto', '26nov-sirius-como-achar', `
Repara no pontinho embaixo, à esquerda da estrela grande. Ele é o que sobrou de uma estrela.

A estrela brilhante é Sirius, a mais brilhante do céu noturno, a 8,6 anos-luz daqui. O pontinho é Sirius B, a companheira dela: uma anã branca com quase a massa do Sol espremida num tamanho parecido com o da Terra. A foto é do telescópio Hubble; os raios em X são efeito do próprio telescópio.

Sirius B some no brilho da vizinha. Mas Sirius você acha hoje à noite (horários de São Paulo):

🕗 Ela nasce no leste perto das 20h10.
🕙 Às 22h, já está a uns 25 graus de altura, no leste, abaixo e à direita das Três Marias.
🕛 Perto da meia-noite, passa dos 50 graus e fica impossível de errar.

Perto do horizonte, ela pisca muito e muda de cor: azul, branco, vermelho, verde. Não é a estrela. É o ar da Terra agindo como um prisma e desviando cada cor de um jeito.

Na bandeira do Brasil, Sirius representa o Mato Grosso. 🐕

📷 NASA, ESA, H. Bond (STScI) e M. Barstow (University of Leicester)
`, 'sirius-a-e-b.jpg');

add('2026-11-26T22:30:00Z', 'texto', '26nov-urano-42-anos', `
Em Urano, cada polo passa 42 anos seguidos de dia e depois 42 anos seguidos de noite.

Isso acontece porque Urano gira deitado. O eixo dele é inclinado uns 98 graus, quase paralelo ao caminho que ele faz em volta do Sol. A Terra, pra comparar, tem 23,4 graus.

Urano leva 84 anos pra dar uma volta no Sol. Durante metade dessa volta, um dos polos fica virado pro Sol. Na outra metade, fica virado pro escuro.

Ou seja: quem nascesse no polo de Urano no começo do "verão" de lá veria o Sol no céu por 42 anos seguidos. Depois, 42 anos de escuridão.

Ninguém sabe ao certo por que ele tombou. A explicação mais aceita é uma pancada gigante de um corpo do tamanho da Terra, bilhões de anos atrás.

E tem mais: Urano só foi visitado uma vez, pela Voyager 2, em 1986, numa passagem rápida. Quase tudo o que se sabe de perto sobre ele veio dali.

Aqui, a gente reclama de um inverno de três meses. 🥶
`);

add('2026-11-27T00:00:00Z', 'foto', '26nov-lente-sorriso', `
Esse grupo de galáxias está sorrindo pra você. E o sorriso é a teoria de Einstein em ação.

Repara: os dois "olhos" são galáxias grandes e brilhantes. O "nariz" é outra galáxia. A boca e o contorno do rosto são arcos de luz.

Esses arcos são galáxias que ficam muito mais longe, atrás do grupo. A gravidade do aglomerado de galáxias da frente, chamado SDSS J1038+4849, é tão forte que entorta a luz delas no caminho até a Terra e espalha essa luz em arcos. Quando o alinhamento é quase perfeito, vira um anel, o anel de Einstein.

É o mesmo efeito medido no eclipse de Sobral, no Ceará, em 1919, quando a gravidade do Sol desviou um pouquinho a luz das estrelas. Lá, o desvio era minúsculo. Aqui, um aglomerado inteiro de galáxias funciona como uma lente gigante.

E os astrônomos usam essas lentes de propósito: elas ampliam galáxias tão distantes que, sem esse zoom natural, nenhum telescópio conseguiria ver.

Um sorriso que só existe porque a luz faz curva. 😊

📷 NASA e ESA (telescópio Hubble)
`, 'lente-sorriso.jpg');

const FILA = 'publicador/fb-posts/fila.json';
const atual = fs.existsSync(FILA) ? JSON.parse(fs.readFileSync(FILA, 'utf8')) : [];
const novos = P.filter(p => !atual.some(a => a.slug === p.slug));
fs.writeFileSync(FILA, JSON.stringify([...atual, ...novos], null, 2) + '\n');
console.log('adicionados', novos.length, 'total', atual.length + novos.length);
