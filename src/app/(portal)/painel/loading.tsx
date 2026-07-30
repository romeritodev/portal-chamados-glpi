export default function Loading() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="h-7 w-56 animate-pulse rounded bg-gray-200" />
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((c) => (
          <div key={c} className="rounded-2xl border border-gray-200 bg-gray-100/70 p-2.5">
            <div className="mb-2 h-4 w-28 animate-pulse rounded bg-gray-200" />
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-superficie/80" />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-gray-500">Montando o painel...</p>
    </main>
  );
}
