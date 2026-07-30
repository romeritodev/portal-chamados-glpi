"use client";

import { useEffect, useState } from "react";

/**
 * Toast global minimalista (roadmap Fase A): confirma toda ação sem modal.
 * Uso em qualquer client component: `toast("Comentário enviado!")`.
 * O <Toaster/> vive no layout do grupo (portal) — um por página.
 */

export type ToastTipo = "ok" | "erro";

export function toast(mensagem: string, tipo: ToastTipo = "ok") {
  window.dispatchEvent(new CustomEvent("portal-toast", { detail: { mensagem, tipo } }));
}

interface Item {
  id: number;
  mensagem: string;
  tipo: ToastTipo;
}

let proximoId = 1;

export default function Toaster() {
  const [itens, setItens] = useState<Item[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const { mensagem, tipo } = (e as CustomEvent<{ mensagem: string; tipo: ToastTipo }>).detail;
      const id = proximoId++;
      setItens((atuais) => [...atuais, { id, mensagem, tipo }]);
      // erro fica mais tempo na tela
      setTimeout(
        () => setItens((atuais) => atuais.filter((i) => i.id !== id)),
        tipo === "erro" ? 6000 : 4000,
      );
    }
    window.addEventListener("portal-toast", onToast);
    return () => window.removeEventListener("portal-toast", onToast);
  }, []);

  // a live region fica SEMPRE montada (mesmo vazia) — leitores de tela só
  // anunciam inserções dentro de uma região já existente no DOM
  return (
    <div
      aria-live="polite"
      // no celular sobe acima da barra inferior, para não cobri-la
      className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-5"
    >
      {itens.map((i) => (
        <div
          key={i.id}
          role={i.tipo === "erro" ? "alert" : "status"}
          className={`animate-toast rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
            i.tipo === "erro" ? "bg-red-600" : "bg-contraste"
          }`}
        >
          {i.tipo === "ok" ? "✓ " : ""}
          {i.mensagem}
        </div>
      ))}
    </div>
  );
}
