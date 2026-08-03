import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { lerAvaliacoes, resumoCsat } from "@/lib/avaliacoes";
import { NOTAS_CSAT } from "@/lib/copy";
import { getCurrentUser, GlpiAuthError } from "@/lib/glpi";
import { nomeInstituicao } from "@/lib/instituicao";
import {
  aplicaFiltros,
  buscarTodosChamados,
  contagemPor,
  distribuicaoStatus,
  filtraPorPeriodo,
  opcoesDe,
  porMes,
  resolvePeriodo,
  tempoSolucao,
} from "@/lib/relatorios";
import { statusInfo } from "@/lib/glpi";
import { requireSession } from "@/lib/session";
import BotaoImprimir from "./BotaoImprimir";
import { BarrasHorizontais, Colunas, Rosca } from "./graficos";

const LISTA_MAX = 100;

export const dynamic = "force-dynamic";

const PERIODOS = [
  { key: "mes", label: "Mês atual" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "ano", label: "Este ano" },
  { key: "tudo", label: "Tudo" },
] as const;

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string;
    de?: string;
    ate?: string;
    categoria?: string;
    setor?: string;
    usuario?: string;
  }>;
}) {
  const session = await requireSession();

  // restrição: apenas perfis de interface central (técnicos/admins) — checagem
  // ao vivo no GLPI, não confiar apenas no cookie
  let me;
  try {
    me = await getCurrentUser(session.accessToken!);
  } catch (err) {
    if (err instanceof GlpiAuthError) redirect("/login");
    throw err;
  }
  if (me?.profileInterface !== "central") notFound();

  const { periodo, de, ate, categoria, setor, usuario } = await searchParams;
  const agora = new Date();
  const p = resolvePeriodo(periodo, de, ate, agora);
  const filtros = { categoria, setor, usuario };

  const todos = await buscarTodosChamados();
  const noPeriodoSemDimensao = filtraPorPeriodo(todos, p);
  const doPeriodo = aplicaFiltros(noPeriodoSemDimensao, filtros);

  // opções dos selects refletem o período (antes dos filtros de dimensão)
  const opcoesCategoria = opcoesDe(noPeriodoSemDimensao, (t) => t.categoria);
  const opcoesSetor = opcoesDe(noPeriodoSemDimensao, (t) => t.entidade);
  const opcoesUsuario = opcoesDe(noPeriodoSemDimensao, (t) => t.requerente);

  const finalizados = doPeriodo.filter((t) => t.status === 5 || t.status === 6).length;
  const emAndamento = doPeriodo.filter((t) => t.status >= 1 && t.status <= 4).length;
  const { media, mediana } = tempoSolucao(doPeriodo);
  const porCategoria = contagemPor(doPeriodo, (t) => t.categoria);
  const porEntidade = contagemPor(doPeriodo, (t) => t.entidade);
  const statusDist = distribuicaoStatus(doPeriodo);
  const meses = porMes(doPeriodo, p, agora);
  // a satisfação segue os mesmos filtros do resto da tela — e, de quebra,
  // ignora nota de chamado que não existe mais
  const csat = resumoCsat(
    await lerAvaliacoes(),
    doPeriodo.map((t) => t.id),
  );

  const periodoAtivo = PERIODOS.find((x) => x.key === periodo)?.key ?? (de || ate ? "personalizado" : "ano");
  const paramsAtuais = new URLSearchParams();
  if (periodo) paramsAtuais.set("periodo", periodo);
  if (de) paramsAtuais.set("de", de);
  if (ate) paramsAtuais.set("ate", ate);
  if (categoria) paramsAtuais.set("categoria", categoria);
  if (setor) paramsAtuais.set("setor", setor);
  if (usuario) paramsAtuais.set("usuario", usuario);
  const csvQuery = paramsAtuais;

  // pílulas de período preservam os filtros de dimensão ativos
  const hrefPeriodo = (key: string) => {
    const q = new URLSearchParams(paramsAtuais);
    q.set("periodo", key);
    q.delete("de");
    q.delete("ate");
    return `/relatorios?${q.toString()}`;
  };

  const filtrosAtivos = [
    categoria && `Categoria: ${categoria}`,
    setor && `Setor: ${setor}`,
    usuario && `Usuário: ${usuario}`,
  ].filter(Boolean);

  const pill = (ativo: boolean) =>
    `rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
      ativo ? "bg-brand-800 text-white" : "bg-superficie text-gray-700 border border-gray-300 hover:bg-gray-50"
    }`;

  return (
    <>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* cabeçalho só para o PDF */}
        <div className="hidden print:block">
          <p className="text-sm text-gray-500">{nomeInstituicao()} — Suporte de TI</p>
          <h1 className="text-xl font-bold">Relatório de chamados · {p.rotulo}</h1>
          <p className="mb-4 text-sm text-gray-500">
            Gerado em {agora.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            {filtrosAtivos.length > 0 ? ` · ${filtrosAtivos.join(" · ")}` : ""}
          </p>
        </div>

        {/* filtros */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {PERIODOS.map((x) => (
            <Link key={x.key} href={hrefPeriodo(x.key)} className={pill(periodoAtivo === x.key)}>
              {x.label}
            </Link>
          ))}
          <div className="ml-auto flex gap-2">
            <a
              href={`/api/relatorios/csv?${csvQuery.toString()}`}
              className="rounded-lg border border-gray-300 bg-superficie px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              ⬇ CSV
            </a>
            <BotaoImprimir />
          </div>
        </div>

        {/* dimensões + período personalizado */}
        <form
          method="GET"
          action="/relatorios"
          className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-superficie p-3 shadow-sm print:hidden"
        >
          {periodo && periodo !== "personalizado" && <input type="hidden" name="periodo" value={periodo} />}
          <CampoSelect nome="categoria" rotulo="Categoria" valor={categoria} opcoes={opcoesCategoria} todos="Todas" />
          <CampoSelect nome="setor" rotulo="Setor" valor={setor} opcoes={opcoesSetor} todos="Todos" />
          <CampoSelect nome="usuario" rotulo="Usuário" valor={usuario} opcoes={opcoesUsuario} todos="Todos" />
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
            De
            <input type="date" name="de" defaultValue={de} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-normal text-gray-800" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
            Até
            <input type="date" name="ate" defaultValue={ate} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-normal text-gray-800" />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Aplicar filtros
          </button>
          {(categoria || setor || usuario || de || ate) && (
            <Link
              href={periodo ? `/relatorios?periodo=${periodo}` : "/relatorios"}
              className="rounded-lg px-3 py-2 text-sm font-medium text-marca hover:underline"
            >
              Limpar
            </Link>
          )}
        </form>

        {/* KPIs — o número principal em destaque, os apoios ao lado */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <section className="col-span-2 break-inside-avoid rounded-xl bg-brand-800 p-5 text-white shadow-sm lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-200">
              Chamados no período
            </p>
            <p className="mt-1 text-5xl font-extrabold tabular-nums">{doPeriodo.length}</p>
            <p className="text-sm text-brand-100">{p.rotulo}</p>
            <div className="mt-3">
              <Tendencia dados={meses} />
            </div>
          </section>

          <Kpi
            cor="border-green-600"
            titulo="Finalizados"
            valor={String(finalizados)}
            sub={doPeriodo.length > 0 ? `${Math.round((finalizados / doPeriodo.length) * 100)}% do período` : "—"}
          />
          <Kpi
            cor="border-amber-500"
            titulo="Tempo médio"
            valor={media !== undefined ? `${media.toFixed(1)}d` : "—"}
            sub={mediana !== undefined ? `mediana ${mediana.toFixed(1)}d` : "sem soluções no período"}
          />
          <Kpi cor="border-gray-700" titulo="Em andamento" valor={String(emAndamento)} sub="novo + atendimento + pendente" />
          <Kpi
            cor="border-brand-600"
            titulo="Satisfação"
            valor={csat.quantidade > 0 ? `${csat.media.toFixed(1)}/5` : "—"}
            sub={
              csat.quantidade > 0
                ? `${csat.quantidade} ${csat.quantidade === 1 ? "avaliação" : "avaliações"}`
                : "ninguém avaliou ainda"
            }
          />
        </div>

        {/* gráficos */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Cartao titulo="Chamados por categoria" sub={p.rotulo}>
            <BarrasHorizontais dados={porCategoria} />
          </Cartao>
          <Cartao titulo="Distribuição por status" sub={p.rotulo}>
            <Rosca dados={statusDist} total={doPeriodo.length} />
          </Cartao>
          <Cartao titulo="Satisfação do atendimento" sub="nota dada pelo usuário ao confirmar a solução">
            <Satisfacao resumo={csat} />
          </Cartao>
          <Cartao titulo="Chamados por secretaria" sub={p.rotulo}>
            <BarrasHorizontais dados={porEntidade} />
          </Cartao>
          <Cartao titulo="Chamados abertos por mês" sub={p.rotulo}>
            <Colunas dados={meses} />
          </Cartao>
        </div>

        {/* lista dos chamados filtrados, clicável para o detalhe */}
        <section className="mt-4 rounded-xl bg-superficie p-5 shadow-sm">
          <h3 className="font-bold text-gray-900">Chamados do período</h3>
          <p className="mb-3 text-xs text-gray-500">
            {doPeriodo.length} chamado{doPeriodo.length === 1 ? "" : "s"}
            {doPeriodo.length > LISTA_MAX ? ` · exibindo os ${LISTA_MAX} mais recentes (use o CSV para a lista completa)` : ""}
            {" · clique para abrir"}
          </p>
          {doPeriodo.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">Nenhum chamado com os filtros atuais.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {[...doPeriodo]
                .sort((a, b) => b.id - a.id)
                .slice(0, LISTA_MAX)
                .map((t) => {
                  const st = statusInfo(t.status);
                  return (
                    <li key={t.id}>
                      <Link
                        href={`/chamados/${t.id}`}
                        className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50 print:py-1"
                      >
                        <span className="min-w-0">
                          <span className="text-sm text-gray-500">
                            #{t.id} · {t.data ? new Date(t.data.replace(" ", "T")).toLocaleDateString("pt-BR") : ""}
                          </span>
                          <span className="block truncate font-medium text-gray-900">{t.titulo}</span>
                          <span className="block truncate text-xs text-gray-500">
                            {t.requerente} · {t.entidade}
                            {t.categoria !== "Sem categoria" ? ` · ${t.categoria}` : ""}
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${st.badge}`}>
                          {st.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function CampoSelect({
  nome,
  rotulo,
  valor,
  opcoes,
  todos,
}: {
  nome: string;
  rotulo: string;
  valor?: string;
  opcoes: string[];
  todos: string;
}) {
  return (
    <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-semibold text-gray-500 sm:max-w-56">
      {rotulo}
      <select
        name={nome}
        defaultValue={valor ?? ""}
        className="rounded-lg border border-gray-300 bg-superficie px-2 py-2 text-sm font-normal text-gray-800"
      >
        <option value="">{todos}</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {o.length > 40 ? `${o.slice(0, 39)}…` : o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Kpi({ cor, titulo, valor, sub }: { cor: string; titulo: string; valor: string; sub: string }) {
  return (
    <div className={`rounded-xl border-l-4 ${cor} bg-superficie p-4 shadow-sm`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{valor}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  );
}

/** Minigráfico de tendência dentro do cartão principal (sem eixos: a leitura
 *  é a forma da curva, e o número exato está logo acima). */
function Tendencia({ dados }: { dados: { rotulo: string; valor: number }[] }) {
  if (dados.length < 2) return null;
  const maximo = Math.max(...dados.map((d) => d.valor), 1);
  const largura = 100;
  const altura = 26;
  const passo = largura / (dados.length - 1);
  const pontos = dados
    .map((d, i) => `${(i * passo).toFixed(1)},${(altura - (d.valor / maximo) * altura).toFixed(1)}`)
    .join(" ");
  const ultimo = dados[dados.length - 1];

  return (
    <div className="flex items-end gap-3">
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        className="h-8 flex-1"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Tendência dos últimos ${dados.length} meses`}
      >
        <polyline
          points={pontos}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className="text-brand-200"
        />
      </svg>
      <span className="shrink-0 text-xs text-brand-100">
        {ultimo.rotulo}: <span className="font-bold tabular-nums">{ultimo.valor}</span>
      </span>
    </div>
  );
}

/**
 * Distribuição das notas de satisfação.
 *
 * O NOME fica escrito ao lado do rosto, e não só ao passar o mouse: quem
 * imprime o relatório não passa o mouse em papel, e quem projeta numa reunião
 * também não. Rosto sozinho obriga a decorar a escala.
 */
function Satisfacao({ resumo }: { resumo: { quantidade: number; media: number; distribuicao: number[] } }) {
  if (resumo.quantidade === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-500">
        Nenhuma avaliação no período. Os usuários avaliam ao confirmar que o chamado foi resolvido.
      </p>
    );
  }
  const maximo = Math.max(...resumo.distribuicao, 1);
  return (
    <div>
      <p className="text-3xl font-bold tabular-nums text-gray-900">
        {resumo.media.toFixed(1)}
        <span className="text-base font-normal text-gray-500">/5</span>
      </p>
      <ul className="mt-3 space-y-1.5">
        {[5, 4, 3, 2, 1].map((nota) => {
          const qtd = resumo.distribuicao[nota - 1];
          const escala = NOTAS_CSAT[nota - 1];
          return (
            <li key={nota} className="flex items-center gap-2">
              <span aria-hidden className="w-6 text-center text-lg">
                {escala.rosto}
              </span>
              <span className="w-20 text-sm font-medium text-gray-700">{escala.nome}</span>
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                <span
                  className="block h-full rounded-full bg-brand-600"
                  style={{ width: `${(qtd / maximo) * 100}%` }}
                />
              </span>
              <span className="w-8 text-right text-sm tabular-nums text-gray-600">{qtd}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Cartao({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-xl bg-superficie p-5 shadow-sm">
      <h3 className="font-bold text-gray-900">{titulo}</h3>
      <p className="mb-3 text-xs text-gray-500">{sub}</p>
      {children}
    </section>
  );
}
