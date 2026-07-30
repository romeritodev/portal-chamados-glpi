"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import DitadoVoz from "@/components/DitadoVoz";
import { toast } from "@/components/Toast";

interface Pendente {
  id: number;
  texto: string;
  estado: "enviando" | "ok" | "erro";
}

/**
 * Caixa de resposta do chamado.
 *
 * Para o usuário comum é só isso: escrever e enviar, com a mensagem
 * aparecendo na hora ("optimistic UI") e voltando com aviso se falhar.
 *
 * Para a equipe de TI aparece uma segunda opção — registrar a solução. É a
 * mesma coisa que o GLPI faz no menu do botão "Responder": o texto vai para
 * a conversa E o chamado passa a "resolvido", aguardando o usuário confirmar
 * se funcionou. Sem isso o técnico teria que sair daqui e ir ao painel.
 *
 * Junto vem o fluxo do chamado — as mesmas colunas do painel kanban, aqui em
 * forma de botão, para o técnico não precisar voltar ao painel só para dizer
 * "peguei" ou "estou esperando o usuário".
 */

/** As colunas do painel viram botões. "Resolvido" não está aqui de propósito:
 *  resolver exige texto, então ele abre a aba de solução em vez de mandar o
 *  status direto — status 5 sozinho deixa o usuário sem nada para aprovar. */
const FLUXO = [
  { status: 2, rotulo: "🔧 Em atendimento", cobre: [2, 3], aviso: "Chamado marcado como em atendimento." },
  { status: 4, rotulo: "⏳ Aguardando o usuário", cobre: [4, 10], aviso: "Chamado marcado como aguardando o usuário." },
] as const;

