// ============================================================
//  VIEW — DOM rendering, UI updates
// ============================================================

const View = (() => {

  // ── MAIN UPDATE ──────────────────────────────────────────────────────
  function updateAll() {
    const s = Model.get();
    const pScore  = Model.handValue(s.playerHand);
    const dScore  = Model.handValue(s.dealerHand.filter(c => c.faceUp));
    const thresh  = Model.bustThreshold(s.playerHand);
    const isBetting = s.phase === 'betting';
    const isPlaying = s.phase === 'playing';

    // Balance & bet
    _el('balance-display').textContent = '$' + s.balance;
    _el('bet-display').textContent = '$' + s.bet;
    _el('current-bet-display').textContent = s.bet;
    _el('deck-count').textContent = s.deck.length;

    // Round progress
    _el('round-num').textContent = s.round;
    _el('target-score').textContent = '$' + s.roundTarget.toLocaleString();
    const pct = Math.min(100, (s.roundScore / s.roundTarget) * 100);
    _el('score-progress-bar').style.width = pct + '%';
    _el('score-progress-text').textContent = '$' + s.roundScore.toLocaleString() + ' / $' + s.roundTarget.toLocaleString();

    // Hand pips
    const pipsEl = _el('hands-pips');
    pipsEl.innerHTML = '';
    for (let i = 0; i < Model.HANDS_PER_ROUND; i++) {
      const pip = document.createElement('div');
      pip.className = 'hand-pip';
      const used = Model.HANDS_PER_ROUND - s.handsLeft;
      const activeIdx = used - (isPlaying ? 1 : 0);
      if (i < activeIdx) pip.classList.add('used');
      else if (i === activeIdx && isPlaying) pip.classList.add('active');
      pipsEl.appendChild(pip);
    }

    // Discard pips
    const dpipsEl = _el('discard-pips');
    dpipsEl.innerHTML = '';
    for (let i = 0; i < Model.DISCARDS_PER_ROUND; i++) {
      const pip = document.createElement('div');
      pip.className = 'disc-pip';
      if (i >= s.discardsLeft) pip.classList.add('used');
      dpipsEl.appendChild(pip);
    }

    // Player score
    const scoreEl = _el('player-score');
    const nameEl  = _el('hand-name');
    if (s.playerHand.length > 0) {
      scoreEl.textContent = pScore;
      scoreEl.className = 'hand-score' + (pScore > thresh ? ' danger' : '');
      nameEl.textContent = Model.getHandName(s.playerHand);
    } else {
      scoreEl.textContent = ''; nameEl.textContent = '';
    }

    // Dealer score
    _el('dealer-score').textContent = s.dealerHand.length > 0 ? dScore : '';

    // Dealer threshold indicator
    const dealThresh = Model.dealerThreshold();
    _el('dealer-threshold').textContent = dealThresh !== 17 ? `Croupier joue jusqu'à ${dealThresh}` : '';

    // Stats
    _el('stat-games').textContent = s.stats.games;
    _el('stat-wins').textContent = s.stats.wins;
    const wr = s.stats.games > 0 ? Math.round(s.stats.wins/s.stats.games*100) : 0;
    _el('stat-winrate').textContent = wr + '%';
    _el('stat-streak').textContent = s.stats.streak;

    // Multiplier chips
    _el('mult-blackjack').classList.toggle('active', Model.isBlackjack(s.playerHand));
    _el('mult-21').classList.toggle('active', pScore === Cards.blackjackScore(s.playerHand) && !Model.isBlackjack(s.playerHand));
    _el('mult-5cards').classList.toggle('active', Model.isFiveCardCharlie(s.playerHand));

    // Effects bar
    _updateEffectsBar(s);

    // Buttons
    _el('deal-row').classList.toggle('hidden', !isBetting);
    _el('play-buttons').classList.toggle('hidden', !isPlaying);
    _el('bust-choice').classList.add('hidden');

    if (isBetting) {
      _el('btn-deal').disabled = s.bet === 0 || s.handsLeft <= 0;
    }
    if (isPlaying) {
      _el('btn-double').disabled = s.playerHand.length !== 2 || s.balance < s.bet;
      _el('btn-discard').disabled = s.discardsLeft <= 0;
    }

    // Pay round button
    const canPay = isBetting && Model.canPayRound() && !Model.isRoundWon() && s.handsLeft >= 0;
    _el('btn-pay').style.display = canPay ? 'inline-block' : 'none';
  }

  function _updateEffectsBar(s) {
    const activeEffects = new Set();
    [...s.playerHand, ...s.dealerHand.filter(c => c.faceUp)].forEach(c => {
      if (c.effect) activeEffects.add(c.effect);
    });
    ['glass','shiny','negative','gold','multi'].forEach(fx => {
      const badge = _el('badge-' + fx);
      if (badge) badge.classList.toggle('visible', activeEffects.has(fx));
    });

    // Shiny multiplier count
    const shinyCount = s.playerHand.filter(c => c.effect === 'shiny').length;
    const shinyBadge = _el('badge-shiny');
    if (shinyBadge && shinyCount > 1) shinyBadge.textContent = `✦ BRILLANT ×${shinyCount}`;
    else if (shinyBadge) shinyBadge.textContent = '✦ BRILLANT';

    // Gold card count
    const goldCount = [...s.playerHand, ...s.dealerHand.filter(c=>c.faceUp)].filter(c => c.effect === 'gold').length;
    const goldBadge = _el('badge-gold');
    if (goldBadge && goldCount > 1) goldBadge.textContent = `◉ OR ×${goldCount}`;
    else if (goldBadge) goldBadge.textContent = '◉ OR';
  }

  // ── BET HELPERS ──────────────────────────────────────────────────────
  function addBet(amount) {
    if (!Model.addBet(amount)) { flashBorder('#e74c3c'); return; }
    updateAll();
    floatText('+$' + amount, '#c9a84c', '50%', '55%');
  }

  function clearBet() { Model.clearBet(); updateAll(); }

  // ── MESSAGES ────────────────────────────────────────────────────────
  function showMessage(text, type, sub = '') {
    const el = _el('message-overlay');
    _el('message-text').textContent = text;
    _el('message-text').className = 'message-text ' + type;
    _el('message-sub').textContent = sub;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
  }

  function floatText(text, color, left, top) {
    const el = document.createElement('div');
    el.className = 'win-amount';
    el.style.cssText = `left:${left};top:${top};color:${color};`;
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  function showBustChoice() {
    _el('play-buttons').classList.add('hidden');
    _el('bust-choice').classList.remove('hidden');
  }

  function setDiscardMode(on) {
    _el('discard-mode-banner').classList.toggle('show', on);
  }

  function flashBorder(color) {
    document.body.style.boxShadow = `inset 0 0 40px ${color}55`;
    setTimeout(() => document.body.style.boxShadow = '', 400);
  }

  function showGameOver() {
    const s = Model.get();
    _el('go-stats').textContent = `Round ${s.round} — $${s.balance} restants`;
    _el('gameover-overlay').classList.add('show');
  }

  function showRoundWin() {
    const s = Model.get();
    _el('rw-round').textContent  = `ROUND ${s.round} TERMINÉ`;
    _el('rw-target').textContent = `Objectif atteint : $${s.roundTarget.toLocaleString()}`;
    _el('roundwin-overlay').classList.add('show');
  }

  function hideOverlays() {
    _el('gameover-overlay').classList.remove('show');
    _el('roundwin-overlay').classList.remove('show');
  }

  // ── GLASS EFFECT NOTICE ─────────────────────────────────────────────
  function showGlassReveal(card) {
    if (!card) return;
    floatText(`◈ VERRE — ${card.rank}${card.suit} cachée`, '#7ecfff', '50%', '30%');
  }

  // ── HELPERS ─────────────────────────────────────────────────────────
  function _el(id) { return document.getElementById(id); }

  return {
    updateAll, addBet, clearBet,
    showMessage, floatText,
    showBustChoice, setDiscardMode,
    flashBorder, showGameOver, showRoundWin, hideOverlays,
    showGlassReveal,
  };
})();
