"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/Toast";

/**
 * Liga/desliga os avisos no celular (roadmap Fase C).
 *
 * Usa a "dupla permissão": primeiro o portal pergunta com as próprias
 * palavras; só quem aceita vê a caixa do navegador. Isso evita queimar a
 * permissão — uma vez bloqueada, o navegador não pergunta de novo.
 */

type Estado = "carregando" | "indisponivel" | "desligado" | "ligado" | "bloqueado" | "precisaApp";

/** base64url (formato da chave VAPID) → ArrayBuffer, que é o que o
 *  pushManager.subscribe aceita. */
function chaveParaBytes(base64: string): ArrayBuffer {
  const preenchido = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bruto = window.atob(preenchido);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes.buffer;
}

function ehIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function instalado(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function AvisosCelular({ destaque = false }: { destaque?: boolean }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);

  const avaliar = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      // no iPhone o push só existe com o app instalado na tela inicial
      setEstado(ehIOS() && !instalado() ? "precisaApp" : "indisponivel");
      return;
    }
    try {
      const res = await fetch("/api/push", { cache: "no-store" });
      const dados = (await res.json()) as { ligado?: boolean };
      if (!dados.ligado) {
        setEstado("indisponivel");
        return;
      }
    } catch {
      setEstado("indisponivel");
      return;
    }
    if (Notification.permission === "denied") {
      setEstado("bloqueado");
      return;
    }
    const registro = await navigator.serviceWorker.ready;
    const inscricao = await registro.pushManager.getSubscription();
    setEstado(inscricao ? "ligado" : "desligado");
  }, []);

  useEffect(() => {
    void avaliar();
  }, [avaliar]);

  async function ligar() {
    setOcupado(true);
    try {
      // 1) a caixa do navegador — só chega aqui quem já disse sim ao portal
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        return;
      }
      // 2) chave pública do servidor
      const res = await fetch("/api/push", { cache: "no-store" });
      const { chave } = (await res.json()) as { chave?: string };
      if (!chave) {
        toast("Avisos indisponíveis no momento.", "erro");
        return;
      }
      // 3) inscrição neste aparelho
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(chave),
      });
      const salvar = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inscricao.toJSON()),
      });
      if (!salvar.ok) {
        await inscricao.unsubscribe().catch(() => undefined);
        toast("Não foi possível ativar os avisos.", "erro");
        return;
      }
      setEstado("ligado");
      toast("Pronto! Vamos avisar quando houver novidade. 🔔");
    } catch {
      toast("Não foi possível ativar os avisos neste aparelho.", "erro");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    try {
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.getSubscription();
      if (inscricao) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: inscricao.endpoint }),
        }).catch(() => undefined);
        await inscricao.unsubscribe().catch(() => undefined);
      }
      setEstado("desligado");
      toast("Avisos desligados neste aparelho.");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "carregando" || estado === "indisponivel") return null;

  if (estado === "precisaApp") {
    if (!destaque) return null;
    return (
      <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
        📲 Quer ser avisado no celular quando o técnico responder? Primeiro adicione o
        Suporte de TI à tela inicial (botão <strong>Compartilhar</strong> → <strong>Adicionar
        à Tela de Início</strong>); depois volte aqui.
      </p>
    );
  }

  if (estado === "bloqueado") {
    if (!destaque) return null;
    return (
      <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        🔕 Os avisos estão bloqueados para este site no seu navegador. Para reativar, abra
        as configurações do site (cadeado ao lado do endereço) e permita notificações.
      </p>
    );
  }

  if (estado === "ligado") {
    return (
      <p className={`flex flex-wrap items-center gap-2 text-sm ${destaque ? "mt-4 rounded-xl bg-green-50 px-4 py-3 text-green-900" : "mt-3 text-gray-600"}`}>
        🔔 Avisos ligados neste aparelho.
        <button
          type="button"
          onClick={desligar}
          disabled={ocupado}
          className="min-h-9 rounded px-1 font-medium underline hover:no-underline disabled:opacity-60"
        >
          Desligar
        </button>
      </p>
    );
  }

  // desligado
  return destaque ? (
    <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
      <p className="font-semibold text-brand-900">Quer saber assim que a TI responder?</p>
      <p className="mt-0.5 text-sm text-brand-800">
        A gente avisa no seu celular — só quando o técnico responder ou o chamado for resolvido.
      </p>
      <button
        type="button"
        onClick={ligar}
        disabled={ocupado}
        className="mt-3 min-h-11 rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {ocupado ? "Ativando..." : "🔔 Quero ser avisado"}
      </button>
    </div>
  ) : (
    <p className="mt-3 text-sm text-gray-600">
      🔔 Quer ser avisado no celular quando a TI responder?{" "}
      <button
        type="button"
        onClick={ligar}
        disabled={ocupado}
        className="min-h-9 rounded px-1 font-medium text-marca underline hover:no-underline disabled:opacity-60"
      >
        Ativar avisos
      </button>
    </p>
  );
}
