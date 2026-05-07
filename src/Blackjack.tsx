import { useState, useRef, useCallback, useEffect } from "react";

interface Card { value: string; suit: string; }

interface GameState {
  bankroll: number;
  startingBankroll: number;
  wins: number;
  losses: number;
  selectedBet: number;
  selectedTriLuxBet: number;
  currentBet: number;
  currentTriLuxBet: number;
  insuranceBet: number;
  gameActive: boolean;
  dealerHidden: boolean;
  resolvingRound: boolean;
  waitingForInsurance: boolean;
  dealingCards: boolean;
  dealerHand: Card[];
  playerHands: Card[][];
  handBets: number[];
  activeHand: number;
  message: string;
  beanBubble: string;
  dealerImg: string;
  dealerName: string;
  resolvedMessages: string[];
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function createDeck(): Card[] {
  const suits = ["♠", "♥", "♦", "♣"];
  const values = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const d: Card[] = [];
  for (const suit of suits) for (const value of values) d.push({ value, suit });
  return d.sort(() => Math.random() - 0.5);
}

function cardNumber(c: Card): number {
  if (c.value === "A") return 11;
  if (["J", "Q", "K"].includes(c.value)) return 10;
  return Number(c.value);
}

function rankValue(c: Card): number {
  if (c.value === "A") return 14;
  if (c.value === "K") return 13;
  if (c.value === "Q") return 12;
  if (c.value === "J") return 11;
  return Number(c.value);
}

function handScore(hand: Card[]): number {
  let score = 0, aces = 0;
  for (const c of hand) { score += cardNumber(c); if (c.value === "A") aces++; }
  while (score > 21 && aces > 0) { score -= 10; aces--; }
  return score;
}

function isSoft17(hand: Card[]): boolean {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.value === "A") { aces++; total += 11; }
    else if (["J","Q","K"].includes(c.value)) total += 10;
    else total += Number(c.value);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total === 17 && aces > 0;
}

function isNaturalBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && handScore(hand) === 21;
}

function dealerShouldHit(hand: Card[]): boolean {
  const score = handScore(hand);
  if (score < 17) return true;
  if (score === 17 && isSoft17(hand)) return true;
  return false;
}

function evaluateTriLux(cards: Card[]): { name: string; odds: number } {
  const ranks = cards.map(rankValue).sort((a, b) => a - b);
  const suits = cards.map(c => c.suit);
  const flush = suits[0] === suits[1] && suits[1] === suits[2];
  const counts: Record<number, number> = {};
  ranks.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
  const vals = Object.values(counts);
  const trips = vals.includes(3);
  const pair  = vals.includes(2);
  const straight = (ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2])
    || (ranks[0] === 2  && ranks[1] === 3  && ranks[2] === 14)
    || (ranks[0] === 12 && ranks[1] === 13 && ranks[2] === 14);
  if (straight && flush) return { name: "Straight Flush", odds: 40 };
  if (trips)             return { name: "Three of a Kind", odds: 30 };
  if (straight)          return { name: "Straight", odds: 10 };
  if (flush)             return { name: "Flush", odds: 5 };
  if (pair)              return { name: "Pair", odds: 1 };
  return { name: "No Hit", odds: 0 };
}

function getBookMove(hand: Card[], upCard: number): string {
  const pScore = handScore(hand);
  if (hand.length === 2 && cardNumber(hand[0]) === cardNumber(hand[1])) {
    const pv = cardNumber(hand[0]);
    if (pv === 11) return "Split";
    if (pv === 8)  return "Split";
    if (pv === 10) return "Stand";
    if (pv === 9)  return [2,3,4,5,6,8,9].includes(upCard) ? "Split" : "Stand";
    if (pv === 7)  return upCard >= 2 && upCard <= 7 ? "Split" : "Hit";
    if (pv === 6)  return upCard >= 2 && upCard <= 6 ? "Split" : "Hit";
    if (pv === 5)  return upCard >= 2 && upCard <= 9 ? "Double" : "Hit";
    if (pv === 4)  return upCard === 5 || upCard === 6 ? "Split" : "Hit";
    if (pv === 3 || pv === 2) return upCard >= 2 && upCard <= 7 ? "Split" : "Hit";
  }
  if (pScore >= 17) return "Stand";
  if (pScore >= 13 && pScore <= 16) return upCard >= 2 && upCard <= 6 ? "Stand" : "Hit";
  if (pScore === 12) return upCard >= 4 && upCard <= 6 ? "Stand" : "Hit";
  if (pScore === 11) return "Double";
  if (pScore === 10) return upCard >= 2 && upCard <= 9 ? "Double" : "Hit";
  if (pScore === 9)  return upCard >= 3 && upCard <= 6 ? "Double" : "Hit";
  return "Hit";
}

function randomLine(arr: string[]) { return arr[Math.floor(Math.random() * arr.length)]; }
const isRed = (c: Card) => c.suit === "♥" || c.suit === "♦";

const DEALERS = [
  { name: "Bean",        image: "/dealer1.png", minBalance: 1000 },
  { name: "LJ",         image: "/dealer2.png",  minBalance: 2000 },
  { name: "WillYum",    image: "/dealer3.png",  minBalance: 3000 },
  { name: "Great Clips",image: "/dealer4.png",  minBalance: 4000 },
  { name: "Bob Ross",   image: "/dealer6.png",  minBalance: 5000 },
  { name: "Big Sexy",   image: "/dealer7.jpg",  minBalance: 6000 },
  { name: "Shamu 🐋",   image: "/dealer5.png",  minBalance: 7000 },
  { name: "Forehead",   image: "/dealer8.jpg",  minBalance: 8000 },
  { name: "Jizzy",      image: "/dealer9.jpg",  minBalance: 9000 },
];
type Dealer = typeof DEALERS[number];

const winLines  = ["That's tough… you really thought you had that? 😂", "Easy money.", "You just donated to the casino.", "Ouch… that hurt to watch."];
const loseLines = ["You got lucky.", "Don't get used to it.", "This isn't over.", "Fine. Take it and go."];
const bustLines = ["WHAT?!", "You've got to be kidding me!", "This deck is rigged!", "I hate this game."];
const pushLines = ["Boring.", "Meh.", "Nobody wins. Great."];
function dealerLine(name: string, arr: string[]) { return `${name}: ${randomLine(arr)}`; }

const chipColors: Record<number, string> = { 10: "#8b0000", 25: "#003f91", 50: "#111", 100: "#6a008a", 250: "#006b38" };

function canDoubleCheck(s: GameState) {
  if (!s.gameActive || s.resolvingRound || s.waitingForInsurance || s.dealingCards) return false;
  const hand = s.playerHands[s.activeHand];
  return !!hand && hand.length === 2 && s.bankroll >= s.handBets[s.activeHand];
}
function canSplitCheck(s: GameState) {
  if (!s.gameActive || s.resolvingRound || s.waitingForInsurance || s.dealingCards) return false;
  const hand = s.playerHands[s.activeHand];
  if (!hand || hand.length !== 2 || s.bankroll < s.handBets[s.activeHand]) return false;
  return cardNumber(hand[0]) === cardNumber(hand[1]);
}

function CardEl({ card, hidden = false }: { card: Card; hidden?: boolean }) {
  const base: React.CSSProperties = {
    background: "white", color: "black", width: 42, height: 58,
    borderRadius: 7, flexShrink: 0, display: "flex",
    alignItems: "center", justifyContent: "center",
    fontSize: 16, fontWeight: "bold", boxShadow: "2px 2px 6px black",
    animation: "dealCard 0.45s ease-out",
  };
  if (hidden) return (
    <div style={{ ...base, background: "linear-gradient(135deg,#111,#b00000)", color: "gold", border: "2px solid gold" }}>★</div>
  );
  return <div style={{ ...base, color: isRed(card) ? "red" : "black" }}>{card.value + card.suit}</div>;
}

