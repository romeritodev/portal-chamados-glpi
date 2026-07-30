export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="h-9 w-full max-w-xl animate-pulse rounded bg-gray-200" />
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-gray-500">Consultando os chamados no GLPI...</p>
    </main>
  );
}
