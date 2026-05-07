import { useState, useCallback, useRef, useEffect } from "react";
import { Router as WouterRouter, Route, Switch, useLocation } from "wouter";

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── localStorage helpers (shared with Blackjack / Craps) ─────────────────────
function getLocalBankroll(): number {
  try {
    const u = localStorage.getItem("lastBlackjackUser");
    if (u) { const d = JSON.parse(localStorage.getItem("blackjackSave_" + u) ?? "{}"); return typeof d.bankroll === "number" ? d.bankroll : 1000; }
  } catch {}
  return 1000;
}
function saveLocalBankroll(n: number) {
  try {
    const u = localStorage.getItem("lastBlackjackUser");
    if (u) { const raw = localStorage.getItem("blackjackSave_" + u); const d = raw ? JSON.parse(raw) : {}; d.bankroll = n; localStorage.setItem("blackjackSave_" + u, JSON.stringify(d)); }
  } catch {}
}
function getPlayerName(): string { try { return localStorage.getItem("lastBlackjackUser") ?? ""; } catch { return ""; } }

// ── Symbols ────────────────────────────────────────────────────────────────────
interface Sym { id: string; label: string; emoji?: string; imgUrl?: string; isDealer: boolean; color: string; textColor?: string }

const DEALERS: Sym[] = [
  { id: "bean",       label: "Bean",        imgUrl: "/dealer1.png", isDealer: true, color: "#2c7a2c", textColor: "#fff" },
  { id: "lj",         label: "LJ",          imgUrl: "/dealer2.png", isDealer: true, color: "#1a3a6b", textColor: "#fff" },
  { id: "willum",     label: "WillYum",     imgUrl: "/dealer3.png", isDealer: true, color: "#6b1a1a", textColor: "#fff" },
  { id: "greatclips", label: "Great Clips", imgUrl: "/dealer4.png", isDealer: true, color: "#8b6a00", textColor: "#fff" },
  { id: "bobross",    label: "Bob Ross",    imgUrl: "/dealer6.png", isDealer: true, color: "#4b2c7a", textColor: "#fff" },
  { id: "bigsex",     label: "Big Sexy",    imgUrl: "/dealer7.jpg", isDealer: true, color: "#7a2c5a", textColor: "#fff" },
  { id: "shamu",      label: "Shamu 🐋",    imgUrl: "/dealer5.png", isDealer: true, color: "#0a3a5a", textColor: "#fff" },
  { id: "forehead",   label: "Forehead",    imgUrl: "/dealer8.jpg", isDealer: true, color: "#7a2c7a", textColor: "#fff" },
  { id: "jizzy",      label: "Jizzy",       imgUrl: "/dealer9.jpg", isDealer: true, color: "#a0522d", textColor: "#fff" },
];
const SEA: Sym[] = [
  { id: "wave",    label: "Wave",    emoji: "🌊", isDealer: false, color: "#1565c0" },
  { id: "anchor",  label: "Anchor",  emoji: "⚓", isDealer: false, color: "#37474f" },
  { id: "shell",   label: "Shell",   emoji: "🐚", isDealer: false, color: "#bf8040" },
  { id: "octopus", label: "Octopus", emoji: "🐙", isDealer: false, color: "#8e24aa" },
  { id: "crab",    label: "Crab",    emoji: "🦀", isDealer: false, color: "#c62828" },
  { id: "shark",   label: "Shark",   emoji: "🦈", isDealer: false, color: "#1e88e5" },
  { id: "fish",    label: "Fish",    emoji: "🐠", isDealer: false, color: "#e65100" },
];

function buildReelStrip(): Sym[] {
  const strip: Sym[] = [];
  for (let i = 0; i < 4; i++) strip.push(...SEA);
  strip.push(...DEALERS);
  return strip.sort(() => Math.random() - 0.5);
}

