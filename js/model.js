// ============================================================
//  MODEL — Game state, deck management, round system
// ============================================================

const Model = (() => {
  const SUITS = ['♠','♥','♦','♣'];
  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const RANK_VALUES = { A:11, J:10, Q:10, K:10 };

  const HANDS_PER_ROUND   = 4;
  const DISCARDS_PER_ROUND = 4;
  const BASE_TARGET = 3000;

  function roundTarget(r) { return Math.floor(BASE_TARGET * Math.pow(1.8, r-1)); }

  function createDeck() {
    const d = [];
    for (const suit of SUITS)
      for (const rank of RANKS) {
        const value = RANK_VALUES[rank] || parseInt(rank);
        const card = { suit, rank, value, faceUp: true, effect: null, style: null };
        Cards.assignCardExtras(card);
        d.push(card);
      }
    return d;
  }

  function shuffle(deck) {
    for (let i = deck.length-1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  // ── Initial state ────────────────────────────────────────────────────
  const state = {
    deck: [],
    playerHand: [],
    dealerHand: [],
    balance: 1000,
    bet: 0,
    phase: 'betting',   // betting | playing | result
    // Round system
    round: 1,
    roundScore: 0,
    roundTarget: BASE_TARGET,
    handsLeft: HANDS_PER_ROUND,
    discardsLeft: DISCARDS_PER_ROUND,
    // Stats
    stats: { games: 0, wins: 0, streak: 0 },
    // Discard mode flag (managed by Controller)
    discardMode: false,
  };

  // ── Deck ─────────────────────────────────────────────────────────────
  function refillDeck() { state.deck = shuffle(createDeck()); }
  function drawCard()   {
    if (state.deck.length < 10) refillDeck();
    return { ...state.deck.pop() };
  }

  // ── Hand helpers (delegate to Cards module) ──────────────────────────
  const handValue    = hand => Cards.handValue(hand);
  const bustThresh   = hand => Cards.bustThreshold(hand);
  const isBlackjack  = hand => Cards.isBlackjack(hand);
  const isBust       = hand => Cards.isBust(hand);

  // ── New hand ─────────────────────────────────────────────────────────
  function newHand() {
    state.playerHand = [];
    state.dealerHand = [];
    state.phase = 'playing';
    state.discardMode = false;
    state.handsLeft--;

    const p1 = { ...drawCard(), faceUp: true  };
    const d1 = { ...drawCard(), faceUp: false }; // hidden
    const p2 = { ...drawCard(), faceUp: true  };
    const d2 = { ...drawCard(), faceUp: true  };

    state.playerHand.push(p1, p2);
    state.dealerHand.push(d1, d2);
  }

  // ── Player actions ────────────────────────────────────────────────────
  function hit() {
    if (state.phase !== 'playing') return;
    state.playerHand.push({ ...drawCard(), faceUp: true });
  }

  function doubleDown() {
    if (state.playerHand.length !== 2 || state.balance < state.bet) return false;
    state.balance -= state.bet;
    state.bet *= 2;
    state.playerHand.push({ ...drawCard(), faceUp: true });
    return true;
  }

  function discardCard(index) {
    if (index < 0 || index >= state.playerHand.length) return false;
    const card = state.playerHand[index];
    // multi effect: free discard
    const free = card.effect === 'multi';
    if (!free && state.discardsLeft <= 0) return false;
    if (!free) state.discardsLeft--;
    state.playerHand.splice(index, 1);
    state.discardMode = false;
    state.phase = 'playing';
    return true;
  }

  // ── Dealer play ───────────────────────────────────────────────────────
  function dealerPlay() {
    state.dealerHand[0].faceUp = true;
    const threshold = Cards.dealerThreshold(state.playerHand, state.dealerHand);
    while (Cards.handValue(state.dealerHand) < threshold)
      state.dealerHand.push({ ...drawCard(), faceUp: true });
    state.phase = 'result';
  }

  // ── Result ────────────────────────────────────────────────────────────
  function getResult() {
    const pScore = handValue(state.playerHand);
    const dScore = handValue(state.dealerHand);
    const mult   = Cards.computeMultiplier(state.playerHand);
    const goldBonus = Cards.computeGoldBonus(state.playerHand, state.dealerHand, state.bet);

    let result, payout;

    if (isBust(state.playerHand)) {
      result = 'lose'; payout = 0;
    } else if (isBlackjack(state.playerHand) && isBlackjack(state.dealerHand)) {
      result = 'push'; payout = state.bet;
    } else if (isBlackjack(state.playerHand)) {
      result = 'blackjack';
      payout = state.bet + Math.floor(state.bet * 1.5 * mult) + goldBonus;
    } else if (isBust(state.dealerHand) || pScore > dScore) {
      result = 'win';
      payout = Math.floor(state.bet * 2 * mult) + goldBonus;
    } else if (pScore === dScore) {
      result = 'push'; payout = state.bet + goldBonus;
    } else {
      result = 'lose'; payout = 0;
    }

    return { result, payout, mult, goldBonus, pScore, dScore };
  }

  function applyResult(payout, result) {
    state.balance += payout;
    state.stats.games++;
    if (result === 'win' || result === 'blackjack') {
      state.roundScore += payout;
      state.stats.wins++;
      state.stats.streak++;
    } else if (result === 'push') {
      state.stats.streak = 0;
    } else {
      state.stats.streak = 0;
    }
    state.bet = 0;
    state.phase = 'betting';
  }

  // ── Bet ───────────────────────────────────────────────────────────────
  function addBet(amount) {
    if (state.phase !== 'betting') return false;
    if (state.balance < amount) return false;
    state.bet += amount;
    state.balance -= amount;
    return true;
  }

  function clearBet() {
    if (state.phase !== 'betting') return;
    state.balance += state.bet;
    state.bet = 0;
  }

  // ── Round system ──────────────────────────────────────────────────────
  function canPayRound() {
    const cost = Math.max(0, state.roundTarget - state.roundScore);
    return state.balance >= cost;
  }

  function payRound() {
    const cost = Math.max(0, state.roundTarget - state.roundScore);
    if (state.balance < cost) return false;
    state.balance -= cost;
    return true;
  }

  function isRoundWon() { return state.roundScore >= state.roundTarget; }

  function isGameOver() {
    return state.handsLeft <= 0 && !isRoundWon() && !canPayRound();
  }

  function startNextRound() {
    state.round++;
    state.roundTarget = roundTarget(state.round);
    state.roundScore  = 0;
    state.handsLeft   = HANDS_PER_ROUND;
    state.discardsLeft = DISCARDS_PER_ROUND;
    state.bet  = 0;
    state.phase = 'betting';
    refillDeck();
  }

  function restart() {
    state.balance    = 1000;
    state.bet        = 0;
    state.phase      = 'betting';
    state.round      = 1;
    state.roundScore = 0;
    state.roundTarget = BASE_TARGET;
    state.handsLeft  = HANDS_PER_ROUND;
    state.discardsLeft = DISCARDS_PER_ROUND;
    state.stats      = { games:0, wins:0, streak:0 };
    state.playerHand = [];
    state.dealerHand = [];
    refillDeck();
  }

  // Initialize deck
  refillDeck();

  return {
    get: () => state,
    HANDS_PER_ROUND, DISCARDS_PER_ROUND,
    newHand, hit, doubleDown, discardCard, dealerPlay,
    getResult, applyResult,
    addBet, clearBet,
    canPayRound, payRound, isRoundWon, isGameOver,
    startNextRound, restart,
    // Re-expose from Cards for convenience
    handValue, bustThreshold: bustThresh, isBlackjack, isBust,
    isFiveCardCharlie: hand => Cards.isFiveCardCharlie(hand),
    getHandName: hand => Cards.getHandName(hand),
    dealerThreshold: () => Cards.dealerThreshold(state.playerHand, state.dealerHand),
    getGlassReveal: () => Cards.getGlassReveal(state.playerHand, state.dealerHand),
  };
})();
