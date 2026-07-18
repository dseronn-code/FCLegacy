import { useState, useEffect, FormEvent } from "react";
import { 
  User, 
  Coins, 
  Heart, 
  Sparkles, 
  Copy, 
  Check, 
  Loader2, 
  Sliders, 
  Award, 
  Activity, 
  Flame, 
  MapPin, 
  Calendar, 
  Car, 
  Users, 
  ShieldAlert, 
  Compass, 
  Trophy, 
  Tv, 
  CheckCircle2, 
  ChevronRight,
  Info,
  Lock,
  Unlock,
  Plus,
  Trash2,
  TrendingUp,
  Share2,
  LogOut,
  LogIn,
  KeyRound,
  FileJson
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PlayerProfile, GenerationParams, PlayerCareer, Match, SeasonHistory, ChampionshipStat } from "./types";
import { mockTomasDuarte } from "./mockData";
import { auth, db } from "./firebase";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser,
  signInWithPopup,
  GoogleAuthProvider
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  updateDoc
} from "firebase/firestore";

export default function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);

  // Career and Player State
  const [career, setCareer] = useState<PlayerCareer | null>(null);
  const [careerLoading, setCareerLoading] = useState<boolean>(false);
  
  // Generation Form State
  const [params, setParams] = useState<GenerationParams>({
    suggestedName: "",
    nationality: "",
    position: "",
    preferredClub: "",
    personalityType: "Marrento",
  });
  const [generationLoading, setGenerationLoading] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // App Interface State
  const [copied, setCopied] = useState<boolean>(false);
  const [shareCopied, setShareCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [statsChampFilter, setStatsChampFilter] = useState<string>("all");
  const [newChampionshipName, setNewChampionshipName] = useState<string>("");

  // Match Input State
  const [matchChamp, setMatchChamp] = useState<string>("");
  const [matchPD, setMatchPD] = useState<number>(0);
  const [matchPE, setMatchPE] = useState<number>(0);
  const [matchDA, setMatchDA] = useState<number>(0);
  const [matchFA, setMatchFA] = useState<number>(0);
  const [matchSA, setMatchSA] = useState<number>(0);
  const [matchPG, setMatchPG] = useState<number>(0); // Passe de Gol (Assistência)

  // Season Progression Modal/State
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [transferClub, setTransferClub] = useState<string>("");

  // Viewing Shared Profile State
  const [isSharedView, setIsSharedView] = useState<boolean>(false);
  const [sharedCareerError, setSharedCareerError] = useState<string | null>(null);

  // Import JSON State
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importJsonText, setImportJsonText] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);

  // Check for shared player ID in URL on load
  useEffect(() => {
    const checkSharedProfile = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const sharedPlayerId = urlParams.get("player");
      
      if (sharedPlayerId) {
        setIsSharedView(true);
        setCareerLoading(true);
        try {
          const docRef = doc(db, "careers", sharedPlayerId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data() as PlayerCareer;
            if (data.isPublic) {
              setCareer(data);
            } else {
              // Not public, check if we are the owner
              const currentUid = auth.currentUser?.uid;
              if (currentUid && currentUid === data.userId) {
                setCareer(data);
              } else {
                setSharedCareerError("Este legado de carreira é privado. Solicite o acesso ao dono do jogador!");
              }
            }
          } else {
            setSharedCareerError("O jogador solicitado não foi localizado no legado de dados.");
          }
        } catch (err: any) {
          console.error(err);
          setSharedCareerError("Ocorreu um erro ao buscar o jogador compartilhado.");
        } finally {
          setCareerLoading(false);
        }
      }
    };

    checkSharedProfile();
  }, []);

  // Listen to Auth State Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Check if we are in shared view mode; if so, do not automatically fetch owned career
      const urlParams = new URLSearchParams(window.location.search);
      const isShared = !!urlParams.get("player");

      if (user) {
        localStorage.removeItem("is_guest_session");
        setCurrentUser(user);
        setAuthLoading(false);

        if (isShared) return;

        setCareerLoading(true);
        try {
          // Query user's career
          const q = query(collection(db, "careers"), where("userId", "==", user.uid));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            // Load existing career
            setCareer(querySnapshot.docs[0].data() as PlayerCareer);
          } else {
            setCareer(null);
          }
        } catch (err) {
          console.error("Error loading user career:", err);
        } finally {
          setCareerLoading(false);
        }
      } else {
        const wasGuest = localStorage.getItem("is_guest_session") === "true";
        if (wasGuest) {
          setCurrentUser({
            uid: "guest_user",
            email: "jogador.convidado@offline.com",
            displayName: "Jogador Convidado"
          });
          setAuthLoading(false);
          
          if (isShared) return;

          // Load local career
          const savedLocal = localStorage.getItem("guest_career");
          if (savedLocal) {
            try {
              setCareer(JSON.parse(savedLocal));
            } catch (e) {
              setCareer(null);
            }
          } else {
            setCareer(null);
          }
        } else {
          setCurrentUser(null);
          setCareer(null);
          setAuthLoading(false);
        }
      }
    });

    return unsubscribe;
  }, []);

  // Helper to save career state to Firestore
  const saveCareerToCloud = async (updatedCareer: PlayerCareer) => {
    if (!currentUser || isSharedView) return;
    if (currentUser.uid === "guest_user") {
      localStorage.setItem("guest_career", JSON.stringify(updatedCareer));
      setCareer(updatedCareer);
      return;
    }
    try {
      await setDoc(doc(db, "careers", updatedCareer.id), updatedCareer);
      setCareer(updatedCareer);
    } catch (err) {
      console.error("Erro ao salvar carreira no Firestore:", err);
    }
  };

  // Auth Actions
  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!email || !password) {
      setAuthError("Por favor, preencha todos os campos.");
      return;
    }

    try {
      if (authMode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/invalid-credential") {
        setAuthError("E-mail ou senha incorretos.");
      } else if (err.code === "auth/weak-password") {
        setAuthError("A senha precisa ter no mínimo 6 caracteres.");
      } else if (err.code === "auth/email-already-in-use") {
        setAuthError("Este e-mail já está sendo utilizado.");
      } else if (err.code === "auth/operation-not-allowed") {
        setAuthError(
          "O provedor de E-mail/Senha está desativado no Firebase. " +
          "O administrador do site deve ativá-lo no Console do Firebase (Authentication > Sign-in method). " +
          "Como alternativa instantânea configurada, clique no botão 'Entrar com Google' abaixo para acessar!"
        );
      } else {
        setAuthError(err.message || "Erro na autenticação.");
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || "Erro ao autenticar com o Google.");
    }
  };

  const handleGuestSignIn = () => {
    setAuthError(null);
    localStorage.setItem("is_guest_session", "true");
    setCurrentUser({
      uid: "guest_user",
      email: "jogador.convidado@offline.com",
      displayName: "Jogador Convidado"
    });
    
    // Load local career
    const savedLocal = localStorage.getItem("guest_career");
    if (savedLocal) {
      try {
        setCareer(JSON.parse(savedLocal));
      } catch (e) {
        setCareer(null);
      }
    } else {
      setCareer(null);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("is_guest_session");
    await signOut(auth);
    setCurrentUser(null);
    setCareer(null);
    // If in shared view, go back to main
    if (isSharedView) {
      window.history.pushState({}, "", window.location.origin);
      setIsSharedView(false);
      setSharedCareerError(null);
    }
  };

  // Generate Career
  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setGenerationLoading(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/generate-player", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Erro ao consultar gerador de IA.");
      }

      const playerProfile = (await response.json()) as PlayerProfile;
      
      const newCareerId = currentUser.uid + "_" + Date.now();
      const initialChampionships = playerProfile.sugestoes_campeonatos_locais?.length > 0 
        ? [...playerProfile.sugestoes_campeonatos_locais]
        : ["La Liga EA Sports", "UEFA Champions League", "Copa del Rey"];

      const newCareer: PlayerCareer = {
        id: newCareerId,
        userId: currentUser.uid,
        userEmail: currentUser.email || "",
        profile: playerProfile,
        isPublic: false,
        currentClub: playerProfile.clube_inicial || params.preferredClub || "Clube sem nome",
        currentSeason: 1,
        championships: initialChampionships,
        matches: [],
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveCareerToCloud(newCareer);
    } catch (err: any) {
      console.error(err);
      setGenerationError(err.message || "Erro de processamento com o servidor.");
    } finally {
      setGenerationLoading(false);
    }
  };

  // Add Custom Championship
  const handleAddChampionship = () => {
    if (!career || !newChampionshipName.trim() || isSharedView) return;
    const trimmed = newChampionshipName.trim();
    if (career.championships.includes(trimmed)) return;

    const updated = {
      ...career,
      championships: [...career.championships, trimmed],
      updatedAt: new Date().toISOString(),
    };
    saveCareerToCloud(updated);
    setNewChampionshipName("");
  };

  // Delete Custom Championship
  const handleDeleteChampionship = (champName: string) => {
    if (!career || isSharedView) return;
    const updated = {
      ...career,
      championships: career.championships.filter(c => c !== champName),
      updatedAt: new Date().toISOString(),
    };
    saveCareerToCloud(updated);
  };

  // Toggle privacy (Public/Private)
  const handleTogglePrivacy = () => {
    if (!career || isSharedView) return;
    const updated = {
      ...career,
      isPublic: !career.isPublic,
      updatedAt: new Date().toISOString(),
    };
    saveCareerToCloud(updated);
  };

  // Add Match
  const handleAddMatch = () => {
    if (!career || isSharedView) return;
    const selectedChamp = matchChamp || career.championships[0] || "Liga Nacional";
    
    const goalsSum = matchPD + matchPE;
    
    // Construct Match Log text based on user requirements: (1 G | 1 PD | 1 DA | SA | PG)
    const logs: string[] = [];
    if (goalsSum > 0) {
      logs.push(`${goalsSum} G`);
      if (matchPD > 0) logs.push(`${matchPD} PD`);
      if (matchPE > 0) logs.push(`${matchPE} PE`);
      if (matchDA > 0) logs.push(`${matchDA} DA`);
      if (matchFA > 0) logs.push(`${matchFA} FA`);
      if (matchSA > 0) {
        logs.push(`${matchSA} SA`);
      } else {
        logs.push(`A`);
      }
    }
    if (matchPG > 0) {
      logs.push(`${matchPG} PG`);
    }

    const logText = logs.length > 0 ? logs.join(" | ") : "Partida Disputada (Sem G/PG)";

    // Calculate dynamic xG: 0.35 per DA, 0.12 per FA, plus 0.15 for assists (PG), or 0.1 baseline
    const calculatedXg = Number(((matchDA * 0.35) + (matchFA * 0.12) + (matchPG * 0.15) + (goalsSum === 0 ? 0.05 : 0)).toFixed(2));

    const newMatch: Match = {
      id: "match_" + Date.now(),
      championship: selectedChamp,
      goals: goalsSum,
      assists: matchPG,
      goalDetails: {
        pd: matchPD,
        pe: matchPE,
        da: matchDA,
        fa: matchFA,
        sa: matchSA,
        a: goalsSum - matchSA > 0 ? goalsSum - matchSA : 0
      },
      logText,
      xg: calculatedXg,
      createdAt: new Date().toISOString()
    };

    const updated = {
      ...career,
      matches: [newMatch, ...career.matches],
      updatedAt: new Date().toISOString()
    };

    saveCareerToCloud(updated);

    // Reset Match form state
    setMatchPD(0);
    setMatchPE(0);
    setMatchDA(0);
    setMatchFA(0);
    setMatchSA(0);
    setMatchPG(0);
  };

  // Delete Match
  const handleDeleteMatch = (matchId: string) => {
    if (!career || isSharedView) return;
    const updated = {
      ...career,
      matches: career.matches.filter(m => m.id !== matchId),
      updatedAt: new Date().toISOString()
    };
    saveCareerToCloud(updated);
  };

  // Advance Season
  const handleAdvanceSeason = () => {
    if (!career || isSharedView) return;
    
    // Aggregate current season statistics
    const champStatsMap: { [key: string]: ChampionshipStat } = {};
    
    // Initialize stats with championships
    career.championships.forEach(champ => {
      champStatsMap[champ] = {
        championship: champ,
        matches: 0,
        goals: 0,
        assists: 0,
        pd: 0,
        pe: 0,
        da: 0,
        fa: 0,
        sa: 0,
        a: 0,
        xg: 0
      };
    });

    let totalGoals = 0;
    let totalAssists = 0;
    let totalXg = 0;

    career.matches.forEach(m => {
      if (!champStatsMap[m.championship]) {
        champStatsMap[m.championship] = {
          championship: m.championship,
          matches: 0,
          goals: 0,
          assists: 0,
          pd: 0,
          pe: 0,
          da: 0,
          fa: 0,
          sa: 0,
          a: 0,
          xg: 0
        };
      }

      const cs = champStatsMap[m.championship];
      cs.matches += 1;
      cs.goals += m.goals;
      cs.assists += m.assists;
      cs.pd += m.goalDetails.pd;
      cs.pe += m.goalDetails.pe;
      cs.da += m.goalDetails.da;
      cs.fa += m.goalDetails.fa;
      cs.sa += m.goalDetails.sa;
      cs.a += m.goalDetails.a;
      cs.xg += m.xg;

      totalGoals += m.goals;
      totalAssists += m.assists;
      totalXg += m.xg;
    });

    const championshipStatsArray = Object.values(champStatsMap).filter(cs => cs.matches > 0);

    const historicalRecord: SeasonHistory = {
      seasonNumber: career.currentSeason,
      club: career.currentClub,
      championshipStats: championshipStatsArray,
      totalMatches: career.matches.length,
      totalGoals,
      totalAssists,
      totalXg: Number(totalXg.toFixed(2))
    };

    const nextSeason = career.currentSeason + 1;
    const nextClub = transferClub.trim() || career.currentClub;

    const updated: PlayerCareer = {
      ...career,
      currentSeason: nextSeason,
      currentClub: nextClub,
      history: [...career.history, historicalRecord],
      matches: [], // Clear matches for next season
      updatedAt: new Date().toISOString()
    };

    saveCareerToCloud(updated);
    setIsTransferring(false);
    setTransferClub("");
  };

  // Helper stats computer
  const computeStatsSummary = () => {
    if (!career) return { matches: 0, goals: 0, assists: 0, pd: 0, pe: 0, da: 0, fa: 0, sa: 0, a: 0, xg: 0 };
    
    // Filter matches by current selected tournament filter
    const targetMatches = statsChampFilter === "all" 
      ? career.matches 
      : career.matches.filter(m => m.championship === statsChampFilter);

    const sum = {
      matches: targetMatches.length,
      goals: 0,
      assists: 0,
      pd: 0,
      pe: 0,
      da: 0,
      fa: 0,
      sa: 0,
      a: 0,
      xg: 0
    };

    targetMatches.forEach(m => {
      sum.goals += m.goals;
      sum.assists += m.assists;
      sum.pd += m.goalDetails.pd;
      sum.pe += m.goalDetails.pe;
      sum.da += m.goalDetails.da;
      sum.fa += m.goalDetails.fa;
      sum.sa += m.goalDetails.sa;
      sum.a += m.goalDetails.a;
      sum.xg += m.xg;
    });

    sum.xg = Number(sum.xg.toFixed(2));
    return sum;
  };

  // Computed totals across absolute career including past seasons
  const computeCareerTotals = () => {
    if (!career) return { matches: 0, goals: 0, assists: 0, xg: 0 };
    let matches = career.matches.length;
    let goals = career.matches.reduce((acc, m) => acc + m.goals, 0);
    let assists = career.matches.reduce((acc, m) => acc + m.assists, 0);
    let xg = career.matches.reduce((acc, m) => acc + m.xg, 0);

    career.history.forEach(h => {
      matches += h.totalMatches;
      goals += h.totalGoals;
      assists += h.totalAssists;
      xg += h.totalXg;
    });

    return { matches, goals, assists, xg: Number(xg.toFixed(2)) };
  };

  // Dynamic FUT Card overall calculation
  const getDynamicOverall = () => {
    const totals = computeCareerTotals();
    // Base is 82, rises with milestones up to 99
    const bonusGoals = Math.min(Math.floor(totals.goals / 4), 10);
    const bonusAssists = Math.min(Math.floor(totals.assists / 3), 5);
    const bonusMatches = Math.min(Math.floor(totals.matches / 8), 2);
    return Math.min(82 + bonusGoals + bonusAssists + bonusMatches, 99);
  };

  const totals = computeCareerTotals();
  const activeStats = computeStatsSummary();

  const handleCopyJSON = () => {
    if (!career) return;
    navigator.clipboard.writeText(JSON.stringify(career, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyShareLink = () => {
    if (!career) return;
    const shareUrl = `${window.location.origin}/?player=${career.id}`;
    navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const loadRandomPreset = () => {
    const names = ["Enzo Lombardi", "Mateo Silva", "Giovanni Rossi", "Filippo Mancini", "Arthur Lima", "Hugo Santos"];
    const nationalities = ["Brasil", "Portugal", "Espanha", "Argentina", "França", "Inglaterra", "Itália"];
    const positions = ["Ponta Esquerda", "Ponta Direita", "Centroavante", "Meio-campista Armador"];
    const clubs = ["Real Madrid CF", "FC Barcelona", "Manchester City FC", "Paris Saint-Germain", "Juventus FC", "FC Bayern München"];
    const personalities = ["Marrento", "Ousado & Provocador", "Bad Boy", "Focado"];

    setParams({
      suggestedName: names[Math.floor(Math.random() * names.length)],
      nationality: nationalities[Math.floor(Math.random() * nationalities.length)],
      position: positions[Math.floor(Math.random() * positions.length)],
      preferredClub: clubs[Math.floor(Math.random() * clubs.length)],
      personalityType: personalities[Math.floor(Math.random() * personalities.length)],
    });
  };

  const handleImportJSON = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setImportError(null);

    try {
      const rawText = importJsonText.trim();
      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch (err) {
        throw new Error("O formato do JSON é inválido. Verifique se copiou todo o conteúdo do terminal corretamente.");
      }

      const requiredFields = ["nome_jogador", "clube_inicial", "nacionalidade", "perfil_completo_20_perguntas"];
      for (const field of requiredFields) {
        if (!parsed[field]) {
          throw new Error(`O JSON importado está incompleto. Falta o campo obrigatório: "${field}"`);
        }
      }

      const playerProfile: PlayerProfile = parsed as PlayerProfile;
      const newCareerId = currentUser.uid + "_" + Date.now();
      const initialChampionships = playerProfile.sugestoes_campeonatos_locais?.length > 0 
        ? [...playerProfile.sugestoes_campeonatos_locais]
        : ["La Liga EA Sports", "UEFA Champions League", "Copa del Rey"];

      const newCareer: PlayerCareer = {
        id: newCareerId,
        userId: currentUser.uid,
        userEmail: currentUser.email || "jogador@offline.com",
        profile: playerProfile,
        isPublic: false,
        currentClub: playerProfile.clube_inicial || "Vasco",
        currentSeason: 1,
        championships: initialChampionships,
        matches: [],
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveCareerToCloud(newCareer);
      setIsImporting(false);
      setImportJsonText("");
    } catch (err: any) {
      console.error(err);
      setImportError(err.message || "Erro ao processar e importar o JSON.");
    }
  };

  // Render question component
  const renderQuestion = (num: string, title: string, content: string | string[], icon: any) => {
    const IconComponent = icon;
    const isArray = Array.isArray(content);

    return (
      <div id={`q-${num}`} className="bg-[#121215] border border-white/5 rounded-2xl p-5 hover:border-brand-green/30 transition-all duration-300 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
            <span className="font-mono text-[10px] text-brand-green uppercase tracking-widest italic">{num.padStart(2, "0")}. {title}</span>
            <div className="text-zinc-500">
              <IconComponent className="w-4 h-4 text-brand-green" />
            </div>
          </div>
          {isArray ? (
            <div className="flex flex-wrap gap-2 mt-2">
              {(content as string[]).map((item, idx) => (
                <span key={idx} className="px-2.5 py-1 bg-white/5 border border-white/5 text-zinc-300 rounded-lg text-xs font-mono flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-green"></span>
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[#e2e2e7] text-xs sm:text-sm leading-relaxed whitespace-pre-line italic">
              "{content}"
            </p>
          )}
        </div>
      </div>
    );
  };

  const tabs = [
    { id: "all", label: "Tudo" },
    { id: "personalidade", label: "Estilo & Mente" },
    { id: "historia", label: "Carreira & Origens" },
    { id: "vida", label: "Fortuna & Glamour" },
    { id: "campo", label: "Dentro de Campo" },
  ];

  const filterQuestions = () => {
    if (!career) return null;
    const q = career.profile.perfil_completo_20_perguntas;
    switch (activeTab) {
      case "personalidade":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderQuestion("1", "Personalidade", q["1_personalidade"], Flame)}
            {renderQuestion("8", "Comportamento Polêmico", q["8_comportamento"], ShieldAlert)}
            {renderQuestion("16", "Relacionamentos no Elenco", q["16_relacionamentos_elenco"], Users)}
            {renderQuestion("17", "Satisfação no Clube", q["17_satisfacao_clube"], Heart)}
          </div>
        );
      case "historia":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderQuestion("5", "História de Vida", q["5_historia_de_vida"], Compass)}
            {renderQuestion("13", "Passagens pela Europa", q["13_clubes_europa"], Award)}
            {renderQuestion("14", "Clube Atual", q["14_clube_atual"], Trophy)}
            {renderQuestion("18", "Time do Coração de Infância", q["18_time_do_coracao"], Heart)}
            {renderQuestion("19", "Cidade & Nascimento", q["19_nascimento"], Calendar)}
          </div>
        );
      case "vida":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderQuestion("3", "Namorada / Vida Sentimental", q["3_namorada_real"], Heart)}
            {renderQuestion("4", "Situação Financeira", q["4_situacao_financeira"], Coins)}
            {renderQuestion("6", "Férias & Alto Padrão", q["6_vivia_bem"], Tv)}
            {renderQuestion("7", "Relação Familiar pós-Fama", q["7_relacao_familiar"], Users)}
            {renderQuestion("9", "Fortuna & Carros de Luxo", q["9_fortuna_e_carros_reais"], Car)}
            {renderQuestion("10", "Patrocínios Reais", q["10_patrocinios_reais"], Award)}
          </div>
        );
      case "campo":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderQuestion("2", "Amigos no Futebol", q["2_amigos_reais"], Users)}
            {renderQuestion("11", "Expectativa da Mídia (Sucessor)", q["11_expectativa_carreira"], Sparkles)}
            {renderQuestion("12", "Atributos & Desempenho", q["12_desempenho_campo"], Activity)}
            {renderQuestion("15", "Estilo de Jogo, Altura & Ídolos", q["15_estilo_altura_idolos"], User)}
            {renderQuestion("20", "Biometria Física", q["20_biometria"], Activity)}
          </div>
        );
      case "all":
      default:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderQuestion("1", "Personalidade", q["1_personalidade"], Flame)}
            {renderQuestion("2", "Parças Reais no Futebol", q["2_amigos_reais"], Users)}
            {renderQuestion("3", "Namorada / Romance Real", q["3_namorada_real"], Heart)}
            {renderQuestion("4", "Situação Financeira", q["4_situacao_financeira"], Coins)}
            {renderQuestion("5", "História de Vida", q["5_historia_de_vida"], Compass)}
            {renderQuestion("6", "Estilo de Vida Exclusivo", q["6_vivia_bem"], Tv)}
            {renderQuestion("7", "Relação Familiar", q["7_relacao_familiar"], Users)}
            {renderQuestion("8", "Comportamento Ousado", q["8_comportamento"], ShieldAlert)}
            {renderQuestion("9", "Fortuna & Garagem Real", q["9_fortuna_e_carros_reais"], Car)}
            {renderQuestion("10", "Patrocínios Reais", q["10_patrocinios_reais"], Award)}
            {renderQuestion("11", "Expectativa de Carreira", q["11_expectativa_carreira"], Sparkles)}
            {renderQuestion("12", "Desempenho em Campo", q["12_desempenho_campo"], Activity)}
            {renderQuestion("13", "Histórico na Europa", q["13_clubes_europa"], Award)}
            {renderQuestion("14", "Clube Atual", q["14_clube_atual"], Trophy)}
            {renderQuestion("15", "Estilo, Altura & Ídolos", q["15_estilo_altura_idolos"], User)}
            {renderQuestion("16", "Relacionamentos no Elenco", q["16_relacionamentos_elenco"], Users)}
            {renderQuestion("17", "Satisfação no Clube", q["17_satisfacao_clube"], Heart)}
            {renderQuestion("18", "Time do Coração", q["18_time_do_coracao"], Heart)}
            {renderQuestion("19", "Nascimento", q["19_nascimento"], Calendar)}
            {renderQuestion("20", "Biometria", q["20_biometria"], Activity)}
          </div>
        );
    }
  };

  // Loading Screen
  if (authLoading || (isSharedView && careerLoading)) {
    return (
      <div className="min-h-screen bg-[#050505] text-[#e0e0e0] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-12 h-12 text-brand-green animate-spin mb-4" />
        <p className="font-mono text-xs text-brand-green uppercase tracking-widest animate-pulse">
          Performance Analyst FC 26 // Carregando Legado...
        </p>
      </div>
    );
  }

  // Shared view Error Screen
  if (isSharedView && sharedCareerError) {
    return (
      <div className="min-h-screen bg-[#050505] text-[#e0e0e0] flex flex-col items-center justify-center font-sans p-6 text-center">
        <div className="max-w-md bg-[#111] border border-red-500/30 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-red-500"></div>
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h2 className="font-display font-black text-2xl text-white uppercase tracking-tight mb-4">Acesso Negado</h2>
          <p className="text-sm text-zinc-400 mb-8 leading-relaxed">
            {sharedCareerError}
          </p>
          <button 
            onClick={() => {
              window.history.pushState({}, "", window.location.origin);
              setIsSharedView(false);
              setSharedCareerError(null);
            }}
            className="w-full py-3 bg-white hover:bg-zinc-200 text-black font-display font-bold uppercase tracking-wider rounded-xl text-xs transition-all duration-250 cursor-pointer"
          >
            Voltar para o Painel Principal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#e0e0e0] flex flex-col justify-between font-sans">
      {/* HEADER SECTION */}
      <header className="border-b border-white/5 bg-[#0a0a0c]/90 backdrop-blur-md sticky top-0 z-50 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#121215] to-[#ccff00]/10 border border-brand-green/30 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-brand-green" />
            </div>
            <div>
              <span className="text-[9px] font-mono text-brand-green tracking-widest uppercase block">
                ANALYST PLATFORM // FC 26
              </span>
              <h1 className="font-display font-black text-xl tracking-tighter text-white uppercase">
                PERFORMANCE ANALYST <span className="text-brand-green">FC 26</span>
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0">
            {/* Domain Badge */}
            <div className="hidden md:block text-right">
              <p className="text-[8px] font-mono opacity-50 uppercase tracking-wider">Acesso Community</p>
              <a href="http://wolkstore.shop" target="_blank" rel="noreferrer" className="text-xs font-bold text-white hover:text-brand-green transition-colors">
                wolkstore.shop
              </a>
            </div>

            {/* Shared view badge */}
            {isSharedView && (
              <div className="px-3 py-1 bg-brand-green/10 border border-brand-green/20 rounded-full text-[10px] text-brand-green font-mono uppercase font-bold tracking-wider animate-pulse flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5" />
                Modo de Visualização Compartilhada
              </div>
            )}

            {/* Auth status and logout */}
            {currentUser ? (
              <div className="flex items-center gap-3 ml-auto sm:ml-0">
                <div className="text-right">
                  <p className="text-[9px] font-mono text-zinc-500 uppercase">Treinador</p>
                  <p className="text-xs font-bold text-white max-w-[120px] truncate">{currentUser.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  title="Sair do Sistema"
                  className="p-2.5 bg-[#111113] hover:bg-red-950/40 border border-white/5 hover:border-red-500/30 rounded-xl text-zinc-400 hover:text-red-400 transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              !isSharedView && (
                <div className="flex items-center gap-2 ml-auto sm:ml-0">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">Não Autenticado</span>
                </div>
              )
            )}
          </div>
        </div>
      </header>

      {/* LOGIN/REGISTER SCREEN FOR NON-LOGGED IN USERS (Not in shared view) */}
      {!currentUser && !isSharedView ? (
        <main className="max-w-md w-full mx-auto px-4 py-12 flex-1 flex flex-col justify-center">
          <div className="bg-[#0c0c0e] border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-green via-yellow-400 to-brand-green"></div>
            
            <div className="text-center mb-8">
              <Trophy className="w-12 h-12 text-brand-green mx-auto mb-4" />
              <h2 className="font-display font-black text-2xl text-white uppercase tracking-tight">Comunidade Gamer EA FC</h2>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Crie sua conta para gerar, salvar e compartilhar os legados e as estatísticas dos seus jogadores fictícios no site oficial <span className="text-brand-green font-bold">wolkstore.shop</span>.
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">Endereço de E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Seu melhor e-mail"
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">Senha Secreta</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                />
              </div>

              {authError && (
                <div className="p-3.5 bg-red-950/30 border border-red-500/20 rounded-xl text-red-200 text-[11px] leading-normal flex flex-col gap-2">
                  <div className="flex gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>
                      {authError.includes("auth/operation-not-allowed") || authError.includes("desativado") ? (
                        <>
                          <strong className="text-red-300">Aviso do Firebase (Provedor de E-mail Desativado):</strong>
                          <span className="block mt-1">O login com E-mail/Senha está desativado no console do Firebase do projeto.</span>
                          
                          <strong className="block mt-2.5 text-zinc-300">Como ativar (Passo a passo para o administrador):</strong>
                          <ol className="list-decimal pl-4 mt-1 space-y-1 text-zinc-300">
                            <li>Acesse o <a href="https://console.firebase.google.com/project/gen-lang-client-0194008248/authentication/providers" target="_blank" rel="noreferrer" className="text-brand-green hover:underline font-bold">Console do Firebase</a>.</li>
                            <li>Ative o provedor de login por <strong>E-mail/senha</strong>.</li>
                          </ol>
                          
                          <strong className="block mt-2.5 text-brand-green">💡 Alternativa Instantânea:</strong>
                          <span className="block mt-0.5 text-zinc-300">Use o botão de login com o <strong>Google</strong> abaixo, que já está configurado e operacional!</span>
                        </>
                      ) : (
                        authError
                      )}
                    </span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 bg-brand-green hover:bg-[#d9ff33] text-black font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 active:scale-97 glow-green cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                {authMode === "login" ? "Entrar na Arena" : "Criar Novo Legado"}
              </button>
            </form>

            <div className="flex items-center gap-3 my-4">
              <span className="h-px bg-white/5 flex-1"></span>
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">OU</span>
              <span className="h-px bg-white/5 flex-1"></span>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-brand-green/30 text-white font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 active:scale-97 cursor-pointer"
            >
              <svg className="w-4 h-4 text-white shrink-0 fill-current mr-1" viewBox="0 0 24 24" width="16" height="16">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Acessar instantaneamente com Google
            </button>

            <button
              type="button"
              onClick={handleGuestSignIn}
              className="w-full mt-2.5 py-3.5 bg-zinc-950/40 hover:bg-zinc-900 border border-white/5 hover:border-brand-green/30 text-zinc-300 hover:text-white font-display font-bold uppercase tracking-wider rounded-xl text-[10px] sm:text-xs transition-all duration-200 flex items-center justify-center gap-2 active:scale-97 cursor-pointer"
            >
              <Compass className="w-4 h-4 text-brand-green animate-spin" style={{ animationDuration: "12s" }} />
              Entrar como Convidado (Modo Offline)
            </button>

            <div className="border-t border-white/5 mt-6 pt-4 text-center">
              <button
                onClick={() => {
                  setAuthMode(authMode === "login" ? "register" : "login");
                  setAuthError(null);
                }}
                className="text-xs text-zinc-400 hover:text-brand-green font-mono transition-colors cursor-pointer"
              >
                {authMode === "login" 
                  ? "Não tem uma conta? Cadastre-se gratuitamente" 
                  : "Já possui uma conta? Faça Login"}
              </button>
            </div>
          </div>
        </main>
      ) : (
        /* MAIN DASHBOARD INTERFACE */
        <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
          
          {/* BANNER SHOWING OWNER VIEWING THE LEGACY */}
          {isSharedView && career && (
            <div className="bg-[#0b100d] border border-brand-green/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-brand-green">
              <div className="flex items-center gap-2.5 text-xs font-mono">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-green animate-pulse shrink-0"></span>
                <span>
                  Você está visualizando a carreira de <strong>{career.profile.nome_jogador}</strong> criada pelo treinador <strong className="text-white">{career.userEmail}</strong>.
                </span>
              </div>
              <button
                onClick={() => {
                  window.history.pushState({}, "", window.location.origin);
                  setIsSharedView(false);
                  setSharedCareerError(null);
                  // Trigger reload for auth owned career
                  window.location.reload();
                }}
                className="px-3 py-1 bg-brand-green/20 border border-brand-green/30 text-white rounded-lg text-[10px] font-mono hover:bg-brand-green hover:text-black transition-all cursor-pointer"
              >
                Voltar ao meu painel
              </button>
            </div>
          )}

          {/* ACTIVE FALLBACK NOTIFICATION */}
          {career?.profile._is_fallback && (
            <div className="bg-[#1c160c] border border-amber-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200">
              <div className="flex items-center gap-2.5 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
                <span>
                  <strong>Inteligência de Contingência:</strong> Geração local calibrada para 2026 ativa.
                </span>
              </div>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded shrink-0">
                Gerador v2.6
              </span>
            </div>
          )}

          {/* CREATE CAREER FLOW FOR AUTHENTICATED USERS WITH NO CAREER */}
          {!career && !careerLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column Form */}
              <div className="lg:col-span-7 bg-[#0c0c0e] border border-white/5 rounded-3xl p-6 sm:p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-brand-green/10 text-brand-green rounded-xl border border-brand-green/20">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[9px] font-mono text-brand-green uppercase tracking-widest block">
                      Geração de Inteligência Artificial // Google Search Grounding 2026
                    </span>
                    <h2 className="font-display font-black text-xl text-white uppercase italic tracking-tight">
                      Gere seu Jogador Fictício de Comunidade
                    </h2>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Digite as informações básicas do seu atleta de carreira. A IA integrará dados da internet real de 2026 para fundamentar carros, namoradas, patrocínios e parças!
                </p>

                {/* Method selector tab */}
                <div className="flex border-b border-white/5 pb-2 gap-4">
                  <button
                    type="button"
                    onClick={() => { setIsImporting(false); setImportError(null); }}
                    className={`pb-1.5 font-mono text-[10px] uppercase tracking-wider font-bold transition-all border-b-2 cursor-pointer ${!isImporting ? 'text-brand-green border-brand-green' : 'text-zinc-500 border-transparent hover:text-zinc-400'}`}
                  >
                    📝 Formulário de Geração
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsImporting(true); setImportError(null); }}
                    className={`pb-1.5 font-mono text-[10px] uppercase tracking-wider font-bold transition-all border-b-2 cursor-pointer ${isImporting ? 'text-brand-green border-brand-green' : 'text-zinc-500 border-transparent hover:text-zinc-400'}`}
                  >
                    📂 Importar Ficha por JSON
                  </button>
                </div>

                {!isImporting ? (
                  <form onSubmit={handleGenerate} className="space-y-4">
                    <div>
                      <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">
                        Nome / Apelido Sugerido
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Enzo Lombardi (ou em branco para IA batizar)"
                        value={params.suggestedName}
                        onChange={(e) => setParams({ ...params, suggestedName: e.target.value })}
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">
                          Nacionalidade
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Brasil, Portugal"
                          value={params.nationality}
                          onChange={(e) => setParams({ ...params, nationality: e.target.value })}
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
                          value={params.position}
                          onChange={(e) => setParams({ ...params, position: e.target.value })}
                          className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">
                          Clube que Atua em 2026
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Real Madrid, Chelsea"
                          value={params.preferredClub}
                          onChange={(e) => setParams({ ...params, preferredClub: e.target.value })}
                          className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">
                          Personalidade Base
                        </label>
                        <select
                          value={params.personalityType}
                          onChange={(e) => setParams({ ...params, personalityType: e.target.value })}
                          className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono"
                        >
                          <option value="Marrento" className="bg-[#0c0c0e]">Marrento & Confiante</option>
                          <option value="Ousado & Provocador" className="bg-[#0c0c0e]">Ousado & Provocador</option>
                          <option value="Bad Boy" className="bg-[#0c0c0e]">Bad Boy Extraordinário</option>
                          <option value="Focado" className="bg-[#0c0c0e]">Focado & Técnico</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-4 flex gap-4">
                      <button
                        type="button"
                        onClick={loadRandomPreset}
                        className="px-5 py-3.5 bg-[#111] hover:bg-zinc-800 border border-white/5 text-zinc-300 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 flex-1 font-mono uppercase font-bold cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-brand-green" />
                        Sortear Preset
                      </button>

                      <button
                        type="submit"
                        disabled={generationLoading}
                        className="px-6 py-3.5 bg-brand-green hover:bg-[#d9ff33] text-black font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 flex-1.5 disabled:opacity-50 glow-green cursor-pointer"
                      >
                        {generationLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Consultando Oráculo...
                          </>
                        ) : (
                          <>
                            <Activity className="w-4 h-4" />
                            Criar Carreira
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleImportJSON} className="space-y-4">
                    <div>
                      <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5 font-bold">
                        Cole o JSON Completo da Ficha
                      </label>
                      <textarea
                        rows={10}
                        placeholder='Cole aqui o JSON retornado pelo gerador (por exemplo, a saída do teste com curl no formato {"nome_jogador": "...", ...})'
                        value={importJsonText}
                        onChange={(e) => setImportJsonText(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-green focus:border-brand-green transition-all font-mono h-[240px] resize-none"
                        required
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        className="w-full py-3.5 bg-brand-green hover:bg-[#d9ff33] text-black font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 glow-green cursor-pointer"
                      >
                        <FileJson className="w-4 h-4" />
                        Importar & Iniciar Legado
                      </button>
                    </div>
                  </form>
                )}

                {generationError && (
                  <div className="p-4 bg-red-950/40 border border-red-900/60 rounded-2xl text-red-200 text-xs flex gap-3">
                    <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                    <div>
                      <p className="font-bold font-mono uppercase">Falha na Geração:</p>
                      <p className="text-[11px] text-red-300 leading-relaxed mt-1">{generationError}</p>
                    </div>
                  </div>
                )}

                {importError && (
                  <div className="p-4 bg-red-950/40 border border-red-900/60 rounded-2xl text-red-200 text-xs flex gap-3">
                    <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                    <div>
                      <p className="font-bold font-mono uppercase">Erro de Importação:</p>
                      <p className="text-[11px] text-red-300 leading-relaxed mt-1">{importError}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column Preview */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 bg-[#0c0c0e] border border-white/5 rounded-3xl relative overflow-hidden h-full min-h-[400px]">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-brand-green/5 rounded-full blur-3xl pointer-events-none"></div>
                <Trophy className="w-16 h-16 text-brand-green/20 mb-4" />
                <h3 className="font-display font-bold text-lg text-white uppercase text-center mb-2">Seu Legado Espera</h3>
                <p className="text-xs text-zinc-400 text-center max-w-sm leading-relaxed">
                  Assim que o jogador for gerado, seu painel tático de partidas do EA FC 26 será liberado com controle de gols (PD, PE, DA, FA, SA), assistências, criação de torneios, avanço de temporadas e link de compartilhamento.
                </p>
              </div>
            </div>
          )}

          {/* ACTIVE BENTO GRID DASHBOARD */}
          {career && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Fallback Smart Contingency Banner */}
              {career.profile._is_fallback && (
                <div className="lg:col-span-12 p-5 bg-yellow-500/10 border border-yellow-500/20 rounded-3xl text-xs flex gap-3.5 text-yellow-200">
                  <Sparkles className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <p className="font-display font-bold uppercase text-yellow-300 tracking-wider text-[11px]">
                      Modo de Contingência Ativado
                    </p>
                    <p className="leading-relaxed mt-1 text-zinc-300">
                      O oráculo remoto de IA excedeu temporariamente as cotas de consultas gratuitas. Para manter sua jornada sem interrupções, o sistema gerou automaticamente um perfil biográfico fictício realista altamente personalizado baseado nos seus parâmetros!
                    </p>
                  </div>
                </div>
              )}
              
              {/* LEFT COLUMN: FUT CARD & QUICK STATS OVERVIEW */}
              <section className="lg:col-span-4 space-y-6">
                
                {/* 1. DYNAMIC FUT CARD */}
                <div className="bg-[#0c0c0e] border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl">
                  {/* Background glowing effects */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-brand-green/5 rounded-full blur-3xl pointer-events-none"></div>
                  
                  {/* FUT CARD CONTAINER */}
                  <div className="w-[280px] h-[390px] bg-gradient-to-br from-[#0c0c0e] via-[#12141a] to-[#0c0c0e] border-2 border-brand-green rounded-[24px] shadow-2xl relative p-5 flex flex-col justify-between glow-gold transition-transform hover:scale-102 duration-300">
                    
                    {/* Rating and Position */}
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col items-center">
                        <span className="text-4xl font-display font-black text-brand-green leading-none tracking-tighter">
                          {getDynamicOverall()}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-zinc-400 mt-1.5 uppercase tracking-widest">
                          {career.profile.perfil_completo_20_perguntas["15_estilo_altura_idolos"]?.split(",")[0]?.split(" ")[0]?.substring(0,3) || "PE"}
                        </span>
                      </div>
                      
                      <div className="w-8 h-8 rounded-full bg-black border border-white/5 flex items-center justify-center">
                        <Trophy className="w-4 h-4 text-brand-green animate-pulse" />
                      </div>
                    </div>

                    {/* Image / Silhouette */}
                    <div className="flex-1 flex items-center justify-center py-2 relative">
                      <div className="w-32 h-32 rounded-full bg-gradient-to-b from-zinc-800 to-transparent flex items-end justify-center overflow-hidden border border-white/5">
                        <User className="w-24 h-24 text-zinc-600 translate-y-3" />
                      </div>
                      <div className="absolute w-28 h-28 rounded-full border border-brand-green/20 pointer-events-none"></div>
                    </div>

                    {/* Name & Club Info */}
                    <div className="text-center">
                      <h4 className="font-display font-black text-lg text-white tracking-tight uppercase truncate">
                        {career.profile.nome_jogador?.split(" ")[0]} {career.profile.nome_jogador?.split(" ")[1] || ""}
                      </h4>
                      
                      <div className="flex items-center justify-center gap-2 mt-1.5">
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-black/80 border border-white/5 rounded text-zinc-300 uppercase">
                          {career.profile.nacionalidade}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-zinc-600"></span>
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-black/80 border border-white/5 rounded text-zinc-300 uppercase truncate max-w-[120px]">
                          {career.currentClub}
                        </span>
                      </div>
                    </div>

                    {/* Dynamic growing stats */}
                    <div className="grid grid-cols-6 border-t border-white/10 pt-3 mt-3 text-center gap-1">
                      <div>
                        <span className="text-[8px] text-zinc-500 block font-mono font-bold">PAC</span>
                        <span className="text-xs font-display font-bold text-white">
                          {Math.min(92 + Math.floor(totals.matches / 10), 99)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[8px] text-zinc-500 block font-mono font-bold">SHO</span>
                        <span className="text-xs font-display font-bold text-white">
                          {Math.min(84 + Math.floor(totals.goals / 2), 99)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[8px] text-zinc-500 block font-mono font-bold">PAS</span>
                        <span className="text-xs font-display font-bold text-white">
                          {Math.min(80 + Math.floor(totals.assists / 1.5), 99)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[8px] text-zinc-500 block font-mono font-bold">DRI</span>
                        <span className="text-xs font-display font-bold text-white">
                          {Math.min(88 + Math.floor(totals.goals / 4), 99)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[8px] text-zinc-500 block font-mono font-bold">DEF</span>
                        <span className="text-xs font-display font-bold text-white">45</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-zinc-500 block font-mono font-bold">PHY</span>
                        <span className="text-xs font-display font-bold text-white">
                          {Math.min(78 + Math.floor(totals.matches / 6), 99)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. OVERALL CAREER TOTALS GRID */}
                <div className="bg-[#0c0c0e] border border-white/5 rounded-3xl p-5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                    <TrendingUp className="w-4 h-4 text-brand-green" />
                    <h3 className="font-display font-bold text-xs text-white uppercase tracking-wider">Estatísticas Acumuladas</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3 font-mono">
                    <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5 text-center">
                      <span className="text-[9px] text-zinc-500 block uppercase font-bold">Total Partidas</span>
                      <span className="text-xl font-display font-black text-white mt-1 block">
                        {totals.matches}
                      </span>
                    </div>

                    <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5 text-center">
                      <span className="text-[9px] text-zinc-500 block uppercase font-bold">Total Gols</span>
                      <span className="text-xl font-display font-black text-brand-green mt-1 block">
                        {totals.goals}
                      </span>
                    </div>

                    <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5 text-center">
                      <span className="text-[9px] text-zinc-500 block uppercase font-bold">Passes Gol (PG)</span>
                      <span className="text-xl font-display font-black text-white mt-1 block">
                        {totals.assists}
                      </span>
                    </div>

                    <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5 text-center">
                      <span className="text-[9px] text-zinc-500 block uppercase font-bold">xG Esperado</span>
                      <span className="text-xl font-display font-black text-brand-green mt-1 block">
                        {totals.xg}
                      </span>
                    </div>
                  </div>

                  <div className="text-center bg-[#15151a] border border-white/5 p-3 rounded-2xl">
                    <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest block font-bold mb-1">
                      // Temporada Atual
                    </span>
                    <span className="text-sm font-display font-black text-white uppercase italic tracking-tighter">
                      TEMPORADA {career.currentSeason} @ {career.currentClub}
                    </span>
                  </div>
                </div>

                {/* 3. SHARE LEGACY PANEL */}
                <div className="bg-[#0c0c0e] border border-white/5 rounded-3xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Share2 className="w-4 h-4 text-brand-green" />
                      <h3 className="font-display font-bold text-xs text-white uppercase tracking-wider">Acesso da Comunidade</h3>
                    </div>
                    
                    {!isSharedView && (
                      <button
                        onClick={handleTogglePrivacy}
                        className={`px-2.5 py-1 text-[9px] font-mono font-bold rounded-full uppercase flex items-center gap-1.5 border transition-all cursor-pointer ${
                          career.isPublic 
                            ? "bg-brand-green/10 border-brand-green/30 text-brand-green" 
                            : "bg-red-500/10 border-red-500/20 text-red-400"
                        }`}
                      >
                        {career.isPublic ? (
                          <>
                            <Unlock className="w-3 h-3" /> Publico
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3" /> Privado
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {currentUser?.uid === "guest_user" ? (
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-[10px] leading-normal text-yellow-200">
                      <strong>⚠️ Modo Convidado (Local):</strong> Como você está acessando sem uma conta em nuvem, seus dados estão guardados localmente neste navegador. Para compartilhar de verdade na nuvem com seus amigos e acessar de qualquer dispositivo, faça login com o Google!
                    </div>
                  ) : (
                    <>
                      <p className="text-[10px] sm:text-xs text-zinc-400 leading-normal">
                        Se marcado como <strong>Público</strong>, qualquer amigo pode acessar o link único do perfil para ver as estatísticas, biografia e histórico!
                      </p>

                      <div className="flex items-center gap-2 bg-black border border-white/5 p-2 rounded-xl">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.origin}/?player=${career.id}`}
                          className="bg-transparent border-none text-[10px] text-zinc-400 w-full font-mono focus:outline-none"
                        />
                        <button
                          onClick={handleCopyShareLink}
                          className="px-3 py-1.5 bg-brand-green text-black hover:bg-[#d9ff33] rounded-lg text-[9px] font-mono font-bold transition-all shrink-0 cursor-pointer"
                        >
                          {shareCopied ? "Copiado!" : "Copiar Link"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* RIGHT COLUMN: MAIN TACTICAL CONTROL PANEL & BIOGRAPHY */}
              <section className="lg:col-span-8 space-y-6">
                
                {/* 1. TACTICAL CONTROL PANEL (MATCH RECORDER & TOURNAMENTS) */}
                {!isSharedView && (
                  <div className="bg-[#0c0c0e] border border-white/5 rounded-3xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.02] pointer-events-none">
                      <Sliders className="w-32 h-32 text-brand-green" />
                    </div>

                    <div className="flex items-center gap-2.5 border-b border-white/5 pb-3 mb-6">
                      <div className="p-1.5 bg-brand-green/15 text-brand-green rounded-lg">
                        <Activity className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[8px] font-mono text-zinc-500 block uppercase tracking-widest">Controle Tático</span>
                        <h2 className="font-display font-bold text-md text-white uppercase italic tracking-tight">
                          Painel de Partidas do FC 26
                        </h2>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                      
                      {/* Match Counters (Left Part) */}
                      <div className="md:col-span-8 space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[8px] font-mono text-zinc-400 uppercase tracking-widest font-bold mb-1.5">Campeonato</label>
                            <select
                              value={matchChamp}
                              onChange={(e) => setMatchChamp(e.target.value)}
                              className="w-full bg-black/40 border border-white/5 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
                            >
                              {career.championships.map((champ, idx) => (
                                <option key={idx} value={champ} className="bg-[#0c0c0e]">{champ}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[8px] font-mono text-zinc-400 uppercase tracking-widest font-bold mb-1.5">Assistências (PG)</label>
                            <div className="flex items-center justify-between bg-black/40 border border-white/5 rounded-xl px-3 py-2">
                              <button 
                                onClick={() => setMatchPG(Math.max(0, matchPG - 1))}
                                className="w-6 h-6 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center justify-center font-mono text-xs cursor-pointer"
                              >
                                -
                              </button>
                              <span className="text-xs font-mono font-bold">{matchPG}</span>
                              <button 
                                onClick={() => setMatchPG(matchPG + 1)}
                                className="w-6 h-6 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center justify-center font-mono text-xs cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Goal Specification Section */}
                        <div className="bg-black/30 border border-white/5 p-4 rounded-2xl space-y-3.5">
                          <span className="text-[9px] font-mono text-brand-green uppercase tracking-wider font-bold block border-b border-white/5 pb-1">
                            Especificação dos Gols da Partida (Total Gols = PD + PE)
                          </span>

                          <div className="grid grid-cols-2 gap-4">
                            {/* Perna Direita (PD) */}
                            <div>
                              <span className="text-[8px] font-mono text-zinc-400 uppercase tracking-widest block mb-1">Gols Perna Direita (PD)</span>
                              <div className="flex items-center justify-between bg-black/50 border border-white/5 rounded-lg p-2">
                                <button 
                                  onClick={() => setMatchPD(Math.max(0, matchPD - 1))}
                                  className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="text-xs font-mono font-bold">{matchPD}</span>
                                <button 
                                  onClick={() => setMatchPD(matchPD + 1)}
                                  className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Perna Esquerda (PE) */}
                            <div>
                              <span className="text-[8px] font-mono text-zinc-400 uppercase tracking-widest block mb-1">Gols Perna Esquerda (PE)</span>
                              <div className="flex items-center justify-between bg-black/50 border border-white/5 rounded-lg p-2">
                                <button 
                                  onClick={() => setMatchPE(Math.max(0, matchPE - 1))}
                                  className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="text-xs font-mono font-bold">{matchPE}</span>
                                <button 
                                  onClick={() => setMatchPE(matchPE + 1)}
                                  className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Dentro da Área (DA) */}
                            <div>
                              <span className="text-[8px] font-mono text-zinc-400 uppercase tracking-widest block mb-1">Gols Dentro Área (DA)</span>
                              <div className="flex items-center justify-between bg-black/50 border border-white/5 rounded-lg p-2">
                                <button 
                                  onClick={() => setMatchDA(Math.max(0, matchDA - 1))}
                                  className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="text-xs font-mono font-bold">{matchDA}</span>
                                <button 
                                  onClick={() => {
                                    setMatchDA(matchDA + 1);
                                  }}
                                  className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Fora da Área (FA) */}
                            <div>
                              <span className="text-[8px] font-mono text-zinc-400 uppercase tracking-widest block mb-1">Gols Fora da Área (FA)</span>
                              <div className="flex items-center justify-between bg-black/50 border border-white/5 rounded-lg p-2">
                                <button 
                                  onClick={() => setMatchFA(Math.max(0, matchFA - 1))}
                                  className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="text-xs font-mono font-bold">{matchFA}</span>
                                <button 
                                  onClick={() => {
                                    setMatchFA(matchFA + 1);
                                  }}
                                  className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Sem Assistência (SA) */}
                            <div className="col-span-2">
                              <span className="text-[8px] font-mono text-zinc-400 uppercase tracking-widest block mb-1">Gols Individuais / Sem Assistência (SA)</span>
                              <div className="flex items-center justify-between bg-black/50 border border-white/5 rounded-lg p-2.5">
                                <button 
                                  onClick={() => setMatchSA(Math.max(0, matchSA - 1))}
                                  className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="text-xs font-mono font-bold">{matchSA} Gols Individuais</span>
                                <button 
                                  onClick={() => setMatchSA(matchSA + 1)}
                                  className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Submit match button */}
                        <button
                          onClick={handleAddMatch}
                          className="w-full py-3 bg-[#111] hover:bg-zinc-800 border border-brand-green/20 hover:border-brand-green text-white font-display font-bold uppercase tracking-wider rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Plus className="w-4 h-4 text-brand-green" />
                          Salvar Partida Realizada
                        </button>
                      </div>

                      {/* Champions management & Season Flow (Right Part) */}
                      <div className="md:col-span-4 space-y-5 flex flex-col justify-between">
                        {/* Championships list and adder */}
                        <div className="bg-black/40 border border-white/5 p-4 rounded-2xl space-y-3.5">
                          <span className="text-[8px] font-mono text-zinc-400 uppercase tracking-widest font-bold block">
                            ➕ Gerenciar Campeonatos
                          </span>
                          
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              placeholder="Ex: Champions League"
                              value={newChampionshipName}
                              onChange={(e) => setNewChampionshipName(e.target.value)}
                              className="bg-[#050505] border border-white/5 rounded-lg px-2.5 py-1.5 text-[11px] text-white font-mono w-full focus:outline-none"
                            />
                            <button
                              onClick={handleAddChampionship}
                              className="p-1.5 bg-brand-green text-black rounded-lg hover:bg-[#d9ff33] transition-all cursor-pointer"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="max-h-[140px] overflow-y-auto space-y-1.5 scrollbar-none pr-1">
                            {career.championships.map((champ, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-black/60 border border-white/5 p-1.5 px-2.5 rounded-lg text-[10px] font-mono">
                                <span className="text-zinc-300 truncate max-w-[110px]">{champ}</span>
                                <button
                                  onClick={() => handleDeleteChampionship(champ)}
                                  className="text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Season Progression Trigger */}
                        <div className="bg-gradient-to-br from-[#121215] to-[#ccff00]/5 border border-brand-green/10 p-4 rounded-2xl space-y-3">
                          <span className="text-[8px] font-mono text-brand-green uppercase tracking-widest font-bold block">
                            🔄 PROGRESSO DA CARREIRA
                          </span>
                          <p className="text-[10px] text-zinc-400 leading-normal">
                            Ao finalizar o ano, as estatísticas são consolidadas no legado permanente e o painel de jogos limpa para a nova temporada!
                          </p>

                          {!isTransferring ? (
                            <button
                              onClick={() => setIsTransferring(true)}
                              className="w-full py-2.5 bg-brand-green text-black hover:bg-[#d9ff33] font-display font-bold uppercase tracking-wider rounded-xl text-[10px] transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Award className="w-3.5 h-3.5" />
                              Finalizar Temporada
                            </button>
                          ) : (
                            <div className="space-y-2 pt-1">
                              <label className="block text-[8px] font-mono text-zinc-400 uppercase tracking-widest font-bold">Transferido para novo Clube? (ou em branco)</label>
                              <input
                                type="text"
                                placeholder="Nome do novo clube"
                                value={transferClub}
                                onChange={(e) => setTransferClub(e.target.value)}
                                className="bg-black border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono w-full focus:outline-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={handleAdvanceSeason}
                                  className="px-3 py-1.5 bg-brand-green text-black rounded-lg text-[10px] font-mono font-bold flex-1 cursor-pointer"
                                >
                                  Avançar
                                </button>
                                <button
                                  onClick={() => setIsTransferring(false)}
                                  className="px-3 py-1.5 bg-[#111] text-zinc-400 border border-white/5 rounded-lg text-[10px] font-mono flex-1 cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  </div>
                )}

                {/* 2. STATS ANALYSIS DASHBOARD / TAB FILTER */}
                <div className="bg-[#0c0c0e] border border-white/5 rounded-3xl p-6 space-y-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-brand-green/15 text-brand-green rounded-lg">
                        <Award className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[8px] font-mono text-zinc-500 block uppercase tracking-widest">Painel Estatístico</span>
                        <h2 className="font-display font-bold text-md text-white uppercase italic tracking-tight">
                          Estatísticas Isoladas por Torneio
                        </h2>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider font-bold">Filtrar por:</span>
                      <select
                        value={statsChampFilter}
                        onChange={(e) => setStatsChampFilter(e.target.value)}
                        className="bg-[#111] border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none"
                      >
                        <option value="all">Total Geral Carreira</option>
                        {career.championships.map((champ, i) => (
                          <option key={i} value={champ}>{champ}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Stats Detail Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <div className="bg-black/20 border border-white/5 rounded-2xl p-4 text-center">
                      <span className="text-[8px] font-mono text-zinc-500 block uppercase font-bold">Jogos</span>
                      <span className="text-xl font-display font-black text-white mt-1.5 block">{activeStats.matches}</span>
                    </div>

                    <div className="bg-black/20 border border-white/5 rounded-2xl p-4 text-center">
                      <span className="text-[8px] font-mono text-zinc-500 block uppercase font-bold">Gols</span>
                      <span className="text-xl font-display font-black text-brand-green mt-1.5 block">{activeStats.goals}</span>
                    </div>

                    <div className="bg-black/20 border border-white/5 rounded-2xl p-4 text-center">
                      <span className="text-[8px] font-mono text-zinc-500 block uppercase font-bold">PG (Assist)</span>
                      <span className="text-xl font-display font-black text-white mt-1.5 block">{activeStats.assists}</span>
                    </div>

                    <div className="bg-black/20 border border-white/5 rounded-2xl p-4 text-center">
                      <span className="text-[8px] font-mono text-zinc-500 block uppercase font-bold">Gols p/ Jogo</span>
                      <span className="text-xl font-display font-black text-brand-green mt-1.5 block">
                        {activeStats.matches > 0 ? (activeStats.goals / activeStats.matches).toFixed(2) : "0.00"}
                      </span>
                    </div>

                    <div className="bg-black/20 border border-white/5 rounded-2xl p-4 text-center col-span-2 sm:col-span-1">
                      <span className="text-[8px] font-mono text-zinc-500 block uppercase font-bold">xG Esperado</span>
                      <span className="text-xl font-display font-black text-white mt-1.5 block">{activeStats.xg}</span>
                    </div>
                  </div>

                  {/* Micro breakdown of goals in active selection */}
                  {activeStats.goals > 0 && (
                    <div className="bg-black/40 border border-white/5 p-4 rounded-2xl space-y-3 font-mono">
                      <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">
                        // Detalhes da Finalização (Filtro Ativo)
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                        <div>
                          <span className="text-[8px] text-zinc-500 block uppercase">Perna Direita (PD)</span>
                          <span className="text-sm font-bold text-white mt-0.5 block">{activeStats.pd}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-zinc-500 block uppercase">Perna Esquerda (PE)</span>
                          <span className="text-sm font-bold text-white mt-0.5 block">{activeStats.pe}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-zinc-500 block uppercase">Dentro da Área (DA)</span>
                          <span className="text-sm font-bold text-white mt-0.5 block">{activeStats.da}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-zinc-500 block uppercase">Fora da Área (FA)</span>
                          <span className="text-sm font-bold text-white mt-0.5 block">{activeStats.fa}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. BIOGRAPHY SECTIONS PORTFOLIO (20 Questions IA) */}
                <div className="bg-[#0c0c0e] border border-white/5 rounded-3xl overflow-hidden shadow-xl">
                  {/* Tab Selector */}
                  <div className="flex overflow-x-auto border-b border-white/5 bg-black/40 px-3 pt-2 scrollbar-none">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 sm:px-5 py-3 font-mono font-bold text-[10px] sm:text-xs uppercase tracking-wider transition-all relative shrink-0 focus:outline-none cursor-pointer ${
                          activeTab === tab.id ? "text-brand-green font-black" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        {tab.label}
                        {activeTab === tab.id && (
                          <motion.div
                            layoutId="activeTabUnderline"
                            className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-green"
                          />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Questions Grid with staggered entrance animation */}
                  <div className="p-6">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4"
                      >
                        {filterQuestions()}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>

                {/* 4. MATCH LOGS FEED FOR THE CURRENT SEASON */}
                <div className="bg-[#0c0c0e] border border-white/5 rounded-3xl p-6 space-y-4">
                  <div className="flex items-center gap-2.5 border-b border-white/5 pb-3">
                    <div className="p-1.5 bg-brand-green/15 text-brand-green rounded-lg">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[8px] font-mono text-zinc-500 block uppercase tracking-widest">Feed de Partidas</span>
                      <h3 className="font-display font-bold text-md text-white uppercase italic tracking-tight">
                        Histórico de Atuações (Temporada {career.currentSeason})
                      </h3>
                    </div>
                  </div>

                  <div className="max-h-[300px] overflow-y-auto space-y-3 pr-1 scrollbar">
                    {career.matches.length > 0 ? (
                      career.matches.map((m) => (
                        <div key={m.id} className="bg-black/30 border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all hover:border-brand-green/20">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-brand-green/10 text-brand-green border border-brand-green/20 rounded-md">
                                {m.championship}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500">
                                {new Date(m.createdAt).toLocaleDateString("pt-BR")}
                              </span>
                            </div>

                            <p className="font-mono text-xs sm:text-sm font-black text-white italic tracking-wide mt-1.5">
                              {m.logText}
                            </p>
                          </div>

                          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0">
                            <div className="text-left sm:text-right font-mono">
                              <span className="text-[8px] text-zinc-500 uppercase block font-bold">xG da Partida</span>
                              <span className="text-xs font-bold text-brand-green">{m.xg} xG</span>
                            </div>

                            {!isSharedView && (
                              <button
                                onClick={() => handleDeleteMatch(m.id)}
                                className="p-2 bg-red-950/20 text-zinc-500 hover:text-red-400 hover:bg-red-950/40 border border-white/5 rounded-xl transition-all cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 text-zinc-500 font-mono text-xs italic">
                        Nenhuma atuação registrada na Temporada {career.currentSeason} ainda. Use o painel tático de partidas para começar!
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. SEASONS HISTORY (LEGACY LOG) */}
                {career.history.length > 0 && (
                  <div className="bg-[#0c0c0e] border border-white/5 rounded-3xl p-6 space-y-4">
                    <div className="flex items-center gap-2.5 border-b border-white/5 pb-3">
                      <div className="p-1.5 bg-brand-green/15 text-brand-green rounded-lg">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[8px] font-mono text-zinc-500 block uppercase tracking-widest">Memorial de Conquistas</span>
                        <h3 className="font-display font-bold text-md text-white uppercase italic tracking-tight">
                          Legado Histórico de Temporadas
                        </h3>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {career.history.map((h, i) => (
                        <div key={i} className="bg-black/40 border border-brand-green/10 rounded-2xl p-4 space-y-3.5">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-white/5 pb-2">
                            <span className="font-display font-black text-xs sm:text-sm text-brand-green uppercase tracking-wide italic">
                              🏆 Temporada {h.seasonNumber} @ {h.club}
                            </span>
                            <div className="flex gap-4 font-mono text-[10px] text-zinc-400">
                              <span><strong>Jogos:</strong> {h.totalMatches}</span>
                              <span><strong>Gols:</strong> {h.totalGoals}</span>
                              <span><strong>PG (Assist):</strong> {h.totalAssists}</span>
                              <span><strong>xG:</strong> {h.totalXg}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {h.championshipStats.map((cs, idx) => (
                              <div key={idx} className="bg-black/50 border border-white/5 p-3 rounded-xl font-mono text-[10px] text-zinc-400 space-y-1">
                                <span className="text-white font-bold block truncate border-b border-white/5 pb-1 mb-1">{cs.championship}</span>
                                <div className="grid grid-cols-2 gap-1">
                                  <span>Jogos: <strong>{cs.matches}</strong></span>
                                  <span>Gols: <strong className="text-brand-green">{cs.goals}</strong></span>
                                  <span>Assist: <strong>{cs.assists}</strong></span>
                                  <span>xG: <strong className="text-white">{cs.xg}</strong></span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6. RAW PLAYLOAD INSPECTION */}
                <div className="bg-[#0c0c0e] border border-white/5 rounded-3xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <FileJson className="w-4 h-4 text-brand-green" />
                      <h3 className="font-display font-bold text-sm text-white uppercase italic tracking-tight">Inspeção de Payload (JSON)</h3>
                    </div>
                    <button
                      onClick={handleCopyJSON}
                      className="text-[10px] font-mono text-zinc-400 hover:text-brand-green flex items-center gap-1.5 px-2.5 py-1.5 bg-black border border-white/5 rounded-xl transition-all cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-brand-green" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copiado!" : "Copiar"}
                    </button>
                  </div>

                  <div className="bg-black/60 rounded-xl p-4 max-h-[220px] overflow-y-auto border border-white/5 scrollbar">
                    <pre className="font-mono text-[10px] sm:text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap select-all">
                      {JSON.stringify(career, null, 2)}
                    </pre>
                  </div>
                </div>

              </section>

            </div>
          )}

        </main>
      )}

      {/* FOOTER */}
      <footer className="border-t border-white/5 bg-[#070709] py-8 text-center text-[11px] text-zinc-500 font-mono mt-12">
        <div className="max-w-7xl mx-auto px-6 space-y-4">
          <p>© 2026 Performance Analyst FC 26. Todos os direitos reservados à comunidade gamer.</p>
          <p>
            Desenvolvido exclusivamente para o ecossistema wolkstore.shop.
          </p>
          
          {/* HOSTINGER INTEGRATION DEPLOYMENT TIPS BADGE */}
          <div className="max-w-xl mx-auto bg-black/60 border border-white/5 rounded-2xl p-4 text-left space-y-2">
            <span className="text-[9px] font-mono text-brand-green uppercase tracking-wider font-bold block">
              💡 Guia de Publicação no Domínio wolkstore.shop (Hostinger)
            </span>
            <p className="text-[10px] text-zinc-400 leading-normal">
              Como você já possui o domínio <strong>wolkstore.shop</strong> na Hostinger, você pode integrá-lo de forma extremamente simples:
            </p>
            <ul className="list-disc list-inside text-[10px] text-zinc-500 space-y-1">
              <li>No painel da Hostinger, acesse as configurações de DNS do domínio.</li>
              <li>Crie um registro do tipo <strong>CNAME</strong> ou <strong>A</strong> apontando para o servidor ou container onde este app está publicado (por exemplo, as URLs do Google Cloud Run disponibilizadas em nossa plataforma).</li>
              <li>A integração com Firebase Autenticação e Firestore funcionará automaticamente no domínio customizado, sem necessidade de alterar nada no código!</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
