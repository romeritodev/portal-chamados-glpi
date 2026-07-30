export default function Loading() {
  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="h-7 w-44 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-200" />
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-gray-500">Carregando seus chamados...</p>
      </main>
    </>
  );
}