function payout(s1: Sym, s2: Sym, s3: Sym): { mult: number; label: string; bonus: boolean } {
  const allSame = s1.id === s2.id && s2.id === s3.id;
  const allDealers = s1.isDealer && s2.isDealer && s3.isDealer;
  const twoDealers = [s1, s2, s3].filter(s => s.isDealer).length === 2;
  const twoSea = !s1.isDealer && !s2.isDealer && !s3.isDealer && (s1.id === s2.id || s2.id === s3.id || s1.id === s3.id);

  if (allDealers && allSame)  return { mult: 500, label: "JACKPOT — 3× " + s1.label + "!", bonus: true };
  if (allDealers)             return { mult: 0,   label: "BONUS ROUND!",                   bonus: true };
  if (allSame && s1.id === "fish")    return { mult: 100, label: "3× Fish! 🐠",    bonus: false };
  if (allSame && s1.id === "shark")   return { mult: 40,  label: "3× Shark! 🦈",   bonus: false };
  if (allSame && s1.id === "crab")    return { mult: 20,  label: "3× Crab! 🦀",    bonus: false };
  if (allSame && s1.id === "octopus") return { mult: 12,  label: "3× Octopus! 🐙", bonus: false };
  if (allSame && s1.id === "shell")   return { mult: 8,   label: "3× Shell! 🐚",   bonus: false };
  if (allSame && s1.id === "anchor")  return { mult: 5,   label: "3× Anchor! ⚓",   bonus: false };
  if (allSame && s1.id === "wave")    return { mult: 2,   label: "3× Wave! 🌊",    bonus: false };
  if (twoDealers)   return { mult: 10, label: "2 Dealers!",  bonus: false };
  if (twoSea)       return { mult: 1,  label: "2 Matching!", bonus: false };
  return { mult: 0, label: "No win", bonus: false };
}

// ── Symbol tile ────────────────────────────────────────────────────────────────
function SymTile({ sym, size = 90, glow }: { sym: Sym; size?: number; glow?: boolean }) {
  const border = glow ? "3px solid gold" : sym.isDealer ? "3px solid rgba(255,255,255,0.25)" : "3px solid #1e5a9a";
  const shadow = glow ? `0 0 20px gold, 0 0 40px ${sym.color}` : "inset 0 0 10px rgba(0,0,0,0.5)";

  return (
    <div style={{
      width: size, height: size, borderRadius: 12,
      background: sym.isDealer
        ? `linear-gradient(135deg, ${sym.color}dd, ${sym.color}88)`
        : "linear-gradient(135deg, #0a2a4a, #0d3a6a)",
      border, boxShadow: shadow,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      transition: "box-shadow 0.2s", overflow: "hidden", userSelect: "none", position: "relative",
    }}>
      {sym.imgUrl ? (
        <>
          <img
            src={sym.imgUrl}
            alt={sym.label}
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              borderRadius: 9,
            }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          {/* Name badge at bottom */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            background: `${sym.color}dd`,
            fontSize: Math.max(7, size * 0.12),
            fontWeight: "bold", color: "#fff",
            textAlign: "center", padding: "2px 2px",
            lineHeight: 1.2,
          }}>
            {sym.label}
          </div>
        </>
      ) : sym.emoji ? (
        <span style={{ fontSize: size * 0.45 }}>{sym.emoji}</span>
      ) : (
        <span style={{ fontSize: size * 0.18, fontWeight: "bold", color: sym.textColor ?? "#fff", textAlign: "center", padding: "0 4px", lineHeight: 1.2 }}>
          {sym.label}
        </span>
      )}
    </div>
  );
}

