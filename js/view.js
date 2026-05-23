// ============================================================
//  VIEW — DOM, tooltip, deck viewer, history panel
// ============================================================

const View = window.View = (() => {
  let tooltipTimeout = null;

  // ── MAIN UPDATE ──────────────────────────────────────────────────────
  function updateAll() {
    const s = Model.get();
    const pScore    = Model.handValue(s.playerHand);
    const thresh    = Model.bustThreshold(s.playerHand);
    const isBetting = s.phase === 'betting';
    const isPlaying = s.phase === 'playing';

    _e('balance-display').textContent    = '$' + s.balance;
    _e('bet-display').textContent        = '$' + s.bet;
    _e('current-bet-display').textContent = s.bet;
    _e('deck-count').textContent         = s.deck.length;
    _e('round-num').textContent          = s.round;
    _e('target-score').textContent       = '$' + s.roundTarget.toLocaleString();

    const pct = Math.min(100, (s.roundScore / s.roundTarget) * 100);
    _e('score-progress-bar').style.width = pct + '%';
    _e('score-progress-text').textContent = '$' + s.roundScore.toLocaleString() + ' / $' + s.roundTarget.toLocaleString();

    // Hand pips
    const pipsEl = _e('hands-pips'); pipsEl.innerHTML = '';
    for (let i = 0; i < Model.HANDS_PER_ROUND; i++) {
      const pip = document.createElement('div'); pip.className = 'hand-pip';
      const used = Model.HANDS_PER_ROUND - s.handsLeft;
      const activeIdx = used - (isPlaying ? 1 : 0);
      if (i < activeIdx) pip.classList.add('used');
      else if (i === activeIdx && isPlaying) pip.classList.add('active');
      pipsEl.appendChild(pip);
    }

    // Discard pips
    const dpipsEl = _e('discard-pips'); dpipsEl.innerHTML = '';
    for (let i = 0; i < Model.DISCARDS_PER_ROUND; i++) {
      const pip = document.createElement('div'); pip.className = 'disc-pip';
      if (i >= s.discardsLeft) pip.classList.add('used');
      dpipsEl.appendChild(pip);
    }

    // Player score
    const scoreEl = _e('player-score'), nameEl = _e('hand-name');
    if (s.playerHand.length > 0) {
      scoreEl.textContent = pScore;
      scoreEl.className = 'hand-score' + (pScore > thresh ? ' danger' : '');
      nameEl.textContent = Model.getHandName(s.playerHand);
    } else { scoreEl.textContent = ''; nameEl.textContent = ''; }

    _e('dealer-score').textContent = s.dealerHand.length > 0
      ? Model.handValue(s.dealerHand.filter(c => c.faceUp)) : '';
    const dt = Model.dealerThreshold();
    _e('dealer-threshold').textContent = dt !== 17 ? `Joue jusqu'à ${dt}` : '';

    _e('stat-games').textContent   = s.stats.games;
    _e('stat-wins').textContent    = s.stats.wins;
    _e('stat-winrate').textContent = (s.stats.games > 0 ? Math.round(s.stats.wins / s.stats.games * 100) : 0) + '%';
    _e('stat-streak').textContent  = s.stats.streak;

    _e('mult-blackjack').classList.toggle('active', Model.isBlackjack(s.playerHand));
    _e('mult-21').classList.toggle('active', pScore === Cards.blackjackScore(s.playerHand) && !Model.isBlackjack(s.playerHand));
    _e('mult-5cards').classList.toggle('active', Model.isFiveCardCharlie(s.playerHand));

    _updateSideBets(s.playerHand);
    _updateEffectBadges(s);

    // Buttons
    _e('deal-row').classList.toggle('hidden', !isBetting);
    _e('play-buttons').classList.toggle('hidden', !isPlaying);
    _e('bust-choice').classList.add('hidden');
    if (isBetting) _e('btn-deal').disabled = s.bet === 0 || s.handsLeft <= 0;
    if (isPlaying) {
      _e('btn-double').disabled  = s.playerHand.length !== 2 || s.balance < s.bet;
      _e('btn-discard').disabled = s.discardsLeft <= 0 && !s.playerHand.some(c => c.effect === 'multi');
    }
    const canPay = isBetting && Model.canPayRound() && !Model.isRoundWon();
    _e('btn-pay').style.display = canPay ? 'inline-block' : 'none';
  }

  function _updateSideBets(hand) {
    const triggered = (hand && hand.length > 0) ? Cards.evaluateSideBets(hand) : [];
    Object.keys(Cards.SIDE_BETS).forEach(id => {
      const el = _e('sidebet-' + id);
      if (el) el.classList.toggle('active', triggered.includes(id));
    });
  }

  function _updateEffectBadges(s) {
    const active = new Set();
    [...s.playerHand, ...s.dealerHand.filter(c => c.faceUp)].forEach(c => { if (c.effect) active.add(c.effect); });
    ['glass','shiny','negative','gold','multi'].forEach(fx => {
      const b = _e('badge-' + fx); if (b) b.classList.toggle('visible', active.has(fx));
    });
    const sc = s.playerHand.filter(c => c.effect === 'shiny').length;
    const sb = _e('badge-shiny'); if (sb) sb.textContent = sc > 1 ? `✦ BRILLANT ×${sc}` : '✦ BRILLANT';
    const gc = [...s.playerHand, ...s.dealerHand.filter(c => c.faceUp)].filter(c => c.effect === 'gold').length;
    const gb = _e('badge-gold'); if (gb) gb.textContent = gc > 1 ? `◉ OR ×${gc}` : '◉ OR';
  }

  // ── BET ───────────────────────────────────────────────────────────────
  function addBet(amount) {
    if (!Model.addBet(amount)) { flashBorder('#e74c3c'); return; }
    updateAll();
    floatText('+$' + amount, '#c9a84c', '50%', '55%');
  }

  function clearBet() { Model.clearBet(); updateAll(); }

  function openBetInput() {
    const s = Model.get();
    if (s.phase !== 'betting') return;
    _e('bet-input-field').value = s.bet || '';
    _e('bet-input-field').max   = s.balance + s.bet;
    _e('bet-input-overlay').classList.add('show');
    _e('bet-input-field').focus();
    _e('bet-input-field').select();
  }

  function closeBetInput(confirm = false) {
    if (confirm) {
      const val = parseInt(_e('bet-input-field').value) || 0;
      Model.setBet(val);
      updateAll();
    }
    _e('bet-input-overlay').classList.remove('show');
  }

  // ── CARD TOOLTIP ──────────────────────────────────────────────────────
  function showCardTooltip(data) {
    if (!data) { hideCardTooltip(); return; }
    clearTimeout(tooltipTimeout);
    const { card } = data;
    const panel = _e('card-tooltip');
    const cv = _e('tooltip-card-canvas');
    const W = 140, H = 210;
    cv.width = W; cv.height = H;
    cv.getContext('2d').drawImage(Cards.makeFaceCanvas(card), 0, 0, W, H);

    const isRed = ['♥','♦'].includes(card.suit);
    _e('tooltip-card-name').textContent = card.rank + ' ' + card.suit;
    _e('tooltip-card-name').style.color = isRed ? '#e74c3c' : '#1a1a2e';
    const val = Cards.computeCardValue(card);
    _e('tooltip-card-value').textContent = (val > 0 ? '+' : '') + val + ' pts';
    _e('tooltip-card-value').style.color = val < 0 ? '#e74c3c' : '#c9a84c';

    const efs = _e('tooltip-effect');
    if (card.effect && Cards.EFFECTS[card.effect]) {
      const ef = Cards.EFFECTS[card.effect];
      efs.innerHTML = `<div class="tt-row" style="border-color:${ef.color}"><span class="tt-icon" style="color:${ef.color}">${ef.icon} ${ef.label}</span><span class="tt-desc">${ef.desc}</span></div>`;
      efs.style.display = 'block';
    } else efs.style.display = 'none';

    const sts = _e('tooltip-style');
    if (card.style && Cards.STYLES[card.style]) {
      const st = Cards.STYLES[card.style];
      sts.innerHTML = `<div class="tt-row" style="border-color:${st.color}"><span class="tt-icon" style="color:${st.color}">${st.icon} ${st.label}</span><span class="tt-desc">${st.desc}</span></div>`;
      sts.style.display = 'block';
    } else sts.style.display = 'none';

    panel.classList.add('visible');
  }

  function hideCardTooltip() {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
      _e('card-tooltip').classList.remove('visible');
    }, 100);
  }

  // ── DECK VIEWER ───────────────────────────────────────────────────────
  function openDeckViewer() {
    const s = Model.get();
    const container = _e('deck-viewer-cards');
    container.innerHTML = '';

    const suitOrder = { '♠':0,'♥':1,'♦':2,'♣':3 };
    const rankOrder = { A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13 };
    const sorted = [...s.fullDeck].sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
      return rankOrder[a.rank] - rankOrder[b.rank];
    });

    let currentSuit = null;
    sorted.forEach(card => {
      if (card.suit !== currentSuit) {
        currentSuit = card.suit;
        const header = document.createElement('div');
        header.className = 'deck-suit-header';
        const isRed = ['♥','♦'].includes(card.suit);
        header.style.color = isRed ? '#e74c3c' : '#e0d0b0';
        header.textContent = card.suit + ' ' + { '♠':'PIQUES','♥':'CŒURS','♦':'CARREAUX','♣':'TRÈFLES' }[card.suit];
        container.appendChild(header);
      }

      const slot = document.createElement('div');
      slot.className = 'deck-card-slot';
      const cv = document.createElement('canvas');
      cv.width = 80; cv.height = 120;
      cv.getContext('2d').drawImage(Cards.makeFaceCanvas(card), 0, 0, 80, 120);
      slot.appendChild(cv);

      if (card.effect || card.style) {
        const badge = document.createElement('div');
        badge.className = 'deck-card-badge';
        if (card.effect) {
          const ef = Cards.EFFECTS[card.effect];
          const span = document.createElement('span');
          span.style.color = ef.color; span.textContent = ef.icon; span.title = ef.label;
          badge.appendChild(span);
        }
        if (card.style) {
          const st = Cards.STYLES[card.style];
          const span = document.createElement('span');
          span.style.color = st.color; span.textContent = st.icon; span.title = st.label;
          badge.appendChild(span);
        }
        slot.appendChild(badge);
      }
      container.appendChild(slot);
    });

    _e('deck-viewer').classList.add('show');
  }

  function closeDeckViewer() { _e('deck-viewer').classList.remove('show'); }

  // ── HISTORY PANEL ─────────────────────────────────────────────────────
  function openHistoryPanel() {
    const s = Model.get();
    const list = _e('history-list');
    list.innerHTML = '';

    if (!s.handHistory || s.handHistory.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:#555;padding:40px;font-size:11px;letter-spacing:2px;">AUCUNE MAIN JOUÉE</div>';
    } else {
      const RESULT_LABELS = { win:'VICTOIRE', blackjack:'BLACKJACK', lose:'DÉFAITE', push:'ÉGALITÉ' };
      const RESULT_COLORS = { win:'#c9a84c', blackjack:'#f0d078', lose:'#e74c3c', push:'#95a5a6' };

      [...s.handHistory].reverse().forEach(h => {
        const row = document.createElement('div');
        row.className = 'history-row ' + h.result;
        const color = RESULT_COLORS[h.result] || '#888';
        const profitSign = h.profit > 0 ? '+' : '';

        // Player cards with effect/style icons
        const cardsHtml = h.playerCards.map(c => {
          const isRed = ['♥','♦'].includes(c.suit);
          const col = isRed ? '#e74c3c' : '#e0d0b0';
          const efIcon  = c.effect ? `<span style="color:${Cards.EFFECTS[c.effect]?.color||'#888'};font-size:9px">${Cards.EFFECTS[c.effect]?.icon||''}</span>` : '';
          const stIcon  = c.style  ? `<span style="color:${Cards.STYLES[c.style]?.color||'#888'};font-size:9px">${Cards.STYLES[c.style]?.icon||''}</span>`   : '';
          return `<span class="hist-card" style="color:${col}">${c.rank}${c.suit}${efIcon}${stIcon}</span>`;
        }).join(' ');

        // Multiplier breakdown
        const multParts = [];
        if (h.shinyMult && h.shinyMult > 1) multParts.push(`<span style="color:#ff80ab">✦ ×${h.shinyMult.toFixed(2)}</span>`);
        if (h.sideMult  && h.sideMult  > 1) multParts.push(`<span style="color:#9b59b6">🎲 ×${h.sideMult.toFixed(2)}</span>`);
        if (h.goldBonus > 0)                multParts.push(`<span style="color:#f0d078">◉ +$${h.goldBonus}</span>`);

        // Side bets triggered
        const sideBetHtml = (h.sideBets || []).map(id => {
          const sb = Cards.SIDE_BETS[id];
          return sb ? `<span class="hist-sidebet" style="color:${sb.color};border-color:${sb.color}">${sb.label}</span>` : '';
        }).join('');

        row.innerHTML = `
          <div class="hist-header">
            <span class="hist-round">R${h.round}</span>
            <span class="hist-result" style="color:${color}">${RESULT_LABELS[h.result] || h.result}</span>
            <span class="hist-score">${h.pScore} vs ${h.dScore}</span>
            <span class="hist-profit" style="color:${color}">${profitSign}$${h.profit}</span>
          </div>
          <div class="hist-cards">${cardsHtml}</div>
          <div class="hist-mods">
            <span class="hist-bet">Mise : $${h.bet}</span>
            ${multParts.length ? '<span class="hist-sep">·</span>' + multParts.join(' ') : ''}
            ${sideBetHtml}
          </div>
        `;
        list.appendChild(row);
      });
    }

    _e('history-panel').classList.add('show');
  }

  function closeHistoryPanel() { _e('history-panel').classList.remove('show'); }

  // ── MESSAGES ──────────────────────────────────────────────────────────
  function showMessage(text, type, sub = '') {
    const el = _e('message-overlay');
    _e('message-text').textContent = text;
    _e('message-text').className   = 'message-text ' + type;
    _e('message-sub').textContent  = sub;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2600);
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
    _e('play-buttons').classList.add('hidden');
    _e('bust-choice').classList.remove('hidden');
  }

  function setDiscardMode(on) { _e('discard-mode-banner').classList.toggle('show', on); }

  function flashBorder(color) {
    document.body.style.boxShadow = `inset 0 0 40px ${color}55`;
    setTimeout(() => document.body.style.boxShadow = '', 400);
  }

  function showGlassReveal(card) {
    if (!card) return;
    floatText(`◈ VERRE — ${card.rank}${card.suit} cachée`, '#7ecfff', '50%', '30%');
  }

  function showGameOver() {
    const s = Model.get();
    _e('go-stats').textContent = `Round ${s.round} — $${s.balance} restants`;
    _e('gameover-overlay').classList.add('show');
  }

  function showRoundWin() {
    const s = Model.get();
    _e('rw-round').textContent  = `ROUND ${s.round} TERMINÉ`;
    _e('rw-target').textContent = `Objectif atteint : $${s.roundTarget.toLocaleString()}`;
    _e('roundwin-overlay').classList.add('show');
  }

  function hideOverlays() {
    _e('gameover-overlay').classList.remove('show');
    _e('roundwin-overlay').classList.remove('show');
  }

  function _e(id) { return document.getElementById(id); }

  // ── PUBLIC API ────────────────────────────────────────────────────────
  return {
    updateAll, addBet, clearBet, openBetInput, closeBetInput,
    showMessage, floatText,
    showBustChoice, setDiscardMode, flashBorder,
    showGlassReveal, showGameOver, showRoundWin, hideOverlays,
    showCardTooltip, hideCardTooltip,
    openDeckViewer, closeDeckViewer,
    openHistoryPanel, closeHistoryPanel,
  };
})();
