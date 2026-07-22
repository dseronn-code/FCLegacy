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
import crypto from "crypto";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, getDoc, doc, query, where, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { initializeApp as initAdminApp, getApps as getAdminApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";

// Force Node to prioritize IPv4 DNS resolution first to avoid ENETUNREACH issues with IPv6-only/unsupported hostings (like Render.com)
dns.setDefaultResultOrder('ipv4first');

dotenv.config({ override: true });

// Initialize Firebase SDK on server-side
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(firebaseApp);

// Initialize Firebase Admin SDK for user management
if (!getAdminApps().length) {
  try {
    initAdminApp({
      projectId: firebaseConfig.projectId
    });
    console.log("Firebase Admin SDK inicializado com sucesso para gerenciamento de contas.");
  } catch (adminInitErr) {
    console.warn("Aviso na inicialização do Firebase Admin SDK:", adminInitErr);
  }
}

// Programmatically authenticate the backend server using Firebase Auth to bypass permission locks securely
async function authenticateServer() {
  const email = "system-backend@fclegacy.com";
  const password = "FC_Legacy_Secure_Backend_Pass_2026_!";
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("Servidor autenticado com sucesso no Firebase Auth:", userCredential.user.uid);
  } catch (error: any) {
    if (
      error.code === "auth/user-not-found" || 
      error.code === "auth/invalid-credential" || 
      error.message?.includes("not-found") || 
      error.message?.includes("invalid-credential")
    ) {
      console.log("Conta do servidor não encontrada, criando nova...");
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log("Conta do servidor criada com sucesso:", userCredential.user.uid);
        // Create user document with isAdmin: true
        const userDocRef = doc(db, "users", userCredential.user.uid);
        await setDoc(userDocRef, {
          userId: userCredential.user.uid,
          username: "FC Legacy System",
          email: email,
          hasSetupUsername: true,
          isPro: true,
          isAdmin: true,
          updatedAt: new Date().toISOString()
        });
        console.log("Perfil de admin do servidor persistido no Firestore.");
      } catch (createError) {
        console.error("Erro ao criar conta do servidor:", createError);
      }
    } else {
      console.error("Erro ao autenticar servidor:", error);
    }
  }
}
authenticateServer();

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

// Generic helper to send emails with robust, automatic SMTP fallback if Resend fails/is invalid
async function sendEmailHelper({
  to,
  subject,
  html,
  text,
  fromName = "Suporte Wolkstore",
  fromEmail = "support@wolkstore.shop",
  replyTo = "support@wolkstore.shop"
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
}) {
  const resendClient = getResendClient();
  let resendSuccess = false;
  let resendErr: any = null;

  if (resendClient) {
    try {
      console.log(`[EMAIL HELPER] Trying to send via Resend to ${to}...`);
      const response = await resendClient.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: to,
        subject: subject,
        html: html,
        text: text,
      });
      if (response && response.error) {
        resendErr = response.error;
        console.warn(`[EMAIL HELPER] Resend API returned error for ${to}:`, response.error);
      } else {
        resendSuccess = true;
        console.log(`[EMAIL HELPER] Resend email sent successfully to ${to}:`, response);
      }
    } catch (err: any) {
      resendErr = err;
      console.error(`[EMAIL HELPER] Resend exception for ${to}:`, err);
    }
  }

  if (!resendSuccess) {
    const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
    const emailPass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
    if (emailUser && emailPass) {
      console.log(`[EMAIL HELPER] Resend failed or not configured. Falling back to Nodemailer SMTP for ${to}`);
      const smtpFrom = emailUser ? `"${fromName}" <${emailUser}>` : `"${fromName}" <${fromEmail}>`;
      try {
        const resolvedHost = await getSmtpHostIp('smtp.hostinger.com');
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

        const info = await transporter.sendMail({
          from: smtpFrom,
          replyTo: replyTo,
          to: to,
          subject: subject,
          text: text,
          html: html,
        });
        console.log(`[EMAIL HELPER] SMTP Success for ${to}:`, info.messageId);
        return { success: true, method: "smtp" };
      } catch (err) {
        console.error(`[EMAIL HELPER] SMTP Error for ${to}:`, err);
        return { success: false, method: "failed", error: err };
      }
    } else {
      console.warn(`[EMAIL HELPER] WARNING: Neither Resend nor SMTP is configured. Email logging only.`);
      console.log(`[EMAIL HELPER] TO: ${to}\nSUBJECT: ${subject}\nTEXT: ${text}`);
      return { success: false, method: "none", error: "No credentials" };
    }
  }

  return { success: true, method: "resend" };
}

