"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { urgenciaChamado } from "@/lib/copy";
import { COLUNAS, type CartaoChamado } from "@/lib/painel";

/**
 * Kanban do técnico (roadmap Fase B). Arrastar usa a API nativa do HTML —
 * zero dependências novas, importante no CT de 1 vCPU. Como arrastar não
 * funciona em tela de toque, todo card tem um menu "⋯" com as mesmas ações.
 *
 * As mudanças são otimistas: o card pula de coluna na hora e volta ao lugar
 * se o GLPI recusar.
 */

export default function Kanban({ inicial }: { inicial: CartaoChamado[] }) {
  const router = useRouter();
  const [cartoes, setCartoes] = useState(inicial);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  // concluir um chamado pede a solução: sem ela o usuário não teria o que aprovar
  const [resolvendo, setResolvendo] = useState<CartaoChamado | null>(null);
  const [textoSolucao, setTextoSolucao] = useState("");
  // navegação por teclado
  const [foco, setFoco] = useState<number | null>(null);
  const [ajuda, setAjuda] = useState(false);

  // re-sincroniza quando o servidor devolve dados novos (router.refresh)
  useEffect(() => setCartoes(inicial), [inicial]);

  async function chamar(id: number, corpo: Record<string, unknown>, otimista: () => void, desfazer: () => void) {
    setMenu(null);
    setOcupado(id);
    otimista();
    try {
      const res = await fetch(`/api/chamados/${id}/painel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        desfazer();
        toast(data?.error ?? "Não foi possível concluir a ação.", "erro");
        return;
      }
      router.refresh();
    } catch {
      desfazer();
      toast("Falha de conexão. Tente novamente.", "erro");
    } finally {
      setOcupado(null);
    }
  }

  function mover(id: number, destino: number) {
    const cartao = cartoes.find((c) => c.id === id);
    if (!cartao || cartao.status === destino) return;

    // "Resolvidos" não é uma simples mudança de status: o técnico precisa
    // dizer o que foi feito, e é essa solução que o usuário aceita ou recusa.
    if (destino === 5) {
      setMenu(null);
      setTextoSolucao("");
      setResolvendo(cartao);
      return;
    }

    const antes = cartao.status;
    void chamar(
      id,
      { acao: "status", status: destino },
      () => setCartoes((cs) => cs.map((c) => (c.id === id ? { ...c, status: destino } : c))),
      () => setCartoes((cs) => cs.map((c) => (c.id === id ? { ...c, status: antes } : c))),
    );
  }

  function registrarSolucao() {
    const alvo = resolvendo;
    const texto = textoSolucao.trim();
    if (!alvo || texto.length < 3) return;
    const antes = alvo.status;
    setResolvendo(null);
    void chamar(
      alvo.id,
      { acao: "resolver", texto },
      () => setCartoes((cs) => cs.map((c) => (c.id === alvo.id ? { ...c, status: 5 } : c))),
      () => setCartoes((cs) => cs.map((c) => (c.id === alvo.id ? { ...c, status: antes } : c))),
    );
  }

  function atribuir(id: number, assumir: boolean) {
    const antes = cartoes.find((c) => c.id === id);
    if (!antes) return;
    void chamar(
      id,
      { acao: assumir ? "assumir" : "liberar" },
      () =>
        setCartoes((cs) =>
          cs.map((c) => (c.id === id ? { ...c, meu: assumir, semDono: !assumir, responsavel: assumir ? "você" : undefined } : c)),
        ),
      () => setCartoes((cs) => cs.map((c) => (c.id === id ? antes : c))),
    );
  }

  /* ---------------- atalhos de teclado ---------------- */

  // ordem de navegação: coluna por coluna, de cima para baixo
  const emOrdem = COLUNAS.flatMap((col) => cartoes.filter((c) => col.status.includes(c.status)));

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      // não sequestrar teclas enquanto o técnico digita
      const alvo = e.target as HTMLElement | null;
      if (
        alvo &&
        (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Escape") {
        if (resolvendo) setResolvendo(null);
        else if (ajuda) setAjuda(false);
        else if (menu !== null) setMenu(null);
        else setFoco(null);
        return;
      }
      if (resolvendo) return; // com o diálogo aberto, só Esc vale

      if (e.key === "?") {
        e.preventDefault();
        setAjuda((a) => !a);
        return;
      }
      if (emOrdem.length === 0) return;

      const atual = emOrdem.findIndex((c) => c.id === foco);
      const irPara = (i: number) => {
        const alvoCartao = emOrdem[(i + emOrdem.length) % emOrdem.length];
        setFoco(alvoCartao.id);
        document
          .getElementById(`cartao-${alvoCartao.id}`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        irPara(atual + 1);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        irPara(atual < 0 ? -1 : atual - 1);
        return;
      }

      if (atual < 0) return; // as ações abaixo precisam de um card em foco
      const cartao = emOrdem[atual];

      if (e.key === "i") {
        e.preventDefault();
        atribuir(cartao.id, !cartao.meu);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        router.push(`/chamados/${cartao.id}`);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= COLUNAS.length) {
        e.preventDefault();
        mover(cartao.id, COLUNAS[n - 1].destino);
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  });

  const ATALHOS = [
    ["J / ↓", "próximo chamado"],
    ["K / ↑", "chamado anterior"],
    ["1 – 4", "mover para a coluna"],
    ["I", "assumir / devolver"],
    ["Enter", "abrir o chamado"],
    ["Esc", "sair do foco"],
    ["?", "mostrar esta ajuda"],
  ];

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {COLUNAS.map((col) => {
        const daColuna = cartoes.filter((c) => col.status.includes(c.status));
        const realce = alvo === col.key && arrastando !== null;
        return (
          <section
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setAlvo(col.key);
            }}
            onDragLeave={() => setAlvo((a) => (a === col.key ? null : a))}
            onDrop={(e) => {
              e.preventDefault();
              const id = Number(e.dataTransfer.getData("text/plain"));
              setAlvo(null);
              setArrastando(null);
              if (Number.isInteger(id)) mover(id, col.destino);
            }}
            className={`rounded-2xl border p-2.5 transition ${
              realce ? "border-brand-600 bg-brand-50" : "border-gray-200 bg-gray-100/70"
            }`}
          >
            <h3 className="flex items-center justify-between px-1 pb-2 text-xs font-bold uppercase tracking-wide text-gray-600">
              {col.titulo}
              <span className="rounded-full bg-superficie px-2 py-0.5 text-[11px] text-gray-700">
                {daColuna.length}
              </span>
            </h3>

            {daColuna.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-gray-400">{col.dica}</p>
            ) : (
              <ul className="space-y-2">
                {daColuna.map((c) => (
                  <li
                    key={c.id}
                    id={`cartao-${c.id}`}
                    onClick={() => setFoco(c.id)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(c.id));
                      e.dataTransfer.effectAllowed = "move";
                      setArrastando(c.id);
                    }}
                    onDragEnd={() => {
                      setArrastando(null);
                      setAlvo(null);
                    }}
                    className={`relative rounded-xl border border-l-4 bg-superficie p-3 shadow-sm transition ${
                      urgenciaChamado(c.urgencia).borda
                    } ${arrastando === c.id ? "opacity-40" : "hover:shadow"} ${
                      ocupado === c.id ? "animate-pulse" : ""
                    } ${
                      foco === c.id ? "border-brand-600 ring-2 ring-brand-600" : "border-gray-200"
                    } md:cursor-grab md:active:cursor-grabbing`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-[11px] text-gray-500">
                        <span className="font-mono">#{c.id}</span>
                        {c.setor && <span> · {c.setor}</span>}
                      </p>
                      <button
                        type="button"
                        aria-label={`Ações do chamado ${c.id}`}
                        aria-expanded={menu === c.id}
                        onClick={() => setMenu(menu === c.id ? null : c.id)}
                        className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                      >
                        ⋯
                      </button>
                    </div>

                    <Link
                      href={`/chamados/${c.id}`}
                      className="mt-0.5 block text-sm font-semibold leading-snug hover:text-marca focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                    >
                      {c.nome}
                    </Link>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      {c.semDono ? (
                        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
                          sem dono
                        </span>
                      ) : (
                        <span className={`rounded-md px-1.5 py-0.5 font-medium ${c.meu ? "bg-brand-100 text-brand-800" : "bg-gray-100 text-gray-600"}`}>
                          {c.meu ? "👤 você" : `👤 ${c.responsavel}`}
                        </span>
                      )}
                      {c.requerente && <span className="truncate text-gray-500">de {c.requerente}</span>}
                      {c.categoria && (
                        <span className="truncate rounded-md bg-brand-50 px-1.5 py-0.5 font-medium text-marca">
                          {c.categoria}
                        </span>
                      )}
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-bold uppercase tracking-wide ${urgenciaChamado(c.urgencia).chip}`}
                      >
                        {urgenciaChamado(c.urgencia).rotulo}
                      </span>
                      {c.sla && (
                        <span className={`ml-auto rounded-md px-1.5 py-0.5 font-bold ${c.sla.pill}`}>
                          {c.sla.texto}
                        </span>
                      )}
                    </div>

                    {menu === c.id && (
                      <div className="absolute right-2 top-10 z-20 w-52 overflow-hidden rounded-xl border border-gray-200 bg-superficie py-1 shadow-xl">
                        {!c.meu && (
                          <button
                            type="button"
                            onClick={() => atribuir(c.id, true)}
                            className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-gray-50"
                          >
                            🙋 Assumir este chamado
                          </button>
                        )}
                        {c.meu && (
                          <button
                            type="button"
                            onClick={() => atribuir(c.id, false)}
                            className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-gray-50"
                          >
                            ↩️ Devolver para a fila
                          </button>
                        )}
                        {/* já está em Resolvidos mas sem solução registrada?
                            (acontece com chamados concluídos direto no GLPI) */}
                        {c.status === 5 && (
                          <button
                            type="button"
                            onClick={() => {
                              setMenu(null);
                              setTextoSolucao("");
                              setResolvendo(c);
                            }}
                            className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-gray-50"
                          >
                            ✍️ Registrar solução
                          </button>
                        )}
                        <p className="border-t border-gray-100 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase text-gray-400">
                          Mover para
                        </p>
                        {COLUNAS.filter((o) => !o.status.includes(c.status)).map((o) => (
                          <button
                            key={o.key}
                            type="button"
                            onClick={() => mover(c.id, o.destino)}
                            className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-gray-50"
                          >
                            {o.titulo}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setMenu(null)}
                          className="flex min-h-11 w-full items-center border-t border-gray-100 px-3 text-left text-sm text-gray-500 hover:bg-gray-50"
                        >
                          Fechar
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {/* cola de atalhos (tecla ?) */}
      {ajuda && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Atalhos de teclado"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setAjuda(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-superficie p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-lg font-bold">Atalhos do painel</h4>
            <dl className="mt-3 space-y-2">
              {ATALHOS.map(([tecla, oque]) => (
                <div key={tecla} className="flex items-center justify-between gap-3">
                  <dt>
                    <kbd className="rounded border border-gray-300 border-b-2 bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
                      {tecla}
                    </kbd>
                  </dt>
                  <dd className="text-sm text-gray-600">{oque}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              onClick={() => setAjuda(false)}
              className="mt-4 min-h-11 w-full rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      {/* pedido da solução ao concluir */}
      {resolvendo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Registrar solução"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setResolvendo(null);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-superficie p-5 shadow-xl">
            <h4 className="text-lg font-bold">Como você resolveu?</h4>
            <p className="mt-1 text-sm text-gray-600">
              <span className="font-mono text-xs">#{resolvendo.id}</span> — {resolvendo.nome}
            </p>
            <label htmlFor="solucao" className="mt-4 block font-medium">
              O que foi feito
            </label>
            <textarea
              id="solucao"
              autoFocus
              rows={4}
              maxLength={5000}
              value={textoSolucao}
              onChange={(e) => setTextoSolucao(e.target.value)}
              placeholder="Ex.: Troquei o cabo de rede da recepção e testei a impressão."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <p className="mt-1 text-xs text-gray-500">
              {resolvendo.requerente ? `${resolvendo.requerente} vai` : "O usuário vai"} ler este
              texto e confirmar se funcionou.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setResolvendo(null)}
                className="min-h-11 rounded-lg border border-gray-300 bg-superficie px-4 py-2.5 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={registrarSolucao}
                disabled={textoSolucao.trim().length < 3}
                className="min-h-11 rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                ✅ Registrar solução
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
