import type { SlaVisual } from "./filas";

/**
 * Definições do painel kanban compartilhadas entre servidor e cliente.
 *
 * IMPORTANTE: este módulo NÃO pode ser "use client". Um componente de
 * servidor que importe um valor de um arquivo "use client" recebe apenas uma
 * referência (proxy) — ler COLUNAS lá quebraria em tempo de execução.
 */

export interface CartaoChamado {
  id: number;
  nome: string;
  status: number;
  setor?: string;
  requerente?: string;
  responsavel?: string;
  /** urgência escolhida pelo usuário (escala do GLPI) */
  urgencia?: number;
  /** categoria ITIL (folha), quando o chamado tem uma */
  categoria?: string;
  /** atribuído ao técnico logado */
  meu: boolean;
  semDono: boolean;
  /** prazo já calculado no servidor (evita divergência de hidratação) */
  sla?: SlaVisual;
}

export interface ColunaPainel {
  key: string;
  titulo: string;
  /** status do GLPI que caem nesta coluna */
  status: number[];
  /** status aplicado ao soltar um card aqui */
  destino: number;
  dica: string;
}

export const COLUNAS: ColunaPainel[] = [
  { key: "novos", titulo: "Novos", status: [1], destino: 1, dica: "Ainda sem técnico" },
  { key: "atendendo", titulo: "Em atendimento", status: [2, 3], destino: 2, dica: "Alguém trabalhando" },
  { key: "aguardando", titulo: "Aguardando", status: [4, 10], destino: 4, dica: "Parado esperando algo" },
  { key: "resolvidos", titulo: "Resolvidos", status: [5], destino: 5, dica: "Esperando o usuário confirmar" },
];

/** Todos os status exibidos no painel (fechados ficam de fora). */
export const STATUS_NO_PAINEL = new Set(COLUNAS.flatMap((c) => c.status));
