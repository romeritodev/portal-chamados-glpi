/**
 * Dados agregados para o módulo de relatórios (/relatorios).
 * Busca via conta de serviço (enxerga todos os chamados) — o acesso à página
 * é restrito a perfis de interface "central" (técnicos/admins).
 */

import "server-only";
import { getServiceToken } from "./glpi";

export interface TicketResumo {
  id: number;
  titulo: string;
  /** ISO da abertura */
  data?: string;
  status: number;
  categoria: string;
  entidade: string;
  requerente: string;
  /** ISO da solução, se houver */
  dataSolucao?: string;
}

function glpiBaseUrl(): string {
  return (process.env.GLPI_URL ?? "").replace(/\/+$/, "");
}

function nomeDe(v: unknown): string | undefined {
  if (typeof v === "object" && v !== null && typeof (v as { name?: unknown }).name === "string") {
    return (v as { name: string }).name;
  }
  return undefined;
}

function statusDe(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "number") {
    return (v as { id: number }).id;
  }
  return 0;
}

// cache em memória: os relatórios toleram dados de até 2 minutos atrás,
// e sem isso cada troca de filtro rebusca o histórico inteiro no GLPI
let cacheChamados: { em: number; dados: TicketResumo[] } | null = null;
const CACHE_TTL_MS = 2 * 60_000;
const PAGINA = 500;