export default function ComentarioForm({
  ticketId,
  podeResolver = false,
  statusAtual,
  iaDisponivel = false,
}: {
  ticketId: number;
  podeResolver?: boolean;
  statusAtual?: number;
  /** chave da IA configurada e apoio ligado na tela ⚙️ */
  iaDisponivel?: boolean;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<"responder" | "solucao">("responder");
  const [texto, setTexto] = useState("");
  const [parcial, setParcial] = useState(""); // trecho que o ditado ainda reconhece
  const [ouvindoVoz, setOuvindoVoz] = useState(false);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [resolvendo, setResolvendo] = useState(false);
  const [mudandoStatus, setMudandoStatus] = useState<number | null>(null);
  const [melhorando, setMelhorando] = useState(false);
  /** rascunho antes da IA — guardado para o clique de volta */
  const [antesDaIa, setAntesDaIa] = useState<string | null>(null);
  const [atualizando, startTransition] = useTransition();

  useEffect(() => {
    if (!atualizando) {
      setPendentes((atuais) => atuais.filter((p) => p.estado !== "ok"));
    }
  }, [atualizando]);

  async function enviarComentario() {
    const conteudo = texto.trim();
    if (!conteudo) return;

    const id = Date.now();
    setPendentes((atuais) => [...atuais, { id, texto: conteudo, estado: "enviando" }]);
    setTexto("");
    setParcial("");

    try {
      const res = await fetch(`/api/chamados/${ticketId}/comentario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: conteudo }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        setPendentes((atuais) => atuais.map((p) => (p.id === id ? { ...p, estado: "ok" } : p)));
        toast("Mensagem enviada!");
        startTransition(() => router.refresh());
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setPendentes((atuais) => atuais.map((p) => (p.id === id ? { ...p, estado: "erro" } : p)));
      toast(data?.error ?? "Não foi possível enviar a mensagem.", "erro");
    } catch {
      setPendentes((atuais) => atuais.map((p) => (p.id === id ? { ...p, estado: "erro" } : p)));
      toast("Falha de conexão. Verifique a rede e tente novamente.", "erro");
    }
  }

  async function registrarSolucao() {
    const conteudo = texto.trim();
    if (conteudo.length < 3) return;
    setResolvendo(true);
    try {
      const res = await fetch(`/api/chamados/${ticketId}/painel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "resolver", texto: conteudo }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast(data?.error ?? "Não foi possível registrar a solução.", "erro");
        return;
      }
      setTexto("");
      setParcial("");
      setModo("responder");
      toast("Solução registrada — o usuário vai confirmar se funcionou.");
      router.refresh();
    } catch {
      toast("Falha de conexão. Tente novamente.", "erro");
    } finally {
      setResolvendo(false);
    }
  }

  async function mudarStatus(status: number, aviso: string) {
    setMudandoStatus(status);
    try {
      const res = await fetch(`/api/chamados/${ticketId}/painel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "status", status }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast(data?.error ?? "Não foi possível mudar a situação.", "erro");
        return;
      }
      toast(aviso);
      router.refresh();
    } catch {
      toast("Falha de conexão. Tente novamente.", "erro");
    } finally {
      setMudandoStatus(null);
    }
  }

  /**
   * Pede à IA para melhorar o que já está escrito. O resultado volta para a
   * caixa, para o técnico ler antes de enviar — quem assina continua sendo
   * ele. O texto anterior fica guardado para o botão de voltar.
   */
  async function melhorarComIa() {
    const conteudo = texto.trim();
    if (conteudo.length < 10) return;
    setMelhorando(true);
    try {
      const res = await fetch(`/api/chamados/${ticketId}/melhorar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: conteudo, modo: ehSolucao ? "solucao" : "resposta" }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        texto?: string;
        error?: string;
        truncado?: boolean;
      } | null;
      if (!res.ok || !data?.texto) {
        toast(data?.error ?? "Não foi possível melhorar o texto.", "erro");
        return;
      }
      setAntesDaIa(conteudo);
      setTexto(data.texto);
      // texto pela metade não pode passar por pronto: o técnico precisa saber
      // que o fim ficou faltando antes de registrar isso no chamado
      toast(
        data.truncado
          ? "O texto veio incompleto — complete o final ou tente de novo."
          : "Texto melhorado — confira antes de enviar.",
        data.truncado ? "erro" : undefined,
      );
    } catch {
      toast("Falha de conexão. Tente novamente.", "erro");
    } finally {
      setMelhorando(false);
    }
  }

  function desfazerIa() {
    if (antesDaIa === null) return;
    setTexto(antesDaIa);
    setAntesDaIa(null);
  }

  function tentarDeNovo(p: Pendente) {
    setPendentes((atuais) => atuais.filter((x) => x.id !== p.id));
    setTexto((atual) => (atual.trim() ? `${atual}\n\n${p.texto}` : p.texto));
  }

  const ehSolucao = modo === "solucao";
  const aba = (ativo: boolean) =>
    `inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold ${
      ativo
        ? ehSolucao
          ? "bg-green-600 text-white"
          : "bg-brand-600 text-white"
        : "text-gray-600 hover:bg-gray-100"
    }`;

  return (
    <>
      {pendentes.length > 0 && (
        <ol className="mt-3 space-y-3">
          {pendentes.map((p) => (
            <li
              key={p.id}
              className={`rounded-2xl bg-superficie p-4 shadow ${p.estado === "erro" ? "border border-red-200" : "opacity-70"}`}
            >
              <p className="text-sm text-gray-500" role={p.estado === "erro" ? "alert" : undefined}>
                <span className="font-semibold text-gray-700">Você</span>
                {p.estado === "erro" ? (
                  <span className="text-perigo"> · não foi enviado</span>
                ) : (
                  <span> · enviando…</span>
                )}
              </p>
              <p className="mt-2 whitespace-pre-line text-gray-800">{p.texto}</p>
              {p.estado === "erro" && (
                <button
                  type="button"
                  onClick={() => tentarDeNovo(p)}
                  className="mt-2 min-h-9 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-perigo hover:bg-red-100"
                >
                  Tentar de novo
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      <div
        className={`mt-4 rounded-2xl p-4 shadow ${ehSolucao ? "border border-green-200 bg-green-50" : "bg-superficie"}`}
      >
        {podeResolver && (
          <div className="mb-3 flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => setModo("responder")} className={aba(!ehSolucao)}>
              💬 Responder
            </button>
            <button type="button" onClick={() => setModo("solucao")} className={aba(ehSolucao)}>
              ✅ Registrar solução
            </button>

            {/* fluxo do chamado, do lado do Responder — mesmas colunas do painel */}
            {statusAtual !== 6 && (
              <span className="ml-auto flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-gray-500">Situação:</span>
                {FLUXO.map((f) => {
                  const ativo =
                    statusAtual !== undefined && (f.cobre as readonly number[]).includes(statusAtual);
                  return (
                    <button
                      key={f.status}
                      type="button"
                      disabled={ativo || mudandoStatus !== null}
                      aria-pressed={ativo}
                      onClick={() => mudarStatus(f.status, f.aviso)}
                      className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-default ${
                        ativo
                          ? "bg-gray-200 text-gray-700"
                          : "border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                      }`}
                    >
                      {mudandoStatus === f.status ? "…" : f.rotulo}
                    </button>
                  );
                })}
              </span>
            )}
          </div>
        )}

        <label htmlFor="comentario" className="mb-1 block font-medium">
          {ehSolucao ? "O que foi feito para resolver" : "Responder / adicionar informação"}
        </label>
        <textarea
          id="comentario"
          // o trecho ainda sendo reconhecido aparece junto do já digitado
          value={parcial ? (texto ? `${texto} ${parcial}` : parcial) : texto}
          onChange={(e) => {
            setParcial("");
            setTexto(e.target.value);
          }}
          rows={3}
          maxLength={5000}
          required
          placeholder={
            ehSolucao
              ? "Ex.: Troquei a fonte do computador e testei ligando duas vezes."
              : "Escreva aqui sua resposta ou uma informação nova sobre o problema."
          }
          className={`w-full rounded-lg border bg-superficie px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 ${
            ouvindoVoz ? "border-red-400 ring-2 ring-red-100" : "border-gray-300 focus:border-brand-600"
          }`}
        />

        {ehSolucao && (
          <p className="mt-1 text-xs text-sucesso">
            O chamado vai para <strong>resolvido</strong> e o usuário lê este texto para confirmar
            se funcionou.
          </p>
        )}

        {/* Apoio da IA: aparece só para a equipe, só com chave configurada e
            só quando já há texto — ela melhora o que o técnico escreveu, não
            escreve no lugar dele. */}
        {iaDisponivel && podeResolver && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={melhorando || texto.trim().length < 10}
              onClick={melhorarComIa}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-brand-600 px-3.5 py-2 text-sm font-semibold text-marca hover:bg-gray-50 disabled:opacity-50"
            >
              {melhorando ? "Melhorando…" : "✨ Melhorar com IA"}
            </button>
            {antesDaIa !== null && (
              <button
                type="button"
                onClick={desfazerIa}
                className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:underline"
              >
                ↩ Voltar ao meu texto
              </button>
            )}
            <span className="text-xs text-gray-500">
              {antesDaIa !== null
                ? "Confira: a IA só reescreve, mas quem assina é você."
                : "Escreva do seu jeito e deixe a IA arrumar o texto."}
            </span>
          </div>
        )}

        {/* o microfone mora ao lado do enviar: quem só digita nem repara,
            quem tem dificuldade acha no lugar onde já está olhando */}
        <div className="mt-3 flex items-center gap-2">
          <DitadoVoz
            variante="discreto"
            aoTranscrever={(t) => setTexto((atual) => (atual ? `${atual} ${t}` : t))}
            aoParcial={setParcial}
            aoMudarEstado={setOuvindoVoz}
          />
          {ouvindoVoz && <span className="text-xs font-medium text-perigo">Ouvindo…</span>}
          <button
            type="button"
            disabled={ehSolucao ? resolvendo || texto.trim().length < 3 : !texto.trim()}
            onClick={ehSolucao ? registrarSolucao : enviarComentario}
            className={`ml-auto min-h-11 flex-1 rounded-lg px-4 py-3 font-semibold text-white disabled:opacity-60 sm:flex-none sm:px-6 ${
              ehSolucao ? "bg-green-600 hover:bg-green-700" : "bg-brand-600 hover:bg-brand-700"
            }`}
          >
            {ehSolucao
              ? resolvendo
                ? "Registrando..."
                : "✅ Registrar solução"
              : "Enviar mensagem"}
          </button>
        </div>
      </div>
    </>
  );
}
