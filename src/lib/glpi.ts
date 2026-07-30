/**
 * Cliente da API high-level do GLPI 11 (api.php, v2).
 *
 * IMPORTANTE (spec §4.2 e nota final): a API v2 é autodocumentada em
 * `{GLPI_URL}/api.php/doc`. Os caminhos e nomes de campos abaixo seguem a
 * referência esperada da 11.0.6, mas DEVEM ser validados contra o OpenAPI da
 * instância real. Em caso de divergência, o OpenAPI vence — ajustar apenas as
 * constantes/mapeamentos deste arquivo.
 *
 * Todas as chamadas acontecem no servidor; o browser nunca fala com o GLPI.
 */

import "server-only";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

function glpiBaseUrl(): string {
  const url = process.env.GLPI_URL;
  if (!url) throw new Error("GLPI_URL não definido no .env");
  return url.replace(/\/+$/, "");
}

const TOKEN_PATH = "/api.php/token";
const V2_PATH = "/api.php/v2"; // versão fixada na URL (spec §4.2)

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** epoch em ms */
  expiresAt: number;
}

export interface GlpiTicket {
  id: number;
  name: string;
  content?: string;
  /** id numérico do status (normalizado — a API v2 retorna objeto {id, name}) */
  status: number;
  urgency?: number;
  date?: string;
  date_mod?: string;
  /** id da entidade do chamado — necessário para anexos via API legada */
  entityId?: number;
  /** nome da entidade (setor), quando a API o traz */
  entityName?: string;
  /** nome da categoria ITIL — só a folha, não o caminho inteiro */
  categoryName?: string;
  /** data em que a solução foi registrada */
  solveDate?: string;
  /** prazo de solução (SLA) — usado no semáforo da visão central */
  timeToResolve?: string;
  /** nome do requerente (papel requester do time) */
  requesterName?: string;
  /** id do usuário requerente — usado na autorização do CSAT */
  requesterId?: number;
  /** técnicos atribuídos (papel assigned do time) */
  assignees: { userId?: number; name?: string }[];
}

/**
 * Normaliza um ticket cru da API v2 (schema validado contra o OpenAPI 2.2.0
 * da instância: status/category vêm como objetos {id, name}).
 */
function normalizeTicket(raw: Record<string, unknown>): GlpiTicket | null {
  if (typeof raw.id !== "number") return null;
  // A lixeira do GLPI não apaga: marca is_deleted e o registro continua vindo
  // pela API. Sem este filtro, chamado que o técnico jogou fora reaparece nas
  // filas e ainda conta nos totalizadores.
  if (raw.is_deleted === true || raw.is_deleted === 1) return null;
  const status =
    typeof raw.status === "object" && raw.status !== null
      ? (raw.status as { id?: number }).id
      : raw.status;

  // team: estrutura validada contra a instância (21/07/2026) — cada membro é
  // {role, name(login), display_name, id, href}. O id só é id de USUÁRIO
  // quando o href aponta para user.form (grupos atribuídos têm outro href).
  let requesterName: string | undefined;
  let requesterId: number | undefined;
  const assignees: { userId?: number; name?: string }[] = [];
  if (Array.isArray(raw.team)) {
    for (const m of raw.team) {
      if (typeof m !== "object" || m === null) continue;
      const membro = m as Record<string, unknown>;
      const nome =
        (typeof membro.display_name === "string" && membro.display_name) ||
        (typeof membro.name === "string" && membro.name) ||
        undefined;
      const ehUsuario = typeof membro.href === "string" && membro.href.includes("user.form");
      if (membro.role === "requester" && !requesterName) {
        requesterName = nome;
        if (ehUsuario) requesterId = numericValue(membro.id);
      }
      if (membro.role === "assigned") {
        assignees.push({ userId: ehUsuario ? numericValue(membro.id) : undefined, name: nome });
      }
    }
  }

  const entity = raw.entity as Record<string, unknown> | undefined;
  const category = raw.category as Record<string, unknown> | undefined;
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : `Chamado ${raw.id}`,
    content: typeof raw.content === "string" ? raw.content : undefined,
    status: typeof status === "number" ? status : 0,
    urgency: typeof raw.urgency === "number" ? raw.urgency : undefined,
    date: typeof raw.date === "string" ? raw.date : undefined,
    date_mod: typeof raw.date_mod === "string" ? raw.date_mod : undefined,
    entityId: numericValue(raw.entity),
    entityName: typeof entity?.name === "string" ? entity.name : undefined,
    categoryName: typeof category?.name === "string" ? category.name : undefined,
    solveDate: typeof raw.solvedate === "string" ? raw.solvedate : undefined,
    timeToResolve: typeof raw.time_to_resolve === "string" ? raw.time_to_resolve : undefined,
    requesterName,
    requesterId,
    assignees,
  };
}

