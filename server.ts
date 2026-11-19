import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  app.use(express.json());

  // API endpoint for resume ATS analysis & optimization
  app.post('/api/optimize-resume', async (req, res) => {
    try {
      const { jobDescription, resumeText } = req.body;
      const clientApiKey = req.headers['x-gemini-api-key'] as string;
      const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(401).json({ 
          error: 'Chave da API do Google AI Studio não configurada. Insira sua chave nas configurações.' 
        });
      }

      if (!jobDescription || !resumeText) {
        return res.status(400).json({ error: 'Descrição da vaga e currículo são obrigatórios.' });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const systemInstruction = `Você é um Recrutador Executivo Sênior e Diretor de Talentos, especialista em Diversidade, Inclusão Etária e Otimização ATS (Application Tracking System).
Sua missão é ajudar profissionais sênior (50+) a otimizarem seus currículos para vagas corporativas de alto nível.
REGRA DE OURO INEGOCIÁVEL: A IA otimiza a apresentação, destaca a bagagem, maturidade, liderança, resiliência e ressalta competências estratégicas, mas NUNCA inventa, exagera ou adiciona nenhuma experiência, cargo, empresa ou habilidade técnica que o candidato não possua no texto original do currículo. Toda otimização deve ser estritamente baseada nos fatos informados.

Analise o currículo fornecido em relação à descrição da vaga e retorne um objeto JSON contendo estritamente as seguintes chaves:
1. "score": Uma string indicando a porcentagem estimada de compatibilidade ATS (ex: "92%").
2. "summary": Um diagnóstico executivo detalhado (em português) avaliando como a maturidade e bagagem do profissional se alinham aos requisitos da vaga e justificando o score.
3. "found": Array de strings listando as competências, palavras-chave e experiências já presentes e bem alinhadas.
4. "missing": Array de strings listando palavras-chave ou requisitos exigidos pela vaga que estão ausentes ou que precisam ser evidenciados a partir do histórico real do candidato.
5. "optimizedResume": O currículo reescrito e formatado de forma limpa, estruturada, profissional e otimizada para leitores ATS, destacando a senioridade e liderança sem inventar dados.
6. "mentorTip": Uma dica estratégica e empoderadora de posicionamento para a entrevista (focada em defender a bagagem sênior como vantagem competitiva contra o etarismo).`;

      const prompt = `Descrição da Vaga:
${jobDescription}

Currículo Original do Profissional Sênior:
${resumeText}

Por favor, faça a análise ATS completa e retorne o JSON estruturado conforme solicitado.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.STRING },
              summary: { type: Type.STRING },
              found: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              missing: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              optimizedResume: { type: Type.STRING },
              mentorTip: { type: Type.STRING }
            },
            required: ["score", "summary", "found", "missing", "optimizedResume", "mentorTip"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('A IA não retornou resposta.');
      }

      const result = JSON.parse(text);
      res.json(result);
    } catch (error: any) {
      console.error('Erro no motor de otimização ATS:', error);
      const errorMsg = error.message || '';
      if (errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('quota') || errorMsg.includes('429')) {
        return res.status(429).json({ 
          error: 'Limite de cota diária do plano gratuito atingido (Erro 429). Utilize uma chave com faturamento ativado no painel de Configurações ou utilize o Modo de Demonstração Instantânea abaixo.' 
        });
      }
      res.status(500).json({ error: errorMsg || 'Erro ao processar a otimização com IA.' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Seniorvaga server running on port ${PORT}`);
  });
}

startServer();
