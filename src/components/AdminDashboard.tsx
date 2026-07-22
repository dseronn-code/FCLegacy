import React, { useState, useEffect } from "react";
import { 
  Trophy, Users, Coins, Sparkles, ShieldAlert, Search, RefreshCw, Trash2, 
  Settings, Loader2, Ban, Shield, Lock, Unlock, Check, Megaphone, Calendar, CreditCard, ChevronDown, ChevronUp,
  Plus, Package, Tag, ToggleLeft, ToggleRight, X, Layers
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AdminDashboardProps {
  adminUserId: string;
  onClose: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ adminUserId, onClose }) => {
  const [activeTab, setActiveTab] = useState<"metrics" | "users" | "plans" | "payments" | "config">("metrics");
  const [metrics, setMetrics] = useState<any | null>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [subscriptionsList, setSubscriptionsList] = useState<any[]>([]);
  const [plansList, setPlansList] = useState<any[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(false);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState<boolean>(false);
  const [loadingPlans, setLoadingPlans] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [paymentsSearchQuery, setPaymentsSearchQuery] = useState<string>("");
  
  // Collapsible management
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [planFormType, setPlanFormType] = useState<"pro" | "boost">("pro");
  const [planFormDays, setPlanFormDays] = useState<number>(30);
  const [submittingPlan, setSubmittingPlan] = useState<boolean>(false);

  // System plans creation state
  const [showNewPlanModal, setShowNewPlanModal] = useState<boolean>(false);
  const [newPlanName, setNewPlanName] = useState<string>("");
  const [newPlanType, setNewPlanType] = useState<"pro" | "boost" | "custom">("pro");
  const [newPlanPrice, setNewPlanPrice] = useState<string>("2.10");
  const [newPlanDays, setNewPlanDays] = useState<number>(30);
  const [newPlanDescription, setNewPlanDescription] = useState<string>("");
  const [newPlanBadge, setNewPlanBadge] = useState<string>("");
  const [newPlanFeatures, setNewPlanFeatures] = useState<string>("");
  const [creatingPlan, setCreatingPlan] = useState<boolean>(false);
  const [planActionError, setPlanActionError] = useState<string | null>(null);

  // Config form state
  const [proPrice, setProPrice] = useState<number>(29.90);
  const [freeAiLimit, setFreeAiLimit] = useState<number>(3);
  const [announcementBanner, setAnnouncementBanner] = useState<string>("");
  const [showBanner, setShowBanner] = useState<boolean>(true);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [configSuccess, setConfigSuccess] = useState<boolean>(false);

  // Fetch metrics
  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const res = await fetch("/api/admin/metrics", {
        headers: { "x-user-id": adminUserId }
      });
      const data = await res.json();
      if (!data.error) {
        setMetrics(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMetrics(false);
    }
  };

  // Fetch users
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchQuery)}`, {
        headers: { "x-user-id": adminUserId }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsersList(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch subscription ledger
  const fetchSubscriptions = async () => {
    setLoadingSubscriptions(true);
    try {
      const res = await fetch("/api/admin/subscriptions", {
        headers: { "x-user-id": adminUserId }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setSubscriptionsList(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSubscriptions(false);
    }
  };

  // Fetch system plans catalog
  const fetchPlans = async () => {
    setLoadingPlans(true);
    try {
      const res = await fetch("/api/admin/plans", {
        headers: { "x-user-id": adminUserId }
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setPlansList(data);
      } else {
        const publicRes = await fetch("/api/plans");
        const publicData = await publicRes.json();
        if (Array.isArray(publicData)) {
          setPlansList(publicData);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar planos:", err);
      try {
        const publicRes = await fetch("/api/plans");
        const publicData = await publicRes.json();
        if (Array.isArray(publicData)) {
          setPlansList(publicData);
        }
      } catch (pErr) {
        console.error("Erro ao carregar planos via rota pública:", pErr);
      }
    } finally {
      setLoadingPlans(false);
    }
  };

  // Fetch global config initially
  const fetchGlobalConfig = async () => {
    try {
      const res = await fetch("/api/system-config");
      const data = await res.json();
      if (data && data.proPrice !== undefined) {
        setProPrice(data.proPrice);
        setFreeAiLimit(data.freeAiLimit || 3);
        setAnnouncementBanner(data.announcementBanner || "");
        setShowBanner(data.showBanner !== undefined ? data.showBanner : true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchMetrics();
    fetchGlobalConfig();
    fetchUsers(); // pre-load users list
    fetchPlans(); // pre-load system plans
  }, []);

  useEffect(() => {
    if (activeTab === "users") {
      fetchUsers();
    } else if (activeTab === "payments") {
      fetchSubscriptions();
    } else if (activeTab === "plans") {
      fetchPlans();
    }
  }, [activeTab, searchQuery]);

  // System plans action handlers
  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const numPrice = parseFloat(String(newPlanPrice).replace(",", "."));
    if (!newPlanName || isNaN(numPrice) || numPrice < 0 || newPlanDays <= 0) {
      setPlanActionError("Preencha o nome do plano, preço válido e dias de duração.");
      return;
    }

    setCreatingPlan(true);
    setPlanActionError(null);

    try {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": adminUserId
        },
        body: JSON.stringify({
          name: newPlanName,
          type: newPlanType,
          price: numPrice,
          days: newPlanDays,
          description: newPlanDescription,
          badge: newPlanBadge,
          features: newPlanFeatures.split("\n").map(f => f.trim()).filter(Boolean)
        })
      });

      const data = await res.json();
      if (data.success) {
        setShowNewPlanModal(false);
        setNewPlanName("");
        setNewPlanDescription("");
        setNewPlanBadge("");
        setNewPlanFeatures("");
        fetchPlans();
        alert("Novo plano adicionado ao sistema com sucesso!");
      } else {
        setPlanActionError(data.error || "Erro ao criar plano.");
      }
    } catch (err) {
      console.error(err);
      setPlanActionError("Erro de conexão com o servidor ao criar plano.");
    } finally {
      setCreatingPlan(false);
    }
  };

  const handleDeletePlan = async (planId: string, planName: string) => {
    if (!window.confirm(`Tem certeza que deseja REMOVER O PLANO "${planName}" do sistema?`)) return;

    try {
      const res = await fetch(`/api/admin/plans/${planId}`, {
        method: "DELETE",
        headers: { "x-user-id": adminUserId }
      });

      const data = await res.json();
      if (data.success) {
        setPlansList(prev => prev.filter(p => p.id !== planId));
        alert("Plano removido do sistema com sucesso!");
      } else {
        alert(data.error || "Erro ao remover plano.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao comunicar com o servidor.");
    }
  };

  const handleTogglePlanActive = async (planId: string) => {
    try {
      const res = await fetch(`/api/admin/plans/${planId}/toggle`, {
        method: "PUT",
        headers: { "x-user-id": adminUserId }
      });

      const data = await res.json();
      if (data.success) {
        setPlansList(prev => prev.map(p => p.id === planId ? { ...p, active: data.active } : p));
      } else {
        alert(data.error || "Erro ao alterar status do plano.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Admin Actions helpers
  const toggleUserPro = async (userId: string, currentProState: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/toggle-pro`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-user-id": adminUserId 
        },
        body: JSON.stringify({ isPro: !currentProState })
      });
      const data = await res.json();
      if (data.success) {
        setUsersList(prev => prev.map(u => u.userId === userId ? { 
          ...u, 
          isPro: !currentProState, 
          proExpiresAt: !currentProState ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
          aiCredits: !currentProState ? 9999 : 3 
        } : u));
        fetchMetrics();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddPlan = async (userId: string) => {
    setSubmittingPlan(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/add-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": adminUserId
        },
        body: JSON.stringify({
          planType: planFormType,
          days: planFormDays
        })
      });
      const data = await res.json();
      if (data.success) {
        alert("Plano concedido com sucesso!");
        fetchUsers();
        fetchMetrics();
      } else {
        alert(data.error || "Erro ao adicionar plano.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão com o servidor.");
    } finally {
      setSubmittingPlan(false);
    }
  };

  const handleRemovePlan = async (userId: string) => {
    if (!window.confirm("Deseja realmente revogar todos os benefícios e retornar este treinador ao plano gratuito?")) return;
    setSubmittingPlan(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/remove-plan`, {
        method: "POST",
        headers: {
          "x-user-id": adminUserId
        }
      });
      const data = await res.json();
      if (data.success) {
        alert("Todos os planos do treinador foram revogados!");
        fetchUsers();
        fetchMetrics();
      } else {
        alert(data.error || "Erro ao remover plano.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão com o servidor.");
    } finally {
      setSubmittingPlan(false);
    }
  };

  const resetUserAi = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-ai`, {
        method: "POST",
        headers: { "x-user-id": adminUserId }
      });
      const data = await res.json();
      if (data.success) {
        setUsersList(prev => prev.map(u => u.userId === userId ? { ...u, aiGenerationsCount: 0 } : u));
        alert("Contagem de IA e créditos resetados!");
        fetchMetrics();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const banUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: "POST",
        headers: { "x-user-id": adminUserId }
      });
      const data = await res.json();
      if (data.success) {
        setUsersList(prev => prev.map(u => u.userId === userId ? { ...u, isBlocked: data.isBlocked } : u));
        fetchMetrics();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleUserAdmin = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/toggle-admin`, {
        method: "POST",
        headers: { "x-user-id": adminUserId }
      });
      const data = await res.json();
      if (data.success) {
        setUsersList(prev => prev.map(u => u.userId === userId ? { ...u, isAdmin: data.isAdmin } : u));
        fetchMetrics();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveGlobalConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSuccess(false);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-user-id": adminUserId 
        },
        body: JSON.stringify({
          proPrice,
          freeAiLimit,
          announcementBanner,
          showBanner
        })
      });
      const data = await res.json();
      if (data.success) {
        setConfigSuccess(true);
        setTimeout(() => setConfigSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingConfig(false);
    }
  };

  const getUserNameById = (userId: string, defaultEmail: string) => {
    const found = usersList.find(u => u.userId === userId);
    return found?.username || found?.email?.split("@")[0] || defaultEmail?.split("@")[0] || "Treinador";
  };

  // Filter subscription entries
  const filteredSubscriptions = subscriptionsList.filter(sub => {
    if (!paymentsSearchQuery) return true;
    const queryStr = paymentsSearchQuery.toLowerCase();
    const trainerName = getUserNameById(sub.userId, sub.userEmail).toLowerCase();
    return (
      (sub.id && sub.id.toLowerCase().includes(queryStr)) ||
      (sub.userEmail && sub.userEmail.toLowerCase().includes(queryStr)) ||
      (sub.type && sub.type.toLowerCase().includes(queryStr)) ||
      trainerName.includes(queryStr)
    );
  });

  return (
    <div className="bg-[#08080a] border border-white/5 rounded-[32px] p-6 sm:p-8 space-y-6 relative overflow-hidden shadow-2xl animate-fadeIn">
      {/* Dynamic top brand banner */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-500 via-brand-green to-yellow-500"></div>

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-500/15 text-red-500 border border-red-500/25 rounded-2xl shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse">
            <Shield className="w-5 h-5 fill-red-500/10" />
          </div>
          <div>
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block">ADMINISTRATION HUB // EXCLUSIVE ACCESS</span>
            <h2 className="font-display font-black text-xl text-white uppercase italic tracking-tight">FC Legacy Painel de Controle</h2>
          </div>
        </div>

        {/* Action button to return */}
        <button
          onClick={onClose}
          className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-zinc-300 hover:text-white font-mono font-bold uppercase rounded-xl text-[10px] sm:text-xs transition-all cursor-pointer self-start sm:self-center"
        >
          Voltar ao App
        </button>
      </div>

      {/* Tabs switches */}
      <div className="flex flex-wrap bg-black/60 p-1.5 border border-white/5 rounded-2xl gap-1.5 w-fit">
        {(["metrics", "users", "plans", "payments", "config"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-mono font-bold text-[10px] sm:text-xs uppercase rounded-xl transition-all cursor-pointer ${
              activeTab === tab
                ? "bg-red-600 text-white shadow-lg shadow-red-600/15"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            }`}
          >
            {tab === "metrics" 
              ? "📊 Métricas" 
              : tab === "users" 
              ? "👥 Usuários" 
              : tab === "plans" 
              ? "📦 Planos do Sistema" 
              : tab === "payments" 
              ? "💳 Pagamentos" 
              : "⚙️ Sistema"}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <AnimatePresence mode="wait">
        {activeTab === "metrics" && (
          <motion.div
            key="metrics"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Bento Grid Business Metrics */}
            {loadingMetrics ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 font-mono">
                <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                <span className="text-[10px] uppercase tracking-widest">Carregando Finanças...</span>
              </div>
            ) : metrics ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Revenue */}
                <div className="bg-gradient-to-br from-emerald-950/15 to-zinc-950 border border-emerald-500/20 rounded-2xl p-5 shadow-[0_0_20px_rgba(16,185,129,0.05)] flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-widest">Faturamento</span>
                    <Coins className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-display font-black text-white font-mono leading-none">
                      R$ {metrics.totalRevenue?.toFixed(2)}
                    </h4>
                    <p className="text-[9px] text-zinc-500 font-mono mt-1 uppercase">Aprovados via Pix & Webhook</p>
                  </div>
                </div>

                {/* 2. PRO Members */}
                <div className="bg-gradient-to-br from-yellow-950/15 to-zinc-950 border border-yellow-500/20 rounded-2xl p-5 shadow-[0_0_20px_rgba(234,179,8,0.05)] flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-mono text-yellow-400 font-bold uppercase tracking-widest">Assinantes PRO</span>
                    <Sparkles className="w-4 h-4 text-yellow-400 fill-yellow-400/10" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-display font-black text-white font-mono leading-none">
                      {metrics.proUsersCount}
                    </h4>
                    <p className="text-[9px] text-zinc-500 font-mono mt-1 uppercase">Contas premium ativas</p>
                  </div>
                </div>

                {/* 3. Total Users */}
                <div className="bg-zinc-950 border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-mono text-zinc-400 font-bold uppercase tracking-widest">Cadastros</span>
                    <Users className="w-4 h-4 text-zinc-400" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-display font-black text-white font-mono leading-none">
                      {metrics.totalUsers}
                    </h4>
                    <p className="text-[9px] text-zinc-500 font-mono mt-1 uppercase">Treinadores Registrados</p>
                  </div>
                </div>

                {/* 4. Total Careers */}
                <div className="bg-zinc-950 border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-mono text-zinc-400 font-bold uppercase tracking-widest">Atletas Salvos</span>
                    <Trophy className="w-4 h-4 text-zinc-400" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-display font-black text-white font-mono leading-none">
                      {metrics.totalCareers}
                    </h4>
                    <p className="text-[9px] text-zinc-500 font-mono mt-1 uppercase">Carreiras no banco de dados</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-zinc-500 font-mono text-xs uppercase">Erro ao carregar estatísticas.</div>
            )}

            <div className="bg-zinc-950 border border-white/5 rounded-3xl p-5 sm:p-6 space-y-3">
              <h3 className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-brand-green" />
                Resumo Operacional
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                <div className="p-4 bg-black/40 border border-white/5 rounded-xl">
                  <span className="text-zinc-500 block text-[9px] uppercase">Gerações de Biografia IA</span>
                  <span className="text-white font-bold text-lg">{metrics?.totalAiCalls || 0}</span>
                </div>
                <div className="p-4 bg-black/40 border border-white/5 rounded-xl">
                  <span className="text-zinc-500 block text-[9px] uppercase">Conversão Free para PRO</span>
                  <span className="text-yellow-400 font-bold text-lg">
                    {metrics?.totalUsers ? ((metrics.proUsersCount / metrics.totalUsers) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="p-4 bg-black/40 border border-white/5 rounded-xl">
                  <span className="text-zinc-500 block text-[9px] uppercase">Ticket Médio</span>
                  <span className="text-emerald-400 font-bold text-lg">
                    R$ {metrics?.proUsersCount ? (metrics.totalRevenue / metrics.proUsersCount).toFixed(2) : 0}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "users" && (
          <motion.div
            key="users"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Search filter bar */}
            <div className="relative">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Pesquisar por email, ID ou nome de usuário..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-white/5 rounded-2xl text-xs text-white focus:outline-none focus:border-red-500 font-mono uppercase"
              />
            </div>

            {/* Users listing */}
            {loadingUsers ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 font-mono">
                <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                <span className="text-[10px] uppercase tracking-widest">Pesquisando treinadores...</span>
              </div>
            ) : usersList.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 font-mono text-xs uppercase">Nenhum treinador localizado com esse termo.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-[9px] text-zinc-500 uppercase font-bold">
                      <th className="py-3 px-3">Nome de Usuário (Treinador)</th>
                      <th className="py-3 px-3">E-mail</th>
                      <th className="py-3 px-2 text-center">Status</th>
                      <th className="py-3 px-2 text-center">Gerações IA</th>
                      <th className="py-3 px-3 text-right">Ações Rápidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map((user) => {
                      const isExpanded = expandedUserId === user.userId;
                      return (
                        <React.Fragment key={user.userId}>
                          <tr className={`border-b border-white/5 hover:bg-white/[0.01] transition-colors ${isExpanded ? "bg-white/[0.02]" : ""}`}>
                            <td className="py-4 px-3">
                              <div className="font-bold text-white flex items-center gap-1">
                                <span className="text-brand-green">{user.username || user.email?.split("@")[0] || "Treinador Sem Nome"}</span>
                                {user.isAdmin && (
                                  <span className="px-1.5 py-0.5 bg-red-500/10 border border-red-500/20 text-[7px] text-red-400 rounded uppercase font-extrabold tracking-wider">
                                    ADMIN
                                  </span>
                                )}
                              </div>
                              <div className="text-[8px] text-zinc-500 truncate max-w-[120px]" title={user.userId}>ID: {user.userId}</div>
                            </td>
                            <td className="py-4 px-3 text-zinc-400">{user.email || "Sem e-mail"}</td>
                            <td className="py-4 px-2 text-center">
                              <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                                user.isBlocked
                                  ? "bg-red-500/10 border border-red-500/20 text-red-400"
                                  : user.isPro
                                  ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400"
                                  : "bg-zinc-500/10 border border-white/10 text-zinc-400"
                              }`}>
                                {user.isBlocked ? "BANIDO" : user.isPro ? "PRO" : "FREE"}
                              </span>
                            </td>
                            <td className="py-4 px-2 text-center font-bold text-zinc-300">
                              {user.aiGenerationsCount || 0}
                            </td>
                            <td className="py-4 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Expand Subscription controls */}
                                <button
                                  onClick={() => setExpandedUserId(isExpanded ? null : user.userId)}
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1 text-[9px] uppercase font-bold ${
                                    isExpanded 
                                      ? "bg-brand-green border-brand-green text-black" 
                                      : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-white hover:border-zinc-700"
                                  }`}
                                  title="Gerenciar Planos e Expirabilidade"
                                >
                                  <CreditCard className="w-3.5 h-3.5" />
                                  <span>Plano</span>
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>

                                {/* Toggle PRO quick shortcut */}
                                <button
                                  onClick={() => toggleUserPro(user.userId, !!user.isPro)}
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    user.isPro
                                      ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20"
                                      : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-white"
                                  }`}
                                  title={user.isPro ? "Rebaixar para Free" : "Tornar PRO (30d)"}
                                >
                                  <Sparkles className="w-3.5 h-3.5 fill-current" />
                                </button>

                                {/* Reset IA */}
                                <button
                                  onClick={() => resetUserAi(user.userId)}
                                  className="p-1.5 bg-zinc-900 border border-white/5 hover:border-brand-green/25 text-zinc-400 hover:text-brand-green rounded-lg transition-all cursor-pointer"
                                  title="Resetar contagem de gerações de IA"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>

                                {/* Promover/Rebaixar Admin */}
                                <button
                                  onClick={() => toggleUserAdmin(user.userId)}
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    user.isAdmin
                                      ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
                                      : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-red-400"
                                  }`}
                                  title={user.isAdmin ? "Remover cargo Admin" : "Promover a Admin"}
                                >
                                  <Shield className="w-3.5 h-3.5" />
                                </button>

                                {/* Ban / Unban */}
                                <button
                                  onClick={() => banUser(user.userId)}
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    user.isBlocked
                                      ? "bg-red-500 border-red-600 text-white"
                                      : "bg-zinc-900 border-white/5 text-zinc-400 hover:bg-red-950/40 hover:text-red-400 hover:border-red-500/30"
                                  }`}
                                  title={user.isBlocked ? "Desbanir Treinador" : "Banir Treinador"}
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Plan Management Expandable Card */}
                          {isExpanded && (
                            <tr className="bg-black/50">
                              <td colSpan={5} className="py-4 px-6 border-b border-white/10">
                                <div className="space-y-4 font-mono text-xs text-left animate-fadeIn">
                                  <h4 className="text-yellow-400 font-bold uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                                    <Sparkles className="w-4 h-4 text-yellow-400" />
                                    Gerenciar Assinatura e Planos de: {user.username || user.email?.split("@")[0]}
                                  </h4>

                                  {/* Info Display */}
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-[#0d0d10] border border-white/5 rounded-xl">
                                    <div>
                                      <span className="text-[9px] text-zinc-500 uppercase block font-bold">Plano Ativo</span>
                                      <span className="font-bold text-white text-xs uppercase">{user.isPro ? "FC Legacy PRO" : "Gratuito (Free)"}</span>
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-zinc-500 uppercase block font-bold">Data de Expiração</span>
                                      <span className="font-bold text-zinc-300 text-xs">
                                        {user.proExpiresAt ? new Date(user.proExpiresAt).toLocaleString("pt-BR") : "Sem expiração / Vitalício"}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-zinc-500 uppercase block font-bold">Dias Restantes</span>
                                      <span className={`font-bold text-xs ${user.isPro ? "text-emerald-400" : "text-zinc-500"}`}>
                                        {user.proExpiresAt 
                                          ? (() => {
                                              const diffTime = new Date(user.proExpiresAt).getTime() - Date.now();
                                              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                              return diffDays > 0 ? `${diffDays} dias` : "Expirado";
                                            })()
                                          : "Nenhum dia de benefício"}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Action Controls Form */}
                                  <div className="bg-zinc-950 p-4 border border-white/5 rounded-2xl space-y-3">
                                    <span className="text-[9px] text-zinc-400 font-bold uppercase block tracking-wider">Atribuir novo plano / prorrogar</span>
                                    
                                    {plansList.length > 0 && (
                                      <div className="space-y-1">
                                        <label className="text-[8px] text-zinc-500 uppercase font-bold block">Selecionar do Catálogo do Sistema</label>
                                        <div className="flex flex-wrap gap-1.5">
                                          {plansList.map((p) => (
                                            <button
                                              key={p.id}
                                              type="button"
                                              onClick={() => {
                                                setPlanFormType(p.type === "boost" ? "boost" : "pro");
                                                setPlanFormDays(p.days || 30);
                                              }}
                                              className="px-2.5 py-1 bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 rounded-lg text-[9px] font-mono text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center gap-1"
                                            >
                                              <Package className="w-3 h-3 text-brand-green" />
                                              <span>{p.name} ({p.days}d - R${p.price})</span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    <div className="flex flex-wrap gap-4 items-end pt-1">
                                      <div className="space-y-1.5">
                                        <label className="text-[9px] text-zinc-500 uppercase font-bold block">Categoria</label>
                                        <select 
                                          value={planFormType}
                                          onChange={(e) => setPlanFormType(e.target.value as any)}
                                          className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-green text-xs w-[160px]"
                                        >
                                          <option value="pro">Pro Premium</option>
                                          <option value="boost">Destaque Boost</option>
                                        </select>
                                      </div>

                                      <div className="space-y-1.5">
                                        <label className="text-[9px] text-zinc-500 uppercase font-bold block">Duração (Dias)</label>
                                        <input 
                                          type="number"
                                          min="1"
                                          max="3650"
                                          value={planFormDays}
                                          onChange={(e) => setPlanFormDays(Number(e.target.value))}
                                          className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-green text-xs w-[120px]"
                                        />
                                      </div>

                                      <button
                                        onClick={() => handleAddPlan(user.userId)}
                                        disabled={submittingPlan}
                                        className="px-4 py-2 bg-brand-green hover:bg-[#d9ff33] disabled:opacity-50 text-black font-display font-black uppercase rounded-xl text-[10px] transition-all flex items-center gap-1.5 cursor-pointer"
                                      >
                                        {submittingPlan ? (
                                          <>
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Processando...
                                          </>
                                        ) : (
                                          "Ativar Plano para Treinador"
                                        )}
                                      </button>

                                      {user.isPro && (
                                        <button
                                          onClick={() => handleRemovePlan(user.userId)}
                                          disabled={submittingPlan}
                                          className="px-4 py-2 bg-red-950/20 hover:bg-red-950/40 border border-red-500/10 hover:border-red-500/30 text-red-400 hover:text-white font-mono uppercase font-bold rounded-xl text-[10px] transition-all ml-auto cursor-pointer"
                                        >
                                          Revogar Plano / Retornar a Free
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "plans" && (
          <motion.div
            key="plans"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Header & Add Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950 border border-white/5 p-5 rounded-3xl">
              <div>
                <h3 className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-brand-green" />
                  Catálogo Global de Planos de Assinatura
                </h3>
                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                  Gerencie os preços, duração em dias, ofertas e benefícios dos planos exibidos aos usuários.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowNewPlanModal(true);
                  setPlanActionError(null);
                }}
                className="px-4 py-2.5 bg-brand-green hover:bg-[#d9ff33] text-black font-mono font-bold uppercase rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-center shadow-lg shadow-brand-green/10"
              >
                <Plus className="w-4 h-4" />
                Adicionar Novo Plano
              </button>
            </div>

            {/* Plans Grid */}
            {loadingPlans ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 font-mono">
                <Loader2 className="w-6 h-6 animate-spin text-brand-green" />
                <span className="text-[10px] uppercase tracking-widest">Carregando Planos do Sistema...</span>
              </div>
            ) : plansList.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 font-mono text-xs uppercase border border-white/5 rounded-3xl p-8 bg-zinc-950">
                Nenhum plano cadastrado. Clique no botão "Adicionar Novo Plano" para criar uma opção de assinatura.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {plansList.map((plan) => (
                  <div
                    key={plan.id}
                    className={`bg-zinc-950 border ${
                      plan.active !== false ? "border-white/10" : "border-red-500/20 opacity-60"
                    } rounded-3xl p-6 relative flex flex-col justify-between space-y-5 shadow-xl transition-all hover:border-white/20`}
                  >
                    {/* Badge */}
                    {plan.badge && (
                      <div className="absolute -top-3 right-5 px-3 py-1 bg-yellow-500 text-black font-display font-black text-[9px] uppercase tracking-wider rounded-full shadow-lg">
                        {plan.badge}
                      </div>
                    )}

                    <div className="space-y-3">
                      {/* Plan Type & Name */}
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2.5 py-0.5 rounded text-[8px] font-bold font-mono uppercase ${
                          plan.type === "boost" 
                            ? "bg-amber-500/10 border border-amber-500/20 text-amber-400" 
                            : "bg-brand-green/10 border border-brand-green/20 text-brand-green"
                        }`}>
                          {plan.type === "boost" ? "BOOST DESTAQUE" : "PRO PREMIUM"}
                        </span>

                        <span className={`text-[9px] font-mono font-bold uppercase ${plan.active !== false ? "text-emerald-400" : "text-red-400"}`}>
                          {plan.active !== false ? "● Ativo" : "○ Inativo"}
                        </span>
                      </div>

                      <h4 className="text-lg font-display font-black text-white uppercase italic tracking-tight">
                        {plan.name}
                      </h4>

                      <p className="text-[11px] text-zinc-400 leading-snug">
                        {plan.description || "Plano de assinatura oficial."}
                      </p>

                      {/* Price & Duration */}
                      <div className="pt-2 border-t border-white/5 flex items-baseline gap-1.5">
                        <span className="text-2xl font-display font-black text-brand-green font-mono">
                          R$ {Number(plan.price).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono uppercase">
                          / {plan.days} dias ({Math.round(plan.days / 30)} mês(es))
                        </span>
                      </div>

                      {/* Features List */}
                      {Array.isArray(plan.features) && plan.features.length > 0 && (
                        <div className="space-y-1.5 pt-2 font-mono text-[11px] text-zinc-300">
                          {plan.features.map((feat: string, idx: number) => (
                            <div key={idx} className="flex items-start gap-2">
                              <Check className="w-3.5 h-3.5 text-brand-green mt-0.5 shrink-0" />
                              <span>{feat}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="pt-4 border-t border-white/5 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleTogglePlanActive(plan.id)}
                        className={`px-3 py-1.5 rounded-xl border text-[10px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1 ${
                          plan.active !== false
                            ? "bg-zinc-900 border-white/10 text-zinc-400 hover:text-white"
                            : "bg-emerald-950/30 border-emerald-500/30 text-emerald-400 hover:text-white"
                        }`}
                      >
                        {plan.active !== false ? <ToggleLeft className="w-3.5 h-3.5" /> : <ToggleRight className="w-3.5 h-3.5" />}
                        <span>{plan.active !== false ? "Desativar" : "Ativar"}</span>
                      </button>

                      <button
                        onClick={() => handleDeletePlan(plan.id, plan.name)}
                        className="px-3 py-1.5 bg-red-950/30 hover:bg-red-900/50 border border-red-500/20 text-red-400 hover:text-red-200 font-mono font-bold text-[10px] uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1"
                        title="Remover este plano do sistema"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remover Plano</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Modal to create a new plan */}
            <AnimatePresence>
              {showNewPlanModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
                  <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowNewPlanModal(false)}></div>

                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative w-full max-w-lg bg-[#0e0e11] border border-white/10 rounded-[32px] p-6 sm:p-8 space-y-5 shadow-2xl z-10 overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-green to-yellow-400"></div>

                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                      <div className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-brand-green" />
                        <h3 className="font-display font-black text-lg text-white uppercase italic">
                          Criar Novo Plano do Sistema
                        </h3>
                      </div>
                      <button
                        onClick={() => setShowNewPlanModal(false)}
                        className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleCreatePlan} className="space-y-4 font-mono text-xs">
                      {planActionError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-[10px] uppercase font-bold">
                          {planActionError}
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 uppercase font-bold block">Nome do Plano *</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: Plano Trimestral VIP"
                          value={newPlanName}
                          onChange={(e) => setNewPlanName(e.target.value)}
                          className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-brand-green"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-400 uppercase font-bold block">Categoria</label>
                          <select
                            value={newPlanType}
                            onChange={(e) => setNewPlanType(e.target.value as any)}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-brand-green"
                          >
                            <option value="pro">Pro Premium</option>
                            <option value="boost">Destaque Boost</option>
                            <option value="custom">Customizado</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-400 uppercase font-bold block">Selo / Tag Destaque</label>
                          <input
                            type="text"
                            placeholder="Ex: POPULAR / OFERTA"
                            value={newPlanBadge}
                            onChange={(e) => setNewPlanBadge(e.target.value)}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-brand-green"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-400 uppercase font-bold block">Preço (R$) *</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            required
                            value={newPlanPrice}
                            onChange={(e) => setNewPlanPrice(e.target.value)}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-brand-green"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-400 uppercase font-bold block">Duração (Dias) *</label>
                          <input
                            type="number"
                            min="1"
                            max="3650"
                            required
                            value={newPlanDays}
                            onChange={(e) => setNewPlanDays(Number(e.target.value))}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-brand-green"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 uppercase font-bold block">Descrição Curta</label>
                        <input
                          type="text"
                          placeholder="Ex: Acesso completo com vantagens exclusivas por 90 dias."
                          value={newPlanDescription}
                          onChange={(e) => setNewPlanDescription(e.target.value)}
                          className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-brand-green"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 uppercase font-bold block">Lista de Benefícios (um por linha)</label>
                        <textarea
                          rows={3}
                          placeholder={`Biografias IA Ilimitadas\nSelo Verificado Dourado\nAtletas Ilimitados`}
                          value={newPlanFeatures}
                          onChange={(e) => setNewPlanFeatures(e.target.value)}
                          className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-green leading-relaxed"
                        />
                      </div>

                      <div className="pt-2 flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setShowNewPlanModal(false)}
                          className="px-4 py-2.5 bg-zinc-900 text-zinc-400 hover:text-white rounded-xl uppercase font-bold text-xs"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={creatingPlan}
                          className="px-5 py-2.5 bg-brand-green hover:bg-[#d9ff33] text-black font-display font-black uppercase rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-brand-green/10"
                        >
                          {creatingPlan ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Gravando...
                            </>
                          ) : (
                            "Salvar e Publicar Plano"
                          )}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {activeTab === "payments" && (
          <motion.div
            key="payments"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Search filter for payments */}
            <div className="relative">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Filtrar transações por email, ID de transação ou nome de usuário..."
                value={paymentsSearchQuery}
                onChange={(e) => setPaymentsSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-white/5 rounded-2xl text-xs text-white focus:outline-none focus:border-red-500 font-mono uppercase"
              />
            </div>

            {loadingSubscriptions ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 font-mono">
                <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                <span className="text-[10px] uppercase tracking-widest">Carregando livro caixa...</span>
              </div>
            ) : filteredSubscriptions.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 font-mono text-xs uppercase">Nenhum pagamento localizado.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-[9px] text-zinc-500 uppercase font-bold">
                      <th className="py-3 px-3">Transação</th>
                      <th className="py-3 px-3">Nome de Usuário (Treinador)</th>
                      <th className="py-3 px-3">Descrição / Plano</th>
                      <th className="py-3 px-2 text-center">Valor</th>
                      <th className="py-3 px-2 text-center">Data</th>
                      <th className="py-3 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubscriptions.map((sub) => {
                      const trainerName = getUserNameById(sub.userId, sub.userEmail);
                      return (
                        <tr key={sub.id} className="border-b border-white/5 hover:bg-white/[0.01]">
                          <td className="py-4 px-3 font-mono text-[9px] text-zinc-500" title={sub.id}>
                            {sub.id}
                          </td>
                          <td className="py-4 px-3">
                            <div className="font-bold text-white uppercase">{trainerName}</div>
                            <div className="text-[8px] text-zinc-500 truncate max-w-[150px]">{sub.userEmail || "Sem email"}</div>
                          </td>
                          <td className="py-4 px-3 text-zinc-300">
                            <div className="font-bold">{sub.description || "Transação"}</div>
                            <div className="text-[8px] text-zinc-500 uppercase">MÉTODO: {sub.paymentMethod || "PIX"}</div>
                          </td>
                          <td className="py-4 px-2 text-center font-bold text-brand-green">
                            R$ {sub.amount?.toFixed(2)}
                          </td>
                          <td className="py-4 px-2 text-center text-zinc-400 text-[10px]">
                            {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString("pt-BR") : "S/D"}
                          </td>
                          <td className="py-4 px-3 text-right">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                              sub.status === "approved"
                                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                : sub.status === "pending"
                                ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                                : "bg-red-500/10 border border-red-500/20 text-red-400"
                            }`}>
                              {sub.status === "approved" ? "APROVADO" : sub.status === "pending" ? "PENDENTE" : "CANCELADO"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "config" && (
          <motion.div
            key="config"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-xl"
          >
            <form onSubmit={handleSaveGlobalConfig} className="space-y-5">
              {/* Form elements */}
              <div className="bg-zinc-950 border border-white/5 p-6 rounded-3xl space-y-4 font-mono text-xs">
                <h4 className="font-display font-black text-xs text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-red-500" />
                  Configuração de Parâmetros Globais
                </h4>

                {/* 1. Price */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 uppercase font-bold">Preço do Plano PRO (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={proPrice}
                      onChange={(e) => setProPrice(Number(e.target.value))}
                      className="w-full bg-[#0e0e11] border border-white/5 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  
                  {/* 2. Free limits */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 uppercase font-bold">Limite de IA do Plano Free</label>
                    <input
                      type="number"
                      value={freeAiLimit}
                      onChange={(e) => setFreeAiLimit(Number(e.target.value))}
                      className="w-full bg-[#0e0e11] border border-white/5 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {/* 3. Announcement text */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
                    <Megaphone className="w-3.5 h-3.5 text-yellow-400" />
                    Texto do Banner de Comunicado Global
                  </label>
                  <textarea
                    value={announcementBanner}
                    onChange={(e) => setAnnouncementBanner(e.target.value)}
                    rows={2}
                    placeholder="🏆 Digite sua oferta ou banner de comunicado aqui..."
                    className="w-full bg-[#0e0e11] border border-white/5 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-red-500 leading-relaxed text-xs"
                  />
                </div>

                {/* 4. Show banner boolean */}
                <div className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                  <div>
                    <span className="text-[10px] text-white font-bold uppercase block">Exibir Banner de Comunicado</span>
                    <span className="text-[8px] text-zinc-500">Se ativo, exibe o banner global na parte superior de todos os usuários.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={showBanner}
                    onChange={(e) => setShowBanner(e.target.checked)}
                    className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-6 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-mono font-bold uppercase rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-red-600/15"
                >
                  {savingConfig ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Gravando Configurações...
                    </>
                  ) : (
                    "Salvar Alterações Globais"
                  )}
                </button>
                {configSuccess && (
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                    <Check className="w-4 h-4" />
                    Configuração salva e propagada com sucesso!
                  </span>
                )}
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
