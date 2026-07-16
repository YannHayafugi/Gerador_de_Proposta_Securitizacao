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
    // O pdfjs-dist carrega seu "worker" (pdf.worker.mjs) através de um
    // import dinâmico com caminho calculado em tempo de execução — o
    // rastreador de arquivos do Vercel não consegue detectar essa
    // dependência sozinho e acaba deixando esse arquivo de fora do pacote
    // implantado, quebrando com "Cannot find module ... pdf.worker.mjs".
    // Força a inclusão explícita dele para a rota que faz a extração.
    outputFileTracingIncludes: {
      "/api/tr/analyze": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    },
  },
};

module.exports = nextConfig;
