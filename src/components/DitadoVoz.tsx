"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ditado por voz (roadmap Fase B) — para quem tem dificuldade de digitar.
 *
 * Usa o reconhecimento de fala do próprio navegador: nada é enviado a
 * serviços externos por nossa conta e não há custo. O botão só existe onde o
 * recurso existe; onde não existe, a tela segue igual, sem aviso de erro.
 *
 * Enquanto a pessoa fala, duas coisas acontecem ao mesmo tempo:
 *   1. o texto vai aparecendo na caixa (trecho provisório) e é fixado quando
 *      o navegador conclui a frase;
 *   2. as barrinhas do botão sobem e descem com o volume REAL do microfone.
 * A barra que se move sozinha seria decoração; medindo o microfone, quem
 * fala e não vê nada acontecer sabe na hora que o som não está chegando.
 *
 * DUAS RESSALVAS DO WEBKIT (iPhone, iPad e Safari), aprendidas na prática:
 *   - abrir um segundo fluxo de áudio (getUserMedia, que alimenta o medidor)
 *     toma a sessão de áudio do reconhecimento: a tela dizia "ouvindo" e
 *     nenhum texto chegava. Lá o medidor não sobe — fica um ponto pulsando,
 *     que avisa "estou gravando" sem fingir que mede o volume;
 *   - `continuous` não vale: o motor encerra ao fim de cada frase. Religamos
 *     sozinhos até a pessoa apertar Parar, para a fala corrida não morrer no
 *     primeiro ponto final.
 */

interface ResultadoFala {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

interface Reconhecimento {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: ResultadoFala) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type Construtor = new () => Reconhecimento;

function construtor(): Construtor | null {
  if (typeof window === "undefined") return null;
  const janela = window as unknown as {
    SpeechRecognition?: Construtor;
    webkitSpeechRecognition?: Construtor;
  };
  return janela.SpeechRecognition ?? janela.webkitSpeechRecognition ?? null;
}

/** altura relativa de cada barrinha, para o medidor não ficar retangular */
const BARRAS = [0.5, 0.8, 1, 0.72, 0.45];

/** No iOS todo navegador é WebKit, então o user agent é a checagem que resta. */
function ehWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  return iOS || safari;
}

/** teto de religadas automáticas, para o microfone não ficar aberto à toa */
const MAX_RELIGADAS = 40;

