/**
 * Compressão de imagem no cliente (roadmap Fase A): foto de celular de ~5 MB
 * vira ~200-400 KB antes do upload — protege a rede das recepções e o CT.
 * Zero libs: canvas + toBlob. Qualquer falha devolve o arquivo original
 * (HEIC sem suporte no navegador, imagem corrompida etc.).
 */

const LADO_MAX = 1600; // preserva texto de mensagens de erro na tela
const QUALIDADE = 0.75;
const LIMIAR_BYTES = 400 * 1024; // abaixo disso não vale o retrabalho

/**
 * Recorta a imagem num quadrado central e reduz — para a foto de perfil.
 * Feito no navegador: o servidor só valida e grava.
 */
export async function recortaQuadrado(arquivo: File, lado = 256): Promise<File | null> {
  if (!arquivo.type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const corte = Math.min(bitmap.width, bitmap.height);
    const x = (bitmap.width - corte) / 2;
    const y = (bitmap.height - corte) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, lado, lado);
    ctx.drawImage(bitmap, x, y, corte, corte, 0, 0, lado, lado);
    bitmap.close();

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return null;
    return new File([blob], "perfil.jpg", { type: "image/jpeg" });
  } catch {
    return null;
  }
}

export async function comprimeImagem(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith("image/") || arquivo.type === "image/gif") return arquivo;
  if (arquivo.size <= LIMIAR_BYTES) return arquivo;

  try {
    // from-image aplica a orientação EXIF (foto de celular não sai deitada);
    // navegador antigo que rejeite a opção cai no catch e envia o original
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    // JPEG não tem transparência — sem isso, PNG transparente vira fundo preto
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALIDADE),
    );
    if (!blob || blob.size >= arquivo.size) return arquivo; // não melhorou

    const nome = arquivo.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg", lastModified: arquivo.lastModified });
  } catch {
    return arquivo;
  }
}
