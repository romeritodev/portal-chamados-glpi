import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Configuração editável pela tela ⚙️ (roadmap Fase B).
 *
 * Fica num arquivo separado do .env — assim o técnico muda pela interface e
 * vale na hora, sem reiniciar o serviço. O .env continua sendo o padrão
 * inicial: quando a tela nunca gravou um valor, vale o que estiver lá.
 *
 * A CHAVE DA IA nunca sai deste módulo em direção ao navegador: as páginas
 * usam configPublica(), que devolve só os últimos 4 caracteres.
 */

export type ProvedorIA = "desligado" | "anthropic" | "openai";

export interface ConfigPortal {
  iaProvedor: ProvedorIA;
  iaModelo: string;
  /** endereço base — só para provedores compatíveis com OpenAI */
  iaBaseUrl: string;
  /** segredo: nunca serializar para o cliente */
  iaChave: string;
  iaTriagem: boolean;
  iaDuplicado: boolean;
  iaSugestao: boolean;
  avisos: boolean;
  painel: boolean;
  /** avisos no celular (push) */
  pushLigado: boolean;
  /** par VAPID gerado sozinho na primeira vez; a privada é segredo */
  pushPublica: string;
  pushPrivada: string;
  /**
   * Quais serviços aparecem para cada setor, editado na tela ⚙️ › Serviços.
   *
   * Guarda só as DIFERENÇAS em relação ao padrão do código: chave ausente =
   * vale o que está em config/categorias.ts (que foi montado a partir dos 725
   * chamados). Assim um clique errado se desfaz com um botão, e o padrão
   * continua versionado no Git.
   *
   * Chave: "slug-do-card" ou "slug-do-card:slug-do-atalho".
   * Valor: "todos" = sem restrição; lista = só esses setores (e os abaixo
   * deles na árvore do GLPI).
   */
  visibilidade: Record<string, number[] | "todos">;
  atualizadoEm?: string;
  atualizadoPor?: string;
}

/** Versão segura para enviar ao navegador (sem os segredos). */
export type ConfigPublica = Omit<ConfigPortal, "iaChave" | "pushPrivada"> & {
  temChave: boolean;
  chaveMascarada: string;
};

export const MODELOS_ANTHROPIC = [
  { id: "claude-haiku-4-5", nome: "Haiku 4.5 — rápido e barato (recomendado)", custo: "US$ 1 / US$ 5 por milhão de tokens" },
  { id: "claude-sonnet-5", nome: "Sonnet 5 — equilibrado", custo: "US$ 3 / US$ 15 por milhão de tokens" },
  { id: "claude-opus-5", nome: "Opus 5 — o mais capaz", custo: "US$ 5 / US$ 25 por milhão de tokens" },
] as const;

const MODELO_PADRAO_ANTHROPIC = "claude-haiku-4-5";

function boolEnv(nome: string, padrao: boolean): boolean {
  const v = process.env[nome];
  if (v === undefined || v === "") return padrao;
  return v !== "false";
}

function padroes(): ConfigPortal {
  return {
    iaProvedor: "desligado",
    iaModelo: MODELO_PADRAO_ANTHROPIC,
    iaBaseUrl: "",
    iaChave: "",
    iaTriagem: true,
    iaDuplicado: true,
    iaSugestao: true,
    // enquanto a tela não gravar nada, vale o .env (compatibilidade)
    avisos: boolEnv("PORTAL_NOTIFICACOES", true),
    painel: boolEnv("PORTAL_PAINEL", true),
    pushLigado: boolEnv("PORTAL_PUSH", true),
    pushPublica: "",
    pushPrivada: "",
    visibilidade: {},
  };
}

function arquivo(): string {
  const dir = process.env.PORTAL_DADOS_DIR ?? path.join(process.cwd(), "dados");
  return path.join(dir, "config.json");
}

// cache curto: a config é lida a cada renderização de layout
let cache: { em: number; valor: ConfigPortal } | null = null;
const CACHE_MS = 10_000;

export async function lerConfig(): Promise<ConfigPortal> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.valor;

  let valor = padroes();
  try {
    const bruto = await fs.readFile(arquivo(), "utf8");
    const salvo = JSON.parse(bruto) as Partial<ConfigPortal>;
    valor = { ...valor, ...salvo };
    // arquivo gravado antes desta versão não tem o campo; e arquivo estragado
    // não pode derrubar a abertura de chamado — cai no padrão do código
    if (typeof valor.visibilidade !== "object" || valor.visibilidade === null) {
      valor.visibilidade = {};
    }
  } catch {
    // arquivo ainda não existe (primeira execução) — segue com os padrões
  }
  cache = { em: Date.now(), valor };
  return valor;
}

export async function gravarConfig(
  mudancas: Partial<ConfigPortal>,
  autor?: string,
): Promise<ConfigPortal> {
  const atual = await lerConfig();
  const novo: ConfigPortal = {
    ...atual,
    ...mudancas,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: autor ?? atual.atualizadoPor,
  };

  const destino = arquivo();
  await fs.mkdir(path.dirname(destino), { recursive: true, mode: 0o700 });
  // grava em arquivo temporário e renomeia: nunca deixa um config.json pela metade
  const temporario = `${destino}.tmp`;
  await fs.writeFile(temporario, JSON.stringify(novo, null, 2), { mode: 0o600 });
  await fs.rename(temporario, destino);
  await fs.chmod(destino, 0o600).catch(() => undefined);

  cache = { em: Date.now(), valor: novo };
  return novo;
}

/** Config sem os segredos — é esta que pode chegar ao navegador.
 *  (a chave VAPID pública PODE ir: o navegador precisa dela para se inscrever) */
export function configPublica(c: ConfigPortal): ConfigPublica {
  const { iaChave, pushPrivada: _privada, ...resto } = c;
  return {
    ...resto,
    temChave: iaChave.length > 0,
    chaveMascarada: iaChave ? `••••••••${iaChave.slice(-4)}` : "",
  };
}

export async function lerConfigPublica(): Promise<ConfigPublica> {
  return configPublica(await lerConfig());
}