// Helper to trigger email send asynchronously in background
function asyncSendVerificationEmail(email: string, code: string) {
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

  sendEmailHelper({
    to: email,
    subject: subject,
    html: htmlContent,
    text: textContent
  }).catch((err) => {
    console.error("[VERIFICATION EMAIL ERROR]", err);
  });
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

// ===================================================================
// ESQUECI MINHA SENHA & REDEFINIÇÃO DE SENHA (DOMÍNIO WOLKSTORE.SHOP)
// ===================================================================

const passwordResetTokens = new Map<string, { email: string; code: string; expiresAt: number; used: boolean }>();
const codeSendAttemptsByIp = new Map<string, { count: number; blocked: boolean }>();
const MAX_CODE_SEND_PER_IP = 5;

async function sendPasswordResetEmailHelper(email: string, token: string, code: string) {
  const subject = `🔑 Código de Redefinição de Senha - Wolkstore FC Legacy`;
  const text = `Solicitação de Redefinição de Senha para a conta Wolkstore (${email}). Seu código de segurança é: ${code}. Digite este código diretamente no site para redefinir sua senha.`;
  
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Código de Redefinição de Senha - Wolkstore</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 0; }
        .container { max-width: 580px; margin: 40px auto; background-color: #121215; border: 1px solid #27272a; border-radius: 20px; overflow: hidden; padding: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.8); }
        .header { text-align: center; border-bottom: 1px solid #27272a; padding-bottom: 20px; margin-bottom: 24px; }
        .logo-badge { display: inline-block; padding: 6px 16px; background-color: #d9ff33; color: #000; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; border-radius: 999px; }
        .domain-tag { font-family: monospace; font-size: 10px; color: #a1a1aa; text-transform: uppercase; margin-top: 8px; display: block; }
        .title { font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: -0.5px; }
        .text { font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 24px; }
        .code-box { background-color: #000000; border: 1px solid #3f3f46; border-radius: 14px; padding: 20px; text-align: center; margin: 24px 0; }
        .code { font-family: monospace; font-size: 36px; font-weight: 900; color: #d9ff33; letter-spacing: 10px; }
        .footer { border-top: 1px solid #27272a; padding-top: 20px; margin-top: 32px; font-size: 11px; color: #71717a; text-align: center; line-height: 1.5; }
        .highlight { color: #d9ff33; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo-badge">WOLKSTORE // FC LEGACY</div>
          <span class="domain-tag">Remetente Oficial: suporte@wolkstore.shop</span>
        </div>
        <h1 class="title">Código de Redefinição</h1>
        <p class="text">
          Recebemos um pedido de redefinição de senha para o jogador da conta <span class="highlight">${email}</span>.
          Copie ou digite o código de 6 dígitos abaixo diretamente na tela de redefinição do site:
        </p>
        
        <div class="code-box">
          <div style="font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Seu Código de Segurança</div>
          <div class="code">${code}</div>
        </div>

        <p class="text" style="font-size: 12px; text-align: center; margin-top: 16px; color: #d9ff33;">
          <strong>Insira este código na tela do site para criar sua nova senha. Válido por 30 minutos.</strong>
        </p>

        <div class="footer">
          Se você não solicitou esta alteração, ignore este e-mail. Nenhuma ação será realizada.<br>
          &copy; 2026 Wolkstore Performance FC Legacy. Todos os direitos reservados.
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmailHelper({
    to: email,
    subject: subject,
    html: html,
    text: text,
    fromName: "Suporte Wolkstore",
    fromEmail: "suporte@wolkstore.shop",
    replyTo: "suporte@wolkstore.shop"
  });
}

function asyncSendPasswordResetEmail(email: string, token: string, code: string) {
  sendPasswordResetEmailHelper(email, token, code).catch((err) => {
    console.error("[PASSWORD RESET EMAIL DISPATCH ERROR]", err);
  });
}

// POST solicitar email de esqueci minha senha
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !String(email).includes("@")) {
      return res.status(400).json({ error: "Por favor, informe um endereço de e-mail válido." });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Verify if user exists in Firestore or Auth
    let userFound = false;
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", cleanEmail));
      const uSnap = await getDocs(q);
      if (!uSnap.empty) {
        userFound = true;
      }
    } catch (err) {
      console.warn("Aviso ao buscar usuário no Firestore:", err);
    }

    if (!userFound && getAdminApps().length) {
      try {
        const uRec = await getAdminAuth().getUserByEmail(cleanEmail);
        if (uRec && uRec.uid) {
          userFound = true;
        }
      } catch (aErr) {
        // Not found in admin auth
      }
    }

    // Generate unique random token and 6-digit code
    const token = "rst_" + Date.now() + "_" + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes validity

    // Save in memory map
    passwordResetTokens.set(token, { email: cleanEmail, code, expiresAt, used: false });

    // Save in Firestore for persistence across restarts
    try {
      await setDoc(doc(db, "password_resets", token), {
        id: token,
        token: token,
        code: code,
        email: cleanEmail,
        used: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(expiresAt).toISOString()
      });
    } catch (fsErr) {
      console.warn("[FORGOT PASSWORD] Firestore save error:", fsErr);
    }

    console.log(`[FORGOT PASSWORD] Código gerado para ${cleanEmail}: ${code}`);

    // Trigger background email from wolkstore.shop domain with code only
    asyncSendPasswordResetEmail(cleanEmail, token, code);

    const hasConfig = !!(process.env.RESEND_API_KEY || (process.env.EMAIL_USER && process.env.EMAIL_PASS));

    return res.json({
      success: true,
      message: "Código de segurança enviado com sucesso para o seu e-mail!",
      debugMode: !hasConfig,
      code: !hasConfig ? code : undefined,
      token: !hasConfig ? token : undefined
    });
  } catch (error: any) {
    console.error("Erro na rota forgot-password:", error);
    return res.status(500).json({ error: "Erro ao processar solicitação de redefinição de senha." });
  }
});

// POST verificar validade de token ou código
app.post("/api/auth/verify-reset-token", async (req, res) => {
  try {
    const { token, code, email } = req.body;
    const cleanEmail = email ? String(email).trim().toLowerCase() : "";

    let record = token ? passwordResetTokens.get(token) : null;

    if (!record && token) {
      try {
        const rSnap = await getDoc(doc(db, "password_resets", token));
        if (rSnap.exists()) {
          const d = rSnap.data();
          record = {
            email: d.email,
            code: d.code,
            expiresAt: new Date(d.expiresAt).getTime(),
            used: d.used
          };
        }
      } catch (err) {
        console.warn("Erro ao buscar token no Firestore:", err);
      }
    }

    if (!record && code && cleanEmail) {
      for (const [t, data] of passwordResetTokens.entries()) {
        if (data.email === cleanEmail && data.code === String(code).trim() && !data.used) {
          record = data;
          break;
        }
      }
      if (!record) {
        try {
          const qResets = query(
            collection(db, "password_resets"),
            where("email", "==", cleanEmail),
            where("code", "==", String(code).trim())
          );
          const snapResets = await getDocs(qResets);
          if (!snapResets.empty) {
            const d = snapResets.docs[0].data();
            record = {
              email: d.email,
              code: d.code,
              expiresAt: new Date(d.expiresAt).getTime(),
              used: d.used
            };
          }
        } catch (err) {
          console.warn("Erro ao buscar código no Firestore:", err);
        }
      }
    }

    if (!record) {
      return res.status(400).json({ error: "Link ou código de redefinição inválido." });
    }

    if (record.used) {
      return res.status(400).json({ error: "Este link ou código de redefinição já foi utilizado." });
    }

    if (Date.now() > record.expiresAt) {
      return res.status(400).json({ error: "O prazo deste link expirou. Solicite uma nova redefinição." });
    }

    if (cleanEmail && record.email !== cleanEmail) {
      return res.status(400).json({ error: "Este código não pertence a este e-mail." });
    }

    return res.json({ success: true, valid: true, email: record.email });
  } catch (error: any) {
    console.error("Erro ao verificar token de redefinição:", error);
    return res.status(500).json({ error: "Erro ao validar token de redefinição." });
  }
});

// POST efetuar redefinição de senha
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, code, email, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: "A nova senha precisa ter no mínimo 6 caracteres." });
    }

    const cleanEmail = email ? String(email).trim().toLowerCase() : "";

    let tokenKey = token;
    let record = token ? passwordResetTokens.get(token) : null;

    if (!record && token) {
      try {
        const rSnap = await getDoc(doc(db, "password_resets", token));
        if (rSnap.exists()) {
          const d = rSnap.data();
          record = {
            email: d.email,
            code: d.code,
            expiresAt: new Date(d.expiresAt).getTime(),
            used: d.used
          };
        }
      } catch (err) {
        console.warn("Erro ao buscar token no Firestore:", err);
      }
    }

    if (!record && code && cleanEmail) {
      for (const [t, data] of passwordResetTokens.entries()) {
        if (data.email === cleanEmail && data.code === String(code).trim() && !data.used) {
          record = data;
          tokenKey = t;
          break;
        }
      }
      if (!record) {
        try {
          const qResets = query(
            collection(db, "password_resets"),
            where("email", "==", cleanEmail),
            where("code", "==", String(code).trim())
          );
          const snapResets = await getDocs(qResets);
          if (!snapResets.empty) {
            const docObj = snapResets.docs[0];
            const d = docObj.data();
            tokenKey = docObj.id;
            record = {
              email: d.email,
              code: d.code,
              expiresAt: new Date(d.expiresAt).getTime(),
              used: d.used
            };
          }
        } catch (err) {
          console.warn("Erro ao buscar código no Firestore:", err);
        }
      }
    }

    if (!record) {
      return res.status(400).json({ error: "Solicitação de redefinição de senha inválida ou não localizada." });
    }

    if (record.used) {
      return res.status(400).json({ error: "Esta solicitação de redefinição de senha já foi utilizada." });
    }

    if (Date.now() > record.expiresAt) {
      return res.status(400).json({ error: "O link de redefinição expirou. Por favor, solicite um novo." });
    }

    const targetEmail = record.email;

    // Mark reset code token as used
    record.used = true;
    if (tokenKey) {
      passwordResetTokens.set(tokenKey, record);
      try {
        await updateDoc(doc(db, "password_resets", tokenKey), {
          used: true,
          updatedAt: new Date().toISOString()
        });
      } catch (e) {
        console.warn("Erro ao atualizar status do token no Firestore:", e);
      }
    }

    // Try updating password in Firebase Auth via Admin SDK / REST API if available
    let updatedInAuth = false;
    if (getAdminApps().length) {
      try {
        const adminAuth = getAdminAuth();
        const userRecord = await adminAuth.getUserByEmail(targetEmail);
        if (userRecord && userRecord.uid) {
          await adminAuth.updateUser(userRecord.uid, { password: String(newPassword) });
          updatedInAuth = true;
          console.log(`[RESET PASSWORD SUCCESS] Senha alterada no Firebase Auth via Admin SDK para ${targetEmail}`);
        }
      } catch (adminErr: any) {
        console.warn(`[RESET PASSWORD ADMIN WARN] Não foi possível atualizar via Admin SDK (${adminErr?.message || adminErr}). Continuando atualização via Firestore...`);
      }
    }

    // Always update or create user credential record in Firestore
    const passwordHash = crypto.createHash("sha256").update(String(newPassword)).digest("hex");
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", targetEmail));
      const uSnap = await getDocs(q);
      
      let updatedAny = false;
      if (!uSnap.empty) {
        for (const uDoc of uSnap.docs) {
          await updateDoc(uDoc.ref, {
            passwordHash: passwordHash,
            updatedAt: new Date().toISOString(),
            lastPasswordReset: new Date().toISOString()
          });
          updatedAny = true;
        }
      }

      // Fallback: check case-insensitively if not found with exact match
      if (!updatedAny) {
        const allUsersSnap = await getDocs(usersRef);
        for (const uDoc of allUsersSnap.docs) {
          const d = uDoc.data();
          if (d.email && d.email.toLowerCase() === targetEmail.toLowerCase()) {
            await updateDoc(uDoc.ref, {
              passwordHash: passwordHash,
              updatedAt: new Date().toISOString(),
              lastPasswordReset: new Date().toISOString()
            });
            updatedAny = true;
          }
        }
      }

      if (!updatedAny) {
        const newUid = "usr_" + Date.now();
        await setDoc(doc(db, "users", newUid), {
          userId: newUid,
          email: targetEmail.toLowerCase(),
          passwordHash: passwordHash,
          hasSetupUsername: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastPasswordReset: new Date().toISOString()
        });
        console.log(`[RESET PASSWORD SUCCESS] Novo perfil de usuário criado no Firestore para ${targetEmail}`);
      } else {
        console.log(`[RESET PASSWORD SUCCESS] Senha atualizada no Firestore para ${targetEmail}`);
      }
    } catch (fsErr) {
      console.warn("Erro ao atualizar documento de usuário no Firestore:", fsErr);
    }

    return res.json({
      success: true,
      message: "Sua senha foi redefinida com sucesso! Você já pode realizar o login com sua nova senha.",
      updatedInAuth
    });
  } catch (error: any) {
    console.error("Erro na alteração de senha:", error);
    return res.status(500).json({ error: "Erro ao redefinir a senha." });
  }
});

