"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { statusChamado } from "@/lib/copy";

/**
 * Sino de notificações (roadmap Fase B): mostra quantos chamados mudaram
 * desde a última vez que o usuário olhou. Sem websocket — consulta a cada
 * 60 s e SÓ com a aba visível, para não pesar no CT de 1 vCPU.
 *
 * A comparação usa o relógio do servidor (campo `agora` da resposta), então
 * fuso/relógio errado no celular do usuário não bagunça a contagem.
 */

const CHAVE = "portal_notificacoes_visto_em";
const INTERVALO_MS = 60_000;

interface Item {
  id: number;
  nome: string;
  status: number;
  em: number;
}

function haQuantoTempo(em: number, agora: number): string {
  const min = Math.floor((agora - em) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export default function SinoNotificacoes() {
  const [itens, setItens] = useState<Item[]>([]);
  const [agora, setAgora] = useState(0);
  const [vistoEm, setVistoEm] = useState<number | null>(null);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const buscar = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/notificacoes", { cache: "no-store" });
      if (!res.ok) return; // 401 é tratado na navegação normal
      const data = (await res.json()) as { itens?: Item[]; agora?: number };
      if (!Array.isArray(data.itens) || typeof data.agora !== "number") return;
      setItens(data.itens);
      setAgora(data.agora);
      // primeira visita: marca tudo como visto (evita badge cheio de cara)
      if (window.localStorage.getItem(CHAVE) === null) {
        window.localStorage.setItem(CHAVE, String(data.agora));
        setVistoEm(data.agora);
      }
    } catch {
      /* rede caiu — tenta de novo no próximo ciclo */
    }
  }, []);

  // lê o marcador só no cliente (evita divergência de hidratação)
  useEffect(() => {
    const salvo = window.localStorage.getItem(CHAVE);
    if (salvo !== null) setVistoEm(Number(salvo));
  }, []);

  useEffect(() => {
    void buscar();
    const timer = setInterval(() => void buscar(), INTERVALO_MS);
    const aoVoltar = () => void buscar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [buscar]);

  // fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const novos = vistoEm === null ? [] : itens.filter((i) => i.em > vistoEm);
  const precisamDeVoce = itens.filter((i) => i.status === 5 || i.status === 4);

  function abrir() {
    const novoEstado = !aberto;
    setAberto(novoEstado);
    if (novoEstado && agora > 0) {
      // ao abrir, tudo que está na lista passa a ser "visto"
      window.localStorage.setItem(CHAVE, String(agora));
      setVistoEm(agora);
    }
  }

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={abrir}
        aria-label={
          novos.length > 0 ? `Avisos: ${novos.length} novidade(s)` : "Avisos"
        }
        aria-expanded={aberto}
        className="relative inline-flex size-11 items-center justify-center rounded-lg text-lg text-brand-100 hover:bg-brand-700/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        🔔
        {novos.length > 0 && (
          <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-amber-950">
            {novos.length > 9 ? "9+" : novos.length}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-superficie text-gray-900 shadow-xl">
          <p className="border-b border-gray-200 px-4 py-2.5 text-sm font-semibold">
            Avisos dos seus chamados
          </p>

          {itens.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">
              Nenhum chamado em andamento. Tudo em dia! 🎉
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
              {itens.map((i) => {
                const s = statusChamado(i.status);
                const destaque = i.status === 5 || i.status === 4;
                return (
                  <li key={i.id}>
                    <Link
                      href={`/chamados/${i.id}`}
                      onClick={() => setAberto(false)}
                      className={`flex flex-col gap-0.5 px-4 py-3 hover:bg-gray-50 ${destaque ? "bg-amber-50/60" : ""}`}
                    >
                      <span className="flex items-center justify-between gap-2 text-xs text-gray-500">
                        <span className="font-mono">#{i.id}</span>
                        <span>{haQuantoTempo(i.em, agora)}</span>
                      </span>
                      <span className="truncate text-sm font-medium">{i.nome}</span>
                      <span
                        className={`text-xs font-medium ${destaque ? "text-amber-800" : "text-gray-600"}`}
                      >
                        {destaque ? "👉 " : ""}
                        {s.frase}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {precisamDeVoce.length > 0 && (
            <p className="border-t border-gray-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900">
              {precisamDeVoce.length === 1
                ? "1 chamado espera uma ação sua."
                : `${precisamDeVoce.length} chamados esperam uma ação sua.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
