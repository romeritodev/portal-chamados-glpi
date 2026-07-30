import type { GlpiTicket } from "./glpi";

/**
 * Helpers compartilhados entre a lista de chamados, a home e as notificações.
 * Só tipos são importados de glpi.ts — este módulo roda no cliente também.
 */

/** O chamado está atribuído a este usuário? (id do team; nome como reserva) */
export function ehAtribuidoA(t: GlpiTicket, userId?: number, nome?: string): boolean {
  return t.assignees.some(
    (a) => (userId !== undefined && a.userId === userId) || (!!nome && !!a.name && a.name === nome),
  );
}

/**
 * Quem abriu o chamado? Só essa pessoa aceita ou recusa a solução e avalia o
 * atendimento — nem o técnico que resolveu pode responder por ela.
 *
 * Chamados antigos podem não ter o ator "requerente" registrado. Nesse caso,
 * um perfil self-service só enxerga os próprios chamados no GLPI, então ele é
 * o requerente; um perfil central enxerga todos, e aí não dá para supor.
 */
export function ehRequerente(t: GlpiTicket, userId?: number, central = false): boolean {
  if (t.requesterId !== undefined) return userId !== undefined && t.requesterId === userId;
  return !central;
}

/** Converte data do GLPI ("2026-07-22 15:30:00") em epoch ms; 0 se inválida. */
export function epochDe(data?: string): number {
  if (!data) return 0;
  const d = new Date(data.includes("T") ? data : data.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export interface SlaVisual {
  /** classe da borda esquerda do card */
  borda: string;
  /** classe da etiqueta de prazo */
  pill: string;
  texto: string;
}

/**
 * Semáforo de prazo (SLA). Só acende quando o GLPI tem prazo definido para o
 * chamado — sem níveis de serviço configurados, `time_to_resolve` vem vazio e
 * a função devolve null (nada aparece na tela).
 *
 * SEMPRE calcular no servidor e passar pronto para componentes de cliente:
 * recalcular no navegador com outro relógio causaria divergência de hidratação.
 */
export function slaVisual(prazoIso?: string, aberto = true): SlaVisual | null {
  if (!aberto || !prazoIso) return null;
  const prazo = epochDe(prazoIso);
  if (!prazo) return null;

  const horas = (prazo - Date.now()) / 3_600_000;
  const quando = new Date(prazo).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (horas < 0) {
    const h = Math.abs(horas);
    return {
      borda: "border-l-red-500",
      pill: "bg-red-100 text-red-800",
      texto: h < 24 ? `venceu há ${Math.max(1, Math.round(h))}h` : `venceu há ${Math.round(h / 24)}d`,
    };
  }
  if (horas <= 24) {
    return {
      borda: "border-l-amber-500",
      pill: "bg-amber-100 text-amber-900",
      texto: horas <= 8 ? `vence em ${Math.max(1, Math.round(horas))}h` : `vence ${quando}`,
    };
  }
  return {
    borda: "border-l-green-500",
    pill: "bg-green-100 text-green-800",
    texto: horas < 48 ? "vence amanhã" : `vence em ${Math.round(horas / 24)}d`,
  };
}
