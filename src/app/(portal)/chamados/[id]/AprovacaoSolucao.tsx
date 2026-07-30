"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/Toast";

const EMOJIS = ["😡", "🙁", "😐", "🙂", "😍"] as const;

/**
 * Botões de aprovação da solução (fluxo nativo do GLPI) + CSAT de 1 clique
 * (roadmap Fase A): aprovar → chamado fecha e o usuário avalia com um emoji;
 * recusar → volta para atendimento.
 */
export default function AprovacaoSolucao({ ticketId }: { ticketId: number }) {
  const router = useRouter();
  const [modo, setModo] = useState<"inicial" | "recusando" | "avaliar">("inicial");
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"aprovar" | "recusar" | null>(null);
  const [notaDada, setNotaDada] = useState<number | null>(null);

  async function enviar(acao: "aprovar" | "recusar") {
    setErro(null);
    setEnviando(acao);
    try {
      const res = await fetch(`/api/chamados/${ticketId}/solucao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, comentario }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { aviso?: string } | null;
        if (data?.aviso) {
          setAviso(data.aviso);
          return;
        }
        if (acao === "aprovar") {
          // chamado encerrado — antes de re-renderizar, 1 clique de avaliação
          setModo("avaliar");
          return;
        }
        toast("Chamado reaberto — a equipe de TI foi avisada.");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setErro(data?.error ?? "Não foi possível registrar sua resposta. Tente novamente.");
    } catch {
      setErro("Falha de conexão. Verifique a rede e tente novamente.");
    } finally {
      setEnviando(null);
    }
  }

  async function avaliar(nota: number) {
    setNotaDada(nota);
    toast("Obrigado pela avaliação! 💙");
    // dispara e segue — a avaliação é cortesia, não pode travar o fluxo
    fetch(`/api/chamados/${ticketId}/avaliacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nota }),
    }).catch(() => undefined);
    setTimeout(() => router.refresh(), 900);
  }

  if (aviso) {
    return (
      <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4">
        <p className="font-semibold text-green-800">{aviso}</p>
      </div>
    );
  }

  if (modo === "avaliar") {
    return (
      <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-center">
        <p className="font-semibold text-green-800">✅ Chamado encerrado — que bom que resolveu!</p>
        <p className="mt-1 text-sm text-sucesso">Como foi o atendimento? (1 toque)</p>
        <div className="mt-3 flex justify-center gap-2">
          {EMOJIS.map((emoji, i) => {
            const nota = i + 1;
            const sel = notaDada === nota;
            return (
              <button
                key={nota}
                type="button"
                disabled={notaDada !== null}
                onClick={() => avaliar(nota)}
                aria-label={`Nota ${nota} de 5`}
                className={`grid size-12 place-items-center rounded-xl text-2xl transition hover:scale-110 hover:bg-amber-100 disabled:hover:scale-100 ${
                  sel ? "scale-110 bg-amber-100" : notaDada !== null ? "opacity-40" : ""
                }`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
        {notaDada === null && (
          <button
            type="button"
            onClick={() => router.refresh()}
            className="mt-2 min-h-9 rounded px-3 py-1 text-sm text-sucesso underline hover:text-green-900"
          >
            Agora não
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4">
      <p className="font-semibold text-green-800">A equipe de TI marcou este chamado como resolvido.</p>
      <p className="mt-1 text-sm text-sucesso">O problema foi resolvido para você?</p>

      {modo === "inicial" ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={enviando !== null}
            onClick={() => enviar("aprovar")}
            className="min-h-11 rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            {enviando === "aprovar" ? "Enviando..." : "👍 Funcionou, pode encerrar"}
          </button>
          <button
            type="button"
            disabled={enviando !== null}
            onClick={() => setModo("recusando")}
            className="min-h-11 rounded-lg border border-gray-300 bg-superficie px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            👎 Ainda não funcionou
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <label htmlFor="motivo" className="mb-1 block text-sm font-medium text-gray-700">
            Conte o que ainda não está funcionando (opcional, mas ajuda a equipe):
          </label>
          <textarea
            id="motivo"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="Ex.: A impressora voltou a travar hoje de manhã."
            className="w-full rounded-lg border border-gray-300 bg-superficie px-3 py-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={enviando !== null}
              onClick={() => enviar("recusar")}
              className="min-h-11 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {enviando === "recusar" ? "Enviando..." : "Reabrir o chamado"}
            </button>
            <button
              type="button"
              disabled={enviando !== null}
              onClick={() => {
                setModo("inicial");
                setErro(null);
              }}
              className="min-h-11 rounded-lg border border-gray-300 bg-superficie px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-perigo">
          {erro}
        </p>
      )}
    </div>
  );
}