export interface TimelineItem {
  /** tipo do item (ITILFollowup, ITILSolution, TicketTask...) */
  type: string;
  content: string;
  date?: string;
  authorName?: string;
  /** id do autor — comparar nomes é frágil (login ≠ nome de exibição) */
  authorId?: number;
}

export class GlpiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GlpiError";
  }
}

/** Credenciais inválidas no login. */
export class GlpiAuthError extends GlpiError {}

// ---------------------------------------------------------------------------
// OAuth2 — password grant (spec §4.1)
// ---------------------------------------------------------------------------

export async function passwordLogin(username: string, password: string): Promise<TokenSet> {
  const clientId = process.env.GLPI_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GLPI_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GLPI_OAUTH_CLIENT_ID / GLPI_OAUTH_CLIENT_SECRET não definidos no .env");
  }

  const res = await fetch(`${glpiBaseUrl()}${TOKEN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      client_id: clientId,
      client_secret: clientSecret,
      username,
      password,
      scope: "api",
    }),
    cache: "no-store",
  });

  if (res.status === 400 || res.status === 401) {
    // nunca logar senha/detalhes — mensagem genérica (spec §6)
    throw new GlpiAuthError("Usuário ou senha incorretos", res.status);
  }
  if (!res.ok) {
    throw new GlpiError(`Falha ao autenticar no GLPI (HTTP ${res.status})`, res.status);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const res = await fetch(`${glpiBaseUrl()}${TOKEN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: process.env.GLPI_OAUTH_CLIENT_ID,
      client_secret: process.env.GLPI_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      scope: "api",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new GlpiAuthError("Sessão expirada", res.status);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

// ---------------------------------------------------------------------------
// Chamadas v2 autenticadas
// ---------------------------------------------------------------------------

export async function v2Fetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${glpiBaseUrl()}${V2_PATH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      // FormData define o próprio Content-Type (multipart com boundary)
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  if (res.status === 401) {
    throw new GlpiAuthError("Sessão expirada", 401);
  }
  // token expirado vem como 400 "Invalid OAuth token" (não 401) nesta versão
  if (res.status === 400) {
    try {
      const body = await res.clone().text();
      if (body.includes("OAuth token")) {
        throw new GlpiAuthError("Sessão expirada", 401);
      }
    } catch (err) {
      if (err instanceof GlpiAuthError) throw err;
      // corpo ilegível — segue com a resposta original
    }
  }
  return res;
}

/** Corpo de erro do GLPI para diagnóstico (truncado, sem dados sensíveis). */
async function errorDetail(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 500);
  } catch {
    return "";
  }
}

/**
 * Dados do usuário autenticado via GET /session (rota validada no OpenAPI
 * 2.2.0: user_id, friendly_name). Usa a própria sessão do token, então
 * funciona para qualquer perfil — inclusive Self-Service, que não tem
 * permissão de ler /Administration/User/Me. Falha aqui não é fatal — o portal
 * usa o login digitado como fallback para a saudação.
 */
export async function getCurrentUser(
  accessToken: string,
): Promise<{
  id?: number;
  friendlyName?: string;
  profileInterface?: string;
  entityId?: number;
} | null> {
  try {
    const res = await v2Fetch(accessToken, "/session");
    if (!res.ok) {
      console.error(`Falha ao ler /session (HTTP ${res.status}): ${await errorDetail(res)}`);
      return null;
    }
    const s = (await res.json()) as Record<string, unknown>;
    const first = typeof s.first_name === "string" ? s.first_name : "";
    const real = typeof s.real_name === "string" ? s.real_name : "";
    const friendly =
      (typeof s.friendly_name === "string" && s.friendly_name.trim()) ||
      [first, real].filter(Boolean).join(" ").trim();
    const profile = s.active_profile as Record<string, unknown> | undefined;
    // setor de trabalho da pessoa — usado só para escolher quais cards mostrar
    const entidade = s.active_entity as Record<string, unknown> | undefined;
    return {
      id: typeof s.user_id === "number" ? s.user_id : undefined,
      friendlyName: friendly || (typeof s.name === "string" ? s.name : undefined),
      profileInterface: typeof profile?.interface === "string" ? profile.interface : undefined,
      entityId: typeof entidade?.id === "number" ? entidade.id : undefined,
    };
  } catch (err) {
    console.error(
      "Falha ao ler /session:",
      err instanceof Error ? err.message : "erro desconhecido",
    );
    return null;
  }
}