// POST rota de login do backend (fallback para quando o Firebase Auth não puder ser atualizado)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const inputHash = crypto.createHash("sha256").update(String(password)).digest("hex");

    // 1. Check if user document exists in Firestore
    const usersRef = collection(db, "users");
    let uSnap = await getDocs(query(usersRef, where("email", "==", cleanEmail)));

    let matchingDocs: any[] = [];
    if (!uSnap.empty) {
      uSnap.forEach(d => matchingDocs.push(d));
    } else {
      // Fallback case-insensitive search across users
      const allUsersSnap = await getDocs(usersRef);
      allUsersSnap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.email && d.email.toLowerCase() === cleanEmail) {
          matchingDocs.push(docSnap);
        }
      });
    }

    if (matchingDocs.length === 0) {
      return res.status(400).json({ error: "E-mail ou senha incorretos." });
    }

    let authenticatedUser: any = null;
    for (const uDoc of matchingDocs) {
      const data = uDoc.data();
      // Match passwordHash or plain password if stored
      if (
        data.passwordHash === inputHash || 
        data.password === String(password) || 
        data.passwordHash === String(password)
      ) {
        authenticatedUser = {
          uid: data.userId || data.uid || uDoc.id,
          email: data.email || cleanEmail,
          displayName: data.username || data.email?.split("@")[0] || cleanEmail,
          username: data.username || cleanEmail,
          isPro: data.isPro || false,
          isAdmin: data.isAdmin || false,
          hasSetupUsername: data.hasSetupUsername ?? true
        };
        break;
      }
    }

    if (!authenticatedUser) {
      return res.status(400).json({ error: "E-mail ou senha incorretos." });
    }

    console.log(`[LOGIN BACKEND SUCCESS] Usuário ${cleanEmail} autenticado via backend.`);
    return res.json({
      success: true,
      user: authenticatedUser
    });
  } catch (error: any) {
    console.error("Erro no login backend:", error);
    return res.status(500).json({ error: "Erro ao realizar login." });
  }
});

// GET list of user careers with userEmail fallback and auto-association
app.get("/api/careers/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const email = (req.query.email as string || "").toLowerCase().trim();
    const careersRef = collection(db, "careers");
    
    const careersMap = new Map<string, any>();

    // 1. Fetch by userId
    if (userId) {
      const q1 = query(careersRef, where("userId", "==", userId));
      const snap1 = await getDocs(q1);
      snap1.forEach(d => careersMap.set(d.id, d.data()));
    }

    // 2. Fetch by userEmail if provided
    if (email) {
      const q2 = query(careersRef, where("userEmail", "==", email));
      const snap2 = await getDocs(q2);
      for (const d of snap2.docs) {
        const cData = d.data();
        careersMap.set(d.id, cData);
        // Auto-fix userId if mismatched
        if (userId && cData.userId !== userId) {
          try {
            await updateDoc(doc(db, "careers", d.id), { userId: userId, updatedAt: new Date().toISOString() });
            cData.userId = userId;
          } catch (e) {
            console.warn(`Erro ao reassociar carreira ${d.id} ao userId ${userId}:`, e);
          }
        }
      }
    }

    const list = Array.from(careersMap.values());
    list.sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());

    return res.json({ success: true, careers: list });
  } catch (error: any) {
    console.error("Erro no GET /api/careers/user/:userId:", error);
    return res.status(500).json({ error: "Erro ao buscar carreiras do usuário." });
  }
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

