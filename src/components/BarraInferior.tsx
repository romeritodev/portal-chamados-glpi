"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Barra de abas inferior no celular (roadmap Fase B). Some no desktop, onde
 * os links do cabeçalho aparecem.
 *
 * Não existe aba "Início": a tela inicial É a de abrir chamado, então um
 * botão "Início" e outro "Abrir" levavam ao mesmo lugar. Para o servidor
 * comum o portal tem duas coisas — abrir um chamado e acompanhar os seus —
 * e com menos botões cada alvo fica maior, que é o que o dedo precisa.
 *
 * Nada aqui sobressai da barra: um botão projetado para cima era coberto
 * pelo convite de instalação do aplicativo e roubava o toque.
 */
export default function BarraInferior({
  mostrarRelatorios = false,
  mostrarPainel = false,
}: {
  mostrarRelatorios?: boolean;
  mostrarPainel?: boolean;
}) {
  const pathname = usePathname();
  const naHome = pathname === "/";

  const item = (ativo: boolean) =>
    `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-semibold ${
      ativo ? "bg-brand-50 text-marca" : "text-gray-600"
    }`;

  return (
    <nav
      aria-label="Navegação"
      className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-gray-200 bg-superficie px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_16px_rgba(16,24,40,0.07)] sm:hidden print:hidden"
    >
      <Link
        href="/"
        aria-current={naHome ? "page" : undefined}
        onClick={(e) => {
          // já estamos na tela: navegar não faria nada e o formulário ficaria
          // no passo em que estava, parecendo travado. Recomeça do zero.
          if (naHome) {
            e.preventDefault();
            window.dispatchEvent(new Event("portal-novo-chamado"));
          }
        }}
        className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl bg-brand-600 px-1 text-[11px] font-bold text-white shadow-sm"
      >
        <span aria-hidden className="text-lg leading-none">
          ＋
        </span>
        Abrir
      </Link>

      <Link href="/chamados" className={item(pathname.startsWith("/chamados"))}>
        <span aria-hidden className="text-lg leading-none">
          📋
        </span>
        Chamados
      </Link>

      {mostrarPainel && (
        <Link href="/painel" className={item(pathname.startsWith("/painel"))}>
          <span aria-hidden className="text-lg leading-none">
            🗂️
          </span>
          Painel
        </Link>
      )}

      {mostrarRelatorios && (
        <Link href="/relatorios" className={item(pathname.startsWith("/relatorios"))}>
          <span aria-hidden className="text-lg leading-none">
            📊
          </span>
          Relatórios
        </Link>
      )}
    </nav>
  );
}
