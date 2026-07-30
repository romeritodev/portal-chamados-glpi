import { getServiceToken, v2Fetch } from "./glpi";

/**
 * Árvore de setores (entidades) do GLPI, usada para decidir quais cards
 * aparecem na abertura de chamado.
 *
 * POR QUE A ÁRVORE, E NÃO A LISTA: os setores do GLPI são hierárquicos —
 * Psf-Carmo fica dentro de Secretaria de Saúde. Restringir um card a
 * "Secretaria de Saúde" pega os PSF, a Vacina, a Farmácia e o Plantão de uma
 * vez, e um posto novo criado amanhã já nasce coberto. Listar id por id daria
 * a mesma coisa hoje e ficaria desatualizado na primeira reorganização.
 *
 * Lida com a conta de serviço porque o perfil self-service não enxerga
 * /Administration/Entity. Cache de 10 minutos: a árvore muda pouco, e não
 * vale uma consulta por carregamento de tela.
 */

interface Entidade {
  id: number;
  nome: string;
  pai?: number;
}

/** Setor pronto para desenhar em árvore na tela de configuração. */
export interface SetorNaArvore {
  id: number;
  nome: string;
  /** 0 = topo; usado só para o recuo visual */
  nivel: number;
}

const VALIDADE_MS = 10 * 60 * 1000;
let cache: { arvore: Map<number, Entidade>; expiraEm: number } | null = null;

async function arvore(): Promise<Map<number, Entidade> | null> {
  if (cache && Date.now() < cache.expiraEm) return cache.arvore;

  const token = await getServiceToken();
  if (!token) return null;
  try {
    const res = await v2Fetch(token, "/Administration/Entity?limit=300");
    if (!res.ok) {
      console.error(`Falha ao ler os setores (HTTP ${res.status})`);
      return null;
    }
    const lista = (await res.json()) as unknown;
    if (!Array.isArray(lista)) return null;

    const mapa = new Map<number, Entidade>();
    for (const bruto of lista) {
      if (typeof bruto !== "object" || bruto === null) continue;
      const e = bruto as Record<string, unknown>;
      if (typeof e.id !== "number") continue;
      const pai = e.parent as Record<string, unknown> | null | undefined;
      mapa.set(e.id, {
        id: e.id,
        nome: typeof e.name === "string" ? e.name : `Setor ${e.id}`,
        pai: typeof pai?.id === "number" ? pai.id : undefined,
      });
    }
    cache = { arvore: mapa, expiraEm: Date.now() + VALIDADE_MS };
    return mapa;
  } catch (err) {
    console.error("Falha ao ler os setores:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * O setor da pessoa e todos os setores acima dele. É contra esta lista que os
 * cards são comparados: quem está em Psf-Carmo casa com uma regra de
 * "Secretaria de Saúde".
 *
 * Devolve lista vazia quando não sabemos o setor (sessão antiga, GLPI fora do
 * ar, conta de serviço não configurada). Quem chama trata isso mostrando
 * TUDO — errar para o lado de esconder deixaria a pessoa sem como abrir o
 * chamado dela.
 */
/**
 * Setores em ordem de árvore, para a tela ⚙️ › Serviços.
 *
 * A Entidade raiz e o nó "Prefeitura Municipal" ficam de fora: são ancestrais
 * de todo mundo, então marcá-los liberaria a prefeitura inteira — restrição
 * que não restringe. Foi exatamente esse engano que fez o e-SUS aparecer no
 * RH, e a melhor correção é a opção nem existir na tela.
 */
export async function listarSetores(): Promise<SetorNaArvore[]> {
  const mapa = await arvore();
  if (!mapa) return [];

  const filhos = new Map<number | undefined, Entidade[]>();
  for (const e of mapa.values()) {
    const lista = filhos.get(e.pai) ?? [];
    lista.push(e);
    filhos.set(e.pai, lista);
  }
  for (const lista of filhos.values()) {
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  // topo = quem não tem pai, ou cujo pai é raiz/"Prefeitura Municipal"
  const universais = new Set<number>();
  for (const e of mapa.values()) {
    if (e.pai === undefined) universais.add(e.id);
  }
  for (const e of mapa.values()) {
    if (e.pai !== undefined && universais.has(e.pai) && (filhos.get(e.id)?.length ?? 0) > 3) {
      universais.add(e.id); // "Prefeitura Municipal": nó de passagem, não setor
    }
  }

  const saida: SetorNaArvore[] = [];
  const desce = (pai: number | undefined, nivel: number) => {
    for (const e of filhos.get(pai) ?? []) {
      if (universais.has(e.id)) {
        desce(e.id, nivel); // nó de passagem não vira linha na tela
        continue;
      }
      saida.push({ id: e.id, nome: e.nome, nivel });
      desce(e.id, nivel + 1);
    }
  };
  desce(undefined, 0);
  return saida;
}

/**
 * Caminho legível do setor, sem os nós que não dizem nada: "Administração ›
 * Contratos" em vez de "Entidade raiz › Prefeitura Municipal ›
 * Secretaria de Administração › Contratos".
 *
 * Na lista de chamados o nome curto basta. Aqui, na tela do chamado, o
 * técnico precisa saber de ONDE veio antes de sair da sala — "Contratos"
 * sozinho não diz se é da Administração ou de outra secretaria.
 */
export async function caminhoDoSetor(entityId?: number, nomeCurto?: string): Promise<string> {
  if (entityId === undefined) return nomeCurto ?? "";
  const mapa = await arvore();
  if (!mapa) return nomeCurto ?? "";

  const nomes: string[] = [];
  let atual: number | undefined = entityId;
  for (let i = 0; i < 20 && atual !== undefined; i++) {
    const e = mapa.get(atual);
    if (!e) break;
    // raiz e o nó "Prefeitura Municipal" não acrescentam informação
    const universal = e.pai === undefined || mapa.get(e.pai)?.pai === undefined;
    if (!universal) nomes.unshift(e.nome.replace(/^Secretaria de\s+/i, ""));
    atual = e.pai;
  }
  return nomes.length > 0 ? nomes.join(" › ") : (nomeCurto ?? "");
}

export async function cadeiaDeSetores(entityId?: number): Promise<number[]> {
  if (entityId === undefined) return [];
  const mapa = await arvore();
  if (!mapa) return [];

  const cadeia: number[] = [];
  let atual: number | undefined = entityId;
  // o teto de 20 é só cinturão de segurança contra árvore com ciclo
  for (let i = 0; i < 20 && atual !== undefined; i++) {
    if (cadeia.includes(atual)) break;
    cadeia.push(atual);
    atual = mapa.get(atual)?.pai;
  }
  return cadeia;
}
