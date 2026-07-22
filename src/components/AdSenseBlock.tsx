import React, { useEffect } from "react";

export const AdSenseBlock: React.FC = () => {
  useEffect(() => {
    try {
      // Safely request Google AdSense to fill the ad slot
      const adsbygoogle = (window as any).adsbygoogle || [];
      adsbygoogle.push({});
    } catch (e) {
      console.warn("[AdSense] Error pushing ad element:", e);
    }
  }, []);

  return (
    <div className="w-full overflow-hidden flex flex-col items-center justify-center py-3 px-4 bg-zinc-950/60 rounded-2xl border border-white/5 min-h-[110px] mt-3">
      <span className="text-[7px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Anúncio do Google</span>
      <div className="w-full flex justify-center">
        <ins
          className="adsbygoogle"
          style={{ display: "block", width: "100%", minHeight: "90px" }}
          data-ad-client="ca-pub-4462510831945022"
          data-ad-format="horizontal"
          data-full-width-responsive="true"
        />
      </div>
    </div>
  );
};