/** quantos registros por requisição ao GLPI ao percorrer a lista */
const PAGINA_CHAMADOS = 500;
/** teto de segurança: 20 páginas = 10.000 chamados */
const MAX_PAGINAS_CHAMADOS = 20;

/**
 * Lista os chamados visíveis para o usuário (o perfil self-service do GLPI
 * já restringe aos próprios chamados — spec §4.2).
 *
 * PERCORRE PÁGINAS até juntar `limit` chamados válidos ou a API acabar. Antes
 * era uma requisição só, e quando a instância passou de 500 chamados a conta
 * de "Fechados" começou a mentir — mostrava 454 onde havia 711, sem nenhum
 * sinal de que a lista tinha sido cortada. Número errado é pior que número
 * ausente, porque ninguém desconfia dele.
 *
 * A paginação também é o que faz o filtro de lixeira funcionar: descartar um
 * chamado apagado não pode encolher o resultado.
 */
export async function listMyTickets(
  accessToken: string,
  limit = 100,
  sort: "id:desc" | "date_mod:desc" = "id:desc",
): Promise<GlpiTicket[]> {
  // sort validado no OpenAPI (property:direction) — sem ele o GLPI devolve os
  // registros mais antigos primeiro e chamados novos ficam fora da página.
  // date_mod:desc (validado na instância) é o que enxerga resposta em chamado
  // antigo — a ordem realmente difere de id:desc.
  const tickets: GlpiTicket[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS_CHAMADOS && tickets.length < limit; pagina++) {
    const inicio = pagina * PAGINA_CHAMADOS;
    const res = await v2Fetch(
      accessToken,
      `/Assistance/Ticket?limit=${PAGINA_CHAMADOS}&start=${inicio}&sort=${sort}`,
    );
    if (!res.ok) {
      throw new GlpiError(
        `Falha ao listar chamados (HTTP ${res.status}): ${await errorDetail(res)}`,
        res.status,
      );
    }
    const data = (await res.json()) as unknown;
    const list = Array.isArray(data) ? data : [];
    for (const bruto of list) {
      if (typeof bruto !== "object" || bruto === null) continue;
      const t = normalizeTicket(bruto as Record<string, unknown>);
      if (t) tickets.push(t);
    }
    // página incompleta = fim dos registros
    if (list.length < PAGINA_CHAMADOS) break;
  }

  const ate = tickets.slice(0, limit);
  // ordenar por id só faz sentido quando foi essa a ordem pedida
  return sort === "id:desc" ? ate.sort((a, b) => b.id - a.id) : ate;
}

export async function getTicket(accessToken: string, id: number): Promise<GlpiTicket | null> {
  const res = await v2Fetch(accessToken, `/Assistance/Ticket/${id}`);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) {
    throw new GlpiError(`Falha ao carregar o chamado (HTTP ${res.status})`, res.status);
  }
  return normalizeTicket((await res.json()) as Record<string, unknown>);
}

export interface CreateTicketInput {
  name: string;
  /** HTML já sanitizado (ver lib/sanitize.ts) */
  content: string;
  /** escala GLPI 1–5 */
  urgency: number;
  /** itilcategories_id — null quando o card não tem categoria mapeada */
  categoryId: number | null;
  /** 1 = Incidente, 2 = Requisição (enum validado no OpenAPI da instância) */
  type?: 1 | 2;
}

/**
 * Cria o chamado. O requerente e a entidade vêm do próprio token do usuário —
 * o portal não envia (nem deve enviar) esses campos (spec §1).
 */
