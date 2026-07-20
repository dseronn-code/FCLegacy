export interface QuestionnaireStep {
  id: string;
  field: string;
  title: string;
  category: string;
  description: string;
  placeholder: string;
  presets: { label: string; value: string | string[] }[];
}

export const QUESTIONNAIRE_STEPS: QuestionnaireStep[] = [
  {
    id: "1",
    field: "1_personalidade",
    title: "Personalidade do Atleta",
    category: "Estilo & Mente",
    description: "Descreva o temperamento do seu jogador dentro e fora de campo. Ele é confiante, tímido, provocador ou exemplar?",
    placeholder: "Ex: Marrento & Confiante. O jogador sabe do seu potencial e não se intimida com adversários ou vaias...",
    presets: [
      {
        label: "Marrento & Confiante",
        value: "Marrento & Confiante. O jogador sabe do seu potencial e não se intimida com adversários ou vaias. Fala o que pensa e sustenta na bola."
      },
      {
        label: "Focado & Técnico",
        value: "Focado & Técnico. Extremamente focado em evolução constante, prefere falar com bola no pé e liderar pelo exemplo profissional."
      },
      {
        label: "Ousado & Provocador",
        value: "Ousado & Provocador. Adora dribles plásticos, comemorações extravagantes e inflamar as torcidas rival e aliada com sorrisos."
      }
    ]
  },
  {
    id: "2",
    field: "2_amigos_reais",
    title: "Amigos / Parças",
    category: "Estilo & Mente",
    description: "Quem são os grandes parças do jogador, sejam celebridades, outros atletas ou amigos reais de infância?",
    placeholder: "Ex: Rodrygo, Vinícius Jr, Léo, Gabriel...",
    presets: [
      {
        label: "Parças do Real Madrid",
        value: "Vinícius Jr, Rodrygo, Bellingham, Endrick"
      },
      {
        label: "Amigos de Infância",
        value: "Léo, Gabriel, Lucas, Mateus (os mesmos desde antes da fama)"
      },
      {
        label: "Trio da Seleção",
        value: "Neymar Jr, Lucas Paquetá, Richarlison"
      }
    ]
  },
  {
    id: "3",
    field: "3_namorada_real",
    title: "Namorada / Vida Sentimental",
    category: "Vida, Fortuna & Glamour",
    description: "Como anda o coração do craque? Rumores de romance secreto com influenciadoras, relacionamento sério ou solteiro cobiçado?",
    placeholder: "Ex: Valentina Zenere. Os rumores de romance secreto começaram após flagras em Milão...",
    presets: [
      {
        label: "Romance Secreto",
        value: "Valentina Zenere. Os rumores de romance secreto começaram após flagras em Milão e trocas constantes de emojis nas redes."
      },
      {
        label: "Foco Total (Solteiro)",
        value: "Nenhum romance confirmado. O jogador foca 100% na carreira, mas tabloides vivem especulando sobre affairs no jet set europeu."
      },
      {
        label: "Relacionamento Sólido",
        value: "Marta Díaz. Vivem um relacionamento sólido, compartilham fotos românticas e são vistos como o casal modelo do futebol."
      }
    ]
  },
  {
    id: "4",
    field: "4_situacao_financeira",
    title: "Gestão de Finanças",
    category: "Vida, Fortuna & Glamour",
    description: "Como o atleta lida com o salário astronômico de milhões de euros e quais são seus maiores investimentos?",
    placeholder: "Ex: Ganha um salário astronômico... Investiu pesado adquirindo uma cobertura cinematográfica em Dubai...",
    presets: [
      {
        label: "Investidor de Real Estate",
        value: "Ganha um salário astronômico de milhões de euros no clube. Investiu pesado adquirindo uma cobertura cinematográfica em Dubai Marina e diversificou seus lucros em holdings imobiliárias de alto padrão."
      },
      {
        label: "Anjo de Startups",
        value: "Faturando valores milionários de salário e publicidade. Investe ativamente em startups de tecnologia esportiva, e-sports e fundos de investimentos suíços altamente blindados."
      },
      {
        label: "Colecionador de Ativos",
        value: "Rendimentos astronômicos. Prefere investir em obras de arte raras, relógios de luxo de edição limitada e resorts paradisíacos privados na costa espanhola."
      }
    ]
  },
  {
    id: "5",
    field: "5_historia_de_vida",
    title: "História de Vida & Origem",
    category: "Carreira & Origens",
    description: "Qual é a história de superação ou a origem do jogador até chegar ao estrelato do futebol profissional?",
    placeholder: "Ex: Cresceu driblando garotos muito maiores nas quadras de areia e futebol de rua de sua cidade natal...",
    presets: [
      {
        label: "Futebol de Rua",
        value: "Cresceu driblando garotos muito maiores nas quadras de areia e futebol de rua. Superou severas dificuldades na infância graças ao talento bruto e apoio incondicional de sua família humilde."
      },
      {
        label: "Menino de Ouro",
        value: "Formado nas categorias de base tradicionais de um clube gigante do país, chamou a atenção de olheiros europeus desde muito jovem devido à sua genialidade precoce e controle de bola espetacular."
      },
      {
        label: "Garra de Interior",
        value: "Iniciou sua trajetória na escolinha local no interior de sua província. Quase desistiu aos 14 anos por problemas de altura, mas deu a volta por cima em um teste relâmpago que mudou sua vida."
      }
    ]
  },
  {
    id: "6",
    field: "6_vivia_bem",
    title: "Estilo de Vida (Férias e Alto Padrão)",
    category: "Vida, Fortuna & Glamour",
    description: "Como o jogador desfruta seu estilo de vida luxuoso em mansões e viagens paradisíacas nas férias?",
    placeholder: "Ex: Mora em uma mansão cinematográfica e viaja a bordo de iates de luxo navegando com amigos...",
    presets: [
      {
        label: "Ibiza Summer",
        value: "Mora em uma mansão cinematográfica com tecnologia futurista. Viaja a bordo de iates de luxo fretados navegando com amigos próximos pela badalada Costa de Ibiza e ilhas gregas."
      },
      {
        label: "Alpes & Neve",
        value: "Prefere o sossego de uma residência ultraprotegida na serra. Passa suas folgas de inverno esquiando em chalés exclusivos nos Alpes Suíços com a família mais íntima."
      },
      {
        label: "Maldivas Island",
        value: "Passa suas folgas de verão em bangalôs cinematográficos flutuantes nas praias paradisíacas e privativas das Maldivas, totalmente blindado contra paparazzis europeus."
      }
    ]
  },
  {
    id: "7",
    field: "7_relacao_familiar",
    title: "Relação Familiar pós-Fama",
    category: "Vida, Fortuna & Glamour",
    description: "Como é o contato e o apoio da família na vida do craque após ele atingir a fama mundial?",
    placeholder: "Ex: Mantém laços inquebráveis... Blindou seus pais contra o assédio oportunista...",
    presets: [
      {
        label: "Laço de Aço",
        value: "Apesar do distanciamento físico pelas viagens, mantém laços inquebráveis. Blindou seus pais contra o assédio oportunista e os presenteou com propriedades de luxo em sua terra natal."
      },
      {
        label: "Família Empresária",
        value: "Seus familiares gerenciam diretamente sua holding financeira e contratos de imagem, garantindo que o craque mantenha o foco total nas quatro linhas e os pés sempre no chão."
      },
      {
        label: "União Divina",
        value: "Garante passagens de primeira classe e camarotes exclusivos para ter os pais e irmãos presentes em todos os seus jogos decisivos na Europa, mantendo a base familiar sempre unida."
      }
    ]
  },
  {
    id: "8",
    field: "8_comportamento",
    title: "Comportamento & Comemorações",
    category: "Estilo & Mente",
    description: "Como ele se comporta nas comemorações de gols e provocações saudáveis?",
    placeholder: "Ex: Dentro de campo, é puro espetáculo. Comemora gols mandando as torcidas rivais se calarem...",
    presets: [
      {
        label: "Mandando Calar",
        value: "Dentro de campo, é puro espetáculo. Comemora gols mandando as torcidas rivais se calarem e fazendo caretas audaciosas para as câmeras, chuta a bandeira de escanteio com raça."
      },
      {
        label: "Acrobacias Ousadas",
        value: "Dono de uma elasticidade surreal, celebra seus gols decisivos com saltos acrobáticos perfeitos e cambalhotas ousadas que levantam o estádio inteiro."
      },
      {
        label: "Amor à Camisa",
        value: "Comemora correndo em direção à câmera, batendo forte no escudo do clube e apontando os dedos para o céu, mostrando gratidão, respeito e conexão profunda."
      }
    ]
  },
  {
    id: "9",
    field: "9_fortuna_e_carros_reais",
    title: "Fortuna & Carros de Luxo",
    category: "Vida, Fortuna & Glamour",
    description: "Qual é a estimativa do patrimônio líquido e as principais máquinas automotivas estacionadas na garagem?",
    placeholder: "Ex: Seu patrimônio líquido em 2026 já ultrapassa €280 milhões. Na garagem destacam-se a Ferrari SF90 Stradale...",
    presets: [
      {
        label: "Garagem Italiana",
        value: "Seu patrimônio líquido em 2026 já ultrapassa €280 milhões. Na garagem destacam-se a novíssima Ferrari SF90 Stradale vermelha e uma Lamborghini Revuelto híbrida de 1015 cv personalizada."
      },
      {
        label: "Hipercarros Raros",
        value: "Fortuna colossal estimada em €315 milhões. Ostenta uma coleção impecável de supercarros incluindo um raríssimo Bugatti Tourbillon sob encomenda e um Porsche 911 GT3 RS para as pistas."
      },
      {
        label: "Aço de Luxo Britânico",
        value: "Patrimônio estimado em €250 milhões. Seu xodó automotivo é um Aston Martin Valour manual de edição limitada, além de um jipe Mercedes-AMG G63 blindado para locomoção diária."
      }
    ]
  },
  {
    id: "10",
    field: "10_patrocinios_reais",
    title: "Patrocínios Reais",
    category: "Vida, Fortuna & Glamour",
    description: "Selecione ou liste as marcas reais de 2026 que fecharam patrocínio bilionário com o craque:",
    placeholder: "Ex: Nike, Red Bull, EA Sports FC, Rolex (separados por vírgula)",
    presets: [
      {
        label: "Linha Nike Vitalícia",
        value: "Nike (Contrato Vitalício), Red Bull, EA Sports FC, Rolex"
      },
      {
        label: "Embaixador Adidas",
        value: "Adidas (Principal Embaixador), Gatorade, Louis Vuitton, Hublot"
      },
      {
        label: "Elite Puma & Games",
        value: "Puma (Chuteira Própria), Monster Energy, PlayStation, TAG Heuer"
      }
    ]
  },
  {
    id: "11",
    field: "11_expectativa_carreira",
    title: "Expectativa da Carreira",
    category: "Carreira & Origens",
    description: "Qual é o teto que a mídia mundial enxerga para o jogador? Herdeiro de tronos ou ídolo duradouro?",
    placeholder: "Ex: Apontado unanimemente por analistas mundiais como o sucessor natural para vencer a Bola de Ouro...",
    presets: [
      {
        label: "Sucessor da Bola de Ouro",
        value: "Apontado unanimemente por analistas mundiais como o sucessor natural para vencer a cobiçada Bola de Ouro e ditar a hegemonia do futebol mundial na próxima década."
      },
      {
        label: "Estrela Lendária Nacional",
        value: "Projetado para ser o maior camisa 10 da história de sua seleção nacional, carregando as esperanças do país de conquistar a próxima Copa do Mundo."
      },
      {
        label: "Gênio Imparável",
        value: "Sua mentalidade implacável faz com que seja visto como um quebrador de recordes nato, destinado a empilhar títulos da Champions League pelos maiores clubes da Europa."
      }
    ]
  },
  {
    id: "12",
    field: "12_desempenho_campo",
    title: "Desempenho em Campo",
    category: "Dentro de Campo",
    description: "Quais são as principais táticas, estilo de drible, arrancadas e técnicas especiais do seu jogador?",
    placeholder: "Ex: Dono de arranque devastador e drible liso em espaços curtos. Alia velocidade física com controle de bola magnético...",
    presets: [
      {
        label: "Drible & Velocidade Explosiva",
        value: "Dono de arranque devastador e drible liso em espaços curtos. Alia velocidade física insana com controle de bola magnético, mudando de direção sem perder o equilíbrio."
      },
      {
        label: "Maestro Pensador",
        value: "Sua inteligência tática avançada permite encontrar assistências brilhantes e espaços impossíveis. Chute colocado cirúrgico e extrema precisão na bola parada."
      },
      {
        label: "Matador Clínico de Área",
        value: "Demonstra frieza extraordinária cara a cara com o goleiro rival. Ótimo poder de finalização com ambas as pernas e posicionamento letal dentro da grande área."
      }
    ]
  },
  {
    id: "13",
    field: "13_clubes_europa",
    title: "Clubes Anteriores",
    category: "Carreira & Origens",
    description: "Escreva os times que o jogador passou na juventude ou em transição na Europa até o clube atual:",
    placeholder: "Ex: Ajax, Benfica, Borussia Dortmund (separados por vírgula)",
    presets: [
      {
        label: "Rota Ajax (Formação de Elite)",
        value: "Clube de Origem Nacional, Ajax Amsterdam"
      },
      {
        label: "Rota Benfica (Trampolim Português)",
        value: "Categorias de Base Locais, Benfica"
      },
      {
        label: "Revelação Alemanha",
        value: "Clube Revelação de Origem, Borussia Dortmund"
      }
    ]
  },
  {
    id: "14",
    field: "14_clube_atual",
    title: "Clube Atual (2026)",
    category: "Carreira & Origens",
    description: "Descreva a posição do jogador na engrenagem tática e vestiário do seu clube de futebol atual em 2026.",
    placeholder: "Ex: Brilha como o camisa 7 indiscutível do Real Madrid, liderando o ataque na Champions League...",
    presets: [
      {
        label: "Protagonista Real Madrid",
        value: "Brilha como o camisa 7 indiscutível do Real Madrid, liderando o ataque na Champions League sob grande carisma e idolatria absoluta do Santiago Bernabéu."
      },
      {
        label: "Cérebro no Chelsea",
        value: "Camisa 10 e principal articulador tático do Chelsea, responsável por carregar o meio-campo e comandar a retomada do time rumo ao topo da Premier League."
      },
      {
        label: "Artilheiro no Bayern",
        value: "O homem-gol imparável do Bayern de Munique, terror das defesas da Bundesliga e atual líder isolado na corrida pela Chuteira de Ouro europeia."
      }
    ]
  },
  {
    id: "15",
    field: "15_estilo_altura_idolos",
    title: "Estilo, Altura & Ídolos",
    category: "Dentro de Campo",
    description: "Mencione o estilo estético do jogador, sua estatura física e quem são os seus ídolos inspiradores na infância.",
    placeholder: "Ex: Ponta moderno de drible ousado e plasticidade ímpar. Altura: 1.82 m. Seus grandes ídolos inspiradores são Cristiano Ronaldo e Ronaldinho Gaúcho...",
    presets: [
      {
        label: "Inspirado em CR7 & Ronaldinho",
        value: "Ponta moderno de drible ousado e plasticidade ímpar. Altura: 1.82 m. Seus grandes ídolos inspiradores são Cristiano Ronaldo, Ronaldinho Gaúcho e Neymar Jr."
      },
      {
        label: "Inspirado em Messi & Zidane",
        value: "Meia clássico de centro de gravidade baixo, drible colado e alta agilidade. Altura: 1.74 m. Seus grandes ídolos inspiradores são Lionel Messi e Zinedine Zidane."
      },
      {
        label: "Inspirado em R9 Fenômeno",
        value: "Centroavante de potência física inigualável e arrancada demolidora. Altura: 1.86 m. Seus ídolos inspiradores de infância são Ronaldo Fenômeno e Thierry Henry."
      }
    ]
  },
  {
    id: "16",
    field: "16_relacionamentos_elenco",
    title: "Relacionamentos no Elenco",
    category: "Estilo & Mente",
    description: "Como é o convívio dele no vestiário? É um líder nato, o brincalhão do elenco ou prefere ficar mais isolado?",
    placeholder: "Ex: Visto como o verdadeiro líder técnico do vestiário do clube, respeitado por veteranos e novatos...",
    presets: [
      {
        label: "Líder Técnico & Respeitado",
        value: "Visto como o verdadeiro líder técnico do vestiário do clube, respeitado por veteranos pela ética nos treinos e adorado pelos mais jovens como mentor esportivo."
      },
      {
        label: "O Rei da Resenha",
        value: "Líder carismático indiscutível do elenco, comanda as brincadeiras e dita as músicas no vestiário, unindo o grupo sob uma atmosfera vencedora e descontraída."
      },
      {
        label: "Profissional Silencioso",
        value: "Mantém um convívio focado e profissional. Fala pouco, evita grupos e concentra 100% de sua energia na execução perfeita das instruções táticas do treinador."
      }
    ]
  },
  {
    id: "17",
    field: "17_satisfacao_clube",
    title: "Satisfação com o Clube",
    category: "Estilo & Mente",
    description: "Como o atleta se sente no atual clube e como ele lida com sondagens bilionárias de outras equipes?",
    placeholder: "Ex: Sente-se inteiramente prestigiado em carregar as cores do clube. Ignora o assédio externo...",
    presets: [
      {
        label: "Amor Eterno à Camisa",
        value: "Sente-se inteiramente prestigiado em carregar as cores do clube. Recusou ofertas financeiras astronômicas de outros continentes para focar em construir uma hegemonia histórica local."
      },
      {
        label: "Sempre Ambicioso",
        value: "Gosta do clube atual, mas deixa claro em entrevistas que seu compromisso é com a glória desportiva. Exige que o time continue contratando estrelas para disputar taças."
      },
      {
        label: "Devoto à Torcida",
        value: "Declaradamente apaixonado pelo carinho fervoroso das arquibancadas locais, afirma que o respeito do torcedor é algo que nenhum xeque árabe ou clube inglês consegue comprar."
      }
    ]
  },
  {
    id: "18",
    field: "18_time_do_coracao",
    title: "Time do Coração de Infância",
    category: "Carreira & Origens",
    description: "Qual era o clube pelo qual o jogador chorava e torcia na infância antes de se tornar um atleta profissional?",
    placeholder: "Ex: O clássico clube nacional que ele assistia com o pai na arquibancada desde garotinho...",
    presets: [
      {
        label: "Gigante Nacional",
        value: "O lendário clube gigante nacional que assistia com o pai na arquibancada vibrante desde pequeno, sonhando em um dia pisar no mesmo gramado."
      },
      {
        label: "Clube da Cidade Natal",
        value: "O clube tradicional de sua cidade natal onde toda a sua família torce fervorosamente há gerações e onde ele deu seus primeiros chutes."
      },
      {
        label: "Hegeomonias da TV",
        value: "O superclube europeu que ele acompanhava pela televisão na infância nas tardes de Champions League, copiando os cortes de cabelo das estrelas."
      }
    ]
  },
  {
    id: "19",
    field: "19_nascimento",
    title: "Data de Nascimento & Idade",
    category: "Carreira & Origens",
    description: "Indique o ano, a data e a idade exata com que o atleta brilha nas competições de 2026.",
    placeholder: "Ex: Nascido em 12 de janeiro de 2004. Atualmente tem 22 anos, jovem com imenso potencial...",
    presets: [
      {
        label: "Geração 2004 (22 anos)",
        value: "Nascido em 12 de janeiro de 2004. Atualmente tem 22 anos de idade, combinando vigor físico juvenil com uma maturidade tática fora do comum."
      },
      {
        label: "Geração 2005 (21 anos)",
        value: "Nascido em 25 de maio de 2005. Um verdadeiro garoto prodígio de apenas 21 anos que brilha assustadoramente precoce sob os holofotes."
      },
      {
        label: "Geração 2003 (23 anos)",
        value: "Nascido em 14 de setembro de 2003. Com 23 anos, vive o início do ápice físico e consolidação técnica como estrela de primeira grandeza."
      }
    ]
  },
  {
    id: "20",
    field: "20_biometria",
    title: "Biometria & Físico",
    category: "Dentro de Campo",
    description: "Especifique a altura, peso, tipo físico e cuidados de condicionamento corporal de alto rendimento do craque.",
    placeholder: "Ex: Altura exata de 1.82 m e peso de 75 kg. Condicionamento físico excepcional de atleta de elite...",
    presets: [
      {
        label: "Estatura Ideal e Ágil",
        value: "Altura exata de 1.82 m e peso de 75 kg. Condicionamento físico excepcional de atleta de elite, combinando leveza nas arrancadas com forte impulsão."
      },
      {
        label: "Baixo Centro de Gravidade",
        value: "Altura de 1.75 m e peso de 69 kg. Baixíssimo centro de gravidade propício para giros rápidos, frenagens bruscas e drible desconcertante."
      },
      {
        label: "Físico Imponente",
        value: "Altura de 1.89 m e peso de 83 kg. Porte físico avantajado e musculatura firme que impõe respeito no combate direto com os defensores mais duros."
      }
    ]
  }
];
