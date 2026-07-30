import Avatar from "@/components/Avatar";
import { temAvatar } from "@/lib/avatares";
import { requireSession } from "@/lib/session";
import FormFoto from "./FormFoto";
import FormSenha from "./FormSenha";

export const dynamic = "force-dynamic";

/**
 * Perfil do usuário: por enquanto só a foto, que aparece na conversa dos
 * chamados. Nome e setor vêm do GLPI e são editados lá.
 */
export default async function PerfilPage() {
  const session = await requireSession();
  const nome = session.user?.friendlyName || session.user?.login || "";
  const userId = session.user?.id;
  const jaTem = userId ? await temAvatar(userId) : false;

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <h2 className="text-xl font-bold">Meu perfil</h2>
      <p className="mt-1 text-gray-600">
        Sua foto aparece nas conversas dos chamados, para a equipe saber com quem está falando.
      </p>

      <section className="mt-5 rounded-2xl bg-superficie p-5 shadow">
        <div className="flex items-center gap-4">
          <Avatar userId={userId} nome={nome} temFoto={jaTem} tamanho={72} />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{nome}</p>
            <p className="text-sm text-gray-600">
              {session.user?.profileInterface === "central" ? "Equipe de TI" : "Servidor"}
            </p>
          </div>
        </div>

        <FormFoto temFoto={jaTem} />
      </section>

      <FormSenha />

      <p className="mt-4 text-center text-xs text-gray-500">
        Para mudar seu nome ou setor, fale com a equipe de TI — esses dados vêm do sistema de
        chamados. Se você esquecer a senha, a equipe também redefine para você.
      </p>
    </main>
  );
}