export async function createTicket(accessToken: string, input: CreateTicketInput): Promise<number> {
  const payload: Record<string, unknown> = {
    name: input.name,
    content: input.content,
    urgency: input.urgency,
  };
  if (input.categoryId) {
    // formato validado no OpenAPI 2.2.0 da instância: category é objeto {id}
    payload.category = { id: input.categoryId };
  }
  // type é inteiro puro no schema (1 Incident / 2 Request), não objeto {id}
  if (input.type) payload.type = input.type;

  const res = await v2Fetch(accessToken, "/Assistance/Ticket", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new GlpiError(
      `Falha ao criar o chamado (HTTP ${res.status}): ${await errorDetail(res)}`,
      res.status,
    );
  }

  // v2 pode responder com o item criado no corpo e/ou com header Location
  try {
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.id === "number") return body.id;
    const nested = body.data as Record<string, unknown> | undefined;
    if (nested && typeof nested.id === "number") return nested.id;
  } catch {
    // corpo vazio — tenta o Location
  }
  const location = res.headers.get("Location") ?? res.headers.get("location");
  const match = location?.match(/(\d+)\s*$/);
  if (match) return Number(match[1]);

  throw new GlpiError("Chamado criado, mas a API não retornou o número", res.status);
}

/**
 * Registra o usuário como requerente (ator) do chamado. A criação via API v2
 * define apenas o autor — sem este passo o campo "Requerente" fica vazio no
 * GLPI (rota validada no OpenAPI: POST /Assistance/Ticket/{id}/TeamMember).
 * Falha aqui não é fatal: o chamado já existe.
 */
export async function addTicketRequester(
  accessToken: string,
  ticketId: number,
  userId: number,
): Promise<boolean> {
  try {
    const res = await v2Fetch(accessToken, `/Assistance/Ticket/${ticketId}/TeamMember`, {
      method: "POST",
      body: JSON.stringify({ type: "User", id: userId, role: "requester" }),
    });
    if (!res.ok) {
      console.error(
        `Falha ao registrar requerente no chamado ${ticketId} (HTTP ${res.status}): ${await errorDetail(res)}`,
      );
    }
    return res.ok;
  } catch (err) {
    console.error(
      `Falha ao registrar requerente no chamado ${ticketId}:`,
      err instanceof Error ? err.message : "erro desconhecido",
    );
    return false;
  }
}

/**
 * Adiciona um acompanhamento (comentário do usuário) ao chamado.
 * Rota validada no OpenAPI: POST /Assistance/Ticket/{id}/Timeline/Followup,
 * campo `content` (itemtype/items_id vêm da própria URL).
 */
export async function addFollowup(
  accessToken: string,
  ticketId: number,
  contentHtml: string,
): Promise<void> {
  const res = await v2Fetch(accessToken, `/Assistance/Ticket/${ticketId}/Timeline/Followup`, {
    method: "POST",
    body: JSON.stringify({ content: contentHtml }),
  });
  if (!res.ok) {
    throw new GlpiError(
      `Falha ao enviar o comentário (HTTP ${res.status}): ${await errorDetail(res)}`,
      res.status,
    );
  }
}

// ---------------------------------------------------------------------------
// Painel do técnico (kanban) — rotas e formatos validados na instância
// em 23/07/2026: PATCH {status} → 200; POST/DELETE TeamMember com
// {type:"User", id, role} → 201/200. Cada ação tenta com o token do próprio
// técnico e cai para a conta de serviço, como na aprovação de solução.
// ---------------------------------------------------------------------------

async function comFallbackDeServico(
  accessToken: string,
  caminho: string,
  init: RequestInit,
): Promise<boolean> {
  try {
    const res = await v2Fetch(accessToken, caminho, init);
    if (res.ok) return true;
    if (res.status !== 401 && res.status !== 403) {
      console.error(`GLPI recusou ${init.method} ${caminho} (HTTP ${res.status}): ${await errorDetail(res)}`);
    }
  } catch (err) {
    if (err instanceof GlpiAuthError) throw err;
  }
  const token = await getServiceToken();
  if (!token) return false;
  try {
    const res = await v2Fetch(token, caminho, init);
    if (!res.ok) {
      console.error(
        `Conta de serviço também recusou ${init.method} ${caminho} (HTTP ${res.status}): ${await errorDetail(res)}`,
      );
    }
    return res.ok;
  } catch {
    serviceTokenCache = null;
    return false;
  }
}

