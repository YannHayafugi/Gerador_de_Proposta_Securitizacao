/**
 * O pdf-parse (via pdfjs-dist) exige que `DOMMatrix` exista globalmente,
 * mesmo em Node.js — normalmente ele tenta carregar isso sozinho a partir
 * do @napi-rs/canvas, mas essa tentativa interna usa uma resolução de
 * `require` que não sobrevive ao empacotamento do Next.js em ambientes
 * serverless (ex.: Vercel), falhando silenciosamente e quebrando depois com
 * "ReferenceError: DOMMatrix is not defined". Para evitar depender dessa
 * lógica frágil, carregamos o @napi-rs/canvas nós mesmos, de forma direta e
 * rastreável pelo bundler, e definimos o global antes de usar o pdf-parse.
 */
async function garantirDomMatrixPolyfill() {
  if (typeof (globalThis as any).DOMMatrix !== "undefined") return;
  const { DOMMatrix } = await import("@napi-rs/canvas");
  (globalThis as any).DOMMatrix = DOMMatrix;
}

/**
 * Extrai o texto de um PDF localmente (no servidor), sem enviar o arquivo
 * binário para nenhuma API externa. O texto extraído é o que será usado
 * depois na chamada única à API do Claude.
 */
export async function extrairTextoPdf(arquivo: Buffer): Promise<string> {
  await garantirDomMatrixPolyfill();
  const { PDFParse } = await import("pdf-parse");

  const parser = new PDFParse({ data: arquivo });
  try {
    const resultado = await parser.getText();
    return resultado.text;
  } finally {
    await parser.destroy();
  }
}
