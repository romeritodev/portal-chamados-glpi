import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Cópia local das avaliações de atendimento (CSAT), para os relatórios.
 *
 * O registro oficial continua sendo o acompanhamento privado no GLPI — este
 * arquivo é só um índice. Sem ele, montar o indicador exigiria abrir a
 * conversa de cada chamado, uma consulta por chamado: inviável com centenas.
 *
 * Guarda apenas número do chamado, nota e data. Nenhum dado pessoal.
 */

export interface Avaliacao {
  ticketId: number;
  nota: number;
  em: string;
}

function arquivo(): string {
  const dir = process.env.PORTAL_DADOS_DIR ?? path.join(process.cwd(), "dados");
  return path.join(dir, "avaliacoes.json");
}

export async function lerAvaliacoes(): Promise<Avaliacao[]> {
  try {
    const bruto = await fs.readFile(arquivo(), "utf8");
    const dados = JSON.parse(bruto) as unknown;
    return Array.isArray(dados) ? (dados as Avaliacao[]) : [];
  } catch {
    return [];
  }
}

/** Guarda a nota. Uma por chamado: reavaliar substitui a anterior. */
export async function registrarAvaliacaoLocal(ticketId: number, nota: number): Promise<void> {
  const lista = (await lerAvaliacoes()).filter((a) => a.ticketId !== ticketId);
  lista.push({ ticketId, nota, em: new Date().toISOString() });

  const destino = arquivo();
  await fs.mkdir(path.dirname(destino), { recursive: true, mode: 0o700 });
  const temporario = `${destino}.tmp`;
  await fs.writeFile(temporario, JSON.stringify(lista), { mode: 0o600 });
  await fs.rename(temporario, destino);
}

export interface ResumoCsat {
  quantidade: number;
  media: number;
  /** quantas notas de cada valor, de 1 a 5 */
  distribuicao: number[];
}

/**
 * Monta o indicador a partir das notas dos chamados informados.
 *
 * Recebe os chamados JÁ FILTRADOS pela tela (período, categoria, setor,
 * usuário) e considera só as notas deles. Isso conserta duas coisas de uma
 * vez: a satisfação passa a responder aos mesmos filtros do resto do
 * relatório, e nota órfã para de contar — chamado apagado no GLPI não some
 * deste índice local, e 14 notas de teste continuavam formando um "4.0/5"
 * de chamados que não existem mais.
 */
export function resumoCsat(avaliacoes: Avaliacao[], chamados: Iterable<number>): ResumoCsat {
  const validos = new Set(chamados);
  const noPeriodo = avaliacoes.filter((a) => validos.has(a.ticketId));
  const distribuicao = [0, 0, 0, 0, 0];
  for (const a of noPeriodo) {
    if (a.nota >= 1 && a.nota <= 5) distribuicao[a.nota - 1]++;
  }
  const soma = noPeriodo.reduce((s, a) => s + a.nota, 0);
  return {
    quantidade: noPeriodo.length,
    media: noPeriodo.length > 0 ? soma / noPeriodo.length : 0,
    distribuicao,
  };
}
