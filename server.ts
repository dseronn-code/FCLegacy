import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const USER_KEY = "AQ.Ab8RN6KYvi_y7SWwkPbSr4yNQBUee14nmMuJ5fFkLii4R9G8QQ";

function getGeminiClient(customKey?: string): GoogleGenAI {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("A chave de API Gemini não foi encontrada.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Timeout de requisição ultrapassado"));
      }
    }, timeoutMs);

    promise
      .then((res) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(res);
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

// Track failing keys and models to avoid blocking the user on subsequent requests
const failedKeys = new Map<string, { resumeAt: number; reason: string }>();

function getHealthyKeys(): string[] {
  const now = Date.now();
  const allKeys = [process.env.GEMINI_API_KEY, USER_KEY].filter(Boolean) as string[];
  const healthy = allKeys.filter((key) => {
    const failure = failedKeys.get(key);
    if (failure && failure.resumeAt > now) {
      console.log(`Poupando chave ...${key.slice(-6)} devido a falha recente: ${failure.reason}`);
      return false;
    }
    return true;
  });
  
  if (healthy.length === 0 && allKeys.length > 0) {
    console.log("Todas as chaves de API estavam marcadas com falha recente. Resetando restrições para nova tentativa...");
    failedKeys.clear();
    return allKeys;
  }
  return healthy;
}

function markKeyFailed(key: string, err: any) {
  const errMsg = String(err?.message || err || "").toLowerCase();
  
  if (errMsg.includes("404") || errMsg.includes("not found") || errMsg.includes("not_found") || errMsg.includes("no longer available")) {
    console.log(`[ALERT] Modelo não encontrado ou desativado para chave ...${key.slice(-6)}. Pulando marcação de falha na chave.`);
    return;
  }

  const now = Date.now();
  let duration = 45000; // default 45 seconds
  let reason = "Erro genérico ou timeout";

  if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("resource_exhausted") || errMsg.includes("limit")) {
    duration = 4 * 60000; // 4 minutes for quota issues
    reason = "Quota esgotada (429)";
  } else if (errMsg.includes("503") || errMsg.includes("unavailable") || errMsg.includes("demand") || errMsg.includes("overloaded")) {
    duration = 2 * 60000; // 2 minutes for service overload (503)
    reason = "Serviço sobrecarregado (503)";
  }

  failedKeys.set(key, { resumeAt: now + duration, reason });
  console.log(`[ALERT] Chave ...${key.slice(-6)} marcada como INSALUBRE por ${duration / 1000}s. Razão: ${reason}`);
}

function isCriticalKeyError(err: any): boolean {
  const errMsg = String(err?.message || err || "").toLowerCase();
  return errMsg.includes("key not valid") || 
         errMsg.includes("invalid key") || 
         errMsg.includes("403") ||
         errMsg.includes("permission_denied") ||
         errMsg.includes("permission denied") ||
         (errMsg.includes("api key") && errMsg.includes("400"));
}

