import React, { useState, useEffect } from "react";
import { X, Sparkles, Check, Trophy, AlertCircle, Coins, Flame, ShieldAlert, CreditCard, QrCode, Loader2, Copy } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface UpgradeModalProps {
  isOpen: boolean;
  type: "slot_limit" | "credit_limit" | "manual";
  onClose: () => void;
  userId: string;
  userEmail: string;
  proPrice: number;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  type,
  onClose,
  userId,
  userEmail,
  proPrice
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [checkoutData, setCheckoutData] = useState<any | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<boolean>(false);
  const [copiedPix, setCopiedPix] = useState<boolean>(false);

  // Poll payment status every 3 seconds when checkout is pending
  useEffect(() => {
    if (!checkoutData || paymentSuccess) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/status/${checkoutData.subscriptionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "approved") {
            setPaymentSuccess(true);
            clearInterval(interval);
            setTimeout(() => {
              setCheckoutData(null);
              setPaymentSuccess(false);
              onClose();
              window.location.reload(); // Reload to apply all premium entitlements
            }, 3000);
          }
        }
      } catch (err) {
        console.error("Erro ao verificar status de pagamento:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [checkoutData, paymentSuccess, onClose]);

  if (!isOpen) return null;

  const handleCreateCheckout = async (purchaseType: "pro" | "extra_slot" | "boost" | "teste") => {
    setLoading(true);
    try {
      const res = await fetch("/api/payments/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          userEmail,
          type: purchaseType
        })
      });
      const data = await res.json();
      if (data.success) {
        setCheckoutData(data);
      }
    } catch (err) {
      console.error("Erro ao criar checkout:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPix = () => {
    if (!checkoutData) return;
    const codeToCopy = checkoutData.qrCode || `00020101021226830014br.gov.bcb.pix2561api.mercadopago.com/pix/qr/v2/pay-${checkoutData.subscriptionId}52040000530398654041.005802BR5910FC_LEGACY6009SAO_PAULO62070503***6304FC02`;
    navigator.clipboard.writeText(codeToCopy);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/85 backdrop-blur-md" onClick={onClose}></div>

      {/* Container */}
      <div className="relative w-full max-w-lg bg-[#0e0e11] border border-white/5 rounded-[32px] p-6 sm:p-8 shadow-2xl overflow-hidden z-10">
        {/* Colorful top border */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-yellow-400 via-brand-green to-amber-500"></div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 bg-white/5 hover:bg-white/10 rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <AnimatePresence mode="wait">
          {!checkoutData ? (
            <motion.div
              key="plans"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              {/* Header and warnings based on limit reason */}
              <div className="text-center space-y-2 mt-4">
                <div className="inline-flex p-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-2xl shadow-[0_0_15px_rgba(234,179,8,0.15)] mb-2 animate-bounce">
                  <Sparkles className="w-6 h-6 fill-yellow-400" />
                </div>
                
                {type === "slot_limit" && (
                  <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-2xl text-left flex items-start gap-2.5 mb-4">
                    <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-mono font-bold text-red-300 uppercase">Limite de Slots de Carreira Atingido</p>
                      <p className="text-[10px] text-zinc-400 leading-relaxed mt-0.5">Como usuário FREE, você atingiu o teto máximo de 3 atletas simultâneos. Faça upgrade para salvar legados ilimitados ou adquira slots avulsos!</p>
                    </div>
                  </div>
                )}

                {type === "credit_limit" && (
                  <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-2xl text-left flex items-start gap-2.5 mb-4">
                    <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-mono font-bold text-red-300 uppercase">Seus Créditos de IA Esgotaram</p>
                      <p className="text-[10px] text-zinc-400 leading-relaxed mt-0.5">Você usou suas 3 gerações gratuitas do plano Free. Desbloqueie a IA ilimitada e gere biografias de alta performance infinitamente no plano PRO!</p>
                    </div>
                  </div>
                )}

                <h3 className="font-display font-black text-2xl text-white uppercase tracking-tight">
                  Eleve seu Jogo ao <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500">Próximo Nível</span>
                </h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Liberte o verdadeiro potencial do gerenciamento de carreira no FC Legacy. Assine ou compre benefícios avulsos em segundos.
                </p>
              </div>

              {/* Benefits checklist */}
              <div className="bg-zinc-950/60 border border-white/5 p-4 rounded-2xl space-y-2.5">
                <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-wider mb-1">Benefícios Premium Inclusos no PRO:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10.5px]">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Check className="w-3.5 h-3.5 text-brand-green" />
                    <span>Gerações de IA ilimitadas</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Check className="w-3.5 h-3.5 text-brand-green" />
                    <span>Slots de carreira infinitos</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Check className="w-3.5 h-3.5 text-brand-green" />
                    <span>Verificado PRO Dourado</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Check className="w-3.5 h-3.5 text-brand-green" />
                    <span>Temas Ouro e Champions League</span>
                  </div>
                </div>
              </div>

              {/* Purchase options */}
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {/* 0. TESTE PLAN (R$ 1,00) */}
                <button
                  disabled={loading}
                  onClick={() => handleCreateCheckout("teste")}
                  className="w-full text-left p-4 bg-gradient-to-r from-brand-green/10 to-emerald-600/10 border border-brand-green/30 hover:border-brand-green hover:from-brand-green/15 hover:to-emerald-600/15 rounded-2xl transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="p-1 bg-brand-green text-black rounded-lg">
                        <Sparkles className="w-3 h-3 fill-black" />
                      </span>
                      <span className="text-xs font-mono font-black text-brand-green uppercase tracking-wider">PLANO TESTE</span>
                    </div>
                    <p className="text-[10px] text-zinc-400">Experimente todos os benefícios PRO por 24 horas.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-500 line-through font-mono">R$ 9,90</p>
                    <p className="text-base font-display font-black text-brand-green font-mono leading-tight">R$ 1,00<span className="text-[9px] text-zinc-400 font-normal">/teste</span></p>
                  </div>
                </button>

                {/* 1. FC Legacy Pro Subscription */}
                <button
                  disabled={loading}
                  onClick={() => handleCreateCheckout("pro")}
                  className="w-full text-left p-4 bg-gradient-to-r from-yellow-500/10 to-amber-600/10 border border-yellow-500/30 hover:border-yellow-400 hover:from-yellow-500/15 hover:to-amber-600/15 rounded-2xl transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="p-1 bg-yellow-400 text-black rounded-lg">
                        <Sparkles className="w-3 h-3 fill-black" />
                      </span>
                      <span className="text-xs font-mono font-black text-yellow-400 uppercase tracking-wider">FC Legacy PRO</span>
                    </div>
                    <p className="text-[10px] text-zinc-400">Gerações ilimitadas de atletas, verificado e temas premium.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-500 line-through font-mono">R$ 39,90</p>
                    <p className="text-base font-display font-black text-yellow-400 font-mono leading-tight">R$ {proPrice.toFixed(2)}<span className="text-[9px] text-zinc-400 font-normal">/mês</span></p>
                  </div>
                </button>

                {/* 2. Buy Extra Career Slot */}
                <button
                  disabled={loading}
                  onClick={() => handleCreateCheckout("extra_slot")}
                  className="w-full text-left p-4 bg-zinc-900/50 border border-white/5 hover:border-zinc-700 rounded-2xl transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="p-1 bg-zinc-800 text-zinc-400 group-hover:bg-brand-green group-hover:text-black rounded-lg transition-colors">
                        <Coins className="w-3 h-3" />
                      </span>
                      <span className="text-xs font-mono font-black text-white group-hover:text-brand-green uppercase tracking-wider transition-colors">Slot de Atleta Extra</span>
                    </div>
                    <p className="text-[10px] text-zinc-400">Adicione +1 espaço extra para um novo jogador na sua conta.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-display font-black text-white font-mono leading-tight">R$ 9,90<span className="text-[9px] text-zinc-400 font-normal">/único</span></p>
                  </div>
                </button>

                {/* 3. Ranking Boost */}
                <button
                  disabled={loading}
                  onClick={() => handleCreateCheckout("boost")}
                  className="w-full text-left p-4 bg-zinc-900/50 border border-white/5 hover:border-zinc-700 rounded-2xl transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="p-1 bg-zinc-800 text-zinc-400 group-hover:bg-brand-green group-hover:text-black rounded-lg transition-colors">
                        <Flame className="w-3 h-3" />
                      </span>
                      <span className="text-xs font-mono font-black text-white group-hover:text-brand-green uppercase tracking-wider transition-colors">Ranking Boost (7 dias)</span>
                    </div>
                    <p className="text-[10px] text-zinc-400">Destaque neon brilhante na linha do Top 10 e leaderboard.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-display font-black text-white font-mono leading-tight">R$ 14,90<span className="text-[9px] text-zinc-400 font-normal">/7d</span></p>
                  </div>
                </button>
              </div>

              {loading && (
                <div className="flex items-center justify-center gap-2 text-zinc-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-green" />
                  <span className="text-[10px] font-mono uppercase tracking-wider">Criando transação de pagamento...</span>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="checkout"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6 text-center mt-4"
            >
              <div className="space-y-2">
                <span className="px-2.5 py-1 rounded-full text-[9px] font-mono uppercase font-bold tracking-widest animate-pulse bg-brand-green/10 border border-brand-green/20 text-brand-green">
                  Aguardando Pagamento Pix
                </span>
                <h4 className="font-display font-black text-xl text-white uppercase tracking-tight">
                  Pagamento via Pix
                </h4>
                <p className="text-[11px] text-zinc-400 max-w-sm mx-auto leading-relaxed">
                  Escaneie o QR Code abaixo com o aplicativo do seu banco para pagar. O sistema identificará o pagamento instantaneamente e ativará sua conta de forma 100% automática.
                </p>
              </div>

              <div className="bg-zinc-950 border border-white/5 p-6 rounded-3xl max-w-xs mx-auto space-y-4">
                {/* QR Code Container */}
                <div className="aspect-square bg-white p-4 rounded-2xl flex items-center justify-center relative overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                  <img 
                    src={checkoutData.qrCodeBase64 
                      ? `data:image/png;base64,${checkoutData.qrCodeBase64}` 
                      : `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(checkoutData.qrCode || `00020101021226830014br.gov.bcb.pix2561api.mercadopago.com/pix/qr/v2/pay-${checkoutData.subscriptionId}52040000530398654041.005802BR5910FC_LEGACY6009SAO_PAULO62070503***6304FC02`)}`
                    } 
                    alt="Pix QR Code" 
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                  
                  {paymentSuccess && (
                    <motion.div
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       className="absolute inset-0 bg-brand-green flex flex-col items-center justify-center text-black p-4"
                    >
                       <Check className="w-12 h-12 stroke-[3]" />
                       <p className="font-mono font-black text-xs uppercase tracking-wider mt-2">Aprovado!</p>
                    </motion.div>
                  )}
                </div>

                <div className="font-mono text-left space-y-1 border-t border-white/5 pt-3">
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>Item:</span>
                    <span className="text-white font-bold truncate max-w-[150px]">{checkoutData.description}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>ID Transação:</span>
                    <span className="text-zinc-300 font-bold">{checkoutData.subscriptionId}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>Valor:</span>
                    <span className="text-brand-green font-black">R$ {checkoutData.amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  onClick={handleCopyPix}
                  className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-zinc-300 hover:text-white font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {copiedPix ? (
                    <>
                      <Check className="w-4 h-4 text-brand-green" />
                      Código Pix Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copiar Código Pix
                    </>
                  )}
                </button>

                <button
                  disabled={paymentSuccess}
                  onClick={() => setCheckoutData(null)}
                  className="w-full py-3 bg-zinc-950 hover:bg-zinc-900 border border-white/5 text-zinc-500 hover:text-zinc-400 font-mono text-[10px] uppercase font-bold rounded-xl transition-all cursor-pointer"
                >
                  Voltar para Opções
                </button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-zinc-500 text-[9px] font-mono uppercase animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-green" />
                Aguardando confirmação do pagamento...
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
