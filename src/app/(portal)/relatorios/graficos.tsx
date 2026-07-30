import type { ContagemItem, StatusResumo } from "@/lib/relatorios";

/**
 * Gráficos em SVG puro (server-rendered): imprimem no PDF do navegador
 * (fundos CSS não imprimem por padrão) e não pesam no bundle.
 * Especificações do guia dataviz: marcas finas, pontas 4px, gaps de 2px,
 * rótulos de valor em tinta de texto (nunca na cor da série).
 */

const AZUL = "#2a78d6"; // série única (magnitude) — slot 1 da paleta validada
const TINTA = "#374151";
const TINTA_FRACA = "#6b7280";

export function BarrasHorizontais({ dados }: { dados: ContagemItem[] }) {
  if (dados.length === 0) return <Vazio />;
  const max = Math.max(...dados.map((d) => d.valor));
  const altura = dados.length * 30;
  const larguraRotulo = 170;
  const larguraValor = 40;
  const larguraBarra = 600 - larguraRotulo - larguraValor;

  return (
    <svg viewBox={`0 0 600 ${altura}`} className="w-full" role="img" aria-label="Gráfico de barras">
      {dados.map((d, i) => {
        const y = i * 30;
        const w = max > 0 ? Math.max((d.valor / max) * larguraBarra, 2) : 2;
        return (
          <g key={d.rotulo}>
            <title>{`${d.rotulo}: ${d.valor}`}</title>
            <text
              x={larguraRotulo - 8}
              y={y + 19}
              textAnchor="end"
              fontSize="12"
              fill={TINTA}
            >
              {d.rotulo.length > 24 ? `${d.rotulo.slice(0, 23)}…` : d.rotulo}
            </text>
            <rect
              x={larguraRotulo}
              y={y + 8}
              width={w}
              height={14}
              rx="4"
              fill={AZUL}
            />
            <text x={larguraRotulo + w + 6} y={y + 19} fontSize="12" fontWeight="600" fill={TINTA}>
              {d.valor}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Colunas({ dados }: { dados: ContagemItem[] }) {
  if (dados.length === 0) return <Vazio />;
  const max = Math.max(...dados.map((d) => d.valor), 1);
  const larguraCol = 600 / dados.length;
  const larguraBarra = Math.min(larguraCol - 8, 40);
  const alturaPlot = 150;

  return (
    <svg viewBox="0 0 600 190" className="w-full" role="img" aria-label="Gráfico de colunas por mês">
      {dados.map((d, i) => {
        const h = Math.max((d.valor / max) * alturaPlot, d.valor > 0 ? 3 : 1);
        const x = i * larguraCol + (larguraCol - larguraBarra) / 2;
        const y = 20 + (alturaPlot - h);
        return (
          <g key={d.rotulo}>
            <title>{`${d.rotulo}: ${d.valor}`}</title>
            {d.valor > 0 && (
              <text x={x + larguraBarra / 2} y={y - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill={TINTA}>
                {d.valor}
              </text>
            )}
            <rect x={x} y={y} width={larguraBarra} height={h} rx="4" fill={d.valor > 0 ? AZUL : "#e5e7eb"} />
            <text x={x + larguraBarra / 2} y={186} textAnchor="middle" fontSize="10" fill={TINTA_FRACA}>
              {d.rotulo}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Rosca({ dados, total }: { dados: StatusResumo[]; total: number }) {
  if (total === 0) return <Vazio />;
  const raio = 60;
  const espessura = 26;
  const circ = 2 * Math.PI * raio;
  let acumulado = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0" role="img" aria-label="Distribuição por status">
        {dados.map((d) => {
          const frac = d.valor / total;
          // gap de 2px entre segmentos (spec de marcas)
          const len = Math.max(frac * circ - 2, 0.5);
          const offset = -acumulado * circ;
          acumulado += frac;
          return (
            <circle
              key={d.rotulo}
              cx="80"
              cy="80"
              r={raio}
              fill="none"
              stroke={d.cor}
              strokeWidth={espessura}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={offset}
              transform="rotate(-90 80 80)"
            >
              <title>{`${d.rotulo}: ${d.valor}`}</title>
            </circle>
          );
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="24" fontWeight="700" fill={TINTA}>
          {total}
        </text>
        <text x="80" y="94" textAnchor="middle" fontSize="11" fill={TINTA_FRACA}>
          total
        </text>
      </svg>
      <ul className="min-w-44 flex-1 space-y-1.5">
        {dados.map((d) => (
          <li key={d.rotulo} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span aria-hidden className="inline-block size-3 rounded-sm" style={{ backgroundColor: d.cor }} />
              {d.rotulo}
            </span>
            <span className="tabular-nums text-gray-600">
              {Math.round((d.valor / total) * 100)}% <strong className="text-gray-900">{d.valor}</strong>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Vazio() {
  return <p className="py-8 text-center text-sm text-gray-500">Sem dados no período.</p>;
}
