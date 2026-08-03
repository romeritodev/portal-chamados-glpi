import { redirect } from "next/navigation";
import { nomeInstituicao } from "@/lib/instituicao";
import { getSession, isLoggedIn } from "@/lib/session";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expirou?: string }>;
}) {
  const { expirou } = await searchParams;
  const session = await getSession();
  /**
   * Com `expirou=1` esta tela NUNCA devolve para dentro do portal, mesmo que
   * ainda exista cookie de sessão.
   *
   * É a trava contra o laço: se por qualquer motivo o cookie sobreviver ao
   * middleware, sem isto o /login manda para "/", que manda para o /login, e
   * o navegador desiste com "redirecionamento em excesso" — nenhuma tela
   * carrega. Aqui o pior caso vira apenas "faça login de novo".
   */
  if (expirou !== "1" && isLoggedIn(session)) {
    redirect("/");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-brand-800 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <p className="text-sm uppercase tracking-wide text-brand-200">{nomeInstituicao()}</p>
          <h1 className="text-2xl font-bold">Suporte de TI</h1>
          <p className="mt-1 text-brand-100">Abertura e acompanhamento de chamados</p>
        </div>
        {/* dizer POR QUE a pessoa voltou para cá: sem isso, quem estava
            trabalhando acha que o sistema quebrou */}
        {expirou === "1" && (
          <p className="mb-3 rounded-lg bg-amber-100 px-4 py-3 text-center text-sm font-medium text-amber-900">
            Sua sessão expirou por inatividade. Entre novamente para continuar.
          </p>
        )}
        <LoginForm />
      </div>
    </main>
  );
}
