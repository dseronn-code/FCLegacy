import React, { useState } from "react";
import { X, ShieldCheck, FileText, Info, HelpCircle } from "lucide-react";

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "privacy" | "terms" | "about" | "guide";
}

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose, initialTab = "privacy" }) => {
  const [activeTab, setActiveTab] = useState<"privacy" | "terms" | "about" | "guide">(initialTab);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#0c0c0e] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-[#08080a]">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-brand-green" />
            <h3 className="font-display font-black text-sm uppercase tracking-wider text-white">
              Central Institucional & Políticas — FC Legacy
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 bg-[#09090c] px-6 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("privacy")}
            className={`py-3 px-4 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === "privacy"
                ? "border-brand-green text-brand-green bg-brand-green/5"
                : "border-transparent text-zinc-400 hover:text-white"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Política de Privacidade
          </button>
          <button
            onClick={() => setActiveTab("terms")}
            className={`py-3 px-4 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === "terms"
                ? "border-brand-green text-brand-green bg-brand-green/5"
                : "border-transparent text-zinc-400 hover:text-white"
            }`}
          >
            <FileText className="w-4 h-4" />
            Termos de Uso
          </button>
          <button
            onClick={() => setActiveTab("about")}
            className={`py-3 px-4 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === "about"
                ? "border-brand-green text-brand-green bg-brand-green/5"
                : "border-transparent text-zinc-400 hover:text-white"
            }`}
          >
            <Info className="w-4 h-4" />
            Sobre o FC Legacy
          </button>
          <button
            onClick={() => setActiveTab("guide")}
            className={`py-3 px-4 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === "guide"
                ? "border-brand-green text-brand-green bg-brand-green/5"
                : "border-transparent text-zinc-400 hover:text-white"
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            Guia de Uso & Conteúdo
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-zinc-300 text-xs leading-relaxed font-sans">
          {activeTab === "privacy" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                1. Política de Privacidade e Proteção de Dados (LGPD & Google AdSense)
              </h4>
              <p>
                O <strong>FC Legacy</strong> (hospedado no domínio oficial <code>wolkstore.shop</code>) valoriza a privacidade de seus usuários e se compromete a proteger todos os dados pessoais coletados durante o uso de nossa plataforma de estatísticas e simulação de atletas fictícios.
              </p>
              
              <h5 className="font-bold text-white">1.1 Coleta de Dados e Uso de Anúncios</h5>
              <p>
                Nosso site utiliza serviços de terceiros, incluindo o <strong>Google AdSense</strong>, para veiculação de anúncios em contas gratuitas. O Google utiliza cookies (como o cookie DART) para veicular anúncios com base nas visitas anteriores do usuário ao nosso site ou a outros sites na Internet.
              </p>
              <p>
                Os usuários podem optar por desativar a publicidade personalizada acessando as <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-brand-green underline">Configurações de Anúncios do Google</a>.
              </p>

              <h5 className="font-bold text-white">1.2 Armazenamento de Dados de Usuário</h5>
              <p>
                As informações da sua conta (nome de usuário, e-mail, biografia do atleta e histórico de simulações) são armazenadas com segurança através do Firebase Authentication e Google Cloud Firestore. Não vendemos ou compartilhamos seus dados pessoais com terceiros não afiliados.
              </p>
            </div>
          )}

          {activeTab === "terms" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                2. Termos e Condições de Uso
              </h4>
              <p>
                Ao acessar e utilizar o site <code>wolkstore.shop</code>, você concorda em cumprir estes Termos de Uso e todas as leis e regulamentos aplicáveis.
              </p>

              <h5 className="font-bold text-white">2.1 Uso de Conteúdo Fictício</h5>
              <p>
                O FC Legacy é uma plataforma de entretenimento e estatísticas desenvolvida para entusiastas de jogos de futebol e simulação de carreira. Todos os atletas criados pela nossa Inteligência Artificial ou inseridos pelos usuários são estritamente fictícios.
              </p>

              <h5 className="font-bold text-white">2.2 Planos e Assinaturas</h5>
              <p>
                Os planos pagos (FC Legacy PRO) fornecem acesso a recursos exclusivos, como gerações ilimitadas via IA, remoção total de anúncios e criação de múltiplos atletas. Os pagamentos são processados via parceiros de pagamento seguros (como Mercado Pago).
              </p>
            </div>
          )}

          {activeTab === "about" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                3. Sobre o FC Legacy
              </h4>
              <p>
                O <strong>FC Legacy</strong> é uma plataforma completa de criação, evolução e gerenciamento de estatísticas de atletas fictícios para modo carreira.
              </p>
              <p>
                Nossa missão é oferecer aos jogadores uma experiência imersiva de acompanhamento de carreira de atletas imaginários, gerando biografias detalhadas com IA, calculando atributos realistas de futebol e fornecendo dados dinâmicos de desempenho.
              </p>
            </div>
          )}

          {activeTab === "guide" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                4. Guia Completo do Sistema de Estatísticas
              </h4>
              <p>
                Aprenda a aproveitar ao máximo as funcionalidades do FC Legacy:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Geração de Jogadores:</strong> Crie perfis completos com nome, posição, perna preferida e nacionalidade.</li>
                <li><strong>Inteligência Artificial:</strong> Nossa IA elabora a história de origem, estilo de jogo e narrativa de carreira do atleta.</li>
                <li><strong>Cálculo de Overall e Atributos:</strong> Monitore a evolução dos atributos técnicos, físicos e mentais ao longo das temporadas.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 bg-[#08080a] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white font-mono text-xs uppercase font-bold rounded-xl transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
