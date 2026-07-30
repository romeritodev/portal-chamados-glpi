"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AvisosCelular from "@/components/AvisosCelular";
import DitadoVoz from "@/components/DitadoVoz";
import { toast } from "@/components/Toast";
import { comprimeImagem } from "@/lib/comprime-imagem";

/**
 * Abertura de chamado em passos (roadmap Fase B), no padrão "uma coisa por
 * tela" do GOV.UK: quem usa pouco e sem intimidade com tecnologia responde
 * uma pergunta de cada vez e confere tudo antes de enviar.
 *
 * O assunto é montado a partir da primeira frase do relato — o usuário não
 * digita a mesma coisa duas vezes — e pode ser ajustado na revisão.
 */

interface CardAtalho {
  slug: string;
  rotulo: string;
  texto: string;
  ajuda?: { titulo: string; texto: string };
  /** aparece de entrada para o setor de quem está logado */
  doSetor?: boolean;
}

interface CardCategoria {
  slug: string;
  titulo: string;
  descricao: string;
  icone: string;
  formulario?: "publicacao";
  /** aparece de entrada para o setor de quem está logado */
  doSetor?: boolean;
  atalhos?: CardAtalho[];
}

const URGENCIA_OPCOES = [
  { value: "baixa", label: "Posso esperar", ajuda: "Não atrapalha o trabalho agora." },
  { value: "media", label: "Está atrapalhando o trabalho", ajuda: "Dá para continuar, mas com dificuldade." },
  { value: "alta", label: "Parou tudo, é urgente", ajuda: "Não consigo trabalhar sem isso." },
];

const ANEXO_MAX_BYTES = 10 * 1024 * 1024;
const ANEXO_MAX_QTD = 5;
const ANEXO_TIPOS = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];
const ANEXO_ACCEPT = ANEXO_TIPOS.join(",");
const CAMERA_ACCEPT = ANEXO_TIPOS.filter((t) => t.startsWith("image/")).join(",");

/** Atalhos do relato (foto/anexo/voz) — o botão de voz repete estas classes. */
const ATALHO =
  "flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-superficie px-2 py-2.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-brand-600 hover:bg-gray-50 hover:text-marca active:scale-[0.98] disabled:opacity-50 disabled:hover:border-gray-300 disabled:hover:text-gray-700";

const CONFETES = [
  { left: "8%", bg: "#2a78d6", delay: "0s" },
  { left: "20%", bg: "#eda100", delay: ".15s" },
  { left: "32%", bg: "#1baf7a", delay: ".05s" },
  { left: "44%", bg: "#4a3aa7", delay: ".25s" },
  { left: "56%", bg: "#eda100", delay: ".1s" },
  { left: "68%", bg: "#2a78d6", delay: ".3s" },
  { left: "80%", bg: "#1baf7a", delay: ".2s" },
  { left: "92%", bg: "#4a3aa7", delay: ".12s" },
];

const TOTAL_PASSOS = 4;

/** Assunto = primeira frase do relato, encurtada. */
function assuntoDe(relato: string): string {
  const limpo = relato.trim().replace(/\s+/g, " ");
  if (!limpo) return "";
  const primeiraFrase = limpo.split(/(?<=[.!?])\s/)[0] ?? limpo;
  const base = primeiraFrase.length > 12 ? primeiraFrase : limpo;
  return base.length > 110 ? `${base.slice(0, 107)}...` : base;
}

