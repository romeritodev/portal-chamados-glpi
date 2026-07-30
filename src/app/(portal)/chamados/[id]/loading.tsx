export default function Loading() {
  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="h-5 w-52 animate-pulse rounded bg-gray-200" />
        <div className="mt-3 h-40 animate-pulse rounded-2xl bg-gray-200" />
        <div className="mt-6 h-6 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-3 h-24 animate-pulse rounded-2xl bg-gray-200" />
        <p className="mt-6 text-center text-sm text-gray-500">Carregando o chamado...</p>
      </main>
    </>
  );
}
