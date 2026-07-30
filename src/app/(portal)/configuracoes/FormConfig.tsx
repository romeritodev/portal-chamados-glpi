"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/Toast";
import type { ConfigPublica, ProvedorIA } from "@/lib/config-portal";

const MODELOS_CLAUDE = [
  { id: "claude-haiku-4-5", nome: "Haiku 4.5 — rápido e barato (recomendado)", custo: "US$ 1 entrada / US$ 5 saída por milhão de tokens" },
  { id: "claude-sonnet-5", nome: "Sonnet 5 — equilibrado", custo: "US$ 3 entrada / US$ 15 saída por milhão de tokens" },
  { id: "claude-opus-5", nome: "Opus 5 — o mais capaz", custo: "US$ 5 entrada / US$ 25 saída por milhão de tokens" },
];

/**
 * Cada exemplo preenche endereço E modelo. Antes só preenchia o endereço, e
 * o modelo continuava com o nome de outro serviço — quem escolhia Gemini
 * levava um 404 do Google reclamando de um modelo da Anthropic.
 */
const EXEMPLOS_BASE_URL = [
  // conferido em 26/07/2026: o 2.5-flash deixou de ser liberado para contas
  // novas ("no longer available to new users"), então o exemplo aponta para a
  // geração atual. Nome de modelo envelhece — se der 404, ver ai.google.dev.
  { nome: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai", modelo: "gemini-3.6-flash" },
  { nome: "OpenAI", url: "https://api.openai.com/v1", modelo: "gpt-4o-mini" },
  { nome: "Groq", url: "https://api.groq.com/openai/v1", modelo: "llama-3.3-70b-versatile" },
  { nome: "DeepSeek", url: "https://api.deepseek.com/v1", modelo: "deepseek-chat" },
  { nome: "Ollama (servidor seu)", url: "http://SEU-SERVIDOR:11434/v1", modelo: "llama3.1" },
];

interface Teste {
  ok: boolean;
  texto: string;
}

export default function FormConfig({ inicial }: { inicial: ConfigPublica }) {
  const router = useRouter();
  const [c, setC] = useState(inicial);
  const [chave, setChave] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<Teste | null>(null);

  const alterar = <K extends keyof ConfigPublica>(campo: K, valor: ConfigPublica[K]) => {
    setC((atual) => ({ ...atual, [campo]: valor }));
    setTeste(null);
  };

  function corpo(extra: Record<string, unknown> = {}) {
    return JSON.stringify({
      iaProvedor: c.iaProvedor,
      iaModelo: c.iaModelo,
      iaBaseUrl: c.iaBaseUrl,
      iaChave: chave,
      iaTriagem: c.iaTriagem,
      iaDuplicado: c.iaDuplicado,
      iaSugestao: c.iaSugestao,
      avisos: c.avisos,
      painel: c.painel,
      pushLigado: c.pushLigado,
      ...extra,
    });
  }

  async function salvar(extra: Record<string, unknown> = {}) {
    setSalvando(true);
    try {
      const res = await fetch("/api/configuracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo(extra),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { config?: ConfigPublica; error?: string }
        | null;
      if (!res.ok || !data?.config) {
        toast(data?.error ?? "Não foi possível salvar.", "erro");
        return;
      }
      setC(data.config);
      setChave("");
      toast("Configuração salva!");
      router.refresh();
    } catch {
      toast("Falha de conexão ao salvar.", "erro");
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTestando(true);
    setTeste(null);
    try {
      const res = await fetch("/api/configuracoes/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo(),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        resposta?: string;
        tempo?: string;
        modelo?: string;
        erro?: string;
        error?: string;
      } | null;
      if (data?.ok) {
        setTeste({ ok: true, texto: `Respondeu "${data.resposta}" em ${data.tempo} (${data.modelo}).` });
      } else {
        setTeste({ ok: false, texto: data?.erro ?? data?.error ?? "Falha no teste." });
      }
    } catch {
      setTeste({ ok: false, texto: "Falha de conexão ao testar." });
    } finally {
      setTestando(false);
    }
  }

  const usaIA = c.iaProvedor !== "desligado";
  const caixa = "rounded-2xl bg-superficie p-5 shadow";
  const rotulo = "mb-1 block font-medium";
  const campo =
    "w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200";

  const Marcar = ({
    campo: nome,
    titulo,
    ajuda,
  }: {
    campo: "iaTriagem" | "iaDuplicado" | "iaSugestao" | "avisos" | "painel" | "pushLigado";
    titulo: string;
    ajuda: string;
  }) => (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 has-checked:border-brand-600 has-checked:bg-brand-50">
      <input
        type="checkbox"
        checked={c[nome]}
        onChange={(e) => alterar(nome, e.target.checked)}
        className="mt-0.5 size-4 accent-brand-600"
      />
      <span>
        <span className="block font-medium">{titulo}</span>
        <span className="block text-sm text-gray-600">{ajuda}</span>
      </span>
    </label>
  );

  return (
    <div className="mt-5 space-y-4">
      {/* ---------------- IA ---------------- */}
      <section className={caixa}>
        <h3 className="text-lg font-bold">🤖 Inteligência artificial</h3>
        <p className="mt-1 text-sm text-gray-600">
          Usada para classificar chamados, detectar chamados repetidos e sugerir respostas.
          A chave fica guardada no servidor e nunca é mostrada de volta nesta tela.
        </p>

        <div className="mt-4">
          <label htmlFor="provedor" className={rotulo}>
            Serviço de IA
          </label>
          <select
            id="provedor"
            value={c.iaProvedor}
            onChange={(e) => alterar("iaProvedor", e.target.value as ProvedorIA)}
            className={campo}
          >
            <option value="desligado">Desligado (nenhum recurso de IA)</option>
            <option value="anthropic">Claude (Anthropic) — recomendado</option>
            <option value="openai">Compatível com OpenAI (OpenAI, Gemini, Groq, DeepSeek, Ollama…)</option>
          </select>
        </div>

        {usaIA && (
          <>
            {c.iaProvedor === "anthropic" ? (
              <div className="mt-4">
                <label htmlFor="modelo" className={rotulo}>
                  Modelo
                </label>
                <select
                  id="modelo"
                  value={c.iaModelo}
                  onChange={(e) => alterar("iaModelo", e.target.value)}
                  className={campo}
                >
                  {MODELOS_CLAUDE.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {MODELOS_CLAUDE.find((m) => m.id === c.iaModelo)?.custo ??
                    "Modelo personalizado."}
                </p>
              </div>
            ) : (
              <>
                <div className="mt-4">
                  <label htmlFor="baseurl" className={rotulo}>
                    Endereço do serviço
                  </label>
                  <input
                    id="baseurl"
                    type="url"
                    inputMode="url"
                    placeholder="https://api.openai.com/v1"
                    value={c.iaBaseUrl}
                    onChange={(e) => alterar("iaBaseUrl", e.target.value)}
                    className={campo}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Exemplos:{" "}
                    {EXEMPLOS_BASE_URL.map((e, i) => (
                      <span key={e.url}>
                        {i > 0 && " · "}
                        <button
                          type="button"
                          onClick={() => {
                            alterar("iaBaseUrl", e.url);
                            alterar("iaModelo", e.modelo);
                          }}
                          className="text-marca underline"
                        >
                          {e.nome}
                        </button>
                      </span>
                    ))}
                  </p>
                </div>
                <div className="mt-4">
                  <label htmlFor="modelo-livre" className={rotulo}>
                    Modelo
                  </label>
                  <input
                    id="modelo-livre"
                    type="text"
                    placeholder="ex.: gemini-3.6-flash, gpt-4o-mini, deepseek-chat"
                    value={c.iaModelo}
                    onChange={(e) => alterar("iaModelo", e.target.value)}
                    className={campo}
                  />
                  {/* avisa antes de gastar uma chamada só para receber 404 */}
                  {c.iaModelo.startsWith("claude-") && (
                    <p className="mt-1 text-sm font-medium text-amber-700">
                      ⚠️ “{c.iaModelo}” é um modelo da Anthropic e não existe neste serviço.
                      Toque num dos exemplos acima para preencher endereço e modelo juntos.
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="mt-4">
              <label htmlFor="chave" className={rotulo}>
                Chave da API
              </label>
              <input
                id="chave"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={c.temChave ? `Guardada: ${c.chaveMascarada} — digite para trocar` : "Cole a chave aqui"}
                value={chave}
                onChange={(e) => {
                  setChave(e.target.value);
                  setTeste(null);
                }}
                className={campo}
              />
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                <span className="text-gray-500">
                  {c.temChave ? "Deixe em branco para manter a chave atual." : "Nenhuma chave configurada ainda."}
                </span>
                {c.temChave && (
                  <button
                    type="button"
                    onClick={() => salvar({ removerChave: true })}
                    className="font-medium text-perigo underline"
                  >
                    Remover chave
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={testar}
                disabled={testando || salvando}
                className="min-h-11 rounded-lg border border-gray-300 bg-superficie px-4 py-2.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {testando ? "Testando..." : "🔌 Testar conexão"}
              </button>
              <span className="text-xs text-gray-500">Faz uma chamada real — custa frações de centavo.</span>
            </div>

            {teste && (
              <p
                role="status"
                className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  teste.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-perigo"
                }`}
              >
                {teste.ok ? "✅ Funcionando! " : "❌ "}
                {teste.texto}
              </p>
            )}

            <p className="mt-5 font-medium">Recursos de IA</p>
            <p className="mb-2 text-sm text-gray-600">
              Ficam prontos para quando os recursos forem entregues no portal.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Marcar campo="iaTriagem" titulo="Triagem automática" ajuda="Sugere categoria e urgência pelo texto." />
              <Marcar campo="iaDuplicado" titulo="Chamado repetido" ajuda="Avisa quando já existe um parecido." />
              <Marcar campo="iaSugestao" titulo="Melhorar texto" ajuda="Botão ✨ na caixa de resposta do técnico." />
            </div>
          </>
        )}
      </section>

      {/* ---------------- Recursos do portal ---------------- */}
      <section className={caixa}>
        <h3 className="text-lg font-bold">🧩 Recursos do portal</h3>
        <p className="mt-1 text-sm text-gray-600">
          Ligue e desligue partes do portal sem precisar mexer no servidor.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Marcar campo="avisos" titulo="Sino de avisos" ajuda="Mostra atualizações dos chamados no cabeçalho." />
          <Marcar campo="painel" titulo="Painel de atendimento" ajuda="O kanban da equipe de TI." />
          <Marcar
            campo="pushLigado"
            titulo="Avisos no celular"
            ajuda="Notifica o usuário quando a TI responde ou o chamado é resolvido."
          />
        </div>
        {c.pushLigado && (
          <p className="mt-2 text-xs text-gray-500">
            {c.pushPublica
              ? "Chaves de notificação já geradas neste servidor."
              : "As chaves de notificação são geradas sozinhas quando o primeiro usuário ativar os avisos."}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => salvar()}
          disabled={salvando}
          className="min-h-11 rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {salvando ? "Salvando..." : "Salvar configurações"}
        </button>
        {c.atualizadoEm && (
          <span className="text-xs text-gray-500">
            Última alteração:{" "}
            {new Date(c.atualizadoEm).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {c.atualizadoPor ? ` por ${c.atualizadoPor}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
