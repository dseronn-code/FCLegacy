import React, { useState } from "react";
import { X, Settings, Sparkles, AlertCircle, Loader2, Check, CreditCard, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: any;
  onOpenUpgrade: (type: "manual" | "slot_limit" | "credit_limit") => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onOpenUpgrade
}) => {
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [cancelSuccess, setCancelSuccess] = useState<boolean>(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCancelSubscription = async () => {
    if (!userProfile?.userId) return;
    
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userProfile.userId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCancelSuccess(true);
        setTimeout(() => {
          setCancelSuccess(false);
          setShowConfirmCancel(false);
          onClose();
          window.location.reload(); // Reload to refresh user credentials
        }, 2500);
      } else {
        setError(data.error || "Erro ao processar cancelamento de assinatura.");
      }
    } catch (err) {
      console.error("Erro ao cancelar assinatura:", err);
      setError("Erro interno de rede ao cancelar assinatura.");
    } finally {
      setCancelling(false);
    }
  };

  const getFormattedDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/85 backdrop-blur-md" onClick={onClose}></div>

      {/* Modal Container */}
      <div className="relative w-full max-w-md bg-[#0e0e11] border border-white/5 rounded-[32px] p-6 sm:p-8 shadow-2xl overflow-hidden z-10">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-zinc-700 via-brand-green to-zinc-800"></div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 bg-white/5 hover:bg-white/10 rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {showConfirmCancel ? (
          /* CUSTOM SUBSCRIPTION CANCELLATION WARNING VIEW */
          <div className="space-y-6 mt-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="font-display font-black text-lg text-white uppercase tracking-tight">Cancelar Assinatura?</h3>
                <p className="text-[10px] font-mono text-red-500 uppercase tracking-widest font-bold">Aviso Importante</p>
              </div>
            </div>

            <div className="bg-red-500/5 border border-red-500/10 p-5 rounded-2xl space-y-4">
              <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                Tem certeza que deseja cancelar sua assinatura <strong className="text-white">FC Legacy PRO</strong>? Ao cancelar, você perderá acesso imediato aos seguintes recursos exclusivos:
              </p>

              <div className="space-y-3 font-mono text-[10px] text-zinc-400 border-t border-red-500/10 pt-3">
                <div className="flex gap-2">
                  <span className="text-red-500 font-bold">[-]</span>
                  <span><strong className="text-zinc-200">Gerações de IA Ilimitadas:</strong> Retorno ao limite estrito de apenas 3 análises de atletas.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500 font-bold">[-]</span>
                  <span><strong className="text-zinc-200">Temas de Prestígio:</strong> Seus atletas perderão os layouts exclusivos Ouro e Champions League.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500 font-bold">[-]</span>
                  <span><strong className="text-zinc-200">Criação Ilimitada:</strong> Limite máximo de apenas 3 atletas ativos simultaneamente.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500 font-bold">[-]</span>
                  <span><strong className="text-zinc-200">Selo Verificado Dourado:</strong> Seu destaque e badge dourado de prestígio serão revogados.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500 font-bold">[-]</span>
                  <span><strong className="text-zinc-200">Análises Avançadas:</strong> Perda de acesso aos gráficos de evolução de atributos.</span>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-left flex items-start gap-2 text-red-400 text-xs leading-normal">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2.5 pt-2">
                {/* Keep PRO button */}
                <button
                  onClick={() => setShowConfirmCancel(false)}
                  className="w-full py-3 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all shadow-[0_0_12px_rgba(234,179,8,0.2)] cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4 fill-black" />
                  Manter Minha Conta PRO
                </button>

                {/* Confirm cancellation button */}
                <button
                  disabled={cancelling || cancelSuccess}
                  onClick={handleCancelSubscription}
                  className="w-full py-2.5 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 hover:border-red-500/40 text-red-400 font-mono text-[10px] uppercase font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {cancelling ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Cancelando assinatura...
                    </>
                  ) : cancelSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-brand-green" />
                      Cancelada! Verifique seu E-mail
                    </>
                  ) : (
                    "Sim, cancelar meus benefícios"
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* NORMAL SETTINGS VIEW */
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6 mt-4">
              <div className="p-2.5 bg-brand-green/10 border border-brand-green/20 rounded-2xl text-brand-green">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-black text-lg text-white uppercase tracking-tight">Configurações</h3>
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Painel do Treinador</p>
              </div>
            </div>

            {/* Content */}
            <div className="space-y-6">
              {/* Subscription / Plan Section */}
              <div className="bg-zinc-950/60 border border-white/5 p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">Seu Plano Atual</span>
                  {userProfile?.isPro ? (
                    <span className="px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-[9px] font-mono text-yellow-400 font-bold uppercase flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.15)]">
                      <Sparkles className="w-3 h-3 fill-yellow-400 animate-pulse" />
                      Ativo (PRO)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-zinc-800 border border-white/5 rounded-lg text-[9px] font-mono text-zinc-400 font-bold uppercase">
                      Gratuito (FREE)
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <h4 className="font-display font-black text-xl text-white uppercase leading-tight">
                    {userProfile?.isPro ? "FC Legacy PRO" : "Plano Gratuito"}
                  </h4>
                  <p className="text-xs text-zinc-400">
                    {userProfile?.isPro 
                      ? "Acesso completo a gerações de IA ilimitadas, todos os temas e atletas infinitos." 
                      : "Limite de 3 gerações de IA e no máximo 3 atletas simultâneos."}
                  </p>
                </div>

                {userProfile?.isPro && userProfile?.proExpiresAt && (
                  <div className="text-[10px] font-mono text-zinc-500 flex justify-between border-t border-white/5 pt-3">
                    <span>Válido até:</span>
                    <span className="text-zinc-300 font-bold">{getFormattedDate(userProfile.proExpiresAt)}</span>
                  </div>
                )}

                {/* Error alerts */}
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-left flex items-start gap-2 text-red-400 text-xs leading-normal">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Action controls */}
                <div className="space-y-2 pt-2">
                  {userProfile?.isPro ? (
                    <>
                      <button
                        onClick={() => {
                          onClose();
                          onOpenUpgrade("manual");
                        }}
                        className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-zinc-700 text-zinc-300 hover:text-white font-mono text-[10px] uppercase font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        Mudar de Plano / Adquirir Extras
                      </button>

                      <button
                        onClick={() => setShowConfirmCancel(true)}
                        className="w-full py-2.5 bg-red-950/20 hover:bg-red-950/40 border border-red-500/10 hover:border-red-500/30 text-red-400 hover:text-red-300 font-mono text-[10px] uppercase font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Cancelar Assinatura PRO
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenUpgrade("manual");
                      }}
                      className="w-full py-3 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all shadow-[0_0_12px_rgba(234,179,8,0.2)] hover:shadow-[0_0_15px_rgba(234,179,8,0.3)] cursor-pointer flex items-center justify-center gap-1.5 animate-pulse"
                    >
                      <Sparkles className="w-4 h-4 fill-black" />
                      Fazer Upgrade para PRO
                    </button>
                  )}
                </div>
              </div>

              {/* Tips block */}
              <div className="bg-zinc-950/40 border border-white/5 p-4 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h5 className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Privacidade & Dados</h5>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Suas informações de carreira e atleta são salvas de forma segura no banco de dados. Para alterar seu nome de usuário ou sair da sua conta, use as opções do cabeçalho principal.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
