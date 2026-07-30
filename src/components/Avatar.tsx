import { corDoNome, iniciaisDe } from "@/lib/iniciais";

/**
 * Bolinha de identificação: a foto do usuário, ou as iniciais num círculo
 * colorido quando ele ainda não subiu nenhuma. A cor é sempre a mesma para a
 * mesma pessoa, então dá para reconhecer quem falou mesmo sem foto.
 */
export default function Avatar({
  userId,
  nome,
  temFoto = false,
  tamanho = 36,
}: {
  userId?: number;
  nome?: string;
  temFoto?: boolean;
  /** lado do círculo, em pixels */
  tamanho?: number;
}) {
  const rotulo = nome?.trim() || "Equipe de TI";
  const estilo = { width: tamanho, height: tamanho };

  if (temFoto && userId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/perfil/foto/${userId}`}
        alt={rotulo}
        title={rotulo}
        width={tamanho}
        height={tamanho}
        style={estilo}
        className="shrink-0 rounded-full border border-gray-200 object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      title={rotulo}
      style={{ ...estilo, backgroundColor: corDoNome(rotulo), fontSize: tamanho * 0.36 }}
      className="grid shrink-0 place-items-center rounded-full font-bold leading-none text-white"
    >
      {iniciaisDe(rotulo)}
    </span>
  );
}
