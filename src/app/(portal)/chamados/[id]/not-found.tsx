import Link from "next/link";

export default function ChamadoNaoEncontrado() {
  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-10 text-center">
        <p aria-hidden className="text-5xl">🔍</p>
        <h2 className="mt-4 text-xl font-bold">Chamado não encontrado</h2>
        <p className="mt-2 text-gray-600">
          Este chamado não existe ou você não tem acesso a ele.
        </p>
        <Link
          href="/chamados"
          className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
        >
          Voltar para meus chamados
        </Link>
      </main>
    </>
  );
}
