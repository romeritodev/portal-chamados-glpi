import AppInstalavel from "@/components/AppInstalavel";
import BarraInferior from "@/components/BarraInferior";
import Header from "@/components/Header";
import Toaster from "@/components/Toast";
import Vibracao from "@/components/Vibracao";
import { temAvatar } from "@/lib/avatares";
import { lerConfig } from "@/lib/config-portal";
import { nomeInstituicao } from "@/lib/instituicao";
import { getSession } from "@/lib/session";

/**
 * Layout das páginas autenticadas: cabeçalho, barra de abas do celular e
 * toaster vivem aqui (uma única vez), então persistem entre as navegações e
 * durante os estados de carregamento.
 *
 * Os recursos ligados/desligados vêm da tela ⚙️ (com o .env como padrão
 * inicial) — ver lib/config-portal.ts.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [session, config] = await Promise.all([getSession(), lerConfig()]);
  const central = session.user?.profileInterface === "central";
  const painel = central && config.painel;
  const userId = session.user?.id;
  const temFoto = userId ? await temAvatar(userId) : false;

  return (
    <>
      <Header
        instituicao={nomeInstituicao()}
        mostrarRelatorios={central}
        mostrarPainel={painel}
        mostrarConfiguracoes={central}
        mostrarAvisos={config.avisos}
        usuario={{
          id: userId,
          nome: session.user?.friendlyName || session.user?.login || "",
          temFoto,
        }}
      />
      {/* espaço para a barra inferior não cobrir o fim do conteúdo no celular */}
      <div className="pb-28 sm:pb-0">{children}</div>
      <BarraInferior mostrarRelatorios={central} mostrarPainel={painel} />
      <AppInstalavel />
      <Toaster />
      <Vibracao />
    </>
  );
}