/** Move o chamado entre colunas do painel (muda o status). */
export async function updateTicketStatus(
  accessToken: string,
  ticketId: number,
  status: number,
): Promise<boolean> {
  return comFallbackDeServico(accessToken, `/Assistance/Ticket/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

/**
 * Registra a SOLUÇÃO do chamado — é isto que o técnico faz ao concluir, não
 * apenas mudar o status. O GLPI então: (a) move o chamado para "solucionado"
 * sozinho e (b) cria o pedido de aprovação (solução com status 2) que faz
 * aparecer os botões "Funcionou / Ainda não funcionou" para o usuário.
 * Comportamento validado na instância em 25/07/2026.
 */
export async function addSolution(
  accessToken: string,
  ticketId: number,
  contentHtml: string,
): Promise<boolean> {
  return comFallbackDeServico(accessToken, `/Assistance/Ticket/${ticketId}/Timeline/Solution`, {
    method: "POST",
    body: JSON.stringify({ content: contentHtml }),
  });
}

/** Assume ou libera o chamado (ator "atribuído a"). */
export async function setTicketAssignee(
  accessToken: string,
  ticketId: number,
  userId: number,
  assumir: boolean,
): Promise<boolean> {
  return comFallbackDeServico(accessToken, `/Assistance/Ticket/${ticketId}/TeamMember`, {
    method: assumir ? "POST" : "DELETE",
    body: JSON.stringify({ type: "User", id: userId, role: "assigned" }),
  });
}

/**
 * Registra a avaliação de atendimento (CSAT 1–5) como acompanhamento PRIVADO
 * via conta de serviço — visível só para a equipe. Marcador parseável
 * `[avaliacao-portal]` permite agregar nos relatórios depois. O objeto
 * TicketSatisfaction nativo só existe quando a pesquisa de satisfação está
 * ativa na entidade; o followup privado funciona sempre. Falha não é fatal.
 */
export async function registrarAvaliacao(
  ticketId: number,
  nota: number,
  comentario?: string,
): Promise<boolean> {
  const token = await getServiceToken();
  if (!token) return false;
  const emojis = ["😡", "🙁", "😐", "🙂", "😍"];
  const linhas = [
    `<p><b>[avaliacao-portal] nota=${nota}</b> ${emojis[nota - 1] ?? ""} — avaliação do requerente ao aprovar a solução.</p>`,
  ];
  if (comentario?.trim()) linhas.push(`<p>${comentario.trim()}</p>`);
  try {
    const res = await v2Fetch(token, `/Assistance/Ticket/${ticketId}/Timeline/Followup`, {
      method: "POST",
      body: JSON.stringify({ content: linhas.join(""), is_private: true }),
    });
    return res.ok;
  } catch {
    serviceTokenCache = null;
    return false;
  }
}

// Status de solução (schema Solution do OpenAPI): 2=Aguardando, 3=Aceita, 4=Recusada
const SOLUTION_WAITING = 2;
const SOLUTION_ACCEPTED = 3;
const SOLUTION_REFUSED = 4;

export interface PendingSolution {
  id: number;
  content?: string;
  date?: string;
}

/** Extrai o valor numérico de um campo que pode vir como número ou objeto {id}. */
function numericValue(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "number") {
    return (v as { id: number }).id;
  }
  return undefined;
}

/** Solução mais recente aguardando aprovação do usuário (status 2), se houver. */
export async function getPendingSolution(
  accessToken: string,
  ticketId: number,
): Promise<PendingSolution | null> {
  const res = await v2Fetch(accessToken, `/Assistance/Ticket/${ticketId}/Timeline/Solution`);
  if (!res.ok) {
    console.error(
      `Falha ao listar soluções do chamado ${ticketId} (HTTP ${res.status}): ${await errorDetail(res)}`,
    );
    return null;
  }
  const data = (await res.json()) as unknown;
  const raw = Array.isArray(data) ? data : [];
  // a lista vem com itens embrulhados ({type, item: {...}}), como na timeline
  const items = raw
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((entry) => {
      const inner = entry.item;
      return (typeof inner === "object" && inner !== null ? inner : entry) as Record<string, unknown>;
    });

  // diagnóstico: formato real dos itens (id + status) sem expor conteúdo
  console.log(
    `Soluções do chamado ${ticketId}: ` +
      (items.length === 0
        ? "nenhuma"
        : items.map((s) => `id=${String(s.id)} status=${JSON.stringify(s.status)}`).join(", ")),
  );

  const waiting = items
    .filter((s) => numericValue(s.status) === SOLUTION_WAITING && typeof s.id === "number")
    .sort((a, b) => (b.id as number) - (a.id as number));

  const latest = waiting[0];
  if (!latest) return null;
  return {
    id: latest.id as number,
    content: typeof latest.content === "string" ? latest.content : undefined,
    date: typeof latest.date_creation === "string" ? latest.date_creation : undefined,
  };
}

/**
 * Aprova ou recusa uma solução (PATCH no subitem, rota validada no OpenAPI).
 * O GLPI cuida do resto do fluxo nativo: aprovada → chamado fechado;
 * recusada → chamado volta para atendimento.
 */
export async function setSolutionApproval(
  accessToken: string,
  ticketId: number,
  solutionId: number,
  approve: boolean,
): Promise<void> {
  const res = await v2Fetch(
    accessToken,
    `/Assistance/Ticket/${ticketId}/Timeline/Solution/${solutionId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: approve ? SOLUTION_ACCEPTED : SOLUTION_REFUSED }),
    },
  );
  if (!res.ok) {
    throw new GlpiError(
      `Falha ao ${approve ? "aprovar" : "recusar"} a solução (HTTP ${res.status}): ${await errorDetail(res)}`,
      res.status,
    );
  }
}

