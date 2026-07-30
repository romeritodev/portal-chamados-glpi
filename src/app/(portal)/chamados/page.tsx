import Link from "next/link";
import { redirect } from "next/navigation";
import AvisosCelular from "@/components/AvisosCelular";
import { statusChamado, urgenciaChamado } from "@/lib/copy";
import { ehAtribuidoA, slaVisual } from "@/lib/filas";
import { GlpiAuthError, isOpenStatus, listMyTickets, type GlpiTicket } from "@/lib/glpi";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function formataData(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Filtros do usuário comum (por status) e filas inteligentes do perfil central
// ---------------------------------------------------------------------------

const FILTROS = [
  { key: "abertos", label: "Em aberto", vazio: "Você não tem chamados em aberto.", test: (t: GlpiTicket) => isOpenStatus(t.status) },
  { key: "solucionados", label: "Resolvidos — confirme", vazio: "Nenhum chamado aguardando sua confirmação.", test: (t: GlpiTicket) => t.status === 5 },
  { key: "fechados", label: "Encerrados", vazio: "Você não tem chamados encerrados.", test: (t: GlpiTicket) => t.status === 6 },
  { key: "todos", label: "Todos", vazio: "Você ainda não tem chamados.", test: () => true },
] as const;

/** Fim do dia de hoje — chamados com prazo até aqui entram em "vencendo hoje". */
function fimDeHoje(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function prazoDe(t: GlpiTicket): Date | null {
  if (!t.timeToResolve) return null;
  const d = new Date(t.timeToResolve.includes("T") ? t.timeToResolve : t.timeToResolve.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function montaFilas(userId?: number, nome?: string) {
  return [
    { key: "abertos", label: "📋 Todos abertos", vazio: "Nenhum chamado aberto. Tudo em dia! 🎉", test: (t: GlpiTicket) => isOpenStatus(t.status) },
    { key: "minha", label: "🔥 Minha fila", vazio: "Nada atribuído a você agora.", test: (t: GlpiTicket) => isOpenStatus(t.status) && ehAtribuidoA(t, userId, nome) },
    { key: "sem-dono", label: "📥 Não atribuídos", vazio: "Todos os chamados têm dono. 👏", test: (t: GlpiTicket) => isOpenStatus(t.status) && t.assignees.length === 0 },
    { key: "vencendo", label: "⏰ Vencendo hoje", vazio: "Nenhum prazo apertado hoje.", test: (t: GlpiTicket) => { const p = prazoDe(t); return isOpenStatus(t.status) && p !== null && p <= fimDeHoje(); } },
    { key: "aprovacao", label: "🤝 Aguardando aprovação", vazio: "Nenhuma solução esperando o usuário confirmar.", test: (t: GlpiTicket) => t.status === 5 },
    { key: "fechados", label: "Fechados", vazio: "Nenhum chamado fechado carregado.", test: (t: GlpiTicket) => t.status === 6 },
  ] as const;
}

/** Semáforo de SLA (visão central): cor da borda + texto do prazo. */
function slaInfo(t: GlpiTicket) {
  return slaVisual(t.timeToResolve, isOpenStatus(t.status));
}

/** Data no formato do input (aaaa-mm-dd) → Date, ou null. */
function dataDoInput(v?: string, fimDoDia = false): Date | null {
  if (!v) return null;
  const d = new Date(`${v}T${fimDoDia ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function abertoEm(t: GlpiTicket): Date | null {
  if (!t.date) return null;
  const d = new Date(t.date.includes("T") ? t.date : t.date.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function ChamadosPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; setor?: string; de?: string; ate?: string }>;
}) {
  const session = await requireSession();
  const { filtro, setor, de, ate } = await searchParams;
  const central = session.user?.profileInterface === "central";

  let tickets: GlpiTicket[];
  try {
    // Teto alto de propósito: a busca percorre páginas e para sozinha quando
    // os registros acabam, então pedir mais que o necessário não custa
    // requisição a mais. Foi um teto baixo (500) que fez a aba "Fechados"
    // mostrar 454 onde havia 711.
    tickets = await listMyTickets(session.accessToken!, central ? 5000 : 1000);
  } catch (err) {
    if (err instanceof GlpiAuthError) redirect("/login");
    throw err;
  }

  const grupos = central ? montaFilas(session.user?.id, session.user?.friendlyName) : FILTROS;
  const ativo = grupos.find((f) => f.key === filtro) ?? grupos[0];

  // Setor e data só existem para a equipe: o usuário comum só tem os próprios
  // chamados, e filtrar cinco itens não ajuda ninguém.
  const dataDe = central ? dataDoInput(de) : null;
  const dataAte = central ? dataDoInput(ate, true) : null;
  const setorEscolhido = central ? (setor ?? "") : "";
  const temRefino = Boolean(setorEscolhido || dataDe || dataAte);

  // as opções do seletor saem dos chamados carregados, não de uma lista fixa:
  // secretaria que nunca abriu chamado não precisa poluir o menu
  const setoresDisponiveis = central
    ? Array.from(new Set(tickets.map((t) => t.entityName).filter((s): s is string => !!s))).sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      )
    : [];

  const passaNoRefino = (t: GlpiTicket) => {
    if (setorEscolhido && t.entityName !== setorEscolhido) return false;
    if (dataDe || dataAte) {
      const d = abertoEm(t);
      if (!d) return false;
      if (dataDe && d < dataDe) return false;
      if (dataAte && d > dataAte) return false;
    }
    return true;
  };

  const visiveis = tickets.filter((t) => ativo.test(t) && passaNoRefino(t));

  /** mantém setor e datas ao trocar de fila — trocar de aba não pode zerar o refino */
  const linkDaFila = (key: string) => {
    const p = new URLSearchParams();
    if (key !== "abertos") p.set("filtro", key);
    if (setorEscolhido) p.set("setor", setorEscolhido);
    if (de) p.set("de", de);
    if (ate) p.set("ate", ate);
    const q = p.toString();
    return q ? `/chamados?${q}` : "/chamados";
  };

  // Os "resolvidos, aguardando confirmação" não entram no filtro padrão
  // ("Em aberto"). Sem nenhum sinal, quem tem só um desses abriria a tela e
  // leria "nenhum chamado". Em vez de um bloco fixo repetindo o que a lista
  // já diz, destacamos a aba e avisamos quando a lista sai vazia.
  const aguardandoConfirmacao = central ? 0 : tickets.filter((t) => t.status === 5).length;

  const chip = (on: boolean, chamando = false) =>
    `inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
      on
        ? "bg-brand-600 text-white"
        : chamando
          ? // pede confirmação do usuário: destaca sem ocupar espaço na tela
            "bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-50"
          : "bg-superficie text-gray-700 border border-gray-300 hover:bg-gray-50"
    }`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h2 className="text-xl font-bold">{central ? "Chamados" : "Meus chamados"}</h2>
      {!central && <AvisosCelular />}

      <div className="mt-3 flex flex-wrap gap-2">
        {grupos.map((f) => {
          // a contagem já reflete o refino, senão o número da aba brigaria
          // com o tamanho da lista logo abaixo
          const qtd = tickets.filter((t) => f.test(t) && passaNoRefino(t)).length;
          return (
            <Link
              key={f.key}
              href={linkDaFila(f.key)}
              className={chip(ativo.key === f.key, f.key === "solucionados" && qtd > 0)}
            >
              {f.label} <span className="opacity-70">({qtd})</span>
            </Link>
          );
        })}
      </div>

      {central && (
        <form
          method="get"
          className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-superficie p-3"
        >
          {/* a fila escolhida viaja junto: filtrar não pode jogar você de volta
              para "Todos abertos" */}
          {ativo.key !== "abertos" && <input type="hidden" name="filtro" value={ativo.key} />}
          <div className="min-w-40 flex-1">
            <label htmlFor="setor" className="mb-1 block text-xs font-medium text-gray-600">
              Setor
            </label>
            <select
              id="setor"
              name="setor"
              defaultValue={setorEscolhido}
              className="min-h-11 w-full rounded-lg border border-gray-300 bg-superficie px-2 py-2 text-sm"
            >
              <option value="">Todos os setores</option>
              {setoresDisponiveis.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="de" className="mb-1 block text-xs font-medium text-gray-600">
              Aberto de
            </label>
            <input
              id="de"
              type="date"
              name="de"
              defaultValue={de ?? ""}
              className="min-h-11 rounded-lg border border-gray-300 bg-superficie px-2 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="ate" className="mb-1 block text-xs font-medium text-gray-600">
              até
            </label>
            <input
              id="ate"
              type="date"
              name="ate"
              defaultValue={ate ?? ""}
              className="min-h-11 rounded-lg border border-gray-300 bg-superficie px-2 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Filtrar
          </button>
          {temRefino && (
            <Link
              href={ativo.key === "abertos" ? "/chamados" : `/chamados?filtro=${ativo.key}`}
              className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:underline"
            >
              Limpar
            </Link>
          )}
        </form>
      )}

      {visiveis.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-superficie p-8 text-center shadow">
          <p className="text-gray-600">{ativo.vazio}</p>
          {/* a lista está vazia, mas há algo esperando noutra aba */}
          {aguardandoConfirmacao > 0 && ativo.key !== "solucionados" && (
            <Link
              href="/chamados?filtro=solucionados"
              className="mt-3 inline-block rounded-lg bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50"
            >
              👉 {aguardandoConfirmacao === 1
                ? "1 chamado foi resolvido e aguarda sua confirmação"
                : `${aguardandoConfirmacao} chamados foram resolvidos e aguardam sua confirmação`}
            </Link>
          )}
          {!central && (
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
            >
              Abrir um chamado
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {visiveis.map((t) => {
            const status = statusChamado(t.status);
            const sla = central ? slaInfo(t) : null;
            const urg = urgenciaChamado(t.urgency);
            const aberto = isOpenStatus(t.status);
            return (
              <li key={t.id}>
                <Link
                  href={`/chamados/${t.id}`}
                  className={`block rounded-2xl border border-gray-200 bg-superficie p-4 shadow-sm transition hover:border-brand-600 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                    // a borda mostra a urgência (o que o chamado É); o prazo do
                    // SLA fica na etiqueta da direita (o que o relógio diz)
                    central && aberto ? `border-l-4 ${urg.borda}` : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500">
                        #{t.id} · {formataData(t.date)}
                      </p>
                      <p className="mt-0.5 truncate text-[15px] font-semibold leading-snug">
                        {t.name}
                      </p>
                      {central && (t.requesterName || t.entityName || t.categoryName) && (
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          {t.requesterName && (
                            <span className="font-medium text-gray-700">👤 {t.requesterName}</span>
                          )}
                          {t.entityName && (
                            <span className="truncate rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              {t.entityName}
                            </span>
                          )}
                          {/* a categoria diz o que levar antes de sair da sala */}
                          {t.categoryName && (
                            <span className="truncate rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-marca">
                              {t.categoryName}
                            </span>
                          )}
                        </p>
                      )}
                      {t.status === 4 && (
                        <p className="mt-1 text-sm font-medium text-alerta">{status.frase}</p>
                      )}
                      {t.status === 5 && !central && (
                        <p className="mt-1 text-sm font-medium text-sucesso">
                          Toque para confirmar se foi resolvido
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.tag}`}>
                        {status.label}
                      </span>
                      {/* a palavra acompanha a cor: quem não distingue tons, lê.
                          Caixa alta e canto reto separam a urgência da situação
                          (pílula) mesmo quando as duas caem no mesmo tom. */}
                      {central && aberto && (
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${urg.chip}`}
                        >
                          {urg.rotulo}
                        </span>
                      )}
                      {sla && (
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${sla.pill}`}>
                          {sla.texto}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