export default function DitadoVoz({
  aoTranscrever,
  aoParcial,
  aoMudarEstado,
  variante = "cartao",
}: {
  /** trecho já confirmado pelo navegador — deve ser somado ao texto */
  aoTranscrever: (texto: string) => void;
  /** trecho ainda sendo reconhecido — some quando vira definitivo */
  aoParcial?: (texto: string) => void;
  aoMudarEstado?: (ouvindo: boolean) => void;
  /**
   * "cartao": atalho do tamanho dos vizinhos, na abertura do chamado.
   * "discreto": botão redondo ao lado do enviar, na conversa — o ditado é
   * uma alternativa ao teclado, não um recurso que precise disputar espaço.
   */
  variante?: "cartao" | "discreto";
}) {
  const [existe, setExiste] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [medindo, setMedindo] = useState(false);
  const [nivel, setNivel] = useState(0);
  const motor = useRef<Reconhecimento | null>(null);
  const audio = useRef<{ ctx: AudioContext; stream: MediaStream } | null>(null);
  const quadro = useRef<number>(0);
  const pediuParar = useRef(false);
  const religadas = useRef(0);
  const religar = useRef<number>(0);
  const desistir = useRef<number>(0);
  const webkit = useRef(false);
  /** último trecho provisório — o que se perderia ao parar no meio da frase */
  const provisorioRef = useRef("");
  const fechado = useRef(true);

  useEffect(() => {
    setExiste(construtor() !== null);
    webkit.current = ehWebKit();
    return () => {
      pediuParar.current = true;
      fechado.current = true;
      if (religar.current) clearTimeout(religar.current);
      if (desistir.current) clearTimeout(desistir.current);
      motor.current?.stop();
      pararMedidor();
    };
  }, []);

  function pararMedidor() {
    if (quadro.current) cancelAnimationFrame(quadro.current);
    quadro.current = 0;
    const a = audio.current;
    if (a) {
      a.stream.getTracks().forEach((t) => t.stop());
      void a.ctx.close();
      audio.current = null;
    }
    setMedindo(false);
    setNivel(0);
  }

  /** Mede o volume do microfone para dar retorno visual honesto. */
  async function ligarMedidor() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Contexto =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Contexto();
      const analisador = ctx.createAnalyser();
      analisador.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analisador);
      audio.current = { ctx, stream };
      setMedindo(true);

      const dados = new Uint8Array(analisador.frequencyBinCount);
      const laco = () => {
        analisador.getByteTimeDomainData(dados);
        let soma = 0;
        for (let i = 0; i < dados.length; i++) {
          const desvio = (dados[i]! - 128) / 128;
          soma += desvio * desvio;
        }
        const rms = Math.sqrt(soma / dados.length);
        // suaviza para a barra não tremer a cada quadro
        setNivel((atual) => atual * 0.6 + Math.min(1, rms * 5) * 0.4);
        quadro.current = requestAnimationFrame(laco);
      };
      quadro.current = requestAnimationFrame(laco);
    } catch {
      // sem permissão para um segundo fluxo de áudio: o ditado continua
      // funcionando, só sem medidor — o texto aparecendo já é o retorno
    }
  }

  /** devolve o botão ao normal — visual, sem mexer no texto */
  function apagarSinais() {
    setOuvindo(false);
    aoMudarEstado?.(false);
    pararMedidor();
  }

  /**
   * Fecha o ciclo do ditado. O trecho que ainda estava provisório vira texto
   * de verdade: quem falou e apertou Parar na mesma hora disse aquilo — jogar
   * fora obrigava a esperar o motor "assinar" a frase antes de encostar no
   * botão, e ninguém adivinha esse tempo.
   */
  function fechar() {
    if (fechado.current) return;
    fechado.current = true;
    if (religar.current) clearTimeout(religar.current);
    if (desistir.current) clearTimeout(desistir.current);
    religar.current = 0;
    desistir.current = 0;

    const sobrou = provisorioRef.current.trim();
    provisorioRef.current = "";
    aoParcial?.("");
    if (sobrou) aoTranscrever(sobrou);
    apagarSinais();
  }

  function alternar() {
    if (ouvindo) {
      pediuParar.current = true;
      apagarSinais(); // o botão responde na hora…
      try {
        motor.current?.stop();
      } catch {
        /* já parado */
      }
      // …mas o texto espera um instante: parar faz o motor entregar a última
      // frase reconhecida. Se ela não vier, o provisório é fixado assim mesmo.
      desistir.current = window.setTimeout(fechar, 1200);
      return;
    }
    const Construtor = construtor();
    if (!Construtor) return;

    pediuParar.current = false;
    fechado.current = false;
    religadas.current = 0;
    provisorioRef.current = "";

    const r = new Construtor();
    r.lang = "pt-BR";
    // no WebKit `continuous` não sustenta a escuta; religamos no onend
    r.continuous = !webkit.current;
    r.interimResults = true; // o texto aparece enquanto a pessoa fala
    r.onresult = (e) => {
      // frase que chega depois do ciclo fechado já foi contabilizada
      if (fechado.current) return;
      let definitivo = "";
      let provisorio = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const trecho = e.results[i]?.[0]?.transcript ?? "";
        if (e.results[i]?.isFinal) definitivo += trecho;
        else provisorio += trecho;
      }
      if (definitivo.trim()) {
        provisorioRef.current = "";
        aoTranscrever(definitivo.trim());
        religadas.current = 0; // veio texto: a escuta está valendo a pena
      }
      provisorioRef.current = provisorio.trim();
      aoParcial?.(provisorio.trim());

      // a frase chegou depois do Parar: fecha já, sem esperar o prazo
      if (pediuParar.current && definitivo.trim()) fechar();
    };
    r.onerror = () => {
      pediuParar.current = true;
      fechar();
    };
    r.onend = () => {
      const podeReligar =
        !pediuParar.current && webkit.current && religadas.current < MAX_RELIGADAS;
      if (!podeReligar) {
        fechar();
        return;
      }
      religadas.current += 1;
      // no WebKit cada frase fecha o motor; o provisório desta rodada só
      // sobrevive se for fixado agora, antes de religar
      const sobrou = provisorioRef.current.trim();
      provisorioRef.current = "";
      aoParcial?.("");
      if (sobrou) aoTranscrever(sobrou);
      religar.current = window.setTimeout(() => {
        try {
          r.start();
        } catch {
          fechar();
        }
      }, 250);
    };
    motor.current = r;
    try {
      r.start();
      setOuvindo(true);
      aoMudarEstado?.(true);
      // o medidor abre um SEGUNDO fluxo de áudio; no WebKit isso rouba o
      // microfone do reconhecimento e nenhum texto chega. Lá, sem medidor.
      if (!webkit.current) void ligarMedidor();
    } catch {
      pediuParar.current = true;
      fechar();
    }
  }

  if (!existe) return null;

  const discreto = variante === "discreto";
  const altura = discreto ? "h-5" : "h-6";

  /** o que aparece no lugar do microfone enquanto grava */
  const sinal =
    ouvindo && medindo ? (
      <span className={`flex ${altura} items-end gap-[3px]`} aria-hidden="true">
        {BARRAS.map((proporcao, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-red-500 transition-[height] duration-75 ease-out"
            style={{ height: `${Math.max(18, Math.min(100, nivel * 130 * proporcao))}%` }}
          />
        ))}
      </span>
    ) : ouvindo ? (
      // sem medidor: um ponto pulsando diz "estou gravando" sem fingir
      // que está medindo o volume de quem fala
      <span className={`flex ${altura} items-center`} aria-hidden="true">
        <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
      </span>
    ) : (
      <span className={discreto ? "text-lg leading-none" : "text-2xl leading-none"} aria-hidden="true">
        🎤
      </span>
    );

  if (discreto) {
    return (
      <button
        type="button"
        onClick={alternar}
        aria-pressed={ouvindo}
        aria-label={ouvindo ? "Parar de gravar" : "Ditar por voz"}
        title={ouvindo ? "Parar de gravar" : "Ditar por voz"}
        className={`flex min-h-11 w-11 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
          ouvindo
            ? "border-red-500 bg-red-50"
            : "border-gray-300 bg-superficie text-gray-600 hover:border-brand-600 hover:bg-gray-50"
        }`}
      >
        {sinal}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={ouvindo}
      className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-semibold shadow-sm transition active:scale-[0.98] ${
        ouvindo
          ? "border-red-500 bg-red-50 text-perigo"
          : "border-gray-300 bg-superficie text-gray-700 hover:border-brand-600 hover:bg-gray-50 hover:text-marca"
      }`}
    >
      {sinal}
      <span>{ouvindo ? "Parar" : "Voz"}</span>
    </button>
  );
}
