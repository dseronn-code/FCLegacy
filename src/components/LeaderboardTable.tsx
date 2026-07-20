import React, { useState, useEffect } from "react";
import { Trophy, Activity, Award, Loader2, User } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

interface LeaderboardItem {
  id: string;
  playerName: string;
  club: string;
  nationality: string;
  position: string;
  matches: number;
  goals: number;
  assists: number;
  total: number;
  trainerUsername: string;
}

interface LeaderboardTableProps {
  onRowClick: (playerId: string) => void;
}

export const LeaderboardTable: React.FC<LeaderboardTableProps> = ({ onRowClick }) => {
  const [filter, setFilter] = useState<"total" | "goals" | "assists">("total");
  const [items, setItems] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setLoading(true);
    const careersRef = collection(db, "careers");
    const q = query(careersRef, where("isPublic", "==", true));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const leaderboardList: LeaderboardItem[] = [];
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
            id: career.id || docSnap.id,
            playerName: career.profile.nome_jogador || "Atleta Anônimo",
            club: career.currentClub || "Clube",
            nationality: career.profile.nacionalidade || "Nacionalidade",
            position: career.profile.perfil_completo_20_perguntas?.["15_estilo_altura_idolos"]?.split(" ")[0] || "ATA",
            matches: totalMatches,
            goals: totalGoals,
            assists: totalAssists,
            total: totalPoints,
            trainerUsername: career.trainerUsername || career.userEmail?.split("@")[0] || "Treinador"
          });
        });

        // Dynamic sort
        const field = filter === "goals" ? "goals" : (filter === "assists" ? "assists" : "total");
        leaderboardList.sort((a, b) => {
          if (b[field] !== a[field]) {
            return b[field] - a[field];
          }
          if (field === "total" && b.goals !== a.goals) {
            return b.goals - a.goals;
          }
          return b.matches - a.matches; // fewer matches is tie-breaker
        });

        setItems(leaderboardList.slice(0, 10));
        setLoading(false);
      },
      (error) => {
        console.error("Erro no onSnapshot do ranking global:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [filter]);

  return (
    <div className="bg-[#0c0c0e] border border-white/5 rounded-3xl p-5 sm:p-6 space-y-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 p-4 opacity-[0.02] pointer-events-none">
        <Trophy className="w-24 h-24 text-brand-green" />
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-brand-green/15 text-brand-green rounded-lg">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[8px] font-mono text-zinc-500 block uppercase tracking-widest">Global Top 10</span>
            <h3 className="font-display font-bold text-xs text-white uppercase tracking-wider">Hall da Fama de Legados</h3>
          </div>
        </div>

        {/* Dynamic Filters */}
        <div className="flex bg-black/60 p-1 border border-white/5 rounded-xl gap-1">
          {(["total", "goals", "assists"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className={`px-3 py-1 text-[9px] font-mono font-bold uppercase rounded-lg transition-all cursor-pointer ${
                filter === opt
                  ? "bg-brand-green text-black shadow-lg"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {opt === "total" ? "G+A" : opt === "goals" ? "Gols" : "Assists"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin text-brand-green" />
          <span className="text-[10px] font-mono uppercase tracking-widest">Carregando Classificação...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 font-mono text-[10px] uppercase">
          Nenhum legado público registrado no ranking ainda.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono">
            <thead>
              <tr className="border-b border-white/5 text-[9px] text-zinc-500 uppercase font-bold">
                <th className="py-2.5 px-2 text-center w-10">Pos</th>
                <th className="py-2.5 px-3">Atleta</th>
                <th className="py-2.5 px-3">Nac / Clube</th>
                <th className="py-2.5 px-2 text-center">Part</th>
                <th className="py-2.5 px-2 text-center text-brand-green">Gols</th>
                <th className="py-2.5 px-2 text-center text-white">PG</th>
                <th className="py-2.5 px-2 text-center text-yellow-400">Total</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              <AnimatePresence mode="popLayout">
                {items.map((player, index) => {
                  const rank = index + 1;
                  return (
                    <motion.tr
                      key={player.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      onClick={() => onRowClick(player.id)}
                      className="border-b border-white/5 hover:bg-brand-green/5 cursor-pointer transition-colors group"
                    >
                      <td className="py-3 px-2 text-center font-display font-black text-xs text-zinc-400 group-hover:text-brand-green">
                        {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-display font-black text-white group-hover:text-brand-green transition-colors leading-tight">
                          {player.playerName}
                        </div>
                        <div className="text-[8px] text-zinc-500 font-normal truncate max-w-[120px]">
                          Treinador: {player.trainerUsername}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-zinc-400">
                        <div className="text-[10px] leading-tight font-bold">{player.club}</div>
                        <div className="text-[8px] text-zinc-500 uppercase">{player.nationality}</div>
                      </td>
                      <td className="py-3 px-2 text-center text-zinc-400">{player.matches}</td>
                      <td className="py-3 px-2 text-center font-bold text-brand-green">{player.goals}</td>
                      <td className="py-3 px-2 text-center font-bold text-zinc-300">{player.assists}</td>
                      <td className="py-3 px-2 text-center font-display font-black text-sm text-yellow-400 bg-yellow-500/5 group-hover:bg-yellow-500/10">
                        {player.total}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[8px] text-zinc-500 uppercase text-center font-mono mt-1">
        💡 Clique em qualquer linha para acessar o legado de carreira do atleta.
      </div>
    </div>
  );
};
