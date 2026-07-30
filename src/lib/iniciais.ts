/**
 * Aparência do avatar quando a pessoa não tem foto: iniciais num círculo
 * colorido. Funções puras — vivem fora de lib/avatares.ts porque este módulo
 * também roda no navegador (o cabeçalho é um componente de cliente), e
 * avatares.ts mexe em arquivos, o que só existe no servidor.
 */

/** Paleta com contraste suficiente para texto branco, em tema claro e escuro. */
const CORES = [
  "#1d4ed8",
  "#0f766e",
  "#b45309",
  "#9333ea",
  "#be123c",
  "#15803d",
  "#0369a1",
  "#7c2d12",
];

/** Sempre a mesma cor para a mesma pessoa. */
export function corDoNome(nome: string): string {
  let soma = 0;
  for (let i = 0; i < nome.length; i++) soma = (soma + nome.charCodeAt(i) * (i + 1)) % 9973;
  return CORES[soma % CORES.length];
}

export function iniciaisDe(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 1 && !/^(de|da|do|dos|das|e)$/i.test(p));
  if (partes.length === 0) return nome.trim().slice(0, 2).toUpperCase() || "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