// API routes registered BEFORE Vite middleware
app.post("/api/generate-player", async (req, res) => {
  const { nationality, position, preferredClub, suggestedName, personalityType } = req.body;

  const prompt = `Você é o motor de Inteligência Artificial exclusivo do projeto "Performance Analyst FC 26", uma plataforma de comunidade gamer full web hospedada no domínio wolkstore.shop. Sua única e exclusiva função é gerar a ficha biográfica de novos jogadores de futebol fictícios altamente realistas e detalhados para os usuários do site.

REGRAS DE OPERAÇÃO OBRIGATÓRIAS:
1. Você deve utilizar a ferramenta Google Search integrada para buscar dados e fatos reais do ano de 2026 (como rumores, modelos de carros reais superesportivos de 2026, celebridades em alta, patrocinadores, elencos e times de futebol vigentes em 2026).
2. Siga o tom marrento, detalhado, confiante, arrogante, provocador, focado, ostentador e extremamente realista baseado no exemplo do jogador "Tomás Duarte".
3. Responda rigorosamente às 20 perguntas na ordem e numeração corretas dentro do objeto "perfil_completo_20_perguntas".
4. Baseado no país do clube atual/inicial gerado, inclua no JSON uma lista de sugestões com os nomes reais dos principais campeonatos oficiais daquele país para alimentar o seletor de torneios do usuário.
5. Sua resposta deve ser estritamente em formato JSON limpo, sem textos introdutórios ou conclusivos (NÃO inclua blocos de markdown com \`\`\`json, retorne apenas o texto cru do JSON válido).

Parâmetros do jogador a ser gerado (use como base ou gere de forma criativa e realista se não fornecidos ou vazios):
- Nome/Apelido Sugerido: ${suggestedName || "Gere um nome sonoro e marcante da nacionalidade correspondente"}
- Nacionalidade: ${nationality || "Gere uma nacionalidade aleatória de destaque (ex: Brasil, Portugal, Espanha, Argentina, França, Inglaterra, Itália)"}
- Posição: ${position || "Gere uma posição ofensiva ou de destaque como Ponta Esquerda, Atacante, Meio-campista Criativo, etc."}
- Clube Atual/Inicial: ${preferredClub || "Gere um gigante europeu condizente"}
- Estilo/Personalidade extra: ${personalityType || "Marrento, audacioso, focado em virar o maior de todos e fã de festas de alto padrão"}

Responda detalhadamente a cada uma das 20 perguntas na ordem exata:
1_personalidade: Descrição detalhada da personalidade confiante, marrenta, focada, que sabe que é o melhor e provoca rivais.
2_amigos_reais: Lista de jogadores de futebol reais e celebridades reais que andam com ele in 2026 (ex: Neymar Jr, Rafael Leão, Bellingham, Haaland, etc.).
3_namorada_real: Nome de namorada famosa real do mundo das celebridades (modelos, atrizes, cantoras, influencers de destaque in 2026). Explique os rumores de romance na mídia de fofoca.
4_situacao_financeira: Ostentação do maior salário, investimentos imobiliários sofisticados (ex: Dubai, Lisboa, Ibiza, etc.).
5_historia_de_vida: Origem humilde ou marcante, formação na base, ascensão meteórica e venda recorde (em valores realistas de milhões de euros) para o gigante europeu atual.
6_vivia_bem: Detalhes das mansões extravagantes, jatos privados, férias em destinos badalados (Ibiza, Saint-Tropez, Miami).
7_relacao_familiar: Relação afetada pela fama ultra-rápida, viagens, mas mantendo suporte financeiro pesado.
8_comportamento: Atitude ousada em campo (comemorações icônicas, calando rivais, chutando a bandeira) e polêmicas saudáveis fora de campo.
9_fortuna_e_carros_reais: Fortuna total estimada e sua coleção real de carros superesportivos modernos e reais de 2026 (ex: Bugatti Chiron/Tourbillon, Ferrari SF90/Purosangue, Lamborghini Revuelto, Porsche 911 GT3 RS, etc.).
10_patrocinios_reais: Lista de patrocinadores de peso reais (Nike, EA Sports, Louis Vuitton, Red Bull, etc.).
11_expectativa_carreira: Projetado como o próximo Bola de Ouro, sucessor das lendas do seu país de origem.
12_desempenho_campo: Estilo técnico de excelência, drible humilhante, velocidade insana e frieza em finais.
13_clubes_europa: Lista cronológica de clubes europeus pelos quais passou até chegar ao topo.
14_clube_atual: Detalhes do clube onde atua em 2026 e o número histórico da camisa.
15_estilo_altura_idolos: Posição favorita, altura realista, e lista de ídolos lendários em quem se inspira (ex: Cristiano Ronaldo, Ronaldinho, Romário, Zidane, etc.).
16_relacionamentos_elenco: Convivência com o elenco (respeitado pelos craques, idolatrado pela torcida, o terror das torcidas rivais).
17_satisfacao_clube: Amor pelo clube atual, recusa de propostas absurdas da Arábia Saudita, foco em conquistar a Champions League.
18_time_do_coracao: Clube que apoiava na infância.
19_nascimento: Cidade e data de nascimento realista coerente com a idade de 18 a 23 anos in 2026.
20_biometria: Altura exata (ex: 1,83 m) e peso (ex: 78 kg).

Seja muito específico e use dados de 2026.

FORMATO DE RETORNO OBRIGATÓRIO (JSON PURO):
{
  "nome_jogador": "Nome Completo Gerado",
  "clube_inicial": "Nome do Clube Atual",
  "nacionalidade": "Nacionalidade do Jogador",
  "sugestoes_campeonatos_locais": ["Nome Real de Campeonato Local 1", "Nome Real de Campeonato Local 2", "Nome Real de Campeonato Local 3"],
  "perfil_completo_20_perguntas": {
    "1_personalidade": "...",
    "2_amigos_reais": ["...", "..."],
    "3_namorada_real": "...",
    "4_situacao_financeira": "...",
    "5_historia_de_vida": "...",
    "6_vivia_bem": "...",
    "7_relacao_familiar": "...",
    "8_comportamento": "...",
    "9_fortuna_e_carros_reais": "...",
    "10_patrocinios_reais": ["...", "..."],
    "11_expectativa_carreira": "...",
    "12_desempenho_campo": "...",
    "13_clubes_europa": ["...", "..."],
    "14_clube_atual": "...",
    "15_estilo_altura_idolos": "...",
    "16_relacionamentos_elenco": "...",
    "17_satisfacao_clube": "...",
    "18_time_do_coracao": "...",
    "19_nascimento": "...",
    "20_biometria": "..."
  }
}`;

  const KEYS_TO_TRY = getHealthyKeys();
  let success = false;
  let resultJson: any = null;
  let lastError: any = null;

  if (KEYS_TO_TRY.length > 0) {
    for (const key of KEYS_TO_TRY) {
      console.log(`[PIPELINE] Processando tentativas com a chave que termina em ...${key.slice(-6)}`);
      let keyFailedEntirely = true;

      const strategies = [
        {
          name: "Estratégia 1 (gemini-3.5-flash + Busca)",
          fn: () => getGeminiClient(key).models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: "application/json"
            }
          }),
          timeout: 5000,
          isFallback: false
        },
        {
          name: "Estratégia 2 (gemini-3.5-flash SEM Busca)",
          fn: () => getGeminiClient(key).models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json"
            }
          }),
          timeout: 3500,
          isFallback: true
        },
        {
          name: "Estratégia 3 (gemini-3.1-flash-lite SEM Busca)",
          fn: () => getGeminiClient(key).models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: prompt,
            config: {
              responseMimeType: "application/json"
            }
          }),
          timeout: 3000,
          isFallback: true
        },
        {
          name: "Estratégia 4 (gemini-flash-latest SEM Busca)",
          fn: () => getGeminiClient(key).models.generateContent({
            model: "gemini-flash-latest",
            contents: prompt,
            config: {
              responseMimeType: "application/json"
            }
          }),
          timeout: 3000,
          isFallback: true
        }
      ];

      for (const strat of strategies) {
        try {
          console.log(`[PIPELINE] Tentando ${strat.name} com chave que termina em ...${key.slice(-6)}...`);
          const response = await withTimeout(strat.fn(), strat.timeout);
          const responseText = response.text || "{}";
          
          let cleanJson = responseText.trim();
          if (cleanJson.startsWith("```json")) {
            cleanJson = cleanJson.substring(7);
          } else if (cleanJson.startsWith("```")) {
            cleanJson = cleanJson.substring(3);
          }
          if (cleanJson.endsWith("```")) {
            cleanJson = cleanJson.substring(0, cleanJson.length - 3);
          }
          cleanJson = cleanJson.trim();

          resultJson = JSON.parse(cleanJson);
          if (strat.isFallback) {
            resultJson._is_fallback = true;
          }
          success = true;
          keyFailedEntirely = false;
          console.log(`Sucesso na ${strat.name}!`);
          break;
        } catch (err: any) {
          console.log(`Aviso: Falha na ${strat.name}:`, err.message || err);
          lastError = err;

          if (isCriticalKeyError(err)) {
            console.log(`[CRÍTICO] Falha impeditiva (429/400/Quota) detectada na chave ...${key.slice(-6)}. Abortando demais estratégias para esta chave.`);
            markKeyFailed(key, err);
            break; // Sai do loop de estratégias para esta chave
          }
        }
      }

      if (success) {
        break; // Sai do loop de KEYS_TO_TRY
      }

      if (keyFailedEntirely) {
        console.log(`[ALERT] Chave ...${key.slice(-6)} falhou totalmente em todos os recursos e modelos.`);
        markKeyFailed(key, lastError || "Falha total no pipeline");
      }
    }
  } else {
    console.log("Nenhuma chave saudável disponível no momento. Utilizando contingência estática local...");
  }

  if (success && resultJson) {
    return res.json(resultJson);
  }

  // 3. Se tudo falhar, usar o gerador inteligente estático de emergência
  console.log("Aviso: Todos os canais remotos de IA retornaram indisponibilidade temporária de serviço. Ativando contingência estática local inteligente de segurança...");
  try {
    const { nationality, position, preferredClub, suggestedName, personalityType } = req.body;
    const finalName = suggestedName || "Mateo Lombardi";
    const finalNat = nationality || "Brasil";
    const finalPos = position || "Ponta Esquerda";
    const finalClub = preferredClub || "Real Madrid CF";
    const finalStyle = personalityType || "Marrento";

    let suggestedChamps = ["UEFA Champions League", "FIFA Club World Cup"];
    if (finalNat.toLowerCase().includes("portugal")) {
      suggestedChamps = ["Liga Portugal Betclic", "Taça de Portugal", ...suggestedChamps];
    } else if (finalNat.toLowerCase().includes("brasil") || finalClub.toLowerCase().includes("flamengo") || finalClub.toLowerCase().includes("palmeiras")) {
      suggestedChamps = ["Campeonato Brasileiro Série A", "Copa do Brasil", "Copa Libertadores", ...suggestedChamps];
    } else if (finalClub.toLowerCase().includes("madrid") || finalClub.toLowerCase().includes("barcelona") || finalClub.toLowerCase().includes("espanha") || finalClub.toLowerCase().includes("atlético")) {
      suggestedChamps = ["La Liga EA Sports", "Copa del Rey", "Supercopa de España", ...suggestedChamps];
    } else {
      suggestedChamps = ["Premier League", "FA Cup", "EFL Cup", ...suggestedChamps];
    }

    const fallbackPlayer = {
      nome_jogador: finalName,
      clube_inicial: finalClub,
      nacionalidade: finalNat,
      sugestoes_campeonatos_locais: suggestedChamps,
      perfil_completo_20_perguntas: {
        "1_personalidade": `Extremamente ${finalStyle.toLowerCase()} e com um toque de arrogância saudável de quem sabe que é superior em campo. Provoca adversários com sorrisos irônicos e decide partidas sob pressão extrema sem suar.`,
        "2_amigos_reais": ["Neymar Jr", "Rafael Leão", "Vinicius Jr", "Jude Bellingham", "Rodrygo Goes"],
        "3_namorada_real": "Valentina Zenere. A imprensa de fofocas na Europa e no Brasil monitora de perto cada jatar romântico e postagem mútua nas redes sociais do casal.",
        "4_situacao_financeira": "Ostenta um patamar financeiro galáctico em 2026. Dono de investimentos imobiliários estratégicos em Lisboa, coberturas em Dubai e mansão luxuosa com heliponto próprio.",
        "5_historia_de_vida": `Teve ascensão meteórica nas categorias de base do futebol local antes de ser transferido ao futebol europeu por uma transferência recorde estimada em €95 milhões de euros.`,
        "6_vivia_bem": "Vive cercado pelo luxo definitivo. Utiliza jatos privados fretados para curtir folgas relâmpago em Ibiza, Saint-Tropez e Miami com seu círculo de amigos íntimos.",
        "7_relacao_familiar": "Parcialmente afastado no dia a dia pela rotina pesada de competições de elite, mas mantém uma relação excelente dando suporte financeiro ilimitado para toda a família.",
        "8_comportamento": "Ousado, polêmico e inesquecível. Comemora gols fazendo gestos para calar as torcidas rivais, tirando a camisa e chutando a bandeira de escanteio.",
        "9_fortuna_e_carros_reais": "Sua fortuna in 2026 é estimada em mais de €350 milhões de euros. Coleciona supercarros lendários como a Ferrari SF90, Lamborghini Revuelto e o novíssimo Porsche 911 GT3 RS.",
        "10_patrocinios_reais": ["Nike (Vitalício)", "Red Bull", "EA Sports", "TAG Heuer"],
        "11_expectativa_carreira": "Apontado unanimemente por analistas mundiais como o legítimo herdeiro da camisa número 10 e futuro vencedor da Bola de Ouro.",
        "12_desempenho_campo": "Atacante moderno devastador no mano a mano. Velocidade supersônica, drible incrivelmente liso e frieza letal diante do goleiro.",
        "13_clubes_europa": ["Clube Formador Nacional", finalClub],
        "14_clube_atual": `${finalClub}. Brilha vestindo a camisa mais pesada do ataque com total reverência da torcida.`,
        "15_estilo_altura_idolos": `${finalPos} com drible ousado e drible curto. Mede 1,83m. Ídolos supremos: Cristiano Ronaldo, Romário e Ronaldinho Gaúcho.`,
        "16_relacionamentos_elenco": "Respeitado pela liderança técnica implacável, embora tenha atritos pontuais com a comissão técnica devido à sua forte personalidade em treinos.",
        "17_satisfacao_clube": `Completamente focado em conquistar a Champions League pelo ${finalClub}, tendo recusado ofertas financeiras absurdas da Arábia Saudita recentemente.`,
        "18_time_do_coracao": "O clube formador nacional que o revelou para o futebol mundial.",
        "19_nascimento": "Nascido em 12 de julho de 2005.",
        "20_biometria": "Altura: 1,83 m. Peso: 77 kg. Condicionamento físico impecável e de alto rendimento."
      },
      _is_fallback: true
    };

    return res.json(fallbackPlayer);
  } catch (fallbackError) {
    console.error("Erro fatal no gerador de contingência:", fallbackError);
    return res.status(500).json({
      error: "Serviço temporariamente indisponível devido a alta demanda. Tente novamente mais tarde."
    });
  }
});

// Vite middleware integration for full-stack dev and prod modes
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Performance Analyst FC 26] Motor de IA ativo na porta ${PORT}`);
  });
}

bootstrap();
