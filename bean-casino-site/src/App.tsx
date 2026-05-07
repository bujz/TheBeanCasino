import Blackjack from "./Blackjack";
import Craps from "./Craps";
import Slots from "./Slots";

export default function App() {
  const path = window.location.pathname;

  if (path.startsWith("/blackjack")) return <Blackjack />;
  if (path.startsWith("/slots")) return <Slots />;
  // Default to lobby/craps app. The Craps component handles /craps and /craps/lobby.
  return <Craps />;
}
