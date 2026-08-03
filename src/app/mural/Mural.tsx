"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Mural de parede. Cada decisão responde a "isto se lê a três metros?".
 *
 * SOBRE AS CORES — validadas com o conferidor de paleta contra este fundo
 * (#0f172a), e não escolhidas no olho:
 *   vermelho #d03b3b (urgente) e âmbar #fab219 (médio) ficam a ΔE 24 em
 *   deuteranopia, bem acima do piso 8; azul #38bdf8 dos gráficos é o terceiro,
 *   também separado dos dois. "Posso esperar" NÃO tem cor: ausência de
 *   urgência não deveria pintar nada, e qualquer quarto tom colidia com o azul
 *   dos gráficos. Cor sozinha nunca carrega o recado — a palavra vai junto.
 *
 * SEM PASSAR O MOUSE: dica flutuante é o padrão em gráfico, mas ninguém toca
 * numa TV de parede. Por isso todo valor está escrito ao lado da barra.
 */

export interface ChamadoNoMural {
  id: number;
  titulo: string;
  setor: string;
  requerente: string;
  status: number;
  urgencia: number;
  abertoEm: string;
  semDono: boolean;
  /** técnico atribuído, quando há */
  responsavel: string;
  meu: boolean;
}

export interface DadosMural {
  abertos: ChamadoNoMural[];
  resolvidosHoje: number;
  abertosHoje: number;
  tempoMedioHoras: number | null;
  porDia: { rotulo: string; dia: number; qtd: number; hoje: boolean }[];
  porCategoria: { nome: string; qtd: number }[];
  porSetor: { nome: string; qtd: number }[];
}

const INTERVALO_MS = 30_000;
const DESTAQUE_MS = 30_000;
/** de quanto em quanto tempo a fila cheia vira a página e o gráfico troca de eixo */
const GIRO_MS = 15_000;
/** sem dono por mais que isto, o tempo de espera fica vermelho no cartão */
const ESPERA_LONGA_MIN = 240;

const VERMELHO = "#d03b3b";
const AMBAR = "#fab219";
const AZUL = "#38bdf8";

function minutosDesde(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
}

function espera(iso: string): string {
  const m = minutosDesde(iso);
  if (m === null) return "";
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} h`;
  return `${Math.floor(m / 1440)} d`;
}

function corDaUrgencia(u: number): { barra: string; texto: string; rotulo: string } | null {
  if (u >= 4) return { barra: VERMELHO, texto: "#f7a3a3", rotulo: "URGENTE" };
  if (u === 3) return { barra: AMBAR, texto: "#fcd884", rotulo: "MÉDIO" };
  return null;
}

export default function Mural({ dados }: { dados: DadosMural }) {
  const router = useRouter();
  const [agora, setAgora] = useState<Date | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [novos, setNovos] = useState<Set<number>>(new Set());
  const vistos = useRef<Set<number> | null>(null);
  /** contador que gira: pagina as filas cheias e alterna o gráfico */
  const [giro, setGiro] = useState(0);
  const [somLigado, setSomLigado] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    const t = setInterval(() => setGiro((g) => g + 1), GIRO_MS);
    return () => clearInterval(t);
  }, []);

  /**
   * Aviso sonoro só para URGENTE que ninguém pegou.
   *
   * O navegador proíbe tocar som sem alguém ter clicado na página antes — e
   * numa TV ligada sozinha isso nunca acontece. Por isso existe o botão de
   * ligar o som: um clique ao montar o mural, e a escolha fica guardada.
   *
   * Toca só nesse caso. Bipe a cada chamado comum vira ruído, e som que
   * incomoda acaba desligado na tomada — aí não avisa mais nada.
   */
  function tocarAviso() {
    if (!somLigado) return;
    try {
      audio.current ??= new AudioContext();
      const ctx = audio.current;
      if (ctx.state === "suspended") void ctx.resume();
      const agoraCtx = ctx.currentTime;
      // dois toques curtos: um bipe só se confunde com notificação de outra coisa
      for (const atraso of [0, 0.35]) {
        const osc = ctx.createOscillator();
        const vol = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        vol.gain.setValueAtTime(0.0001, agoraCtx + atraso);
        vol.gain.exponentialRampToValueAtTime(0.25, agoraCtx + atraso + 0.02);
        vol.gain.exponentialRampToValueAtTime(0.0001, agoraCtx + atraso + 0.22);
        osc.connect(vol).connect(ctx.destination);
        osc.start(agoraCtx + atraso);
        osc.stop(agoraCtx + atraso + 0.25);
      }
    } catch {
      /* sem áudio no aparelho: a borda vermelha continua avisando */
    }
  }

  async function ligarSom() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setSomLigado(true);
      localStorage.setItem("mural_som", "1");
    } catch {
      /* aparelho sem áudio */
    }
  }

  useEffect(() => {
    if (localStorage.getItem("mural_som") === "1") setSomLigado(true);
  }, []);

  // relógio nasce no cliente: a hora do servidor não bate com a do navegador
  useEffect(() => {
    setAgora(new Date());
    setAtualizadoEm(new Date());
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // troca os dados sem recarregar a página: não pisca
  useEffect(() => {
    const t = setInterval(() => router.refresh(), INTERVALO_MS);
    return () => clearInterval(t);
  }, [router]);

  useEffect(() => {
    const ids = new Set(dados.abertos.map((c) => c.id));
    if (vistos.current === null) {
      // primeira carga não pisca: a tela inteira acenderia ao ligar
      vistos.current = ids;
      return;
    }
    const chegaram = [...ids].filter((id) => !vistos.current!.has(id));
    vistos.current = ids;
    setAtualizadoEm(new Date());
    if (chegaram.length === 0) return;

    // só apita se o que chegou for urgente e ainda estiver sem dono
    const urgenteNovo = dados.abertos.some(
      (c) => chegaram.includes(c.id) && c.urgencia >= 4 && c.semDono,
    );
    if (urgenteNovo) tocarAviso();

    setNovos((a) => new Set([...a, ...chegaram]));
    const t = setTimeout(() => {
      setNovos((a) => {
        const r = new Set(a);
        for (const id of chegaram) r.delete(id);
        return r;
      });
    }, DESTAQUE_MS);
    return () => clearTimeout(t);
  }, [dados]);

  const { abertos } = dados;
  const aguardandoAprovacao = abertos.filter((c) => c.status === 5);
  // "em aberto" para o mural = o que ainda depende da equipe. Resolvido
  // esperando o usuário confirmar não é fila de trabalho.
  const emAberto = abertos.filter((c) => c.status !== 5);
  const semDono = emAberto.filter((c) => c.semDono);
  const atendendo = emAberto.filter((c) => !c.semDono && (c.status === 2 || c.status === 3));
  const aguardando = emAberto.filter((c) => !c.semDono && (c.status === 4 || c.status === 10));
  const urgentes = emAberto.filter((c) => c.urgencia >= 4).length;
  const maisAntigo = semDono.reduce<number | null>((pior, c) => {
    const m = minutosDesde(c.abertoEm);
    return m !== null && (pior === null || m > pior) ? m : pior;
  }, null);

  const segundos =
    agora && atualizadoEm ? Math.floor((agora.getTime() - atualizadoEm.getTime()) / 1000) : 0;

  /**
   * Estado de alarme da TELA INTEIRA, e não de um cartão só.
   *
   * É o que faz o mural funcionar de longe: quem está do outro lado da sala
   * percebe a borda mudar pelo canto do olho, sem ler nada. Alarme dentro de
   * um cartão pequeno exige já estar olhando para ele — e aí não serviu.
   *
   * UM ESTADO SÓ, e não uma escala. A versão anterior tinha um nível âmbar
   * para "algo esperando há mais de 4 h", e na prática ele ficava aceso quase
   * sempre — vira moldura, não aviso. Alarme que mora na tela toda precisa ser
   * raro para significar alguma coisa.
   *
   * Pisca só com URGENTE que ninguém pegou: parou o trabalho de alguém e não
   * tem dono. Urgente já atribuído não acende — alguém está cuidando.
   */
  const alarme: "calmo" | "critico" = semDono.some((c) => c.urgencia >= 4)
    ? "critico"
    : "calmo";

  /* ---------------------------------------------------------------- peças */

  function Indicador({
    rotulo,
    valor,
    sufixo,
    cor,
    alerta,
  }: {
    rotulo: string;
    valor: string | number;
    sufixo?: string;
    cor?: string;
    alerta?: boolean;
  }) {
    return (
      <div
        className="flex-1 rounded-2xl border px-5 py-3"
        style={{
          background: alerta ? "rgba(208,59,59,0.14)" : "rgba(255,255,255,0.04)",
          borderColor: alerta ? "rgba(208,59,59,0.55)" : "rgba(255,255,255,0.08)",
        }}
      >
        <p className="text-xl font-medium tracking-wide text-slate-400">{rotulo}</p>
        <p className="mt-0.5 flex items-baseline gap-2">
          <span className="text-7xl font-extrabold leading-none" style={{ color: cor ?? "#fff" }}>
            {valor}
          </span>
          {sufixo && <span className="text-2xl font-semibold text-slate-400">{sufixo}</span>}
        </p>
      </div>
    );
  }

  function Cartao({ c, grande }: { c: ChamadoNoMural; grande?: boolean }) {
    const urg = corDaUrgencia(c.urgencia);
    const novo = novos.has(c.id);
    const min = minutosDesde(c.abertoEm);
    const esperaLonga = c.semDono && min !== null && min >= ESPERA_LONGA_MIN;
    return (
      <li
        className={`flex overflow-hidden rounded-xl ${novo ? "animate-pulse ring-4 ring-white/70" : ""}`}
        style={{ background: "rgba(255,255,255,0.05)" }}
      >
        {/* barra de urgência: só existe quando há urgência */}
        <span
          className="w-2 shrink-0"
          style={{ background: urg?.barra ?? "rgba(255,255,255,0.10)" }}
          aria-hidden
        />
        <div className="min-w-0 flex-1 px-4 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-base text-slate-500">#{c.id}</span>
            {/* espera longa sem dono acende AQUI, no cartão. Antes isso era
                uma borda na tela toda, que ficava acesa quase sempre e virava
                paisagem; no cartão, aponta QUAL chamado está esquecido. */}
            <span
              className="shrink-0 text-xl font-bold"
              style={{
                color: esperaLonga ? "#f7a3a3" : (urg?.texto ?? "#94a3b8"),
              }}
            >
              {esperaLonga && "⏳ "}
              {espera(c.abertoEm)}
            </span>
          </div>
          <p
            className={`truncate font-semibold leading-tight text-white ${grande ? "text-3xl" : "text-xl"}`}
          >
            {c.titulo}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-slate-400">
            {c.requerente && (
              <span className={grande ? "text-xl text-slate-300" : "text-base text-slate-300"}>
                {c.requerente}
              </span>
            )}
            {c.setor && <span className={grande ? "text-lg" : "text-sm"}>{c.setor}</span>}
            {c.responsavel && (
              <span className={`font-semibold text-sky-300 ${grande ? "text-lg" : "text-sm"}`}>
                → {c.responsavel}
              </span>
            )}
            {urg && (
              <span
                className={`font-bold ${grande ? "text-lg" : "text-sm"}`}
                style={{ color: urg.texto }}
              >
                {urg.rotulo}
              </span>
            )}
          </p>
        </div>
      </li>
    );
  }

  /**
   * `min-h-0` em cada nível é o que impede a lista de empurrar o resto para
   * fora da tela: sem ele, um item flex cresce até o conteúdo e ignora a
   * altura do pai. O aviso de "+N" fica FORA da lista rolável, senão seria
   * justamente ele o cortado.
   */
  function Fila({
    titulo,
    itens,
    max,
    grande,
    vazio,
  }: {
    titulo: string;
    itens: ChamadoNoMural[];
    max: number;
    grande?: boolean;
    vazio: string;
  }) {
    /**
     * Fila cheia VIRA A PÁGINA em vez de esconder o excesso. Antes o mural
     * dizia "+3 não cabem na tela" — e esses três nunca eram vistos por
     * ninguém, o que é o mesmo que não existirem. Agora todos passam, em
     * turnos, e o rodapé diz em que página está.
     */
    const paginas = Math.max(1, Math.ceil(itens.length / max));
    const pagina = paginas > 1 ? giro % paginas : 0;
    const visiveis = itens.slice(pagina * max, pagina * max + max);
    return (
      <section className="flex min-h-0 min-w-0 flex-col">
        <h2 className="mb-2 flex shrink-0 items-baseline gap-3 text-xl font-bold uppercase tracking-wide text-slate-400">
          {titulo}
          <span className="text-3xl text-white">{itens.length}</span>
          {paginas > 1 && (
            <span className="text-base font-normal normal-case text-slate-500">
              {pagina + 1}/{paginas}
            </span>
          )}
        </h2>
        {itens.length === 0 ? (
          <p
            className="shrink-0 rounded-xl px-4 py-5 text-center text-xl text-slate-500"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            {vazio}
          </p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-2 overflow-hidden">
            {visiveis.map((c) => (
              <Cartao key={c.id} c={c} grande={grande} />
            ))}
          </ul>
        )}
      </section>
    );
  }

  /* Barras verticais: 7 colunas, rótulo direto em cada uma. Sem eixo Y —
     o número está em cima da barra, que é o que se lê de longe. */
  function GraficoSemana() {
    const maior = Math.max(1, ...dados.porDia.map((d) => d.qtd));
    return (
      <section
        className="flex min-h-0 flex-col overflow-hidden rounded-2xl border px-5 py-3"
        style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}
      >
        <h2 className="text-lg font-bold uppercase tracking-wide text-slate-400">
          Abertos por dia · últimos 7 dias
        </h2>
        <div className="mt-2 flex min-h-0 flex-1 items-end gap-3">
          {dados.porDia.map((d) => (
            <div key={`${d.rotulo}-${d.dia}`} className="flex h-full flex-1 flex-col justify-end">
              <span
                className="mb-1 text-center text-2xl font-bold"
                style={{ color: d.qtd === 0 ? "#475569" : "#fff" }}
              >
                {d.qtd}
              </span>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${Math.max(3, (d.qtd / maior) * 100)}%`,
                  background: d.hoje ? AZUL : "rgba(56,189,248,0.45)",
                }}
              />
              <span
                className={`mt-1 text-center text-base ${d.hoje ? "font-bold text-white" : "text-slate-400"}`}
              >
                {d.rotulo} {d.dia}
              </span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  /* Barras horizontais: nome e número ao lado da barra (rótulo direto),
     sem legenda — série única, a identidade está escrita.

     ALTERNA entre "o quê" (categoria) e "onde" (setor) a cada giro. São duas
     perguntas diferentes, e um terceiro gráfico fixo deixaria os três
     estreitos demais para ler de longe. */
  function GraficoCategorias() {
    const porSetor = giro % 2 === 1 && dados.porSetor.length > 0;
    const lista = porSetor ? dados.porSetor : dados.porCategoria;
    const titulo = porSetor ? "Onde estão os abertos · setor" : "Onde estão os abertos · tipo";
    const maior = Math.max(1, ...lista.map((c) => c.qtd));
    return (
      <section
        className="flex min-h-0 flex-col overflow-hidden rounded-2xl border px-5 py-3"
        style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}
      >
        <h2 className="text-lg font-bold uppercase tracking-wide text-slate-400">{titulo}</h2>
        {lista.length === 0 ? (
          <p className="mt-3 text-xl text-slate-500">Nada aberto</p>
        ) : (
          <ul className="mt-2 flex min-h-0 flex-1 flex-col justify-around gap-1">
            {lista.map((c) => (
              <li key={c.nome} className="flex items-center gap-3">
                <span className="w-1/2 truncate text-lg text-slate-300">{c.nome}</span>
                <span className="flex flex-1 items-center gap-2">
                  <span
                    className="h-5 rounded-r"
                    style={{ width: `${(c.qtd / maior) * 100}%`, background: AZUL, minWidth: 6 }}
                  />
                  <span className="text-xl font-bold text-white">{c.qtd}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  /* ---------------------------------------------------------------- tela */

  return (
    <main
      className={`flex h-dvh flex-col gap-3 overflow-hidden p-4 ${
        alarme === "critico" ? "animate-pulse" : ""
      }`}
      style={{
        background: "#0f172a",
        // a borda é o alarme: só existe quando há urgente sem dono
        boxShadow: alarme === "critico" ? `inset 0 0 0 8px ${VERMELHO}` : "none",
      }}
    >
      {/* cabeçalho comprimido: numa TV, cada linha de enfeite é uma linha a
          menos de chamado. Título, relógio e data cabem numa faixa só. */}
      <header className="flex shrink-0 items-baseline justify-between gap-6">
        <h1 className="text-2xl font-bold text-white">Suporte de TI · chamados</h1>
        <p className="flex items-baseline gap-3">
          <span className="text-base text-slate-400">
            {agora?.toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            }) ?? ""}
          </span>
          <span className="font-mono text-4xl font-bold leading-none text-white">
            {agora?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) ?? "--:--"}
          </span>
          {/* parado, este número denuncia uma tela morta */}
          <span className="w-20 text-sm text-slate-500">há {segundos}s</span>
          {/* único elemento clicável do mural, e some depois de usado: o
              navegador exige um clique antes de deixar tocar qualquer som */}
          {!somLigado && (
            <button
              type="button"
              onClick={ligarSom}
              className="rounded-lg border border-slate-600 px-3 py-1 text-sm text-slate-300 hover:bg-white/10"
            >
              🔔 ativar som
            </button>
          )}
        </p>
      </header>

      {/* CINCO indicadores, não sete. Saíram "Tempo médio", que é número de
          gestão e não faz ninguém levantar da cadeira, e "Abertos hoje", que
          já é a última barra do gráfico ao lado — repetido, ocupava espaço
          de graça. Com menos cartões, os que ficam crescem. */}
      <div className="flex shrink-0 gap-3">
        <Indicador rotulo="Abertos" valor={emAberto.length} />
        <Indicador
          rotulo="Ninguém pegou"
          valor={semDono.length}
          cor={semDono.length > 0 ? AMBAR : undefined}
          alerta={semDono.length > 0 && maisAntigo !== null && maisAntigo >= 240}
        />
        <Indicador
          rotulo="Urgentes"
          valor={urgentes}
          cor={urgentes > 0 ? VERMELHO : undefined}
          alerta={urgentes > 0}
        />
        <Indicador
          rotulo="Resolvidos hoje"
          valor={dados.resolvidosHoje}
          cor={dados.resolvidosHoje > 0 ? "#4ade80" : undefined}
        />
        <Indicador rotulo="Aguardando o OK" valor={aguardandoAprovacao.length} />
      </div>

      {/* Alturas fixas onde faz sentido: os gráficos têm tamanho previsível, e
          o que sobra vai para a fila. Deixar tudo "flexível" foi o que fez a
          lista crescer e empurrar os gráficos para fora da tela. */}
      {/* minmax(0,...) e não 1fr puro: por padrão a faixa do grid não encolhe
          abaixo do conteúdo, então um título longo de chamado alargava a
          coluna e empurrava a tela para fora da lateral. É o mesmo motivo do
          min-w-0 nos filhos — sem ele o `truncate` nunca corta. */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
        {/* a fila ocupa o que precisa e os gráficos ficam com o resto (mínimo
            15rem). Antes era o contrário: a fila reservava a folga toda e, em
            dia calmo, sobrava um buraco no meio da tela. */}
        <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(15rem,1fr)] gap-3">
          <Fila
            titulo="Ninguém pegou"
            itens={semDono}
            max={5}
            grande
            vazio="Nada esperando. Tudo em dia 🎉"
          />
          <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <GraficoSemana />
            <GraficoCategorias />
          </div>
        </div>

        {/* fila vazia encolhe: duas caixas grandes escritas "0" ocupavam meia
            coluna sem dizer nada além do indicador que já está no topo */}
        <div className="grid min-h-0 min-w-0 grid-rows-[auto_auto_1fr] gap-3">
          <Fila titulo="Em atendimento" itens={atendendo} max={4} vazio="Ninguém atendendo" />
          <Fila titulo="Aguardando o usuário" itens={aguardando} max={3} vazio="Nada parado" />
          <div />
        </div>
      </div>
    </main>
  );
}
