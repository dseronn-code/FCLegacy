export interface PlayerProfile {
  nome_jogador: string;
  clube_inicial: string;
  nacionalidade: string;
  sugestoes_campeonatos_locais: string[];
  perfil_completo_20_perguntas: {
    "1_personalidade": string;
    "2_amigos_reais": string[];
    "3_namorada_real": string;
    "4_situacao_financeira": string;
    "5_historia_de_vida": string;
    "6_vivia_bem": string;
    "7_relacao_familiar": string;
    "8_comportamento": string;
    "9_fortuna_e_carros_reais": string;
    "10_patrocinios_reais": string[];
    "11_expectativa_carreira": string;
    "12_desempenho_campo": string;
    "13_clubes_europa": string[];
    "14_clube_atual": string;
    "15_estilo_altura_idolos": string;
    "16_relacionamentos_elenco": string;
    "17_satisfacao_clube": string;
    "18_time_do_coracao": string;
    "19_nascimento": string;
    "20_biometria": string;
  };
  _is_fallback?: boolean;
}

export interface GenerationParams {
  suggestedName: string;
  nationality: string;
  position: string;
  preferredClub: string;
  personalityType: string;
}

export interface GoalDetails {
  pd: number; // Perna Direita
  pe: number; // Perna Esquerda
  da: number; // Dentro da Área
  fa: number; // Fora da Área
  sa: number; // Sem Assistência
  a: number;  // Com Assistência
}

export interface Match {
  id: string;
  championship: string;
  goals: number;
  assists: number; // PG (Passe de Gol)
  goalDetails: GoalDetails;
  logText: string;
  xg: number;
  createdAt: string;
}

export interface ChampionshipStat {
  championship: string;
  matches: number;
  goals: number;
  assists: number;
  pd: number;
  pe: number;
  da: number;
  fa: number;
  sa: number;
  a: number;
  xg: number;
}

export interface SeasonHistory {
  seasonNumber: number;
  club: string;
  championshipStats: ChampionshipStat[];
  totalMatches: number;
  totalGoals: number;
  totalAssists: number;
  totalXg: number;
}

export interface PlayerCareer {
  id: string;
  userId: string;
  userEmail: string;
  trainerUsername?: string;
  profile: PlayerProfile;
  isPublic: boolean;
  currentClub: string;
  currentSeason: number;
  championships: string[];
  matches: Match[];
  history: SeasonHistory[];
  createdAt: string;
  updatedAt: string;
}