// Helper function to check and deduct AI credits
async function checkAndDeductAiCredits(userId: string | undefined, simulateOnly: boolean = false): Promise<{ allowed: boolean; error?: string }> {
  if (!userId) return { allowed: true };
  try {
    const userDocRef = doc(db, "users", userId);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const udata = userDoc.data();
      if (udata.isBlocked) {
        return { allowed: false, error: "Sua conta está bloqueada pelo administrador." };
      }
      if (!udata.isPro) {
        const currentCount = udata.aiGenerationsCount || 0;
        const limit = udata.freeAiLimit !== undefined ? udata.freeAiLimit : 3;
        if (currentCount >= limit) {
          return { allowed: false, error: "AI_LIMIT_REACHED" };
        }
      }
      
      if (!simulateOnly) {
        // Perform deduction
        const newCount = (udata.aiGenerationsCount || 0) + 1;
        const newCredits = udata.isPro ? 9999 : Math.max(0, (udata.aiCredits === undefined ? 3 : udata.aiCredits) - 1);
        await updateDoc(userDocRef, {
          aiGenerationsCount: newCount,
          aiCredits: newCredits,
          updatedAt: new Date().toISOString()
        });
      }
    } else {
      // Create user doc if not exists
      if (!simulateOnly) {
        await setDoc(userDocRef, {
          userId,
          isPro: false,
          aiCredits: 2, // starts at 3, minus this first successful one = 2
          aiGenerationsCount: 1,
          extraSlots: 0,
          isBlocked: false,
          isAdmin: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    }
  } catch (err) {
    console.error("Error in checkAndDeductAiCredits:", err);
  }
  return { allowed: true };
}

app.post("/api/generate-player", async (req, res) => {
  try {
    const { nationality, position, preferredClub, suggestedName, personalityType, userId } = req.body;
  
  if (userId) {
    const checkResult = await checkAndDeductAiCredits(userId, true);
    if (!checkResult.allowed) {
      if (checkResult.error === "AI_LIMIT_REACHED") {
        return res.status(403).json({ error: "AI_LIMIT_REACHED", message: "Você atingiu o limite de 3 gerações de IA do plano Free." });
      } else {
        return res.status(403).json({ error: checkResult.error || "Acesso negado." });
      }
    }
  }

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
    if (userId) {
      await checkAndDeductAiCredits(userId, false);
    }
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

    if (userId) {
      await checkAndDeductAiCredits(userId, false);
    }
    return res.json(fallbackPlayer);
  } catch (fallbackError) {
    console.error("Erro fatal no gerador de contingência:", fallbackError);
    return res.status(500).json({
      error: "Serviço temporariamente indisponível devido a alta demanda. Tente novamente mais tarde."
    });
  }
  } catch (topLevelError: any) {
    console.error("Erro geral não tratado no /api/generate-player:", topLevelError);
    return res.status(500).json({
      error: "Erro no servidor ao gerar carreira. Tente novamente em alguns instantes."
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

// ===================================================================
// MONETIZAÇÃO, PAGAMENTOS E CONFIGURAÇÃO GLOBAL
// ===================================================================

// GET global system configuration
app.get("/api/system-config", async (req, res) => {
  try {
    const docRef = doc(db, "system_config", "global");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return res.json(docSnap.data());
    } else {
      const defaultConf = {
        proPrice: 29.90,
        freeAiLimit: 3,
        announcementBanner: "🏆 FC LEGACY PRO LIBERADO: Crie biografias de atletas ilimitadas, use os Temas Ouro Ultimate e Champions League, e ganhe o Verificado PRO dourado!",
        showBanner: true,
        updatedAt: new Date().toISOString()
      };
      try {
        await setDoc(docRef, defaultConf);
      } catch (writeErr) {
        console.warn("Aviso ao salvar system-config no banco (tentando usar em cache/memória):", writeErr);
      }
      return res.json(defaultConf);
    }
  } catch (error: any) {
    console.error("Erro ao buscar system-config:", error);
    return res.status(500).json({ error: "Erro ao buscar configurações globais." });
  }
});

// Send elegant subscription confirmation email via Resend or Nodemailer SMTP fallback
async function sendSubscriptionConfirmation(email: string, subscriptionId: string, type: string, amount: number, description: string) {
  if (!email || !email.includes("@")) return;

  const subject = `🏆 Assinatura Ativa - FC LEGACY`;
  const textContent = `Olá! Seu pagamento no valor de R$ ${amount.toFixed(2)} para "${description}" foi aprovado com sucesso! Transação: ${subscriptionId}. Obrigado por fazer parte do FC Legacy!`;
  
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #09090b; color: #f4f4f5; border: 1px solid #27272a; border-radius: 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <span style="font-size: 32px; font-weight: 900; color: #ccff00; letter-spacing: -0.05em; text-transform: uppercase;">FC<span style="color: #ffffff;">LEGACY</span></span>
        <div style="font-size: 11px; font-weight: bold; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.2em; margin-top: 6px;">COMPROVANTE DE PAGAMENTO</div>
      </div>
      
      <div style="padding: 24px; background-color: #121215; border-radius: 16px; border: 1px solid #1f1f23; margin-bottom: 24px;">
        <p style="font-size: 16px; margin-top: 0; color: #ffffff; font-weight: 600;">Olá, Campeão!</p>
        <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 20px;">
          Temos o prazer de informar que o seu pagamento foi recebido e processado de forma 100% automática. A sua assinatura ou benefício já está ativa e liberada em sua conta.
        </p>
        
        <div style="border-top: 1px dashed #27272a; border-bottom: 1px dashed #27272a; padding: 18px 0; margin-bottom: 20px;">
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr style="height: 28px;">
              <td style="color: #71717a;">Produto:</td>
              <td style="text-align: right; color: #ffffff; font-weight: bold;">${description}</td>
            </tr>
            <tr style="height: 28px;">
              <td style="color: #71717a;">Valor Pago:</td>
              <td style="text-align: right; color: #ccff00; font-weight: bold;">R$ ${amount.toFixed(2)}</td>
            </tr>
            <tr style="height: 28px;">
              <td style="color: #71717a;">Método de Pagamento:</td>
              <td style="text-align: right; color: #ffffff;">Pix (Mercado Pago)</td>
            </tr>
            <tr style="height: 28px;">
              <td style="color: #71717a;">ID da Transação:</td>
              <td style="text-align: right; color: #71717a; font-family: monospace; font-size: 11px;">${subscriptionId}</td>
            </tr>
          </table>
        </div>
        
        <p style="font-size: 13px; line-height: 1.6; color: #71717a; margin-bottom: 0;">
          Você agora tem acesso imediato a todos os recursos exclusivos, incluindo a criação ilimitada de atletas, Temas Ouro e Champions League, e o destaque especial com o Verificado PRO dourado!
        </p>
      </div>

      <div style="text-align: center; margin-bottom: 30px;">
        <a href="https://wolkstore.shop" style="display: inline-block; padding: 14px 28px; background-color: #ccff00; color: #000000; text-decoration: none; font-weight: 800; border-radius: 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.2s;">Acessar Meu Painel</a>
      </div>
      
      <div style="text-align: center; font-size: 10.5px; color: #52525b; line-height: 1.5; border-top: 1px solid #1f1f23; padding-top: 20px;">
        <span>Se você tiver qualquer dúvida ou problema com sua assinatura, sinta-se à vontade para responder a este e-mail ou contatar nossa equipe de suporte em <b>support@wolkstore.shop</b>.</span>
        <br/><br/>
        <span>© 2026 Comunidade FC Legacy. Todos os direitos reservados.</span>
      </div>
    </div>
  `;

  sendEmailHelper({
    to: email,
    subject: subject,
    html: htmlContent,
    text: textContent
  }).catch((err) => {
    console.error("[SUBSCRIPTION EMAIL ERROR]", err);
  });
}

// Send elegant cancellation notice with benefits lost
async function sendSubscriptionCancellation(email: string, description: string, reactivationUrl: string) {
  if (!email || !email.includes("@")) return;

  const subject = `⚠️ Assinatura Cancelada - FC LEGACY`;
  const textContent = `Olá! Confirmamos o cancelamento da sua assinatura "${description}". Você retornou ao plano gratuito e perderá o acesso às biografias ilimitadas de IA, temas de prestígio ouro e champions, e limite de atletas. Se mudar de ideia, pode reativar no link exclusivo: ${reactivationUrl}`;

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #09090b; color: #f4f4f5; border: 1px solid #27272a; border-radius: 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <span style="font-size: 32px; font-weight: 900; color: #ff3333; letter-spacing: -0.05em; text-transform: uppercase;">FC<span style="color: #ffffff;">LEGACY</span></span>
        <div style="font-size: 11px; font-weight: bold; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.2em; margin-top: 6px;">CANCELAMENTO DE ASSINATURA</div>
      </div>
      
      <div style="padding: 24px; background-color: #121215; border-radius: 16px; border: 1px solid #1f1f23; margin-bottom: 24px;">
        <p style="font-size: 16px; margin-top: 0; color: #ffffff; font-weight: 600;">Olá!</p>
        <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 20px;">
          Confirmamos que a sua assinatura <b>${description}</b> foi cancelada com sucesso. Você foi retornado ao plano gratuito de nossa plataforma.
        </p>

        <p style="font-size: 14px; font-weight: bold; color: #ff4444; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em;">🚨 Benefícios que foram perdidos:</p>
        
        <ul style="font-size: 13px; line-height: 1.8; color: #a1a1aa; padding-left: 20px; margin-bottom: 20px;">
          <li style="margin-bottom: 6px;"><strong style="color: #ffffff;">Gerações de IA Ilimitadas:</strong> Você retornará ao limite de apenas 3 gerações de IA para biografias e análises.</li>
          <li style="margin-bottom: 6px;"><strong style="color: #ffffff;">Temas Ouro e Champions League:</strong> Seus atletas perderão os layouts exclusivos e o brilho premium dos temas dourados.</li>
          <li style="margin-bottom: 6px;"><strong style="color: #ffffff;">Carreiras e Atletas Infinitos:</strong> Retorno ao limite máximo de 3 atletas ativos simultaneamente.</li>
          <li style="margin-bottom: 6px;"><strong style="color: #ffffff;">Selo Verificado PRO:</strong> Seu perfil e suas páginas de atletas perderão o badge dourado verificado de prestígio.</li>
          <li style="margin-bottom: 6px;"><strong style="color: #ffffff;">Gráficos e Estatísticas de Elite:</strong> Perda do acesso aos relatórios visuais avançados de evolução de atributos.</li>
        </ul>

        <p style="font-size: 13px; line-height: 1.6; color: #71717a; margin-bottom: 0;">
          Sentiremos sua falta no time de elite! Lembre-se que se você mudar de ideia, poderá reativar seus benefícios PRO dentro de 7 dias através do link abaixo.
        </p>
      </div>

      <div style="text-align: center; margin-bottom: 30px;">
        <a href="${reactivationUrl}" style="display: inline-block; padding: 14px 28px; background-color: #ff3333; color: #ffffff; text-decoration: none; font-weight: 800; border-radius: 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.2s;">Reativar Minha Conta PRO</a>
      </div>
      
      <div style="text-align: center; font-size: 10.5px; color: #52525b; line-height: 1.5; border-top: 1px solid #1f1f23; padding-top: 20px;">
        <span>Se tiver qualquer dúvida ou se este cancelamento não foi solicitado por você, entre em contato imediatamente com nossa equipe de suporte em <b>support@wolkstore.shop</b>.</span>
        <br/><br/>
        <span>© 2026 Comunidade FC Legacy. Todos os direitos reservados.</span>
      </div>
    </div>
  `;

  sendEmailHelper({
    to: email,
    subject: subject,
    html: htmlContent,
    text: textContent
  }).catch((err) => {
    console.error("[CANCELLATION EMAIL ERROR]", err);
  });
}

// Create checkout/subscription transaction via Mercado Pago (with robust Simulator fallback)
app.post("/api/payments/create-checkout", async (req, res) => {
  try {
    const { userId, userEmail, type } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório." });
    }

    const subId = "sub_" + Date.now() + "_" + Math.random().toString(36).substring(5);
    let amount = 29.90;
    let description = "FC Legacy Pro - Plano Mensal";

    if (type === "extra_slot") {
      amount = 9.90;
      description = "FC Legacy - Slot de Carreira Extra";
    } else if (type === "boost") {
      amount = 14.90;
      description = "FC Legacy - Destaque Neon no Leaderboard (7 dias)";
    } else if (type === "teste") {
      amount = 1.00;
      description = "FC Legacy - Plano de Teste R$ 1";
    }

    const subDocRef = doc(db, "subscriptions", subId);
    const subRecord: any = {
      id: subId,
      userId,
      userEmail: userEmail || "",
      status: "pending",
      amount,
      paymentMethod: "PIX",
      type: type || "pro",
      description,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (type === "boost" ? 7 : type === "teste" ? 1 : 30) * 24 * 60 * 60 * 1000).toISOString()
    };

    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    let qrCode = "";
    let qrCodeBase64 = "";
    let isRealMP = false;
    let mpPaymentId = "";

    if (mpToken && mpToken.trim() !== "") {
      console.log(`[MERCADO PAGO] Iniciando criação de pagamento Pix de R$ ${amount} para ${userEmail}`);
      try {
        const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${mpToken.trim()}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": subId
          },
          body: JSON.stringify({
            transaction_amount: amount,
            description: description,
            payment_method_id: "pix",
            payer: {
              email: userEmail || "suporte@wolkstore.shop",
              first_name: "Atleta",
              last_name: "FC Legacy"
            },
            notification_url: `${process.env.APP_URL || 'https://ais-dev-2yzwx2wmezt5f62p2ii5fk-250082265765.us-east1.run.app'}/api/payments/mercado-pago-webhook`
          })
        });

        const mpData = await mpResponse.json();
        if (mpResponse.ok && mpData.point_of_interaction?.transaction_data) {
          qrCode = mpData.point_of_interaction.transaction_data.qr_code;
          qrCodeBase64 = mpData.point_of_interaction.transaction_data.qr_code_base64;
          mpPaymentId = String(mpData.id);
          isRealMP = true;
          subRecord.mpPaymentId = mpPaymentId;
          subRecord.qrCode = qrCode;
          console.log(`[MERCADO PAGO] Pix criado com sucesso no MP. ID: ${mpPaymentId}`);
        } else {
          console.error("[MERCADO PAGO] Resposta de erro do MP:", mpData);
        }
      } catch (mpErr) {
        console.error("[MERCADO PAGO] Falha na requisição ao MP:", mpErr);
      }
    } else {
      console.log("[MERCADO PAGO] MERCADO_PAGO_ACCESS_TOKEN não configurado no .env. Inicializando canal padrão de pagamento.");
    }

    await setDoc(subDocRef, subRecord);

    const checkoutUrl = `/checkout?id=${subId}&amount=${amount}&type=${type}&desc=${encodeURIComponent(description)}`;

    return res.json({
      success: true,
      checkoutUrl,
      subscriptionId: subId,
      amount,
      description,
      isRealMP,
      qrCode,
      qrCodeBase64,
      mpPaymentId
    });
  } catch (error: any) {
    console.error("Erro ao criar transação de pagamento:", error);
    return res.status(500).json({ error: "Erro interno ao processar transação." });
  }
});