// ---------------------------------------------------------------------------
// Conta de serviço — usada EXCLUSIVAMENTE para aprovar solução em nome do
// requerente (o perfil self-service não tem esse direito na API v2, embora o
// tenha na interface web). Nunca usada para criar/ler chamados.
// ---------------------------------------------------------------------------

let serviceTokenCache: { token: string; expiresAt: number } | null = null;

export async function getServiceToken(): Promise<string | null> {
  const username = process.env.GLPI_SERVICE_USERNAME;
  const password = process.env.GLPI_SERVICE_PASSWORD;
  if (!username || !password) return null;
  if (serviceTokenCache && Date.now() < serviceTokenCache.expiresAt - 60_000) {
    return serviceTokenCache.token;
  }
  try {
    const tokens = await passwordLogin(username, password);
    serviceTokenCache = { token: tokens.accessToken, expiresAt: tokens.expiresAt };
    return tokens.accessToken;
  } catch (err) {
    console.error(
      "Falha no login da conta de serviço:",
      err instanceof Error ? err.message : "erro desconhecido",
    );
    return null;
  }
}

/**
 * Aprova a solução usando a conta de serviço, registrando o usuário como
 * aprovador. Retorna false se a conta não estiver configurada ou falhar.
 */
export async function approveSolutionAsService(
  ticketId: number,
  solutionId: number,
  approverUserId?: number,
): Promise<boolean> {
  const token = await getServiceToken();
  if (!token) return false;

  const patch = async (body: Record<string, unknown>) =>
    v2Fetch(token, `/Assistance/Ticket/${ticketId}/Timeline/Solution/${solutionId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

  try {
    let res = await patch(
      approverUserId ? { status: 3, approver: { id: approverUserId } } : { status: 3 },
    );
    if (!res.ok && approverUserId) {
      // se o campo approver não for aceito, tenta só o status
      res = await patch({ status: 3 });
    }
    if (!res.ok) {
      console.error(
        `Conta de serviço: falha ao aprovar solução do chamado ${ticketId} (HTTP ${res.status}): ${await errorDetail(res)}`,
      );
      return false;
    }
    // o PATCH da solução não fecha o chamado sozinho (diferente da interface
    // web) — fecha explicitamente; se falhar, o GLPI fecha no prazo automático
    const close = await v2Fetch(token, `/Assistance/Ticket/${ticketId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: 6 }),
    });
    if (!close.ok) {
      console.error(
        `Conta de serviço: solução aprovada mas falha ao fechar o chamado ${ticketId} (HTTP ${close.status}): ${await errorDetail(close)}`,
      );
    }
    return true;
  } catch (err) {
    // token de serviço morto — limpa o cache para renovar na próxima
    serviceTokenCache = null;
    console.error(
      "Conta de serviço: erro ao aprovar solução:",
      err instanceof Error ? err.message : "erro desconhecido",
    );
    return false;
  }
}

