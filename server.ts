import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";
import dns from "dns";

// Force Node to prioritize IPv4 DNS resolution first to avoid ENETUNREACH issues with IPv6-only/unsupported hostings (like Render.com)
dns.setDefaultResultOrder('ipv4first');

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// In-memory verification codes map: email -> { code: string; expiresAt: number }
const verificationCodes = new Map<string, { code: string; expiresAt: number }>();

app.use(express.json());

const USER_KEY = "AQ.Ab8RN6KYvi_y7SWwkPbSr4yNQBUee14nmMuJ5fFkLii4R9G8QQ";

// Utility to force IPv4 resolution of the SMTP host via dns.resolve4
async function getSmtpHostIp(host: string): Promise<string> {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':') || host === "localhost") {
    return host;
  }
  return new Promise<string>((resolve) => {
    dns.resolve4(host, (err, addresses) => {
      if (err) {
        console.error(`[VERIFICATION] Failed to resolve ${host} via dns.resolve4:`, err);
        resolve(host);
      } else if (addresses && addresses.length > 0) {
        console.log(`[VERIFICATION] Resolved ${host} to IPv4: ${addresses[0]} via dns.resolve4`);
        resolve(addresses[0]);
      } else {
        resolve(host);
      }
    });
  });
}

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
app.post("/api/send-verification-code", async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "E-mail inválido." });
  }

  // Generate 6-digit random code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  // Expires in 10 minutes
  const expiresAt = Date.now() + 10 * 60 * 1000;
  
  verificationCodes.set(email.toLowerCase(), { code, expiresAt });

  console.log(`[VERIFICATION] Code generated for ${email}: ${code}`);

  // Try to send email via SMTP if configured, else fallback gracefully
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser || "no-reply@wolkstore.shop";

  let emailSent = false;
  let emailError = null;

  if (smtpUser && smtpPass && smtpHost) {
    try {
      const resolvedHost = await getSmtpHostIp(smtpHost);
      const transporter = nodemailer.createTransport({
        host: resolvedHost,
        port: smtpPort,
        secure: smtpPort === 465, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        connectionTimeout: 15000, // 15 seconds connection timeout
        greetingTimeout: 15000,   // 15 seconds greeting timeout
        socketTimeout: 15000,     // 15 seconds socket timeout
        tls: {
          servername: smtpHost,   // Crucial for SNI verification when host is an IP address
        }
      } as any);

      const mailOptions = {
        from: `"Comunidade FC Legacy" <${smtpFrom}>`,
        to: email,
        subject: `${code} é seu código de verificação para o Performance Analyst FC 26`,
        text: `Olá!\n\nSeu código de verificação para criar sua conta no Performance Analyst FC 26 é: ${code}\n\nEste código expira em 10 minutos.\n\nSe você não solicitou este código, por favor desconsidere este e-mail.`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #222; border-radius: 12px; background-color: #0c0c0e; color: #e0e0e0;">
            <div style="text-align: center; border-bottom: 1px solid #222; padding-bottom: 15px;">
              <h2 style="color: #ccff00; margin: 0; font-family: 'Space Grotesk', sans-serif; letter-spacing: -1px; text-transform: uppercase;">PERFORMANCE ANALYST FC 26</h2>
              <p style="color: #888; font-size: 10px; margin: 5px 0 0 0; font-family: monospace;">ANALYST PLATFORM // FC 26</p>
            </div>
            <div style="padding: 20px 0;">
              <p style="font-size: 14px; line-height: 1.5; color: #e2e2e7;">Olá!</p>
              <p style="font-size: 14px; line-height: 1.5; color: #e2e2e7;">Seu código de verificação para criar uma conta e salvar seus legados de carreira no site <a href="http://wolkstore.shop" style="color: #ccff00; text-decoration: none; font-weight: bold;">wolkstore.shop</a> é:</p>
              
              <div style="text-align: center; margin: 25px 0; padding: 15px; background-color: #121215; border: 1px solid #222; border-radius: 12px;">
                <span style="font-size: 32px; font-weight: bold; font-family: monospace; letter-spacing: 5px; color: #ccff00;">${code}</span>
              </div>
              
              <p style="font-size: 12px; color: #888; text-align: center;">Este código expira em 10 minutos por motivos de segurança.</p>
            </div>
            <div style="border-top: 1px solid #222; padding-top: 15px; font-size: 11px; color: #666; text-align: center;">
              Se você não solicitou este e-mail, apenas ignore-o.<br>
              © 2026 Comunidade FC Legacy. Todos os direitos reservados.
            </div>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      emailSent = true;
      console.log(`[VERIFICATION] Email successfully sent to ${email}`);
    } catch (err: any) {
      console.error("[VERIFICATION] SMTP Error sending email:", err);
      emailError = err.message || err;
    }
  } else {
    console.log("[VERIFICATION] SMTP is not configured in .env. Running in debug/fallback mode.");
  }

  return res.json({
    success: true,
    emailSent,
    debugMode: !emailSent,
    code: !emailSent ? code : undefined,
    message: emailSent 
      ? "Código enviado com sucesso para seu e-mail!" 
      : "Código gerado com sucesso! (Modo Desenvolvimento)",
  });
});

