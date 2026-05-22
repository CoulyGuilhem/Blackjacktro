// ============================================================
//  CONTROLLER — Game flow, action orchestration
// ============================================================

const Controller = (() => {
  let animating = false;
  let discardModeActive = false;

  // ── ANIMATION LOCK ───────────────────────────────────────────────────
  function setAnimating(val) {
    animating = val;
    const btn = document.getElementById('btn-deal');
    if (btn) btn.disabled = val || Model.get().bet === 0 || Model.get().handsLeft <= 0;
  }

  // ── DEAL ─────────────────────────────────────────────────────────────
  function deal() {
    const s = Model.get();
    if (animating || s.phase !== 'betting' || s.bet === 0 || s.handsLeft <= 0) return;

    setAnimating(true);
    Model.newHand();
    const state = Model.get();

    // Glass effect: check for reveal before dealing
    const glassCard = Model.getGlassReveal();

    // Interleave deal: p1 → d1(hidden, maybe glass) → p2 → d2
    const sequence = [
      { card: state.playerHand[0], idx: 0, total: 2, dealer: false, t: 0   },
      { card: state.dealerHand[0], idx: 0, total: 2, dealer: true,  t: 220, glass: !!glassCard },
      { card: state.playerHand[1], idx: 1, total: 2, dealer: false, t: 440 },
      { card: state.dealerHand[1], idx: 1, total: 2, dealer: true,  t: 660 },
    ];

    sequence.forEach(({ card, idx, total, dealer, t, glass }) => {
      setTimeout(() => {
        Renderer.dealCard(card, idx, total, dealer, glass || false);
        Renderer.repositionCards();
        View.updateAll();
      }, t);
    });

    // After all 4 cards settled
    setTimeout(() => {
      // Show glass reveal notification
      if (glassCard) View.showGlassReveal(glassCard);

      View.updateAll();
      if (Model.isBlackjack(state.playerHand)) {
        setTimeout(() => { setAnimating(false); _runDealer(); }, 700);
      } else {
        setAnimating(false);
      }
    }, 1160);
  }

  // ── HIT ──────────────────────────────────────────────────────────────
  function hit() {
    const s = Model.get();
    if (animating || s.phase !== 'playing') return;
    setAnimating(true);

    Model.hit();
    const state = Model.get();
    const i = state.playerHand.length - 1;
    const newCard = state.playerHand[i];

    // Multi effect: auto-offer free discard
    if (newCard.effect === 'multi') {
      View.floatText('❋ MULTI — DÉFAUSSE GRATUITE !', '#c39bd3', '50%', '42%');
    }

    Renderer.dealCard(newCard, i, state.playerHand.length, false);
    Renderer.repositionCards();

    setTimeout(() => {
      setAnimating(false);
      View.updateAll();
      _checkBust();
    }, 400);
  }

  // ── STAND ────────────────────────────────────────────────────────────
  function stand() {
    const s = Model.get();
    if (animating || s.phase !== 'playing') return;
    _runDealer();
  }

  // ── DEALER SEQUENCE ──────────────────────────────────────────────────
  function _runDealer() {
    setAnimating(true);
    const state = Model.get();
    // Reveal hidden dealer card
    Renderer.revealDealerCard(0, state.dealerHand[0]);

    setTimeout(() => {
      Model.dealerPlay();
      const after = Model.get();
      const extraCards = after.dealerHand.slice(2);

      extraCards.forEach((card, idx) => {
        setTimeout(() => {
          Renderer.dealCard(card, idx+2, after.dealerHand.length, true);
          Renderer.repositionCards();
          View.updateAll();
        }, idx * 400);
      });

      setTimeout(() => _resolveRound(), extraCards.length * 400 + 600);
    }, 700);
  }

  // ── DOUBLE DOWN ──────────────────────────────────────────────────────
  function doubleDown() {
    const s = Model.get();
    if (animating || s.phase !== 'playing') return;
    setAnimating(true);

    const ok = Model.doubleDown();
    if (!ok) { setAnimating(false); return; }

    const state = Model.get();
    const i = state.playerHand.length - 1;
    Renderer.dealCard(state.playerHand[i], i, state.playerHand.length, false);
    Renderer.repositionCards();
    View.updateAll();

    setTimeout(() => {
      if (Model.isBust(state.playerHand)) {
        // Bust on double: no discard option per casino rules
        state.phase = 'result';
        _resolveRound();
      } else {
        setAnimating(false);
        setTimeout(() => _runDealer(), 100);
      }
    }, 600);
  }

  // ── DISCARD ──────────────────────────────────────────────────────────
  function activateDiscard() {
    const s = Model.get();
    if (s.discardsLeft <= 0 && !s.playerHand.some(c => c.effect === 'multi')) return;
    if (s.phase !== 'playing') return;

    discardModeActive = true;
    View.setDiscardMode(true);
    View.updateAll();

    document.getElementById('three-canvas').style.cursor = 'crosshair';
    s.playerHand.forEach((_, i) => Renderer.highlightCard(i, true));
    document.getElementById('three-canvas').addEventListener('click', _onCardClick);
  }

  function _onCardClick(e) {
    if (!discardModeActive) return;
    const s = Model.get();
    const rect = e.target.getBoundingClientRect();
    const clickX = (e.clientX - rect.width/2) / (rect.width/2);

    let closestIdx = -1, closestDist = 0.35;
    s.playerHand.forEach((_, i) => {
      const total = s.playerHand.length;
      const spacing = Math.min(1.6, 8/Math.max(total,1));
      const cardWorldX = -(total-1)*spacing/2 + i*spacing;
      const screenX = cardWorldX / 8;
      const dist = Math.abs(clickX - screenX);
      if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    });

    if (closestIdx >= 0) _performDiscard(closestIdx);
  }

  function _cancelDiscardMode() {
    discardModeActive = false;
    View.setDiscardMode(false);
    document.getElementById('three-canvas').style.cursor = 'default';
    document.getElementById('three-canvas').removeEventListener('click', _onCardClick);
    const s = Model.get();
    s.playerHand.forEach((_, i) => Renderer.highlightCard(i, false));
  }

  function _performDiscard(index) {
    _cancelDiscardMode();
    const card = Model.get().playerHand[index];
    const wasFree = card.effect === 'multi';
    const ok = Model.discardCard(index);
    if (!ok) return;

    if (wasFree) View.floatText('❋ DÉFAUSSE GRATUITE', '#c39bd3', '50%', '42%');

    Renderer.removePlayerCard(index);
    setTimeout(() => {
      Renderer.repositionCards();
      View.updateAll();
      document.getElementById('bust-choice').classList.add('hidden');
      if (Model.isBust(Model.get().playerHand)) {
        if (Model.get().discardsLeft > 0 || Model.get().playerHand.some(c => c.effect === 'multi'))
          View.showBustChoice();
        else _resolveBust();
      } else {
        document.getElementById('play-buttons').classList.remove('hidden');
      }
    }, 760);
  }

  // ── BUST HANDLING ────────────────────────────────────────────────────
  function _checkBust() {
    const s = Model.get();
    if (!Model.isBust(s.playerHand)) return;
    const hasDiscards = s.discardsLeft > 0 || s.playerHand.some(c => c.effect === 'multi');
    if (hasDiscards) View.showBustChoice();
    else _resolveBust();
  }

  function confirmBust() {
    document.getElementById('bust-choice').classList.add('hidden');
    _resolveBust();
  }

  function _resolveBust() {
    const s = Model.get();
    s.phase = 'result';
    _resolveRound();
  }

  // ── RESOLVE ROUND ────────────────────────────────────────────────────
  function _resolveRound() {
    const { result, payout, mult, goldBonus, pScore, dScore } = Model.getResult();
    const bet = Model.get().bet;
    Model.applyResult(payout, result);

    const MSGS = {
      blackjack: ['BLACKJACK !', 'blackjack'],
      win:       ['VICTOIRE',   'win'],
      lose:      ['DÉFAITE',    'lose'],
      push:      ['ÉGALITÉ',    'push'],
    };
    const [msg, type] = MSGS[result];
    let sub = result === 'push' ? 'Mise remboursée'
            : result === 'lose' ? `-$${bet}`
            : `+$${payout}`;
    if (goldBonus > 0) sub += `  (dont +$${goldBonus} or)`;
    View.showMessage(msg, type, sub);
    View.floatText(
      (result === 'lose' ? '-' : '+') + '$' + (result === 'lose' ? bet : payout),
      result === 'lose' ? '#e74c3c' : '#f0d078',
      '50%', '48%'
    );

    if (result === 'blackjack' || result === 'win') {
      Renderer.winBurst(result === 'blackjack' ? 0xffd700 : 0xc9a84c);
    }

    // Multiplier badge
    if (mult > 1) setTimeout(() => View.floatText(`×${mult}`, '#f0d078', '56%', '40%'), 400);
    if (goldBonus > 0) setTimeout(() => View.floatText(`◉ +$${goldBonus}`, '#f0d078', '44%', '38%'), 600);

    // Detailed style notice
    const detailed = Model.get().playerHand ? 0 : 0; // already applied in model
    const thresh = Model.dealerThreshold();
    if (thresh < 17) View.floatText(`◎ Croupier ≤ ${thresh}`, '#2980b9', '50%', '35%');

    setTimeout(() => {
      Renderer.clearCards(() => {
        setAnimating(false);
        View.updateAll();
        _checkRoundState();
      });
    }, 2600);
  }

  // ── ROUND STATE ──────────────────────────────────────────────────────
  function _checkRoundState() {
    if (Model.isRoundWon())  { setTimeout(() => View.showRoundWin(), 300); return; }
    if (Model.isGameOver()) { setTimeout(() => View.showGameOver(), 300); }
  }

  function payRound() {
    if (!Model.canPayRound()) return;
    if (Model.payRound()) View.showRoundWin();
  }

  function nextRound() {
    View.hideOverlays();
    Model.startNextRound();
    View.updateAll();
    Renderer.winBurst(0xffd700, 80);
  }

  function restart() {
    View.hideOverlays();
    animating = false;
    discardModeActive = false;
    Model.restart();
    Renderer.clearCards(() => View.updateAll());
  }

  return { deal, hit, stand, doubleDown, activateDiscard, confirmBust, payRound, nextRound, restart };
})();