export default function NovoChamado({
  nome,
  categorias,
}: {
  nome: string;
  categorias: CardCategoria[];
}) {
  const [passo, setPasso] = useState(1);
  const [categoria, setCategoria] = useState<CardCategoria | null>(null);
  const [atalho, setAtalho] = useState<CardAtalho | null>(null);
  const [ajudaAberta, setAjudaAberta] = useState<CardAtalho | null>(null);
  /**
   * Última frase escrita por um atalho. É o que separa "texto que o portal
   * sugeriu" de "texto que a pessoa escreveu": o primeiro pode ser trocado
   * sem dó, o segundo nunca. Zera assim que alguém digita na caixa.
   */
  const [textoAuto, setTextoAuto] = useState("");
  // formulário de publicação (passo 2 do card "Publicar no site")
  const [tituloPub, setTituloPub] = useState("");
  const [prazoPub, setPrazoPub] = useState("");
  const [relato, setRelato] = useState("");
  const [parcial, setParcial] = useState(""); // trecho que o ditado ainda reconhece
  const [ouvindoVoz, setOuvindoVoz] = useState(false);
  const [assunto, setAssunto] = useState("");
  const [editandoAssunto, setEditandoAssunto] = useState(false);
  const [urgencia, setUrgencia] = useState("baixa");
  const [anexos, setAnexos] = useState<File[]>([]);
  const [otimizando, setOtimizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [criadoId, setCriadoId] = useState<number | null>(null);
  const [avisoAnexo, setAvisoAnexo] = useState<string | null>(null);
  /**
   * A pessoa pediu para ver tudo, inclusive o que não é do setor dela.
   * Existe porque esconder só é seguro com caminho de volta: setor errado no
   * cadastro, servidora que atende dois lugares, caso que ninguém previu —
   * nenhum desses pode virar "não consigo abrir meu chamado".
   */
  const [verTudo, setVerTudo] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const relatoRef = useRef<HTMLTextAreaElement>(null);

  const ehPublicacao = categoria?.formulario === "publicacao";

  /**
   * Foco automático na caixa de relato — só onde ele é de graça.
   *
   * No celular o foco sobe o teclado junto, que come metade da tela: a
   * pessoa chega no passo 2 sem ver os atalhos nem os botões de foto e voz,
   * que são justamente o caminho de quem tem dificuldade de digitar. No
   * computador não custa nada e poupa um clique.
   */
  useEffect(() => {
    if (passo !== 2 || ehPublicacao) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    relatoRef.current?.focus();
  }, [passo, ehPublicacao]);

  function irPara(n: number) {
    setErro(null);
    setPasso(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** A caixa só pode ser sobrescrita se ninguém tiver escrito nela. */
  function sugestaoDescartavel(): boolean {
    return !relato.trim() || relato.trim() === textoAuto.trim();
  }

  /**
   * Escolher um atalho preenche a caixa — mas nunca por cima do que a pessoa
   * escreveu. Só substitui a frase que o próprio portal sugeriu.
   */
  function escolherAtalho(a: CardAtalho) {
    setAtalho(a);
    setAjudaAberta(a.ajuda ? a : null);
    if (ehPublicacao) return; // no formulário de publicação o atalho é só o tipo
    setParcial("");
    if (!sugestaoDescartavel()) return;
    setRelato(a.texto);
    setTextoAuto(a.texto);
  }

  /** Trocar de card no passo 1 — a sugestão da categoria anterior sai junto. */
  function escolherCategoria(c: CardCategoria) {
    setCategoria(c);
    setAtalho(null);
    setAjudaAberta(null);
    if (sugestaoDescartavel()) {
      setRelato("");
      setTextoAuto("");
    }
    irPara(2);
  }

  /** O que vai para a descrição do chamado. */
  function relatoFinal(): string {
    if (!ehPublicacao) return relato;
    const linhas = [`Tipo: ${atalho?.rotulo ?? "Outro"}`, `Título: ${tituloPub.trim()}`];
    if (prazoPub) {
      const d = new Date(`${prazoPub}T00:00:00`);
      if (!Number.isNaN(d.getTime())) linhas.push(`Prazo: até ${d.toLocaleDateString("pt-BR")}`);
    }
    if (relato.trim()) linhas.push(`Observação: ${relato.trim()}`);
    return linhas.join("\n");
  }

  function assuntoFinal(): string {
    if (assunto) return assunto;
    if (ehPublicacao) return `Publicar no site: ${tituloPub.trim()}`.slice(0, 120);
    return assuntoDe(relato);
  }

  async function adicionarAnexos(lista: File[]) {
    if (lista.length === 0) return;
    setErro(null);
    setOtimizando(true);
    try {
      const prontos = await Promise.all(lista.map((f) => comprimeImagem(f)));
      const invalidos = prontos.filter((f) => !ANEXO_TIPOS.includes(f.type));
      if (invalidos.length > 0) {
        setErro(
          `O arquivo "${invalidos[0].name}" não é aceito — envie foto (JPG/PNG), print de tela ou PDF.`,
        );
      }
      setAnexos((atuais) => {
        const novos = [...atuais];
        for (const arquivo of prontos.filter((f) => ANEXO_TIPOS.includes(f.type))) {
          if (novos.length >= ANEXO_MAX_QTD) break;
          if (novos.some((f) => f.name === arquivo.name && f.size === arquivo.size)) continue;
          novos.push(arquivo);
        }
        return novos;
      });
    } finally {
      setOtimizando(false);
    }
  }

  function onEscolherArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    void adicionarAnexos(arquivos);
  }

  async function enviar() {
    setErro(null);
    setEnviando(true);

    const form = new FormData();
    form.set("categoria", categoria!.slug);
    if (atalho) form.set("subcategoria", atalho.slug);
    form.set("titulo", assuntoFinal().slice(0, 120));
    form.set("descricao", relatoFinal());
    form.set("urgencia", urgencia);
    for (const arquivo of anexos) {
      if (arquivo.size > ANEXO_MAX_BYTES) {
        setErro(`O arquivo "${arquivo.name}" é grande demais (limite de 10 MB por arquivo).`);
        setEnviando(false);
        return;
      }
      form.append("anexos", arquivo, arquivo.name);
    }

    try {
      const res = await fetch("/api/chamados", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as {
        id?: number;
        error?: string;
        avisoAnexo?: string;
      } | null;
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok && data?.id) {
        setAvisoAnexo(data.avisoAnexo ?? null);
        setCriadoId(data.id);
        window.scrollTo({ top: 0 });
        return;
      }
      setErro(data?.error ?? "Não foi possível registrar o chamado. Tente novamente.");
    } catch {
      setErro("Falha de conexão. Verifique a rede e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  function recomeçar() {
    setCriadoId(null);
    setCategoria(null);
    setAtalho(null);
    setAjudaAberta(null);
    setTituloPub("");
    setPrazoPub("");
    setRelato("");
    setTextoAuto("");
    setParcial("");
    setAssunto("");
    setUrgencia("baixa");
    setAnexos([]);
    setAvisoAnexo(null);
    setErro(null);
    setPasso(1);
  }

  // o botão "Abrir" da barra do celular avisa por aqui quando o usuário já
  // está nesta tela — sem isso o formulário ficaria parado no passo atual
  useEffect(() => {
    const aoPedirNovo = () => {
      recomeçar();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("portal-novo-chamado", aoPedirNovo);
    return () => window.removeEventListener("portal-novo-chamado", aoPedirNovo);
  }, []);

  // -------------------------------------------------------------------
  // Confirmação
  // -------------------------------------------------------------------
  if (criadoId !== null) {
    return (
      <div className="relative mt-8 overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-36">
          {CONFETES.map((c, i) => (
            <span
              key={i}
              className="animate-confete absolute top-0 block h-2.5 w-1.5 rounded-sm"
              style={{ left: c.left, backgroundColor: c.bg, animationDelay: c.delay }}
            />
          ))}
        </div>

        <div className="rounded-2xl bg-green-700 p-8 text-center text-white shadow">
          <svg viewBox="0 0 56 56" className="mx-auto size-16" aria-hidden>
            <circle cx="28" cy="28" r="26" fill="none" stroke="#fff" strokeWidth="3" className="animate-traco-circulo" />
            <path d="M16 29 l8 8 l16 -17" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="animate-traco-check" />
          </svg>
          <h3 className="mt-4 text-2xl font-bold">Chamado aberto!</h3>
          <p className="mt-2 text-green-100">O número do seu chamado é</p>
          <p className="font-mono text-4xl font-extrabold tracking-wide">#{criadoId}</p>
          <p className="mt-1 text-sm text-green-100">
            Guarde este número — é ele que você informa se ligar para a TI.
          </p>
        </div>

        {avisoAnexo && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{avisoAnexo}</p>
        )}

        <div className="mt-3 rounded-2xl bg-superficie p-5 shadow">
          <p className="font-semibold">O que acontece agora</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
            <li>A equipe de TI já recebeu o seu chamado.</li>
            <li>Um técnico vai assumir e você acompanha cada etapa por aqui.</li>
            <li>Quando resolver, você confirma se ficou tudo certo.</li>
          </ol>
          <AvisosCelular destaque />
        </div>

        <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={`/chamados/${criadoId}`}
            className="rounded-lg bg-brand-600 px-5 py-3 text-center font-semibold text-white hover:bg-brand-700"
          >
            Acompanhar meu chamado
          </Link>
          <button
            type="button"
            onClick={recomeçar}
            className="rounded-lg border border-gray-300 bg-superficie px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
          >
            Abrir outro chamado
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Passo 1 — categoria
  // -------------------------------------------------------------------
  if (passo === 1) {
    const visiveis = verTudo ? categorias : categorias.filter((c) => c.doSetor !== false);
    const escondidos = categorias.length - categorias.filter((c) => c.doSetor !== false).length;
    return (
      <>
        <h2 className="text-xl font-bold">Olá, {nome}! 👋</h2>
        <p className="mt-1 text-gray-600">
          Vamos abrir seu chamado em 4 passos rápidos. Comece escolhendo a opção que mais parece
          com o que está acontecendo.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {visiveis.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => escolherCategoria(c)}
            className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-superficie p-4 text-center shadow-sm transition hover:border-brand-600 hover:shadow focus:outline-none focus:ring-2 focus:ring-brand-600 active:scale-95"
          >
            <span aria-hidden className="text-4xl">{c.icone}</span>
            <span className="font-semibold leading-tight">{c.titulo}</span>
            <span className="text-xs text-gray-500">{c.descricao}</span>
          </button>
          ))}
        </div>
        {/* o caminho de volta: sem ele, um setor errado no cadastro viraria
            "não consigo abrir meu chamado" */}
        {escondidos > 0 && !verTudo && (
          <button
            type="button"
            onClick={() => setVerTudo(true)}
            className="mt-4 min-h-11 w-full rounded-lg px-3 py-2 text-sm font-medium text-marca hover:bg-gray-50 hover:underline"
          >
            Não achei meu caso — ver todas as opções
          </button>
        )}
      </>
    );
  }

  const podeAvancar =
    passo !== 2
      ? true
      : ehPublicacao
        ? atalho !== null && tituloPub.trim().length >= 3
        : relato.trim().length >= 5;
  const botaoSec =
    "min-h-11 rounded-lg border border-gray-300 bg-superficie px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50";
  const botaoPri =
    "min-h-11 rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60";

  return (
    <div>
      {/* progresso — no celular a tela é disputada com o teclado, então daqui
          para baixo só fica o essencial do passo atual */}
      <div className="mb-3 flex items-center gap-3">
        <span className="shrink-0 text-sm font-medium text-gray-600">
          Passo {passo} de {TOTAL_PASSOS}
        </span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
          <span
            className="block h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${(passo / TOTAL_PASSOS) * 100}%` }}
          />
        </span>
      </div>

      <div className="rounded-2xl bg-superficie p-4 shadow sm:p-5">
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <span aria-hidden className="text-xl">{categoria?.icone}</span>
          {categoria?.titulo}
        </p>

        {/* ---------------- passo 2: o relato ---------------- */}
        {passo === 2 && (
          <>
            <h3 className="mt-1 text-lg font-bold">
              {ehPublicacao ? "O que você quer publicar?" : "O que está acontecendo?"}
            </h3>
            <p className="mt-0.5 text-sm text-gray-600">
              {ehPublicacao
                ? "Escolha o tipo e diga como o título deve aparecer no site."
                : "Toque numa opção abaixo ou conte com suas palavras."}
            </p>

            {/* Atalhos: resolvem a folha em branco e registram a subcategoria
                sem custar um passo a mais no assistente. */}
            {categoria?.atalhos && (
              <div className="mt-3 flex flex-wrap gap-2">
                {categoria.atalhos
                  .filter((a) => verTudo || a.doSetor !== false)
                  .map((a) => {
                  const on = atalho?.slug === a.slug;
                  return (
                    <button
                      key={a.slug}
                      type="button"
                      aria-pressed={on}
                      onClick={() => escolherAtalho(a)}
                      className={`min-h-11 rounded-full px-3.5 py-2 text-sm font-medium transition ${
                        on
                          ? "bg-brand-600 text-white"
                          : "border border-gray-300 bg-superficie text-gray-700 hover:border-brand-600 hover:bg-gray-50"
                      }`}
                    >
                      {a.rotulo}
                    </button>
                  );
                })}
                {/* mesmo caminho de volta dos cards, aplicado aos atalhos */}
                {!verTudo && categoria.atalhos.some((a) => a.doSetor === false) && (
                  <button
                    type="button"
                    onClick={() => setVerTudo(true)}
                    className="min-h-11 px-2 py-2 text-sm font-medium text-marca hover:underline"
                  >
                    ver mais opções
                  </button>
                )}
              </div>
            )}

            {/* dica de autoatendimento — nunca impede de abrir o chamado */}
            {ajudaAberta?.ajuda && (
              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="font-semibold text-blue-900">ℹ️ {ajudaAberta.ajuda.titulo}</p>
                <p className="mt-1 text-sm text-blue-900">{ajudaAberta.ajuda.texto}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      recomeçar();
                      toast("Que bom! Se voltar a acontecer, é só abrir o chamado.");
                    }}
                    className="min-h-11 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
                  >
                    Resolvi, obrigado
                  </button>
                  <button
                    type="button"
                    onClick={() => setAjudaAberta(null)}
                    className="min-h-11 rounded-lg border border-gray-300 bg-superficie px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Não resolveu, abrir chamado
                  </button>
                </div>
              </div>
            )}

            {ehPublicacao && (
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="titulo-pub" className="mb-1 block font-medium">
                    Título como deve aparecer no site
                  </label>
                  <input
                    id="titulo-pub"
                    value={tituloPub}
                    onChange={(e) => setTituloPub(e.target.value)}
                    maxLength={120}
                    placeholder="Ex.: Edital nº 004/2026 — Chamamento público"
                    className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                </div>
                <div>
                  <label htmlFor="prazo-pub" className="mb-1 block font-medium">
                    Tem prazo para publicar? <span className="text-gray-500">(opcional)</span>
                  </label>
                  <input
                    id="prazo-pub"
                    type="date"
                    value={prazoPub}
                    onChange={(e) => setPrazoPub(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200 sm:w-auto"
                  />
                </div>
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Não esqueça de anexar o arquivo abaixo — sem ele a publicação não sai.
                </p>
              </div>
            )}

            <label htmlFor="relato" className="mt-3 mb-1 block font-medium">
              {ehPublicacao ? (
                <>
                  Alguma observação? <span className="text-gray-500">(opcional)</span>
                </>
              ) : (
                "Conte como contaria a um colega"
              )}
            </label>
            <textarea
              id="relato"
              ref={relatoRef}
              // enquanto o ditado reconhece, o trecho provisório aparece junto
              // do texto já digitado — a pessoa vê a frase se formando
              value={parcial ? (relato ? `${relato} ${parcial}` : parcial) : relato}
              onChange={(e) => {
                setParcial("");
                setRelato(e.target.value);
                setTextoAuto(""); // a partir daqui o texto é da pessoa
              }}
              rows={ehPublicacao ? 2 : 4}
              maxLength={5000}
              placeholder={
                ehPublicacao
                  ? "Ex.: publicar junto com o anexo do edital anterior."
                  : "Ex.: A impressora não puxa o papel desde ontem."
              }
              className={`mt-2 w-full rounded-lg border px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 ${
                ouvindoVoz ? "border-red-400 ring-2 ring-red-100" : "border-gray-300 focus:border-brand-600"
              }`}
            />

            <input ref={cameraRef} type="file" accept={CAMERA_ACCEPT} capture="environment" hidden onChange={onEscolherArquivos} />
            <input ref={galeriaRef} type="file" accept={ANEXO_ACCEPT} multiple hidden onChange={onEscolherArquivos} />
            {/* três atalhos do mesmo tamanho, lado a lado até no celular
                estreito: rótulo de uma palavra e o desenho carregando o
                significado */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={anexos.length >= ANEXO_MAX_QTD || otimizando}
                onClick={() => cameraRef.current?.click()}
                className={ATALHO}
              >
                <span className="text-2xl leading-none" aria-hidden="true">📷</span>
                <span>Foto</span>
              </button>
              <button
                type="button"
                disabled={anexos.length >= ANEXO_MAX_QTD || otimizando}
                onClick={() => galeriaRef.current?.click()}
                className={ATALHO}
              >
                <span className="text-2xl leading-none" aria-hidden="true">📎</span>
                <span>Anexo</span>
              </button>
              <DitadoVoz
                aoTranscrever={(t) => {
                  setRelato((r) => (r ? `${r} ${t}` : t));
                  setTextoAuto(""); // ditado é a pessoa falando: texto dela
                }}
                aoParcial={setParcial}
                aoMudarEstado={setOuvindoVoz}
              />
            </div>
            <p aria-live="polite" className="mt-1.5 text-xs text-gray-500">
              {ouvindoVoz
                ? "🔴 Ouvindo… pode falar normalmente. O texto aparece na caixa acima."
                : ehPublicacao
                  ? "Anexe aqui o arquivo que deve ir para o site (PDF ou imagem)."
                  : "Uma foto costuma explicar melhor que o texto."}
            </p>
            {otimizando && <p className="mt-1 text-sm text-gray-600">Otimizando a foto…</p>}

            {anexos.length > 0 && (
              <ul className="mt-2 space-y-1">
                {anexos.map((arquivo) => (
                  <li
                    key={`${arquivo.name}-${arquivo.size}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
                  >
                    <span className="truncate">
                      📎 {arquivo.name}{" "}
                      <span className="text-gray-500">({(arquivo.size / 1024 / 1024).toFixed(1)} MB)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setAnexos((a) => a.filter((f) => f !== arquivo))}
                      aria-label={`Remover ${arquivo.name}`}
                      className="min-h-9 shrink-0 rounded px-2 py-1 font-medium text-perigo hover:bg-red-50"
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* ---------------- passo 3: urgência ---------------- */}
        {passo === 3 && (
          <>
            <h3 className="mt-2 text-lg font-bold">Qual é a urgência?</h3>
            <p className="mt-1 text-sm text-gray-600">Isso ajuda a equipe a priorizar o dia.</p>
            <div className="mt-3 flex flex-col gap-2">
              {URGENCIA_OPCOES.map((o) => (
                <label
                  key={o.value}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-gray-300 p-3 has-checked:border-brand-600 has-checked:bg-brand-50"
                >
                  <input
                    type="radio"
                    name="urgencia"
                    value={o.value}
                    checked={urgencia === o.value}
                    onChange={() => setUrgencia(o.value)}
                    className="mt-1 size-4 accent-brand-600"
                  />
                  <span>
                    <span className="block font-medium">{o.label}</span>
                    <span className="block text-sm text-gray-600">{o.ajuda}</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        {/* ---------------- passo 4: revisão ---------------- */}
        {passo === 4 && (
          <>
            <h3 className="mt-2 text-lg font-bold">Confira antes de enviar</h3>
            <dl className="mt-3 divide-y divide-gray-200">
              <div className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <dt className="text-sm text-gray-500">Assunto</dt>
                  {editandoAssunto ? (
                    <input
                      autoFocus
                      value={assuntoFinal()}
                      onChange={(e) => setAssunto(e.target.value)}
                      onBlur={() => setEditandoAssunto(false)}
                      maxLength={120}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                  ) : (
                    <dd className="font-medium">{assuntoFinal()}</dd>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAssunto(assuntoFinal());
                    setEditandoAssunto(true);
                  }}
                  className="min-h-11 shrink-0 px-1 text-sm font-medium text-marca hover:underline"
                >
                  Alterar
                </button>
              </div>

              <div className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <dt className="text-sm text-gray-500">Tipo</dt>
                  <dd className="font-medium">
                    {categoria?.icone} {categoria?.titulo}
                    {atalho && <span className="text-gray-600"> · {atalho.rotulo}</span>}
                  </dd>
                </div>
                <button type="button" onClick={() => irPara(1)} className="min-h-11 shrink-0 px-1 text-sm font-medium text-marca hover:underline">
                  Alterar
                </button>
              </div>

              <div className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <dt className="text-sm text-gray-500">
                    {ehPublicacao ? "O que vai ser publicado" : "O que está acontecendo"}
                  </dt>
                  <dd className="whitespace-pre-line text-gray-800">{relatoFinal()}</dd>
                  {anexos.length > 0 && (
                    <dd className="mt-1 text-sm text-gray-600">
                      📎 {anexos.length} {anexos.length === 1 ? "arquivo" : "arquivos"}
                    </dd>
                  )}
                </div>
                <button type="button" onClick={() => irPara(2)} className="min-h-11 shrink-0 px-1 text-sm font-medium text-marca hover:underline">
                  Alterar
                </button>
              </div>

              <div className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <dt className="text-sm text-gray-500">Urgência</dt>
                  <dd className="font-medium">
                    {URGENCIA_OPCOES.find((o) => o.value === urgencia)?.label}
                  </dd>
                </div>
                <button type="button" onClick={() => irPara(3)} className="min-h-11 shrink-0 px-1 text-sm font-medium text-marca hover:underline">
                  Alterar
                </button>
              </div>
            </dl>
          </>
        )}

        {erro && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-perigo">
            {erro}
          </p>
        )}
      </div>

      {/* navegação */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => irPara(passo - 1)} className={botaoSec}>
          ← Voltar
        </button>
        {passo < TOTAL_PASSOS ? (
          <button
            type="button"
            disabled={!podeAvancar || otimizando}
            onClick={() => irPara(passo + 1)}
            className={botaoPri}
          >
            Continuar →
          </button>
        ) : (
          <button type="button" disabled={enviando} onClick={enviar} className={botaoPri}>
            {enviando ? "Enviando..." : "Enviar chamado"}
          </button>
        )}
      </div>
      {passo === 2 && !podeAvancar && (
        <p className="mt-2 text-right text-sm text-gray-500">Escreva um pouco sobre o problema para continuar.</p>
      )}
    </div>
  );
}
