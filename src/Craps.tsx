import { useState, useRef, useCallback, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function randomDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

const DIE_DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
};

const CHIP_DENOMINATIONS = [1, 5, 25, 100];
const CHIP_COLORS: Record<number, { bg: string; text: string }> = {
  1:   { bg: "#c8c8c8", text: "#222" },
  5:   { bg: "#c0392b", text: "#fff" },
  25:  { bg: "#1a5276", text: "#fff" },
  100: { bg: "#6c3483", text: "#fff" },
};

// All place numbers in crapless craps (2–12 except 7)
const PLACE_NUMBERS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
const HARD_NUMBERS  = [4, 6, 8, 10];

interface PlaceInfo { pays: number; for: number; inc: number }

function placeInfo(n: number): PlaceInfo {
  if (n === 2 || n === 12) return { pays: 11, for: 2, inc: 2  };
  if (n === 3 || n === 11) return { pays: 11, for: 4, inc: 4  };
  if (n === 4 || n === 10) return { pays: 9,  for: 5, inc: 5  };
  if (n === 5 || n === 9)  return { pays: 7,  for: 5, inc: 5  };
  if (n === 6 || n === 8)  return { pays: 7,  for: 6, inc: 6  };
  return { pays: 1, for: 1, inc: 1 };
}

// Hard-way pays: Hard 4/10 → 7:1, Hard 6/8 → 9:1
function hardPays(n: number): number {
  return (n === 6 || n === 8) ? 9 : 7;
}

function getLocalBankroll(): number {
  try {
    const lastUser = localStorage.getItem("lastBlackjackUser");
    if (lastUser) {
      const raw = localStorage.getItem("blackjackSave_" + lastUser);
      if (raw) {
        const data = JSON.parse(raw);
        return typeof data.bankroll === "number" ? data.bankroll : 1000;
      }
    }
  } catch {}
  return 1000;
}

function saveLocalBankroll(bankroll: number) {
  try {
    const lastUser = localStorage.getItem("lastBlackjackUser");
    if (lastUser) {
      const raw = localStorage.getItem("blackjackSave_" + lastUser);
      const data = raw ? JSON.parse(raw) : {};
      data.bankroll = bankroll;
      localStorage.setItem("blackjackSave_" + lastUser, JSON.stringify(data));
    }
  } catch {}
}

function getLocalPlayerName(): string {
  try { return localStorage.getItem("lastBlackjackUser") ?? ""; } catch { return ""; }
}

function saveLocalPlayerName(name: string) {
  try { localStorage.setItem("lastBlackjackUser", name); } catch {}
}

type Phase = "comeout" | "point";
interface PlaceBets { [key: number]: number }

interface GameState {
  bankroll: number;
  phase: Phase;
  point: number | null;
  passLineBet: number;
  placeBets: PlaceBets;
  hardBets: PlaceBets;          // keys: 4, 6, 8, 10
  die1: number;
  die2: number;
  rolling: boolean;
  message: string;
  messageType: "info" | "win" | "lose" | "neutral";
  lastTotal: number | null;
  savedPassLineBet: number;
  savedPlaceBets: PlaceBets;
  savedHardBets: PlaceBets;
  showRebet: boolean;
  winStreak: number;
  showPLModal: boolean;
  roundPL: number;
}

function initState(): GameState {
  return {
    bankroll: getLocalBankroll(),
    phase: "comeout", point: null,
    passLineBet: 0, placeBets: {}, hardBets: {},
    die1: 1, die2: 2,
    rolling: false,
    message: "Place a Pass Line bet and Roll!",
    messageType: "info",
    lastTotal: null,
    savedPassLineBet: 0, savedPlaceBets: {}, savedHardBets: {},
    showRebet: false,
    winStreak: 0,
    showPLModal: false,
    roundPL: 0,
  };
}

function Chip({ value, onClick, disabled }: { value: number; onClick: () => void; disabled?: boolean }) {
  const c = CHIP_COLORS[value] ?? { bg: "#555", text: "#fff" };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 52, height: 52, borderRadius: "50%",
        background: c.bg, border: "4px dashed rgba(255,255,255,0.45)",
        color: c.text, fontWeight: "bold", fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        boxShadow: "0 3px 10px rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "transform 0.1s", flexShrink: 0,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = "scale(1.12)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
    >
      ${value}
    </button>
  );
}

function Die({ face, rolling }: { face: number; rolling: boolean }) {
  const dots = DIE_DOT_POSITIONS[face] ?? [];
  return (
    <div style={{
      width: 72, height: 72, background: "white", borderRadius: 14,
      boxShadow: "0 0 16px rgba(0,0,0,0.7)",
      animation: rolling ? "diceRoll 0.12s infinite" : "none",
      userSelect: "none", flexShrink: 0,
    }}>
      <svg viewBox="0 0 100 100" width="72" height="72">
        {dots.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={9} fill="#111" />)}
      </svg>
    </div>
  );
}

