/// <reference types="vite/client" />

// Sem este ficheiro, `import.meta.env.VITE_API_URL` não existe para o
// TypeScript e todos os serviços que leem a URL da API ficam em erro. O Vite
// injeta estes tipos, mas só quando alguém os referencia.
