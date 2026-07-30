"use client";

import { useState } from "react";
import { toast } from "@/components/Toast";
import type { SetorNaArvore } from "@/lib/entidades";

/**
 * Edição de quais serviços aparecem para cada setor.
 *
 * A tela é por SERVIÇO (abre um, marca os setores) porque é o formato do dado
 * gravado: o que você marca é exatamente o que fica salvo, sem o portal
 * reescrever regra por baixo. Marcar uma secretaria cobre tudo abaixo dela;
 * marcar um posto específico cobre só ele.
 *
 * Só as DIFERENÇAS em relação ao padrão são gravadas — por isso o "voltar ao
 * padrão" some com a linha em vez de gravar uma cópia do padrão.
 */

export interface ServicoEditavel {
  chave: string;
  icone: string;
  titulo: string;
  /** nome do card, quando o serviço é um atalho dentro dele */
  grupo: string | null;
  /** regra que vem do código; null = todos os setores */
  padrao: number[] | null;
}

type Regra = number[] | "todos";

export default function FormServicos({
  servicos,
  setores,
  inicial,
}: {
  servicos: ServicoEditavel[];
  setores: SetorNaArvore[];
  inicial: Record<string, Regra>;
}) {
  const [ajustes, setAjustes] = useState<Record<string, Regra>>(inicial);
  const [aberto, setAberto] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);

  /** regra que vale agora para este serviço */
  function regraDe(s: ServicoEditavel): Regra {
    const ajuste = ajustes[s.chave];
    if (ajuste !== undefined) return ajuste;
    return s.padrao ?? "todos";
  }

  function alterar(chave: string, regra: Regra) {
    setAjustes((a) => ({ ...a, [chave]: regra }));
    setSujo(true);
  }

  function voltarAoPadrao(chave: string) {
    setAjustes((a) => {
      const novo = { ...a };
      delete novo[chave];
      return novo;
    });
    setSujo(true);
  }

  function alternarSetor(s: ServicoEditavel, setorId: number) {
    const regra = regraDe(s);
    const atual = regra === "todos" ? [] : regra;
    const novo = atual.includes(setorId)
      ? atual.filter((x) => x !== setorId)
      : [...atual, setorId];
    // sem nenhum setor marcado o serviço sumiria da lista de todo mundo; a
    // leitura honesta desse estado é "todos", e o aviso abaixo explica
    alterar(s.chave, novo.length === 0 ? "todos" : novo);
  }

  async function salvar() {
    setSalvando(true);
    try {
      const res = await fetch("/api/configuracoes/servicos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibilidade: ajustes }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast(data?.error ?? "Não foi possível salvar.", "erro");
        return;
      }
      setSujo(false);
      toast("Salvo! Vale para todo mundo em até 10 segundos.");
    } catch {
      toast("Falha de conexão. Tente novamente.", "erro");
    } finally {
      setSalvando(false);
    }
  }

  const nomeSetor = (id: number) => setores.find((s) => s.id === id)?.nome ?? `Setor ${id}`;

  function resumo(s: ServicoEditavel): { texto: string; padrao: boolean } {
    const regra = regraDe(s);
    const noPadrao = ajustes[s.chave] === undefined;
    if (regra === "todos") return { texto: "Todos os setores", padrao: noPadrao };
    if (regra.length === 1) return { texto: nomeSetor(regra[0]!), padrao: noPadrao };
    return { texto: `${regra.length} setores`, padrao: noPadrao };
  }

  return (
    <>
      <ul className="mt-5 space-y-2">
        {servicos.map((s) => {
          const regra = regraDe(s);
          const marcados = regra === "todos" ? [] : regra;
          const { texto, padrao } = resumo(s);
          const expandido = aberto === s.chave;
          return (
            <li key={s.chave} className="rounded-xl border border-gray-200 bg-superficie">
              <button
                type="button"
                aria-expanded={expandido}
                onClick={() => setAberto(expandido ? null : s.chave)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span aria-hidden className="text-xl">{s.icone}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {s.grupo && <span className="text-gray-500">{s.grupo} · </span>}
                    {s.titulo}
                  </span>
                  <span className="block truncate text-sm text-gray-600">
                    {texto}
                    {!padrao && <span className="text-marca"> · alterado</span>}
                  </span>
                </span>
                <span aria-hidden className="shrink-0 text-gray-400">
                  {expandido ? "▾" : "▸"}
                </span>
              </button>

              {expandido && (
                <div className="border-t border-gray-200 px-4 py-3">
                  <label className="flex min-h-11 cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name={`modo-${s.chave}`}
                      checked={regra === "todos"}
                      onChange={() => alterar(s.chave, "todos")}
                      className="size-4 accent-brand-600"
                    />
                    <span className="font-medium">Todos os setores</span>
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name={`modo-${s.chave}`}
                      checked={regra !== "todos"}
                      onChange={() => alterar(s.chave, s.padrao ?? [])}
                      className="size-4 accent-brand-600"
                    />
                    <span className="font-medium">Só os setores marcados</span>
                  </label>

                  {regra !== "todos" && (
                    <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-gray-200 p-2">
                      {setores.map((setor) => (
                        <label
                          key={setor.id}
                          className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-gray-50"
                          style={{ paddingLeft: `${0.25 + setor.nivel * 1.25}rem` }}
                        >
                          <input
                            type="checkbox"
                            checked={marcados.includes(setor.id)}
                            onChange={() => alternarSetor(s, setor.id)}
                            className="size-4 shrink-0 accent-brand-600"
                          />
                          <span className={setor.nivel === 0 ? "font-medium" : "text-gray-700"}>
                            {setor.nome}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {!padrao && (
                      <button
                        type="button"
                        onClick={() => voltarAoPadrao(s.chave)}
                        className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Voltar ao padrão
                      </button>
                    )}
                    <span className="text-xs text-gray-500">
                      Padrão:{" "}
                      {s.padrao === null
                        ? "todos os setores"
                        : s.padrao.map((id) => nomeSetor(id)).join(", ")}
                    </span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-24 mt-5 flex items-center gap-3 sm:bottom-4">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || !sujo}
          className="min-h-11 rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-60"
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        {sujo && <span className="text-sm text-gray-600">Há alterações não salvas.</span>}
      </div>
    </>
  );
}
