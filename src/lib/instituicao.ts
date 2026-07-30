import "server-only";

/**
 * Nome da instituição exibido nas telas, no título da aba, no aplicativo
 * instalado e no cabeçalho do relatório impresso.
 *
 * Vive no .env porque quem reaproveita o projeto não deveria precisar caçar
 * o nome em cinco arquivos de código — e esquecer de um significa o portal
 * de outra prefeitura anunciando esta aqui, provavelmente no manifesto do
 * app ou no rodapé do relatório, que são os menos óbvios.
 *
 * `server-only`: o Header é componente de cliente e recebe o nome por
 * propriedade, vinda do layout. Sem esta marca, alguém importaria aqui e o
 * valor viraria "undefined" no navegador, caindo silenciosamente no padrão.
 */
const PADRAO = "Prefeitura Municipal";

export function nomeInstituicao(): string {
  return process.env.PORTAL_INSTITUICAO?.trim() || PADRAO;
}
