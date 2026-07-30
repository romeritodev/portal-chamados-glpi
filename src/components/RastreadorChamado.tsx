import type { GlpiTicket } from "@/lib/glpi";

/**
 * Rastreador de etapas estilo "encomenda dos Correios" (roadmap Fase A).
 * Traduz os status do GLPI em 4 etapas que o usuário leigo já sabe ler.
 * CSS puro: as linhas conectoras são bordas; a etapa atual pulsa (animação
 * definida em globals.css, desligada em prefers-reduced-motion).
 */

interface Etapa {
  titulo: string;
  detalhe?: string;
  estado: "feita" | "atual" | "futura";
  /** etapa que exige ação do usuário (âmbar) */
  acao?: boolean;
}

function dataCurta(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function RastreadorChamado({ ticket }: { ticket: GlpiTicket }) {
  const s = ticket.status;
  const tecnico = ticket.assignees.find((a) => a.name)?.name;
  const abertura = dataCurta(ticket.date);
  const solucao = dataCurta(ticket.solveDate);

  // posição atual na régua de 4 etapas
  const pos = s === 1 ? 1 : s === 5 ? 3 : s === 6 ? 4 : 2; // 2/3/4/10 → etapa 2

  const etapas: Etapa[] = [
    {
      titulo: "Recebido",
      detalhe: abertura,
      estado: pos > 1 ? "feita" : "atual",
    },
    {
      titulo:
        s === 4
          ? "Aguardando você"
          : tecnico
            ? `${tecnico.split(" ")[0]} cuidando`
            : "Em atendimento",
      detalhe: s === 4 ? "responda abaixo" : pos > 2 ? undefined : pos === 2 ? "agora" : undefined,
      estado: pos > 2 ? "feita" : pos === 2 ? "atual" : "futura",
      acao: s === 4,
    },
    {
      titulo: "Resolvido",
      detalhe: pos === 3 ? "confirme abaixo" : solucao,
      estado: pos > 3 ? "feita" : pos === 3 ? "atual" : "futura",
      acao: pos === 3,
    },
    {
      titulo: "Encerrado",
      detalhe: pos === 4 ? dataCurta(ticket.date_mod) : undefined,
      estado: pos === 4 ? "feita" : "futura",
    },
  ];

  return (
    <ol className="mb-1 mt-4 flex" aria-label="Andamento do chamado">
      {etapas.map((e, i) => {
        const feita = e.estado === "feita";
        const atual = e.estado === "atual";
        const cor = e.acao
          ? "bg-amber-500"
          : feita
            ? "bg-green-600"
            : atual
              ? "bg-brand-600"
              : "bg-gray-300";
        return (
          <li key={i} className="relative flex-1 pt-8 text-center">
            {/* linhas conectoras em dois meios-segmentos: a metade que CHEGA
                na etapa atual fica verde; a que SAI dela só quando concluída */}
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute left-0 right-1/2 top-[13px] h-[3px] ${
                  feita || atual ? "bg-green-600" : "bg-gray-300"
                }`}
              />
            )}
            {i < etapas.length - 1 && (
              <span
                aria-hidden
                className={`absolute left-1/2 right-0 top-[13px] h-[3px] ${
                  feita ? "bg-green-600" : "bg-gray-300"
                }`}
              />
            )}
            <span
              aria-hidden
              className={`absolute left-1/2 top-[3px] z-10 grid size-[22px] -translate-x-1/2 place-items-center rounded-full text-[11px] font-bold text-white ${cor} ${
                atual ? "animate-pulso" : ""
              }`}
            >
              {feita ? "✓" : atual ? "●" : ""}
            </span>
            <p
              className={`text-xs font-semibold leading-tight sm:text-[13px] ${
                e.acao ? "text-alerta" : atual ? "text-marca" : feita ? "text-gray-800" : "text-gray-400"
              }`}
            >
              {e.titulo}
            </p>
            {e.detalhe && <p className="text-[11px] text-gray-500">{e.detalhe}</p>}
          </li>
        );
      })}
    </ol>
  );
}
