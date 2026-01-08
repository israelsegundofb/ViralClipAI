# Instruções rápidas para agentes Copilot / AI

Este projeto é uma SPA React + Vite em TypeScript que analisa vídeos (Gemini AI) e gera cortes otimizados para formato vertical 9:16.

- **Arquitetura (alto nível):** Frontend React em `App.tsx` coordena upload/resolução de URLs, análise (via `services/geminiService.ts`) e render/download dos clipes. UI dividida em componentes em `components/` — destaque: `ClipCard`, `TopicMap`, `WaveformTimeline`.
- **Fluxo de dados principal:** usuário envia arquivo ou URL → `App.tsx` (resolve/baixa stream) → `analyzeVideo` em `services/geminiService.ts` (faz upload para API GenAI, pede JSON estruturado) → resposta JSON é parseada para `AnalysisResult` → UI renderiza catálogo de clipes e timeline.

- **Build / dev:** use os comandos em `package.json`:
  - `npm install`
  - `npm run dev` (executa Vite)
  - `npm run build` / `npm run preview`

- **Credenciais / env:** `README.md` menciona `GEMINI_API_KEY` em `.env.local`, porém `services/geminiService.ts` lê `process.env.API_KEY`. Verifique e padronize antes de rodar (ambos são pontos relevantes a verificar localmente / CI).

- **Padrões e convenções do projeto:**
  - Componentes UI são pequenos e controlados por `App.tsx` (arbítrio centralizado). Prefira alterar estado em `App.tsx` e passar props em vez de criar estado duplicado nos componentes.
  - Funções utilitárias de tempo e muxing estão em `utils.ts` (`parseTimestampToSeconds`, `muxStreams`). `muxStreams` usa `@ffmpeg/ffmpeg` no browser — atenção a requisitos COOP/COEP (SharedArrayBuffer) quando testar localmente.
  - `services/geminiService.ts` encapsula interação com `@google/genai` e exige que a resposta seja JSON válido. O código já faz limpeza de blocos de Markdown e procura o primeiro/último `{...}`; mantenha esse comportamento ao ajustar parsing.

- **Integrações e pontos sensíveis:**
  - `@google/genai` (via `services/geminiService.ts`) — usa upload de arquivo e `models.generateContent` com `fileData`. Use o callback `onProgress` quando chamar `analyzeVideo` para atualizar a UI.
  - `resolveYoutubeVideo` (em `App.tsx`) implementa múltiplas estratégias (Piped, Invidious, Cobalt) e rota por proxies CORS; alterações aqui impactam estabilidade e taxa de falhas de resolução. Evite remover provedores sem testes.
  - `smartcrop` é usado para recorte inteligente 9:16 (import em `App.tsx`). Teste recortes visualmente usando `previewMode` e `showSafeZones` na UI.
  - `muxStreams` usa `ffmpeg.wasm` em browser — testes de muxing falham frequentemente sem headers COOP/COEP; documente deploy com esses headers se for usar em produção.

- **Erros comuns e como tratá-los:**
  - Falha por variável de ambiente: verifique `process.env.API_KEY` vs `GEMINI_API_KEY`.
  - Resposta da AI não sendo JSON: `services/geminiService.ts` já tenta sanitizar; se ajustar prompt, preserve formato JSON estrito pedido no `prompt` (veja o prompt no arquivo para o formato exato esperado).
  - Problemas ao processar arquivos grandes no navegador: `utils.fileToGenerativePart` tem proteções e mensagens de erro — não force leitura como dataURL em arquivos enormes sem teste.

- **Ao modificar/estender:**
  - Se alterar a contract de `AnalysisResult`, atualize tanto `services/geminiService.ts` quanto os componentes que consomem `result` (ex.: `ClipCard`, `TopicMap`, `WaveformTimeline`).
  - Qualquer mudança na resolução de URL (`resolveYoutubeVideo`) deve ser testada com múltiplos exemplos de YouTube e com/sem proxies.

- **Entradas úteis para exemplos de código:**
  - Ver `services/geminiService.ts` → prompt enviado ao modelo (copiar/editar com cuidado).
  - Ver `App.tsx` → `resolveYoutubeVideo`, helpers `downloadBlobWithProxy`, e uso de `smartcrop`.
  - Ver `utils.ts` → `parseTimestampToSeconds`, `muxStreams` (exige ffmpeg/wams/headers).

Se quiser, eu aplico um fix simples para padronizar a variável de ambiente (`GEMINI_API_KEY` → `API_KEY`) ou adiciono um comentário em `README.md` apontando a inconsistência. Quer que eu faça isso agora?
