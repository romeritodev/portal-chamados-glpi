"use client";

import { useState } from "react";
import { toast } from "@/components/Toast";

/**
 * Troca da própria senha.
 *
 * Os três campos são de digitação (nada de colar de um lugar para outro), e a
 * senha atual é obrigatória — quem confere é o GLPI, não esta tela.
 */
export default function FormSenha() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const curta = nova.length > 0 && nova.length < 6;
  const diferente = confirmacao.length > 0 && nova !== confirmacao;
  const podeSalvar =
    atual.length > 0 && nova.length >= 6 && nova === confirmacao && nova !== atual && !salvando;

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch("/api/perfil/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atual, nova, confirmacao }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        aviso?: string;
      } | null;
      if (!res.ok) {
        setErro(data?.error ?? "Não foi possível trocar a senha.");
        return;
      }
      setAtual("");
      setNova("");
      setConfirmacao("");
      toast(data?.aviso ?? "Senha alterada com sucesso!");
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  const campo =
    "w-full rounded-lg border border-gray-300 bg-superficie px-3 py-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200";

  return (
    <section className="mt-4 rounded-2xl bg-superficie p-5 shadow">
      <h3 className="font-bold">Mudar minha senha</h3>
      <p className="mt-0.5 text-sm text-gray-600">
        É a mesma senha que você usa para entrar aqui e no sistema de chamados.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="atual" className="mb-1 block font-medium">
            Senha atual
          </label>
          <input
            id="atual"
            type={mostrar ? "text" : "password"}
            autoComplete="current-password"
            value={atual}
            onChange={(e) => setAtual(e.target.value)}
            className={campo}
          />
        </div>

        <div>
          <label htmlFor="nova" className="mb-1 block font-medium">
            Nova senha
          </label>
          <input
            id="nova"
            type={mostrar ? "text" : "password"}
            autoComplete="new-password"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            className={campo}
          />
          <p className={`mt-1 text-xs ${curta ? "font-medium text-perigo" : "text-gray-500"}`}>
            Pelo menos 6 caracteres, e diferente da atual.
          </p>
        </div>

        <div>
          <label htmlFor="confirmacao" className="mb-1 block font-medium">
            Repita a nova senha
          </label>
          <input
            id="confirmacao"
            type={mostrar ? "text" : "password"}
            autoComplete="new-password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            className={campo}
          />
          {diferente && (
            <p className="mt-1 text-xs font-medium text-perigo">As duas senhas não são iguais.</p>
          )}
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={mostrar}
            onChange={(e) => setMostrar(e.target.checked)}
            className="size-4 accent-brand-600"
          />
          Mostrar as senhas enquanto eu digito
        </label>
      </div>

      {erro && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-perigo">
          {erro}
        </p>
      )}

      <button
        type="button"
        disabled={!podeSalvar}
        onClick={salvar}
        className="mt-4 min-h-11 w-full rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto sm:px-6"
      >
        {salvando ? "Salvando..." : "Salvar nova senha"}
      </button>
    </section>
  );
}
