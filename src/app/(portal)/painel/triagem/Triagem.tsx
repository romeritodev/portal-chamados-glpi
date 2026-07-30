"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";

/**
 * Triagem de um chamado por vez (roadmap Fase B).
 *
 * Cada decisão é uma tecla e o próximo chamado entra sozinho. A fila é local:
 * o chamado sai da tela na hora e o pedido segue para o GLPI em segundo plano
 * — se falhar, ele volta para a fila com um aviso.
 */

export interface ChamadoTriagem {
  id: number;
  nome: string;
  descricao: string;
  setor?: string;
  requerente?: string;
  abertoEm?: string;
  semDono: boolean;
}

function quando(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Triagem({ inicial }: { inicial: ChamadoTriagem[] }) {
  const router = useRouter();
  const [fila, setFila] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [feitos, setFeitos] = useState(0);

  const atual = fila[0];

  async function decidir(acao: "assumir" | "pendente" | "pular") {
    if (!atual || ocupado) return;

    // pular é local: só manda para o fim da fila
    if (acao === "pular") {
      setFila((f) => [...f.slice(1), f[0]]);
      return;
    }

    const alvo = atual;
    setOcupado(true);
    setFila((f) => f.slice(1)); // sai da tela na hora
    try {
      const corpo =
        acao === "assumir"
          ? [{ acao: "assumir" }, { acao: "status", status: 2 }]
          : [{ acao: "status", status: 4 }];

      for (const passo of corpo) {
        const res = await fetch(`/api/chamados/${alvo.id}/painel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(passo),
        });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) {
          const d = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(d?.error ?? "falha");
        }
      }
      setFeitos((n) => n + 1);
      router.refresh();
    } catch (err) {
      setFila((f) => [alvo, ...f]); // devolve para a fila
      toast(err instanceof Error ? err.message : "Não foi possível concluir.", "erro");
    } finally {
      setOcupado(false);
    }
  }

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "1") {
        e.preventDefault();
        void decidir("assumir");
      } else if (e.key === "2") {
        e.preventDefault();
        void decidir("pendente");
      } else if (e.key === "3") {
        e.preventDefault();
        void decidir("pular");
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  });

  if (!atual) {
    return (
      <div className="mt-6 rounded-2xl bg-superficie p-8 text-center shadow">
        <p aria-hidden className="text-5xl">
          🎉
        </p>
        <h3 className="mt-3 text-lg font-bold">Triagem zerada!</h3>
        <p className="mt-1 text-gray-600">
          {feitos > 0
            ? `${feitos} ${feitos === 1 ? "chamado triado" : "chamados triados"} agora.`
            : "Nenhum chamado novo esperando."}
        </p>
        <Link
          href="/painel"
          className="mt-5 inline-block min-h-11 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
        >
          Voltar para o painel
        </Link>
      </div>
    );
  }

  const tecla = "rounded border border-gray-300 border-b-2 bg-gray-100 px-1.5 font-mono text-xs text-gray-700";

  return (
    <div className="mt-4">
      <p className="text-sm text-gray-500">
        {fila.length} na fila{feitos > 0 ? ` · ${feitos} triado(s) agora` : ""}
      </p>

      <article className={`mt-2 rounded-2xl bg-superficie p-5 shadow ${ocupado ? "opacity-60" : ""}`}>
        <p className="text-sm text-gray-500">
          <span className="font-mono">#{atual.id}</span>
          {atual.abertoEm && <> · aberto em {quando(atual.abertoEm)}</>}
          {atual.setor && <> · {atual.setor}</>}
        </p>
        <h3 className="mt-1 text-lg font-bold leading-snug">{atual.nome}</h3>
        {atual.requerente && (
          <p className="mt-0.5 text-sm text-gray-600">por {atual.requerente}</p>
        )}
        {atual.descricao && (
          <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-line rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
            {atual.descricao}
          </p>
        )}
        <Link
          href={`/chamados/${atual.id}`}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-marca hover:underline"
        >
          Abrir o chamado completo →
        </Link>
      </article>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => decidir("assumir")}
          className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          <span>🙋 Assumir e atender</span>
          <span className="text-xs font-normal opacity-80">tecla 1</span>
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => decidir("pendente")}
          className="flex min-h-14 flex-col items-center justify-center rounded-xl border border-gray-300 bg-superficie px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <span>⏸️ Deixar pendente</span>
          <span className="text-xs font-normal text-gray-500">tecla 2</span>
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => decidir("pular")}
          className="flex min-h-14 flex-col items-center justify-center rounded-xl border border-gray-300 bg-superficie px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <span>⏭️ Ver depois</span>
          <span className="text-xs font-normal text-gray-500">tecla 3</span>
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-gray-500">
        Atalhos: <kbd className={tecla}>1</kbd> assumir · <kbd className={tecla}>2</kbd> pendente ·{" "}
        <kbd className={tecla}>3</kbd> ver depois
      </p>
    </div>
  );
}
