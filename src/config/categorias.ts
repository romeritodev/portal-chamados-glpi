/**
 * Catálogo visual da tela inicial (spec §5.2).
 *
 * A lista saiu da leitura dos 716 chamados já registrados no GLPI: cada card
 * existe porque as pessoas realmente pedem aquilo, e a ordem segue o volume.
 * O maior achado foi "Publicar no site" — 15% de tudo, que antes caía em
 * "Outro problema" por não ter onde ir.
 *
 * Cada card mapeia para uma categoria ITIL do GLPI (`itilcategories_id`), e
 * cada atalho para uma subcategoria. Os atalhos servem a dois propósitos ao
 * mesmo tempo: resolvem a folha em branco de quem não sabe descrever o
 * problema (tocar já escreve a frase, editável) e registram a subcategoria
 * sem custar um passo a mais no assistente.
 *
 * `categoriaId: null` → chamado criado SEM categoria (o técnico classifica).
 * Para conferir os IDs: GLPI → Configurar → Intitulados → Categorias ITIL.
 */

/**
 * Tipo do chamado no GLPI (1 = Incidente, 2 = Requisição).
 *
 * NÃO perguntamos isso à pessoa. "Incidente ou requisição?" é jargão ITIL —
 * o mesmo que tiramos de todas as telas — e os 725 chamados já registrados
 * mostram que nem quem conhece o GLPI acerta: cruzando o tipo gravado com o
 * que o título diz, 104 de 566 casos nítidos discordam (quase 1 em 5).
 * "Instalação Tela Interativa" está marcado como incidente; "Impressora nao
 * imprime", como requisição.
 *
 * A pessoa já responde a pergunta ao escolher o card e o atalho: ela não sabe
 * o que é uma requisição, mas sabe muito bem a diferença entre "a impressora
 * não imprime" e "a impressora está sem toner". A regra que aplicamos é essa,
 * e dá para conferir de fora: parou de funcionar → incidente; preciso de algo
 * novo ou de uma ação → requisição.
 */
export type TipoChamado = 1 | 2;

/**
 * Setores (entidades do GLPI) usados nas regras de visibilidade. São ids de
 * secretaria — como a comparação sobe pela árvore, cada um cobre tudo que
 * está abaixo dele (SAUDE pega os PSF, a Vacina, a Farmácia e o Plantão).
 *
 * NUNCA use aqui a Entidade raiz (0) nem "Prefeitura Municipal" (32): elas
 * são ancestrais de TODO MUNDO, então a cadeia de qualquer pessoa contém as
 * duas e a regra passa a valer para a prefeitura inteira — o oposto de
 * restringir, sem nenhum sinal de que deu errado. Foi assim que o e-SUS
 * apareceu para o RH.
 */
export const SETOR = {
  ADMINISTRACAO: 1,
  ASSISTENCIA_SOCIAL: 3,
  CULTURA: 4,
  EDUCACAO: 5,
  SAUDE: 6,
  TRANSPORTE: 8,
  RECURSOS_HUMANOS: 15,
  CAMARA: 33,
  PUBLICACAO_SITE: 49,
} as const;

export const INCIDENTE: TipoChamado = 1;
export const REQUISICAO: TipoChamado = 2;

export interface AtalhoRelato {
  /** identificador estável (não muda ao renomear o rótulo) */
  slug: string;
  /** o que aparece no botão — curto, cabe em tela estreita */
  rotulo: string;
  /** frase que preenche o relato; o usuário pode editar por cima */
  texto: string;
  /** subcategoria no GLPI */
  categoriaId: number | null;
  /** só quando o atalho foge do tipo do card (ex.: toner dentro de Impressora) */
  tipo?: TipoChamado;
  /** ver `setores` no card — mesma regra, aplicada ao atalho */
  setores?: number[];
  /**
   * Dica mostrada ANTES de abrir o chamado, quando o problema costuma se
   * resolver sozinho. Nunca impede de continuar — o botão de abrir chamado
   * fica do lado, do mesmo tamanho.
   */
  ajuda?: { titulo: string; texto: string };
}