/**
 * Anexa um arquivo ao chamado (POST multipart em Timeline/Document — cria o
 * documento e o vincula de uma vez). Usa o token do PRÓPRIO usuário: o GLPI
 * permite anexar a quem pode adicionar acompanhamentos (requerente incluso).
 */
export async function addTicketDocument(
  accessToken: string,
  ticketId: number,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await v2Fetch(accessToken, `/Assistance/Ticket/${ticketId}/Timeline/Document`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new GlpiError(
      `Falha ao anexar arquivo (HTTP ${res.status}): ${await errorDetail(res)}`,
      res.status,
    );
  }
}

/**
 * Anexa um arquivo usando a conta de serviço — fallback para perfis
 * self-service, que não têm o direito estático de criar Documentos na API v2
 * (embora anexem normalmente pela interface web). Requer que o perfil da
 * conta tenha "Acompanhamentos: adicionar a todos os chamados".
 */
export async function addTicketDocumentAsService(ticketId: number, file: File): Promise<boolean> {
  const token = await getServiceToken();
  if (!token) return false;
  try {
    const form = new FormData();
    form.append("file", file, file.name);
    const res = await v2Fetch(token, `/Assistance/Ticket/${ticketId}/Timeline/Document`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      console.error(
        `Conta de serviço: falha ao anexar "${file.name}" ao chamado ${ticketId} (HTTP ${res.status}): ${await errorDetail(res)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    serviceTokenCache = null;
    console.error(
      "Conta de serviço: erro ao anexar arquivo:",
      err instanceof Error ? err.message : "erro desconhecido",
    );
    return false;
  }
}

/** Fecha o chamado diretamente (PATCH status 6) — usado como plano B da aprovação. */
export async function closeTicket(accessToken: string, ticketId: number): Promise<void> {
  const res = await v2Fetch(accessToken, `/Assistance/Ticket/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: 6 }),
  });
  if (!res.ok) {
    throw new GlpiError(
      `Falha ao fechar o chamado (HTTP ${res.status}): ${await errorDetail(res)}`,
      res.status,
    );
  }
}

export interface TicketDocument {
  id: number;
  name: string;
  mime?: string;
}

/** Ids de documentos vinculados ao chamado (null = falha na consulta). */
async function listTicketDocumentIds(token: string, ticketId: number): Promise<number[] | null> {
  try {
    const res = await v2Fetch(token, `/Assistance/Ticket/${ticketId}/Timeline/Document`);
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return null;
    const ids: number[] = [];
    for (const raw of data) {
      if (typeof raw !== "object" || raw === null) continue;
      const entry = raw as Record<string, unknown>;
      const item = (typeof entry.item === "object" && entry.item !== null ? entry.item : entry) as Record<
        string,
        unknown
      >;
      const docId = numericValue(item.documents_id) ?? numericValue(item.document);
      if (docId && !ids.includes(docId)) ids.push(docId);
    }
    return ids;
  } catch {
    return null;
  }
}

/**
 * Anexos do chamado, com nome e tipo. Tenta com o token do usuário; perfis
 * self-service podem não enxergar documentos pela API — a conta de serviço
 * cobre esses casos (a página só chama isto para chamados que o usuário vê).
 */
export async function getTicketDocuments(
  accessToken: string,
  ticketId: number,
): Promise<TicketDocument[]> {
  let ids = await listTicketDocumentIds(accessToken, ticketId);
  const serviceToken = await getServiceToken();
  if ((ids === null || ids.length === 0) && serviceToken) {
    ids = await listTicketDocumentIds(serviceToken, ticketId);
  }
  if (!ids || ids.length === 0) return [];

  const docs: TicketDocument[] = [];
  for (const docId of ids) {
    const doc: TicketDocument = { id: docId, name: `Anexo ${docId}` };
    for (const token of [accessToken, serviceToken]) {
      if (!token) continue;
      try {
        const res = await v2Fetch(token, `/Management/Document/${docId}`);
        if (!res.ok) continue;
        const d = (await res.json()) as Record<string, unknown>;
        if (typeof d.name === "string" && d.name) doc.name = d.name;
        else if (typeof d.filename === "string" && d.filename) doc.name = d.filename;
        if (typeof d.mime === "string" && d.mime) doc.mime = d.mime;
        break;
      } catch {
        /* tenta o próximo token */
      }
    }
    docs.push(doc);
  }
  return docs;
}

