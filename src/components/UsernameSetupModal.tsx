import React, { useState } from "react";
import { ShieldAlert, CheckCircle2, Loader2, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { db } from "../firebase";
import { collection, query, where, getDocs, doc, setDoc } from "firebase/firestore";

interface UsernameSetupModalProps {
  userId: string;
  email: string;
  onSuccess: (newUsername: string) => void;
}

export const UsernameSetupModal: React.FC<UsernameSetupModalProps> = ({
  userId,
  email,
  onSuccess
}) => {
  const [username, setUsername] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanInput = username.trim().replace(/^@/, "");
    if (!cleanInput) {
      setError("O username não pode ser vazio.");
      return;
    }

    if (!/^[a-zA-Z0-9_.-]{3,25}$/.test(cleanInput)) {
      setError("Username deve conter de 3 a 25 caracteres (letras, números, sublinhados, traços ou pontos).");
      return;
    }

    setLoading(true);
    try {
      // Check if the username is already taken by a different user (case-insensitive check)
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("usernameLower", "==", cleanInput.toLowerCase()));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const existingUserDoc = querySnapshot.docs[0];
        if (existingUserDoc.id !== userId) {
          setError("Este @username já está sendo utilizado por outro treinador.");
          setLoading(false);
          return;
        }
      }

      // Save/update user profile in Firestore directly from the authenticated client
      const userDocRef = doc(db, "users", userId);
      const userProfile = {
        userId,
        username: cleanInput,
        usernameLower: cleanInput.toLowerCase(),
        email: email || "",
        hasSetupUsername: true,
        updatedAt: new Date().toISOString()
      };
      await setDoc(userDocRef, userProfile, { merge: true });

      setSuccess(true);
      setTimeout(() => {
        onSuccess(cleanInput);
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro de permissão ou conexão ao salvar seu username.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-[#0c0c0e] border border-brand-green/30 rounded-[32px] p-8 shadow-[0_0_50px_rgba(217,255,51,0.15)] relative overflow-hidden"
      >
        {/* Neon top highlight */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-brand-green via-yellow-400 to-brand-green"></div>

        <div className="text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-brand-green/10 border border-brand-green/20 rounded-2xl flex items-center justify-center text-brand-green shadow-[0_0_20px_rgba(217,255,51,0.1)]">
            <Trophy className="w-8 h-8 animate-bounce" />
          </div>

          <div>
            <span className="text-[9px] font-mono text-brand-green uppercase tracking-widest font-bold">
              ETAPA CRÍTICA // IDENTIDADE DO TREINADOR
            </span>
            <h2 className="font-display font-black text-2xl text-white uppercase italic tracking-tight mt-1">
              Escolha seu Username
            </h2>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Para desbloquear o acesso total ao **FC Legacy**, você precisa registrar seu handle exclusivo da comunidade. Ele será sua identidade no ranking de treinadores.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/20 rounded-xl text-red-200 text-xs flex gap-2.5 text-left">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {success ? (
            <div className="p-4 bg-brand-green/10 border border-brand-green/20 rounded-xl text-brand-green text-xs flex flex-col items-center gap-2">
              <CheckCircle2 className="w-8 h-8 animate-pulse" />
              <span className="font-bold uppercase tracking-wider">Identidade Configurada! Desbloqueando...</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div className="space-y-1.5">
                <label className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-bold">
                  Seu Handle Exclusivo
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 font-mono text-sm text-brand-green font-bold">
                    @
                  </span>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    placeholder="ex: usuario_123"
                    value={username}
                    onChange={(e) => {
                      // Allow letters, numbers, underscores, dashes, dots and leading @
                      const cleaned = e.target.value.replace(/[^a-zA-Z0-9_.-]/g, "");
                      setUsername(cleaned);
                    }}
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-4 py-3.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono font-bold"
                  />
                </div>
                <span className="text-[10px] text-zinc-500 block font-mono">
                  * Letras (maiúsculas/minúsculas), números, sublinhados (_), traços (-) ou pontos (.) de 3 a 25 caracteres.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-brand-green hover:bg-[#d9ff33] text-black font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 glow-green cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Registrando Identidade...
                  </>
                ) : (
                  "Desbloquear Meu Legado"
                )}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
};
