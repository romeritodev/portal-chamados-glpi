"use client";

import { useEffect, useState } from "react";

/**
 * Alterna entre tema claro e escuro (roadmap Fase B).
 *
 * O tema é aplicado marcando `data-tema="escuro"` no <html>, o que troca as
 * variáveis de cor em globals.css. A escolha fica no aparelho.
 *
 * Padrão: CLARO. O modo escuro é uma escolha do usuário, não o comportamento
 * automático — assim ninguém é surpreendido por uma mudança de aparência.
 */

const CHAVE = "portal_tema";

export default function BotaoTema() {
  const [escuro, setEscuro] = useState(false);
  const [pronto, setPronto] = useState(false);

  // lê no cliente (o servidor não sabe a preferência; evita divergência)
  useEffect(() => {
    setEscuro(document.documentElement.dataset.tema === "escuro");
    setPronto(true);
  }, []);

  function alternar() {
    const novo = !escuro;
    setEscuro(novo);
    if (novo) document.documentElement.dataset.tema = "escuro";
    else delete document.documentElement.dataset.tema;
    try {
      window.localStorage.setItem(CHAVE, novo ? "escuro" : "claro");
    } catch {
      /* aparelho sem armazenamento — vale só nesta visita */
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"}
      title={escuro ? "Tema claro" : "Tema escuro"}
      className="inline-flex size-11 items-center justify-center rounded-lg text-lg text-brand-100 hover:bg-brand-700/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      {/* antes de saber o tema, mostra um ícone neutro para não "piscar" */}
      <span aria-hidden>{!pronto ? "◐" : escuro ? "☀️" : "🌙"}</span>
    </button>
  );
}
