"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Avatar from "./Avatar";
import BotaoTema from "./BotaoTema";
import SinoNotificacoes from "./SinoNotificacoes";

interface Usuario {
  id?: number;
  nome: string;
  temFoto: boolean;
}

/**
 * Cabeçalho institucional com navegação, avisos e botão sair.
 * Fica no layout do grupo (portal) — persiste entre navegações, sem "piscar".
 * No celular os links viram a barra de abas inferior (BarraInferior), então
 * aqui sobram apenas o logo, o sino e o sair. Oculto na impressão (PDF).
 */
export default function Header({
  instituicao,
  mostrarRelatorios = false,
  mostrarPainel = false,
  mostrarConfiguracoes = false,
  mostrarAvisos = true,
  usuario,
}: {
  /** nome vem do layout (servidor), porque aqui é componente de cliente */
  instituicao: string;
  mostrarRelatorios?: boolean;
  mostrarPainel?: boolean;
  mostrarConfiguracoes?: boolean;
  mostrarAvisos?: boolean;
  usuario?: Usuario;
}) {
  const pathname = usePathname();
  const active = pathname.startsWith("/chamados")
    ? "chamados"
    : pathname.startsWith("/painel")
      ? "painel"
      : pathname.startsWith("/relatorios")
        ? "relatorios"
        : pathname.startsWith("/configuracoes")
          ? "configuracoes"
          : pathname.startsWith("/perfil")
            ? "perfil"
            : "abrir";

  const tab = (isActive: boolean) =>
    `inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
      isActive ? "bg-brand-700 text-white" : "text-brand-100 hover:bg-brand-700/60 hover:text-white"
    }`;

  return (
    <header className="bg-brand-800 text-white shadow print:hidden">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-brand-200">{instituicao}</p>
          <h1 className="text-lg font-bold leading-tight">Suporte de TI</h1>
        </div>

        <nav className="flex items-center gap-1" aria-label="Navegação principal">
          {/* links completos só no desktop — no celular ficam na barra inferior */}
          <span className="hidden items-center gap-1 sm:flex">
            <Link href="/" className={tab(active === "abrir")}>
              Abrir chamado
            </Link>
            <Link href="/chamados" className={tab(active === "chamados")}>
              Meus chamados
            </Link>
            {mostrarPainel && (
              <Link href="/painel" className={tab(active === "painel")}>
                Painel
              </Link>
            )}
            {mostrarRelatorios && (
              <Link href="/relatorios" className={tab(active === "relatorios")}>
                Relatórios
              </Link>
            )}
          </span>

          {mostrarAvisos && <SinoNotificacoes />}

          <BotaoTema />

          {usuario && (
            <Link
              href="/perfil"
              aria-label="Meu perfil"
              title={`${usuario.nome} — meu perfil`}
              className={`inline-flex size-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                active === "perfil" ? "bg-brand-700" : "hover:bg-brand-700/60"
              }`}
            >
              <Avatar
                userId={usuario.id}
                nome={usuario.nome}
                temFoto={usuario.temFoto}
                tamanho={30}
              />
            </Link>
          )}

          {/* engrenagem: ícone (não aba) para caber também no celular */}
          {mostrarConfiguracoes && (
            <Link
              href="/configuracoes"
              aria-label="Configurações"
              title="Configurações"
              className={`inline-flex size-11 items-center justify-center rounded-lg text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                active === "configuracoes"
                  ? "bg-brand-700 text-white"
                  : "text-brand-100 hover:bg-brand-700/60 hover:text-white"
              }`}
            >
              ⚙️
            </Link>
          )}

          <form action="/api/logout" method="POST">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-brand-100 hover:bg-brand-700/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Sair
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