export interface CategoriaCard {
  /** identificador estável usado pelo formulário (não muda ao renomear) */
  slug: string;
  titulo: string;
  descricao: string;
  /** emoji exibido no card */
  icone: string;
  /** itilcategories_id no GLPI — null = sem categoria */
  categoriaId: number | null;
  /** tipo aplicado quando a pessoa não escolhe atalho nenhum */
  tipo: TipoChamado;
  /**
   * Setores para quem este item aparece de entrada. Ausente = todos veem.
   *
   * Só restringimos onde os 725 chamados mostram concentração de verdade, e
   * sempre com o link "não achei meu caso" revelando o que foi escondido —
   * um cadastro de setor errado no GLPI não pode impedir ninguém de abrir
   * chamado. Cards de todo mundo (impressora, computador, internet, telefone)
   * ficam sem regra de propósito: impressora apareceu em 12 secretarias.
   */
  setores?: number[];
  atalhos?: AtalhoRelato[];
  /** passo 2 com formulário próprio em vez da caixa de relato */
  formulario?: "publicacao";
}

export const CATEGORIAS: CategoriaCard[] = [
  {
    slug: "impressora",
    titulo: "Impressora",
    descricao: "Não imprime, sem tinta",
    icone: "🖨️",
    categoriaId: 3, // IMPRESSORA
    tipo: INCIDENTE,
    atalhos: [
      {
        slug: "nao-imprime",
        rotulo: "Não imprime",
        texto: "A impressora não está imprimindo.",
        categoriaId: 43,
      },
      {
        slug: "sem-tinta",
        rotulo: "Sem tinta / toner",
        texto: "A impressora está sem tinta ou o toner acabou.",
        categoriaId: 44,
        tipo: REQUISICAO, // nada quebrou: é pedido de suprimento
      },
      {
        slug: "papel-preso",
        rotulo: "Papel preso",
        texto: "Tem papel preso dentro da impressora.",
        categoriaId: 45,
        ajuda: {
          titulo: "Muitas vezes dá para resolver em um minuto",
          texto:
            "Desligue a impressora, abra a tampa e puxe o papel devagar, sempre no sentido da saída — puxar para trás costuma rasgar e deixar pedaço dentro. Confira se não sobrou nenhum pedaço, feche a tampa e ligue de novo.",
        },
      },
      {
        slug: "nao-digitaliza",
        rotulo: "Não digitaliza",
        texto: "A impressora não está digitalizando (escaneando).",
        categoriaId: 46,
      },
      {
        slug: "falhando",
        rotulo: "Impressão falhando",
        texto: "A impressão está saindo falhada, fraca ou com defeito.",
        categoriaId: 63,
      },
    ],
  },
  {
    slug: "computador",
    titulo: "Computador",
    descricao: "Não liga ou está lento",
    icone: "🖥️",
    categoriaId: 20, // HARDWARE E PERIFÉRICOS
    tipo: INCIDENTE,
    atalhos: [
      { slug: "nao-liga", rotulo: "Não liga", texto: "O computador não está ligando.", categoriaId: 47 },
      {
        slug: "lento",
        rotulo: "Lento / travando",
        texto: "O computador está muito lento e travando.",
        categoriaId: 48,
      },
      {
        slug: "monitor",
        rotulo: "Monitor ou teclado",
        texto: "Tem problema no monitor, teclado ou mouse.",
        categoriaId: 49,
      },
      { slug: "sem-som", rotulo: "Sem som", texto: "O computador está sem som.", categoriaId: 50 },
    ],
  },
  {
    slug: "publicar-site",
    titulo: "Publicar no site",
    descricao: "Edital, ata, notícia",
    icone: "📢",
    categoriaId: 27, // PUBLICAÇÃO NO SITE
    tipo: REQUISICAO, // publicar é sempre pedido, nunca defeito
    // 103 chamados, 6 secretarias: Administração 61%, Educação 17%,
    // Cultura 13%, Assistência Social 6%. As outras nunca publicaram nada.
    setores: [
      SETOR.ADMINISTRACAO,
      SETOR.EDUCACAO,
      SETOR.CULTURA,
      SETOR.ASSISTENCIA_SOCIAL,
      SETOR.PUBLICACAO_SITE,
    ],
    formulario: "publicacao",
    atalhos: [
      { slug: "edital", rotulo: "Edital", texto: "Edital", categoriaId: 28 },
      { slug: "ata", rotulo: "Ata / resultado", texto: "Ata ou resultado", categoriaId: 29 },
      { slug: "portaria", rotulo: "Portaria", texto: "Portaria", categoriaId: 30 },
      { slug: "noticia", rotulo: "Notícia", texto: "Notícia", categoriaId: 31 },
      { slug: "banner", rotulo: "Banner", texto: "Banner", categoriaId: 32 },
      { slug: "outro-doc", rotulo: "Outro", texto: "Outro documento", categoriaId: 27 },
    ],
  },
  {
    slug: "sistema",
    titulo: "Sistemas",
    descricao: "e-SUS, ADPM e outros",
    icone: "💻",
    categoriaId: 25, // SISTEMAS
    tipo: INCIDENTE,
    atalhos: [
      {
        slug: "esus",
        rotulo: "e-SUS",
        texto: "Estou com problema no e-SUS.",
        categoriaId: 51,
        // 36 chamados, 94% na Saúde (Secretaria, PSF, Vacina, Regulação)
        setores: [SETOR.SAUDE],
      },
      {
        slug: "adpm",
        rotulo: "ADPM",
        texto: "Estou com problema no sistema da ADPM.",
        categoriaId: 52,
        // 26 chamados, 88% na Administração (Contabilidade, Tesouraria, RH)
        setores: [SETOR.ADMINISTRACAO, SETOR.CAMARA],
      },
      {
        slug: "ponto-rapido",
        rotulo: "Ponto Rápido",
        texto: "Estou com problema no Ponto Rápido (sistema do relógio de ponto).",
        categoriaId: 60,
        // sistema do relógio de ponto: quem opera é o RH
        setores: [SETOR.RECURSOS_HUMANOS],
      },
      {
        slug: "ecac",
        rotulo: "e-CAC",
        texto: "Estou com problema no e-CAC.",
        categoriaId: 61,
      },
      {
        slug: "sistemas-gov",
        rotulo: "Sistemas Gov",
        texto: "Estou com problema em um sistema do governo (gov.br).",
        categoriaId: 62,
      },
      {
        slug: "nao-abre",
        rotulo: "Não abre",
        texto: "O sistema não abre ou está fora do ar.",
        categoriaId: 53,
      },
      {
        slug: "erro-salvar",
        rotulo: "Erro ao salvar",
        texto: "Dá erro na hora de salvar no sistema.",
        categoriaId: 54,
      },
    ],
  },
  {
    slug: "internet",
    titulo: "Internet e rede",
    descricao: "Sem conexão, pasta de rede",
    icone: "🌐",
    categoriaId: 1, // REDE
    tipo: INCIDENTE,
    atalhos: [
      { slug: "sem-internet", rotulo: "Sem internet", texto: "Estou sem internet.", categoriaId: 14 },
      {
        slug: "internet-lenta",
        rotulo: "Lenta / caindo",
        texto: "A internet está muito lenta e caindo toda hora.",
        categoriaId: 55,
      },
      {
        slug: "wifi",
        rotulo: "Wi-Fi",
        texto: "Estou com problema no Wi-Fi.",
        categoriaId: 64,
      },
      {
        slug: "pasta-rede",
        rotulo: "Pasta de rede",
        texto: "Não consigo acessar a pasta de rede.",
        categoriaId: 12,
      },
    ],
  },
  {
    slug: "senha-acesso",
    titulo: "Senha e acesso",
    descricao: "Senha, certificado, token",
    icone: "🔐",
    categoriaId: 33, // SENHA E ACESSO
    // trocar senha e liberar acesso são ações pedidas, não coisa quebrada
    tipo: REQUISICAO,
    atalhos: [
      {
        slug: "esqueci-senha",
        rotulo: "Esqueci a senha",
        texto: "Esqueci minha senha e preciso de uma nova.",
        categoriaId: 34,
      },
      {
        slug: "bloqueado",
        rotulo: "Usuário bloqueado",
        texto: "Meu usuário está bloqueado.",
        categoriaId: 35,
      },
      {
        slug: "certificado",
        rotulo: "Certificado / token",
        texto: "Estou com problema no certificado digital / token.",
        categoriaId: 36,
        tipo: INCIDENTE, // funcionava e parou
      },
      {
        slug: "criar-acesso",
        rotulo: "Criar acesso",
        texto: "Preciso criar um acesso novo.",
        categoriaId: 37,
      },
    ],
  },
  {
    // Card próprio a pedido da equipe: em volume o e-mail é pequeno (9
    // chamados em três anos e meio), mas é palavra que a pessoa procura na
    // tela — e achar rápido vale mais que economizar uma linha.
    slug: "email",
    titulo: "E-mail",
    descricao: "Não recebe, criar, senha",
    icone: "✉️",
    categoriaId: 26, // E-MAIL
    tipo: INCIDENTE,
    atalhos: [
      {
        slug: "nao-recebe",
        rotulo: "Não recebe / não envia",
        texto: "Meu e-mail não está recebendo nem enviando mensagens.",
        categoriaId: 56,
      },
      {
        slug: "senha-email",
        rotulo: "Esqueci a senha",
        texto: "Esqueci a senha do meu e-mail.",
        categoriaId: 57,
        tipo: REQUISICAO,
      },
      {
        slug: "criar-email",
        rotulo: "Criar e-mail",
        texto: "Preciso criar um e-mail novo.",
        categoriaId: 58,
        tipo: REQUISICAO,
      },
      {
        slug: "arquivo-grande",
        rotulo: "Enviar arquivo grande",
        texto: "Preciso enviar um arquivo grande demais para o e-mail.",
        categoriaId: 59,
        tipo: REQUISICAO,
      },
    ],
  },
  {
    slug: "telefone",
    titulo: "Telefone / Ramal",
    descricao: "Telefone ou ramal com defeito",
    icone: "☎️",
    categoriaId: 2, // TELEFONIA
    tipo: INCIDENTE,
    atalhos: [
      { slug: "sem-linha", rotulo: "Sem linha", texto: "O telefone está sem linha.", categoriaId: 11 },
      {
        slug: "nao-funciona",
        rotulo: "Não recebe / não liga",
        texto: "O telefone não recebe nem faz ligações.",
        categoriaId: 9,
      },
      {
        slug: "instalar-ramal",
        rotulo: "Instalar ramal",
        texto: "Preciso instalar um telefone ou ramal novo.",
        categoriaId: 7,
        tipo: REQUISICAO,
      },
    ],
  },
  // Os equipamentos de setor viraram cards próprios, a pedido da equipe. Em
  // vez de "Outro equipamento" com quatro atalhos que quase ninguém usava, a
  // pessoa da Educação vê "Tela interativa" na primeira tela e o RH vê
  // "Relógio de ponto". Como cada um só aparece no seu setor, a lista não
  // engorda para ninguém — quem não é de nenhum deles vê três cards a menos.
  {
    slug: "tela-interativa",
    titulo: "Tela interativa",
    descricao: "Tela das salas de aula",
    icone: "📺",
    categoriaId: 40, // OUTRO EQUIPAMENTO > TELA INTERATIVA
    tipo: INCIDENTE,
    setores: [SETOR.EDUCACAO],
    atalhos: [
      { slug: "tela-nao-liga", rotulo: "Não liga", texto: "A tela interativa não está ligando.", categoriaId: 69 },
      {
        slug: "tela-toque",
        rotulo: "Não responde ao toque",
        texto: "A tela interativa não responde quando eu toco.",
        categoriaId: 70,
      },
      {
        slug: "tela-imagem",
        rotulo: "Sem imagem ou som",
        texto: "A tela interativa está sem imagem ou sem som.",
        categoriaId: 71,
      },
    ],
  },
  {
    slug: "relogio-ponto",
    titulo: "Relógio de ponto",
    descricao: "Registro de ponto dos servidores",
    icone: "⏰",
    categoriaId: 39, // OUTRO EQUIPAMENTO > RELÓGIO DE PONTO
    tipo: INCIDENTE,
    setores: [SETOR.RECURSOS_HUMANOS],
    atalhos: [
      {
        slug: "ponto-nao-registra",
        rotulo: "Não registra o ponto",
        texto: "O relógio não está registrando o ponto.",
        categoriaId: 65,
      },
      {
        slug: "ponto-nao-liga",
        rotulo: "Não liga",
        texto: "O relógio de ponto não está ligando.",
        categoriaId: 66,
      },
      {
        // "Troca papel Relogio Ponto" — suprimento, igual ao toner
        slug: "ponto-sem-papel",
        rotulo: "Sem papel",
        texto: "O relógio de ponto está sem papel.",
        categoriaId: 67,
        tipo: REQUISICAO,
      },
      {
        // cobre "Relogio ponto sem acesso" e "Pendrive nao funciona no relogio"
        slug: "ponto-registros",
        rotulo: "Não consigo baixar os registros",
        texto: "Não estou conseguindo baixar os registros do relógio de ponto.",
        categoriaId: 68,
      },
    ],
  },
  {
    // mesma lógica dos dois acima: 10 de 10 chamados no Plantão-Urgência, e o
    // aparelho só existe na Saúde. Sem card próprio ele sumiria da tela junto
    // com o "Outro equipamento".
    slug: "eletro",
    titulo: "Eletro",
    descricao: "Aparelho de eletrocardiograma",
    // 💓 (2010) e não 🫀 (coração anatômico, 2020): o novo vira quadradinho
    // vazio em Android antigo e Windows desatualizado, e este card é do
    // Plantão-Urgência — onde a chance de máquina velha é maior. Todos os
    // outros ícones do catálogo são de 2010–2014, de suporte universal.
    icone: "💓",
    categoriaId: 42, // OUTRO EQUIPAMENTO > ELETROCARDIÓGRAFO
    tipo: INCIDENTE,
    setores: [SETOR.SAUDE],
    atalhos: [
      {
        // "Eletro nao registrando" apareceu três vezes, sempre igual
        slug: "eletro-nao-registra",
        rotulo: "Não registra o exame",
        texto: "O eletro não está registrando o exame.",
        categoriaId: 73,
      },
      {
        slug: "eletro-nao-liga",
        rotulo: "Não liga",
        texto: "O eletro não está ligando.",
        categoriaId: 74,
      },
      {
        // "Verificar Sistema do eletro", "Eletro indisponivel"
        slug: "eletro-sistema",
        rotulo: "Sistema fora do ar",
        texto: "O sistema do eletro está fora do ar.",
        categoriaId: 75,
      },
      {
        // "Impressora eletro problema" — o laudo sai por ela
        slug: "eletro-impressora",
        rotulo: "Impressora do eletro",
        texto: "A impressora do eletro está com problema.",
        categoriaId: 76,
      },
    ],
  },
  {
    slug: "documentos",
    titulo: "Documentos e programas",
    descricao: "Word, Excel, PDF",
    icone: "📄",
    categoriaId: 4, // PACOTE OFFICE
    // "converter PDF", "ajuda para formatar" — é pedido de ajuda, não defeito
    tipo: REQUISICAO,
  },
  {
    slug: "outro",
    titulo: "Outro problema",
    descricao: "Nenhuma das opções acima",
    icone: "❓",
    categoriaId: null, // sem categoria — o técnico classifica no GLPI
    // sem informação para deduzir: fica o padrão do GLPI, e o técnico ajusta
    tipo: INCIDENTE,
  },
];

