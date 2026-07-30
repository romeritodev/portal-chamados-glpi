import { redirect } from "next/navigation";
import { nomeInstituicao } from "@/lib/instituicao";
import { getSession, isLoggedIn } from "@/lib/session";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (isLoggedIn(session)) {
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
        <LoginForm />
      </div>
    </main>
  );
}
