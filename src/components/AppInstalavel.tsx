"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Registra o service worker e convida a instalar o portal como aplicativo
 * (roadmap Fase C).
 *
 * O convite é discreto e educado: só aparece na tela inicial, alguns segundos
 * depois de a página abrir, some quando dispensado e não volta por 30 dias.
 * No iPhone não existe instalação automática — ali mostramos o passo a passo.
 */

const CHAVE_DISPENSA = "portal_convite_app_dispensado_em";
const DIAS_SILENCIO = 30;
const ATRASO_MS = 4000;

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function dispensadoRecentemente(): boolean {
  const salvo = window.localStorage.getItem(CHAVE_DISPENSA);
  if (!salvo) return false;
  const dias = (Date.now() - Number(salvo)) / 86_400_000;
  return Number.isFinite(dias) && dias < DIAS_SILENCIO;
}

function jaInstalado(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS usa uma propriedade própria
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function ehIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export default function AppInstalavel() {
  const naHome = usePathname() === "/";
  const [evento, setEvento] = useState<EventoInstalacao | null>(null);
  const [mostrarIOS, setMostrarIOS] = useState(false);

  // registra o service worker (uma vez, em qualquer página)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* sem service worker o portal funciona normalmente */
      });
    };
    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
  }, []);

  // convite de instalação
  useEffect(() => {
    if (!naHome || jaInstalado() || dispensadoRecentemente()) return;

    const aoPoderInstalar = (e: Event) => {
      e.preventDefault(); // guardamos para disparar no nosso botão
      setTimeout(() => setEvento(e as EventoInstalacao), ATRASO_MS);
    };
    window.addEventListener("beforeinstallprompt", aoPoderInstalar);

    // iPhone não dispara o evento acima — oferecemos as instruções
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (ehIOS()) timer = setTimeout(() => setMostrarIOS(true), ATRASO_MS);

    return () => {
      window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
      if (timer) clearTimeout(timer);
    };
  }, [naHome]);

  function dispensar() {
    window.localStorage.setItem(CHAVE_DISPENSA, String(Date.now()));
    setEvento(null);
    setMostrarIOS(false);
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice.catch(() => undefined);
    setEvento(null);
  }

  if (!evento && !mostrarIOS) return null;

  return (
    // o contêiner não recebe toques: só o cartão. Assim a área vazia ao lado
    // dele nunca rouba o clique dos botões da barra inferior.
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 px-4 sm:bottom-5 print:hidden">
      <div className="animate-toast pointer-events-auto mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-gray-200 bg-superficie p-4 shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icone-192.png" alt="" aria-hidden className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Deixe o Suporte de TI na tela inicial</p>
          {mostrarIOS ? (
            <p className="mt-0.5 text-sm text-gray-600">
              Toque em <strong>Compartilhar</strong> <span aria-hidden>⬆️</span> na barra do Safari e
              depois em <strong>Adicionar à Tela de Início</strong>.
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-gray-600">
              Fica com ícone igual a um aplicativo — sem precisar lembrar o endereço.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {evento && (
              <button
                type="button"
                onClick={instalar}
                className="min-h-11 rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700"
              >
                Instalar
              </button>
            )}
            <button
              type="button"
              onClick={dispensar}
              className="min-h-11 rounded-lg px-3 py-2 font-medium text-gray-600 hover:bg-gray-100"
            >
              {mostrarIOS ? "Entendi" : "Agora não"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