app.post("/api/verify-code", async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: "E-mail e código são obrigatórios." });
  }

  const record = verificationCodes.get(email.toLowerCase());
  if (!record) {
    return res.status(400).json({ error: "Nenhum código solicitado para este e-mail. Solicite um novo código." });
  }

  if (Date.now() > record.expiresAt) {
    verificationCodes.delete(email.toLowerCase());
    return res.status(400).json({ error: "O código de verificação expirou. Solicite um novo código." });
  }

  if (record.code !== code.trim()) {
    return res.status(400).json({ error: "Código de verificação incorreto." });
  }

  // Code verified successfully! Keep it or let the user create the account.
  // We can delete the code here so it can only be used once.
  verificationCodes.delete(email.toLowerCase());

  return res.json({ success: true, message: "E-mail verificado com sucesso!" });
});

app.post("/api/generate-player", async (req, res) => {
  const { nationality, position, preferredClub, suggestedName, personalityType } = req.body;
  const creativeSeed = Math.random().toString(36).substring(7);

  const prompt = `Você é o motor de Inteligência Artificial exclusivo do projeto "Performance Analyst FC 26", uma plataforma de comunidade gamer full web hospedada no domínio wolkstore.shop. Sua única e exclusiva função é gerar a ficha biográfica de novos jogadores de futebol fictícios altamente realistas e detalhados para os usuários do site.

REGRAS DE OPERAÇÃO OBRIGATÓRIAS DE VARIABILIDADE E EXCLUSIVIDADE:
1. Você deve utilizar a ferramenta Google Search integrada para buscar dados e fatos reais do ano de 2026 (como rumores, modelos de carros reais superesportivos de 2026, celebridades em alta, patrocinadores, elencos e times de futebol vigentes em 2026).
2. Siga o tom marrento, detalhado, confiante, arrogante, provocador, focado, ostentador e extremamente realista baseado no exemplo do jogador "Tomás Duarte".
3. Responda rigorosamente às 20 perguntas na ordem e numeração corretas dentro do objeto "perfil_completo_20_perguntas".
4. Baseado no país do clube atual/inicial gerado, inclua no JSON uma lista de sugestões com os nomes reais dos principais campeonatos oficiais daquele país para alimentar o seletor de torneios do usuário.
5. Sua resposta deve ser estritamente em formato JSON limpo, sem textos introdutórios ou conclusivos (NÃO inclua blocos de markdown com \`\`\`json, retorne apenas o texto cru do JSON válido).
6. CRÍTICO: Cada jogador gerado deve ser COMPLETAMENTE ÚNICO, diferente de qualquer resposta anterior. Varie muito as amizades, namoradas famosas, carros, patrocinadores, expectativas e as narrativas de vida. Não repita as mesmas histórias ou as mesmas celebridades. Use a semente de criatividade aleatória "${creativeSeed}" para forçar uma geração inovadora e inédita. Cite nominalmente o jogador, seu clube, sua posição e sua nacionalidade ao longo do texto.

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
              responseMimeType: "application/json",
              temperature: 1.0
            }
          }),
          timeout: 18000,
          isFallback: false
        },
        {
          name: "Estratégia 2 (gemini-3.5-flash SEM Busca)",
          fn: () => getGeminiClient(key).models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 1.0
            }
          }),
          timeout: 12000,
          isFallback: true
        },
        {
          name: "Estratégia 3 (gemini-3.1-flash-lite SEM Busca)",
          fn: () => getGeminiClient(key).models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 1.0
            }
          }),
          timeout: 10000,
          isFallback: true
        },
        {
          name: "Estratégia 4 (gemini-flash-latest SEM Busca)",
          fn: () => getGeminiClient(key).models.generateContent({
            model: "gemini-flash-latest",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 1.0
            }
          }),
          timeout: 10000,
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
  }

  if (success && resultJson) {
    return res.json(resultJson);
  }

  // 3. Se tudo falhar, usar o gerador inteligente estático de emergência
  console.log("Aviso: Todos os canais remotos de IA retornaram indisponibilidade temporária de serviço. Ativando contingência estática local inteligente de segurança...");
  try {
    const { nationality, position, preferredClub, suggestedName, personalityType } = req.body;
    
    // Helper function to generate names based on selected nationality
    const generateNameByNat = (natStr: string): string => {
      const nat = (natStr || "").toLowerCase();
      const firstNames: Record<string, string[]> = {
        brasil: ["Enzo", "Gabriel", "Mateus", "Lucas", "Rodrigo", "Thiago", "Vinícius", "Guilherme", "Felipe", "Igor", "Murilo", "Arthur", "Kaio", "Gustavo", "Heitor", "Davi", "Bernardo", "Matheus", "Pedro", "Henrique"],
        portugal: ["João", "Martim", "Rodrigo", "Santiago", "Francisco", "Vasco", "Diogo", "Duarte", "Tomás", "Afonso", "Gonçalo", "Miguel", "Pedro", "Manuel", "Luís", "Salvador", "Simão", "Lourenço", "Daniel", "Rafael"],
        espanha: ["Mateo", "Hugo", "Álvaro", "Lucas", "Javier", "Diego", "Alejandro", "Carlos", "Pablo", "Adrián", "Andrés", "Mario", "Marcos", "Daniel", "Sergio", "Izan", "Leo", "Enzo", "Iván", "Ruben"],
        argentina: ["Lautaro", "Bautista", "Valentino", "Thiago", "Mateo", "Benjamín", "Felipe", "Joaquín", "Tomás", "Agustín", "Franco", "Nicolas", "Luciano", "Enzo", "Gaston", "Mateo", "Mateo", "Mariano"],
        franca: ["Lucas", "Enzo", "Mathis", "Thomas", "Hugo", "Maxime", "Clement", "Antoine", "Raphael", "Theo", "Louis", "Arthur", "Gabriel", "Jules", "Mathieu", "Damien", "Adrien", "Killian"],
        inglaterra: ["Jack", "Oliver", "Harry", "George", "Charlie", "Alfie", "Leo", "Oscar", "Archie", "Max", "James", "William", "Mason", "Thomas", "Noah", "Henry", "Arthur", "Freddie"],
        italia: ["Francesco", "Alessandro", "Lorenzo", "Mattia", "Andrea", "Leonardo", "Riccardo", "Gabriele", "Davide", "Tommaso", "Giuseppe", "Matteo", "Federico", "Giovanni", "Filippo", "Christian", "Samuele"]
      };

      const lastNames: Record<string, string[]> = {
        brasil: ["Silva", "Santos", "Souza", "Oliveira", "Pereira", "Lima", "Carvalho", "Ferreira", "Rodrigues", "Almeida", "Costa", "Nascimento", "Barbosa", "Gomes", "Ribeiro", "Cardoso", "Teixeira", "Mendes"],
        portugal: ["Mendes", "Silva", "Santos", "Ferreira", "Pereira", "Costa", "Rodrigues", "Gomes", "Lopes", "Marques", "Cardoso", "Teixeira", "Ribeiro", "Carvalho", "Pinto", "Azevedo", "Cunha", "Soares"],
        espanha: ["García", "Rodríguez", "González", "Fernández", "López", "Martínez", "Sánchez", "Pérez", "Gómez", "Martín", "Ruiz", "Díaz", "Hernández", "Castro", "Álvarez", "Ruiz", "Vidal", "Molina"],
        argentina: ["Rodríguez", "González", "Gómez", "Fernández", "López", "Díaz", "Martínez", "Pérez", "Romero", "Álvarez", "Sánchez", "Benítez", "Medina", "Herrera", "Rios", "Silva", "Vargas"],
        franca: ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Michel", "Garcia", "David", "Girard", "Fournier", "Mercier"],
        inglaterra: ["Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson", "Davies", "Robinson", "Wright", "Thompson", "Evans", "Walker", "White", "Carter", "Green", "Hall", "Harris"],
        italia: ["Rossi", "Ferrari", "Russo", "Bianchi", "Romano", "Gallo", "Costa", "Fontana", "Ricci", "Moretti", "Bruno", "Rizzo", "Conti", "Leone", "Lombardi", "Giordano", "Galli", "Rinaldi"]
      };

      let key = "brasil";
      if (nat.includes("portugal")) key = "portugal";
      else if (nat.includes("espanha") || nat.includes("spain")) key = "espanha";
      else if (nat.includes("argentina")) key = "argentina";
      else if (nat.includes("fran") || nat.includes("france")) key = "franca";
      else if (nat.includes("inglaterra") || nat.includes("england") || nat.includes("brit")) key = "inglaterra";
      else if (nat.includes("ital")) key = "italia";
      else {
        const keys = Object.keys(firstNames);
        key = keys[Math.floor(Math.random() * keys.length)];
      }

      const fList = firstNames[key];
      const lList = lastNames[key];
      const first = fList[Math.floor(Math.random() * fList.length)];
      const last = lList[Math.floor(Math.random() * lList.length)];
      return `${first} ${last}`;
    };

    const finalNat = nationality || "Brasil";
    const finalName = suggestedName || generateNameByNat(finalNat);
    const finalPos = position || "Ponta Esquerda";
    const finalClub = preferredClub || "Real Madrid CF";
    const finalStyle = personalityType || "Marrento";

    // Helper functions for dynamic randomization
    const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const shuffleArray = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);
    const pickMultiple = <T>(arr: T[], count: number): T[] => shuffleArray(arr).slice(0, count);

    // 1. Friends list (Amigos Reais) - randomized selection of 2026 football figures
    const possibleFriends = [
      "Jude Bellingham", "Neymar Jr", "Rafael Leão", "Vinicius Jr", "Erling Haaland", 
      "Phil Foden", "Cole Palmer", "Bukayo Saka", "Jack Grealish", "Rodrygo Goes", 
      "Endrick", "Lamine Yamal", "Gavi", "Pedri", "Kylian Mbappé", "Ousmane Dembélé",
      "Marcus Rashford", "Alexander-Arnold", "Declan Rice", "Florian Wirtz", "Jamal Musiala"
    ];
    const friends = pickMultiple(possibleFriends, 4 + Math.floor(Math.random() * 2));

    // 2. Girlfriends list (Namorada Famosa) - randomized with custom rumor stories
    const possibleGirlfriends = [
      { name: "Valentina Zenere", bio: "Atriz argentina da série Élite e ícone fashion europeu. Tabloides em Madri e Milão publicam flagras semanais do casal saindo de restaurantes exclusivos." },
      { name: "Bruna Biancardi", bio: "Influencer brasileira renomada. Rumores apontam que se conheceram em uma festa fechada de alta costura em Paris e que viajam juntos nas folgas." },
      { name: "Clara Galle", bio: "Modelo e atriz espanhola em ascensão meteórica em 2026. Foram flagrados juntos curtindo o sol a bordo de um iate luxuoso nas praias badaladas de Ibiza." },
      { name: "Julia Rodrigues", bio: "Modelo brasileira de marcas de luxo como Chanel e Balenciaga. Os comentários cheios de emojis de corações e jantares secretos atiçam a imprensa britânica." },
      { name: "Olivia Rodrigo", bio: "Superestrela pop internacional. Jornais de fofocas na Inglaterra afirmam que o jogador reservou uma área vip inteira no show dela em Londres para não serem incomodados." },
      { name: "Marta Díaz", bio: "Influencer de moda e estilo de vida espanhola. Os constantes flagras em cafés refinados em Milão confirmam o forte clima de romance de acordo com as revistas espanholas." },
      { name: "Sasha Meneghel", bio: "Estilista e influencer internacional. Há especulações fervorosas na imprensa brasileira sobre uma badalada parceria de estilo de vida que acabou virando romance." },
      { name: "Sydney Sweeney", bio: "Estrela icônica de Hollywood. Fãs notaram jantares românticos em Los Angeles e troca de curtidas apaixonadas no Instagram após se conhecerem em um evento de gala." }
    ];
    const girlfriendObj = pickRandom(possibleGirlfriends);
    const girlfriendText = `${girlfriendObj.name}. ${girlfriendObj.bio}`;

    // 3. Financial Situation
    const financialScenarios = [
      `Ganha um salário astronômico de superestrela como ${finalPos.toLowerCase()} do ${finalClub} em 2026. ${finalName} investiu pesado em um resort de ultraluxo na paradisíaca ilha de Bali, possui uma cobertura cinematográfica de €18M em Dubai Marina e é dono de sua própria marca de grife esportiva de alto padrão.`,
      `Seu contrato com o ${finalClub} em 2026 garante patamares financeiros absurdos para ${finalName}. Adquiriu uma imensa propriedade futurista projetada por arquitetos italianos renomados na Suíça, além de possuir coberturas em Miami Beach e dezenas de investimentos em startups de IA de futebol.`,
      `Considerado um dos jovens mais ricos do esporte mundial em 2026, ${finalName} ostenta uma mansão de três andares com heliponto próprio na Sardenha, iate de luxo customizado com seu número histórico no ${finalClub} e uma holding que administra suas marcas de lifestyle de luxo.`
    ];
    const financialText = pickRandom(financialScenarios);

    // 4. Life History
    const lifeHistories = [
      `${finalName} cresceu nas quadras de areia e futebol de rua da periferia de sua cidade natal, driblando garotos muito maiores. Descoberto em uma peneira de base, subiu ao profissional como o fenômeno mais promissor de seu país e foi vendido ao futebol europeu em uma transação chocante avaliada em €105 milhões de euros.`,
      `Tratado desde o berço como uma joia rara da base na nacionalidade ${finalNat}, ${finalName} passou pelas mãos dos melhores preparadores físicos do país. Estreou aos 16 anos marcando gols fantásticos e, após uma acirrada disputa entre cinco gigantes mundiais, assinou o contrato da sua vida para liderar o projeto do ${finalClub}.`,
      `Seu caminho foi marcado pela superação e por desacreditar os críticos de seu país. Considerado um 'late bloomer', ${finalName} explodiu no profissional marcando gols espetaculares na sua posição de ${finalPos.toLowerCase()} contra os rivais mais tradicionais e chamou atenção imediata dos olheiros da Europa, que pagaram uma multa rescisória recorde.`
    ];
    const historyText = pickRandom(lifeHistories);

    // 5. Living well (Mansions & vacations)
    const livingWellScenarios = [
      `${finalName} mora em uma mansão cinematográfica ultraprotegida nos arredores de seu clube. Utiliza jatos executivos fretados de última geração para desfrutar de folgas de fim de semana em Saint-Tropez, Aspen e Miami, sempre acompanhado de seus parças.`,
      `Vive cercado pela excelência máxima de um atleta do ${finalClub}. Sua residência de luxo conta com cinema privativo, simulador de Fórmula 1 e quadra de futebol society oficial. Suas folgas de verão são passadas em iates navegando pela Costa Amalfitana ou em bangalôs luxuosos nas Maldivas.`,
      `Seu cotidiano em 2026 é digno de realeza europeia. ${finalName} divide-se entre uma mega mansão com campo de golfe particular e viagens a bordo de aviões particulares para curtir praias paradisíacas e festas privadas exclusivas nas ilhas gregas de Mykonos.`
    ];
    const livingText = pickRandom(livingWellScenarios);

    // 6. Family Relations
    const familyScenarios = [
      `A fama meteórica de ${finalName} impôs desafios e um leve distanciamento físico devido às viagens intensas, mas ele compensa dando suporte financeiro ilimitado. Presenteou os pais com uma mansão espetacular em sua cidade natal e banca viagens de primeira classe para todos assistirem aos seus jogos importantes.`,
      `Mantém uma relação extremamente próxima e blindada contra o oportunismo da mídia. Os familiares de ${finalName} gerenciam diretamente sua carreira financeira e contratos de publicidade, e o jogador faz questão de passar todas as festas de fim de ano reunido com eles.`,
      `Apesar da rotina extenuante da elite europeia pelo ${finalClub}, a família continua sendo sua base de sustentação. O jogador financiou projetos sociais inovadores propostos por seus irmãos e garante passagens e estadias nos hotéis de luxo da Europa para ter seus familiares sempre por perto.`
    ];
    const familyText = pickRandom(familyScenarios);

    // 7. On-field Behavior
    const behaviorScenarios = [
      `Famoso pelas provocações ousadas em campo: ${finalName} tem comemorações icônicas mandando a torcida adversária calar a boca, fazendo 'caretas' para as câmeras e respondendo com dribles plásticos quando sofre faltas duras. É o terror dos zagueiros e queridinho dos holofotes.`,
      `Foco mental absoluto mesclado com estilo marrento incomparável. ${finalName} encara rivais olho no olho, comemora seus gols decisivos como ${finalPos.toLowerCase()} tirando a camisa e chutando a bandeira de escanteio de forma marrenta, e costuma dar entrevistas provocativas e sinceras após grandes vitórias.`,
      `Incapaz de aceitar passivamente qualquer derrota. Comanda a equipe do ${finalClub} com intensidade agressiva, vibra muito a cada desarme e comemora gols com saltos acrobáticos e gestos teatrais que levam as arquibancadas ao delírio completo.`
    ];
    const behaviorText = pickRandom(behaviorScenarios);

    // 8. Supercars (Fortuna e Carros)
    const supercarsScenarios = [
      `Sua fortuna estimada em 2026 já ultrapassa os €280 milhões de euros. Na garagem de ${finalName}, coleciona obras-primas como a novíssima Ferrari SF90 Stradale preta fosca, um Lamborghini Revuelto com pintura customizada e o cobiçado Porsche 911 GT3 RS.`,
      `Sua fortuna líquida em 2026 é avaliada em mais de €310 milhões de euros. ${finalName} ostenta uma garagem digna de colecionador contendo um Bugatti Tourbillon personalizado, uma Ferrari Purosangue para o dia a dia e um raro Aston Martin Valour manual.`,
      `Patrimônio estimado de ${finalName} em €350 milhões de euros in 2026. Adquiriu recentemente um hipercarro elétrico Rimac Nevera com aceleração insana de 0 a 100 km/h, além de possuir um McLaren Senna de fibra de carbono e uma Mercedes G63 blindada.`
    ];
    const supercarText = pickRandom(supercarsScenarios);

    // 9. Sponsorships (Patrocínios)
    const possibleSponsorships = [
      ["Nike (Contrato de €15M/ano)", "Red Bull", "EA Sports FC", "Rolex"],
      ["Adidas (Rosto Global de Campanha)", "Gatorade", "Louis Vuitton", "Hublot"],
      ["Puma (Chuteira exclusiva)", "Monster Energy", "EA Sports", "TAG Heuer"],
      ["Under Armour (Embaixador global)", "Pepsi Max", "Balenciaga", "Audemars Piguet"],
      ["New Balance", "Red Bull Premium", "EA Sports", "Oakley Eyewear"]
    ];
    const sponsorships = pickRandom(possibleSponsorships);

    // 10. Expectations
    const expectationsScenarios = [
      `Considerado unanimemente por críticos de futebol mundial como o legítimo herdeiro da histórica camisa 10 e futuro vencedor indiscutível da Bola de Ouro nos próximos 3 anos, consagrando o talento de ${finalName}.`,
      `Projetado para superar todos os recordes históricos de artilharia da liga principal na posição de ${finalPos.toLowerCase()}. A imprensa esportiva internacional define ${finalName} como o atacante mais completo e letal surgido neste século.`,
      `Apontado pelas lendas do futebol como o sucessor natural do trono das superestrelas mundiais. Sua mentalidade vitoriosa e frieza em finais pelo ${finalClub} credenciam ${finalName} para reinar na elite europeia.`
    ];
    const expectationsText = pickRandom(expectationsScenarios);

    // 11. On-field performance
    const performanceScenarios = [
      `Dono de uma velocidade supersônica assustadora combinada com dribles imprevisíveis de futsal em pequenos espaços. ${finalName} finaliza com os dois pés de forma cirúrgica e tem o controle de bola magnético.`,
      `Um meia-atacante moderno e genial no mano a mano. Inteligência tática absurda, visão de jogo digna de maestro de ${finalName} e drible liso que desestabiliza qualquer linha defensiva adversária.`,
      `Atacante devastador no terço final do campo. Explosão muscular extraordinária, frieza cirúrgica cara a cara com o goleiro de ${finalName} e habilidade fora do comum para inventar jogadas geniais do absoluto nada.`
    ];
    const performanceText = pickRandom(performanceScenarios);

    // 12. European clubs passed
    const possibleClubsPassed = [
      ["Clube Formador Nacional", "Ajax Amsterdam", finalClub],
      ["Clube de Base Nacional", "Benfica", finalClub],
      ["Clube de Base Nacional", finalClub],
      ["Clube Revelação do País", "Borussia Dortmund", finalClub],
      ["Academia de Base", "Sporting CP", finalClub]
    ];
    const clubsPassed = pickRandom(possibleClubsPassed);

    // 13. Bio details (Nascimento e biometria)
    const finalHeight = `${1.75 + Math.floor(Math.random() * 18) / 100} m`;
    const finalWeight = `${68 + Math.floor(Math.random() * 18)} kg`;
    const birthYear = 2003 + Math.floor(Math.random() * 4); // Age 19-23 in 2026
    const birthMonth = pickRandom(["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]);
    const birthDay = 1 + Math.floor(Math.random() * 28);
    const birthText = `Nascido em ${birthDay} de ${birthMonth} de ${birthYear}.`;

    // 14. Squad relations (Relacionamentos)
    const relationshipsScenarios = [
      `Respeitado no vestiário do ${finalClub} pela liderança técnica indomável e garra exemplar nos treinos. Embora seja marrento e brincalhão de forma provocativa, ${finalName} é adorado por todos os jovens e pelo treinador da equipe.`,
      `Visto como o grande catalisador e coração do elenco do ${finalClub}. ${finalName} tem espírito altamente competitivo e atritos saudáveis de alto rendimento durante os coletivos, sendo idolatrado pelas arquibancadas pelo carisma inabalável.`,
      `Considerado a superestrela intocável do ${finalClub}. Líder por suas ações geniais em campo, embora ${finalName} prefira se isolar um pouco com seu círculo de amigos íntimos nas redes sociais fora do ambiente de treinamento.`
    ];
    const relationshipsText = pickRandom(relationshipsScenarios);

    // 15. Club satisfaction (Satisfação)
    const satisfactionScenarios = [
      `Completamente apaixonado pela atmosfera fervorosa do ${finalClub}. ${finalName} recusou propostas de salários bilionários de clubes estatais do Oriente Médio com o claro e firme objetivo de conquistar a cobiçada Champions League.`,
      `Ama vestir a camisa histórica e pesada do ${finalClub}. ${finalName} expressa profundo respeito pela história do time, reiterando constantemente que o dinheiro não compra seu amor pelo futebol de elite europeu e pela torcida local.`,
      `Sente-se em casa e totalmente à vontade com seu papel de protagonista absoluto no ${finalClub}. ${finalName} garante que seu compromisso contratual e sentimental com a torcida supera qualquer oferta financeira bilionária.`
    ];
    const satisfactionText = pickRandom(satisfactionScenarios);

    // 16. Idols (Ídolos supremos)
    const idolsCombos = [
      "Cristiano Ronaldo, Ronaldinho Gaúcho e Neymar Jr",
      "Lionel Messi, Zidane e Diego Maradona",
      "Ronaldo Fenômeno, Romário e Thierry Henry",
      "Zico, Pelé e Kaká",
      "Johan Cruyff, Zlatan Ibrahimovic e Ronaldinho Gaúcho"
    ];
    const idolsText = pickRandom(idolsCombos);

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
        "1_personalidade": `Extremamente ${finalStyle.toLowerCase()} e confiante, ${finalName} tem uma mentalidade de aço moldada para o topo. Possui uma presença magnética e um toque provocador saudável, sabendo perfeitamente do seu talento superior jogando como ${finalPos.toLowerCase()} no ${finalClub}.`,
        "2_amigos_reais": friends,
        "3_namorada_real": girlfriendText,
        "4_situacao_financeira": financialText,
        "5_historia_de_vida": historyText,
        "6_vivia_bem": livingText,
        "7_relacao_familiar": familyText,
        "8_comportamento": behaviorText,
        "9_fortuna_e_carros_reais": supercarText,
        "10_patrocinios_reais": sponsorships,
        "11_expectativa_carreira": expectationsText,
        "12_desempenho_campo": performanceText,
        "13_clubes_europa": clubsPassed,
        "14_clube_atual": `${finalClub}. Brilha como o protagonista indiscutível vestindo a camisa mais valiosa e pesada do ataque, consagrado pela torcida apaixonada.`,
        "15_estilo_altura_idolos": `${finalPos} habilidoso com dribles plásticos de efeito. Mede ${finalHeight}. Ídolos fundamentais: ${idolsText}.`,
        "16_relacionamentos_elenco": relationshipsText,
        "17_satisfacao_clube": satisfactionText,
        "18_time_do_coracao": `O ${clubsPassed[0]} que o revelou de forma brilhante para os grandes holofotes mundiais.`,
        "19_nascimento": birthText,
        "20_biometria": `Altura: ${finalHeight}. Peso: ${finalWeight}. Condicionamento físico superlativo de ${finalName} e explosão em alto rendimento.`
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
