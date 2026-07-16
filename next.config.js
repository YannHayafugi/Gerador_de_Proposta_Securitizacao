/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse depende do pdfjs-dist e do @napi-rs/canvas (módulo nativo,
  // com binário compilado por sistema operacional — é ele quem fornece o
  // DOMMatrix que o pdfjs-dist exige). Nenhum dos três pode ser processado
  // pelo empacotador (webpack) do Next.js — precisam ser carregados direto
  // pelo Node.js em tempo de execução, daí ficarem de fora do bundle. Sem
  // isso, o binário nativo do @napi-rs/canvas não é resolvido corretamente
  // em produção (ex.: Vercel) e a extração de PDF falha com
  // "ReferenceError: DOMMatrix is not defined".
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  },
};

module.exports = nextConfig;