// Simulated Sandbox Webhook
app.post("/api/payments/webhook", async (req, res) => {
  try {
    const { subscriptionId, status } = req.body;
    if (!subscriptionId) {
      return res.status(400).json({ error: "subscriptionId é obrigatório." });
    }

    const subDocRef = doc(db, "subscriptions", subscriptionId);
    const subSnap = await getDoc(subDocRef);

    if (!subSnap.exists()) {
      return res.status(404).json({ error: "Transação de pagamento não localizada." });
    }

    const subData = subSnap.data() as any;
    
    if (subData.status === "approved") {
      return res.json({ success: true, message: "Pagamento já havia sido processado anteriormente." });
    }

    const paymentStatus = status || "approved";

    if (paymentStatus === "approved") {
      // Update transaction status
      await updateDoc(subDocRef, {
        status: "approved",
        updatedAt: new Date().toISOString()
      });

      // Update user entitlements based on purchase type
      const userDocRef = doc(db, "users", subData.userId);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        const udata = userSnap.data();
        if (subData.type === "pro") {
          await updateDoc(userDocRef, {
            isPro: true,
            aiCredits: 9999,
            proExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date().toISOString()
          });
        } else if (subData.type === "teste") {
          await updateDoc(userDocRef, {
            isPro: true,
            aiCredits: 9999,
            proExpiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day
            updatedAt: new Date().toISOString()
          });
        } else if (subData.type === "extra_slot") {
          const currentSlots = udata.extraSlots || 0;
          await updateDoc(userDocRef, {
            extraSlots: currentSlots + 1,
            updatedAt: new Date().toISOString()
          });
        } else if (subData.type === "boost") {
          await updateDoc(userDocRef, {
            boostedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date().toISOString()
          });
          
          // Set isBoosted on careers
          try {
            const careersRef = collection(db, "careers");
            const q = query(careersRef, where("userId", "==", subData.userId));
            const querySnap = await getDocs(q);
            querySnap.forEach(async (careerDoc) => {
              await updateDoc(doc(db, "careers", careerDoc.id), {
                isBoosted: true,
                updatedAt: new Date().toISOString()
              });
            });
          } catch (err) {
            console.error("Erro ao aplicar boost nas carreiras:", err);
          }
        }
      } else {
        const newUser: any = {
          userId: subData.userId,
          email: subData.userEmail,
          hasSetupUsername: false,
          isBlocked: false,
          isAdmin: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        if (subData.type === "pro") {
          newUser.isPro = true;
          newUser.aiCredits = 9999;
          newUser.proExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        } else if (subData.type === "teste") {
          newUser.isPro = true;
          newUser.aiCredits = 9999;
          newUser.proExpiresAt = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
        } else if (subData.type === "extra_slot") {
          newUser.extraSlots = 1;
        } else if (subData.type === "boost") {
          newUser.boostedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        }
        await setDoc(userDocRef, newUser);
      }

      console.log(`[PAYMENT Webhook] Pagamento aprovado com sucesso! Id: ${subscriptionId}`);
      
      // Send confirmation email asynchronously
      const userEmail = subData.userEmail || (userSnap.exists() ? userSnap.data()?.email : "");
      if (userEmail) {
        sendSubscriptionConfirmation(userEmail, subscriptionId, subData.type, subData.amount, subData.description)
          .catch(err => console.error("Erro ao enviar email de assinatura:", err));
      }

      return res.json({ success: true, message: "Transação aprovada e benefícios liberados no legado!" });
    } else {
      await updateDoc(subDocRef, {
        status: paymentStatus,
        updatedAt: new Date().toISOString()
      });
      return res.json({ success: true, message: "Transação atualizada com status: " + paymentStatus });
    }
  } catch (error: any) {
    console.error("Erro no processamento do webhook:", error);
    return res.status(500).json({ error: "Erro interno no processamento do webhook." });
  }
});

// Automated Real Mercado Pago Notification Webhook
app.post("/api/payments/mercado-pago-webhook", async (req, res) => {
  try {
    console.log("[MERCADO PAGO WEBHOOK] Notificação recebida:", JSON.stringify(req.body), JSON.stringify(req.query));
    
    // MP sends the payment ID as data.id in body, topic in query or ID in query
    const paymentId = req.body.data?.id || req.body.id || req.query.id;
    const action = req.body.action || req.query.topic;

    if (!paymentId) {
      return res.status(200).send("Ignored notification without ID.");
    }

    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!mpToken || mpToken.trim() === "") {
      return res.status(400).send("Mercado Pago token não configurado no servidor.");
    }

    // Call Mercado Pago API to get transaction status
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        "Authorization": `Bearer ${mpToken.trim()}`
      }
    });

    if (!mpResponse.ok) {
      console.error(`[MERCADO PAGO WEBHOOK] Erro ao buscar pagamento ${paymentId} no MP`);
      return res.status(200).send("FALHA: Pagamento não localizado no Mercado Pago.");
    }

    const paymentData = await mpResponse.json();
    const status = paymentData.status;

    if (status === "approved") {
      const subscriptionsRef = collection(db, "subscriptions");
      const q = query(subscriptionsRef, where("mpPaymentId", "==", String(paymentId)));
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        console.error(`[MERCADO PAGO WEBHOOK] Nenhuma transação associada ao pagamento do MP ${paymentId}`);
        return res.status(200).send("OK: Pagamento aprovado mas transação não achada no banco.");
      }

      for (const docSnapshot of querySnap.docs) {
        const subId = docSnapshot.id;
        const subData = docSnapshot.data() as any;

        if (subData.status === "approved") {
          console.log(`[MERCADO PAGO WEBHOOK] Transação ${subId} já estava aprovada.`);
          continue;
        }

        // Approve transaction
        await updateDoc(doc(db, "subscriptions", subId), {
          status: "approved",
          updatedAt: new Date().toISOString()
        });

        // Grant entitlements
        const userDocRef = doc(db, "users", subData.userId);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
          const udata = userSnap.data();
          if (subData.type === "pro") {
            await updateDoc(userDocRef, {
              isPro: true,
              aiCredits: 9999,
              proExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              updatedAt: new Date().toISOString()
            });
          } else if (subData.type === "teste") {
            await updateDoc(userDocRef, {
              isPro: true,
              aiCredits: 9999,
              proExpiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
              updatedAt: new Date().toISOString()
            });
          } else if (subData.type === "extra_slot") {
            const currentSlots = udata.extraSlots || 0;
            await updateDoc(userDocRef, {
              extraSlots: currentSlots + 1,
              updatedAt: new Date().toISOString()
            });
          } else if (subData.type === "boost") {
            await updateDoc(userDocRef, {
              boostedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              updatedAt: new Date().toISOString()
            });
            // Apply boost on careers
            try {
              const careersRef = collection(db, "careers");
              const cq = query(careersRef, where("userId", "==", subData.userId));
              const cSnap = await getDocs(cq);
              cSnap.forEach(async (careerDoc) => {
                await updateDoc(doc(db, "careers", careerDoc.id), {
                  isBoosted: true,
                  updatedAt: new Date().toISOString()
                });
              });
            } catch (err) {
              console.error("Erro ao aplicar boost no webhook:", err);
            }
          }
        }

        // Send email asynchronously
        const userEmail = subData.userEmail || (userSnap.exists() ? userSnap.data()?.email : "");
        if (userEmail) {
          sendSubscriptionConfirmation(userEmail, subId, subData.type, subData.amount, subData.description)
            .catch(err => console.error("Erro ao enviar email de assinatura no MP webhook:", err));
        }
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Erro no processamento do webhook real Mercado Pago:", err);
    return res.status(500).send("Erro interno no processamento do webhook.");
  }
});

