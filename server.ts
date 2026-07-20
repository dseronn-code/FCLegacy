import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import dns from "dns";
import fs from "fs";
import sharp from "sharp";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, getDoc, doc, query, where, setDoc } from "firebase/firestore";

// Force Node to prioritize IPv4 DNS resolution first to avoid ENETUNREACH issues with IPv6-only/unsupported hostings (like Render.com)
dns.setDefaultResultOrder('ipv4first');

dotenv.config({ override: true });

// Initialize Firebase SDK on server-side
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Lazy initialization of Resend client to avoid module-load environment binding issues
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

// In-memory verification codes map: email -> { code: string; expiresAt: number }
const verificationCodes = new Map<string, { code: string; expiresAt: number }>();

app.use(express.json());

const USER_KEY = "AQ.Ab8RN6KYvi_y7SWwkPbSr4yNQBUee14nmMuJ5fFkLii4R9G8QQ";

// Utility to force IPv4 resolution of the SMTP host via dns.lookup (family: 4)
async function getSmtpHostIp(host: string): Promise<string> {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':') || host === "localhost") {
    return host;
  }
  return new Promise<string>((resolve) => {
    dns.lookup(host, { family: 4 }, (err, address) => {
      if (err) {
        console.error(`[VERIFICATION] Failed to resolve ${host} via dns.lookup (family: 4):`, err);
        resolve(host);
      } else if (address) {
        console.log(`[VERIFICATION] Resolved ${host} to IPv4: ${address} via dns.lookup`);
        resolve(address);
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
  const allKeys = [process.env.GEMINI_API_KEY, USER_KEY]
    .filter(Boolean)
    .filter((key) => key && key.startsWith("AIza")) as string[];
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

// Helper to trigger email send asynchronously in background
function asyncSendVerificationEmail(email: string, code: string) {
  const smtpFrom = '"Suporte Wolkstore" <support@wolkstore.shop>';
  const subject = `${code} é seu código de verificação para o Performance Analyst FC 26`;
  const textContent = `Olá!\n\nSeu código de verificação para criar sua conta no Performance Analyst FC 26 é: ${code}\n\nEste código expira em 15 minutos.\n\nSe você não solicitou este código, por favor desconsidere este e-mail.`;
  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 25px; border: 1px solid #222; border-radius: 16px; background-color: #0c0c0e; color: #e0e0e0; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <div style="text-align: center; border-bottom: 1px solid #222; padding-bottom: 15px; margin-bottom: 20px;">
        <h2 style="color: #ccff00; margin: 0; font-family: sans-serif; font-size: 20px; font-weight: 800; letter-spacing: -1px; text-transform: uppercase;">PERFORMANCE ANALYST FC 26</h2>
        <p style="color: #888; font-size: 9px; margin: 5px 0 0 0; font-family: monospace; letter-spacing: 2px;">ANALYST PLATFORM // FC 26</p>
      </div>
      <div style="padding: 10px 0; text-align: center;">
        <p style="font-size: 15px; line-height: 1.6; color: #e2e2e7; text-align: left; margin-bottom: 20px;">Olá!</p>
        <p style="font-size: 14px; line-height: 1.6; color: #c0c0c8; text-align: left; margin-bottom: 25px;">Seu código de verificação de segurança para registrar sua conta no site <a href="https://wolkstore.shop" style="color: #ccff00; text-decoration: none; font-weight: bold;">wolkstore.shop</a> é:</p>
        
        <div style="margin: 30px auto; padding: 20px; background-color: #121215; border: 1px solid #222; border-radius: 12px; display: inline-block; min-width: 240px; box-shadow: inset 0 2px 8px rgba(0,0,0,0.4);">
          <span style="font-size: 38px; font-weight: 900; font-family: monospace; letter-spacing: 6px; color: #ccff00; user-select: all; -webkit-user-select: all; -moz-user-select: all; -ms-user-select: all; cursor: pointer; display: block; text-align: center;" title="Clique duplo para copiar">${code}</span>
        </div>
        
        <p style="font-size: 12px; color: #71717a; text-align: center; margin-top: 25px;">Este código expira em <strong>15 minutos</strong> por motivos estritos de segurança.</p>
        <p style="font-size: 11px; color: #a1a1aa; text-align: center; margin-top: 5px; font-style: italic;">Dica: Você pode dar um duplo clique no código acima para selecioná-lo e copiá-lo facilmente (Ctrl+C).</p>
      </div>
      <div style="border-top: 1px solid #222; padding-top: 20px; margin-top: 25px; font-size: 11px; color: #52525b; text-align: center; line-height: 1.5;">
        Se você não solicitou este e-mail, apenas ignore-o com segurança.<br>
        <span style="color: #3f3f46;">© 2026 Comunidade FC Legacy & Wolkstore. Todos os direitos reservados.</span>
      </div>
    </div>
  `;

  const resendClient = getResendClient();
  if (resendClient) {
    console.log(`[VERIFICATION] Triggering Resend email send asynchronously to ${email}`);
    resendClient.emails.send({
      from: 'Suporte Wolkstore <support@wolkstore.shop>',
      to: email,
      subject: subject,
      html: htmlContent,
      text: textContent,
    })
    .then((data) => {
      console.log(`[VERIFICATION] Resend email sent successfully for ${email}:`, data);
    })
    .catch((err) => {
      console.error(`[VERIFICATION] Resend API Error for ${email}:`, err);
    });
  } else {
    // Graceful fallback to Nodemailer SMTP if configured, else logging only
    const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
    const emailPass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
    if (emailUser && emailPass) {
      console.log(`[VERIFICATION] Resend not configured. Triggering Nodemailer SMTP send asynchronously to ${email}`);
      getSmtpHostIp('smtp.hostinger.com').then((resolvedHost) => {
        const transporter = nodemailer.createTransport({
          host: resolvedHost,
          port: 465,
          secure: true,
          auth: {
            user: emailUser,
            pass: emailPass,
          },
          connectionTimeout: 10000,
          family: 4,
          tls: {
            servername: 'smtp.hostinger.com',
          }
        } as any);

        transporter.sendMail({
          from: smtpFrom,
          replyTo: 'support@wolkstore.shop',
          to: email,
          subject: subject,
          text: textContent,
          html: htmlContent,
        }).then((info) => {
          console.log(`[VERIFICATION] SMTP Success for ${email}:`, info.messageId);
        }).catch((err) => {
          console.error(`[VERIFICATION] SMTP Error for ${email}:`, err);
        });
      }).catch((err) => {
        console.error(`[VERIFICATION] SMTP Host resolution failed for ${email}:`, err);
      });
    } else {
      console.log(`[VERIFICATION] WARNING: Neither Resend nor SMTP is configured in .env. Falling back to debug mode. Code for ${email} is: ${code}`);
    }
  }
}

// API routes registered BEFORE Vite middleware
app.post("/api/send-verification-code", async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "E-mail inválido." });
  }

  // Generate 6-digit random code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  // Expires in 15 minutes as per strict requirement
  const expiresAt = Date.now() + 15 * 60 * 1000;
  
  verificationCodes.set(email.toLowerCase(), { code, expiresAt });

  console.log(`[VERIFICATION] Code generated for ${email}: ${code} (Expires in 15 mins)`);

  // Trigger dispatch in background (non-blocking)
  asyncSendVerificationEmail(email.toLowerCase(), code);

  const hasConfig = !!(process.env.RESEND_API_KEY || (process.env.EMAIL_USER && process.env.EMAIL_PASS));

  // Return HTTP 200 immediately (success) without awaiting email dispatch
  return res.json({
    success: true,
    emailSent: hasConfig,
    debugMode: !hasConfig,
    code: !hasConfig ? code : undefined,
    message: hasConfig 
      ? "Código enviado com sucesso para seu e-mail!" 
      : "Código gerado com sucesso! (Modo Desenvolvimento)",
  });
});

// Resend Code route (both /resend-code and /api/resend-code)
const handleResendCode = async (req: express.Request, res: express.Response) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "E-mail inválido." });
  }

  // Invalidate any older code
  verificationCodes.delete(email.toLowerCase());

  // Generate brand new 6-digit random code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  // Expires in 15 minutes
  const expiresAt = Date.now() + 15 * 60 * 1000;
  
  verificationCodes.set(email.toLowerCase(), { code, expiresAt });

  console.log(`[VERIFICATION RESEND] New code generated for ${email}: ${code} (Expires in 15 mins)`);

  // Trigger dispatch in background (non-blocking)
  asyncSendVerificationEmail(email.toLowerCase(), code);

  const hasConfig = !!(process.env.RESEND_API_KEY || (process.env.EMAIL_USER && process.env.EMAIL_PASS));

  return res.json({
    success: true,
    emailSent: hasConfig,
    debugMode: !hasConfig,
    code: !hasConfig ? code : undefined,
    message: hasConfig 
      ? "Um novo código de verificação foi enviado para o seu e-mail!" 
      : "Novo código gerado com sucesso! (Modo Desenvolvimento)",
  });
};

app.post("/api/resend-code", handleResendCode);
app.post("/resend-code", handleResendCode);

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

app.get("/api/random-preset", async (req, res) => {
  try {
    const KEYS_TO_TRY = getHealthyKeys();
    let success = false;
    let resultJson: any = null;

    if (KEYS_TO_TRY.length > 0) {
      const creativeSeed = Math.random().toString(36).substring(7);
      const prompt = `Gere uma sugestão de dados básicos para um novo jogador de futebol fictício realista para o ano de 2026.
Você deve inventar um jogador com um nome comum e realista baseado no país de origem.
ATENÇÃO EXTREMA: O nome em 'suggestedName' DEVE ser um nome e sobrenome comum/fictício e realista (ex: João Silva, Lucas Santos, Pedro Oliveira) e NUNCA o nome de um jogador de futebol profissional real ou famoso (evite nomes como Enzo Fernandez, Marcus Rashford, Thiago Almada, etc.). Queremos nomes de pessoas normais que poderiam ser jogadores novos e inéditos.
Retorne um JSON contendo:
- suggestedName: Um nome completo (fictício e realista) baseado no país de origem (evite nomes ultra clichês, gere nomes variados, elegantes e originais de pessoas comuns).
- nationality: Um país de futebol real (ex: Brasil, Portugal, Espanha, Argentina, França, Alemanha, Itália, Holanda, Bélgica, Inglaterra, Uruguai, etc.).
- position: Uma posição de futebol realista em português (ex: Ponta Esquerda, Ponta Direita, Centroavante, Meio-campista Armador, Segundo Volante, Zagueiro Imperial, Lateral Ofensivo, etc.).
- preferredClub: Um clube de futebol do mundo real ativo em 2026 coerente com grandes ligas globais (ex: Real Madrid CF, Barcelona, Bayern München, Palmeiras, Flamengo, Manchester City, Arsenal, Juventus, etc.).
- personalityType: Uma personalidade marcante (ex: "Marrento & Confiante", "Ousado & Provocador", "Bad Boy", "Focado & Frio", "Líder Nato", "Cria de Favela").

Use a semente criativa "${creativeSeed}" para garantir que cada vez que este prompt rodar, um jogador totalmente inédito e diferente seja gerado. Nunca repita o mesmo jogador ou os mesmos clubes.
Retorne APENAS o JSON cru válido, sem marcação de markdown (sem \`\`\`json):
{
  "suggestedName": "...",
  "nationality": "...",
  "position": "...",
  "preferredClub": "...",
  "personalityType": "..."
}`;

      for (const key of KEYS_TO_TRY) {
        try {
          const client = getGeminiClient(key);
          const response = await withTimeout(
            client.models.generateContent({
              model: "gemini-3.5-flash",
              contents: prompt,
              config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: "application/json",
                temperature: 1.0,
              }
            }),
            5000
          );
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
          if (resultJson && resultJson.suggestedName) {
            success = true;
            break;
          }
        } catch (err) {
          console.error("Erro ao gerar preset aleatório com Gemini:", err);
        }
      }
    }

    if (success && resultJson) {
      return res.json(resultJson);
    }

    // Static fallback if AI fails or no keys - strictly common names, NOT real famous soccer players
    const fallbackNamesByNationality: Record<string, string[]> = {
      "Brasil": ["Lucas Silva", "Matheus Santos", "Gabriel Oliveira", "Felipe Souza", "Rodrigo Costa", "Bruno Pereira", "Thiago Rodrigues", "Rafael Almeida", "Gustavo Nascimento", "Diego Carvalho", "Arthur Melo", "Vitor Lima", "André Ramos"],
      "Portugal": ["Bernardo Silva", "Diogo Neves", "Martim Costa", "Gonçalo Ferreira", "Rui Santos", "Tomé Antunes", "Nuno Pinheiro", "Simão Rocha", "Miguel Sousa"],
      "Espanha": ["Hugo Gómez", "Mateo Fernández", "Lucas Martín", "Daniel Ruiz", "Álvaro Navarro", "Marcos Sanz", "Adrián Torres", "Diego Díaz", "Pablo Serrano", "Javier Romero"],
      "Argentina": ["Mateo Carrizo", "Bautista Benítez", "Thiago Domínguez", "Lautaro Maidana", "Enzo Acuña", "Valentín Romero", "Santino Cabrera", "Ignacio Medina"],
      "França": ["Enzo Dubois", "Hugo Lambert", "Lucas Moreau", "Arthur Robert", "Mathis Richard", "Clément Petit", "Thomas Lemaire", "Maxence Laurent"],
      "Itália": ["Lorenzo Rossi", "Leonardo Ferrari", "Mattia Russo", "Alessandro Bianchi", "Gabriele Romano", "Riccardo Colombo", "Tommaso Ricci"],
      "Alemanha": ["Leon Müller", "Finn Schmidt", "Jonas Schneider", "Lukas Fischer", "Ben Weber", "Noah Meyer", "Maximilian Wagner"],
      "Inglaterra": ["Oliver Smith", "George Taylor", "Harry Jones", "Jack Brown", "Charlie Davies", "Thomas Evans", "William Wilson"],
      "Uruguai": ["Mateo Pereyra", "Sebastian Coates", "Joaquin Silva", "Felipe Mendez", "Santiago Rodriguez"],
      "Bélgica": ["Arthur Peeters", "Lucas Janssens", "Liam Maes", "Noah Jacobs", "Finn Mertens"]
    };

    const fallbackNationalities = Object.keys(fallbackNamesByNationality);
    const chosenNationality = fallbackNationalities[Math.floor(Math.random() * fallbackNationalities.length)];
    const namesList = fallbackNamesByNationality[chosenNationality];
    const suggestedName = namesList[Math.floor(Math.random() * namesList.length)];

    const fallbackPositions = ["Ponta Esquerda", "Ponta Direita", "Centroavante", "Meio-campista Armador", "Segundo Volante", "Zagueiro Imperial", "Lateral Ofensivo"];
    const fallbackClubs = [
      "Real Madrid CF", "FC Barcelona", "Manchester City FC", "Paris Saint-Germain", 
      "Juventus FC", "FC Bayern München", "Arsenal FC", "Liverpool FC", "AC Milan", "Inter de Milão", "Atlético de Madrid",
      "Palmeiras", "Flamengo", "Vasco da Gama", "Cruzeiro", "Grêmio", "Internacional", "Fluminense", "São Paulo FC"
    ];
    const fallbackPersonalities = ["Marrento & Confiante", "Ousado & Provocador", "Bad Boy", "Focado & Frio", "Líder Nato", "Cria de Favela"];

    return res.json({
      suggestedName,
      nationality: chosenNationality,
      position: fallbackPositions[Math.floor(Math.random() * fallbackPositions.length)],
      preferredClub: fallbackClubs[Math.floor(Math.random() * fallbackClubs.length)],
      personalityType: fallbackPersonalities[Math.floor(Math.random() * fallbackPersonalities.length)],
    });
  } catch (error: any) {
    console.error("Erro geral no endpoint /api/random-preset:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});

app.post("/api/generate-player", async (req, res) => {
  const { nationality, position, preferredClub, suggestedName, personalityType } = req.body;
  const creativeSeed = Math.random().toString(36).substring(7);

  // Early name generation & resolution based on selected nationality for prompt precision
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

  const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const generateNameByNat = (natStr: string): string => {
    const nat = (natStr || "").toLowerCase();
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

  const resolvedNat = nationality || "Brasil";
  const resolvedName = suggestedName || generateNameByNat(resolvedNat);
  const resolvedPos = position || "Ponta Esquerda";
  const resolvedClub = preferredClub || "Real Madrid CF";
  const resolvedStyle = personalityType || "Marrento";

  // Dynamic plot and story elements for maximum originality
  const childhoodLore = [
    "Cresceu jogando futebol descalço nas areias da praia e vendendo picolés para ajudar sua família humilde antes de ser descoberto por acaso.",
    "Filho de um ex-mestre de xadrez de alta categoria nacional, o que lhe conferiu uma inteligência tática genial e controle emocional sob pressão extrema.",
    "Criado por sua avó batalhadora no interior, que vendia pastéis caseiros para financiar suas passagens de ônibus até as peneiras de base.",
    "Sobreviveu a uma grave lesão de crescimento aos 14 anos, superando previsões médicas desfavoráveis com pura garra para se tornar destaque.",
    "Iniciou no futsal de quadra áspera onde desenvolveu um repertório extraordinário de dribles curtos em espaços minúsculos sob o apelido de 'Liso'.",
    "Vindo de uma linhagem de corredores de elite (atletismo nacional), o que explica seu arranque explosivo e aceleração supersônica em campo.",
    "Foi recusado por três grandes clubes na infância por ser considerado muito magro, dando a ele uma sede implacável de provar seu valor real.",
    "Aprendeu futebol de rua jogando contra imigrantes de várias origens, o que o tornou um jogador com estilo híbrido de drible plástico e força física.",
    "Sua infância foi em um bairro operário humilde cercado por estaleiros navais, onde seu pai trabalhava como soldador e o ensinou a ser focado.",
    "Descoberto por acaso por meio de um vídeo viral do YouTube fazendo embaixadinhas acrobáticas perfeitas com uma laranja no pátio da escola."
  ];

  const traitLore = [
    "É um pianista amador talentoso e toca Chopin ou Beethoven no vestiário antes das partidas decisivas da Champions League para relaxar e focar.",
    "Tem uma superstição rígida de entrar no gramado saltando com o pé esquerdo exatamente três vezes e usa uma munhequeira especial feita por sua mãe.",
    "Dono de um estilo visual rebelde e muito marcante, com dreadlocks customizados de pontas coloridas e fã fervoroso de rap underground.",
    "É fascinado por moda de altíssimo padrão, desenha suas próprias roupas exclusivas e costuma sentar na primeira fileira da Paris Fashion Week.",
    "Um entusiasta secreto de astronomia, possuindo um telescópio profissional na cobertura de sua mansão para observar estrelas nas folgas de folha.",
    "Adota uma comemoração de gol icônica e teatral imitando um 'lobo solitário' uivando para as arquibancadas rivais para calá-las de vez.",
    "Ele é obcecado por colecionar carros clássicos e vintage restaurados dos anos 80, preferindo pilotá-los ao invés dos hipercarros modernos.",
    "Pratica meditação zen profunda e ioga antes do treino principal para refinar seu equilíbrio corporal inacreditável e reflexos absurdos.",
    "Mantém um diário físico escrito à mão em couro onde anota cada gol, drible e passe que pretende executar nas partidas importantes.",
    "Desenvolveu um drible de assinatura exclusivo apelidado de 'compasso', girando 360 graus sobre a bola e deixando defensores no chão."
  ];

  const controversyLore = [
    "Adotou legalmente um tigre de bengala resgatado de um santuário de vida selvagem de Dubai, gerando enorme polêmica e engajamento online.",
    "Recusou publicamente um patrocínio milionário de uma rede de fast-food para manter sua filosofia alimentar 100% orgânica e focada.",
    "Envolveu-se em um debate acalorado com a imprensa por ter sido visto jogando pôquer de alta aposta com astros de Hollywood em Mônaco.",
    "Usou todo o seu primeiro bônus milionário de assinatura de contrato para comprar uma frota nova de barcos de pesca para a sua comunidade de origem.",
    "Conhecido por dar respostas extremamente curtas, irônicas e de tom filosófico nas coletivas pós-jogo, deixando repórteres estupefatos.",
    "Mantém uma rivalidade saudável mas intensamente provocativa no Instagram com o zagueiro mais caro e marrento do clube rival direto.",
    "Criou sua própria marca exclusiva de café gourmet colhido na fazenda de sua família e exige que sirvam apenas seu café no clube.",
    "Costuma doar metade de seus prêmios financeiros de 'Melhor da Partida' para abrigos locais de animais de rua sem divulgar à mídia.",
    "Instigou boatos intensos com uma modelo internacional ao curtir 15 publicações antigas dela no Instagram nas primeiras horas da madrugada.",
    "Gosta de transmitir partidas online de videogame com fãs selecionados aleatoriamente nas redes sociais nas noites seguintes às partidas."
  ];

  const pathLore = [
    "Teve uma passagem meteórica e espetacular pelo futebol do leste europeu antes de ser comprado a peso de ouro pelo seu clube atual.",
    "Foi comprado muito jovem por um grupo de investimentos e emprestado para times menores de ligas alternativas até explodir de forma devastadora.",
    "Sua transferência para o gigante atual envolveu uma novela dramática que durou o verão inteiro, gerando manifestação de torcedores.",
    "Recusou uma oferta financeira oficial estrondosa da Arábia Saudita, declarando que seu único foco é reinar no futebol do continente europeu.",
    "Passou pelas divisões de base do rival histórico direto, o que torna cada clássico uma verdadeira atmosfera de caldeirão e polêmica no país.",
    "Estreou profissionalmente jogando improvisado em uma posição defensiva e acabou marcando três gols geniais nos primeiros 30 minutos.",
    "Tornou-se o atleta mais jovem da história de seu país a capitanear o time titular em uma final de competição internacional.",
    "Foi negociado com a cláusula especial exigindo que o clube comprador construa e equipe dois campos esportivos para jovens carentes em sua cidade natal.",
    "Sua trajetória virou foco após marcar um gol espetacular de calcanhar do meio da área na final de um torneio de pré-temporada nos EUA.",
    "Assinou o contrato com a indicação direta e benção pessoal de uma lenda absoluta de seu país que o considerou seu sucessor natural."
  ];

  const child = pickRandom(childhoodLore);
  const trait = pickRandom(traitLore);
  const controversy = pickRandom(controversyLore);
  const path = pickRandom(pathLore);

  const dynamicEnredoSeed = `Enredo de Vida Único: [Origem: ${child}] [Estilo/Quirk: ${trait}] [Destaque Extra: ${controversy}] [Novela de Carreira: ${path}]`;

  const prompt = `Você é o motor de Inteligência Artificial exclusivo do projeto "Performance Analyst FC 26", uma plataforma de comunidade gamer full web hospedada no domínio wolkstore.shop. Sua única e exclusiva função é gerar a ficha biográfica de novos jogadores de futebol fictícios altamente realistas e detalhados para os usuários do site.

REGRAS DE OPERAÇÃO OBRIGATÓRIAS DE VARIABILIDADE E EXCLUSIVIDADE:
1. Você deve utilizar a ferramenta Google Search integrada para buscar dados e fatos reais do ano de 2026 (como rumores, modelos de carros reais superesportivos de 2026, celebridades em alta, patrocinadores, elencos e times de futebol vigentes em 2026).
2. Siga o tom marrento, detalhado, confiante, arrogante, provocador, focado, ostentador e extremamente realista baseado no exemplo do jogador "Tomás Duarte".
3. Responda rigorosamente às 20 perguntas na ordem e numeração corretas dentro do objeto "perfil_completo_20_perguntas".
4. Baseado no país do clube atual/inicial gerado, inclua no JSON uma lista de sugestões com os nomes reais dos principais campeonatos oficiais daquele país para alimentar o seletor de torneios do usuário.
5. Sua resposta deve ser estritamente em formato JSON limpo, sem textos introdutórios ou conclusivos (NÃO inclua blocos de markdown com \`\`\`json, retorne apenas o texto cru do JSON válido).
6. CRÍTICO: Cada jogador gerado deve ser COMPLETAMENTE ÚNICO, diferente de qualquer resposta anterior. Você deve construir as respostas baseando-se EXCLUSIVAMENTE nas diretrizes do Enredo de Vida Único abaixo. Não use textos prontos, fórmulas prontas ou clichês comuns de futebol. Gere parágrafos totalmente novos, ricos em detalhes, piadas, marcas e rumores personalizados do ano de 2026 para este jogador específico, utilizando a semente de criatividade aleatória "${creativeSeed}" para forçar uma geração inovadora e inédita. Cite nominalmente o jogador, seu clube, sua posição e sua nacionalidade ao longo do texto.

ENREDO DE VIDA ÚNICO DESTE JOGADOR (OBRIGATÓRIO EXPANDIR E INCORPORAR DETALHADAMENTE NAS RESPOSTAS):
${dynamicEnredoSeed}

Parâmetros do jogador a ser gerado:
- Nome/Apelido Sugerido: ${resolvedName}
- Nacionalidade: ${resolvedNat}
- Posição: ${resolvedPos}
- Clube Atual/Inicial: ${resolvedClub}
- Estilo/Personalidade extra: ${resolvedStyle}

Responda detalhadamente a cada uma das 20 perguntas na ordem exata:
1_personalidade: Descrição detalhada da personalidade confiante, marrenta, focada, que sabe que é o melhor, misturando os quirks de estilo de vida descritos no Enredo de Vida Único.
2_amigos_reais: Lista de jogadores de futebol reais e celebridades reais que andam com ele in 2026 (ex: Neymar Jr, Rafael Leão, Bellingham, Haaland, etc.).
3_namorada_real: Nome de namorada famosa real do mundo das celebridades (modelos, atrizes, cantoras, influencers de destaque in 2026). Explique os rumores de romance na mídia de fofoca.
4_situacao_financeira: Ostentação do maior salário, investimentos imobiliários sofisticados (ex: Dubai, Lisboa, Ibiza, etc.).
5_historia_de_vida: Origem humilde ou marcante baseada especificamente na Origem e no Caminho da Carreira do Enredo de Vida Único. Explique sua ascensão meteórica e venda recorde (em valores realistas de milhões de euros) para o gigante europeu atual.
6_vivia_bem: Detalhes das mansões extravagantes, jatos privados, férias em destinos badalados de acordo com suas preferências e hobbies descritos no Enredo.
7_relacao_familiar: Relação afetada pela fama ultra-rápida, viagens, mas mantendo suporte financeiro pesado e de acordo com a origem do Enredo de Vida Único.
8_comportamento: Atitude ousada em campo (comemorações icônicas descritas no Enredo de Vida Único, calando rivais, chutando a bandeira) e polêmicas saudáveis fora de campo.
9_fortuna_e_carros_reais: Fortuna total estimada e sua coleção real de carros superesportivos modernos e reais de 2026, respeitando a preferência por clássicos se descrita no Enredo de Vida Único.
10_patrocinios_reais: Lista de patrocinadores de peso reais (Nike, EA Sports, Louis Vuitton, Red Bull, etc.).
11_expectativa_carreira: Projetado como o próximo Bola de Ouro, sucessor das lendas do seu país de origem.
12_desempenho_campo: Estilo técnico de excelência, drible humilhante, velocidade insana e frieza em finais.
13_clubes_europa: Lista cronológica de clubes europeus pelos quais passou até chegar ao topo.
14_clube_atual: Detalhes do clube onde atua em 2026 e o número histórico da camisa.
15_estilo_altura_idolos: Posição favorita, altura realista, e lista de ídolos lendários em quem se inspira (ex: Cristiano Ronaldo, Ronaldinho, Romário, Zidane, etc.).
16_relacionamentos_elenco: Convivência com o elenco (respeitado pelos craques, idolatrado pela torcida, o terror das torcidas rivais).
17_satisfacao_clube: Amor pelo clube atual, recusa de propostas absurdas do futebol saudita ou de outros países, foco em conquistar a Champions League.
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

  let success = false;
  let resultJson: any = null;
  let lastError: any = null;

  // 1. Tentar chaves Gemini FIRST (Estratégias otimizadas e rápidas)
  const KEYS_TO_TRY = getHealthyKeys();
  if (KEYS_TO_TRY.length > 0) {
    console.log("[PIPELINE] Iniciando com as chaves Gemini...");
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
          timeout: 10000,
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
          timeout: 6000,
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
          timeout: 5000,
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
    console.log("[PIPELINE] Nenhuma chave Gemini saudável/válida localizada. Pulando etapa Gemini.");
  }

  // 2. Fallback para Pollinations AI (apenas 1 modelo rápido com timeout ultrabaixo caso Gemini falhe)
  if (!success) {
    console.log("[PIPELINE] Fallback: Tentando Pollinations AI (Modelo Rápido, Timeout 3s)...");
    try {
      const model = "openai";
      const responseText = await withTimeout(
        (async () => {
          const url = "https://text.pollinations.ai/";
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              messages: [
                {
                  role: "system",
                  content: "Você é o motor FCLegacy. Responda APENAS com um bloco JSON válido contendo o perfil gerado, exatamente conforme o formato solicitado. Sem conversas, sem explicações, e sem tags de bloco markdown."
                },
                {
                  role: "user",
                  content: prompt
                }
              ],
              model: model,
              jsonMode: true
            })
          });
          if (!response.ok) {
            throw new Error(`Pollinations API retornou status ${response.status}`);
          }
          return await response.text();
        })(),
        3000
      );

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
      if (resultJson && (resultJson.nome_jogador || resultJson.perfil_completo_20_perguntas)) {
        success = true;
        console.log(`[PIPELINE] Sucesso gerando perfil com Pollinations AI (${model})!`);
      } else {
        throw new Error("JSON gerado está incompleto.");
      }
    } catch (err: any) {
      console.log(`[PIPELINE] Falha no fallback rápido Pollinations AI:`, err.message || err);
      lastError = err;
    }
  }

  if (success && resultJson) {
    return res.json(resultJson);
  }

  // 3. Se tudo falhar, usar o gerador inteligente estático de emergência
  console.log("Aviso: Todos os canais remotos de IA retornaram indisponibilidade temporária de serviço. Ativando contingência estática local inteligente de segurança...");
  try {
    const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const shuffleArray = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);
    const pickMultiple = <T>(arr: T[], count: number): T[] => shuffleArray(arr).slice(0, count);

    // Q1_PERSONALIDADE - Dynamic combinations for unique personality descriptions
    const persA = [
      `Dono de uma marra incomparável e autoconfiança inabalável, `,
      `Com uma presença magnética e postura confiante, `,
      `Sempre provocador e consciente de seu enorme talento, `,
      `Extremamente focado e marrento na medida certa, `,
      `Com uma mentalidade vencedora e estilo audacioso, `,
      `Exalando uma autoconfiança de aço que beira o atrevimento, `
    ];
    const persB = [
      `${resolvedName} sabe perfeitamente que nasceu para reinar no topo do futebol mundial. `,
      `${resolvedName} simplesmente ignora os críticos e foca exclusivamente em dar seu show. `,
      `${resolvedName} trata o gramado europeu como seu palco particular de entretenimento. `,
      `${resolvedName} se declara abertamente o melhor da sua geração, sem qualquer falsa modéstia. `,
      `${resolvedName} domina os holofotes com seu carisma forte e estilo altamente rebelde. `,
      `${resolvedName} joga sorrindo e provocando, deixando os defensores rivais totalmente desestabilizados. `
    ];
    const persC = [
      `Ele encara os adversários olho no olho e treina de forma obsessiva para se manter impecável.`,
      `Vive sob a convicção de que o topo é o seu lugar de direito, comandando o elenco com liderança indomável.`,
      `Adora inflamar clássicos com declarações marrentas, mas entrega exibições geniais dentro de campo.`,
      `Não aceita nada menos que a perfeição, refinando seu drible plástico e categoria refinada diariamente.`,
      `Mistura o rigor tático de um craque com a atitude ousada de um astro do rock na posição de ${resolvedPos.toLowerCase()}.`
    ];
    const personalityText = `${pickRandom(persA)}${pickRandom(persB)}${pickRandom(persC)}`;

    // Q2_AMIGOS_REAIS
    const possibleFriends = [
      "Jude Bellingham", "Neymar Jr", "Rafael Leão", "Vinicius Jr", "Erling Haaland", 
      "Phil Foden", "Cole Palmer", "Bukayo Saka", "Jack Grealish", "Rodrygo Goes", 
      "Endrick", "Lamine Yamal", "Gavi", "Pedri", "Kylian Mbappé", "Ousmane Dembélé",
      "Marcus Rashford", "Alexander-Arnold", "Declan Rice", "Florian Wirtz", "Jamal Musiala"
    ];
    const friends = pickMultiple(possibleFriends, 4 + Math.floor(Math.random() * 2));

    // Q3_NAMORADA_REAL
    const girlfriends = [
      "Valentina Zenere", "Clara Galle", "Marta Díaz", "Sydney Sweeney", "Olivia Rodrigo", 
      "Aitana", "Bruna Biancardi", "Julia Rodrigues", "Kika Cerqueira Gomes", "Margaret"
    ];
    const gfRumorsA = [
      ` estão sob fortes holofotes. Tabloides afirmam que o romance começou em uma festa fechada de alta costura em Paris e que viajam juntos nas folgas.`,
      ` viraram o assunto principal da imprensa espanhola. Paparazzis flagraram o casal curtindo o mar a bordo de um superiate luxuoso em Ibiza.`,
      ` estão vivendo um romance discreto mas badalado. O jogador chegou a reservar um restaurante inteiro em Milão para um jantar secreto a dois.`,
      ` agitaram os tabloides britânicos recentemente. Jornais de fofocas afirmam que o jogador comprou um camarote inteiro exclusivo para assistir ao desfile dela.`,
      ` confirmaram indiretamente a relação após constantes trocas de comentários com emojis de coração e flagras frequentes em cafés finos de Madri.`,
      ` são apontados por jornais locais como o novo casal mais charmoso do jet set europeu de 2026, após serem vistos juntos em eventos VIP.`
    ];
    const girlfriendText = `${pickRandom(girlfriends)}. Os rumores de romance com ${resolvedName}${pickRandom(gfRumorsA)}`;

    // Q4_SITUACAO_FINANCEIRA
    const finA = [
      `Ganha um salário astronômico condizente com uma superestrela mundial de elite no ${resolvedClub}. `,
      `Seu contrato espetacular com o ${resolvedClub} em 2026 garante rendimentos mensais absurdos de milhões de euros. `,
      `Financeiramente intocável, o craque consolidou um patrimônio colossal que cresce em ritmo impressionante. `,
      `Faturando valores astronômicos, ele figura entre os jovens atletas mais bem pagos do planeta. `
    ];
    const finB = [
      `${resolvedName} investiu pesado adquirindo uma cobertura cinematográfica avaliada em mais de €18 milhões em Dubai Marina. `,
      `Ele adquiriu um resort exclusivo de ultraluxo na paradisíaca ilha de Bali para desfrutar com amigos. `,
      `O jogador comprou uma propriedade de altíssimo padrão com projeto arquitetônico futurista na Suíça. `,
      `Ele diversificou seus lucros criando sua própria holding imobiliária de alto luxo em Ibiza e Lisboa. `
    ];
    const finC = [
      `Além disso, ele administra marcas de roupas exclusivas e investe em startups tecnológicas de análise esportiva.`,
      `Seu portfólio inclui carros raros de coleção e investimentos robustos em fundos imobiliários suíços.`,
      `Suas campanhas publicitárias globais dobram seus rendimentos anuais, consolidando seu império financeiro.`,
      `Sua fortuna é gerida por consultores internacionais para garantir seu reinado absoluto fora dos gramados.`
    ];
    const financialText = `${pickRandom(finA)}${pickRandom(finB)}${pickRandom(finC)}`;

    // Q5_HISTORIA_DE_VIDA
    const histA = [
      `Cresceu driblando garotos muito maiores no futebol de rua e nas quadras de areia de sua terra natal. `,
      `Formado nas categorias de base tradicionais, chamou a atenção desde muito jovem por sua genialidade nata com a bola. `,
      `Vindo de origens humildes e de uma família extremamente batalhadora, jogava com chuteiras emprestadas no início. `,
      `Superou severas dificuldades na infância e problemas físicos graças ao apoio de uma escolinha local de futebol. `
    ];
    const histB = [
      `Estreou profissionalmente quebrando recordes de precocidade e marcando gols antológicos que rodaram o mundo. `,
      `Subiu ao time principal como a maior revelação do país e logo liderou a equipe a conquistas marcantes. `,
      `Sua ascensão fulminante virou alvo de uma disputa bilionária acirrada entre os maiores colossos da Europa. `,
      `Liderou as estatísticas nacionais de dribles e passes de gol, chamando a atenção imediata dos olheiros da Europa. `
    ];
    const histC = [
      `Sua ida ao ${resolvedClub} foi concretizada em uma transação chocante de €105 milhões de euros.`,
      `O gigante europeu atual pagou sua multa rescisória recorde de €95 milhões de euros para garantir seu talento como ${resolvedPos.toLowerCase()}.`,
      `Desembarcou no futebol europeu a preço de ouro para se tornar o grande astro da camisa do ${resolvedClub}.`,
      `Sua ascensão confirma que a monumental aposta financeira do ${resolvedClub} em seu futebol foi inteiramente merecida.`
    ];
    const historyText = `${pickRandom(histA)}${pickRandom(histB)}${pickRandom(histC)}`;

    // Q6_VIVIA_BEM
    const liveA = [
      `Mora em uma mansão cinematográfica ultraprotegida nos arredores de seu clube. `,
      `Vive cercado pela excelência máxima em uma residência de luxo com cinema privado e heliponto. `,
      `Sua propriedade conta com campo de futebol society oficial, simulador de Fórmula 1 e adega climatizada. `
    ];
    const liveB = [
      `Utiliza jatos executivos fretados de última geração para curtir folgas em Saint-Tropez, Miami ou Aspen. `,
      `Viaja a bordo de iates de luxo navegando com amigos pela badalada Costa Amalfitana e ilhas gregas. `,
      `Passa suas folgas de verão em bangalôs cinematográficos flutuantes nas praias exclusivas das Maldivas. `
    ];
    const liveC = [
      `Sempre cercado de parças e convidados do alto escalão do entretenimento mundial.`,
      `Suas festas particulares exclusivas reúnem as maiores celebridades internacionais do ano de 2026.`,
      `O craque esbanja classe e define padrões elevados de sofisticação para a nova geração.`
    ];
    const livingText = `${pickRandom(liveA)}${pickRandom(liveB)}${pickRandom(liveC)}`;

    // Q7_RELACAO_FAMILIAR
    const famA = [
      `Apesar da rotina insana e do inevitável distanciamento físico pelas viagens, mantém laços inquebráveis. `,
      `A fama ultra-rápida impôs desafios de convivência, mas ele protege sua família com prioridade absoluta. `,
      `Blindou sua relação familiar contra o assédio oportunista de fofocas com extremo rigor. `
    ];
    const famB = [
      `Presenteou seus pais com propriedades espetaculares de alto padrão e carros modernos em sua terra natal. `,
      `Seus familiares gerenciam diretamente sua holding financeira e acompanham seus contratos corporativos de perto. `,
      `Ele garante passagens aéreas de primeira classe e estadias luxuosas para ter os pais em todos os seus jogos decisivos. `
    ];
    const famC = [
      `Faz questão de comemorar todas as datas festivas reunido com eles, mantendo os pés bem fincados no chão.`,
      `Financiou projetos sociais inovadores propostos por seus irmãos para ajudar comunidades carentes de onde veio.`,
      `A fortuna colossal serve como suporte incondicional para garantir conforto absoluto a quem ama.`
    ];
    const familyText = `${pickRandom(famA)}${pickRandom(famB)}${pickRandom(famC)}`;

    // Q8_COMPORTAMENTO
    const behA = [
      `Dentro das quatro linhas, ele é puro espetáculo e provocação ousada. Comemora gols mandando torcidas calarem a boca e fazendo caretas. `,
      `Com estilo marrento incomparável, costuma chutar a bandeira de escanteio e comemorar gols tirando a camisa sob forte vibração. `,
      `Dono de uma intensidade marcante, encara os zagueiros sem qualquer temor e celebra com saltos acrobáticos ousados. `
    ];
    const behB = [
      `Fora de campo, frequenta desfiles de alta moda e responde a qualquer questionamento entregando exibições de gala. `,
      `Suas entrevistas pós-jogo são marcadas pela sinceridade cortante e respostas sarcásticas que divertem os fãs. `,
      `Faz questão de expor seu luxo nas redes sociais, encarando o falatório da imprensa esportiva como puro combustível. `,
      `Dá show no vestiário e nas redes, sabendo conduzir seu status de popstar internacional do esporte de 2026 com maestria. `
    ];
    const behaviorText = `${pickRandom(behA)}${pickRandom(behB)}`;

    // Q9_FORTUNA_E_CARROS_REAIS
    const carA = [
      `Seu patrimônio líquido em 2026 já ultrapassa com folga a fabulosa marca de €280 milhões de euros. `,
      `Sua fortuna total estimada por revistas conceituadas gira em torno de expressivos €315 milhões de euros. `,
      `Acumulando fortunas, ele ostenta um patrimônio estimado em mais de €340 milhões de euros. `
    ];
    const carB = [
      `Na garagem de ${resolvedName}, destacam-se a novíssima Ferrari SF90 Stradale preta fosca e um Lamborghini Revuelto personalizado. `,
      `Ele ostenta uma coleção lendária de supercarros modernos, incluindo um Bugatti Tourbillon exclusivo e um Porsche 911 GT3 RS. `,
      `Seu xodó automotivo é um raríssimo Aston Martin Valour manual, além de uma Mercedes G63 blindada para o dia a dia. `
    ];
    const carC = [
      `Cada veículo possui detalhes customizados e as iniciais de sua grife pessoal gravadas a laser.`,
      `Ele costuma trocar de veículo esportivo semanalmente para se deslocar até o centro de treinamentos do clube.`,
      `Um verdadeiro fanático por velocidade e alta potência, colecionando as melhores joias sobre quatro rodas.`
    ];
    const supercarText = `${pickRandom(carA)}${pickRandom(carB)}${pickRandom(carC)}`;

    // Q10_PATROCINIOS_REAIS
    const possibleSponsorships = [
      ["Nike (Contrato Vitalício de €16M/ano)", "Red Bull", "EA Sports FC", "Rolex"],
      ["Adidas (Principal Embaixador Global)", "Gatorade", "Louis Vuitton", "Hublot"],
      ["Puma (Linha de Chuteiras Exclusiva)", "Monster Energy", "EA Sports", "TAG Heuer"],
      ["Under Armour (Rosto da Campanha 2026)", "Pepsi Max", "Balenciaga", "Audemars Piguet"],
      ["New Balance (Contrato Premium de Elite)", "Red Bull", "EA Sports", "Oakley Eyewear"]
    ];
    const sponsorships = pickRandom(possibleSponsorships);

    // Q11_EXPECTATIVA_CARREIRA
    const expA = [
      `Apontado unanimemente por analistas mundiais como o sucessor natural ao trono de maior jogador do planeta. `,
      `Projetado pela crítica esportiva internacional como o futuro vencedor absoluto da cobiçada Bola de Ouro nos próximos anos. `,
      `Lendas lendárias do esporte de seu país apontam ${resolvedName} como um talento geracional sem precedentes na história moderna. `
    ];
    const expB = [
      `Sua meta pessoal declarada é conquistar múltiplos títulos da Champions League e cravar sua assinatura na história. `,
      `Espera-se que lidere sua seleção nacional rumo ao topo de todas as glórias e campeonatos internacionais. `,
      `Sua mentalidade implacável e frieza em finais o projetam para quebrar todos os recordes históricos de gols e conquistas. `
    ];
    const expectationsText = `${pickRandom(expA)}${pickRandom(expB)}`;

    // Q12_DESEMPENHO_CAMPO
    const perfA = [
      `Dono de arranque devastador e drible liso em espaços curtos que deixa os zagueiros adversários totalmente perdidos. `,
      `Sua inteligência tática avançada permite encontrar assistências brilhantes e espaços impossíveis para chutes cirúrgicos. `,
      `Com uma explosão muscular de elite, ele alia velocidade supersônica física com controle de bola magnético impecável. `
    ];
    const perfB = [
      `Demonstra frieza extrema cara a cara com o goleiro rival, finalizando com maestria na sua posição favorita de ${resolvedPos.toLowerCase()}.`,
      `Finaliza com precisão cirúrgica usando ambas as pernas e exibe facilidade para decidir jogos de alta pressão no terço final.`,
      `Sua eficácia nas bolas paradas e jogadas individuais desequilibra qualquer sistema defensivo montado contra o ${resolvedClub}.`
    ];
    const performanceText = `${pickRandom(perfA)}${pickRandom(perfB)}`;

    // Q13_CLUBES_EUROPA
    const possibleClubsPassed = [
      ["Clube de Formação Nacional", "Ajax Amsterdam", resolvedClub],
      ["Categorias de Base do País", "Benfica", resolvedClub],
      ["Peneira de Base Nacional", resolvedClub],
      ["Clube Revelação de Origem", "Borussia Dortmund", resolvedClub],
      ["Academia de Formação", "Sporting CP", resolvedClub]
    ];
    const clubsPassed = pickRandom(possibleClubsPassed);

    // Q14_CLUBE_ATUAL
    const clubAtualText = `${resolvedClub}. Ele brilha como o camisa 7 indiscutível e dono absoluto do ataque, idolatrado pelos torcedores que lotam o estádio todas as semanas para aplaudir seus gols decisivos.`;

    // Q15_ESTILO_ALTURA_IDOLOS
    const idolsCombos = [
      "Cristiano Ronaldo, Ronaldinho Gaúcho e Neymar Jr",
      "Lionel Messi, Zidane e Diego Maradona",
      "Ronaldo Fenômeno, Romário e Thierry Henry",
      "Zico, Pelé e Kaká",
      "Johan Cruyff, Zlatan Ibrahimovic e Ronaldinho Gaúcho"
    ];
    const idolsText = pickRandom(idolsCombos);
    const finalHeight = `${1.76 + Math.floor(Math.random() * 14) / 100} m`;
    const finalWeight = `${69 + Math.floor(Math.random() * 15)} kg`;
    const styleHeightIdolsText = `${resolvedPos} moderno de drible ousado e plasticidade ímpar. Altura: ${finalHeight}. Seus grandes ídolos inspiradores no esporte são: ${idolsText}.`;

    // Q16_RELACIONAMENTOS_ELENCO
    const relA = [
      `Visto como o verdadeiro líder técnico do vestiário do ${resolvedClub}, admirado pelos jovens talentos por sua dedicação incansável nos treinos. `,
      `Líder carismático indiscutível do elenco do ${resolvedClub}, ele comanda a resenha e o espírito vitorioso do grupo. `,
      `Seu estilo confiante e autêntico impõe respeito natural entre as estrelas e veteranos do elenco do ${resolvedClub}. `
    ];
    const relB = [
      `A torcida organizada o idolatra incondicionalmente, enquanto os defensores rivais sofrem constantemente para tentar pará-lo.`,
      `O treinador vê nele a peça tática mais letal do ataque, dando total liberdade criativa nas partidas importantes.`,
      `Ele mantém parcerias icônicas de balada e treinos pesados com os principais astros consolidados do futebol mundial.`
    ];
    const relationshipsText = `${pickRandom(relA)}${pickRandom(relB)}`;

    // Q17_SATISFACAO_CLUBE
    const satA = [
      `Declaradamente apaixonado pelo projeto de hegemonia esportiva do ${resolvedClub} e pela torcida local. `,
      `Sente-se inteiramente prestigiado em carregar a camisa mais pesada e tradicional de um clube gigante como o ${resolvedClub}. `,
      `Completamente adaptado ao país e à torcida, ele reitera semanalmente que está no clube perfeito para sua carreira. `
    ];
    const satB = [
      `Recusou propostas de salários triplicados do Oriente Médio, priorizando fazer história vencendo a Champions League na Europa.`,
      `Ignora sondagens externas de outras ligas e mantém foco inabalável em se consagrar lenda viva do futebol pelo ${resolvedClub}.`,
      `Afirma que o carinho fervoroso das arquibancadas locais é algo que nenhuma quantia de dinheiro milionária consegue pagar.`
    ];
    const satisfactionText = `${pickRandom(satA)}${pickRandom(satB)}`;

    // Q18_TIME_DO_CORACAO
    const heartClubText = `O clássico ${clubsPassed[0]} que o acolheu em sua infância e deu as primeiras oportunidades grandiosas nos gramados.`;

    // Q19_NASCIMENTO
    const birthYear = 2003 + Math.floor(Math.random() * 4); // Age 19-23 in 2026
    const birthMonth = pickRandom(["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]);
    const birthDay = 1 + Math.floor(Math.random() * 28);
    const birthText = `Nascido em ${birthDay} de ${birthMonth} de ${birthYear}.`;

    // Q20_BIOMETRIA
    const biometriaText = `Altura exata de ${finalHeight} e peso de ${finalWeight}. Condicionamento físico superlativo, explosão de alto rendimento e cuidados nutricionais rígidos.`;

    let suggestedChamps = ["UEFA Champions League", "FIFA Club World Cup"];
    if (resolvedNat.toLowerCase().includes("portugal")) {
      suggestedChamps = ["Liga Portugal Betclic", "Taça de Portugal", ...suggestedChamps];
    } else if (resolvedNat.toLowerCase().includes("brasil") || resolvedClub.toLowerCase().includes("flamengo") || resolvedClub.toLowerCase().includes("palmeiras")) {
      suggestedChamps = ["Campeonato Brasileiro Série A", "Copa do Brasil", "Copa Libertadores", ...suggestedChamps];
    } else if (resolvedClub.toLowerCase().includes("madrid") || resolvedClub.toLowerCase().includes("barcelona") || resolvedClub.toLowerCase().includes("espanha") || resolvedClub.toLowerCase().includes("atlético")) {
      suggestedChamps = ["La Liga EA Sports", "Copa del Rey", "Supercopa de España", ...suggestedChamps];
    } else {
      suggestedChamps = ["Premier League", "FA Cup", "EFL Cup", ...suggestedChamps];
    }

    const fallbackPlayer = {
      nome_jogador: resolvedName,
      clube_inicial: resolvedClub,
      nacionalidade: resolvedNat,
      sugestoes_campeonatos_locais: suggestedChamps,
      perfil_completo_20_perguntas: {
        "1_personalidade": personalityText,
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
        "14_clube_atual": clubAtualText,
        "15_estilo_altura_idolos": styleHeightIdolsText,
        "16_relacionamentos_elenco": relationshipsText,
        "17_satisfacao_clube": satisfactionText,
        "18_time_do_coracao": heartClubText,
        "19_nascimento": birthText,
        "20_biometria": biometriaText
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

// 1. Username uniqueness validation and storage endpoint
app.post("/api/users/username", async (req, res) => {
  try {
    const { userId, username, email } = req.body;
    if (!userId || !username) {
      return res.status(400).json({ error: "userId e username são obrigatórios." });
    }

    let cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.startsWith("@")) {
      cleanUsername = cleanUsername.substring(1);
    }

    if (!/^[a-z0-9_]{3,15}$/.test(cleanUsername)) {
      return res.status(400).json({ error: "Username deve ter entre 3 e 15 caracteres alfanuméricos ou sublinhados (_)." });
    }

    // Check if the username is already taken by a different user
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", cleanUsername));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const existingUserDoc = querySnapshot.docs[0];
      if (existingUserDoc.id !== userId) {
        return res.status(400).json({ error: "Este @username já está sendo utilizado por outro treinador." });
      }
    }

    // Save/update user profile in Firestore
    const userDocRef = doc(db, "users", userId);
    const userProfile = {
      userId,
      username: cleanUsername,
      email: email || "",
      hasSetupUsername: true,
      updatedAt: new Date().toISOString()
    };
    await setDoc(userDocRef, userProfile, { merge: true });

    return res.json({ success: true, username: cleanUsername });
  } catch (error: any) {
    console.error("Erro no endpoint /api/users/username:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao cadastrar o username." });
  }
});

// Fetch user profile info
app.get("/api/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const userDocRef = doc(db, "users", userId);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      return res.json(docSnap.data());
    } else {
      return res.json({ hasSetupUsername: false });
    }
  } catch (error: any) {
    console.error("Erro no endpoint GET /api/users/:userId:", error);
    return res.status(500).json({ error: error.message || "Erro ao buscar perfil de usuário." });
  }
});

// 2. Global TOP 10 Leaderboard route with dynamic ordering
app.get("/api/leaderboard", async (req, res) => {
  try {
    const { orderBy } = req.query;
    const careersRef = collection(db, "careers");
    // Only query public careers
    const q = query(careersRef, where("isPublic", "==", true));
    const querySnapshot = await getDocs(q);

    const leaderboardList: any[] = [];
    querySnapshot.forEach((docSnap) => {
      const career = docSnap.data() as any;
      if (!career || !career.profile) return;

      // Calculate totals across career matches and history seasons
      let totalMatches = career.matches?.length || 0;
      let totalGoals = (career.matches || []).reduce((sum: number, m: any) => sum + (m.goals || 0), 0);
      let totalAssists = (career.matches || []).reduce((sum: number, m: any) => sum + (m.assists || 0), 0);

      if (career.history) {
        career.history.forEach((h: any) => {
          totalMatches += h.totalMatches || 0;
          totalGoals += h.totalGoals || 0;
          totalAssists += h.totalAssists || 0;
        });
      }

      const totalPoints = totalGoals + totalAssists;

      leaderboardList.push({
        id: career.id,
        playerName: career.profile.nome_jogador || "Atleta Anônimo",
        club: career.currentClub || "Clube",
        nationality: career.profile.nacionalidade || "Nacionalidade",
        position: career.profile.perfil_completo_20_perguntas?.["15_estilo_altura_idolos"]?.split(" ")[0] || "ATA",
        matches: totalMatches,
        goals: totalGoals,
        assists: totalAssists,
        total: totalPoints,
        userEmail: career.userEmail || "Treinador"
      });
    });

    // Dynamic sort
    const field = orderBy === "goals" ? "goals" : (orderBy === "assists" ? "assists" : "total");
    leaderboardList.sort((a, b) => {
      if (b[field] !== a[field]) {
        return b[field] - a[field];
      }
      if (field === "total" && b.goals !== a.goals) {
        return b.goals - a.goals;
      }
      return b.matches - a.matches; // fewer matches is tie-breaker
    });

    return res.json(leaderboardList.slice(0, 10));
  } catch (error: any) {
    console.error("Erro no endpoint /api/leaderboard:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao carregar o ranking." });
  }
});

// 3. Secured single career retrieval (forces privacy protection at the server level)
app.get("/api/careers/:careerId", async (req, res) => {
  try {
    const { careerId } = req.params;
    const { requesterId } = req.query; // optional to verify ownership

    const careerDocRef = doc(db, "careers", careerId);
    const docSnap = await getDoc(careerDocRef);

    if (!docSnap.exists()) {
      return res.status(404).json({ error: "O jogador solicitado não foi localizado no legado de dados." });
    }

    const data = docSnap.data() as any;

    // Server-side privacy lock
    if (data.isPublic === false) {
      if (requesterId && requesterId === data.userId) {
        // Owner requesting, allow read
        return res.json(data);
      }
      return res.status(403).json({ error: "Acesso bloqueado: Este legado de carreira é privado." });
    }

    return res.json(data);
  } catch (error: any) {
    console.error("Erro no endpoint GET /api/careers/:careerId:", error);
    return res.status(500).json({ error: error.message || "Erro ao consultar legado de carreira." });
  }
});

// Route to dynamically serve the PNG from our pristine SVG on request.
// This prevents binary corruption issues when downloading the project as a ZIP,
// and ensures a perfect, uncorrupted, high-quality open graph image is always served.
app.get("/og-image.png", async (req, res) => {
  try {
    const svgPath = path.join(process.cwd(), "public", "og-image.svg");
    if (fs.existsSync(svgPath)) {
      const svgBuffer = fs.readFileSync(svgPath);
      const pngBuffer = await sharp(svgBuffer)
        .png()
        .toBuffer();
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24h
      return res.send(pngBuffer);
    } else {
      console.warn("[OG IMAGE] SVG file not found at:", svgPath);
      return res.status(404).send("Not found");
    }
  } catch (error) {
    console.error("[OG IMAGE] Error generating PNG from SVG:", error);
    return res.status(500).send("Error generating image");
  }
});

// Helper to pre-generate physical public/og-image.png and dist/og-image.png files
// on application startup. This ensures the files are freshly baked and completely
// uncorrupted on the user's local PC as soon as they run 'npm run dev' or 'npm run build'.
async function ensureOgImagePng() {
  try {
    const svgPath = path.join(process.cwd(), "public", "og-image.svg");
    const pngPath = path.join(process.cwd(), "public", "og-image.png");
    const distPngPath = path.join(process.cwd(), "dist", "og-image.png");
    
    if (fs.existsSync(svgPath)) {
      console.log("[OG-IMAGE] Generating uncorrupted PNG from SVG template...");
      const svgBuffer = fs.readFileSync(svgPath);
      const pngBuffer = await sharp(svgBuffer).png().toBuffer();
      
      fs.writeFileSync(pngPath, pngBuffer);
      console.log("[OG-IMAGE] Successfully created clean public/og-image.png!");
      
      // Also write to dist if dist exists
      const distPath = path.join(process.cwd(), "dist");
      if (fs.existsSync(distPath)) {
        fs.writeFileSync(distPngPath, pngBuffer);
        console.log("[OG-IMAGE] Successfully created clean dist/og-image.png!");
      }
    }
  } catch (err) {
    console.error("[OG-IMAGE] Failed to pre-generate PNG:", err);
  }
}

// Vite middleware integration for full-stack dev and prod modes
async function bootstrap() {
  // Always pre-generate clean PNG assets on startup to ensure zero corruption
  await ensureOgImagePng();

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