/**
 * Confere se um documento pertence ao chamado e retorna o arquivo (download
 * via conta de serviço — self-service não tem direito de leitura de
 * documentos na API). O chamador DEVE validar antes que o usuário enxerga o
 * chamado (getTicket com o token dele).
 */
export async function downloadTicketDocument(
  userAccessToken: string,
  ticketId: number,
  documentId: number,
): Promise<Response | null> {
  const serviceToken = await getServiceToken();
  // confirma o vínculo documento→chamado (nunca servir documento de outro chamado);
  // lista vazia com o token do usuário também cai para a conta de serviço —
  // perfis self-service não enxergam documentos pela API
  let ids = await listTicketDocumentIds(userAccessToken, ticketId);
  if ((ids === null || ids.length === 0) && serviceToken) {
    ids = await listTicketDocumentIds(serviceToken, ticketId);
  }
  if (!ids || !ids.includes(documentId)) return null;

  for (const token of [userAccessToken, serviceToken]) {
    if (!token) continue;
    try {
      const res = await v2Fetch(token, `/Management/Document/${documentId}/Download`);
      if (res.ok) return res;
    } catch {
      /* tenta o próximo token */
    }
  }
  return null;
}

/**
 * Timeline do chamado (acompanhamentos, soluções, tarefas).
 * Endpoint esperado: /Assistance/Ticket/{id}/Timeline — validar no OpenAPI.
 * Retorna [] se o endpoint não existir nesta instância (a página de detalhe
 * ainda mostra a descrição do chamado).
 */
export async function getTicketTimeline(accessToken: string, id: number): Promise<TimelineItem[]> {
  const res = await v2Fetch(accessToken, `/Assistance/Ticket/${id}/Timeline`);
  if (!res.ok) return [];

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];

  const items: TimelineItem[] = [];
  for (const raw of data) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    // formatos possíveis: { type, item: {...} } ou o item direto
    const item = (typeof entry.item === "object" && entry.item !== null ? entry.item : entry) as Record<
      string,
      unknown
    >;
    const content = typeof item.content === "string" ? item.content : "";
    if (!content) continue;
    // autor: a API v2 traz o usuário como objeto {id, name} (schema Followup)
    const user = item.user as Record<string, unknown> | undefined;
    const authorName =
      (typeof user?.name === "string" && user.name) ||
      (typeof item.users_id_friendlyname === "string" ? item.users_id_friendlyname : undefined) ||
      undefined;
    items.push({
      type: typeof entry.type === "string" ? entry.type : "item",
      content,
      date: typeof item.date === "string" ? item.date : typeof item.date_creation === "string" ? item.date_creation : undefined,
      authorName,
      authorId: numericValue(user?.id) ?? numericValue(item.users_id),
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Mapeamentos de exibição (status/urgência do GLPI)
// ---------------------------------------------------------------------------

export const TICKET_STATUS: Record<number, { label: string; badge: string }> = {
  1: { label: "Novo", badge: "bg-blue-100 text-blue-800" },
  2: { label: "Em atendimento", badge: "bg-amber-100 text-amber-800" },
  3: { label: "Em atendimento", badge: "bg-amber-100 text-amber-800" },
  4: { label: "Pendente", badge: "bg-violet-100 text-violet-800" },
  5: { label: "Solucionado", badge: "bg-green-100 text-green-800" },
  6: { label: "Fechado", badge: "bg-gray-200 text-gray-700" },
  10: { label: "Aguardando aprovação", badge: "bg-cyan-100 text-cyan-800" },
};

export function statusInfo(status: number): { label: string; badge: string } {
  return TICKET_STATUS[status] ?? { label: "Em aberto", badge: "bg-gray-100 text-gray-700" };
}

/** Chamados "abertos" = tudo que não está solucionado/fechado (filtro da lista). */
export function isOpenStatus(status: number): boolean {
  return status !== 5 && status !== 6;
}

/** Urgência amigável do portal → escala do GLPI (spec §5.2). */
export const URGENCIAS = [
  { value: "baixa", label: "Posso esperar", glpi: 2 },
  { value: "media", label: "Está atrapalhando o trabalho", glpi: 3 },
  { value: "alta", label: "Parou tudo, é urgente", glpi: 4 },
] as const;

export type UrgenciaValue = (typeof URGENCIAS)[number]["value"];