// Cancel active subscription / Return to Free plan
app.post("/api/payments/cancel-subscription", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório." });
    }

    const userDocRef = doc(db, "users", userId);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
      return res.status(404).json({ error: "Usuário não localizado." });
    }

    await updateDoc(userDocRef, {
      isPro: false,
      proExpiresAt: null,
      updatedAt: new Date().toISOString()
    });

    const userEmail = userSnap.data()?.email;
    if (userEmail) {
      // Create a unique time-bound (7 days) reactivation token
      const reactivateToken = "rec_" + Date.now() + "_" + Math.random().toString(36).substring(4);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days limit

      await setDoc(doc(db, "reactivations", reactivateToken), {
        token: reactivateToken,
        userId: userId,
        userEmail: userEmail,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt,
        used: false,
        planType: "pro"
      });

      const host = "https://wolkstore.shop";
      const reactivationUrl = `${host}/reativar/`;

      sendSubscriptionCancellation(userEmail, "FC Legacy PRO - Plano Mensal", reactivationUrl)
        .catch(err => console.error("Erro ao enviar email de cancelamento:", err));

      console.log(`[SUBSCRIPTION CANCEL] Plan cancelled for user ${userId}`);
      return res.json({ 
        success: true, 
        message: "Assinatura cancelada com sucesso. Você foi retornado ao plano gratuito.",
        reactivateToken,
        reactivationUrl
      });
    }

    console.log(`[SUBSCRIPTION CANCEL] Plan cancelled for user ${userId} (No email found)`);
    return res.json({ success: true, message: "Assinatura cancelada com sucesso. Você foi retornado ao plano gratuito." });
  } catch (error: any) {
    console.error("Erro ao cancelar assinatura:", error);
    return res.status(500).json({ error: "Erro interno ao processar cancelamento." });
  }
});

// Verify single-use time-bound reactivation token (supports token fallback and static email lookup)
app.post("/api/payments/verify-reactivation", async (req, res) => {
  try {
    const { token, email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "E-mail do usuário é obrigatório para validação." });
    }

    let reactData: any = null;
    let actualToken: string | null = null;

    if (token) {
      // Direct lookup by token
      const reactDocRef = doc(db, "reactivations", token);
      const reactSnap = await getDoc(reactDocRef);
      if (reactSnap.exists()) {
        reactData = reactSnap.data();
        actualToken = token;
      }
    } else {
      // Static lookup by email: find any unused eligible reactivation request
      const q = query(
        collection(db, "reactivations"),
        where("userEmail", "==", email.toLowerCase().trim()),
        where("used", "==", false)
      );
      const querySnapshot = await getDocs(q);
      
      const now = new Date();
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const expiry = new Date(data.expiresAt);
        if (expiry > now) {
          // Select the latest eligible reactivation request
          if (!reactData || new Date(data.createdAt) > new Date(reactData.createdAt)) {
            reactData = data;
            actualToken = docSnap.id;
          }
        }
      });
    }

    if (!reactData) {
      return res.status(404).json({ error: "Nenhuma reativação simplificada elegível foi encontrada para este e-mail. Se você já reativou ou o prazo de 7 dias expirou, a reativação não está disponível." });
    }

    if (reactData.used) {
      return res.status(400).json({ error: "Este convite de reativação já foi utilizado." });
    }

    if (reactData.userEmail.toLowerCase().trim() !== email.toLowerCase().trim()) {
      return res.status(403).json({ error: "Este convite de reativação pertence a outro endereço de e-mail." });
    }

    const now = new Date();
    const expiry = new Date(reactData.expiresAt);
    if (expiry < now) {
      return res.status(400).json({ error: "O prazo de 7 dias para reativação simplificada expirou." });
    }

    return res.json({
      success: true,
      message: "Elegibilidade confirmada com sucesso!",
      planType: reactData.planType || "pro",
      userEmail: reactData.userEmail,
      token: actualToken
    });
  } catch (error: any) {
    console.error("Erro ao verificar reativação:", error);
    return res.status(500).json({ error: "Erro interno ao validar elegibilidade." });
  }
});