const init: GameState = {
  bankroll: 1000, startingBankroll: 1000, wins: 0, losses: 0, selectedBet: 0, selectedTriLuxBet: 0,
  currentBet: 0, currentTriLuxBet: 0, insuranceBet: 0,
  gameActive: false, dealerHidden: true, resolvingRound: false,
  waitingForInsurance: false, dealingCards: false,
  dealerHand: [], playerHands: [], handBets: [], activeHand: 0,
  message: "Drag chips to Main Bet or TriLux, then press Deal.",
  beanBubble: "", dealerImg: "/dealer1.png", dealerName: "Bean",
  resolvedMessages: [],
};

export default function App() {
  const [state, setState] = useState<GameState>(init);
  const stateRef = useRef<GameState>(init);
  const deckRef = useRef<Card[]>([]);
  const currentMainBetRef = useRef(0);
  const [showBlackjack, setShowBlackjack] = useState(false);
  const [showWhale, setShowWhale] = useState(false);
  const [showLucas, setShowLucas] = useState(false);
  const [showAndy, setShowAndy] = useState(false);
  const [showElise, setShowElise] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [triLuxWin, setTriLuxWin] = useState<number | null>(null);
  const [roundResult, setRoundResult] = useState<{ net: number; label: string } | null>(null);
  const roundStartTotalRef = useRef(0);
  const [currentUser, setCurrentUser] = useState("");
  const currentUserRef = useRef("");
  const [loginInput, setLoginInput] = useState(() => localStorage.getItem("lastBlackjackUser") ?? "");

  /* DOM refs for drag-and-drop */
  const betSpotRef = useRef<HTMLDivElement>(null);
  const triluxSpotRef = useRef<HTMLDivElement>(null);
  const draggingValueRef = useRef<number | null>(null);
  const draggingCloneRef = useRef<HTMLDivElement | null>(null);

  const set = useCallback((patch: Partial<GameState> | ((s: GameState) => Partial<GameState>)) => {
    setState(s => {
      const next = { ...s, ...(typeof patch === "function" ? patch(s) : patch) };
      stateRef.current = next;
      return next;
    });
  }, []);

  /* ── Save / Load / Auth ── */
  const saveGame = useCallback(() => {
    if (!currentUserRef.current) return;
    const s = stateRef.current;
    const data = {
      bankroll: s.bankroll, startingBankroll: s.startingBankroll,
      wins: s.wins, losses: s.losses,
      currentDealerName: s.dealerName,
    };
    localStorage.setItem("blackjackSave_" + currentUserRef.current, JSON.stringify(data));
  }, []);

  const loadGame = useCallback((username: string) => {
    const raw = localStorage.getItem("blackjackSave_" + username);
    if (!raw) {
      const next = { ...init, message: "Welcome! Drag chips to bet." };
      stateRef.current = next; setState(next);
      return;
    }
    const data = JSON.parse(raw);
    const savedBankroll = data.bankroll ?? 1000;
    let restoredDealer = DEALERS[0];
    for (const d of DEALERS) { if (savedBankroll >= d.minBalance) restoredDealer = d; }
    const next = {
      ...init,
      bankroll: savedBankroll, startingBankroll: data.startingBankroll ?? 1000,
      wins: data.wins ?? 0, losses: data.losses ?? 0,
      dealerImg: restoredDealer.image, dealerName: restoredDealer.name,
      message: "Welcome back! Drag chips to bet.",
    };
    stateRef.current = next; setState(next);
  }, []);

  const loginPlayer = useCallback(() => {
    const name = loginInput.trim();
    if (!name) { alert("Enter a player name."); return; }
    currentUserRef.current = name;
    setCurrentUser(name);
    localStorage.setItem("lastBlackjackUser", name);
    if (name.toLowerCase() === "noah") {
      setTimeout(() => { setShowWhale(true); setTimeout(() => setShowWhale(false), 1800); }, 300);
    }
    if (name.toLowerCase() === "lucas") {
      setTimeout(() => { setShowLucas(true); setTimeout(() => setShowLucas(false), 1800); }, 300);
    }
    if (name.toLowerCase() === "andy") {
      setTimeout(() => { setShowAndy(true); setTimeout(() => setShowAndy(false), 1800); }, 300);
    }
    if (name.toLowerCase() === "elise") {
      setTimeout(() => { setShowElise(true); setTimeout(() => setShowElise(false), 1800); }, 300);
    }
    loadGame(name);
  }, [loginInput, loadGame]);

  // Auto-login from lobby name, or redirect to lobby if none stored
  useEffect(() => {
    const stored = localStorage.getItem("lastBlackjackUser");
    if (stored) {
      currentUserRef.current = stored;
      setCurrentUser(stored);
      if (stored.toLowerCase() === "noah") {
        setTimeout(() => { setShowWhale(true); setTimeout(() => setShowWhale(false), 1800); }, 300);
      }
      if (stored.toLowerCase() === "lucas") {
        setTimeout(() => { setShowLucas(true); setTimeout(() => setShowLucas(false), 1800); }, 300);
      }
      if (stored.toLowerCase() === "andy") {
        setTimeout(() => { setShowAndy(true); setTimeout(() => setShowAndy(false), 1800); }, 300);
      }
      if (stored.toLowerCase() === "elise") {
        setTimeout(() => { setShowElise(true); setTimeout(() => setShowElise(false), 1800); }, 300);
      }
      loadGame(stored);
    } else {
      window.location.href = "/craps/lobby";
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const logoutPlayer = useCallback(() => {
    saveGame();
    currentUserRef.current = "";
    setCurrentUser("");
    window.location.href = "/craps/lobby";
  }, [saveGame]);

  /* ── Chip betting ── */
  const addChipToBet = useCallback((amount: number, type: "main" | "trilux") => {
    const s = stateRef.current;
    if (s.gameActive || s.resolvingRound || s.dealingCards) return;
    if (s.bankroll < amount) { set({ message: "Not enough bankroll for that chip." }); return; }
    if (type === "trilux") {
      set({ bankroll: s.bankroll - amount, selectedTriLuxBet: s.selectedTriLuxBet + amount,
        message: `TriLux chip added. Side bet: $${s.selectedTriLuxBet + amount}.` });
    } else {
      set({ bankroll: s.bankroll - amount, selectedBet: s.selectedBet + amount,
        message: `Main bet chip added. Main bet: $${s.selectedBet + amount}.` });
    }
    saveGame();
  }, [set, saveGame]);

  const clearBets = useCallback(() => {
    const s = stateRef.current;
    if (s.gameActive || s.resolvingRound || s.dealingCards) return;
    set({ bankroll: s.bankroll + s.selectedBet + s.selectedTriLuxBet,
      selectedBet: 0, selectedTriLuxBet: 0, message: "Bets cleared." });
    saveGame();
  }, [set, saveGame]);

  /* ── Clone-based chip drag ── */
  const getDropTarget = useCallback((x: number, y: number): "main" | "trilux" | null => {
    const mainRect = betSpotRef.current?.getBoundingClientRect();
    const triRect  = triluxSpotRef.current?.getBoundingClientRect();
    if (triRect  && x >= triRect.left  && x <= triRect.right  && y >= triRect.top  && y <= triRect.bottom)  return "trilux";
    if (mainRect && x >= mainRect.left && x <= mainRect.right && y >= mainRect.top && y <= mainRect.bottom) return "main";
    return null;
  }, []);

  const startChipDrag = useCallback((e: React.PointerEvent, value: number) => {
    const s = stateRef.current;
    if (s.gameActive || s.resolvingRound || s.dealingCards) return;
    e.preventDefault();

    draggingValueRef.current = value;

    const clone = document.createElement("div");
    clone.style.cssText = [
      "position:fixed", "z-index:10000", "pointer-events:none",
      `width:55px`, `height:55px`, "border-radius:50%",
      `background:${chipColors[value]}`, "color:white",
      "border:5px dashed white", "box-shadow:0 3px 6px black",
      "font-size:13px", "font-weight:bold",
      "display:flex", "align-items:center", "justify-content:center",
      "transform:scale(1.12)",
      `left:${e.clientX - 27}px`, `top:${e.clientY - 27}px`,
    ].join(";");
    clone.textContent = `$${value}`;
    document.body.appendChild(clone);
    draggingCloneRef.current = clone;

    const onMove = (ev: PointerEvent) => {
      if (!draggingCloneRef.current) return;
      ev.preventDefault();
      draggingCloneRef.current.style.left = ev.clientX - 27 + "px";
      draggingCloneRef.current.style.top  = ev.clientY - 27 + "px";
      const target = getDropTarget(ev.clientX, ev.clientY);
      betSpotRef.current?.classList.toggle("active-drop", target === "main");
      triluxSpotRef.current?.classList.toggle("active-drop", target === "trilux");
    };

    const onUp = (ev: PointerEvent) => {
      const val = draggingValueRef.current;
      const target = getDropTarget(ev.clientX, ev.clientY);
      betSpotRef.current?.classList.remove("active-drop");
      triluxSpotRef.current?.classList.remove("active-drop");
      draggingCloneRef.current?.remove();
      draggingCloneRef.current = null;
      draggingValueRef.current = null;
      if (val !== null && target) addChipToBet(val, target);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [getDropTarget, addChipToBet]);

  /* ── Async helpers ── */
  const dealCardToPlayer = useCallback(async (handIndex: number) => {
    const card = deckRef.current.pop()!;
    set(s => ({ playerHands: s.playerHands.map((h, i) => i === handIndex ? [...h, card] : h) }));
    await sleep(350);
  }, [set]);

  const dealCardToDealer = useCallback(async () => {
    const card = deckRef.current.pop()!;
    set(s => ({ dealerHand: [...s.dealerHand, card] }));
    await sleep(350);
  }, [set]);

  /* ── TriLux resolution ── */
  const showTriLuxWin = useCallback((amount: number) => {
    setTriLuxWin(amount);
    setTimeout(() => setTriLuxWin(null), 1300);
  }, []);

  const resolveTriLux = useCallback(() => {
    const s = stateRef.current;
    if (s.currentTriLuxBet <= 0) return;
    const cards = [s.playerHands[0][0], s.playerHands[0][1], s.dealerHand[0]];
    const result = evaluateTriLux(cards);
    if (result.odds > 0) {
      const winnings = s.currentTriLuxBet * result.odds;
      const payout = s.currentTriLuxBet * (result.odds + 1);
      showTriLuxWin(winnings);
      set(cs => ({ bankroll: cs.bankroll + payout, currentTriLuxBet: 0,
        message: `TriLux: ${result.name}! Won $${winnings}. `,
        beanBubble: `${s.dealerName}: TriLux hit. Fine, take the money.` }));
    } else {
      set({ currentTriLuxBet: 0, message: `TriLux: No hit. Lost $${s.currentTriLuxBet}. `,
        beanBubble: `${s.dealerName}: TriLux missed. No money there.` });
    }
  }, [set, showTriLuxWin]);

  const showRoundResultBanner = useCallback((net: number, label: string) => {
    setRoundResult({ net, label });
    setTimeout(() => setRoundResult(null), 1400);
  }, []);

  /* ── Dealer rotation ── */
  const showBlackjackCelebration = useCallback(() => {
    setShowBlackjack(true);
    setTimeout(() => setShowBlackjack(false), 1200);
  }, []);

  const keepOrClearMainBetAfterRound = useCallback((keepBet: boolean) => {
    const savedBet = currentMainBetRef.current;
    if (keepBet && savedBet > 0) {
      set(cs => cs.bankroll >= savedBet
        ? { selectedBet: savedBet, bankroll: cs.bankroll - savedBet }
        : {});
    }
  }, [set]);

  const updateDealerByBankroll = useCallback((totalMoney: number) => {
    let chosen = DEALERS[0];
    for (const d of DEALERS) { if (totalMoney >= d.minBalance) chosen = d; }
    set(cs => cs.dealerName !== chosen.name
      ? { dealerImg: chosen.image, dealerName: chosen.name, beanBubble: `${chosen.name}: Welcome to my table.` }
      : {});
  }, [set]);

  const resolvePlayerBlackjack = useCallback(async () => {
    const s = stateRef.current;
    const bet = s.handBets[0];
    set({ dealerHidden: false });
    await sleep(500);
    const cur = stateRef.current;
    const dealerBJ = isNaturalBlackjack(cur.dealerHand);
    if (dealerBJ) {
      const netPush = (cur.bankroll + bet) - roundStartTotalRef.current;
      set(cs => ({ bankroll: cs.bankroll + bet, currentBet: 0, currentTriLuxBet: 0, insuranceBet: 0,
        gameActive: false, resolvingRound: false, waitingForInsurance: false, dealingCards: false,
        resolvedMessages: [],
        message: `Both you and ${cur.dealerName} have blackjack. Push.`,
        beanBubble: `${cur.dealerName}: Fine. Nobody wins.` }));
      keepOrClearMainBetAfterRound(true);
      showRoundResultBanner(netPush, "PUSH");
      updateDealerByBankroll(cur.bankroll + bet);
    } else {
      const payout = Math.floor(bet * 1.5);
      const netBJ = (cur.bankroll + bet + payout) - roundStartTotalRef.current;
      showBlackjackCelebration();
      set(cs => ({ bankroll: cs.bankroll + bet + payout, currentBet: 0, currentTriLuxBet: 0, insuranceBet: 0,
        gameActive: false, resolvingRound: false, waitingForInsurance: false, dealingCards: false,
        wins: cs.wins + 1, resolvedMessages: [],
        message: `BLACKJACK! Won $${payout} paid 3:2.`,
        beanBubble: `${cur.dealerName}: ...that one hurt.` }));
      keepOrClearMainBetAfterRound(true);
      showRoundResultBanner(netBJ, "BLACKJACK!");
      updateDealerByBankroll(cur.bankroll + bet + payout);
    }
    saveGame();
  }, [set, showBlackjackCelebration, keepOrClearMainBetAfterRound, showRoundResultBanner, updateDealerByBankroll, saveGame]);

  /* ── Deal ── */
  const deal = useCallback(async () => {
    const s = stateRef.current;
    if (s.gameActive || s.resolvingRound || s.dealingCards) return;
    if (s.selectedBet <= 0) { set({ message: "You need a main bet before dealing." }); return; }

    const totalMoney = s.bankroll + s.selectedBet + s.selectedTriLuxBet;
    let d = DEALERS[0];
    for (const dealer of DEALERS) { if (totalMoney >= dealer.minBalance) d = dealer; }
    deckRef.current = createDeck();
    const bet = s.selectedBet; const triLux = s.selectedTriLuxBet;
    roundStartTotalRef.current = totalMoney;
    currentMainBetRef.current = bet;
    set({
      beanBubble: "", currentBet: bet, currentTriLuxBet: triLux,
      insuranceBet: 0, selectedBet: 0, selectedTriLuxBet: 0,
      dealerHand: [], playerHands: [[]], handBets: [bet], activeHand: 0,
      gameActive: true, dealerHidden: true, resolvingRound: false,
      waitingForInsurance: false, dealingCards: true,
      message: `${d.name} is dealing...`,
      dealerImg: d.image, dealerName: d.name,
    });

    await dealCardToPlayer(0); await sleep(150);
    await dealCardToDealer();  await sleep(150);
    await dealCardToPlayer(0); await sleep(150);
    await dealCardToDealer();  await sleep(150);

    resolveTriLux();
    set({ dealingCards: false });

    if (isNaturalBlackjack(stateRef.current.playerHands[0])) {
      await resolvePlayerBlackjack();
      return;
    }

    const cur = stateRef.current;
    if (cur.dealerHand[0].value === "A") {
      set({ waitingForInsurance: true, message: (cur.message.endsWith(". ") ? cur.message : "") + `${d.name} shows an Ace. Take insurance?` });
    } else {
      const triLuxMsg = cur.message.endsWith(". ") ? cur.message : "";
      set({ message: triLuxMsg + "Your move." });
    }
  }, [set, dealCardToPlayer, dealCardToDealer, resolveTriLux, updateDealerByBankroll, resolvePlayerBlackjack]);

  /* ── Insurance ── */
  const takeInsurance = useCallback(() => {
    const s = stateRef.current;
    if (!s.waitingForInsurance) return;
    const maxIns = Math.floor(s.handBets[0] / 2);
    if (s.bankroll < maxIns) { set({ message: "Not enough money to take insurance." }); return; }
    const dealerBJ = s.dealerHand.length === 2 && handScore(s.dealerHand) === 21;
    if (dealerBJ) {
      let result = `${s.dealerName} has blackjack. `; let bankroll = s.bankroll - maxIns + maxIns * 3;
      let playerLost = false;
      for (let i = 0; i < s.playerHands.length; i++) {
        const bet = s.handBets[i];
        if (handScore(s.playerHands[i]) === 21 && s.playerHands[i].length === 2) { bankroll += bet; result += "Your blackjack pushes. "; }
        else { result += `Hand ${i + 1}: Lost $${bet}. `; playerLost = true; }
      }
      const netIns = bankroll - roundStartTotalRef.current;
      set(cs => ({ bankroll, insuranceBet: 0, currentBet: 0, currentTriLuxBet: 0, dealerHidden: false,
        gameActive: false, resolvingRound: false, waitingForInsurance: false, resolvedMessages: [],
        losses: playerLost ? cs.losses + 1 : cs.losses,
        message: result + "Place chips to bet again.", beanBubble: `${s.dealerName}: Fine. Insurance paid.` }));
      keepOrClearMainBetAfterRound(false);
      showRoundResultBanner(netIns, netIns < 0 ? "YOU LOST" : "PUSH");
      updateDealerByBankroll(bankroll);
      saveGame();
    } else {
      set({ bankroll: s.bankroll - maxIns, insuranceBet: maxIns, waitingForInsurance: false,
        message: `${s.dealerName} does not have blackjack. Your move.` });
    }
  }, [set, keepOrClearMainBetAfterRound, showRoundResultBanner, saveGame]);

  const declineInsurance = useCallback(() => {
    const s = stateRef.current;
    if (!s.waitingForInsurance) return;
    const dealerBJ = s.dealerHand.length === 2 && handScore(s.dealerHand) === 21;
    if (dealerBJ) {
      let result = `${s.dealerName} has blackjack. `; let bankroll = s.bankroll;
      let playerLost = false;
      for (let i = 0; i < s.playerHands.length; i++) {
        const bet = s.handBets[i];
        if (handScore(s.playerHands[i]) === 21 && s.playerHands[i].length === 2) { bankroll += bet; result += "Your blackjack pushes. "; }
        else { result += `Hand ${i + 1}: Lost $${bet}. `; playerLost = true; }
      }
      const netDecl = bankroll - roundStartTotalRef.current;
      set(cs => ({ bankroll, currentBet: 0, currentTriLuxBet: 0, insuranceBet: 0, dealerHidden: false,
        gameActive: false, resolvingRound: false, waitingForInsurance: false, resolvedMessages: [],
        losses: playerLost ? cs.losses + 1 : cs.losses,
        message: result + "Place chips to bet again.", beanBubble: dealerLine(s.dealerName, winLines) }));
      keepOrClearMainBetAfterRound(false);
      showRoundResultBanner(netDecl, netDecl < 0 ? "YOU LOST" : "PUSH");
      updateDealerByBankroll(bankroll);
      saveGame();
    } else {
      set({ waitingForInsurance: false, message: `No insurance. ${s.dealerName} does not have blackjack. Your move.` });
    }
  }, [set, keepOrClearMainBetAfterRound, showRoundResultBanner, updateDealerByBankroll, saveGame]);

  /* ── Round resolution ── */
  const finishRound = useCallback(() => {
    const s = stateRef.current;
    const dealerScore = handScore(s.dealerHand);
    let result = "", playerWon = false, dealerWon = false, pushOnly = true;
    let bankroll = s.bankroll;
    for (let i = 0; i < s.playerHands.length; i++) {
      const pScore = handScore(s.playerHands[i]); const bet = s.handBets[i];
      if (pScore > 21) { result += `Hand ${i+1}: Bust. Lost $${bet}. `; dealerWon = true; pushOnly = false; }
      else if (dealerScore > 21) { bankroll += bet * 2; result += `Hand ${i+1}: ${s.dealerName} busts. Won $${bet}. `; playerWon = true; pushOnly = false; }
      else if (pScore > dealerScore) { bankroll += bet * 2; result += `Hand ${i+1}: You win $${bet}. `; playerWon = true; pushOnly = false; }
      else if (pScore < dealerScore) { result += `Hand ${i+1}: Lost $${bet}. `; dealerWon = true; pushOnly = false; }
      else { bankroll += bet; result += `Hand ${i+1}: Push. `; }
    }
    let beanComment = "";
    if (dealerScore > 21) beanComment = dealerLine(s.dealerName, bustLines);
    else if (playerWon && !dealerWon) beanComment = dealerLine(s.dealerName, loseLines);
    else if (dealerWon && !playerWon) beanComment = dealerLine(s.dealerName, winLines);
    else if (pushOnly) beanComment = dealerLine(s.dealerName, pushLines);
    else beanComment = `${s.dealerName}: Mixed results. Don't get cocky.`;
    result += bankroll <= 0 ? "You are broke. Reset money to play again." : "Place chips to bet again.";
    const net = bankroll - roundStartTotalRef.current;
    const netLabel = net > 0 ? "YOU WIN" : net < 0 ? "YOU LOST" : "PUSH";
    set(cs => ({ bankroll, currentBet: 0, currentTriLuxBet: 0, insuranceBet: 0, gameActive: false,
      resolvingRound: false, waitingForInsurance: false, dealingCards: false,
      resolvedMessages: [],
      wins: playerWon && !dealerWon ? cs.wins + 1 : cs.wins,
      losses: dealerWon && !playerWon ? cs.losses + 1 : cs.losses,
      message: result, beanBubble: beanComment }));
    if (playerWon && !dealerWon) keepOrClearMainBetAfterRound(true);
    else if (pushOnly) keepOrClearMainBetAfterRound(true);
    showRoundResultBanner(net, netLabel);
    updateDealerByBankroll(bankroll);
    saveGame();
  }, [set, keepOrClearMainBetAfterRound, showRoundResultBanner, updateDealerByBankroll, saveGame]);

  const dealerPlay = useCallback(async () => {
    if (stateRef.current.resolvingRound) return;
    const dn = stateRef.current.dealerName;
    set({ resolvingRound: true, dealerHidden: false, message: `${dn} reveals the hidden card.` });
    await sleep(600);
    while (dealerShouldHit(stateRef.current.dealerHand)) {
      set({ message: isSoft17(stateRef.current.dealerHand) ? `${dn} has soft 17, so he has to hit.` : `${dn} hits...` });
      await sleep(500);
      await dealCardToDealer(); await sleep(350);
    }
    finishRound();
  }, [set, dealCardToDealer, finishRound]);

  const nextHand = useCallback(() => {
    const s = stateRef.current;
    const next = s.activeHand + 1;
    if (next >= s.playerHands.length) { dealerPlay(); }
    else { set({ activeHand: next, message: `Now play hand ${next + 1}.` }); }
  }, [set, dealerPlay]);

  const resolveBustedActiveHand = useCallback(() => {
    const s = stateRef.current;
    const bustedBet = s.handBets[s.activeHand];
    const newMessages = [...s.resolvedMessages, `Hand busted. Lost $${bustedBet}.`];
    const newHands = s.playerHands.filter((_, i) => i !== s.activeHand);
    const newBets = s.handBets.filter((_, i) => i !== s.activeHand);
    const newCurrentBet = Math.max(0, s.currentBet - bustedBet);

    if (newHands.length === 0) {
      const netBust = s.bankroll - roundStartTotalRef.current;
      keepOrClearMainBetAfterRound(false);
      set(cs => ({
        currentBet: 0, currentTriLuxBet: 0, insuranceBet: 0,
        gameActive: false, resolvingRound: false, waitingForInsurance: false,
        dealingCards: false, dealerHidden: false,
        playerHands: [], handBets: [], resolvedMessages: [],
        losses: cs.losses + 1,
        message: newMessages.join(" ") + " All hands busted. " + (cs.bankroll <= 0 ? "You are broke. Reset money to play again." : "Place chips to bet again."),
        beanBubble: dealerLine(s.dealerName, winLines),
      }));
      showRoundResultBanner(netBust, "YOU LOST");
      updateDealerByBankroll(s.bankroll);
      saveGame();
      return;
    }

    const newActiveHand = Math.min(s.activeHand, newHands.length - 1);
    set({ playerHands: newHands, handBets: newBets, activeHand: newActiveHand,
      currentBet: newCurrentBet, resolvedMessages: newMessages,
      message: "That hand busted and is removed. Keep playing the next hand." });
  }, [set, keepOrClearMainBetAfterRound, showRoundResultBanner, updateDealerByBankroll, saveGame]);

  /* ── Player actions ── */
  const hit = useCallback(async () => {
    const s = stateRef.current;
    if (!s.gameActive || s.resolvingRound || s.waitingForInsurance || s.dealingCards) return;
    checkAgainstBook("Hit");
    set({ dealingCards: true });
    await dealCardToPlayer(stateRef.current.activeHand);
    set({ dealingCards: false });
    if (handScore(stateRef.current.playerHands[stateRef.current.activeHand]) > 21)
      resolveBustedActiveHand();
  }, [set, dealCardToPlayer, resolveBustedActiveHand]);

  const stand = useCallback(() => {
    const s = stateRef.current;
    if (!s.gameActive || s.resolvingRound || s.waitingForInsurance || s.dealingCards) return;
    checkAgainstBook("Stand");
    nextHand();
  }, [nextHand]);

  const doubleDown = useCallback(async () => {
    const s = stateRef.current;
    if (!canDoubleCheck(s)) return;
    checkAgainstBook("Double");
    const bet = s.handBets[s.activeHand];
    set(cs => ({ bankroll: cs.bankroll - bet, currentBet: cs.currentBet + bet,
      handBets: cs.handBets.map((b, i) => i === cs.activeHand ? b * 2 : b), dealingCards: true }));
    await dealCardToPlayer(stateRef.current.activeHand);
    set({ dealingCards: false });
    if (handScore(stateRef.current.playerHands[stateRef.current.activeHand]) > 21)
      resolveBustedActiveHand();
    else nextHand();
  }, [set, dealCardToPlayer, resolveBustedActiveHand, nextHand]);

  const splitHand = useCallback(async () => {
    const s = stateRef.current;
    if (!canSplitCheck(s)) return;
    checkAgainstBook("Split");
    const bet = s.handBets[s.activeHand]; const hand = s.playerHands[s.activeHand];
    const newHands = [...s.playerHands]; const newBets = [...s.handBets];
    newHands[s.activeHand] = [hand[0]]; newHands.splice(s.activeHand + 1, 0, [hand[1]]);
    newBets.splice(s.activeHand + 1, 0, bet);
    set({ bankroll: s.bankroll - bet, currentBet: s.currentBet + bet,
      playerHands: newHands, handBets: newBets,
      dealingCards: true, message: `Split! ${s.dealerName} is dealing one card to each hand.` });
    await dealCardToPlayer(stateRef.current.activeHand); await sleep(150);
    await dealCardToPlayer(stateRef.current.activeHand + 1);
    set({ dealingCards: false, message: "Play hand 1 first." });
  }, [set, dealCardToPlayer]);

  const checkAgainstBook = useCallback((playerMove: string) => {
    const s = stateRef.current;
    if (!s.gameActive || s.resolvingRound || s.waitingForInsurance || s.dealingCards) return;
    const hand = s.playerHands[s.activeHand];
    if (!hand || hand.length === 0) return;
    const bookMove = getBookMove(hand, cardNumber(s.dealerHand[0]));
    if (playerMove !== bookMove) set({ beanBubble: `${s.dealerName}: dumb ass` });
  }, [set]);

  const giveAdvice = useCallback(() => {
    const s = stateRef.current;
    if (!s.gameActive || s.resolvingRound || s.waitingForInsurance || s.dealingCards) return;
    const hand = s.playerHands[s.activeHand];
    set({ message: `Book says: ${getBookMove(hand, cardNumber(s.dealerHand[0]))}.` });
  }, [set]);

  const showStats = useCallback(() => {
    const { wins, losses, bankroll, selectedBet, selectedTriLuxBet, startingBankroll } = stateRef.current;
    const total = wins + losses;
    const pct = total === 0 ? 0 : Math.round((wins / total) * 100);
    const profit = bankroll + selectedBet + selectedTriLuxBet - startingBankroll;
    const profitText = profit >= 0 ? `+$${profit}` : `-$${Math.abs(profit)}`;
    alert(`Wins: ${wins}\nLosses: ${losses}\nWin %: ${pct}%\nProfit/Loss: ${profitText}`);
  }, []);

  const resetMoney = useCallback(() => {
    setShowResetConfirm(true);
  }, []);

  const confirmResetYes = useCallback(() => {
    setShowResetConfirm(false);
    deckRef.current = [];
    const next = { ...init, bankroll: 1000, startingBankroll: 1000, message: "Money reset. Drag chips to bet." };
    stateRef.current = next; setState(next);
    saveGame();
  }, [saveGame]);

  const confirmResetNo = useCallback(() => {
    setShowResetConfirm(false);
    set(cs => ({ bankroll: cs.bankroll - 1000000, message: "Wrong answer. Enjoy the debt." }));
    saveGame();
  }, [saveGame, set]);

  const { bankroll, selectedBet, selectedTriLuxBet, currentBet, gameActive, dealerHidden,
    resolvingRound, waitingForInsurance, dealingCards,
    dealerHand, playerHands, handBets, activeHand, message, beanBubble,
    dealerImg, dealerName } = state;

  const showActions = gameActive && !resolvingRound && !waitingForInsurance && !dealingCards;
  const showDeal = !gameActive && !resolvingRound && !dealingCards;
  const showDouble = canDoubleCheck(state);
  const showSplit = canSplitCheck(state);
  const dealerRevealed = !dealerHidden || !gameActive;
  const showClear = showDeal && (selectedBet > 0 || selectedTriLuxBet > 0);

  return (
    <>
      {showResetConfirm && (
        <div className="reset-confirm-overlay">
          <div className="reset-confirm-box">
            <h2>Is Will your daddy?</h2>
            <div className="reset-confirm-buttons">
              <button className="reset-confirm-yes" onClick={confirmResetYes}>Yes</button>
              <button className="reset-confirm-no" onClick={confirmResetNo}>No</button>
            </div>
          </div>
        </div>
      )}
      {showBlackjack && <div className="blackjack-celebration">BLACKJACK!</div>}
      {showWhale && <div className="noah-whale-animation">🐋 You are a whale Noah 🐋</div>}
      {showLucas && <div className="lucas-animation">BEANER</div>}
      {showAndy && <div className="andy-animation">Big AHH neck</div>}
      {showElise && <div className="elise-animation">Big AHH Forehead</div>}
      {triLuxWin !== null && (
        <div className="trilux-win-animation">
          <div>TRILUX WON!</div>
          <span>+${triLuxWin}</span>
        </div>
      )}
      {roundResult && (
        <div className={`round-result ${roundResult.net > 0 ? "win" : roundResult.net < 0 ? "loss" : "push"}`}>
          <div className="round-result-amount">
            {roundResult.net > 0 ? `+$${roundResult.net}` : roundResult.net < 0 ? `-$${Math.abs(roundResult.net)}` : "$0"}
          </div>
          <div className="round-result-label">{roundResult.label}</div>
        </div>
      )}
      <style>{`
        body { touch-action: manipulation; }
        @keyframes dealCard {
          from { transform: translateY(-80px) translateX(45px) rotate(18deg); opacity: 0; }
          to   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
        }
        @keyframes blackjackPop {
          0%   { transform: translate(-50%, -50%) scale(0.3) rotate(-12deg); opacity: 0; }
          40%  { transform: translate(-50%, -50%) scale(1.2) rotate(6deg);   opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1)   rotate(0);      opacity: 0; }
        }
        .trilux-win-animation {
          position: fixed; top: 42%; left: 50%;
          transform: translate(-50%, -50%); z-index: 22000;
          background: #3b0055; color: #e0b3ff; border: 4px solid gold;
          border-radius: 20px; padding: 18px 30px;
          font-size: 28px; font-weight: bold; box-shadow: 0 0 25px #c77dff;
          animation: triluxPop 1.3s ease-out;
        }
        .trilux-win-animation span {
          display: block; color: gold; font-size: 34px; margin-top: 5px;
        }
        .noah-whale-animation {
          position: fixed; top: 42%; left: 50%;
          transform: translate(-50%, -50%); z-index: 30000;
          background: #003f91; color: white; border: 5px solid gold;
          border-radius: 24px; padding: 24px 34px;
          font-size: 32px; font-weight: bold; box-shadow: 0 0 35px #00aaff;
          animation: whalePop 1.8s ease-out; text-align: center;
        }
        .lucas-animation {
          position: fixed; top: 42%; left: 50%;
          transform: translate(-50%, -50%); z-index: 30000;
          background: linear-gradient(135deg, #111, #5c0000);
          color: gold; border: 5px solid white; border-radius: 24px;
          padding: 26px 40px; font-size: 58px; font-weight: bold;
          letter-spacing: 3px; box-shadow: 0 0 35px red;
          animation: lucasPop 1.8s ease-out; text-align: center;
        }
        .andy-animation {
          position: fixed; top: 42%; left: 50%;
          transform: translate(-50%, -50%); z-index: 30000;
          background: linear-gradient(135deg, #1a1a00, #5a4500);
          color: #ff4400; border: 5px solid #ff6600; border-radius: 24px;
          padding: 26px 44px; font-size: 48px; font-weight: bold;
          letter-spacing: 2px; box-shadow: 0 0 40px #ff4400;
          animation: andyPop 1.8s ease-out; text-align: center;
        }
        .elise-animation {
          position: fixed; top: 42%; left: 50%;
          transform: translate(-50%, -50%); z-index: 30000;
          background: linear-gradient(135deg, #000b1a, #003366);
          color: #00cfff; border: 5px solid #00cfff; border-radius: 24px;
          padding: 26px 44px; font-size: 44px; font-weight: bold;
          letter-spacing: 2px; box-shadow: 0 0 40px #00cfff;
          animation: elisePop 1.8s ease-out; text-align: center;
        }
        @keyframes elisePop {
          0%   { transform: translate(-50%, -50%) scale(0.2) rotate(-10deg); opacity: 0; }
          30%  { transform: translate(-50%, -50%) scale(1.3)  rotate(6deg);  opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1)    rotate(0deg);  opacity: 0; }
        }
        @keyframes andyPop {
          0%   { transform: translate(-50%, -50%) scale(0.2) rotate(10deg);  opacity: 0; }
          30%  { transform: translate(-50%, -50%) scale(1.3)  rotate(-6deg); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1)    rotate(0deg);  opacity: 0; }
        }
        @keyframes lucasPop {
          0%   { transform: translate(-50%, -50%) scale(0.2) rotate(-12deg); opacity: 0; }
          30%  { transform: translate(-50%, -50%) scale(1.25) rotate(8deg);  opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1)   rotate(0deg);   opacity: 0; }
        }
        @keyframes whalePop {
          0%   { transform: translate(-50%, -50%) scale(0.3) rotate(-8deg); opacity: 0; }
          35%  { transform: translate(-50%, -50%) scale(1.2) rotate(5deg);  opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1)   rotate(0deg);  opacity: 0; }
        }
        @keyframes triluxPop {
          0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
          35%  { transform: translate(-50%, -50%) scale(1.15); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }
        @keyframes resultPop {
          0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
          35%  { transform: translate(-50%, -50%) scale(1.15); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }
        .round-result {
          position: fixed; top: 48%; left: 50%;
          transform: translate(-50%, -50%); z-index: 21000;
          border-radius: 20px; padding: 18px 32px;
          font-weight: bold; box-shadow: 0 0 30px black;
          animation: resultPop 1.4s ease-out;
        }
        .round-result-amount { font-size: 34px; }
        .round-result-label  { font-size: 18px; }
        .round-result.win  { background: gold; color: black; border: 4px solid white; }
        .round-result.loss { background: darkred; color: white; border: 4px solid white; }
        .round-result.push { background: #222; color: white; border: 4px solid gold; }
        .blackjack-celebration {
          position: fixed; top: 35%; left: 50%;
          transform: translate(-50%, -50%); z-index: 20000;
          background: gold; color: black; border: 4px solid white;
          border-radius: 20px; padding: 20px 35px;
          font-size: 36px; font-weight: bold; box-shadow: 0 0 30px gold;
          animation: blackjackPop 1.2s ease-out;
        }
        .bean-bubble {
          position: absolute; top: 20px; left: calc(50% + 62px);
          background: white; color: black; border: 2px solid gold;
          border-radius: 14px; padding: 8px; max-width: 130px;
          font-size: 11px; font-weight: bold; box-shadow: 0 0 8px black;
        }
        .bean-bubble::before {
          content: ""; position: absolute; left: -13px; top: 30px;
          border-width: 8px 13px 8px 0; border-style: solid;
          border-color: transparent white transparent transparent;
        }
        .dealer-img.great-clips-photo { top: 14px !important; width: 120px !important; }
        .bet-spot { border-radius: 50%; display: flex; flex-direction: column;
          justify-content: center; background: rgba(0,0,0,0.22); }
        .bet-spot.active-drop { background: rgba(255,215,0,0.25); box-shadow: 0 0 14px gold; }
        .trilux-spot.active-drop { background: rgba(199,125,255,0.25) !important; box-shadow: 0 0 14px #c77dff !important; }
        .trilux-paytable {
          position: absolute; top: 58px; left: 18px;
          color: #d8b35a; font-size: 10px; font-weight: bold;
          line-height: 1.25; text-align: left; opacity: 0.95;
          text-shadow: 1px 1px 2px black;
          z-index: 2; pointer-events: none; max-width: 135px;
        }
        .pay-title {
          color: gold; font-size: 12px; margin-bottom: 3px; letter-spacing: 0.5px;
        }
        .reset-confirm-overlay {
          position: fixed; inset: 0; z-index: 40000;
          background: rgba(0,0,0,0.75);
          display: flex; align-items: center; justify-content: center;
        }
        .reset-confirm-box {
          background: #1a0000; border: 4px solid gold;
          border-radius: 20px; padding: 32px 36px;
          text-align: center; box-shadow: 0 0 30px rgba(255,200,0,0.5);
          max-width: 320px; width: 90%;
        }
        .reset-confirm-box h2 {
          color: gold; font-size: 26px; margin: 0 0 14px;
        }
        .reset-confirm-buttons {
          display: flex; gap: 16px; justify-content: center; margin-top: 22px;
        }
        .reset-confirm-yes {
          background: #005d18; color: white; border: 2px solid #00ff55;
          border-radius: 10px; padding: 12px 28px; font-size: 17px;
          font-weight: bold; cursor: pointer;
        }
        .reset-confirm-no {
          background: #7a0000; color: white; border: 2px solid #ff4444;
          border-radius: 10px; padding: 12px 28px; font-size: 17px;
          font-weight: bold; cursor: pointer;
        }
        .actions {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 8px; max-width: 360px; margin: 10px auto; align-items: stretch;
        }
        .actions-left {
          display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;
        }
        .actions-right { display: flex; flex-direction: column; gap: 8px; }
        .actions button {
          background: black; color: white; border: 2px solid gold;
          min-width: 90px; min-height: 54px; font-size: 15px; font-weight: bold;
          border-radius: 9px; cursor: pointer;
        }
        #hitBtn { background: #005d18; }
        #standBtn { background: #7a0000; }
        #adviceBtn { background: purple; }
        @media (max-width: 430px) {
          .trilux-paytable { top: 62px !important; left: 12px !important; font-size: 9px !important; max-width: 120px !important; }
          .pay-title { font-size: 11px !important; }
        }
        @media (max-width: 430px) {
          .table-wrap { margin: 5px !important; border-radius: 34px !important; }
          .bank-box { width: 270px !important; font-size: 13px !important; }
          .dealer-zone-wrap { height: 140px !important; }
          .dealer-person-wrap { width: 130px !important; height: 140px !important; }
          .dealer-img { width: 112px !important; }
          .bean-bubble { left: calc(50% + 52px) !important; max-width: 115px !important; font-size: 11px !important; }
          .chip-btn { width: 50px !important; height: 50px !important; font-size: 12px !important; }
          .bet-pot-wrapper { width: 250px !important; height: 112px !important; margin-top: 2px !important; }
          .main-bet-spot { left: 43% !important; }
          .trilux-bet-spot { right: 0 !important; }
        }
      `}</style>

      <div style={{ margin: 0, minHeight: "100vh", paddingBottom: 20,
        background: "linear-gradient(#160000,#3b0000,#111)",
        color: "white", fontFamily: "Arial", textAlign: "center" }}>

        {!currentUser ? (
          /* ── Login screen ── */
          <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
            <button onClick={() => { window.location.href = "/craps/lobby"; }} style={{
              position: "fixed", top: 8, left: 8, zIndex: 9999,
              background: "rgba(0,0,0,0.6)", color: "gold", border: "2px solid gold",
              borderRadius: 9, padding: "8px 12px", fontSize: 13,
              fontWeight: "bold", cursor: "pointer",
            }}>← Lobby</button>
            <div style={{ background: "rgba(0,0,0,0.8)", border: "3px solid gold", borderRadius: 18,
              padding: 24, width: 300, boxShadow: "0 0 20px gold" }}>
              <h1 style={{ color: "gold", textShadow: "2px 2px 6px black", fontSize: 24, margin: "8px 0" }}>♠ Blackjack Casino ♥</h1>
              <p style={{ margin: "8px 0" }}>Enter your player name to save your balance.</p>
              <input
                value={loginInput}
                onChange={e => setLoginInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loginPlayer()}
                placeholder="Player name"
                style={{ width: "90%", padding: 12, borderRadius: 10, border: "2px solid gold",
                  fontSize: 16, margin: 10, textAlign: "center", boxSizing: "border-box",
                  background: "#111", color: "white" }}
              />
              <button onClick={loginPlayer} style={{
                background: "gold", color: "black", border: "none", borderRadius: 9,
                padding: "10px 24px", fontSize: 16, fontWeight: "bold", cursor: "pointer",
              }}>Enter Casino</button>
            </div>
          </div>
        ) : (
          /* ── Game screen ── */
          <>
        {/* Lobby button */}
        <button onClick={() => { window.location.href = "/craps/lobby"; }} style={{
          position: "fixed", top: 8, left: 8, zIndex: 9999,
          background: "rgba(0,0,0,0.6)", color: "gold", border: "2px solid gold",
          borderRadius: 9, padding: "8px 12px", fontSize: 13,
          fontWeight: "bold", cursor: "pointer",
        }}>← Lobby</button>

        {/* Win % button */}
        <button onClick={showStats} style={{
          position: "fixed", top: 8, right: 8, zIndex: 9999,
          background: "gold", color: "black", border: "2px solid white",
          borderRadius: 9, padding: "8px 10px", fontSize: 13,
          fontWeight: "bold", cursor: "pointer",
        }}>Win %</button>

        <h1 style={{ color: "gold", textShadow: "2px 2px 6px black", fontSize: 24, margin: "8px 0" }}>
          ♠ Blackjack Casino ♥
        </h1>

        {/* Player bar */}
        <div style={{ fontSize: 13, fontWeight: "bold", margin: "4px auto" }}>
          Player: <span>{currentUser}</span>
          <button onClick={logoutPlayer} style={{
            padding: "4px 8px", fontSize: 11, borderRadius: 9, marginLeft: 8,
            background: "darkred", color: "white", border: "2px solid white",
            fontWeight: "bold", cursor: "pointer",
          }}>Logout</button>
        </div>

        {/* Bank box */}
        <div className="bank-box" style={{ background: "rgba(0,0,0,0.7)", border: "2px solid gold", borderRadius: 12,
          padding: 6, width: 300, margin: "5px auto", boxShadow: "0 0 10px gold",
          fontWeight: "bold", fontSize: 14 }}>
          <div>Bankroll: ${bankroll}</div>
          <div>Main: ${selectedBet} | TriLux: ${selectedTriLuxBet}</div>
          <div>Hand Bet: ${currentBet}</div>
        </div>

        {/* Table */}
        <div className="table-wrap" style={{ background: "radial-gradient(circle,#0b8f36,#034818)",
          border: "7px solid #4b2505", borderRadius: 45,
          padding: 8, margin: "8px auto", maxWidth: 680,
          boxShadow: "0 0 20px black", position: "relative" }}>

          {/* Dealer zone */}
          <div className="dealer-zone-wrap" style={{ position: "relative", width: "100%", height: 145, marginBottom: 2 }}>
            <div className="dealer-person-wrap" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)",
              height: 145, width: 130, overflow: "hidden" }}>
              <img className={`dealer-img${dealerName === "Great Clips" ? " great-clips-photo" : ""}`} src={dealerImg} alt={dealerName} style={{
                width: 115, position: "absolute", left: "50%", top: -2, transform: "translateX(-50%)" }} />
              <div style={{ position: "absolute", left: "50%", bottom: 2, transform: "translateX(-50%)",
                background: "black", color: "gold", border: "2px solid gold",
                borderRadius: 14, padding: "3px 10px", fontWeight: "bold", fontSize: 12, whiteSpace: "nowrap" }}>{dealerName}</div>
            </div>
            {beanBubble && <div className="bean-bubble">{beanBubble}</div>}
          </div>

          {/* TriLux paytable — absolute positioned over table */}
          <div className="trilux-paytable">
            <div className="pay-title">TRILUX PAYS</div>
            <div>Straight Flush 40:1</div>
            <div>3 of a Kind 30:1</div>
            <div>Straight 10:1</div>
            <div>Flush 5:1</div>
            <div>Pair 1:1</div>
          </div>

          {/* Dealer cards */}
          <h2 style={{ margin: "4px 0", fontSize: 18 }}>{dealerName}</h2>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap", minHeight: 62 }}>
            {dealerHand.map((card, i) => (
              <CardEl key={i} card={card} hidden={dealerHidden && gameActive && i === 1} />
            ))}
          </div>
          <p style={{ margin: "4px 0" }}>
            {dealerHand.length === 0 ? "Score: ?" : dealerRevealed ? `Score: ${handScore(dealerHand)}` : "Score: ?"}
          </p>

          {/* Felt rules */}
          <div style={{ margin: "5px auto", color: "gold", fontWeight: "bold",
            letterSpacing: 0.5, fontSize: 10, maxWidth: 500, opacity: 0.9 }}>
            BLACKJACK PAYS 3 TO 2 · DEALER HITS SOFT 17
          </div>

          {/* Player hands */}
          <h2 style={{ margin: "4px 0", fontSize: 18 }}>Player</h2>
          {playerHands.map((hand, idx) => {
            const isActive = idx === activeHand && gameActive && !resolvingRound && !waitingForInsurance && !dealingCards;
            return (
              <div key={idx} style={{
                border: `2px solid ${isActive ? "gold" : "white"}`, borderRadius: 12,
                padding: 6, margin: "6px auto", width: 290,
                background: isActive ? "rgba(255,215,0,0.18)" : "rgba(0,0,0,0.25)",
                boxShadow: isActive ? "0 0 10px gold" : "none",
              }}>
                <h3 style={{ margin: "2px 0 5px", fontSize: 14 }}>Hand {idx + 1} | Bet: ${handBets[idx]}</h3>
                <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap", minHeight: 62 }}>
                  {hand.map((card, ci) => <CardEl key={ci} card={card} />)}
                </div>
                <p style={{ margin: "4px 0" }}>Score: {handScore(hand)}</p>
              </div>
            );
          })}

          {/* Betting area + chips */}
          {showDeal && (
            <>
              {/* Bet spots */}
              <div className="bet-pot-wrapper" style={{ position: "relative", width: 260, height: 115, margin: "6px auto" }}>
                {showClear && (
                  <button onClick={clearBets} style={{
                    position: "absolute", left: -45, top: 45,
                    background: "#555", color: "white", border: "2px solid white",
                    borderRadius: 9, padding: "5px 8px", fontSize: 11, fontWeight: "bold",
                    cursor: "pointer", zIndex: 5,
                  }}>Clear</button>
                )}
                <div ref={betSpotRef} className="bet-spot main-bet-spot" style={{
                  width: 155, height: 88, border: "3px dashed gold",
                  boxShadow: "inset 0 0 12px rgba(255,215,0,0.35)",
                  position: "absolute", left: "45%", top: 24, transform: "translateX(-50%)",
                }}>
                  <div style={{ fontSize: 12, color: "gold", fontWeight: "bold" }}>MAIN</div>
                  <strong style={{ fontSize: 22, color: "gold" }}>${selectedBet}</strong>
                </div>
                <div ref={triluxSpotRef} className="bet-spot trilux-spot trilux-bet-spot" style={{
                  width: 78, height: 55, border: "3px dashed #c77dff",
                  boxShadow: "inset 0 0 12px rgba(199,125,255,0.45)",
                  position: "absolute", right: 4, top: 0, fontSize: 10,
                }}>
                  <div style={{ color: "#c77dff", fontWeight: "bold" }}>TRILUX</div>
                  <strong style={{ fontSize: 16, color: "#e0b3ff" }}>${selectedTriLuxBet}</strong>
                </div>
              </div>

              {/* Chip buttons */}
              <div style={{ marginTop: 4 }}>
                {([10, 25, 50, 100, 250] as const).map(amt => (
                  <button key={amt} className="chip-btn"
                    onClick={() => addChipToBet(amt, "main")}
                    onPointerDown={e => startChipDrag(e, amt)}
                    style={{
                      borderRadius: "50%", width: 55, height: 55, margin: 3, padding: 0,
                      background: chipColors[amt], color: "white",
                      border: "5px dashed white", boxShadow: "0 3px 6px black",
                      fontSize: 13, fontWeight: "bold", cursor: "grab",
                      touchAction: "none", userSelect: "none",
                    }}>${amt}</button>
                ))}
              </div>
              <button onClick={deal} style={{
                background: "gold", color: "black", fontSize: 18,
                padding: "10px 35px", borderRadius: 9, border: "none",
                fontWeight: "bold", cursor: "pointer", margin: "8px 3px",
              }}>Deal</button>
            </>
          )}

          {/* Insurance */}
          {waitingForInsurance && (
            <div style={{ margin: "8px 0" }}>
              <button onClick={takeInsurance} style={{ ...btn, background: "goldenrod", color: "black", border: "2px solid gold" }}>Insurance</button>
              <button onClick={declineInsurance} style={{ ...btn, background: "darkred", color: "white", border: "2px solid white" }}>No Insurance</button>
            </div>
          )}

          {/* Action buttons */}
          {showActions && (
            <div className="actions">
              <div className="actions-left">
                {showDouble && <button onClick={doubleDown}>Double</button>}
                {showSplit && <button onClick={splitHand}>Split</button>}
                <button id="adviceBtn" onClick={giveAdvice}>Book</button>
              </div>
              <div className="actions-right">
                <button id="hitBtn" onClick={hit}>Hit</button>
                <button id="standBtn" onClick={stand}>Stand</button>
              </div>
            </div>
          )}
        </div>

        {/* Message */}
        <h2 style={{ background: "rgba(0,0,0,0.75)", padding: 9, borderRadius: 12,
          maxWidth: 650, margin: "8px auto", fontSize: 15 }}>
          {message}
        </h2>

        {/* Reset — only visible when bankroll is under $500 */}
        {state.bankroll < 500 && (
        <button onClick={resetMoney} style={{
          background: "darkred", color: "white", border: "2px solid white",
          borderRadius: 9, padding: "9px 16px", fontSize: 14,
          fontWeight: "bold", cursor: "pointer", marginBottom: 18,
        }}>Reset Money</button>
        )}
        </>
        )}
      </div>
    </>
  );
}

const btn: React.CSSProperties = {
  background: "black", color: "white", border: "2px solid gold",
  borderRadius: 9, padding: "9px 12px", margin: 3,
  fontSize: 14, fontWeight: "bold", cursor: "pointer",
};
