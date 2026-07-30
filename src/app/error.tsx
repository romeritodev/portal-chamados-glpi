"use client";

// Tela de erro amigável (substitui o "Application error" padrão do Next).
// Aparece quando uma página server-side falha — ex.: GLPI fora do ar.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <p aria-hidden className="text-5xl">😕</p>
      <h2 className="mt-4 text-xl font-bold">Algo deu errado</h2>
      <p className="mt-2 text-gray-600">
        Não foi possível carregar as informações do sistema de chamados.
        <br />
        Tente novamente em instantes. Se continuar, avise a equipe de TI.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
        >
          Tentar de novo
        </button>
        <a
          href="/"
          className="rounded-lg border border-gray-300 bg-superficie px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
        >
          Voltar ao início
        </a>
      </div>
    </main>
  );
}