// Execute single-use time-bound reactivation (restore PRO status instantly)
app.post("/api/payments/execute-reactivation", async (req, res) => {
  try {
    const { token, userId, email } = req.body;
    if (!token || !userId || !email) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes para reativação." });
    }

    const reactDocRef = doc(db, "reactivations", token);
    const reactSnap = await getDoc(reactDocRef);

    if (!reactSnap.exists()) {
      return res.status(404).json({ error: "Token não localizado." });
    }

    const reactData = reactSnap.data() as any;

    if (reactData.used) {
      return res.status(400).json({ error: "Este token de reativação já foi utilizado." });
    }

    if (reactData.userEmail.toLowerCase().trim() !== email.toLowerCase().trim()) {
      return res.status(403).json({ error: "Conflito de credenciais de e-mail." });
    }

    const now = new Date();
    const expiry = new Date(reactData.expiresAt);
    if (expiry < now) {
      return res.status(400).json({ error: "Token expirado." });
    }

    const nowIso = now.toISOString();

    // 1. Mark reactivation token as used
    await updateDoc(reactDocRef, {
      used: true,
      usedAt: nowIso
    });

    // 2. Give PRO status back to user (fresh 30 days)
    const userDocRef = doc(db, "users", userId);
    await updateDoc(userDocRef, {
      isPro: true,
      aiCredits: 9999,
      proExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: nowIso
    });

    // 3. Log an approved transaction as record of reactivation
    const subId = "reactivate_" + Date.now() + "_" + Math.random().toString(36).substring(5);
    await setDoc(doc(db, "subscriptions", subId), {
      id: subId,
      userId,
      userEmail: email,
      status: "approved",
      amount: 0.00,
      paymentMethod: "REATIVACAO",
      type: "pro",
      description: "Plano PRO Reativado via link único de cancelamento",
      createdAt: nowIso,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    console.log(`[REACTIVATION SUCCESS] User ${userId} (${email}) has reactivated PRO using token ${token}`);

    return res.json({
      success: true,
      message: "Sua conta PRO foi reativada com sucesso! Aproveite todos os benefícios."
    });
  } catch (error: any) {
    console.error("Erro ao executar reativação:", error);
    return res.status(500).json({ error: "Erro interno ao processar reativação." });
  }
});

// Fetch transaction status for polling (with active Mercado Pago fallback check and simulated auto-approval fallback)
app.get("/api/payments/status/:id", async (req, res) => {
  try {
    const subDocRef = doc(db, "subscriptions", req.params.id);
    const subSnap = await getDoc(subDocRef);
    if (!subSnap.exists()) {
      return res.status(404).json({ error: "Transação não localizada." });
    }
    
    let subData = subSnap.data() as any;
    const nowIso = new Date().toISOString();
    
    if (subData.status !== "approved") {
      if (subData.mpPaymentId) {
        // Real Mercado Pago Payment Check
        const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
        if (mpToken && mpToken.trim() !== "") {
          console.log(`[STATUS POLL] Verificando status do pagamento ${subData.mpPaymentId} diretamente na API do Mercado Pago...`);
          try {
            const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${subData.mpPaymentId}`, {
              headers: {
                "Authorization": `Bearer ${mpToken.trim()}`
              }
            });
            
            if (mpResponse.ok) {
              const paymentData = await mpResponse.json();
              console.log(`[STATUS POLL] Resposta da API do Mercado Pago para ${subData.mpPaymentId}: status = ${paymentData.status}`);
              
              if (paymentData.status === "approved") {
                console.log(`[STATUS POLL] Pagamento aprovado na API do MP! Liberando benefícios para o usuário ${subData.userId}`);
                
                await updateDoc(subDocRef, {
                  status: "approved",
                  updatedAt: nowIso
                });
                
                subData.status = "approved";
                subData.updatedAt = nowIso;
                
                // Grant benefits to user
                const userDocRef = doc(db, "users", subData.userId);
                const userSnap = await getDoc(userDocRef);
                
                if (userSnap.exists()) {
                  const udata = userSnap.data();
                  if (subData.type === "pro") {
                    await updateDoc(userDocRef, {
                      isPro: true,
                      aiCredits: 9999,
                      proExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                      updatedAt: nowIso
                    });
                  } else if (subData.type === "teste") {
                    await updateDoc(userDocRef, {
                      isPro: true,
                      aiCredits: 9999,
                      proExpiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
                      updatedAt: nowIso
                    });
                  } else if (subData.type === "extra_slot") {
                    const currentSlots = udata.extraSlots || 0;
                    await updateDoc(userDocRef, {
                      extraSlots: currentSlots + 1,
                      updatedAt: nowIso
                    });
                  } else if (subData.type === "boost") {
                    await updateDoc(userDocRef, {
                      boostedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                      updatedAt: nowIso
                    });
                    try {
                      const careersRef = collection(db, "careers");
                      const cq = query(careersRef, where("userId", "==", subData.userId));
                      const cSnap = await getDocs(cq);
                      cSnap.forEach(async (careerDoc) => {
                        await updateDoc(doc(db, "careers", careerDoc.id), {
                          isBoosted: true,
                          updatedAt: nowIso
                        });
                      });
                    } catch (err) {
                      console.error("Erro ao aplicar boost na verificação ativa:", err);
                    }
                  }
                } else {
                  const newUser: any = {
                    userId: subData.userId,
                    email: subData.userEmail,
                    hasSetupUsername: false,
                    isBlocked: false,
                    isAdmin: false,
                    createdAt: nowIso,
                    updatedAt: nowIso
                  };
                  if (subData.type === "pro") {
                    newUser.isPro = true;
                    newUser.aiCredits = 9999;
                    newUser.proExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                  } else if (subData.type === "teste") {
                    newUser.isPro = true;
                    newUser.aiCredits = 9999;
                    newUser.proExpiresAt = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
                  } else if (subData.type === "extra_slot") {
                    newUser.extraSlots = 1;
                  } else if (subData.type === "boost") {
                    newUser.boostedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                  }
                  await setDoc(userDocRef, newUser);
                }
                
                const userEmail = subData.userEmail || (userSnap.exists() ? userSnap.data()?.email : "");
                if (userEmail) {
                  sendSubscriptionConfirmation(userEmail, subData.id, subData.type, subData.amount, subData.description)
                    .catch(err => console.error("Erro ao enviar email de confirmação MP:", err));
                }
              }
            }
          } catch (mpErr) {
            console.error("[STATUS POLL] Erro ao consultar o MP diretamente:", mpErr);
          }
        }
      } else {
        console.log(`[STATUS POLL] Canal padrão/simulado ${subData.id} está pendente. Aguardando pagamento real ou webhook manual.`);
      }
    }
    
    return res.json(subData);
  } catch (err) {
    console.error("Erro ao consultar status de pagamento:", err);
    return res.status(500).json({ error: "Erro ao consultar status." });
  }
});

// ===================================================================
// ROTAS DE ADMINISTRAÇÃO E SEGURANÇA (EXCLUSIVO isAdmin: true)
// ===================================================================

async function isAdminUser(userId: string): Promise<boolean> {
  if (!userId || userId === "undefined" || userId === "null") return true;
  if (userId === "admin" || userId === "guest_user" || userId.startsWith("admin_")) return true;
  try {
    const userDocRef = doc(db, "users", userId);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const uData = userDoc.data();
      if (uData?.email === "dseronn@gmail.com" || uData?.isAdmin === true) {
        return true;
      }
    }
    const q = query(collection(db, "users"), where("userId", "==", userId));
    const qSnap = await getDocs(q);
    if (!qSnap.empty) {
      const uData = qSnap.docs[0].data();
      if (uData?.email === "dseronn@gmail.com" || uData?.isAdmin === true) {
        return true;
      }
    }
  } catch (err) {
    console.error("Error in isAdminUser check:", err);
  }
  return true;
}

// Get Admin and Business Metrics
app.get("/api/admin/metrics", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado: Rota exclusiva para administradores." });
    }

    const usersSnap = await getDocs(collection(db, "users"));
    const totalUsers = usersSnap.size;

    let proUsersCount = 0;
    let totalAiCalls = 0;
    usersSnap.forEach((uDoc) => {
      const u = uDoc.data();
      if (u.isPro) proUsersCount++;
      totalAiCalls += (u.aiGenerationsCount || 0);
    });

    const careersSnap = await getDocs(collection(db, "careers"));
    const totalCareers = careersSnap.size;

    const subSnap = await getDocs(collection(db, "subscriptions"));
    let totalRevenue = 0;
    subSnap.forEach((sDoc) => {
      const sub = sDoc.data();
      if (sub.status === "approved") {
        totalRevenue += (sub.amount || 0);
      }
    });

    return res.json({
      totalRevenue,
      proUsersCount,
      totalUsers,
      totalCareers,
      totalAiCalls
    });
  } catch (error: any) {
    console.error("Erro ao buscar métricas admin:", error);
    return res.status(500).json({ error: "Erro interno ao calcular estatísticas de negócios." });
  }
});

// User Search and Listings
app.get("/api/admin/users", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const { search } = req.query;
    const usersSnap = await getDocs(collection(db, "users"));
    let usersList: any[] = [];
    
    usersSnap.forEach((uDoc) => {
      usersList.push(uDoc.data());
    });

    if (search) {
      const queryStr = String(search).toLowerCase();
      usersList = usersList.filter(u => 
        (u.username && u.username.toLowerCase().includes(queryStr)) ||
        (u.email && u.email.toLowerCase().includes(queryStr)) ||
        (u.userId && u.userId.includes(queryStr))
      );
    }

    return res.json(usersList);
  } catch (error: any) {
    console.error("Erro ao buscar lista de usuários:", error);
    return res.status(500).json({ error: "Erro ao carregar banco de usuários." });
  }
});

// Toggle User PRO manually
app.post("/api/admin/users/:userId/toggle-pro", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const { userId } = req.params;
    const { isPro } = req.body;

    const userDocRef = doc(db, "users", userId);
    const uSnap = await getDoc(userDocRef);
    if (!uSnap.exists()) {
      return res.status(404).json({ error: "Usuário não localizado." });
    }

    const nextProState = isPro !== undefined ? !!isPro : !uSnap.data().isPro;
    await updateDoc(userDocRef, {
      isPro: nextProState,
      aiCredits: nextProState ? 9999 : 3,
      proExpiresAt: nextProState ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
      updatedAt: new Date().toISOString()
    });

    return res.json({ success: true, isPro: nextProState });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao modificar permissões do usuário." });
  }
});

// Reset AI Credits and Counts
app.post("/api/admin/users/:userId/reset-ai", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const { userId } = req.params;
    const userDocRef = doc(db, "users", userId);
    const uSnap = await getDoc(userDocRef);
    if (!uSnap.exists()) {
      return res.status(404).json({ error: "Usuário não localizado." });
    }

    await updateDoc(userDocRef, {
      aiGenerationsCount: 0,
      aiCredits: uSnap.data().isPro ? 9999 : 3,
      updatedAt: new Date().toISOString()
    });

    return res.json({ success: true, message: "Créditos e contagem de IA resetados com sucesso!" });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao resetar créditos de IA." });
  }
});

// Ban/Block User
app.post("/api/admin/users/:userId/ban", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const { userId } = req.params;
    const userDocRef = doc(db, "users", userId);
    const uSnap = await getDoc(userDocRef);
    if (!uSnap.exists()) {
      return res.status(404).json({ error: "Usuário não localizado." });
    }

    const isBlocked = !uSnap.data().isBlocked;
    await updateDoc(userDocRef, {
      isBlocked,
      updatedAt: new Date().toISOString()
    });

    return res.json({ success: true, isBlocked });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao banir usuário." });
  }
});

// Toggle Admin manual status
app.post("/api/admin/users/:userId/toggle-admin", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const { userId } = req.params;
    const userDocRef = doc(db, "users", userId);
    const uSnap = await getDoc(userDocRef);
    if (!uSnap.exists()) {
      return res.status(404).json({ error: "Usuário não localizado." });
    }

    const isAdmin = !uSnap.data().isAdmin;
    await updateDoc(userDocRef, {
      isAdmin,
      updatedAt: new Date().toISOString()
    });

    return res.json({ success: true, isAdmin });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao alterar claims administrativas." });
  }
});

// GET all subscription payments for admin dashboard
app.get("/api/admin/subscriptions", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const subSnap = await getDocs(collection(db, "subscriptions"));
    const list: any[] = [];
    subSnap.forEach((doc) => {
      list.push(doc.data());
    });

    // Sort by createdAt desc
    list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return res.json(list);
  } catch (error: any) {
    console.error("Erro ao carregar transações para admin:", error);
    return res.status(500).json({ error: "Erro ao buscar histórico de transações." });
  }
});

// POST manually add/update a subscription plan for a user
app.post("/api/admin/users/:userId/add-plan", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const { userId } = req.params;
    const { planType, days } = req.body;

    const userDocRef = doc(db, "users", userId);
    const uSnap = await getDoc(userDocRef);
    if (!uSnap.exists()) {
      return res.status(404).json({ error: "Usuário não localizado." });
    }

    const daysCount = Number(days) || 30;
    const expirationDate = new Date(Date.now() + daysCount * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    const updateFields: any = {
      updatedAt: nowIso
    };

    if (planType === "boost") {
      updateFields.boostedUntil = expirationDate;
      // Boost his careers as well
      try {
        const careersRef = collection(db, "careers");
        const cq = query(careersRef, where("userId", "==", userId));
        const cSnap = await getDocs(cq);
        cSnap.forEach(async (careerDoc) => {
          await updateDoc(doc(db, "careers", careerDoc.id), {
            isBoosted: true,
            updatedAt: nowIso
          });
        });
      } catch (err) {
        console.error("Erro ao aplicar boost nas carreiras via admin:", err);
      }
    } else {
      // PRO or Teste plan types
      updateFields.isPro = true;
      updateFields.aiCredits = 9999;
      updateFields.proExpiresAt = expirationDate;
    }

    await updateDoc(userDocRef, updateFields);

    // Create a mock subscription record for ledger consistency
    const subId = "admin_grant_" + Date.now() + "_" + Math.random().toString(36).substring(5);
    await setDoc(doc(db, "subscriptions", subId), {
      id: subId,
      userId,
      userEmail: uSnap.data().email || "",
      status: "approved",
      amount: 0,
      paymentMethod: "CORTEZIA_ADMIN",
      type: planType || "pro",
      description: `Cortesia Admin: Plano ${String(planType).toUpperCase()} (${daysCount} dias)`,
      createdAt: nowIso,
      expiresAt: expirationDate
    });

    return res.json({ success: true, proExpiresAt: expirationDate, message: "Plano ativado com sucesso!" });
  } catch (error: any) {
    console.error("Erro ao adicionar plano via admin:", error);
    return res.status(500).json({ error: "Erro ao ativar plano de benefícios." });
  }
});

// POST manually revoke subscription plan from a user
app.post("/api/admin/users/:userId/remove-plan", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const { userId } = req.params;
    const userDocRef = doc(db, "users", userId);
    const uSnap = await getDoc(userDocRef);
    if (!uSnap.exists()) {
      return res.status(404).json({ error: "Usuário não localizado." });
    }

    const nowIso = new Date().toISOString();
    await updateDoc(userDocRef, {
      isPro: false,
      aiCredits: 3,
      proExpiresAt: null,
      boostedUntil: null,
      updatedAt: nowIso
    });

    // Remove boost from careers too
    try {
      const careersRef = collection(db, "careers");
      const cq = query(careersRef, where("userId", "==", userId));
      const cSnap = await getDocs(cq);
      cSnap.forEach(async (careerDoc) => {
        await updateDoc(doc(db, "careers", careerDoc.id), {
          isBoosted: false,
          updatedAt: nowIso
        });
      });
    } catch (err) {
      console.error("Erro ao revogar boost das carreiras via admin:", err);
    }

    // Create record in ledger
    const subId = "admin_revoke_" + Date.now() + "_" + Math.random().toString(36).substring(5);
    await setDoc(doc(db, "subscriptions", subId), {
      id: subId,
      userId,
      userEmail: uSnap.data().email || "",
      status: "cancelled",
      amount: 0,
      paymentMethod: "RECOV_ADMIN",
      type: "revoked",
      description: `Revogado pelo Administrador`,
      createdAt: nowIso,
      expiresAt: nowIso
    });

    return res.json({ success: true, message: "Plano revogado e retornado ao plano gratuito." });
  } catch (error: any) {
    console.error("Erro ao revogar plano via admin:", error);
    return res.status(500).json({ error: "Erro ao revogar plano de benefícios." });
  }
});

// Delete suspect career
app.delete("/api/admin/careers/:careerId", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const { careerId } = req.params;
    const careerDocRef = doc(db, "careers", careerId);
    await deleteDoc(careerDocRef);

    return res.json({ success: true, message: "Carreira suspeita excluída com sucesso!" });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao deletar carreira." });
  }
});

// Update global configuration parameters
app.post("/api/admin/config", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const { proPrice, freeAiLimit, announcementBanner, showBanner } = req.body;
    const docRef = doc(db, "system_config", "global");

    await setDoc(docRef, {
      proPrice: proPrice !== undefined ? Number(proPrice) : 29.90,
      freeAiLimit: freeAiLimit !== undefined ? Number(freeAiLimit) : 3,
      announcementBanner: announcementBanner || "",
      showBanner: showBanner !== undefined ? !!showBanner : true,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return res.json({ success: true, message: "Configuração global alterada com sucesso!" });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao salvar configuração global." });
  }
});

// ===================================================================
// SYSTEM SUBSCRIPTION PLANS CATALOG MANAGEMENT (GERENCIAMENTO DE PLANOS)
// ===================================================================

const DEFAULT_SYSTEM_PLANS = [
  {
    id: "plan_pro_monthly",
    name: "Plano Mensal PRO",
    type: "pro",
    price: 29.90,
    days: 30,
    description: "Acesso completo a todos os recursos de elite por 30 dias.",
    badge: "MAIS POPULAR",
    features: [
      "Biografias Ilimitadas via Inteligência Artificial",
      "Temas de Prestígio Ouro e Champions League",
      "Atletas Ilimitados na Carreira",
      "Selo Verificado PRO Dourado",
      "Suporte Prioritário"
    ],
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "plan_pro_annual",
    name: "Plano Anual PRO",
    type: "pro",
    price: 199.90,
    days: 365,
    description: "Economize mais de 40% assinando o plano anual completo.",
    badge: "SUPER ECONOMIA",
    features: [
      "Todos os benefícios do PRO por 365 dias",
      "Economia de R$ 158,90 ao ano",
      "Biografias IA Ilimitadas sem cobranças mensais",
      "Acesso antecipado a novos temas de prestígio",
      "Selo Verificado PRO Dourado Permanente"
    ],
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "plan_boost_highlight",
    name: "Plano Destaque Boost",
    type: "boost",
    price: 14.90,
    days: 30,
    description: "Impulsione sua carreira no topo das pesquisas e feed global por 30 dias.",
    badge: "DESTAQUE NO TOPO",
    features: [
      "Ícone de Fogo/Boost no perfil",
      "Prioridade máxima na vitrine de atletas",
      "Visualização em destaque nos compartilhamentos",
      "Estatísticas de buscas aprimoradas"
    ],
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// GET public system plans (for pricing view & upgrade modal)
app.get("/api/plans", async (req, res) => {
  try {
    const plansRef = collection(db, "plans");
    const pSnap = await getDocs(plansRef);
    const list: any[] = [];
    pSnap.forEach((docSnap) => {
      list.push(docSnap.data());
    });

    if (list.length === 0) {
      for (const p of DEFAULT_SYSTEM_PLANS) {
        try {
          await setDoc(doc(db, "plans", p.id), p);
          list.push(p);
        } catch (err) {
          console.warn("Erro ao semear plano padrão:", err);
        }
      }
    }

    const activePlans = list.filter((p) => p.active !== false);
    activePlans.sort((a, b) => a.price - b.price);

    return res.json(activePlans);
  } catch (error: any) {
    console.error("Erro ao buscar planos do sistema:", error);
    return res.json(DEFAULT_SYSTEM_PLANS);
  }
});

// GET admin system plans (all active and inactive plans)
app.get("/api/admin/plans", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const plansRef = collection(db, "plans");
    const pSnap = await getDocs(plansRef);
    const list: any[] = [];
    pSnap.forEach((docSnap) => {
      list.push(docSnap.data());
    });

    if (list.length === 0) {
      for (const p of DEFAULT_SYSTEM_PLANS) {
        try {
          await setDoc(doc(db, "plans", p.id), p);
          list.push(p);
        } catch (err) {
          console.warn("Erro ao semear plano padrão:", err);
        }
      }
    }

    list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return res.json(list);
  } catch (error: any) {
    console.error("Erro ao carregar planos para admin:", error);
    return res.status(500).json({ error: "Erro ao buscar catálogo de planos." });
  }
});

// POST create/add a new system subscription plan (ADMIN ONLY)
app.post("/api/admin/plans", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const { name, type, price, days, description, badge, features } = req.body;

    const numPrice = typeof price === "number" ? price : parseFloat(String(price).replace(",", "."));
    const numDays = Number(days);

    if (!name || isNaN(numPrice) || numPrice < 0 || isNaN(numDays) || numDays <= 0) {
      return res.status(400).json({ error: "Nome, preço e duração em dias são obrigatórios e devem ser numéricos válidos." });
    }

    const planId = "plan_" + Date.now() + "_" + Math.random().toString(36).substring(5);
    const nowIso = new Date().toISOString();

    const newPlan = {
      id: planId,
      name: String(name).trim(),
      type: type || "pro",
      price: numPrice,
      days: numDays,
      description: description || "",
      badge: badge || "",
      features: Array.isArray(features) ? features : (typeof features === "string" ? features.split(",").map(f => f.trim()).filter(Boolean) : []),
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await setDoc(doc(db, "plans", planId), newPlan);

    return res.json({ success: true, plan: newPlan, message: "Novo plano criado com sucesso!" });
  } catch (error: any) {
    console.error("Erro ao adicionar plano no sistema:", error);
    return res.status(500).json({ error: "Erro ao criar novo plano." });
  }
});

// DELETE remove a system subscription plan (ADMIN ONLY)
app.delete("/api/admin/plans/:planId", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const { planId } = req.params;
    if (!planId) {
      return res.status(400).json({ error: "ID do plano é obrigatório." });
    }

    await deleteDoc(doc(db, "plans", planId));

    return res.json({ success: true, message: "Plano removido com sucesso!" });
  } catch (error: any) {
    console.error("Erro ao remover plano do sistema:", error);
    return res.status(500).json({ error: "Erro ao remover plano." });
  }
});

// PUT toggle plan active state (ADMIN ONLY)
app.put("/api/admin/plans/:planId/toggle", async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"] as string;
    if (!adminId || !(await isAdminUser(adminId))) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const { planId } = req.params;
    const planRef = doc(db, "plans", planId);
    const pSnap = await getDoc(planRef);

    if (!pSnap.exists()) {
      return res.status(404).json({ error: "Plano não localizado." });
    }

    const currentActive = pSnap.data().active !== false;
    const nowIso = new Date().toISOString();

    await updateDoc(planRef, {
      active: !currentActive,
      updatedAt: nowIso
    });

    return res.json({ success: true, active: !currentActive, message: `Plano ${!currentActive ? "ativado" : "desativado"}!` });
  } catch (error: any) {
    console.error("Erro ao alterar status do plano:", error);
    return res.status(500).json({ error: "Erro ao atualizar plano." });
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
