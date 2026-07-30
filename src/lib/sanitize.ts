/**
 * O GLPI renderiza HTML no conteúdo do chamado — toda entrada do usuário
 * é escapada antes de ser enviada (spec §6).
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapa o texto e converte quebras de linha em <br> para exibição no GLPI. */
export function textToSafeHtml(text: string): string {
  return `<p>${escapeHtml(text.trim()).replace(/\r?\n/g, "<br>")}</p>`;
}

/**
 * Converte o HTML vindo do GLPI (descrições, acompanhamentos) em texto puro
 * para exibição segura no portal — nunca renderizamos HTML de terceiros.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