export function categoriaPorSlug(slug: string): CategoriaCard | undefined {
  return CATEGORIAS.find((c) => c.slug === slug);
}

/**
 * Resolve a subcategoria dentro de um card. Fica no servidor de propósito:
 * o browser manda o slug, nunca o número da categoria do GLPI.
 */
export function atalhoPorSlug(
  categoria: CategoriaCard | undefined,
  slug: string,
): AtalhoRelato | undefined {
  return categoria?.atalhos?.find((a) => a.slug === slug);
}

/** Chave usada na configuração da tela ⚙️ › Serviços. */
export function chaveVisibilidade(cardSlug: string, atalhoSlug?: string): string {
  return atalhoSlug ? `${cardSlug}:${atalhoSlug}` : cardSlug;
}

/**
 * A regra que vale de fato: o que a tela ⚙️ gravou, ou o padrão do código.
 * `undefined` = sem restrição, todo mundo vê.
 */
export function setoresEfetivos(
  padrao: number[] | undefined,
  chave: string,
  ajustes: Record<string, number[] | "todos"> = {},
): number[] | undefined {
  const escolhido = ajustes[chave];
  if (escolhido === undefined) return padrao;
  if (escolhido === "todos") return undefined;
  return escolhido;
}

/**
 * O item aparece de entrada para quem está nesta cadeia de setores?
 *
 * Falha para o lado de MOSTRAR: sem regra, ou sem saber o setor da pessoa
 * (sessão antiga, GLPI indisponível), tudo aparece. Esconder por engano é o
 * erro caro — deixaria alguém sem o card do próprio trabalho.
 *
 * Isto é organização de tela, não permissão: a API não checa nada disso, e
 * não deve. Quem abrir o link "não achei meu caso" pode usar qualquer card,
 * e está tudo bem — a pessoa sabe do trabalho dela mais que a nossa tabela.
 */
export function visivelPara(setores: number[] | undefined, cadeiaSetores: number[]): boolean {
  if (!setores || setores.length === 0) return true;
  if (cadeiaSetores.length === 0) return true;
  return setores.some((s) => cadeiaSetores.includes(s));
}