// ── BONUS pick game ────────────────────────────────────────────────────────────
function BonusScreen({ bet, onFinish }: { bet: number; onFinish: (prize: number) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const prizes = useRef([10, 25, 50].sort(() => Math.random() - 0.5) as number[]);

  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    setTimeout(() => onFinish(prizes.current[i] * bet), 1800);
  };

  return (
    <div style={{ textAlign: "center", padding: "20px 10px" }}>
      <div style={{ fontSize: 26, fontWeight: "bold", color: "gold", marginBottom: 6, textShadow: "0 0 16px gold" }}>
        🎉 BONUS ROUND!
      </div>
      <div style={{ color: "#7ec8e3", marginBottom: 24, fontSize: 14 }}>
        3 Dealers on the reels! Pick a treasure chest to reveal your prize.
      </div>
      <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
        {[0, 1, 2].map(i => (
          <button key={i} onClick={() => pick(i)} disabled={picked !== null} style={{
            width: 110, height: 110, borderRadius: 16,
            background: picked === i ? "linear-gradient(135deg, gold, #b8860b)" : "linear-gradient(135deg, #1a3a6b, #2d5fa8)",
            border: picked === i ? "4px solid gold" : "3px solid #4a7ab5",
            cursor: picked !== null ? "default" : "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            fontSize: 40, boxShadow: picked === i ? "0 0 24px gold" : "none",
            transition: "all 0.3s",
          }}>
            {picked !== null
              ? <span style={{ fontSize: 22, fontWeight: "bold", color: picked === i ? "black" : "#aaa" }}>{prizes.current[i]}×</span>
              : "🎁"}
          </button>
        ))}
      </div>
      {picked !== null && (
        <div style={{ marginTop: 20, fontSize: 20, fontWeight: "bold", color: "#2ecc71", textShadow: "0 0 10px #2ecc71" }}>
          You win {prizes.current[picked]}× your bet = ${prizes.current[picked] * bet}!
        </div>
      )}
    </div>
  );
}

// ── Main Slots component ────────────────────────────────────────────────────────
const CHIP_DENOMS = [1, 5, 25, 100];
const CHIP_COLORS: Record<number, string> = { 1: "#c8c8c8", 5: "#c0392b", 25: "#1a5276", 100: "#6c3483" };

