import React, { useState, useEffect } from "react";
import { QUESTIONNAIRE_STEPS, QuestionnaireStep } from "../data/questionnaireSteps";
import { 
  Sparkles, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle, 
  Loader2, 
  Sliders, 
  User, 
  MapPin, 
  Shield, 
  Compass,
  Lock,
  Unlock,
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PlayerProfile, GenerationParams, PlayerCareer } from "../types";

interface InteractiveQuestionnaireProps {
  onComplete: (careerData: Partial<PlayerCareer>) => Promise<void>;
  onCancel: () => void;
  onGenerateAI: (params: GenerationParams) => Promise<PlayerProfile | null>;
  generationLoading: boolean;
  generationError: string | null;
  hasExistingCareers?: boolean;
}

export const InteractiveQuestionnaire: React.FC<InteractiveQuestionnaireProps> = ({
  onComplete,
  onCancel,
  onGenerateAI,
  generationLoading,
  generationError,
  hasExistingCareers = false
}) => {
  // Step 0: Basic Info, Steps 1-20: Sequential Blocks
  const [currentStep, setCurrentStep] = useState<number>(0);
  
  // Basic params
  const [basicParams, setBasicParams] = useState<GenerationParams>({
    suggestedName: "",
    nationality: "Brasil",
    position: "Ponta Esquerda",
    preferredClub: "Real Madrid",
    personalityType: "Marrento",
  });
  
  const [isPublic, setIsPublic] = useState<boolean>(true);
  
  // Question answers (Step 1-20)
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Initialize answers with placeholders or defaults
  useEffect(() => {
    const initialAnswers: Record<string, string> = {};
    QUESTIONNAIRE_STEPS.forEach(step => {
      initialAnswers[step.field] = "";
    });
    setAnswers(initialAnswers);
  }, []);

  // Handler to call Gemini AI generator
  // Handler to call Gemini AI generator
  const handleAIGenerateAndLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!basicParams.nationality || !basicParams.position || !basicParams.preferredClub) {
      setValidationError("Nacionalidade, Posição e Clube Atual são obrigatórios.");
      return;
    }
    setValidationError(null);

    const generatedProfile = await onGenerateAI(basicParams);
    if (generatedProfile) {
      await onComplete({
        profile: generatedProfile,
        isPublic: isPublic,
        currentClub: basicParams.preferredClub || generatedProfile.clube_inicial || "Real Madrid",
        currentSeason: 1,
        championships: ["Champions League", "Liga Nacional", "Copa do País"],
        matches: [],
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  };

  const handleStartManual = () => {
    if (!basicParams.nationality || !basicParams.position || !basicParams.preferredClub) {
      setValidationError("Nacionalidade, Posição e Clube Atual são obrigatórios.");
      return;
    }
    setValidationError(null);
    setCurrentStep(1);
  };

  // Preset click loader
  const handleSelectPreset = (field: string, value: string | string[]) => {
    setAnswers(prev => ({
      ...prev,
      [field]: Array.isArray(value) ? value.join(", ") : value
    }));
  };

  // Navigations
  const handleNext = () => {
    setValidationError(null);
    if (currentStep < 20) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    setValidationError(null);
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkipToFinal = () => {
    setValidationError(null);
    // Autofill any empty step with a random unique preset so it's not identical/blank
    const updatedAnswers = { ...answers };
    QUESTIONNAIRE_STEPS.forEach(step => {
      if (!updatedAnswers[step.field]) {
        if (step.presets && step.presets.length > 0) {
          const randomIndex = Math.floor(Math.random() * step.presets.length);
          const defaultPreset = step.presets[randomIndex].value;
          updatedAnswers[step.field] = Array.isArray(defaultPreset) ? defaultPreset.join(", ") : defaultPreset || "";
        } else {
          updatedAnswers[step.field] = "";
        }
      }
    });
    setAnswers(updatedAnswers);
    setCurrentStep(20);
  };

  const handleRandomizeAll = async () => {
    setValidationError(null);
    
    // Names, clubs, etc. to pick randomly (ultra large local fallback)
    const names = [
      "Thiago Almada", "Enzo Lombardi", "Mateo Silva", "Giovanni Rossi", "Filippo Mancini", "Arthur Lima", 
      "Hugo Santos", "Bernardo Neves", "Santiago Castro", "Lucas Alcaraz", "Maxime Dubois",
      "Kylian Laurent", "Jude Sterling", "Marcus Rashford", "Alessandro Bastoni",
      "Estevão Mendes", "Rodrigo Sanches", "Gabriel Veiga", "Nico Williams", "Diego Simeone Jr",
      "Oliver Kahn", "Florian Wirtz", "Jamal Musiala", "Federico Chiesa", "Dušan Vlahović", 
      "Lautaro Martínez", "Alejandro Garnacho", "Julián Álvarez", "Gavi", "Pedri", "Ansu Fati",
      "Lorenzo Insigne", "Ciro Immobile", "Nicolò Barella", "Sandro Tonali", "Rafael Leão", "Gonçalo Ramos",
      "João Félix", "Diogo Jota", "Bruno Fernandes", "Ruben Dias", "Pedro Neto", "Vitinha"
    ];
    const nationalities = ["Brasil", "Portugal", "Espanha", "Argentina", "França", "Inglaterra", "Itália", "Alemanha", "Holanda", "Uruguai", "Bélgica"];
    const positions = ["Ponta Esquerda", "Ponta Direita", "Centroavante", "Meio-campista Armador", "Segundo Volante", "Zagueiro Imperial", "Lateral Ofensivo"];
    const clubs = [
      "Real Madrid CF", "FC Barcelona", "Manchester City FC", "Paris Saint-Germain", 
      "Juventus FC", "FC Bayern München", "Arsenal FC", "Liverpool FC", "AC Milan", "Inter de Milão", "Atlético de Madrid",
      "Palmeiras", "Flamengo", "Vasco da Gama", "Cruzeiro", "Grêmio", "Internacional", "Fluminense", "São Paulo FC"
    ];
    const personalities = ["Marrento & Confiante", "Ousado & Provocador", "Bad Boy", "Focado & Frio", "Líder Nato", "Cria de Favela"];

    const chosenName = names[Math.floor(Math.random() * names.length)];
    const chosenNationality = nationalities[Math.floor(Math.random() * nationalities.length)];
    const chosenPosition = positions[Math.floor(Math.random() * positions.length)];
    const chosenClub = clubs[Math.floor(Math.random() * clubs.length)];
    const chosenPersonality = personalities[Math.floor(Math.random() * personalities.length)];

    setBasicParams({
      suggestedName: chosenName,
      nationality: chosenNationality,
      position: chosenPosition,
      preferredClub: chosenClub,
      personalityType: chosenPersonality,
    });

    // Fill all 20 questions with random presets (ensuring varied indices per step)
    const updatedAnswers: Record<string, string> = {};
    QUESTIONNAIRE_STEPS.forEach(step => {
      if (step.presets && step.presets.length > 0) {
        const randomIndex = Math.floor(Math.random() * step.presets.length);
        const preset = step.presets[randomIndex];
        updatedAnswers[step.field] = Array.isArray(preset.value) ? preset.value.join(", ") : preset.value;
      } else {
        updatedAnswers[step.field] = "";
      }
    });

    setAnswers(updatedAnswers);

    // Fetch AI-powered randomized draft from the backend
    try {
      const res = await fetch("/api/random-preset");
      if (res.ok) {
        const data = await res.json();
        if (data && data.suggestedName) {
          setBasicParams({
            suggestedName: data.suggestedName,
            nationality: data.nationality,
            position: data.position,
            preferredClub: data.preferredClub,
            personalityType: data.personalityType,
          });
        }
      }
    } catch (err) {
      console.error("Erro ao carregar preset de IA:", err);
    }
  };

  // Submit complete career object
  const handleFinishAndSave = async () => {
    setSaving(true);
    setValidationError(null);
    try {
      // Build final PlayerProfile
      const finalProfile: PlayerProfile = {
        nome_jogador: basicParams.suggestedName.trim() || `Craque ${basicParams.position.split(" ")[0]}`,
        clube_inicial: basicParams.preferredClub,
        nacionalidade: basicParams.nationality,
        sugestoes_campeonatos_locais: [
          "Champions League", 
          "Liga Nacional", 
          "Copa do País"
        ],
        perfil_completo_20_perguntas: {
          "1_personalidade": answers["1_personalidade"] || "Focado & Técnico.",
          "2_amigos_reais": (answers["2_amigos_reais"] || "").split(",").map(s => s.trim()).filter(Boolean),
          "3_namorada_real": answers["3_namorada_real"] || "Nenhum romance.",
          "4_situacao_financeira": answers["4_situacao_financeira"] || "Estável.",
          "5_historia_de_vida": answers["5_historia_de_vida"] || "Origem humilde.",
          "6_vivia_bem": answers["6_vivia_bem"] || "Mansão própria.",
          "7_relacao_familiar": answers["7_relacao_familiar"] || "Laços fortes.",
          "8_comportamento": answers["8_comportamento"] || "Exemplar.",
          "9_fortuna_e_carros_reais": answers["9_fortuna_e_carros_reais"] || "Carro de luxo.",
          "10_patrocinios_reais": (answers["10_patrocinios_reais"] || "").split(",").map(s => s.trim()).filter(Boolean),
          "11_expectativa_carreira": answers["11_expectativa_carreira"] || "Futuro de brilho.",
          "12_desempenho_campo": answers["12_desempenho_campo"] || "Habilidoso.",
          "13_clubes_europa": (answers["13_clubes_europa"] || "").split(",").map(s => s.trim()).filter(Boolean),
          "14_clube_atual": answers["14_clube_atual"] || basicParams.preferredClub,
          "15_estilo_altura_idolos": answers["15_estilo_altura_idolos"] || `Ponta de 1.80m. Ídolos: CR7`,
          "16_relacionamentos_elenco": answers["16_relacionamentos_elenco"] || "Respeitado.",
          "17_satisfacao_clube": answers["17_satisfacao_clube"] || "Satisfeito.",
          "18_time_do_coracao": answers["18_time_do_coracao"] || "Clube local.",
          "19_nascimento": answers["19_nascimento"] || "Nascido em 2004.",
          "20_biometria": answers["20_biometria"] || "Altura de 1.80m e peso de 75kg."
        }
      };

      await onComplete({
        profile: finalProfile,
        isPublic: isPublic,
        currentClub: basicParams.preferredClub,
        currentSeason: 1,
        championships: ["Champions League", "Liga Nacional", "Copa do País"],
        matches: [],
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error(err);
      setValidationError(err.message || "Falha ao registrar carreira.");
    } finally {
      setSaving(false);
    }
  };

  // Find current step details
  const activeStepConfig = QUESTIONNAIRE_STEPS.find(s => s.id === String(currentStep));

  return (
    <div className="bg-[#0c0c0e] border border-white/5 rounded-3xl p-6 sm:p-8 space-y-6 relative overflow-hidden shadow-2xl">
      {/* Background radial highlight */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-brand-green/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-green/10 text-brand-green rounded-xl border border-brand-green/20">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[9px] font-mono text-brand-green uppercase tracking-widest block font-bold">
              GERAÇÃO DE INTELIGÊNCIA ARTIFICIAL // GOOGLE SEARCH GROUNDING 2026
            </span>
            <h2 className="font-display font-black text-xl text-white uppercase italic tracking-tight">
              Gere seu Jogador Fictício de Comunidade
            </h2>
          </div>
        </div>

        {currentStep > 0 && (
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase">
              Progresso do Legado
            </span>
            <span className="text-sm font-display font-black text-brand-green mt-0.5">
              Passo {currentStep} de 20
            </span>
          </div>
        )}
      </div>

      {/* PROGRESS BAR */}
      {currentStep > 0 && (
        <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden relative">
          <div 
            className="bg-brand-green h-full transition-all duration-300 shadow-[0_0_8px_rgba(217,255,51,0.5)]"
            style={{ width: `${(currentStep / 20) * 100}%` }}
          ></div>
        </div>
      )}

      {validationError && (
        <div className="p-4 bg-red-950/40 border border-red-900/60 rounded-xl text-red-200 text-xs flex gap-3">
          <Shield className="w-4 h-4 text-red-400 shrink-0" />
          <p>{validationError}</p>
        </div>
      )}

      {generationError && (
        <div className="p-4 bg-red-950/40 border border-red-900/60 rounded-xl text-red-200 text-xs flex gap-3">
          <Shield className="w-4 h-4 text-red-400 shrink-0" />
          <p>{generationError}</p>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* STEP 0: BASIC FORM */}
        {currentStep === 0 && (
          <motion.div
            key="step-0"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Digite as informações básicas do seu atleta de carreira. A IA integrará dados da internet real de 2026 para fundamentar carros, namoradas, patrocínios e parças!
            </p>

            <div className="flex gap-4 border-b border-white/5 pb-2 text-[10px] font-mono font-bold tracking-widest uppercase">
              <span className="text-brand-green border-b border-brand-green pb-2 flex items-center gap-1.5">
                📄 FORMULÁRIO DE GERAÇÃO
              </span>
            </div>

            <form onSubmit={handleAIGenerateAndLoad} className="space-y-4">
              <div>
                <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">
                  Nome / Apelido Sugerido
                </label>
                <input
                  type="text"
                  placeholder="Ex: Enzo Lombardi (ou em branco para IA batizar)"
                  value={basicParams.suggestedName}
                  onChange={(e) => setBasicParams({ ...basicParams, suggestedName: e.target.value })}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">
                    Nacionalidade
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Brasil, Portugal"
                    value={basicParams.nationality}
                    onChange={(e) => setBasicParams({ ...basicParams, nationality: e.target.value })}
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">
                    Posição Preferida
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Ponta Esquerda"
                    value={basicParams.position}
                    onChange={(e) => setBasicParams({ ...basicParams, position: e.target.value })}
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">
                    Clube que Atua em 2026
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Real Madrid, Chelsea"
                    value={basicParams.preferredClub}
                    onChange={(e) => setBasicParams({ ...basicParams, preferredClub: e.target.value })}
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">
                    Personalidade Base
                  </label>
                  <select
                    value={basicParams.personalityType}
                    onChange={(e) => setBasicParams({ ...basicParams, personalityType: e.target.value })}
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                  >
                    <option value="Marrento" className="bg-[#0c0c0e]">Marrento & Confiante</option>
                    <option value="Ousado & Provocador" className="bg-[#0c0c0e]">Ousado & Provocador</option>
                    <option value="Bad Boy" className="bg-[#0c0c0e]">Bad Boy Extraordinário</option>
                    <option value="Focado" className="bg-[#0c0c0e]">Focado & Técnico</option>
                  </select>
                </div>
              </div>

              {/* PRIVACY OPTION */}
              <div className="bg-black/30 border border-white/5 p-4 rounded-xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isPublic ? 'bg-brand-green/10 text-brand-green' : 'bg-red-500/10 text-red-400'}`}>
                    {isPublic ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  </div>
                  <div>
                    <span className="text-xs font-mono font-bold text-white block uppercase">
                      Privacidade da Carreira
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {isPublic 
                        ? "Público: Este legado aparecerá no Leaderboard Global de treinadores e será compartilhável." 
                        : "Privado: Carreira blindada de rankings, acessível apenas para você."}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPublic(!isPublic)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase transition-all cursor-pointer border ${
                    isPublic 
                      ? "bg-brand-green/10 border-brand-green/20 text-brand-green hover:bg-brand-green/25" 
                      : "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/15"
                  }`}
                >
                  {isPublic ? "Deixar Privado" : "Deixar Público"}
                </button>
              </div>

              {/* ACTION BUTTONS */}
              <div className="pt-4 flex flex-col sm:flex-row gap-4">
                <button
                  type="button"
                  onClick={handleRandomizeAll}
                  className="px-5 py-3.5 bg-[#111113] hover:bg-zinc-800 border border-white/5 text-zinc-300 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 font-mono uppercase font-bold cursor-pointer flex-1"
                  title="Sortear um atleta 100% aleatório preenchendo todos os blocos com presets únicos"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-brand-green animate-pulse" />
                  Sortear Preset
                </button>

                <button
                  type="submit"
                  disabled={generationLoading}
                  className="px-6 py-3.5 bg-brand-green hover:bg-[#d9ff33] text-black font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 flex-1.2 disabled:opacity-50 glow-green cursor-pointer"
                >
                  {generationLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Invocando Oráculo IA...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Criar Carreira
                    </>
                  )}
                </button>
              </div>

              <div className="pt-2 flex flex-col gap-2 items-center">
                {hasExistingCareers && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="w-full py-3 bg-[#111113] hover:bg-zinc-800 border border-white/5 text-zinc-400 hover:text-white rounded-xl text-xs transition-all font-mono uppercase font-bold cursor-pointer text-center"
                  >
                    ← Voltar para minhas carreiras
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={handleStartManual}
                  className="mt-2 text-[10px] font-mono text-zinc-500 hover:text-brand-green uppercase tracking-widest transition-colors cursor-pointer underline decoration-dotted"
                >
                  Prefere Criar Carreira Personalizada? (Passo a Passo Manual)
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* STEP 1-20: SEQUENTIAL BLOCKS */}
        {currentStep > 0 && activeStepConfig && (
          <motion.div
            key={`step-${currentStep}`}
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -15 }}
            className="space-y-5"
          >
            {/* Category tag */}
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-brand-green/15 text-brand-green rounded text-[9px] font-mono font-bold uppercase tracking-wider">
                {activeStepConfig.category}
              </span>
              <span className="text-zinc-500 font-mono text-[9px] uppercase">
                Bloco {currentStep} de 20
              </span>
            </div>

            {/* Question title */}
            <div>
              <h3 className="font-display font-black text-lg text-white uppercase tracking-tight">
                {activeStepConfig.title}
              </h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                {activeStepConfig.description}
              </p>
            </div>

            {/* Editing field */}
            <div className="space-y-1.5">
              <label className="block text-[8px] font-mono text-zinc-500 uppercase tracking-widest font-bold">
                Resposta da Ficha
              </label>
              
              {activeStepConfig.field.includes("patrocinios") || activeStepConfig.field.includes("amigos") || activeStepConfig.field.includes("clubes_europa") ? (
                <input
                  type="text"
                  placeholder={activeStepConfig.placeholder}
                  value={answers[activeStepConfig.field] || ""}
                  onChange={(e) => setAnswers({ ...answers, [activeStepConfig.field]: e.target.value })}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                />
              ) : (
                <textarea
                  rows={4}
                  placeholder={activeStepConfig.placeholder}
                  value={answers[activeStepConfig.field] || ""}
                  onChange={(e) => setAnswers({ ...answers, [activeStepConfig.field]: e.target.value })}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono h-28 resize-none"
                />
              )}
            </div>

            {/* PRESETS ENGINE */}
            <div className="bg-black/20 border border-white/5 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-green" />
                <span className="text-[9px] font-mono text-zinc-400 font-bold uppercase tracking-wider">
                  Sugestões de Legado Premium (Clique para carregar)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {activeStepConfig.presets.map((preset, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleSelectPreset(activeStepConfig.field, preset.value)}
                    className="p-2.5 bg-zinc-900/40 hover:bg-brand-green/5 border border-white/5 hover:border-brand-green/30 text-left rounded-xl transition-all group cursor-pointer"
                  >
                    <span className="text-[10px] font-mono text-zinc-300 group-hover:text-white block font-bold">
                      {preset.label}
                    </span>
                    <span className="text-[8px] text-zinc-500 line-clamp-2 mt-1 leading-normal block">
                      {Array.isArray(preset.value) ? preset.value.join(", ") : preset.value}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* NAVIGATION ACTIONS */}
            <div className="pt-4 flex flex-wrap gap-3 items-center justify-between border-t border-white/5">
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-mono font-bold uppercase flex items-center gap-1.5 transition-all cursor-pointer border border-white/5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Anterior
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSkipToFinal}
                  className="px-3.5 py-2.5 text-[10px] text-zinc-500 hover:text-zinc-300 font-mono uppercase font-bold transition-all cursor-pointer"
                  title="Preencher restante com padrões e ir para o final"
                >
                  Pular para o Final
                </button>

                {currentStep < 20 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-5 py-2.5 bg-brand-green hover:bg-[#d9ff33] text-black rounded-xl text-xs font-mono font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    Avançar
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleFinishAndSave}
                    className="px-6 py-2.5 bg-brand-green hover:bg-[#d9ff33] text-black rounded-xl text-xs font-mono font-black uppercase flex items-center gap-1.5 transition-all duration-200 glow-green cursor-pointer disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Gravando Legado...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        Salvar e Iniciar Legado
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FOOTER DISMISS */}
      {currentStep === 0 && hasExistingCareers && (
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="text-[10px] font-mono text-zinc-500 hover:text-white uppercase transition-all font-bold cursor-pointer"
          >
            ← Cancelar Criação
          </button>
        </div>
      )}
    </div>
  );
};
