/**
 * Fonte única dos textos voltados ao usuário — linguagem simples, sem jargão
 * ITIL (roadmap Fase A). Regra: as telas do usuário leigo falam como uma
 * pessoa falaria; frases curtas; a cor da tag segue um código único em todo o
 * portal (azul = andamento, âmbar = sua vez, verde = resolvido, cinza = encerrado).
 */

export interface StatusVisual {
  /** rótulo curto do chip */
  label: string;
  /** classes do chip de status */
  tag: string;
  /** frase curta do que está acontecendo agora, para cards e rastreador */
  frase: string;
}

export const STATUS_CHAMADO: Record<number, StatusVisual> = {
  1: { label: "Recebido", tag: "bg-blue-100 text-blue-800", frase: "Na fila da equipe de TI" },
  2: { label: "Em atendimento", tag: "bg-sky-100 text-sky-800", frase: "Um técnico está cuidando do seu chamado" },
  3: { label: "Em atendimento", tag: "bg-sky-100 text-sky-800", frase: "Atendimento agendado pela equipe" },
  4: { label: "Aguardando você", tag: "bg-amber-100 text-amber-900", frase: "A equipe precisa de uma resposta sua" },
  5: { label: "Resolvido — confirme", tag: "bg-green-100 text-green-800", frase: "Solução enviada — funcionou?" },
  6: { label: "Encerrado", tag: "bg-gray-200 text-gray-700", frase: "Chamado encerrado" },
  10: { label: "Em análise", tag: "bg-cyan-100 text-cyan-800", frase: "Aguardando uma aprovação interna" },
};

/**
 * Urgência escolhida pelo usuário na abertura, traduzida em cor e palavra.
 *
 * Três níveis — vermelho, âmbar, azul — porque na prática o técnico decide
 * entre "agora", "hoje" e "quando der". A cor é reforço, nunca a única pista:
 * quem tem dificuldade de enxergar cor — ou imprime a lista em preto e branco
 * — lê a palavra do lado.
 */
export interface UrgenciaVisual {
  rotulo: string;
  /** borda esquerda do cartão */
  borda: string;
  /** etiqueta ao lado da situação */
  chip: string;
}

export function urgenciaChamado(urgencia?: number): UrgenciaVisual {
  if (urgencia !== undefined && urgencia >= 4) {
    return {
      rotulo: "Urgente",
      borda: "border-l-red-500",
      chip: "bg-red-100 text-red-800",
    };
  }
  if (urgencia === 3) {
    return {
      rotulo: "Médio",
      borda: "border-l-amber-500",
      chip: "bg-amber-100 text-amber-900",
    };
  }
  return {
    rotulo: "Posso esperar",
    borda: "border-l-blue-500",
    chip: "bg-blue-100 text-blue-800",
  };
}

/**
 * Notas de satisfação, de 1 a 5.
 *
 * Uma lista só, usada na hora de avaliar E no relatório — se as duas telas
 * divergirem, o técnico lê "Bom" num gráfico que o usuário respondeu como
 * outra coisa. O rosto ajuda a escolher rápido; a palavra é que diz o que
 * significa, e sem ela o gráfico do relatório vira adivinhação.
 */
export const NOTAS_CSAT = [
  { nota: 1, rosto: "😠", nome: "Péssimo" },
  { nota: 2, rosto: "🙁", nome: "Ruim" },
  { nota: 3, rosto: "😐", nome: "Regular" },
  { nota: 4, rosto: "🙂", nome: "Bom" },
  // 😀 no lugar do coração: "amei" não é resposta de chamado de TI, e a
  // escala fica coerente — cinco rostos que só variam de bravo a contente
  { nota: 5, rosto: "😀", nome: "Excelente" },
] as const;

export function statusChamado(status: number): StatusVisual {
  return (
    STATUS_CHAMADO[status] ?? {
      label: "Em andamento",
      tag: "bg-gray-100 text-gray-700",
      frase: "Em andamento com a equipe de TI",
    }
  );
}