async function buscaPagina(
  token: string,
  start: number,
): Promise<{ itens: unknown[]; total: number | null }> {
  const res = await fetch(
    `${glpiBaseUrl()}/api.php/v2/Assistance/Ticket?limit=${PAGINA}&start=${start}&sort=id:desc`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Falha ao listar chamados (HTTP ${res.status})`);
  const range = res.headers.get("Content-Range");
  const total = range ? Number(range.split("/").pop()) || null : null;
  const batch = (await res.json()) as unknown;
  return { itens: Array.isArray(batch) ? batch : [], total };
}

/** Busca todos os chamados (páginas em paralelo + cache de 2 minutos). */
export async function buscarTodosChamados(): Promise<TicketResumo[]> {
  if (cacheChamados && Date.now() - cacheChamados.em < CACHE_TTL_MS) {
    return cacheChamados.dados;
  }

  const token = await getServiceToken();
  if (!token) throw new Error("Conta de serviço não configurada");

  const primeira = await buscaPagina(token, 0);
  let brutos = primeira.itens;

  if (primeira.total && primeira.total > PAGINA) {
    // demais páginas em paralelo — o total veio no Content-Range
    const starts: number[] = [];
    for (let s = PAGINA; s < primeira.total; s += PAGINA) starts.push(s);
    const paginas = await Promise.all(starts.map((s) => buscaPagina(token, s)));
    for (const p of paginas) brutos = brutos.concat(p.itens);
  } else if (primeira.total === null && primeira.itens.length === PAGINA) {
    // sem Content-Range: segue sequencial até acabar
    for (let s = PAGINA; s < 20000; s += PAGINA) {
      const p = await buscaPagina(token, s);
      brutos = brutos.concat(p.itens);
      if (p.itens.length < PAGINA) break;
    }
  }

  const tickets: TicketResumo[] = [];
  {
    for (const raw of brutos) {
      if (typeof raw !== "object" || raw === null) continue;
      const t = raw as Record<string, unknown>;
      if (typeof t.id !== "number") continue;
      if (t.is_deleted === true) continue;
      // requerente: membro do time com papel "requester"; fallback: autor
      let requerente: string | undefined;
      if (Array.isArray(t.team)) {
        for (const m of t.team) {
          if (typeof m !== "object" || m === null) continue;
          const membro = m as Record<string, unknown>;
          if (membro.role === "requester" && typeof membro.name === "string" && membro.name) {
            requerente = membro.name;
            break;
          }
        }
      }
      requerente ??= nomeDe(t.user_recipient);

      tickets.push({
        id: t.id,
        titulo: typeof t.name === "string" ? t.name : `Chamado ${t.id}`,
        data: typeof t.date === "string" ? t.date : undefined,
        status: statusDe(t.status),
        categoria: nomeDe(t.category) ?? "Sem categoria",
        entidade: nomeDe(t.entity) ?? "—",
        requerente: requerente ?? "Não informado",
        dataSolucao: typeof t.date_solve === "string" ? t.date_solve : undefined,
      });
    }
  }

  cacheChamados = { em: Date.now(), dados: tickets };
  return tickets;
}

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------

export interface Periodo {
  de?: Date;
  ate?: Date;
  rotulo: string;
}

export function resolvePeriodo(
  periodo: string | undefined,
  deStr: string | undefined,
  ateStr: string | undefined,
  agora: Date,
): Periodo {
  const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // datas explícitas sempre vencem o período pré-definido
  if (deStr || ateStr) {
    const de = deStr ? new Date(`${deStr}T00:00:00`) : undefined;
    const ate = ateStr ? new Date(`${ateStr}T23:59:59`) : undefined;
    return { de, ate, rotulo: "Período personalizado" };
  }
  if (periodo === "mes") {
    return { de: new Date(agora.getFullYear(), agora.getMonth(), 1), rotulo: "Mês atual" };
  }
  if (periodo === "30d") {
    const de = inicioDia(new Date(agora.getTime() - 30 * 24 * 3600 * 1000));
    return { de, rotulo: "Últimos 30 dias" };
  }
  if (periodo === "tudo") {
    return { rotulo: "Todo o histórico" };
  }
  // padrão: este ano
  return { de: new Date(agora.getFullYear(), 0, 1), rotulo: `Ano ${agora.getFullYear()}` };
}

export function filtraPorPeriodo(tickets: TicketResumo[], p: Periodo): TicketResumo[] {
  return tickets.filter((t) => {
    if (!t.data) return false;
    const d = new Date(t.data.includes("T") ? t.data : t.data.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return false;
    if (p.de && d < p.de) return false;
    if (p.ate && d > p.ate) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Filtros de dimensão (categoria / setor / usuário)
// ---------------------------------------------------------------------------

export interface FiltrosDimensao {
  categoria?: string;
  setor?: string;
  usuario?: string;
}

export function aplicaFiltros(tickets: TicketResumo[], f: FiltrosDimensao): TicketResumo[] {
  return tickets.filter(
    (t) =>
      (!f.categoria || t.categoria === f.categoria) &&
      (!f.setor || t.entidade === f.setor) &&
      (!f.usuario || t.requerente === f.usuario),
  );
}

/** Valores distintos (ordenados) de uma dimensão, para montar os selects. */
export function opcoesDe(tickets: TicketResumo[], chave: (t: TicketResumo) => string): string[] {
  return [...new Set(tickets.map(chave))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ---------------------------------------------------------------------------
// Agregações
// ---------------------------------------------------------------------------

export interface ContagemItem {
  rotulo: string;
  valor: number;
}

export function contagemPor(
  tickets: TicketResumo[],
  chave: (t: TicketResumo) => string,
  topN = 10,
): ContagemItem[] {
  const mapa = new Map<string, number>();
  for (const t of tickets) {
    const k = chave(t);
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  const ordenado = [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  const top = ordenado.slice(0, topN).map(([rotulo, valor]) => ({ rotulo, valor }));
  const resto = ordenado.slice(topN).reduce((s, [, v]) => s + v, 0);
  if (resto > 0) top.push({ rotulo: "Outros", valor: resto });
  return top;
}

export interface StatusResumo {
  rotulo: string;
  valor: number;
  cor: string;
}

/** Paleta validada (dataviz): aviso de contraste coberto pela legenda com valores. */
export function distribuicaoStatus(tickets: TicketResumo[]): StatusResumo[] {
  const grupos: { rotulo: string; cor: string; testa: (s: number) => boolean }[] = [
    { rotulo: "Novos", cor: "#2a78d6", testa: (s) => s === 1 },
    { rotulo: "Em atendimento", cor: "#eda100", testa: (s) => s === 2 || s === 3 || s === 10 },
    { rotulo: "Pendentes", cor: "#4a3aa7", testa: (s) => s === 4 },
    { rotulo: "Solucionados", cor: "#008300", testa: (s) => s === 5 },
    { rotulo: "Fechados", cor: "#1baf7a", testa: (s) => s === 6 },
  ];
  return grupos
    .map((g) => ({ rotulo: g.rotulo, cor: g.cor, valor: tickets.filter((t) => g.testa(t.status)).length }))
    .filter((g) => g.valor > 0);
}

export function porMes(tickets: TicketResumo[], p: Periodo, agora: Date): ContagemItem[] {
  // até 12 meses terminando no fim do período (ou agora)
  const fim = p.ate ?? agora;
  const meses: { chave: string; rotulo: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(fim.getFullYear(), fim.getMonth() - i, 1);
    if (p.de && d < new Date(p.de.getFullYear(), p.de.getMonth(), 1)) continue;
    meses.push({
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      rotulo: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`,
    });
  }
  const mapa = new Map<string, number>();
  for (const t of tickets) {
    if (!t.data) continue;
    const d = new Date(t.data.includes("T") ? t.data : t.data.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) continue;
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  }
  return meses.map((m) => ({ rotulo: m.rotulo, valor: mapa.get(m.chave) ?? 0 }));
}

/** Tempo médio (e mediana) de solução em dias, para chamados com data de solução. */
export function tempoSolucao(tickets: TicketResumo[]): { media?: number; mediana?: number } {
  const dias: number[] = [];
  for (const t of tickets) {
    if (!t.data || !t.dataSolucao) continue;
    const abre = new Date(t.data.includes("T") ? t.data : t.data.replace(" ", "T"));
    const sol = new Date(t.dataSolucao.includes("T") ? t.dataSolucao : t.dataSolucao.replace(" ", "T"));
    if (Number.isNaN(abre.getTime()) || Number.isNaN(sol.getTime())) continue;
    const d = (sol.getTime() - abre.getTime()) / (24 * 3600 * 1000);
    if (d >= 0) dias.push(d);
  }
  if (dias.length === 0) return {};
  dias.sort((a, b) => a - b);
  const media = dias.reduce((s, v) => s + v, 0) / dias.length;
  const mediana = dias[Math.floor(dias.length / 2)];
  return { media, mediana };
}