function Slots() {
  const [, setLocation] = useLocation();

  const strips = useRef([buildReelStrip(), buildReelStrip(), buildReelStrip()]);
  const [reelIdx, setReelIdx] = useState([0, 0, 0]);
  const [spinning, setSpinning] = useState(false);
  const [bankroll, setBankroll] = useState(getLocalBankroll);
  // Sticky bet: just the selected denomination per spin, never deducted until spin
  const [betPerSpin, setBetPerSpin] = useState(5);
  const [message, setMessage] = useState("Select a bet and pull the lever!");
  const [msgType, setMsgType] = useState<"win" | "lose" | "neutral" | "bonus">("neutral");
  const [glowing, setGlowing] = useState(false);
  const [showBonus, setShowBonus] = useState(false);
  const [lastBet, setLastBet] = useState(5);
  const [history, setHistory] = useState<{ roll: string; amount: number }[]>([]);
  const [showAndy, setShowAndy] = useState(false);
  const [showWhale, setShowWhale] = useState(false);
  const [showLucas, setShowLucas] = useState(false);
  const [showElise, setShowElise] = useState(false);
  const playerName = getPlayerName();

  useEffect(() => {
    const n = playerName.toLowerCase();
    if (n === "andy")  setTimeout(() => { setShowAndy(true);  setTimeout(() => setShowAndy(false),  1800); }, 300);
    if (n === "noah")  setTimeout(() => { setShowWhale(true); setTimeout(() => setShowWhale(false), 1800); }, 300);
    if (n === "lucas") setTimeout(() => { setShowLucas(true); setTimeout(() => setShowLucas(false), 1800); }, 300);
    if (n === "elise") setTimeout(() => { setShowElise(true); setTimeout(() => setShowElise(false), 1800); }, 300);
  }, []);

  const strip = (r: number) => strips.current[r];

  const spin = useCallback(async () => {
    if (spinning) return;
    if (bankroll < betPerSpin) { setMessage("Not enough bankroll!"); setMsgType("neutral"); return; }

    // Deduct bet at spin time
    const newBankrollAfterBet = bankroll - betPerSpin;
    setBankroll(newBankrollAfterBet);
    saveLocalBankroll(newBankrollAfterBet);

    setLastBet(betPerSpin);
    setSpinning(true);
    setGlowing(false);
    setMessage("Spinning…");
    setMsgType("neutral");

    const targetIdx = strips.current.map(s => Math.floor(Math.random() * s.length));

    const spinReel = async (r: number, delay: number) => {
      await sleep(delay);
      const steps = 18 + r * 8;
      for (let i = 0; i < steps; i++) {
        setReelIdx(prev => {
          const next = [...prev];
          next[r] = (next[r] + 1) % strips.current[r].length;
          return next;
        });
        await sleep(55 + i * (r === 0 ? 4 : r === 1 ? 5 : 6));
      }
      setReelIdx(prev => {
        const next = [...prev];
        next[r] = targetIdx[r];
        return next;
      });
    };

    await Promise.all([spinReel(0, 0), spinReel(1, 200), spinReel(2, 450)]);
    await sleep(200);

    const s1 = strips.current[0][targetIdx[0]];
    const s2 = strips.current[1][targetIdx[1]];
    const s3 = strips.current[2][targetIdx[2]];
    const result = payout(s1, s2, s3);

    if (result.bonus) {
      setShowBonus(true);
      setMsgType("bonus");
      setMessage(result.label);
      setSpinning(false);
      return;
    }

    const winAmount = result.mult * betPerSpin;
    const finalBankroll = newBankrollAfterBet + winAmount;
    setBankroll(finalBankroll);
    saveLocalBankroll(finalBankroll);
    setGlowing(winAmount > 0);
    setMessage(winAmount > 0 ? `${result.label} +$${winAmount}!` : result.label);
    setMsgType(winAmount > 0 ? "win" : "lose");
    setHistory(h => [{
      roll: `${s1.emoji ?? s1.label} | ${s2.emoji ?? s2.label} | ${s3.emoji ?? s3.label}`,
      amount: winAmount - betPerSpin,
    }, ...h].slice(0, 8));
    setSpinning(false);
  }, [spinning, betPerSpin, bankroll]);

  const handleBonusFinish = (prize: number) => {
    const newBankroll = bankroll + prize;
    setBankroll(newBankroll);
    saveLocalBankroll(newBankroll);
    setShowBonus(false);
    setMessage(`Bonus pays $${prize}! 🎉`);
    setMsgType("win");
    setGlowing(true);
    setHistory(h => [{ roll: "🎁 BONUS", amount: prize - lastBet }, ...h].slice(0, 8));
  };

  const resetMoney = () => {
    if (spinning) return;
    setBankroll(1000);
    saveLocalBankroll(1000);
    setMessage("Money reset. Good luck!");
    setMsgType("neutral");
    setGlowing(false);
  };

  const msgColors = { win: "#2ecc71", lose: "#e74c3c", neutral: "white", bonus: "gold" };
  const canSpin = !spinning && !showBonus && bankroll >= betPerSpin;

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, #001030, #000820 60%, #000510)",
      color: "white", fontFamily: "Arial, sans-serif",
      textAlign: "center", padding: "0 0 40px 0",
    }}>
      <style>{`
        @keyframes bubbles {
          0%   { transform: translateY(0) scale(1); opacity: 0.6; }
          100% { transform: translateY(-100vh) scale(1.5); opacity: 0; }
        }
        @keyframes winPulse {
          0%,100% { box-shadow: 0 0 20px gold; }
          50%      { box-shadow: 0 0 50px gold, 0 0 80px #ff8800; }
        }
        @keyframes pop {
          0%   { transform: scale(0.85); opacity: 0; }
          60%  { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1);    opacity: 1; }
        }
        @keyframes reel-flash {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.6; }
        }
        @keyframes chipPulse {
          0%,100% { transform: scale(1); }
          50%      { transform: scale(1.08); }
        }
        @keyframes andyPop {
          0%   { transform: translate(-50%, -50%) scale(0.2) rotate(10deg);  opacity: 0; }
          30%  { transform: translate(-50%, -50%) scale(1.3)  rotate(-6deg); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1)    rotate(0deg);  opacity: 0; }
        }
        @keyframes whalePop {
          0%   { transform: translate(-50%, -50%) scale(0.3) rotate(-8deg); opacity: 0; }
          35%  { transform: translate(-50%, -50%) scale(1.2) rotate(5deg);  opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1)   rotate(0deg);  opacity: 0; }
        }
        @keyframes lucasPop {
          0%   { transform: translate(-50%, -50%) scale(0.2) rotate(-12deg); opacity: 0; }
          30%  { transform: translate(-50%, -50%) scale(1.25) rotate(8deg); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1)   rotate(0deg);  opacity: 0; }
        }
        @keyframes elisePop {
          0%   { transform: translate(-50%, -50%) scale(0.2) rotate(-10deg); opacity: 0; }
          30%  { transform: translate(-50%, -50%) scale(1.3)  rotate(6deg);  opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1)    rotate(0deg);  opacity: 0; }
        }
      `}</style>

      {showAndy && (
        <div style={{ position: "fixed", top: "42%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 30000, background: "linear-gradient(135deg, #1a1a00, #5a4500)", color: "#ff4400", border: "5px solid #ff6600", borderRadius: 24, padding: "26px 44px", fontSize: 48, fontWeight: "bold", letterSpacing: 2, boxShadow: "0 0 40px #ff4400", textAlign: "center", animation: "andyPop 1.8s ease-out" }}>Big AHH neck</div>
      )}
      {showWhale && (
        <div style={{ position: "fixed", top: "42%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 30000, background: "#003f91", color: "white", border: "5px solid gold", borderRadius: 24, padding: "24px 34px", fontSize: 32, fontWeight: "bold", boxShadow: "0 0 35px #00aaff", textAlign: "center", animation: "whalePop 1.8s ease-out" }}>🐋 You are a whale Noah 🐋</div>
      )}
      {showLucas && (
        <div style={{ position: "fixed", top: "42%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 30000, background: "linear-gradient(135deg, #111, #5c0000)", color: "gold", border: "5px solid white", borderRadius: 24, padding: "26px 40px", fontSize: 58, fontWeight: "bold", letterSpacing: 3, boxShadow: "0 0 35px red", textAlign: "center", animation: "lucasPop 1.8s ease-out" }}>BEANER</div>
      )}
      {showElise && (
        <div style={{ position: "fixed", top: "42%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 30000, background: "linear-gradient(135deg, #000b1a, #003366)", color: "#00cfff", border: "5px solid #00cfff", borderRadius: 24, padding: "26px 44px", fontSize: 44, fontWeight: "bold", letterSpacing: 2, boxShadow: "0 0 40px #00cfff", textAlign: "center", animation: "elisePop 1.8s ease-out" }}>Big AHH Forehead</div>
      )}

      {/* Decorative bubbles */}
      {[...Array(8)].map((_, i) => (
        <div key={i} style={{
          position: "fixed", bottom: -20,
          left: `${10 + i * 12}%`,
          width: 8 + (i % 3) * 6, height: 8 + (i % 3) * 6,
          borderRadius: "50%", background: "rgba(100,180,255,0.2)",
          border: "1px solid rgba(100,200,255,0.4)",
          animation: `bubbles ${4 + i * 1.2}s linear ${i * 0.7}s infinite`,
          pointerEvents: "none",
        }} />
      ))}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(100,180,255,0.2)" }}>
        <button onClick={() => { window.location.href = "/craps/lobby"; }} style={{ background: "rgba(0,0,0,0.5)", border: "2px solid #4fc3f7", color: "#4fc3f7", borderRadius: 10, padding: "7px 13px", fontSize: 13, fontWeight: "bold", cursor: "pointer" }}>
          ← Lobby
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: "bold", color: "#4fc3f7", textShadow: "0 0 14px #0288d1" }}>
          🌊 Deep Sea Slots 🌊
        </h1>
        <div style={{ background: "rgba(0,0,0,0.6)", border: "2px solid #4fc3f7", borderRadius: 12, padding: "7px 13px", fontSize: 15, fontWeight: "bold" }}>
          ${bankroll.toLocaleString()}
        </div>
      </div>

      {playerName && (
        <div style={{ fontSize: 12, color: "#4fc3f7aa", marginTop: 4 }}>Playing as {playerName}</div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, padding: "16px 12px 0" }}>

        {/* Slot machine */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>

          {/* Machine frame */}
          <div style={{
            background: "linear-gradient(145deg, #0a1a3a, #0d2050)",
            border: "4px solid #4fc3f7",
            borderRadius: 24, padding: "20px 24px",
            boxShadow: glowing ? "0 0 40px gold, 0 0 80px rgba(255,165,0,0.3)" : "0 0 30px rgba(79,195,247,0.3)",
            animation: glowing ? "winPulse 1.5s ease-in-out infinite" : "none",
            minWidth: 340,
          }}>
            <div style={{ fontSize: 13, color: "#4fc3f7", letterSpacing: 2, marginBottom: 12 }}>DEEP SEA SLOTS</div>

            {showBonus ? (
              <BonusScreen bet={lastBet} onFinish={handleBonusFinish} />
            ) : (
              <>
                {/* Reels */}
                <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 16 }}>
                  {[0, 1, 2].map(r => {
                    const s = strip(r);
                    const cur = reelIdx[r];
                    const prev = (cur - 1 + s.length) % s.length;
                    const next = (cur + 1) % s.length;
                    return (
                      <div key={r} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ opacity: 0.4 }}><SymTile sym={s[prev]} size={72} /></div>
                        <div style={{
                          transform: "scale(1.05)",
                          animation: spinning ? "reel-flash 0.15s linear infinite" : "none",
                        }}>
                          <SymTile sym={s[cur]} size={90} glow={glowing && !spinning} />
                        </div>
                        <div style={{ opacity: 0.4 }}><SymTile sym={s[next]} size={72} /></div>
                      </div>
                    );
                  })}
                </div>

                {/* Win line */}
                <div style={{ width: "100%", height: 3, background: glowing ? "gold" : "rgba(79,195,247,0.3)", borderRadius: 2, marginBottom: 12, boxShadow: glowing ? "0 0 10px gold" : "none" }} />
              </>
            )}

            {/* Message */}
            <div key={message} style={{
              fontSize: 16, fontWeight: "bold", minHeight: 28,
              color: msgColors[msgType],
              textShadow: `0 0 8px ${msgColors[msgType]}`,
              animation: "pop 0.3s ease-out",
            }}>{message}</div>
          </div>

          {/* Chip selector — sticky bet per spin */}
          <div style={{ background: "linear-gradient(135deg, #0a2040, #0d3060)", border: "3px solid #4fc3f7", borderRadius: 14, padding: "12px 18px", width: "100%", maxWidth: 340 }}>
            <div style={{ fontSize: 11, color: "#4fc3f7", letterSpacing: 2, marginBottom: 10 }}>BET PER SPIN</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 8 }}>
              {CHIP_DENOMS.map(v => {
                const selected = betPerSpin === v;
                const disabled = spinning || bankroll < v;
                return (
                  <button key={v} onClick={() => !disabled && setBetPerSpin(v)} style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: CHIP_COLORS[v],
                    border: selected ? "4px solid white" : "3px dashed rgba(255,255,255,0.35)",
                    color: v === 1 ? "#222" : "white", fontWeight: "bold", fontSize: 14,
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled && !selected ? 0.4 : 1,
                    boxShadow: selected ? "0 0 16px white, 0 0 28px rgba(255,255,255,0.4)" : "0 2px 8px rgba(0,0,0,0.4)",
                    animation: selected ? "chipPulse 1.2s ease-in-out infinite" : "none",
                    transform: selected ? "scale(1.1)" : "scale(1)",
                    transition: "transform 0.15s, box-shadow 0.15s",
                  }}>${v}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 13, color: "#4fc3f7aa" }}>
              Each spin costs <span style={{ color: "white", fontWeight: "bold" }}>${betPerSpin}</span>
            </div>
          </div>

          {/* SPIN button */}
          {!showBonus && (
            <button onClick={spin} disabled={!canSpin} style={{
              background: canSpin ? "linear-gradient(135deg, #0288d1, #01579b)" : "#333",
              color: "white", border: `3px solid ${canSpin ? "#4fc3f7" : "#555"}`,
              borderRadius: 14, padding: "14px 60px", fontSize: 20, fontWeight: "bold",
              cursor: canSpin ? "pointer" : "not-allowed",
              boxShadow: canSpin ? "0 0 20px rgba(79,195,247,0.5)" : "none",
              transition: "all 0.2s", width: "100%", maxWidth: 340,
            }}>
              {spinning ? "Spinning…" : `SPIN $${betPerSpin} 🌊`}
            </button>
          )}

          {/* Reset — only visible when bankroll is under $500 */}
          {bankroll < 500 && (
          <button onClick={resetMoney} disabled={spinning} style={{
            background: "darkred", color: "white", border: "2px solid white",
            borderRadius: 9, padding: "7px 16px", fontSize: 13, fontWeight: "bold",
            cursor: spinning ? "not-allowed" : "pointer", opacity: spinning ? 0.5 : 1,
          }}>Reset Money</button>
          )}
        </div>

        {/* Right panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 300, width: "100%" }}>

          {/* Paytable */}
          <div style={{ background: "rgba(0,0,50,0.6)", border: "2px solid rgba(79,195,247,0.3)", borderRadius: 12, padding: "10px 12px", textAlign: "left" }}>
            <div style={{ fontSize: 11, color: "#4fc3f7", letterSpacing: 2, marginBottom: 8 }}>PAY TABLE</div>
            {[
              ["🐠🐠🐠", "100×"],
              ["🦈🦈🦈", "40×"],
              ["🦀🦀🦀", "20×"],
              ["🐙🐙🐙", "12×"],
              ["🐚🐚🐚", "8×"],
              ["⚓⚓⚓",  "5×"],
              ["🌊🌊🌊", "2×"],
              ["2× Dealer", "10×"],
              ["2× Match", "1×"],
              ["3× Dealer 🎉", "BONUS!"],
            ].map(([syms, pay]) => (
              <div key={syms} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#ccc", marginBottom: 3, padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span>{syms}</span>
                <span style={{ fontWeight: "bold", color: pay === "BONUS!" ? "gold" : "#4fc3f7" }}>{pay}</span>
              </div>
            ))}
          </div>

          {/* Recent history */}
          {history.length > 0 && (
            <div style={{ background: "rgba(0,0,30,0.5)", border: "1px solid rgba(79,195,247,0.2)", borderRadius: 10, padding: "8px 12px", textAlign: "left" }}>
              <div style={{ fontSize: 10, color: "#4fc3f7", letterSpacing: 2, marginBottom: 6 }}>RECENT</div>
              {history.map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: h.amount > 0 ? "#2ecc71" : h.amount === 0 ? "#aaa" : "#e74c3c", marginBottom: 2 }}>
                  <span>{h.roll}</span>
                  <span>{h.amount > 0 ? `+$${h.amount}` : h.amount === 0 ? "—" : `-$${Math.abs(h.amount)}`}</span>
                </div>
              ))}
            </div>
          )}

          {/* Dealer photo legend */}
          <div style={{ background: "rgba(0,0,30,0.5)", border: "1px solid rgba(79,195,247,0.15)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#4fc3f7", letterSpacing: 2, marginBottom: 8 }}>DEALERS — BONUS SYMBOLS</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {DEALERS.map(d => (
                <div key={d.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", border: `2px solid ${d.color}`, background: d.color }}>
                    <img src={d.imgUrl} alt={d.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ fontSize: 8, color: "#aaa", textAlign: "center", lineHeight: 1.2 }}>{d.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Slots} />
      <Route><div style={{ color: "white", padding: 40, textAlign: "center" }}>Not found.</div></Route>
    </Switch>
  );
}

export default function App() {
  return (
    <WouterRouter base="/slots">
      <Router />
    </WouterRouter>
  );
}
