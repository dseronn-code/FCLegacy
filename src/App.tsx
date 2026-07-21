import React, { useState, useEffect, FormEvent } from "react";
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
  FileJson,
  Pencil,
  X,
  Settings
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PlayerProfile, GenerationParams, PlayerCareer, Match, SeasonHistory, ChampionshipStat } from "./types";
import { mockTomasDuarte } from "./mockData";
import { auth, db } from "./firebase";
import { InteractiveQuestionnaire } from "./components/InteractiveQuestionnaire";
import { UsernameSetupModal } from "./components/UsernameSetupModal";
import { LeaderboardTable } from "./components/LeaderboardTable";
import { UpgradeModal } from "./components/UpgradeModal";
import { AdminDashboard } from "./components/AdminDashboard";
import { ReactivationPanel } from "./components/ReactivationPanel";
import { SettingsModal } from "./components/SettingsModal";
import { AdSenseBlock } from "./components/AdSenseBlock";
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
  updateDoc,
  deleteDoc,
  onSnapshot
} from "firebase/firestore";

export default function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);

  // Email verification system state
  const [verificationStep, setVerificationStep] = useState<"form" | "code_verification">("form");
  const [verificationCodeInput, setVerificationCodeInput] = useState<string>("");
  const [codeDigits, setCodeDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [verificationErrorShake, setVerificationErrorShake] = useState<boolean>(false);
  const [verificationLoading, setVerificationLoading] = useState<boolean>(false);
  const [verificationDebugCode, setVerificationDebugCode] = useState<string | null>(null);
  const [verificationSuccessMessage, setVerificationSuccessMessage] = useState<string | null>(null);

  // Career and Player State
  const [career, setCareer] = useState<PlayerCareer | null>(null);
  const [careerLoading, setCareerLoading] = useState<boolean>(false);
  const [careersList, setCareersList] = useState<PlayerCareer[]>([]);
  const [showGenerator, setShowGenerator] = useState<boolean>(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  
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
  const [showFallbackAlert, setShowFallbackAlert] = useState<boolean>(false);

  // App Interface State
  const [copied, setCopied] = useState<boolean>(false);
  const [shareCopied, setShareCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [activeLayoutTab, setActiveLayoutTab] = useState<"dashboard" | "leaderboard">("dashboard");
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

  // Match Editing State
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editChamp, setEditChamp] = useState<string>("");
  const [editPD, setEditPD] = useState<number>(0);
  const [editPE, setEditPE] = useState<number>(0);
  const [editDA, setEditDA] = useState<number>(0);
  const [editFA, setEditFA] = useState<number>(0);
  const [editSA, setEditSA] = useState<number>(0);
  const [editPG, setEditPG] = useState<number>(0);

  // Season Progression Modal/State
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [transferClub, setTransferClub] = useState<string>("");

  // Viewing Shared Profile State
  const [isSharedView, setIsSharedView] = useState<boolean>(false);
  const [sharedCareerError, setSharedCareerError] = useState<string | null>(null);

  // Username Mandate State
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [showUsernameModal, setShowUsernameModal] = useState<boolean>(false);

  // Monetization & Admin States
  const [upgradeModalOpen, setUpgradeModalOpen] = useState<{ open: boolean; type: "slot_limit" | "credit_limit" | "manual" }>({ open: false, type: "manual" });
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => {
    return localStorage.getItem("fc_legacy_banner_dismissed") === "true";
  });
  const [adminActive, setAdminActive] = useState<boolean>(false);
  const [reactivateActive, setReactivateActive] = useState<boolean>(false);
  const [reactivateToken, setReactivateToken] = useState<string | null>(null);
  const [systemConfig, setSystemConfig] = useState<{ proPrice: number; freeAiLimit: number; announcementBanner: string; showBanner: boolean }>({
    proPrice: 29.90,
    freeAiLimit: 3,
    announcementBanner: "🏆 FC LEGACY PRO LIBERADO: Crie biografias de atletas ilimitadas, use os Temas Ouro Ultimate e Champions League, e ganhe o Verificado PRO dourado!",
    showBanner: true
  });

  useEffect(() => {
    fetch("/api/system-config")
      .then(r => r.json())
      .then(data => {
        if (data && data.proPrice !== undefined) {
          setSystemConfig(data);
        }
      })
      .catch(err => console.error("Erro ao carregar system-config:", err));
  }, []);

  // Synchronize Google AdSense based on real-time PRO status
  useEffect(() => {
    const isPro = userProfile?.isPro || false;
    
    // Always persist state to localStorage for the instantaneous head bootstrap check on fresh reload
    localStorage.setItem("fcl_is_pro", isPro ? "true" : "false");
    
    const scriptId = "google-adsense-script";
    const existingScript = document.getElementById(scriptId);

    if (isPro) {
      if (existingScript) {
        existingScript.remove();
        console.log("[AdSense] Removed AdSense script since user is PRO.");
      }
      
      // Remove any existing ad blocks or auto-inserted ad elements to keep PRO interface clean
      try {
        const adElements = document.querySelectorAll("ins.adsbygoogle, .google-auto-placed, iframe[id^='aswift_']");
        adElements.forEach(el => el.remove());
      } catch (e) {
        console.warn("[AdSense] Error removing ad elements:", e);
      }
    } else {
      // For Free users or guests, load the script if it was not bootstrapped or was removed
      if (!existingScript) {
        console.log("[AdSense] Appending AdSense script for Free/Guest user.");
        const script = document.createElement("script");
        script.id = scriptId;
        script.async = true;
        script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4462510831945022";
        script.setAttribute("crossorigin", "anonymous");
        document.head.appendChild(script);
      }
    }
  }, [userProfile?.isPro]);

  // Import JSON State
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importJsonText, setImportJsonText] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);

  const handleViewSharedProfile = (playerId: string) => {
    const newUrl = `${window.location.origin}/?player=${playerId}`;
    window.history.pushState({ player: playerId }, "", newUrl);
    loadCareerProfileById(playerId, currentUser?.uid);
  };

  // Check for shared player ID in URL on load
  const loadCareerProfileById = async (sharedPlayerId: string, currentUserId?: string) => {
    setIsSharedView(true);
    setCareerLoading(true);
    setSharedCareerError(null);
    try {
      const url = currentUserId 
        ? `/api/careers/${sharedPlayerId}?requesterId=${currentUserId}` 
        : `/api/careers/${sharedPlayerId}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setCareer(data);
      } else {
        const errData = await res.json();
        setSharedCareerError(errData.error || "Acesso negado: Este legado de carreira é privado ou inexistente.");
      }
    } catch (err) {
      console.error(err);
      setSharedCareerError("Ocorreu um erro ao consultar o legado de carreira.");
    } finally {
      setCareerLoading(false);
    }
  };

  useEffect(() => {
    const checkSharedProfile = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const sharedPlayerId = urlParams.get("player");
      if (sharedPlayerId) {
        const currentUid = auth.currentUser?.uid;
        loadCareerProfileById(sharedPlayerId, currentUid);
      }
    };
    checkSharedProfile();
  }, []);

  // Listen for admin & reactivation path directly in URL
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token");

      if (path === "/admin" || path === "/admin/") {
        setAdminActive(true);
        setReactivateActive(false);
      } else if (path === "/reativar" || path === "/reativar/") {
        setAdminActive(false);
        setReactivateActive(true);
        if (token) {
          setReactivateToken(token);
        }
      } else {
        setAdminActive(false);
        setReactivateActive(false);
      }
    };

    handleLocationChange();

    window.addEventListener("popstate", handleLocationChange);
    const interval = setInterval(handleLocationChange, 1000);

    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      clearInterval(interval);
    };
  }, []);

  // Listen to Auth State Changes
  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Check if we are in shared view mode; if so, do not automatically fetch owned career
      const urlParams = new URLSearchParams(window.location.search);
      const isShared = !!urlParams.get("player");

      if (user) {
        setCareerLoading(true);
        localStorage.removeItem("is_guest_session");
        setCurrentUser(user);

        // Fetch user profile in real-time to enforce username and monetization properties
        if (profileUnsubscribe) profileUnsubscribe();
        profileUnsubscribe = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
          if (docSnap.exists()) {
            const udata = docSnap.data();
            setUserProfile(udata);
            if (!udata || !udata.hasSetupUsername) {
              setShowUsernameModal(true);
            } else {
              setShowUsernameModal(false);
            }
          } else {
            setShowUsernameModal(true);
          }
        }, (err) => {
          console.error("Erro no onSnapshot do perfil:", err);
        });

        if (isShared) {
          setCareerLoading(false);
          setAuthLoading(false);
          return;
        }

        try {
          // Query user's careers
          const q = query(collection(db, "careers"), where("userId", "==", user.uid));
          const querySnapshot = await getDocs(q);
          const list: PlayerCareer[] = [];
          querySnapshot.forEach((docSnap) => {
            list.push(docSnap.data() as PlayerCareer);
          });
          
          // Sort by updatedAt or createdAt desc
          list.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
          
          setCareersList(list);
          if (list.length > 0) {
            const savedActiveId = localStorage.getItem(`active_career_id_${user.uid}`);
            const found = list.find(c => c.id === savedActiveId);
            setCareer(found || list[0]);
          } else {
            setCareer(null);
          }
        } catch (err) {
          console.error("Error loading user career:", err);
        } finally {
          setCareerLoading(false);
          setAuthLoading(false);
        }
      } else {
        const wasGuest = localStorage.getItem("is_guest_session") === "true";
        if (wasGuest) {
          setCurrentUser({
            uid: "guest_user",
            email: "jogador.convidado@offline.com",
            displayName: "Jogador Convidado"
          } as FirebaseUser);
          setAuthLoading(false);
          setShowUsernameModal(false);
          
          if (isShared) return;

          // Load local career list
          const savedListLocal = localStorage.getItem("guest_careers_list");
          let list: PlayerCareer[] = [];
          if (savedListLocal) {
            try {
              list = JSON.parse(savedListLocal);
            } catch (e) {
              list = [];
            }
          } else {
            // Migrated from legacy single career to multiple careers list
            const legacyCareer = localStorage.getItem("guest_career");
            if (legacyCareer) {
              try {
                const parsed = JSON.parse(legacyCareer);
                list = [parsed];
                localStorage.setItem("guest_careers_list", JSON.stringify(list));
              } catch (e) {
                list = [];
              }
            }
          }
          setCareersList(list);
          if (list.length > 0) {
            const savedActiveId = localStorage.getItem("guest_active_career_id");
            const found = list.find(c => c.id === savedActiveId);
            setCareer(found || list[0]);
          } else {
            setCareer(null);
          }
        } else {
          setCurrentUser(null);
          setCareer(null);
          setCareersList([]);
          setAuthLoading(false);
          setShowUsernameModal(false);
        }
      }
    });

    return () => {
      unsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  // Helper to save career state to Firestore
  const saveCareerToCloud = async (updatedCareer: PlayerCareer) => {
    if (!currentUser || isSharedView) return;
    if (currentUser.uid === "guest_user") {
      const updatedList = careersList.map(c => c.id === updatedCareer.id ? updatedCareer : c);
      if (!updatedList.some(c => c.id === updatedCareer.id)) {
        updatedList.push(updatedCareer);
      }
      localStorage.setItem("guest_careers_list", JSON.stringify(updatedList));
      localStorage.setItem("guest_active_career_id", updatedCareer.id);
      localStorage.setItem("guest_career", JSON.stringify(updatedCareer));
      
      setCareersList(updatedList);
      setCareer(updatedCareer);
      return;
    }
    try {
      const isPro = userProfile?.isPro || false;
      const extraSlots = userProfile?.extraSlots || 0;
      const maxSlots = isPro ? 999 : (3 + extraSlots);

      const exists = careersList.some(c => c.id === updatedCareer.id);
      if (!exists && careersList.length >= maxSlots) {
        setUpgradeModalOpen({ open: true, type: "slot_limit" });
        return;
      }

      // Sync user profile properties directly onto the career object
      const isBoosted = !!(userProfile?.boostedUntil && new Date(userProfile.boostedUntil) > new Date());
      const finalizedCareer = {
        ...updatedCareer,
        isPro,
        isBoosted,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "careers", finalizedCareer.id), finalizedCareer);
      setCareer(finalizedCareer);
      localStorage.setItem(`active_career_id_${currentUser.uid}`, finalizedCareer.id);
      setCareersList(prev => {
        const alreadyInList = prev.some(c => c.id === finalizedCareer.id);
        if (alreadyInList) {
          return prev.map(c => c.id === finalizedCareer.id ? finalizedCareer : c);
        } else {
          return [finalizedCareer, ...prev];
        }
      });
    } catch (err) {
      console.error("Erro ao salvar carreira no Firestore:", err);
    }
  };

  const handleDeleteCareer = async (careerId: string) => {
    if (!currentUser || isSharedView) return;
    setDeleteError(null);
    setDeleteSuccess(null);

    if (currentUser.uid === "guest_user") {
      try {
        const updatedList = careersList.filter(c => c.id !== careerId);
        localStorage.setItem("guest_careers_list", JSON.stringify(updatedList));
        setCareersList(updatedList);
        localStorage.removeItem("guest_career"); // Clean single backup so legacy check doesn't restore it

        if (career?.id === careerId) {
          const next = updatedList[0] || null;
          setCareer(next);
          if (next) {
            localStorage.setItem("guest_active_career_id", next.id);
          } else {
            localStorage.removeItem("guest_active_career_id");
          }
        }
        setDeleteConfirmId(null);
        setDeleteSuccess("Atleta da carreira offline deletado com sucesso!");
        setTimeout(() => setDeleteSuccess(null), 4000);
      } catch (err: any) {
        setDeleteError("Erro ao apagar atleta local: " + (err.message || err));
        setTimeout(() => setDeleteError(null), 4000);
      }
      return;
    }

    try {
      await deleteDoc(doc(db, "careers", careerId));
      
      const updatedList = careersList.filter(c => c.id !== careerId);
      setCareersList(updatedList);
      if (career?.id === careerId) {
        const next = updatedList[0] || null;
        setCareer(next);
        if (next) {
          localStorage.setItem(`active_career_id_${currentUser.uid}`, next.id);
        } else {
          localStorage.removeItem(`active_career_id_${currentUser.uid}`);
        }
      }
      setDeleteConfirmId(null);
      setDeleteSuccess("Atleta deletado com sucesso do servidor de legado!");
      setTimeout(() => setDeleteSuccess(null), 4000);
    } catch (err: any) {
      console.error("Erro ao deletar carreira:", err);
      setDeleteError("Não foi possível excluir o atleta. Verifique suas regras ou conexão com o servidor.");
      setTimeout(() => setDeleteError(null), 4000);
    }
  };

  // Protection 'beforeunload' for desktop tab-closing prevention during verification
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (authMode === "register" && verificationStep === "code_verification") {
        e.preventDefault();
        e.returnValue = "Você tem certeza que deseja sair? O processo de verificação de cadastro será cancelado e o código expirará.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [authMode, verificationStep]);

  // Auth Actions
  const handleSendCode = async () => {
    setAuthError(null);
    setVerificationSuccessMessage(null);
    setVerificationDebugCode(null);
    setCodeDigits(["", "", "", "", "", ""]);
    setVerificationCodeInput("");
    
    if (!email || !password) {
      setAuthError("Por favor, preencha todos os campos.");
      return;
    }

    if (password.length < 6) {
      setAuthError("A senha precisa ter no mínimo 6 caracteres.");
      return;
    }

    setVerificationLoading(true);
    try {
      const response = await fetch("/api/send-verification-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao enviar código de verificação.");
      }

      setVerificationStep("code_verification");
      setVerificationSuccessMessage(data.message);
      
      if (data.debugMode && data.code) {
        setVerificationDebugCode(data.code);
        const digits = data.code.split("").slice(0, 6);
        while (digits.length < 6) digits.push("");
        setCodeDigits(digits);
        setVerificationCodeInput(data.code);
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || "Erro de processamento.");
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleResendCode = async () => {
    setAuthError(null);
    setVerificationSuccessMessage(null);
    setVerificationDebugCode(null);
    setCodeDigits(["", "", "", "", "", ""]);
    setVerificationCodeInput("");
    
    if (!email) {
      setAuthError("E-mail não informado.");
      return;
    }

    setVerificationLoading(true);
    try {
      const response = await fetch("/api/resend-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao reenviar código.");
      }

      setVerificationSuccessMessage(data.message);
      
      if (data.debugMode && data.code) {
        setVerificationDebugCode(data.code);
        const digits = data.code.split("").slice(0, 6);
        while (digits.length < 6) digits.push("");
        setCodeDigits(digits);
        setVerificationCodeInput(data.code);
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || "Erro no reenvio do código.");
    } finally {
      setVerificationLoading(false);
    }
  };

  const submitVerificationCode = async (codeToVerify: string) => {
    setAuthError(null);
    setVerificationSuccessMessage(null);
    setVerificationLoading(true);
    setVerificationErrorShake(false);

    try {
      // 1. Verify code on server
      const verifyRes = await fetch("/api/verify-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, code: codeToVerify }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "Código inválido ou expirado.");
      }

      // 2. Register user in Firebase Auth
      await createUserWithEmailAndPassword(auth, email, password);
      
      // Reset verification state upon success
      setVerificationStep("form");
      setVerificationCodeInput("");
      setCodeDigits(["", "", "", "", "", ""]);
      setVerificationDebugCode(null);
    } catch (err: any) {
      console.error(err);
      // Trigger error feedback: clear inputs and shake
      setCodeDigits(["", "", "", "", "", ""]);
      setVerificationCodeInput("");
      setVerificationErrorShake(true);
      setTimeout(() => {
        setVerificationErrorShake(false);
      }, 1000);

      if (err.code === "auth/email-already-in-use") {
        setAuthError("Este e-mail já está sendo utilizado por outra conta.");
      } else if (err.code === "auth/weak-password") {
        setAuthError("A senha precisa ter no mínimo 6 caracteres.");
      } else {
        setAuthError(err.message || "Erro ao verificar ou cadastrar.");
      }
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleDigitChange = (value: string, index: number) => {
    const cleanValue = value.replace(/\D/g, "");
    if (!cleanValue) {
      const newDigits = [...codeDigits];
      newDigits[index] = "";
      setCodeDigits(newDigits);
      setVerificationCodeInput(newDigits.join(""));
      return;
    }

    const singleDigit = cleanValue[cleanValue.length - 1]; // take the last typed character
    const newDigits = [...codeDigits];
    newDigits[index] = singleDigit;
    setCodeDigits(newDigits);

    const fullCode = newDigits.join("");
    setVerificationCodeInput(fullCode);

    // Auto focus next input
    if (index < 5 && singleDigit) {
      const nextInput = document.getElementById(`digit-input-${index + 1}`) as HTMLInputElement | null;
      nextInput?.focus();
    }

    // Auto submit if 6th digit filled
    if (fullCode.length === 6) {
      submitVerificationCode(fullCode);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace") {
      if (!codeDigits[index] && index > 0) {
        // focus previous input and clear it
        const prevInput = document.getElementById(`digit-input-${index - 1}`) as HTMLInputElement | null;
        prevInput?.focus();
        const newDigits = [...codeDigits];
        newDigits[index - 1] = "";
        setCodeDigits(newDigits);
        setVerificationCodeInput(newDigits.join(""));
      } else {
        const newDigits = [...codeDigits];
        newDigits[index] = "";
        setCodeDigits(newDigits);
        setVerificationCodeInput(newDigits.join(""));
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      const prevInput = document.getElementById(`digit-input-${index - 1}`) as HTMLInputElement | null;
      prevInput?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      const nextInput = document.getElementById(`digit-input-${index + 1}`) as HTMLInputElement | null;
      nextInput?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim();
    const digitsOnly = pastedData.replace(/\D/g, "").slice(0, 6);
    if (digitsOnly.length > 0) {
      const newDigits = digitsOnly.split("");
      while (newDigits.length < 6) {
        newDigits.push("");
      }
      setCodeDigits(newDigits);
      const fullCode = newDigits.join("");
      setVerificationCodeInput(fullCode);

      // Focus appropriate input box
      const focusIndex = Math.min(digitsOnly.length, 5);
      const targetInput = document.getElementById(`digit-input-${focusIndex}`) as HTMLInputElement | null;
      targetInput?.focus();

      // Auto submit if code is complete
      if (digitsOnly.length === 6) {
        submitVerificationCode(digitsOnly);
      }
    }
  };

  const handleVerifyAndRegister = async (e: FormEvent) => {
    e.preventDefault();
    const finalCode = codeDigits.join("");
    if (finalCode.length < 6) {
      setAuthError("Por favor, preencha todos os 6 dígitos do código.");
      return;
    }
    await submitVerificationCode(finalCode);
  };

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setVerificationSuccessMessage(null);

    if (!email || !password) {
      setAuthError("Por favor, preencha todos os campos.");
      return;
    }

    if (authMode === "login") {
      setVerificationLoading(true);
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err: any) {
        console.error(err);
        if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
          setAuthError("E-mail ou senha incorretos.");
        } else {
          setAuthError(err.message || "Erro na autenticação.");
        }
      } finally {
        setVerificationLoading(false);
      }
    } else {
      // If we are in register mode, we need to send the code first!
      await handleSendCode();
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

  // Generate Career AI Core Helper
  const handleGenerateAIForQuestionnaire = async (generationParams: GenerationParams): Promise<PlayerProfile | null> => {
    setGenerationLoading(true);
    setGenerationError(null);
    try {
      const response = await fetch("/api/generate-player", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...generationParams,
          userId: currentUser?.uid
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        if (errData.error === "AI_LIMIT_REACHED") {
          setUpgradeModalOpen({ open: true, type: "credit_limit" });
          throw new Error("Você atingiu o limite de gerações de IA. Faça upgrade para o FC Legacy PRO para obter acesso ilimitado!");
        }
        throw new Error(errData.error || "Erro ao consultar gerador de IA.");
      }

      const playerProfile = (await response.json()) as PlayerProfile;
      return playerProfile;
    } catch (err: any) {
      console.error(err);
      setGenerationError(err.message || "Erro de processamento com o servidor.");
      return null;
    } finally {
      setGenerationLoading(false);
    }
  };

  // Complete Questionnaire & Save Career Legacy
  const handleCompleteQuestionnaire = async (careerData: Partial<PlayerCareer>) => {
    if (!currentUser) return;
    const newCareerId = currentUser.uid + "_" + Date.now();
    const newCareer: PlayerCareer = {
      id: newCareerId,
      userId: currentUser.uid,
      userEmail: currentUser.email || "",
      trainerUsername: userProfile?.username || currentUser.email?.split("@")[0] || "Treinador",
      profile: careerData.profile!,
      isPublic: careerData.isPublic ?? true,
      currentClub: careerData.currentClub!,
      currentSeason: 1,
      championships: careerData.championships!,
      matches: [],
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveCareerToCloud(newCareer);
    setShowGenerator(false);
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

  // Start editing a match
  const handleStartEditMatch = (m: Match) => {
    setEditingMatch(m);
    setEditChamp(m.championship);
    setEditPD(m.goalDetails?.pd ?? 0);
    setEditPE(m.goalDetails?.pe ?? 0);
    setEditDA(m.goalDetails?.da ?? 0);
    setEditFA(m.goalDetails?.fa ?? 0);
    setEditSA(m.goalDetails?.sa ?? 0);
    setEditPG(m.assists ?? 0);
  };

  // Save edited match
  const handleSaveEditedMatch = () => {
    if (!career || !editingMatch || isSharedView) return;

    const goalsSum = editPD + editPE;
    
    // Construct Match Log text: (1 G | 1 PD | 1 DA | SA | PG)
    const logs: string[] = [];
    if (goalsSum > 0) {
      logs.push(`${goalsSum} G`);
      if (editPD > 0) logs.push(`${editPD} PD`);
      if (editPE > 0) logs.push(`${editPE} PE`);
      if (editDA > 0) logs.push(`${editDA} DA`);
      if (editFA > 0) logs.push(`${editFA} FA`);
      if (editSA > 0) {
        logs.push(`${editSA} SA`);
      } else {
        logs.push(`A`);
      }
    }
    if (editPG > 0) {
      logs.push(`${editPG} PG`);
    }

    const logText = logs.length > 0 ? logs.join(" | ") : "Partida Disputada (Sem G/PG)";

    // Calculate dynamic xG: 0.35 per DA, 0.12 per FA, plus 0.15 for assists (PG), or 0.1 baseline
    const calculatedXg = Number(((editDA * 0.35) + (editFA * 0.12) + (editPG * 0.15) + (goalsSum === 0 ? 0.05 : 0)).toFixed(2));

    const updatedMatch: Match = {
      ...editingMatch,
      championship: editChamp,
      goals: goalsSum,
      assists: editPG,
      goalDetails: {
        pd: editPD,
        pe: editPE,
        da: editDA,
        fa: editFA,
        sa: editSA,
        a: goalsSum - editSA > 0 ? goalsSum - editSA : 0
      },
      logText,
      xg: calculatedXg,
    };

    const updated = {
      ...career,
      matches: career.matches.map(m => m.id === editingMatch.id ? updatedMatch : m),
      updatedAt: new Date().toISOString()
    };

    saveCareerToCloud(updated);
    setEditingMatch(null);
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

  const loadRandomPreset = async () => {
    let chosenName = "";
    let chosenNationality = "";
    let chosenPosition = "";
    let chosenClub = "";
    let chosenPersonality = "";

    try {
      const res = await fetch("/api/random-preset");
      if (res.ok) {
        const data = await res.json();
        if (data && data.suggestedName) {
          chosenName = data.suggestedName;
          chosenNationality = data.nationality;
          chosenPosition = data.position;
          chosenClub = data.preferredClub;
          chosenPersonality = data.personalityType;
        }
      }
    } catch (err) {
      console.error("Erro ao carregar preset aleatório com a IA:", err);
    }

    if (!chosenName) {
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
      chosenNationality = fallbackNationalities[Math.floor(Math.random() * fallbackNationalities.length)];
      const namesList = fallbackNamesByNationality[chosenNationality];
      chosenName = namesList[Math.floor(Math.random() * namesList.length)];

      const fallbackPositions = ["Ponta Esquerda", "Ponta Direita", "Centroavante", "Meio-campista Armador", "Segundo Volante", "Zagueiro Imperial", "Lateral Ofensivo"];
      chosenPosition = fallbackPositions[Math.floor(Math.random() * fallbackPositions.length)];

      const fallbackClubs = [
        "Real Madrid CF", "FC Barcelona", "Manchester City FC", "Paris Saint-Germain", 
        "Juventus FC", "FC Bayern München", "Arsenal FC", "Liverpool FC", "AC Milan", "Inter de Milão", "Atlético de Madrid",
        "Palmeiras", "Flamengo", "Vasco da Gama", "Cruzeiro", "Grêmio", "Internacional", "Fluminense", "São Paulo FC"
      ];
      chosenClub = fallbackClubs[Math.floor(Math.random() * fallbackClubs.length)];

      const fallbackPersonalities = ["Marrento & Confiante", "Ousado & Provocador", "Bad Boy", "Focado & Frio", "Líder Nato", "Cria de Favela"];
      chosenPersonality = fallbackPersonalities[Math.floor(Math.random() * fallbackPersonalities.length)];
    }

    setParams({
      suggestedName: chosenName,
      nationality: chosenNationality,
      position: chosenPosition,
      preferredClub: chosenClub,
      personalityType: chosenPersonality,
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
        trainerUsername: userProfile?.username || currentUser.email?.split("@")[0] || "Treinador",
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
      setShowGenerator(false);
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
  if (authLoading || careerLoading) {
    return (
      <div className="min-h-screen bg-[#050505] text-[#e0e0e0] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-12 h-12 text-brand-green animate-spin mb-4" />
        <p className="font-mono text-xs text-brand-green uppercase tracking-widest animate-pulse">
          FCLegacy // Carregando Legado...
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
      {/* GLOBAL ANNOUNCEMENT BANNER */}
      {systemConfig?.showBanner && systemConfig?.announcementBanner && !bannerDismissed && (
        <div className="bg-gradient-to-r from-yellow-400/10 via-brand-green/20 to-amber-500/10 border-b border-brand-green/20 py-2 sm:py-2.5 px-4 text-center text-[10px] sm:text-xs text-zinc-200 font-mono relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
          <span className="inline-flex items-center gap-1.5 leading-none flex-wrap justify-center pr-8">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400/20 animate-pulse shrink-0" />
            <span>{systemConfig.announcementBanner}</span>
          </span>
          <button 
            onClick={() => {
              setBannerDismissed(true);
              localStorage.setItem("fc_legacy_banner_dismissed", "true");
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-1 hover:bg-white/5 rounded-md transition-all cursor-pointer"
            title="Fechar"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* HEADER SECTION */}
      <header className="border-b border-white/5 bg-[#0a0a0c]/90 backdrop-blur-md sticky top-0 z-50 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#121215] to-[#ccff00]/10 border border-brand-green/30 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-brand-green" />
            </div>
            <div>
              <span className="text-[9px] font-mono text-brand-green tracking-widest uppercase block">
                PLATFORM // FCLegacy
              </span>
              <h1 className="font-display font-black text-xl tracking-tighter text-white uppercase">
                FC<span className="text-brand-green">LEGACY</span>
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0">
            {/* Shared view badge */}
            {isSharedView && (
              <div className="px-3 py-1 bg-brand-green/10 border border-brand-green/20 rounded-full text-[10px] text-brand-green font-mono uppercase font-bold tracking-wider animate-pulse flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5" />
                Modo de Visualização Compartilhada
              </div>
            )}

            {/* Auth status and logout */}
            {currentUser ? (
              <div className="flex items-center gap-3 ml-auto sm:ml-0 flex-wrap sm:flex-nowrap">
                {/* PRO Plan Activation / Badge */}
                {userProfile?.isPro ? (
                  <span className="px-2.5 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-[9px] font-mono text-yellow-400 font-bold uppercase tracking-wider flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.15)]">
                    <Sparkles className="w-3 h-3 fill-yellow-400 animate-pulse" />
                    FCLegacy PRO
                  </span>
                ) : (
                  <button
                    onClick={() => setUpgradeModalOpen({ open: true, type: "manual" })}
                    className="px-3 py-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black font-display font-black uppercase tracking-wider rounded-xl text-[10px] sm:text-xs transition-all shadow-[0_0_12px_rgba(234,179,8,0.25)] hover:shadow-[0_0_15px_rgba(234,179,8,0.35)] active:scale-97 cursor-pointer flex items-center gap-1 shrink-0 animate-pulse"
                  >
                    <Sparkles className="w-3.5 h-3.5 fill-black" />
                    Seja PRO
                  </button>
                )}

                <div className="text-right hidden sm:block">
                  <p className="text-[9px] font-mono text-zinc-500 uppercase">Treinador</p>
                  <p className="text-xs font-bold text-white max-w-[120px] truncate">{userProfile?.username || currentUser.email?.split("@")[0] || "Treinador"}</p>
                </div>

                {/* Settings Gear Button */}
                <button
                  onClick={() => setSettingsModalOpen(true)}
                  title="Configurações da Conta"
                  className="p-2.5 bg-[#111113] hover:bg-white/5 border border-white/5 hover:border-zinc-700 rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer"
                >
                  <Settings className="w-4 h-4" />
                </button>

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
      {!currentUser && !isSharedView && !reactivateActive ? (
        <main className="max-w-md w-full mx-auto px-4 py-12 flex-1 flex flex-col justify-center">
          <div className="bg-[#0c0c0e] border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-green via-yellow-400 to-brand-green"></div>
            
            <div className="text-center mb-8">
              <Trophy className="w-12 h-12 text-brand-green mx-auto mb-4" />
              <h2 className="font-display font-black text-2xl text-white uppercase tracking-tight">
                FC<span className="text-brand-green">LEGACY</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Crie sua conta para gerar, salvar e compartilhar os legados e as estatísticas dos seus jogadores fictícios no site oficial <span className="text-brand-green font-bold">wolkstore.shop</span>.
              </p>
            </div>

            {reactivateActive && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-2xl flex items-start gap-3 mb-6 text-left animate-fadeIn">
                <Sparkles className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <p className="text-[11px] font-mono font-bold text-yellow-300 uppercase">Reativação Simplificada Ativa</p>
                  <p className="text-[10px] text-zinc-400 leading-relaxed mt-0.5">
                    Você acessou um link seguro de reativação PRO. Por favor, <strong>faça login com o e-mail que recebeu o aviso</strong> para prosseguir de forma simplificada.
                  </p>
                </div>
              </div>
            )}

            {authMode === "register" && verificationStep === "code_verification" ? (
              <form onSubmit={handleVerifyAndRegister} className="space-y-4">
                <div className="text-center p-4 bg-brand-green/10 border border-brand-green/20 rounded-2xl mb-4">
                  <p className="text-xs text-brand-green font-mono uppercase tracking-wider font-bold">Verifique seu E-mail</p>
                  <p className="text-[11px] text-zinc-300 mt-1.5 leading-relaxed">
                    Enviamos um código de verificação para <strong className="text-white">{email}</strong>. Por favor, insira o código de 6 dígitos abaixo.
                  </p>
                </div>

                {verificationSuccessMessage && (
                  <div className="p-3 bg-brand-green/10 border border-brand-green/20 text-brand-green text-xs rounded-xl leading-normal text-center font-mono">
                    {verificationSuccessMessage}
                  </div>
                )}

                {verificationDebugCode && (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs rounded-xl leading-normal text-center font-mono">
                    <p className="font-bold uppercase tracking-wider text-[10px] text-yellow-500 mb-1">🎮 MODO DE TESTES ATIVO (Sem SMTP)</p>
                    Código gerado: <strong className="text-white text-base tracking-widest block mt-1">{verificationDebugCode}</strong>
                    <button 
                      type="button" 
                      onClick={() => {
                        setVerificationCodeInput(verificationDebugCode);
                        const digits = verificationDebugCode.split("").slice(0, 6);
                        while (digits.length < 6) digits.push("");
                        setCodeDigits(digits);
                        submitVerificationCode(verificationDebugCode);
                      }}
                      className="mt-2 text-[9px] px-2.5 py-1 bg-yellow-500/20 hover:bg-yellow-500/35 text-white rounded font-bold transition-all cursor-pointer"
                    >
                      Preencher e confirmar automaticamente
                    </button>
                  </div>
                )}

                <div>
                  <style dangerouslySetInnerHTML={{__html: `
                    @keyframes shake {
                      0%, 100% { transform: translateX(0); }
                      10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
                      20%, 40%, 60%, 80% { transform: translateX(6px); }
                    }
                    .animate-shake {
                      animation: shake 0.6s ease-in-out;
                    }
                    .flash-error {
                      animation: flashRed 1s infinite alternate;
                    }
                    @keyframes flashRed {
                      from { border-color: rgba(239, 68, 68, 0.2); box-shadow: 0 0 0 rgba(239, 68, 68, 0); }
                      to { border-color: rgba(239, 68, 68, 1); box-shadow: 0 0 8px rgba(239, 68, 68, 0.4); }
                    }
                  `}} />
                  
                  <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-3 font-bold text-center">
                    Código de 6 Dígitos
                  </label>
                  
                  <div className={`flex justify-between items-center gap-2 max-w-sm mx-auto ${verificationErrorShake ? "animate-shake" : ""}`}>
                    {codeDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        id={`digit-input-${idx}`}
                        type="text"
                        maxLength={1}
                        value={digit}
                        autoFocus={idx === 0}
                        onChange={(e) => handleDigitChange(e.target.value, idx)}
                        onKeyDown={(e) => handleKeyDown(e, idx)}
                        onPaste={handlePaste}
                        className={`w-12 h-14 text-center bg-black/50 border ${
                          verificationErrorShake 
                            ? "border-red-500 ring-1 ring-red-500 flash-error" 
                            : "border-white/10 focus:border-brand-green focus:ring-1 focus:ring-brand-green"
                        } rounded-xl text-xl font-bold text-white focus:outline-none transition-all font-mono`}
                      />
                    ))}
                  </div>
                  
                  {/* Shortcut email helpers */}
                  <div className="flex justify-center items-center gap-3 mt-5">
                    <a 
                      href="https://mail.google.com" 
                      target="_blank" 
                      rel="noreferrer"
                      className="px-3.5 py-1.5 bg-[#ea4335]/10 hover:bg-[#ea4335]/20 border border-[#ea4335]/20 hover:border-[#ea4335]/40 rounded-lg text-[11px] text-[#ea4335] font-semibold flex items-center gap-1.5 transition-all"
                    >
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                      </svg>
                      Abrir Gmail
                    </a>
                    <a 
                      href="https://outlook.live.com" 
                      target="_blank" 
                      rel="noreferrer"
                      className="px-3.5 py-1.5 bg-[#0078d4]/10 hover:bg-[#0078d4]/20 border border-[#0078d4]/20 hover:border-[#0078d4]/40 rounded-lg text-[11px] text-[#0078d4] font-semibold flex items-center gap-1.5 transition-all"
                    >
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11H6V6h12v8z"/>
                      </svg>
                      Abrir Outlook
                    </a>
                  </div>
                </div>

                {authError && (
                  <div className="p-3.5 bg-red-950/30 border border-red-500/20 rounded-xl text-red-200 text-[11px] leading-normal text-center">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={verificationLoading}
                  className="w-full py-3.5 bg-brand-green hover:bg-[#d9ff33] text-black font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 active:scale-97 glow-green cursor-pointer disabled:opacity-50"
                >
                  {verificationLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar Código e Registrar
                    </>
                  )}
                </button>

                <div className="flex justify-between items-center pt-2 border-t border-white/5">
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={verificationLoading}
                    className="text-[11px] text-zinc-500 hover:text-brand-green font-mono transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Reenviar Código
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setVerificationStep("form");
                      setAuthError(null);
                      setVerificationSuccessMessage(null);
                    }}
                    disabled={verificationLoading}
                    className="text-[11px] text-zinc-500 hover:text-white font-mono transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Alterar E-mail
                  </button>
                </div>
              </form>
            ) : (
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
                  disabled={verificationLoading}
                  className="w-full py-3.5 bg-brand-green hover:bg-[#d9ff33] text-black font-display font-black uppercase tracking-wider rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 active:scale-97 glow-green cursor-pointer disabled:opacity-50"
                >
                  {verificationLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                  {authMode === "login" 
                    ? (verificationLoading ? "Autenticando..." : "Entrar na Arena") 
                    : (verificationLoading ? "Enviando Código..." : "Criar Novo Legado")}
                </button>
              </form>
            )}

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
                  setVerificationStep("form");
                  setVerificationCodeInput("");
                  setVerificationDebugCode(null);
                  setVerificationSuccessMessage(null);
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
      ) : reactivateActive ? (
        <ReactivationPanel
          currentUser={currentUser}
          token={reactivateToken}
          onClose={() => {
            setReactivateActive(false);
            window.history.pushState({}, "", "/");
          }}
        />
      ) : adminActive ? (
        (userProfile?.isAdmin || currentUser?.email === "dseronn@gmail.com") ? (
          <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
            <AdminDashboard adminUserId={currentUser.uid} onClose={() => {
              setAdminActive(false);
              window.history.pushState({}, "", "/");
            }} />
          </main>
        ) : (
          <main className="max-w-md mx-auto px-4 py-16 flex-1 w-full flex items-center justify-center animate-fadeIn">
            <div className="bg-[#08080a] border border-red-500/20 rounded-[32px] p-8 text-center space-y-4 shadow-2xl">
              <div className="mx-auto w-12 h-12 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center">
                <ShieldAlert className="w-6 h-6 animate-pulse" />
              </div>
              <h2 className="font-display font-black text-lg text-white uppercase tracking-tight">Acesso Restrito</h2>
              <p className="text-xs text-zinc-400 font-mono">
                Este painel de controle é restrito a administradores do FC Legacy.
              </p>
              <button
                onClick={() => {
                  setAdminActive(false);
                  window.history.pushState({}, "", "/");
                }}
                className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-zinc-300 hover:text-white font-mono font-bold uppercase rounded-xl text-xs transition-all cursor-pointer"
              >
                Voltar para o Início
              </button>
            </div>
          </main>
        )
      ) : (
        /* MAIN DASHBOARD INTERFACE */
        <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full space-y-6">

          {/* GOOGLE ADSENSE BANNER (EXCLUSIVE TO FREE USERS) */}
          {!userProfile?.isPro && (
            <div className="space-y-4">
              <div className="bg-[#0b0b0d] border border-white/5 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn relative overflow-hidden">
                <div className="absolute top-0 right-0 p-1.5 bg-yellow-400/5 rounded-bl-xl border-l border-b border-yellow-400/10">
                  <span className="text-[7px] font-mono text-yellow-400 font-black uppercase tracking-wider">Patrocinado</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-[8px] font-mono text-zinc-500 uppercase tracking-widest font-bold">Google AdSense</span>
                  <div>
                    <p className="text-[11px] text-zinc-300 font-mono font-bold uppercase">Publicidade de Parceiros FCLegacy</p>
                    <p className="text-[10px] text-zinc-400 leading-normal mt-0.5">Sua conta Free exibe anúncios de rede. Remova todos os anúncios, libere slots infinitos e tenha IA ilimitada com o <span className="text-yellow-400 font-bold">FC Legacy PRO</span>!</p>
                  </div>
                </div>
                <button
                  onClick={() => setUpgradeModalOpen({ open: true, type: "manual" })}
                  className="px-4 py-2 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black font-display font-black uppercase tracking-wider rounded-xl text-[10px] sm:text-xs transition-all cursor-pointer shrink-0 shadow-lg shadow-yellow-500/10 hover:shadow-yellow-500/20 active:scale-97"
                >
                  Remover Anúncios
                </button>
              </div>
              <AdSenseBlock />
            </div>
          )}

          {/* Fallback Warning Alert */}
          {showFallbackAlert && (
            <div className="bg-[#1c160c] border border-amber-500/20 rounded-3xl p-5 flex gap-4 text-amber-200 animate-fadeIn relative overflow-hidden">
              <div className="absolute top-0 left-0 bottom-0 w-1 bg-amber-500"></div>
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
              <div className="flex-1">
                <p className="font-display font-black uppercase text-amber-300 tracking-wider text-xs">
                  A Geração por IA Falhou (Modo Sem IA Ativado)
                </p>
                <p className="leading-relaxed mt-1 text-xs text-zinc-300">
                  A Inteligência Artificial falhou ou excedeu os limites de uso. O modo de geração local (sem IA) foi ativado automaticamente para garantir a criação do seu jogador fictício em 2026 com sucesso e sem nenhuma interrupção!
                </p>
              </div>
              <button 
                onClick={() => setShowFallbackAlert(false)}
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer self-start p-1 bg-white/5 hover:bg-white/10 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* SQUAD SELECTION / CAREER SELECTOR */}
          {!isSharedView && careersList.length > 0 && (
            <div id="career-selector-container" className="bg-[#0c0c0e] border border-white/5 rounded-3xl p-6 space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-brand-green/10 text-brand-green rounded-xl border border-brand-green/20">
                    <Compass className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <span className="text-[9px] font-mono text-brand-green uppercase tracking-widest block">
                      SELEÇÃO DE LEGADOS // CARREIRAS SALVAS
                    </span>
                    <h2 className="font-display font-black text-lg text-white uppercase italic tracking-tight">
                      Seletor de Elenco / Carreiras
                    </h2>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <button
                    onClick={() => {
                      setActiveLayoutTab(activeLayoutTab === "leaderboard" ? "dashboard" : "leaderboard");
                      setShowGenerator(false);
                    }}
                    className={`px-4 py-2 font-mono font-bold uppercase rounded-xl text-xs transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer w-full sm:w-auto border ${
                      activeLayoutTab === "leaderboard"
                        ? "bg-brand-green/20 border-brand-green/40 text-brand-green"
                        : "bg-zinc-900 hover:bg-zinc-800 text-white border-white/5"
                    }`}
                  >
                    <Trophy className="w-4 h-4 text-brand-green" />
                    Veja o Ranking
                  </button>

                  <button
                    id="btn-create-new-career"
                    onClick={() => {
                      const isPro = userProfile?.isPro || false;
                      const extraSlots = userProfile?.extraSlots || 0;
                      const maxSlots = isPro ? 999 : (3 + extraSlots);
                      if (careersList.length >= maxSlots) {
                        setUpgradeModalOpen({ open: true, type: "slot_limit" });
                      } else {
                        setShowGenerator(true);
                      }
                    }}
                    className="px-4 py-2 bg-brand-green hover:bg-[#d9ff33] text-black font-mono font-bold uppercase rounded-xl text-xs transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4" />
                    Criar Nova Carreira
                  </button>
                  
                  {career && (
                    deleteConfirmId === career.id ? (
                      <div className="flex items-center gap-2 bg-red-950/60 border border-red-500/40 p-1.5 px-3 rounded-xl w-full sm:w-auto justify-between">
                        <span className="text-[10px] font-mono text-red-200 font-bold uppercase animate-pulse">Deletar Atleta?</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            id="btn-confirm-delete-yes"
                            onClick={() => handleDeleteCareer(career.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-mono font-bold uppercase rounded-lg text-[10px] transition-all cursor-pointer"
                          >
                            Sim, Deletar
                          </button>
                          <button
                            id="btn-confirm-delete-cancel"
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono font-bold uppercase rounded-lg text-[10px] transition-all cursor-pointer"
                          >
                            Não
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        id="btn-delete-current-career"
                        onClick={() => setDeleteConfirmId(career.id)}
                        className="px-4 py-2 bg-red-950/40 border border-red-500/20 hover:border-red-500 text-red-200 hover:text-white font-mono font-bold uppercase rounded-xl text-xs transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer w-full sm:w-auto"
                      >
                        <Trash2 className="w-4 h-4" />
                        Deletar Atleta Atual
                      </button>
                    )
                  )}
                </div>
              </div>

              {deleteSuccess && (
                <div className="p-3.5 bg-brand-green/10 border border-brand-green/30 text-brand-green text-xs font-mono rounded-xl">
                  ✓ {deleteSuccess}
                </div>
              )}
              {deleteError && (
                <div className="p-3.5 bg-red-950/40 border border-red-500/20 text-red-200 text-xs font-mono rounded-xl">
                  ⚠ {deleteError}
                </div>
              )}

              {/* Grid of Careers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {careersList.map((c) => {
                  const isActive = career?.id === c.id;
                  
                  // Helper to get overall of this specific career
                  const getOverallFor = (pCareer: PlayerCareer) => {
                    let mCount = pCareer.matches?.length || 0;
                    let gCount = pCareer.matches?.reduce((acc, m) => acc + m.goals, 0) || 0;
                    let aCount = pCareer.matches?.reduce((acc, m) => acc + m.assists, 0) || 0;
                    let xgCount = pCareer.matches?.reduce((acc, m) => acc + m.xg, 0) || 0;

                    pCareer.history?.forEach(h => {
                      mCount += h.totalMatches;
                      gCount += h.totalGoals;
                      aCount += h.totalAssists;
                      xgCount += h.totalXg;
                    });

                    const bonusGoals = Math.min(Math.floor(gCount / 4), 10);
                    const bonusAssists = Math.min(Math.floor(aCount / 3), 5);
                    const bonusMatches = Math.min(Math.floor(mCount / 8), 2);
                    return Math.min(82 + bonusGoals + bonusAssists + bonusMatches, 99);
                  };

                  const ovr = getOverallFor(c);
                  
                  return (
                    <div
                      id={`career-item-${c.id}`}
                      key={c.id}
                      onClick={() => {
                        setCareer(c);
                        setShowGenerator(false);
                        setActiveLayoutTab("dashboard");
                        if (currentUser) {
                          if (currentUser.uid === "guest_user") {
                            localStorage.setItem("guest_active_career_id", c.id);
                          } else {
                            localStorage.setItem(`active_career_id_${currentUser.uid}`, c.id);
                          }
                        }
                      }}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                        isActive
                          ? "bg-brand-green/5 border-brand-green/40 shadow-lg shadow-brand-green/5"
                          : "bg-black/30 border-white/5 hover:border-white/10 hover:bg-black/40"
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-display font-black text-md shrink-0 border ${
                          isActive 
                            ? "bg-brand-green text-black border-brand-green/30" 
                            : "bg-zinc-900 text-zinc-400 border-white/5"
                        }`}>
                          {ovr}
                        </div>
                        <div className="truncate">
                          <h4 className={`text-xs font-display font-black uppercase tracking-wider truncate ${isActive ? 'text-white' : 'text-zinc-400'}`}>
                            {c.profile?.nome_jogador || "Sem Nome"}
                          </h4>
                          <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                            <span className="truncate">{c.currentClub}</span>
                            <span>•</span>
                            <span className="text-zinc-400 font-bold">T{c.currentSeason}</span>
                          </span>
                        </div>
                      </div>
                      
                      {isActive && (
                        <div className="w-2.5 h-2.5 rounded-full bg-brand-green shrink-0 animate-pulse"></div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* BANNER SHOWING OWNER VIEWING THE LEGACY */}
          {isSharedView && career && (
            <div className="bg-[#0b100d] border border-brand-green/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-brand-green">
              <div className="flex items-center gap-2.5 text-xs font-mono">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-green animate-pulse shrink-0"></span>
                <span>
                  Você está visualizando a carreira de <strong>{career.profile.nome_jogador}</strong> criada pelo treinador <strong className="text-white">{career.trainerUsername || career.userEmail?.split("@")[0] || "Treinador"}</strong>.
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



          {/* CREATE CAREER FLOW FOR AUTHENTICATED USERS WITH NO CAREER */}
          {(!career || showGenerator) && !careerLoading && (
            <InteractiveQuestionnaire
              onComplete={handleCompleteQuestionnaire}
              onCancel={() => {
                setShowGenerator(false);
                if (careersList.length > 0 && !career) {
                  setCareer(careersList[0]);
                }
              }}
              onGenerateAI={handleGenerateAIForQuestionnaire}
              generationLoading={generationLoading}
              generationError={generationError}
              hasExistingCareers={careersList.length > 0}
            />
          )}

          {/* ACTIVE BENTO GRID DASHBOARD */}
          {career && !showGenerator && activeLayoutTab === "dashboard" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              

              
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

                {/* 4. GLOBAL LEADERBOARD BENTO CARD */}
                <div className="bg-[#0c0c0e] border border-white/5 rounded-3xl p-6 relative overflow-hidden shadow-xl flex flex-col justify-between min-h-[220px]">
                  {/* Decorative background trophy */}
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Trophy className="w-24 h-24 text-brand-green animate-pulse" />
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-brand-green/15 text-brand-green rounded-lg">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[8px] font-mono text-zinc-500 block uppercase tracking-widest">Global Live Arena</span>
                        <h3 className="font-display font-bold text-xs text-white uppercase tracking-wider">
                          Ranking de Treinadores
                        </h3>
                      </div>
                    </div>
                    
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      Acompanhe onde seu atleta se posiciona perante os melhores do mundo. Resultados atualizados <span className="text-brand-green font-bold">ao vivo, sem atualizar a página</span> para todos os treinadores!
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setActiveLayoutTab("leaderboard");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="w-full mt-4 py-3 bg-brand-green hover:bg-[#d9ff33] text-black font-mono font-bold uppercase rounded-xl text-xs transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer glow-green"
                  >
                    <Trophy className="w-4 h-4" />
                    Veja o Ranking
                  </button>
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
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => handleStartEditMatch(m)}
                                  className="p-2 bg-zinc-900/60 text-zinc-400 hover:text-brand-green hover:bg-zinc-850 border border-white/5 rounded-xl transition-all cursor-pointer"
                                  title="Editar partida"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteMatch(m.id)}
                                  className="p-2 bg-red-950/20 text-zinc-500 hover:text-red-400 hover:bg-red-950/40 border border-white/5 rounded-xl transition-all cursor-pointer"
                                  title="Deletar partida"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
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

          {/* LEADERBOARD VIEW */}
          {!showGenerator && activeLayoutTab === "leaderboard" && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Header card */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0c0c0e] border border-white/5 rounded-3xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-[0.02] pointer-events-none">
                  <Trophy className="w-48 h-48 text-brand-green" />
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-brand-green/10 text-brand-green rounded-2xl border border-brand-green/20">
                    <Trophy className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <span className="text-[9px] font-mono text-brand-green uppercase tracking-widest block font-bold">
                      LEGADOS DA COMUNIDADE // AO VIVO
                    </span>
                    <h2 className="font-display font-black text-2xl text-white uppercase italic tracking-tight">
                      Arena de Lendas do FC 26
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      Ranking global de treinadores atualizado <span className="text-brand-green font-bold">em tempo real</span>. Nenhuma atualização manual de página é necessária!
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => {
                    setActiveLayoutTab("dashboard");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/5 hover:border-brand-green/30 font-mono font-bold uppercase rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-97"
                >
                  Voltar ao Meu Painel
                </button>
              </div>

              {/* Wide Leaderboard Card */}
              <div className="bg-[#0c0c0e] border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
                <LeaderboardTable onRowClick={(playerId) => {
                  handleViewSharedProfile(playerId);
                  setActiveLayoutTab("dashboard");
                }} />
              </div>
            </motion.div>
          )}

        </main>
      )}

      {/* EDIT MATCH MODAL */}
      <AnimatePresence>
        {editingMatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingMatch(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0c0c0e] border border-white/10 rounded-3xl p-6 w-full max-w-lg relative z-10 shadow-2xl space-y-5"
            >
              <div className="flex items-center gap-2.5 border-b border-white/5 pb-3">
                <div className="p-1.5 bg-brand-green/15 text-brand-green rounded-lg">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[8px] font-mono text-zinc-500 block uppercase tracking-widest">Corrigir Erro</span>
                  <h2 className="font-display font-bold text-md text-white uppercase italic tracking-tight">
                    Editar Dados da Partida
                  </h2>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[8px] font-mono text-zinc-400 uppercase tracking-widest font-bold mb-1.5">Campeonato</label>
                    <select
                      value={editChamp}
                      onChange={(e) => setEditChamp(e.target.value)}
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
                        onClick={() => setEditPG(Math.max(0, editPG - 1))}
                        className="w-6 h-6 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center justify-center font-mono text-xs cursor-pointer text-white"
                      >
                        -
                      </button>
                      <span className="text-xs font-mono font-bold text-white">{editPG}</span>
                      <button 
                        onClick={() => setEditPG(editPG + 1)}
                        className="w-6 h-6 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center justify-center font-mono text-xs cursor-pointer text-white"
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
                          onClick={() => setEditPD(Math.max(0, editPD - 1))}
                          className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer text-white"
                        >
                          -
                        </button>
                        <span className="text-xs font-mono font-bold text-white">{editPD}</span>
                        <button 
                          onClick={() => setEditPD(editPD + 1)}
                          className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer text-white"
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
                          onClick={() => setEditPE(Math.max(0, editPE - 1))}
                          className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer text-white"
                        >
                          -
                        </button>
                        <span className="text-xs font-mono font-bold text-white">{editPE}</span>
                        <button 
                          onClick={() => setEditPE(editPE + 1)}
                          className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer text-white"
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
                          onClick={() => setEditDA(Math.max(0, editDA - 1))}
                          className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer text-white"
                        >
                          -
                        </button>
                        <span className="text-xs font-mono font-bold text-white">{editDA}</span>
                        <button 
                          onClick={() => setEditDA(editDA + 1)}
                          className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer text-white"
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
                          onClick={() => setEditFA(Math.max(0, editFA - 1))}
                          className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer text-white"
                        >
                          -
                        </button>
                        <span className="text-xs font-mono font-bold text-white">{editFA}</span>
                        <button 
                          onClick={() => setEditFA(editFA + 1)}
                          className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer text-white"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Sem Assistência (SA) */}
                    <div className="col-span-2">
                      <span className="text-[8px] font-mono text-zinc-400 uppercase tracking-widest block mb-1">Gols Individuais / Sem Assistência (SA)</span>
                      <div className="flex items-center justify-between bg-black/50 border border-white/5 rounded-lg p-2.5 font-mono text-xs">
                        <button 
                          onClick={() => setEditSA(Math.max(0, editSA - 1))}
                          className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer text-white"
                        >
                          -
                        </button>
                        <span className="text-xs font-mono font-bold text-white">{editSA} Gols Individuais</span>
                        <button 
                          onClick={() => setEditSA(editSA + 1)}
                          className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-xs cursor-pointer text-white"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditingMatch(null)}
                  className="flex-1 py-3 bg-[#111] hover:bg-zinc-800 border border-white/5 text-zinc-400 hover:text-white rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEditedMatch}
                  className="flex-1 py-3 bg-brand-green hover:bg-[#d9ff33] text-black rounded-xl text-xs font-display font-black uppercase tracking-wider transition-all cursor-pointer glow-green font-bold"
                >
                  Salvar Correções
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MANDATORY USERNAME OVERLAY (TRAVA DE PRIVACIDADE) */}
      {showUsernameModal && currentUser && currentUser.uid !== "guest_user" && (
        <UsernameSetupModal
          userId={currentUser.uid}
          email={currentUser.email || ""}
          onSuccess={(newUsername) => {
            setUserProfile(prev => prev ? { ...prev, username: newUsername, hasSetupUsername: true } : { username: newUsername, hasSetupUsername: true });
            setShowUsernameModal(false);
          }}
        />
      )}

      {/* MONETIZATION & PREMIUM SUITE MODAL */}
      <UpgradeModal
        isOpen={upgradeModalOpen.open}
        type={upgradeModalOpen.type}
        onClose={() => setUpgradeModalOpen({ open: false, type: "manual" })}
        userId={currentUser?.uid || ""}
        userEmail={currentUser?.email || ""}
        proPrice={systemConfig.proPrice}
      />

      {/* ACCOUNT SETTINGS MODAL */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        userProfile={userProfile ? { ...userProfile, userId: currentUser?.uid } : { userId: currentUser?.uid }}
        onOpenUpgrade={(type) => setUpgradeModalOpen({ open: true, type })}
      />

      {/* FOOTER */}
      <footer className="border-t border-white/5 bg-[#070709] py-8 text-center text-[11px] text-zinc-500 font-mono mt-12">
        <div className="max-w-7xl mx-auto px-6 space-y-4">
          <p>© 2026 FCLegacy. Todos os direitos reservados.</p>
          <p>
            Desenvolvido exclusivamente para o ecossistema wolkstore.shop.
          </p>
          <p className="text-brand-green/80 font-bold uppercase tracking-wider">
            100% desenvolvido pela Wolks Group
          </p>
          

        </div>
      </footer>
    </div>
  );
}