function CrapsGame() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<GameState>(initState);
  const stateRef = useRef<GameState>(state);

  const set = useCallback((patch: Partial<GameState> | ((s: GameState) => Partial<GameState>)) => {
    setState(s => {
      const next = { ...s, ...(typeof patch === "function" ? patch(s) : patch) };
      stateRef.current = next;
      return next;
    });
  }, []);

  const [showAndy, setShowAndy] = useState(false);
  const [showWhale, setShowWhale] = useState(false);
  const [showLucas, setShowLucas] = useState(false);
  const [showElise, setShowElise] = useState(false);

  useEffect(() => {
    set({ bankroll: getLocalBankroll(), message: "Place a Pass Line bet and Roll!" });
    const name = getLocalPlayerName().toLowerCase();
    if (name === "andy")  setTimeout(() => { setShowAndy(true);  setTimeout(() => setShowAndy(false),  1800); }, 300);
    if (name === "noah")  setTimeout(() => { setShowWhale(true); setTimeout(() => setShowWhale(false), 1800); }, 300);
    if (name === "lucas") setTimeout(() => { setShowLucas(true); setTimeout(() => setShowLucas(false), 1800); }, 300);
    if (name === "elise") setTimeout(() => { setShowElise(true); setTimeout(() => setShowElise(false), 1800); }, 300);
  }, []);

  const addPassLine = useCallback((amount: number) => {
    const s = stateRef.current;
    if (s.rolling || s.phase === "point") return;
    if (s.bankroll < amount) { set({ message: "Not enough bankroll!", messageType: "neutral" }); return; }
    set(cs => {
      const nb = cs.bankroll - amount;
      saveLocalBankroll(nb);
      return { passLineBet: cs.passLineBet + amount, bankroll: nb, showRebet: false, message: `Pass Line: $${cs.passLineBet + amount}`, messageType: "neutral" };
    });
  }, [set]);

  const addPlaceBet = useCallback((num: number, amount: number) => {
    const s = stateRef.current;
    if (s.rolling) return;
    if (s.bankroll < amount) { set({ message: "Not enough bankroll!", messageType: "neutral" }); return; }
    set(cs => {
      const nb = cs.bankroll - amount;
      saveLocalBankroll(nb);
      return {
        placeBets: { ...cs.placeBets, [num]: (cs.placeBets[num] ?? 0) + amount },
        bankroll: nb, showRebet: false,
        message: `Place ${num}: $${(cs.placeBets[num] ?? 0) + amount}`, messageType: "neutral",
      };
    });
  }, [set]);

  const addHardBet = useCallback((num: number, amount: number) => {
    const s = stateRef.current;
    if (s.rolling) return;
    if (s.bankroll < amount) { set({ message: "Not enough bankroll!", messageType: "neutral" }); return; }
    set(cs => {
      const nb = cs.bankroll - amount;
      saveLocalBankroll(nb);
      return {
        hardBets: { ...cs.hardBets, [num]: (cs.hardBets[num] ?? 0) + amount },
        bankroll: nb, showRebet: false,
        message: `Hard ${num}: $${(cs.hardBets[num] ?? 0) + amount}`, messageType: "neutral",
      };
    });
  }, [set]);

  const clearPassLine = useCallback(() => {
    const s = stateRef.current;
    if (s.rolling || s.phase === "point") return;
    set(cs => {
      const nb = cs.bankroll + cs.passLineBet;
      saveLocalBankroll(nb);
      return { passLineBet: 0, bankroll: nb, message: "Pass Line cleared.", messageType: "neutral" };
    });
  }, [set]);

  const clearAllBets = useCallback(() => {
    const s = stateRef.current;
    if (s.rolling) return;
    set(cs => {
      const placesTotal = Object.values(cs.placeBets).reduce((a, b) => a + b, 0);
      const hardsTotal  = Object.values(cs.hardBets).reduce((a, b) => a + b, 0);
      // Pass line can only be taken down before a point is established
      const passReturn = cs.phase === "comeout" ? cs.passLineBet : 0;
      const returned = passReturn + placesTotal + hardsTotal;
      if (returned === 0) { return { message: "No bets to clear.", messageType: "neutral" as const }; }
      const nb = cs.bankroll + returned;
      saveLocalBankroll(nb);
      return {
        bankroll: nb,
        passLineBet: cs.phase === "comeout" ? 0 : cs.passLineBet,
        placeBets: {},
        hardBets: {},
        message: `Cleared bets — $${returned} returned to bankroll.`,
        messageType: "neutral" as const,
      };
    });
  }, [set]);

  const goToLobby = useCallback(() => {
    // Return any active bets to bankroll before leaving
    const s = stateRef.current;
    const placesTotal = Object.values(s.placeBets).reduce((a, b) => a + b, 0);
    const hardsTotal  = Object.values(s.hardBets).reduce((a, b) => a + b, 0);
    const total = s.passLineBet + placesTotal + hardsTotal;
    if (total > 0) {
      const nb = s.bankroll + total;
      saveLocalBankroll(nb);
    }
    setLocation("/lobby");
  }, [setLocation]);

  const rebet = useCallback(() => {
    const s = stateRef.current;
    if (s.rolling) return;
    const { savedPassLineBet, savedPlaceBets, savedHardBets } = s;
    const total = savedPassLineBet
      + Object.values(savedPlaceBets).reduce((a, b) => a + b, 0)
      + Object.values(savedHardBets).reduce((a, b) => a + b, 0);
    if (total === 0) { set({ message: "No previous bets to restore.", messageType: "neutral" }); return; }
    if (s.bankroll < total) { set({ message: "Not enough bankroll to rebet!", messageType: "neutral" }); return; }
    set(cs => {
      const nb = cs.bankroll - total;
      saveLocalBankroll(nb);
      return {
        passLineBet: savedPassLineBet,
        placeBets: { ...savedPlaceBets },
        hardBets: { ...savedHardBets },
        bankroll: nb, showRebet: false,
        message: `Rebetting $${total} — same bets as last round.`, messageType: "neutral",
      };
    });
  }, [set]);

  const resetGame = useCallback(() => {
    const fresh = initState();
    const newState = { ...fresh, bankroll: 1000, message: "Money reset. Place a bet and Roll!", messageType: "info" as const };
    saveLocalBankroll(1000);
    setState(newState);
    stateRef.current = newState;
  }, []);

  const roll = useCallback(async () => {
    const s = stateRef.current;
    if (s.rolling) return;
    const hasAnyBet = s.passLineBet > 0 || Object.keys(s.placeBets).length > 0 || Object.keys(s.hardBets).length > 0;
    if (!hasAnyBet) { set({ message: "Place a bet first!", messageType: "neutral" }); return; }

    set({ rolling: true, showRebet: false });
    for (let i = 0; i < 14; i++) { set({ die1: randomDie(), die2: randomDie() }); await sleep(70); }

    const d1 = randomDie();
    const d2 = randomDie();
    const total = d1 + d2;
    const isHardRoll = d1 === d2; // pair
    set({ die1: d1, die2: d2, rolling: false, lastTotal: total });
    await sleep(180);

    const cur = stateRef.current;
    let newBankroll = cur.bankroll;
    let newPassLineBet = cur.passLineBet;
    let newPlaceBets = { ...cur.placeBets };
    let newHardBets = { ...cur.hardBets };
    let newPhase = cur.phase;
    let newPoint = cur.point;
    let msg = "";
    let msgType: GameState["messageType"] = "neutral";
    let newShowRebet = false;
    let newSavedPassLine = cur.savedPassLineBet;
    let newSavedPlace = cur.savedPlaceBets;
    let newSavedHard = cur.savedHardBets;

    const winParts: string[] = [];

    if (cur.phase === "comeout") {
      if (total === 7) {
        // Come-out 7: NATURAL — pass line wins 1:1; place bets were OFF (stay on table)
        if (cur.passLineBet > 0) {
          const win = cur.passLineBet;
          newBankroll += win * 2; // return original bet + 1:1 profit
          newPassLineBet = 0;
          winParts.push(`Pass Line +$${win}`);
          msgType = "win";
        }
        msg = `NATURAL 7! Pass Line wins! Place bets stay up. 🎉`;
        // place bets and hard bets remain untouched — they were OFF on the come-out
      } else {
        newPoint = total;
        newPhase = "point";
        msg = `POINT IS ${total} — Roll it again to win! 🎯`;
        msgType = "info";
      }
    } else {
      // Point phase
      if (total === 7) {
        // 7-out: everything loses
        newSavedPassLine = cur.passLineBet;
        newSavedPlace = { ...cur.placeBets };
        newSavedHard = { ...cur.hardBets };
        newPassLineBet = 0;
        newPlaceBets = {};
        newHardBets = {};
        newPoint = null;
        newPhase = "comeout";
        msg = "SEVEN OUT — All bets lost! 😬";
        msgType = "lose";
        newShowRebet = cur.passLineBet > 0 || Object.keys(cur.placeBets).length > 0 || Object.keys(cur.hardBets).length > 0;
      } else if (total === cur.point) {
        const bet = newPassLineBet;
        newBankroll += bet * 2;
        newPassLineBet = 0;
        newPoint = null;
        newPhase = "comeout";
        msg = `POINT HIT ${total}! You WIN $${bet}! 🎉`;
        msgType = "win";
      } else {
        msg = `Rolled ${total} — Keep rolling for ${cur.point}!`;
        msgType = "neutral";
      }
    }

    // Resolve place bets (working in both phases in this game)
    if (total !== 7) {
      for (const numStr of Object.keys(cur.placeBets)) {
        const num = Number(numStr);
        if (total === num) {
          const bet = cur.placeBets[num] ?? 0;
          const info = placeInfo(num);
          const win = Math.floor(bet * info.pays / info.for);
          newBankroll += win;
          winParts.push(`Place ${num} +$${win}`);
          if (msgType !== "lose") msgType = "win";
        }
      }
    }

    // Resolve hard bets (working in both phases)
    if (total !== 7) {
      for (const numStr of Object.keys(cur.hardBets)) {
        const num = Number(numStr);
        if (total === num) {
          const bet = cur.hardBets[num] ?? 0;
          if (isHardRoll) {
            // Hard way hit — pay and keep bet active
            const win = bet * hardPays(num);
            newBankroll += win;
            winParts.push(`Hard ${num} +$${win}`);
            if (msgType !== "lose") msgType = "win";
          } else {
            // Easy way — hard bet loses
            delete newHardBets[num];
            winParts.push(`Hard ${num} lost (easy way)`);
          }
        }
      }
    }

    if (winParts.length > 0) {
      msg += (msg ? " • " : "") + `💰 ${winParts.join(" • ")}`;
    }

    saveLocalBankroll(newBankroll);
    const newWinStreak = msgType === "lose" ? 0
      : msgType === "win" ? cur.winStreak + 1
      : cur.winStreak;
    const roundPL = newBankroll - cur.bankroll;
    set({
      bankroll: newBankroll,
      passLineBet: newPassLineBet,
      placeBets: newPlaceBets,
      hardBets: newHardBets,
      phase: newPhase,
      point: newPoint,
      message: msg || `Rolled ${total}`,
      messageType: msgType,
      showRebet: newShowRebet,
      savedPassLineBet: newSavedPassLine,
      savedPlaceBets: newSavedPlace,
      savedHardBets: newSavedHard,
      winStreak: newWinStreak,
      showPLModal: msgType === "lose",
      roundPL,
    });
  }, [set]);

  const sessionStartBankroll = useRef<number>(getLocalBankroll());
  const dismissPL = useCallback(() => set({ showPLModal: false }), [set]);

  const {
    bankroll, phase, point, passLineBet, placeBets, hardBets,
    die1, die2, rolling, message, messageType, lastTotal,
    showRebet, savedPassLineBet, savedPlaceBets, savedHardBets, winStreak,
    showPLModal, roundPL,
  } = state;

  const heatLevel = Math.min(5, Math.floor(winStreak / 3));
  const heatLabels = ["", "🔥 On Fire!", "🔥🔥 Getting Hot!", "🔥🔥🔥 Blazing!", "🔥🔥🔥🔥 INFERNO!", "🔥🔥🔥🔥🔥 GOD MODE!"];
  const domeFlames: Record<number, { shadow: string; border: string; anim: string }> = {
    0: { shadow: "inset 0 0 40px rgba(255,255,255,0.3), 0 0 40px rgba(0,0,0,0.8)", border: "#b0b8c1", anim: "none" },
    1: { shadow: "inset 0 0 40px rgba(255,255,255,0.3), 0 0 25px #ff8800, 0 0 50px rgba(255,120,0,0.25)", border: "#ff8800", anim: "none" },
    2: { shadow: "inset 0 0 40px rgba(255,255,255,0.3), 0 0 35px #ff6600, 0 0 70px rgba(255,60,0,0.45)", border: "#ff6600", anim: "flameFlicker 1.4s ease-in-out infinite" },
    3: { shadow: "inset 0 0 40px rgba(255,200,100,0.2), 0 0 50px #ff4400, 0 0 90px rgba(255,30,0,0.6), 0 0 130px rgba(255,0,0,0.25)", border: "#ff3300", anim: "flameFlicker 0.9s ease-in-out infinite" },
    4: { shadow: "inset 0 0 50px rgba(255,200,100,0.3), 0 0 60px #ff8800, 0 0 100px #ff3300, 0 0 150px rgba(255,80,0,0.5)", border: "#ffaa00", anim: "infernoFlicker 0.6s ease-in-out infinite" },
    5: { shadow: "inset 0 0 60px rgba(255,230,150,0.4), 0 0 70px #ffcc00, 0 0 110px #ff5500, 0 0 160px rgba(255,150,0,0.6), 0 0 220px rgba(255,50,0,0.3)", border: "#ffff00", anim: "infernoFlicker 0.4s ease-in-out infinite" },
  };

  const msgColors: Record<GameState["messageType"], string> = {
    win: "#2ecc71", lose: "#e74c3c", info: "gold", neutral: "white",
  };

  const canBet = !rolling && phase === "comeout";
  const canPlaceBet = !rolling;

  const rebetTotal = savedPassLineBet
    + Object.values(savedPlaceBets).reduce((a, b) => a + b, 0)
    + Object.values(savedHardBets).reduce((a, b) => a + b, 0);

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, #1a0505, #0a0000 80%)",
      color: "white", fontFamily: "Arial, sans-serif",
      textAlign: "center", padding: "0 0 40px 0",
    }}>
      <style>{`
        @keyframes diceRoll {
          0%   { transform: rotate(0deg) scale(1); }
          25%  { transform: rotate(8deg) scale(1.04); }
          50%  { transform: rotate(0deg) scale(0.97); }
          75%  { transform: rotate(-8deg) scale(1.04); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes msgPop {
          0%   { transform: scale(0.85); opacity: 0; }
          60%  { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes puckBounce {
          0%   { transform: scale(0.7); opacity: 0; }
          70%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes rebetPop {
          0%   { transform: scale(0.6) translateY(10px); opacity: 0; }
          80%  { transform: scale(1.08) translateY(-2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes flameFlicker {
          0%,100% { box-shadow: var(--flame-shadow-a); }
          50%      { box-shadow: var(--flame-shadow-b); }
        }
        @keyframes infernoFlicker {
          0%   { box-shadow: var(--flame-shadow-a); filter: brightness(1); }
          33%  { box-shadow: var(--flame-shadow-b); filter: brightness(1.15); }
          66%  { box-shadow: var(--flame-shadow-a); filter: brightness(0.9); }
          100% { box-shadow: var(--flame-shadow-a); filter: brightness(1); }
        }
        @keyframes heatBadgePulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.8; transform: scale(1.06); }
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

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid rgba(255,215,0,0.2)" }}>
        <button onClick={goToLobby} style={{ background: "rgba(0,0,0,0.5)", border: "2px solid gold", color: "gold", borderRadius: 10, padding: "7px 13px", fontSize: 13, fontWeight: "bold", cursor: "pointer" }}>
          ← Lobby
        </button>
        <h1 style={{ margin: 0, color: "gold", fontSize: 20, fontWeight: "bold", textShadow: "0 0 10px gold" }}>
          🎲 Crapless Bubble Craps
        </h1>
        <div style={{ background: "rgba(0,0,0,0.6)", border: "2px solid gold", borderRadius: 12, padding: "7px 13px", fontSize: 15, fontWeight: "bold" }}>
          ${bankroll.toLocaleString()}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, padding: "14px 10px 0" }}>

        {/* Left: dome + controls */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 210, height: 210, borderRadius: "50%",
            background: heatLevel >= 3
              ? "radial-gradient(circle at 35% 30%, #ffd080, #2a4a6a 60%, #0d1f30)"
              : "radial-gradient(circle at 35% 30%, #b8e4ff, #2a4a6a 60%, #0d1f30)",
            border: `8px solid ${domeFlames[heatLevel].border}`,
            boxShadow: domeFlames[heatLevel].shadow,
            position: "relative", overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            animation: domeFlames[heatLevel].anim,
            transition: "border-color 0.6s, box-shadow 0.6s",
          }}>
            <div style={{ position: "absolute", top: "10%", left: "10%", width: "30%", height: "20%", background: "rgba(255,255,255,0.15)", borderRadius: "50%", transform: "rotate(-30deg)" }} />
            <Die face={die1} rolling={rolling} />
            <Die face={die2} rolling={rolling} />
          </div>

          {lastTotal !== null && (
            <div style={{ fontSize: 19, fontWeight: "bold", color: "white" }}>
              Total: {lastTotal} {die1 === die2 ? <span style={{ color: "gold", fontSize: 13 }}>(hard)</span> : null}
            </div>
          )}

          {/* Heat streak badge */}
          {heatLevel > 0 && (
            <div key={heatLevel} style={{
              fontSize: 14, fontWeight: "bold",
              color: heatLevel >= 4 ? "#ffff80" : heatLevel >= 3 ? "#ffcc00" : heatLevel >= 2 ? "#ff8800" : "#ffaa55",
              textShadow: `0 0 10px ${heatLevel >= 4 ? "#ffaa00" : "#ff6600"}`,
              animation: "heatBadgePulse 1s ease-in-out infinite",
            }}>
              {heatLabels[heatLevel]} <span style={{ fontSize: 11, color: "#ccc" }}>({winStreak} wins)</span>
            </div>
          )}

          <div key={message} style={{
            fontSize: 14, fontWeight: "bold",
            color: msgColors[messageType],
            textShadow: `0 0 8px ${msgColors[messageType]}`,
            maxWidth: 250, animation: "msgPop 0.35s ease-out",
            lineHeight: 1.4, minHeight: 44,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {message}
          </div>

          {/* Point puck */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 46, height: 46, borderRadius: "50%",
              background: point ? "linear-gradient(135deg, #1a1a1a, #333)" : "linear-gradient(135deg, #e0e0e0, #aaa)",
              border: `4px solid ${point ? "gold" : "#888"}`,
              color: point ? "gold" : "#555", fontWeight: "bold",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              boxShadow: point ? "0 0 14px gold" : "none",
              animation: "puckBounce 0.4s ease-out",
            }}>
              <span style={{ fontSize: 7, letterSpacing: 1 }}>{point ? "ON" : "OFF"}</span>
              {point && <span style={{ fontSize: 15 }}>{point}</span>}
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 11, color: "#aaa" }}>POINT</div>
              <div style={{ fontSize: 17, fontWeight: "bold", color: point ? "gold" : "#666" }}>{point ?? "—"}</div>
            </div>
          </div>

          <button onClick={roll} disabled={rolling} style={{
            background: rolling ? "#555" : "linear-gradient(135deg, gold, #b8860b)",
            color: "black", border: "none", borderRadius: 14,
            padding: "12px 38px", fontSize: 18, fontWeight: "bold",
            cursor: rolling ? "not-allowed" : "pointer",
            boxShadow: rolling ? "none" : "0 0 18px rgba(255,215,0,0.6)",
            transition: "all 0.2s",
          }}>
            {rolling ? "Rolling..." : "ROLL 🎲"}
          </button>

          <button onClick={clearAllBets} disabled={rolling} style={{
            background: rolling ? "#555" : "rgba(0,0,0,0.6)",
            color: rolling ? "#888" : "#f0a500",
            border: "2px solid #f0a500", borderRadius: 10,
            padding: "7px 18px", fontSize: 13, fontWeight: "bold",
            cursor: rolling ? "not-allowed" : "pointer",
            opacity: rolling ? 0.5 : 1,
          }}>
            Clear All Bets
          </button>

          {showRebet && !rolling && (
            <button onClick={rebet} disabled={bankroll < rebetTotal} style={{
              background: bankroll >= rebetTotal ? "linear-gradient(135deg, #c0392b, #922b21)" : "#555",
              color: "white", border: "3px solid #e74c3c",
              borderRadius: 14, padding: "10px 24px",
              fontSize: 15, fontWeight: "bold",
              cursor: bankroll >= rebetTotal ? "pointer" : "not-allowed",
              boxShadow: bankroll >= rebetTotal ? "0 0 16px rgba(231,76,60,0.7)" : "none",
              animation: "rebetPop 0.4s ease-out",
              opacity: bankroll >= rebetTotal ? 1 : 0.5,
            }}>
              🔄 REBET ${rebetTotal}
            </button>
          )}

          {bankroll < 500 && (
          <button onClick={resetGame} disabled={rolling} style={{
            background: "darkred", color: "white",
            border: "2px solid white", borderRadius: 9,
            padding: "8px 16px", fontSize: 13,
            fontWeight: "bold", cursor: rolling ? "not-allowed" : "pointer",
            opacity: rolling ? 0.5 : 1,
          }}>
            Reset Money
          </button>
          )}
        </div>

        {/* Right: betting panels */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 380, width: "100%" }}>

          {/* Pass Line */}
          <div style={{ background: "linear-gradient(135deg, #013d19, #025c25)", border: "3px solid gold", borderRadius: 14, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "gold", letterSpacing: 2, marginBottom: 7 }}>PASS LINE BET</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", justifyContent: "center" }}>
              {CHIP_DENOMINATIONS.map(v => (
                <Chip key={v} value={v} onClick={() => addPassLine(v)} disabled={!canBet || bankroll < v} />
              ))}
            </div>
            <div style={{ marginTop: 7, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 19, fontWeight: "bold", color: passLineBet > 0 ? "gold" : "#555" }}>${passLineBet}</div>
              {passLineBet > 0 && canBet && (
                <button onClick={clearPassLine} style={{ background: "rgba(200,0,0,0.7)", color: "white", border: "none", borderRadius: 7, padding: "3px 9px", fontSize: 11, cursor: "pointer" }}>Clear</button>
              )}
              {phase === "point" && passLineBet > 0 && <div style={{ fontSize: 10, color: "#aaa", fontStyle: "italic" }}>Locked in</div>}
            </div>
            <div style={{ fontSize: 10, color: "#8bc", marginTop: 2 }}>
              {phase === "comeout" ? "Crapless: only 7 loses • all other numbers set the point" : `Rolling for ${point} — 7 loses`}
            </div>
          </div>

          {/* Place Bets 2–12 */}
          <div style={{ background: "linear-gradient(135deg, #013d19, #025c25)", border: "3px solid gold", borderRadius: 14, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "gold", letterSpacing: 2, marginBottom: 8 }}>PLACE BETS (2–12)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
              {PLACE_NUMBERS.map(num => {
                const info = placeInfo(num);
                const bet = placeBets[num] ?? 0;
                const active = bet > 0;
                const catColor = (num === 6 || num === 8) ? "#1e6b3c"
                  : (num === 5 || num === 9) ? "#1a5276"
                  : (num === 4 || num === 10) ? "#4a235a"
                  : (num === 3 || num === 11) ? "#784212"
                  : "#7b241c";
                return (
                  <div key={num} style={{
                    background: active ? catColor : "rgba(0,0,0,0.4)",
                    border: `2px solid ${active ? "rgba(255,255,255,0.35)" : "rgba(255,215,0,0.2)"}`,
                    borderRadius: 7, padding: "5px 2px", textAlign: "center",
                    boxShadow: active ? `0 0 8px ${catColor}` : "none", transition: "all 0.15s",
                  }}>
                    <div style={{ fontSize: 15, fontWeight: "bold", color: active ? "white" : "gold" }}>{num}</div>
                    <div style={{ fontSize: 7, color: "#bbb" }}>{info.pays}:{info.for}</div>
                    {active && <div style={{ fontSize: 10, color: "#7fc", fontWeight: "bold" }}>${bet}</div>}
                    <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 3 }}>
                      {[info.inc, info.inc * 5].map(v => (
                        <button key={v} onClick={() => addPlaceBet(num, v)} disabled={!canPlaceBet || bankroll < v} style={{
                          background: active ? "rgba(255,255,255,0.2)" : "rgba(255,215,0,0.15)",
                          border: "1px solid rgba(255,255,255,0.2)", color: "white",
                          borderRadius: 3, fontSize: 7, fontWeight: "bold", padding: "2px 2px",
                          cursor: !canPlaceBet || bankroll < v ? "not-allowed" : "pointer",
                          opacity: !canPlaceBet || bankroll < v ? 0.35 : 1,
                        }}>+${v}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 9, color: "#8bc", marginTop: 6, lineHeight: 1.5 }}>
              Stay active after winning • cleared on 7-out only<br />
              <span style={{ color: "#7b241c" }}>■</span> 2/12: 11:2 &nbsp;
              <span style={{ color: "#784212" }}>■</span> 3/11: 11:4 &nbsp;
              <span style={{ color: "#4a235a" }}>■</span> 4/10: 9:5 &nbsp;
              <span style={{ color: "#1a5276" }}>■</span> 5/9: 7:5 &nbsp;
              <span style={{ color: "#1e6b3c" }}>■</span> 6/8: 7:6
            </div>
          </div>

          {/* Hardway Bets */}
          <div style={{ background: "linear-gradient(135deg, #1a0a2e, #2d0f4a)", border: "3px solid #c39bd3", borderRadius: 14, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "#c39bd3", letterSpacing: 2, marginBottom: 8 }}>HARDWAY BETS</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {HARD_NUMBERS.map(num => {
                const bet = hardBets[num] ?? 0;
                const active = bet > 0;
                const pays = hardPays(num);
                const half = num / 2;
                return (
                  <div key={num} style={{
                    background: active ? "#4a235a" : "rgba(0,0,0,0.4)",
                    border: `2px solid ${active ? "#bb8fce" : "rgba(195,155,211,0.25)"}`,
                    borderRadius: 7, padding: "5px 3px", textAlign: "center",
                    boxShadow: active ? "0 0 10px rgba(155,89,182,0.6)" : "none", transition: "all 0.15s",
                  }}>
                    <div style={{ fontSize: 15, fontWeight: "bold", color: active ? "white" : "#c39bd3" }}>Hard {num}</div>
                    <div style={{ fontSize: 8, color: "#bbb" }}>{half}+{half} • pays {pays}:1</div>
                    {active && <div style={{ fontSize: 10, color: "#d7bde2", fontWeight: "bold" }}>${bet}</div>}
                    <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 3 }}>
                      {[1, 5].map(v => (
                        <button key={v} onClick={() => addHardBet(num, v)} disabled={!canPlaceBet || bankroll < v} style={{
                          background: active ? "rgba(255,255,255,0.2)" : "rgba(195,155,211,0.2)",
                          border: "1px solid rgba(255,255,255,0.2)", color: "white",
                          borderRadius: 3, fontSize: 7, fontWeight: "bold", padding: "2px 3px",
                          cursor: !canPlaceBet || bankroll < v ? "not-allowed" : "pointer",
                          opacity: !canPlaceBet || bankroll < v ? 0.35 : 1,
                        }}>+${v}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 9, color: "#bb8fce", marginTop: 6, lineHeight: 1.5 }}>
              Win on exact pair • lose on easy way or 7 • Hard 4/10 pay 7:1 • Hard 6/8 pay 9:1
            </div>
          </div>

          {/* Rules */}
          <div style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 10, padding: "7px 11px", fontSize: 10, color: "#aaa", lineHeight: 1.7, textAlign: "left" }}>
            <div style={{ color: "gold", fontWeight: "bold", marginBottom: 2 }}>📖 Crapless Rules</div>
            <div>• <b>Come-out:</b> Only 7 loses pass line — all other numbers set the point. Place &amp; hard bets are OFF.</div>
            <div>• <b>Point phase:</b> Roll the point again to win • 7-out loses everything</div>
            <div>• <b>Hard bets:</b> Work in point phase • win on pair • lose on easy roll of that number or 7</div>
          </div>
        </div>
      </div>

      {/* P/L Modal — shown after a loss */}
      {showPLModal && (
        <div onClick={dismissPL} style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(3px)",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "linear-gradient(145deg, #1a0000, #2d0505)",
            border: `4px solid ${roundPL >= 0 ? "gold" : "#e74c3c"}`,
            borderRadius: 22, padding: "30px 36px",
            boxShadow: `0 0 40px ${roundPL >= 0 ? "rgba(255,215,0,0.4)" : "rgba(231,76,60,0.5)"}`,
            textAlign: "center", minWidth: 260,
            animation: "msgPop 0.35s ease-out",
          }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>
              {roundPL >= 0 ? "💰" : "💸"}
            </div>
            <div style={{ fontSize: 16, color: "#ccc", marginBottom: 14, letterSpacing: 1 }}>
              ROUND RESULT
            </div>

            {/* Round P/L */}
            <div style={{
              fontSize: 38, fontWeight: "bold",
              color: roundPL >= 0 ? "#2ecc71" : "#e74c3c",
              textShadow: `0 0 14px ${roundPL >= 0 ? "#2ecc71" : "#e74c3c"}`,
              marginBottom: 4,
            }}>
              {roundPL >= 0 ? `+$${roundPL}` : `-$${Math.abs(roundPL)}`}
            </div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 20 }}>this roll</div>

            {/* Session P/L */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 14, marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Session total</div>
              <div style={{
                fontSize: 24, fontWeight: "bold",
                color: (bankroll - sessionStartBankroll.current) >= 0 ? "#2ecc71" : "#e74c3c",
              }}>
                {(bankroll - sessionStartBankroll.current) >= 0
                  ? `+$${bankroll - sessionStartBankroll.current}`
                  : `-$${Math.abs(bankroll - sessionStartBankroll.current)}`}
              </div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                started at ${sessionStartBankroll.current.toLocaleString()} · now ${bankroll.toLocaleString()}
              </div>
            </div>

            <button onClick={dismissPL} style={{
              background: "linear-gradient(135deg, gold, #b8860b)",
              color: "black", border: "none", borderRadius: 12,
              padding: "11px 36px", fontSize: 16, fontWeight: "bold",
              cursor: "pointer", boxShadow: "0 0 14px rgba(255,215,0,0.4)",
            }}>
              Keep Rolling
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Lobby() {
  const [, setLocation] = useLocation();
  const [playerName, setPlayerName] = useState(getLocalPlayerName);
  const [nameInput, setNameInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [bankroll, setBankroll] = useState(1000);
  const [showAndy, setShowAndy] = useState(false);
  const [showWhale, setShowWhale] = useState(false);
  const [showLucas, setShowLucas] = useState(false);
  const [showElise, setShowElise] = useState(false);

  useEffect(() => {
    setBankroll(getLocalBankroll());
  }, [playerName]);

  const triggerNamePopup = (name: string) => {
    const n = name.toLowerCase();
    if (n === "andy")  setTimeout(() => { setShowAndy(true);  setTimeout(() => setShowAndy(false),  1800); }, 300);
    if (n === "noah")  setTimeout(() => { setShowWhale(true); setTimeout(() => setShowWhale(false), 1800); }, 300);
    if (n === "lucas") setTimeout(() => { setShowLucas(true); setTimeout(() => setShowLucas(false), 1800); }, 300);
    if (n === "elise") setTimeout(() => { setShowElise(true); setTimeout(() => setShowElise(false), 1800); }, 300);
  };

  useEffect(() => { triggerNamePopup(playerName); }, []);

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    saveLocalPlayerName(trimmed);
    setPlayerName(trimmed);
    setNameInput("");
    setEditing(false);
    setBankroll(getLocalBankroll());
    triggerNamePopup(trimmed);
  };

  const dealers = [
    { name: "Bean",        minBalance: 1000 },
    { name: "LJ",          minBalance: 2000 },
    { name: "WillYum",     minBalance: 3000 },
    { name: "Great Clips", minBalance: 4000 },
    { name: "Bob Ross",    minBalance: 5000 },
    { name: "Big Sexy",    minBalance: 6000 },
    { name: "Shamu 🐋",    minBalance: 7000 },
  ];

  let chosenDealer = dealers[0];
  for (const d of dealers) { if (bankroll >= d.minBalance) chosenDealer = d; }

  const cardStyle: React.CSSProperties = {
    background: "linear-gradient(145deg, #013b18, #045d25)",
    border: "4px solid gold", borderRadius: 24,
    padding: 25, boxShadow: "0 0 18px black",
    cursor: "pointer", transition: "all 0.25s",
  };

  // No name yet — show name entry screen
  if (!playerName && !editing) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #3b0000, #120000 70%)",
        color: "white", fontFamily: "Arial, sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ background: "rgba(0,0,0,0.8)", border: "3px solid gold", borderRadius: 18, padding: 32, width: 320, boxShadow: "0 0 24px gold", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 6 }}>♠ Bean Casino ♥</div>
          <div style={{ color: "gold", fontSize: 28, fontWeight: "bold", textShadow: "0 0 12px gold", marginBottom: 8 }}>Welcome!</div>
          <p style={{ color: "#ddd", marginBottom: 18, fontSize: 15 }}>Enter your name to save your bankroll across all games.</p>
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveName()}
            placeholder="Your name"
            autoFocus
            style={{
              width: "90%", padding: 12, borderRadius: 10, border: "2px solid gold",
              fontSize: 16, textAlign: "center", boxSizing: "border-box",
              background: "#111", color: "white", marginBottom: 12,
            }}
          />
          <button onClick={saveName} disabled={!nameInput.trim()} style={{
            background: nameInput.trim() ? "gold" : "#555", color: "black",
            border: "none", borderRadius: 10, padding: "11px 28px",
            fontSize: 16, fontWeight: "bold",
            cursor: nameInput.trim() ? "pointer" : "not-allowed",
          }}>Enter Casino</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, #3b0000, #120000 70%)",
      color: "white", fontFamily: "Arial, sans-serif",
      textAlign: "center", padding: "0 0 40px 0",
    }}>
      <style>{`
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
        <div style={{
          position: "fixed", top: "42%", left: "50%",
          transform: "translate(-50%, -50%)", zIndex: 30000,
          background: "linear-gradient(135deg, #1a1a00, #5a4500)",
          color: "#ff4400", border: "5px solid #ff6600", borderRadius: 24,
          padding: "26px 44px", fontSize: 48, fontWeight: "bold",
          letterSpacing: 2, boxShadow: "0 0 40px #ff4400",
          textAlign: "center", animation: "andyPop 1.8s ease-out",
        }}>Big AHH neck</div>
      )}
      {showWhale && (
        <div style={{
          position: "fixed", top: "42%", left: "50%",
          transform: "translate(-50%, -50%)", zIndex: 30000,
          background: "#003f91", color: "white", border: "5px solid gold",
          borderRadius: 24, padding: "24px 34px", fontSize: 32, fontWeight: "bold",
          boxShadow: "0 0 35px #00aaff", textAlign: "center",
          animation: "whalePop 1.8s ease-out",
        }}>🐋 You are a whale Noah 🐋</div>
      )}
      {showLucas && (
        <div style={{
          position: "fixed", top: "42%", left: "50%",
          transform: "translate(-50%, -50%)", zIndex: 30000,
          background: "linear-gradient(135deg, #111, #5c0000)",
          color: "gold", border: "5px solid white", borderRadius: 24,
          padding: "26px 40px", fontSize: 58, fontWeight: "bold",
          letterSpacing: 3, boxShadow: "0 0 35px red",
          textAlign: "center", animation: "lucasPop 1.8s ease-out",
        }}>BEANER</div>
      )}
      {showElise && (
        <div style={{
          position: "fixed", top: "42%", left: "50%",
          transform: "translate(-50%, -50%)", zIndex: 30000,
          background: "linear-gradient(135deg, #000b1a, #003366)",
          color: "#00cfff", border: "5px solid #00cfff", borderRadius: 24,
          padding: "26px 44px", fontSize: 44, fontWeight: "bold",
          letterSpacing: 2, boxShadow: "0 0 40px #00cfff",
          textAlign: "center", animation: "elisePop 1.8s ease-out",
        }}>Big AHH Forehead</div>
      )}
      <h1 style={{ color: "gold", marginTop: 22, fontSize: 38, textShadow: "0 0 15px gold", marginBottom: 4 }}>
        ♠ Bean Casino ♥
      </h1>
      <div style={{ color: "#ddd", marginBottom: 20, fontSize: 16 }}>Welcome to the high roller room.</div>

      {/* Player card */}
      <div style={{ background: "rgba(0,0,0,0.75)", border: "3px solid gold", borderRadius: 18, padding: "14px 20px", maxWidth: 340, margin: "0 auto 24px", boxShadow: "0 0 18px gold" }}>
        {editing ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveName()}
              autoFocus
              placeholder="New name"
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "2px solid gold", background: "#111", color: "white", fontSize: 14 }}
            />
            <button onClick={saveName} style={{ background: "gold", color: "black", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: "bold", cursor: "pointer" }}>Save</button>
            <button onClick={() => { setEditing(false); setNameInput(""); }} style={{ background: "#555", color: "white", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>✕</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 12, color: "#aaa" }}>Playing as</div>
              <div style={{ fontSize: 20, fontWeight: "bold", color: "gold" }}>{playerName}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#aaa" }}>Bankroll</div>
              <div style={{ fontSize: 22, fontWeight: "bold" }}>${bankroll.toLocaleString()}</div>
            </div>
          </div>
        )}
        {!editing && (
          <button onClick={() => { setEditing(true); setNameInput(playerName); }} style={{ marginTop: 8, background: "transparent", color: "#aaa", border: "1px solid #555", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>
            Change name
          </button>
        )}
      </div>

      {/* Game cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, padding: "0 22px", maxWidth: 820, margin: "0 auto" }}>
        <div style={cardStyle}
          onClick={() => { window.location.href = "/blackjack/"; }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 22px gold"; (e.currentTarget as HTMLElement).style.transform = "scale(1.04)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 18px black"; (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
        >
          <div style={{ fontSize: 26, fontWeight: "bold", color: "gold", marginBottom: 8 }}>Blackjack</div>
          <div style={{ color: "#eee", fontSize: 14, minHeight: 44 }}>Beat the dealers and climb the casino ladder.</div>
          <button style={{ marginTop: 12, background: "gold", color: "black", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 14, fontWeight: "bold", cursor: "pointer" }}>Enter Table</button>
        </div>

        <div style={cardStyle}
          onClick={() => setLocation("/")}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 22px gold"; (e.currentTarget as HTMLElement).style.transform = "scale(1.04)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 18px black"; (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
        >
          <div style={{ fontSize: 26, fontWeight: "bold", color: "gold", marginBottom: 8 }}>Bubble Craps</div>
          <div style={{ color: "#eee", fontSize: 14, minHeight: 44 }}>Crapless craps with animated bubble dice.</div>
          <button style={{ marginTop: 12, background: "gold", color: "black", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 14, fontWeight: "bold", cursor: "pointer" }}>Roll Dice</button>
        </div>

        <div style={cardStyle}
          onClick={() => { window.location.href = "/slots/"; }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 22px gold"; (e.currentTarget as HTMLElement).style.transform = "scale(1.04)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 18px black"; (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
        >
          <div style={{ fontSize: 26, fontWeight: "bold", color: "gold", marginBottom: 8 }}>🌊 Slots</div>
          <div style={{ color: "#eee", fontSize: 14, minHeight: 44 }}>Deep sea themed slots with bonus rounds.</div>
          <button style={{ marginTop: 12, background: "gold", color: "black", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 14, fontWeight: "bold", cursor: "pointer" }}>Pull Lever</button>
        </div>
      </div>

      <div style={{ marginTop: 36 }}>
        <div style={{ fontSize: 22, fontWeight: "bold", color: "gold" }}>{chosenDealer.name}</div>
        <div style={{ color: "#aaa", fontSize: 12, marginTop: 3 }}>Your current dealer</div>
      </div>

      <div style={{ marginTop: 36, color: "#aaa", fontSize: 13 }}>Bean Casino ©</div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={CrapsGame} />
      <Route path="/lobby" component={Lobby} />
      <Route>
        <div style={{ color: "white", padding: 40, textAlign: "center" }}>Page not found.</div>
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <WouterRouter base="/craps">
      <Router />
    </WouterRouter>
  );
}
