import React, { useState, useEffect, useRef } from "react";
import { 
  Music, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, 
  ListMusic, Smartphone, Radio, ChevronDown, ChevronUp, Loader2, RefreshCw, ExternalLink, Sparkles, Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SpotifyWidgetProps {
  userId: string;
  onOpenSettings?: () => void;
}

export const SpotifyWidget: React.FC<SpotifyWidgetProps> = ({ userId, onOpenSettings }) => {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [track, setTrack] = useState<any | null>(null);
  const [device, setDevice] = useState<any | null>(null);
  const [nextTrack, setNextTrack] = useState<any | null>(null);
  const [progressMs, setProgressMs] = useState<number>(0);
  const [durationMs, setDurationMs] = useState<number>(0);
  const [volume, setVolume] = useState<number>(50);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [loadingAction, setLoadingAction] = useState<boolean>(false);
  
  // Playlists state
  const [showPlaylists, setShowPlaylists] = useState<boolean>(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState<boolean>(false);
  const [playingPlaylistUri, setPlayingPlaylistUri] = useState<string | null>(null);

  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch Spotify player state
  const fetchPlayerState = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/spotify/player/state?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) return;
      const data = await res.json();

      setConnected(data.connected);
      if (data.connected) {
        setIsPlaying(data.isPlaying);
        setTrack(data.track);
        setDevice(data.device);
        setNextTrack(data.nextTrack);
        setProgressMs(data.progressMs || 0);
        setDurationMs(data.durationMs || 0);
        if (data.device?.volumePercent !== undefined) {
          setVolume(data.device.volumePercent);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar estado do Spotify:", err);
    }
  };

  // Initial check and periodic polling
  useEffect(() => {
    fetchPlayerState();
    const pollInterval = setInterval(fetchPlayerState, 3500);
    return () => clearInterval(pollInterval);
  }, [userId]);

  // Smooth local timeline progression when playing
  useEffect(() => {
    if (isPlaying && durationMs > 0) {
      progressIntervalRef.current = setInterval(() => {
        setProgressMs((prev) => {
          if (prev + 1000 >= durationMs) {
            fetchPlayerState();
            return durationMs;
          }
          return prev + 1000;
        });
      }, 1000);
    } else {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isPlaying, durationMs]);

  // Fetch user playlists when dropdown opened
  const handleTogglePlaylists = async () => {
    const nextState = !showPlaylists;
    setShowPlaylists(nextState);

    if (nextState && playlists.length === 0) {
      setLoadingPlaylists(true);
      try {
        const res = await fetch(`/api/spotify/playlists?userId=${encodeURIComponent(userId)}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setPlaylists(data);
        }
      } catch (err) {
        console.error("Erro ao carregar playlists:", err);
      } finally {
        setLoadingPlaylists(false);
      }
    }
  };

  // Control action handlers
  const handlePlayPause = async () => {
    if (loadingAction) return;
    setLoadingAction(true);
    const nextAction = isPlaying ? "pause" : "play";
    setIsPlaying(!isPlaying);

    try {
      await fetch("/api/spotify/player/play-pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: nextAction })
      });
      setTimeout(fetchPlayerState, 600);
    } catch (err) {
      console.error(err);
      fetchPlayerState();
    } finally {
      setLoadingAction(false);
    }
  };

  const handleNext = async () => {
    setLoadingAction(true);
    try {
      await fetch("/api/spotify/player/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
      setTimeout(fetchPlayerState, 800);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAction(false);
    }
  };

  const handlePrevious = async () => {
    setLoadingAction(true);
    try {
      await fetch("/api/spotify/player/previous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
      setTimeout(fetchPlayerState, 800);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleSeek = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPos = Number(e.target.value);
    setProgressMs(newPos);
    try {
      await fetch("/api/spotify/player/seek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, positionMs: newPos })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = Number(e.target.value);
    setVolume(newVol);
    try {
      await fetch("/api/spotify/player/volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, volumePercent: newVol })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handlePlayPlaylist = async (playlistUri: string) => {
    setPlayingPlaylistUri(playlistUri);
    try {
      await fetch("/api/spotify/player/play-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, contextUri: playlistUri })
      });
      setShowPlaylists(false);
      setTimeout(fetchPlayerState, 1000);
    } catch (err) {
      console.error(err);
    } finally {
      setPlayingPlaylistUri(null);
    }
  };

  const formatTime = (ms: number) => {
    if (!ms || isNaN(ms)) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const formatRemainingTime = (currentMs: number, totalMs: number) => {
    if (!totalMs || totalMs <= currentMs) return "-0:00";
    const remainMs = totalMs - currentMs;
    const totalSeconds = Math.floor(remainMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `-${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Connect Spotify OAuth Flow
  const handleConnectSpotify = async () => {
    try {
      const res = await fetch(`/api/spotify/auth-url?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (data.url) {
        const popup = window.open(data.url, "spotify_oauth", "width=600,height=700");
        
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          await fetchPlayerState();
          if (popup && popup.closed) {
            clearInterval(interval);
            fetchPlayerState();
          }
          if (attempts > 30) {
            clearInterval(interval);
          }
        }, 1500);
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao solicitar autorização do Spotify.");
    }
  };

  // Listen for OAuth message
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "SPOTIFY_AUTH_SUCCESS") {
        fetchPlayerState();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // 1. DISCONNECTED STATE VIEW
  if (connected === false) {
    return (
      <div id="spotify-player-widget" className="relative overflow-hidden bg-[#0a0a0d]/90 backdrop-blur-xl border border-white/10 rounded-[28px] p-5 shadow-2xl transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#1DB954]/15 border border-[#1DB954]/30 text-[#1DB954] rounded-xl">
              <Music className="w-4 h-4" />
            </span>
            <span className="font-display font-black text-xs text-white uppercase tracking-wider">Spotify Player</span>
          </div>
          <span className="px-2 py-0.5 bg-zinc-800/80 text-[9px] font-mono font-bold text-zinc-400 rounded-lg">Offline</span>
        </div>

        <div className="py-4 text-center space-y-3">
          <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
            Conecte sua conta do Spotify para ouvir suas playlists e controlar suas músicas diretamente no Dashboard do <strong className="text-white">FC Legacy</strong>.
          </p>
          <button
            onClick={handleConnectSpotify}
            className="px-5 py-2.5 bg-[#1DB954] hover:bg-[#1ed760] text-black font-display font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_0_15px_rgba(29,185,84,0.3)] hover:shadow-[0_0_22px_rgba(29,185,84,0.5)] cursor-pointer inline-flex items-center justify-center gap-2"
          >
            <Music className="w-4 h-4 fill-black" />
            Conectar Spotify
          </button>
        </div>
      </div>
    );
  }

  // 2. CONNECTED BUT NO TRACK PLAYING VIEW (IDLE)
  if (connected && !track) {
    return (
      <div id="spotify-player-widget" className="relative overflow-hidden bg-[#0a0a0d]/90 backdrop-blur-xl border border-white/10 rounded-[28px] p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#1DB954]/20 border border-[#1DB954]/40 text-[#1DB954] rounded-xl shadow-[0_0_10px_rgba(29,185,84,0.2)]">
              <Music className="w-4 h-4" />
            </span>
            <div>
              <span className="font-display font-black text-xs text-white uppercase tracking-wider block">Spotify Player</span>
              <span className="text-[9px] font-mono text-[#1DB954] font-bold">Conectado</span>
            </div>
          </div>

          <button
            onClick={fetchPlayerState}
            className="p-1.5 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg transition-all cursor-pointer"
            title="Atualizar estado"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 bg-zinc-950/60 border border-white/5 rounded-2xl text-center space-y-3">
          <p className="text-xs text-zinc-300 font-medium">
            Nenhuma música tocando no momento.
          </p>

          <button
            onClick={handleTogglePlaylists}
            className="px-4 py-2 bg-gradient-to-r from-[#1DB954] to-emerald-500 text-black font-display font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-[0_0_12px_rgba(29,185,84,0.25)] hover:shadow-[0_0_18px_rgba(29,185,84,0.4)] cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            <ListMusic className="w-3.5 h-3.5" />
            Abrir Minhas Playlists
          </button>
        </div>

        {/* Playlists Dropdown List */}
        {showPlaylists && (
          <div className="space-y-2 border-t border-white/5 pt-3 animate-fadeIn">
            <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">Selecione uma Playlist</span>
            {loadingPlaylists ? (
              <div className="py-4 text-center text-zinc-500 flex items-center justify-center gap-2 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-[#1DB954]" />
                Carregando suas playlists...
              </div>
            ) : playlists.length > 0 ? (
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 font-mono">
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => handlePlayPlaylist(pl.uri)}
                    className="w-full text-left p-2 bg-zinc-900/60 hover:bg-zinc-800 border border-white/5 hover:border-[#1DB954]/30 rounded-xl transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {pl.images ? (
                        <img src={pl.images} alt={pl.name} className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500">
                          <Music className="w-4 h-4" />
                        </div>
                      )}
                      <div className="truncate">
                        <span className="text-xs text-white font-bold block truncate group-hover:text-[#1DB954] transition-colors">{pl.name}</span>
                        <span className="text-[9px] text-zinc-500">{pl.tracksCount} faixas</span>
                      </div>
                    </div>
                    {playingPlaylistUri === pl.uri ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1DB954]" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-zinc-500 group-hover:text-[#1DB954] fill-current transition-colors" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-zinc-500 py-2 text-center">Nenhuma playlist localizada na sua biblioteca do Spotify.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // 3. ACTIVE PLAYING PLAYER WIDGET (iOS / APPLE MUSIC GLASSMORPHISM STYLE)
  return (
    <div id="spotify-player-widget" className="relative overflow-hidden bg-[#09090c]/90 backdrop-blur-2xl border border-white/10 rounded-[32px] p-5 shadow-[0_15px_40px_rgba(0,0,0,0.8)] space-y-4 group">
      {/* Background ambient glow matching album art */}
      <div 
        className="absolute -inset-10 opacity-20 blur-3xl pointer-events-none transition-all duration-1000"
        style={{
          backgroundImage: track?.albumArt ? `url(${track.albumArt})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      ></div>

      {/* Header Bar */}
      <div className="relative z-10 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-[#1DB954]/20 border border-[#1DB954]/40 text-[#1DB954] rounded-xl shadow-[0_0_12px_rgba(29,185,84,0.3)]">
            <Music className="w-3.5 h-3.5 animate-pulse" />
          </span>
          <span className="font-display font-black text-xs text-white uppercase tracking-wider">Spotify Media Control</span>
        </div>

        {device && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] font-mono text-zinc-300">
            <Smartphone className="w-3 h-3 text-[#1DB954]" />
            <span className="truncate max-w-[100px]">{device.name}</span>
          </div>
        )}
      </div>

      {/* Album Cover & Track Info (Bento Card Style) */}
      <div className="relative z-10 flex items-center gap-4">
        {/* Album Artwork */}
        <div className="relative shrink-0 w-20 h-20 sm:w-22 sm:h-22 rounded-2xl overflow-hidden shadow-[0_10px_25px_rgba(0,0,0,0.6)] border border-white/10">
          {track?.albumArt ? (
            <img 
              src={track.albumArt} 
              alt={track.name} 
              className={`w-full h-full object-cover transition-transform duration-700 ${isPlaying ? "scale-105" : "scale-100 filter grayscale-[20%]"}`}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center text-zinc-500">
              <Music className="w-8 h-8" />
            </div>
          )}

          {isPlaying && (
            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded-md flex items-center gap-1 border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-ping"></span>
              <span className="text-[8px] font-mono text-[#1DB954] font-bold">LIVE</span>
            </div>
          )}
        </div>

        {/* Track Title & Band */}
        <div className="flex-1 min-w-0 space-y-1">
          <h4 className="font-display font-black text-base text-white truncate leading-tight tracking-tight">
            {track?.name || "Sem título"}
          </h4>
          <p className="text-xs text-zinc-300 font-medium truncate">
            {track?.artist || "Artista desconhecido"}
          </p>
          {track?.album && (
            <p className="text-[10px] text-zinc-500 font-mono truncate">
              {track.album}
            </p>
          )}
        </div>
      </div>

      {/* Timeline Scrubber (Interactive Range Input) */}
      <div className="relative z-10 space-y-1.5">
        <input 
          type="range"
          min={0}
          max={durationMs || 100}
          value={progressMs}
          onChange={handleSeek}
          className="w-full h-1.5 bg-zinc-800 hover:bg-zinc-700 accent-[#1DB954] rounded-lg appearance-none cursor-pointer transition-all"
        />
        <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 font-bold">
          <span>{formatTime(progressMs)}</span>
          <span>{formatRemainingTime(progressMs, durationMs)}</span>
        </div>
      </div>

      {/* Main Playback Controls */}
      <div className="relative z-10 flex items-center justify-between pt-1">
        {/* Playlist Toggle */}
        <button
          onClick={handleTogglePlaylists}
          className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
            showPlaylists 
              ? "bg-[#1DB954]/20 border-[#1DB954]/40 text-[#1DB954]" 
              : "bg-white/5 border-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
          }`}
          title="Playlists"
        >
          <ListMusic className="w-4 h-4" />
        </button>

        {/* Media Buttons Group */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrevious}
            disabled={loadingAction}
            className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-zinc-300 hover:text-white rounded-2xl transition-all cursor-pointer disabled:opacity-50"
            title="Anterior"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={handlePlayPause}
            disabled={loadingAction}
            className="p-4 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-2xl transition-all shadow-[0_0_20px_rgba(29,185,84,0.4)] hover:shadow-[0_0_28px_rgba(29,185,84,0.6)] cursor-pointer disabled:opacity-50 flex items-center justify-center transform active:scale-95"
            title={isPlaying ? "Pausar" : "Tocar"}
          >
            {loadingAction ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-black" />
            ) : (
              <Play className="w-5 h-5 fill-black ml-0.5" />
            )}
          </button>

          <button
            onClick={handleNext}
            disabled={loadingAction}
            className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-zinc-300 hover:text-white rounded-2xl transition-all cursor-pointer disabled:opacity-50"
            title="Próxima"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>
        </div>

        {/* Volume Control */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              const nextMute = !isMuted;
              setIsMuted(nextMute);
              handleVolumeChange({ target: { value: nextMute ? 0 : 50 } } as any);
            }}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input 
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 h-1 bg-zinc-800 accent-[#1DB954] rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      {/* Next Up Info (A Seguir) */}
      {nextTrack && (
        <div className="relative z-10 bg-zinc-950/60 border border-white/5 p-2.5 rounded-xl flex items-center justify-between text-[10px] font-mono">
          <div className="flex items-center gap-2 truncate">
            <span className="text-[#1DB954] font-bold">A seguir:</span>
            <span className="text-zinc-300 font-bold truncate">{nextTrack.name}</span>
            <span className="text-zinc-500 truncate">- {nextTrack.artist}</span>
          </div>
        </div>
      )}

      {/* Playlists Selector Dropdown */}
      {showPlaylists && (
        <div className="relative z-10 space-y-2 border-t border-white/10 pt-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider">Playlists do Usuário</span>
            <button 
              onClick={() => setShowPlaylists(false)}
              className="text-[9px] font-mono text-zinc-500 hover:text-white"
            >
              Fechar
            </button>
          </div>

          {loadingPlaylists ? (
            <div className="py-4 text-center text-zinc-500 flex items-center justify-center gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-[#1DB954]" />
              Carregando playlists...
            </div>
          ) : playlists.length > 0 ? (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 font-mono">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => handlePlayPlaylist(pl.uri)}
                  className="w-full text-left p-2 bg-zinc-900/80 hover:bg-zinc-800 border border-white/5 hover:border-[#1DB954]/30 rounded-xl transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {pl.images ? (
                      <img src={pl.images} alt={pl.name} className="w-8 h-8 rounded-lg object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500">
                        <Music className="w-4 h-4" />
                      </div>
                    )}
                    <div className="truncate">
                      <span className="text-xs text-white font-bold block truncate group-hover:text-[#1DB954] transition-colors">{pl.name}</span>
                      <span className="text-[9px] text-zinc-500">{pl.tracksCount} faixas</span>
                    </div>
                  </div>
                  {playingPlaylistUri === pl.uri ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1DB954]" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-zinc-500 group-hover:text-[#1DB954] fill-current transition-colors" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-zinc-500 py-2 text-center">Nenhuma playlist localizada na sua biblioteca do Spotify.</p>
          )}
        </div>
      )}
    </div>
  );
};
