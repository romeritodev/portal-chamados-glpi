"use client";

import { useEffect } from "react";

/**
 * Toque curto ao acionar botões no celular (Vibration API).
 *
 * Um único ouvinte no documento, em vez de mexer em cada botão: o dia em que
 * alguém criar um botão novo, ele já vem com o toque.
 *
 * ONDE FUNCIONA: Android. O WebKit não implementa a Vibration API, então
 * iPhone e iPad não vibram — não há como forçar, e preferimos não fingir. O
 * guard abaixo simplesmente não faz nada lá, sem erro e sem aviso.
 *
 * QUANDO NÃO VIBRA, de propósito:
 *  - em quem apontou com mouse/caneta (só toque de dedo vibra);
 *  - em telas sem toque;
 *  - em quem pediu menos movimento no sistema (prefers-reduced-motion) —
 *    não existe media query de "menos vibração", e quem desliga animação
 *    por desconforto raramente quer o aparelho tremendo na mão;
 *  - em botão desabilitado, que não vai fazer nada mesmo. Vibrar ali seria
 *    dizer "aceitei" para um toque que foi ignorado.
 */

/** curto de propósito: é um "tique" de confirmação, não um alerta */
const DURACAO_MS = 8;

const ACIONAVEIS = "button, a[href], [role='button'], label, summary, input[type='submit']";

export default function Vibracao() {
  useEffect(() => {
    if (typeof navigator.vibrate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    function aoTocar(e: PointerEvent) {
      if (e.pointerType !== "touch") return;
      const alvo = (e.target as Element | null)?.closest?.(ACIONAVEIS);
      if (!alvo || alvo.matches("[disabled], [aria-disabled='true']")) return;
      try {
        // no pointerdown, não no click: o retorno tem que vir junto com o
        // dedo encostando, senão parece atraso do aparelho
        navigator.vibrate(DURACAO_MS);
      } catch {
        /* aparelho recusou — segue sem vibração */
      }
    }

    document.addEventListener("pointerdown", aoTocar, { passive: true });
    return () => document.removeEventListener("pointerdown", aoTocar);
  }, []);

  return null;
}
