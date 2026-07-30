"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "@/components/Toast";
import { recortaQuadrado } from "@/lib/comprime-imagem";

/**
 * Envio da foto de perfil. O recorte quadrado e a redução acontecem aqui, no
 * navegador — assim uma foto de 5 MB do celular vira ~30 KB antes de subir.
 */
export default function FormFoto({ temFoto }: { temFoto: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const escolher = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  async function enviar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!arquivo) return;

    setOcupado(true);
    try {
      const quadrada = await recortaQuadrado(arquivo);
      if (!quadrada) {
        toast("Não consegui usar essa imagem. Tente outra.", "erro");
        return;
      }
      setPrevia(URL.createObjectURL(quadrada));

      const form = new FormData();
      form.append("foto", quadrada, quadrada.name);
      const res = await fetch("/api/perfil/foto", { method: "POST", body: form });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setPrevia(null);
        toast(data?.error ?? "Não foi possível salvar a foto.", "erro");
        return;
      }
      toast("Foto atualizada!");
      router.refresh();
    } catch {
      setPrevia(null);
      toast("Falha ao enviar a foto.", "erro");
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    setOcupado(true);
    try {
      await fetch("/api/perfil/foto", { method: "DELETE" });
      setPrevia(null);
      toast("Foto removida.");
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mt-5">
      {previa && (
        <p className="mb-3 flex items-center gap-3 text-sm text-gray-600">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previa} alt="" className="size-12 rounded-full object-cover" />
          Enviando…
        </p>
      )}

      <input ref={escolher} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={enviar} />
      <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="user" hidden onChange={enviar} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => camera.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-brand-600 hover:text-marca disabled:opacity-60"
        >
          📷 Tirar foto
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => escolher.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-brand-600 hover:text-marca disabled:opacity-60"
        >
          🖼️ Escolher da galeria
        </button>
        {temFoto && (
          <button
            type="button"
            disabled={ocupado}
            onClick={remover}
            className="inline-flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm font-medium text-perigo hover:bg-red-50 disabled:opacity-60"
          >
            Remover foto
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        A imagem é cortada em quadrado e reduzida no seu aparelho antes de subir.
      </p>
    </div>
  );
}
