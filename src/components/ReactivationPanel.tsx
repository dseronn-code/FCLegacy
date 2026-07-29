import React, { useState, useEffect } from "react";
import { ShieldAlert, Check, Loader2, Sparkles, LogOut, Mail, KeyRound, LogIn } from "lucide-react";
import { motion } from "motion/react";
import { auth } from "../firebase";
import { signOut, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";

interface ReactivationPanelProps {
  currentUser: any;
  token: string | null;
  onClose: () => void;
}

export const ReactivationPanel: React.FC<ReactivationPanelProps> = ({
  currentUser,
  token,
  onClose
}) => {
  const [checking, setChecking] = useState<boolean>(true);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [reactivating, setReactivating] = useState<boolean>(false);
  const [verificationData, setVerificationData] = useState<any | null>(null);
  const [internalToken, setInternalToken] = useState<string | null>(null);

  // Authentication states
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const verifyEligibility = async () => {
      if (!currentUser || !currentUser.email) {
        setChecking(false);
        return;
      }

      setChecking(true);
      setErrorMsg(null);

      try {
        const res = await fetch("/api/payments/verify-reactivation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: token || null,
            email: currentUser.email
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setStatus("idle");
          setVerificationData(data);
          setInternalToken(data.token || token);
        } else {
          setStatus("error");
          setErrorMsg(data.error || "Falha ao verificar elegibilidade de reativação.");
        }
      } catch (err) {
        console.error("Erro ao verificar reativação:", err);
        setStatus("error");
        setErrorMsg("Erro de conexão com o servidor. Por favor, tente novamente.");
      } finally {
        setChecking(false);
      }
    };

    verifyEligibility();
  }, [token, currentUser]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setAuthError("Por favor, preencha todos os campos.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setAuthError("E-mail ou senha incorretos.");
      } else {
        setAuthError(err.message || "Erro ao realizar autenticação.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || "Erro ao autenticar com o Google.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleReactivate = async () => {
    const activeToken = internalToken || token;
    if (!activeToken || !currentUser || !currentUser.email) {
      setErrorMsg("Identificador de reativação não localizado. Não é possível prosseguir.");
      return;
    }

    setReactivating(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/payments/execute-reactivation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: activeToken,
          userId: currentUser.uid,
          email: currentUser.email
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("success");
        setSuccessMsg(data.message);
        setTimeout(() => {
          window.location.href = "/";
        }, 3500);
      } else {
        setErrorMsg(data.error || "Falha ao processar reativação simplificada.");
      }
    } catch (err) {
      console.error("Erro ao executar reativação:", err);
      setErrorMsg("Erro de conexão ao processar reativação. Tente novamente.");
    } finally {
      setReactivating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (err) {
      console.error("Erro ao fazer logout:", err);
    }
  };

  // If the user is NOT authenticated, show a beautifully styled authentication form within the reactivation view
  if (!currentUser) {
    return (
      <main className="max-w-md w-full mx-auto px-4 py-12 flex-1 flex flex-col justify-center animate-fadeIn">
        <div className="bg-[#0c0c0e] border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 via-brand-green to-yellow-400"></div>
          
          <div className="text-center mb-6">
            <Sparkles className="w-12 h-12 text-yellow-400 mx-auto mb-4 animate-pulse" />
            <h2 className="font-display font-black text-2xl text-white uppercase tracking-tight">
              REATIVAR <span className="text-brand-green">PRO</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Você acessou o portal seguro de reativação do seu plano PRO.
              <strong className="block mt-1.5 text-zinc-300">Faça login com a conta de e-mail que recebeu o link para verificar sua elegibilidade.</strong>
            </p>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">Endereço de E-mail</label>
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="exemplo@email.com"
                  className="w-full bg-black/40 border border-white/5 rounded-xl pl-11 pr-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">Senha Secreta</label>
              <div className="relative">
                <KeyRound className="absolute left-4 top-3.5 w-4 h-4 text-zinc-500" />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Sua senha de login"
                  className="w-full bg-black/40 border border-white/5 rounded-xl pl-11 pr-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                  required
                />
              </div>
            </div>

            {authError && (
              <div className="p-3.5 bg-red-950/30 border border-red-500/20 rounded-xl text-red-200 text-[11px] leading-normal text-center font-mono">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3.5 bg-brand-green hover:bg-[#d9ff33] text-black font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 active:scale-97 cursor-pointer disabled:opacity-50 font-bold"
            >
              {authLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {authLoading ? "Verificando..." : "Entrar e Verificar Elegibilidade"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-4">
            <span className="h-px bg-white/5 flex-1"></span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">OU</span>
            <span className="h-px bg-white/5 flex-1"></span>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={authLoading}
            className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-brand-green/30 text-white font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 active:scale-97 cursor-pointer disabled:opacity-50 font-bold"
          >
            <svg className="w-4 h-4 text-white shrink-0 fill-current mr-1" viewBox="0 0 24 24" width="16" height="16">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Entrar com o Google
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full mt-3 py-2.5 bg-transparent hover:bg-white/5 border border-white/5 text-zinc-400 hover:text-white font-mono text-[10px] uppercase font-bold rounded-xl transition-all cursor-pointer text-center"
          >
            Voltar para o Início
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-lg w-full mx-auto px-4 py-16 flex-1 flex flex-col justify-center animate-fadeIn">
      <div className="bg-[#0c0c0e] border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
        {/* Dynamic decorative top border */}
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
          status === "error" 
            ? "from-red-500 via-amber-500 to-red-500" 
            : status === "success" 
            ? "from-brand-green via-yellow-400 to-brand-green" 
            : "from-yellow-400 via-amber-500 to-yellow-400"
        }`}></div>

        <div className="text-center space-y-6">
          {checking ? (
            <div className="py-12 space-y-4">
              <Loader2 className="w-10 h-10 text-yellow-400 animate-spin mx-auto" />
              <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Verificando elegibilidade do link...</p>
            </div>
          ) : status === "success" ? (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="space-y-4 py-6"
            >
              <div className="mx-auto w-16 h-16 bg-brand-green/15 border border-brand-green/30 text-brand-green rounded-full flex items-center justify-center shadow-[0_0_25px_rgba(20,184,166,0.2)]">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <h2 className="font-display font-black text-2xl text-white uppercase tracking-tight">FC LEGACY PRO ATIVADO</h2>
              <p className="text-sm text-zinc-300 leading-relaxed max-w-sm mx-auto">
                {successMsg || "Sua assinatura PRO foi reativada com sucesso de forma simplificada."}
              </p>
              <div className="p-3 bg-white/5 rounded-2xl inline-flex items-center gap-1.5 text-[10px] font-mono text-brand-green uppercase tracking-wider font-bold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Carregando seus privilégios PRO...
              </div>
            </motion.div>
          ) : status === "error" ? (
            <div className="space-y-4 py-4">
              <div className="mx-auto w-14 h-14 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h2 className="font-display font-black text-xl text-white uppercase tracking-tight">Falha na Reativação</h2>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-md mx-auto">
                {errorMsg}
              </p>
              
              <div className="bg-zinc-950/60 border border-white/5 p-4 rounded-2xl text-left space-y-2">
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Verificações de Segurança:</p>
                <ul className="text-[11px] text-zinc-400 space-y-1.5 list-disc pl-4">
                  <li>O link expira automaticamente em 7 dias após o cancelamento.</li>
                  <li>O link é de uso único e insubstituível.</li>
                  <li>Você deve estar logado no FC Legacy com o mesmo e-mail que recebeu o aviso de cancelamento.</li>
                </ul>
              </div>

              <div className="flex flex-col gap-2 pt-4">
                <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1 border-b border-white/5 pb-2">
                  <span>E-mail conectado:</span>
                  <span className="text-white font-mono font-bold">{currentUser?.email}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleLogout}
                    className="py-3 bg-zinc-950 hover:bg-zinc-900 border border-white/5 hover:border-red-500/30 text-zinc-400 hover:text-white font-mono text-[10px] uppercase font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-red-500" />
                    Trocar de Conta
                  </button>
                  <button
                    onClick={onClose}
                    className="py-3 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-zinc-300 hover:text-white font-mono text-[10px] uppercase font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Ir para o Início
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="space-y-6 py-2"
            >
              <div className="inline-flex p-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-2xl">
                <Sparkles className="w-6 h-6 fill-yellow-400" />
              </div>
              <div className="space-y-2">
                <h2 className="font-display font-black text-2xl text-white uppercase tracking-tight">Reativar FC LEGACY PRO</h2>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                  Identificamos que você possui um link simplificado válido para reativar seu plano PRO sem precisar refazer o pagamento!
                </p>
              </div>

              <div className="bg-zinc-950/60 border border-white/5 p-5 rounded-2xl space-y-3 text-left">
                <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2.5">
                  <span className="text-zinc-500">Usuário Elegível:</span>
                  <span className="text-white font-bold font-mono">{verificationData?.userEmail}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2.5">
                  <span className="text-zinc-500">Benefício a Restaurar:</span>
                  <span className="text-brand-green font-bold uppercase tracking-wider font-mono">PLANO PRO COMPLETO</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Status do Link:</span>
                  <span className="text-yellow-400 font-bold uppercase font-mono text-[10px] tracking-wider animate-pulse">Pendente / Pronto</span>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-950/30 border border-red-500/20 text-red-200 text-xs rounded-xl text-left flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  disabled={reactivating}
                  onClick={onClose}
                  className="py-3.5 bg-zinc-950 hover:bg-zinc-900 border border-white/5 text-zinc-500 hover:text-zinc-400 font-mono text-[10px] uppercase font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  disabled={reactivating}
                  onClick={handleReactivate}
                  className="py-3.5 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(234,179,8,0.2)] active:scale-97 cursor-pointer"
                >
                  {reactivating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Reativar Agora"
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
};
