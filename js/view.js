// ============================================================
//  VIEW — DOM updates, card tooltip, UI panels
// ============================================================

const View = (() => {

  // ── TOOLTIP STATE ────────────────────────────────────────────────────
  let tooltipVisible = false;
  let tooltipTimeout = null;

  // ── MAIN UPDATE ──────────────────────────────────────────────────────
  function updateAll() {
    const s = Model.get();
    const pScore  = Model.handValue(s.playerHand);
    const thresh  = Model.bustThreshold(s.playerHand);
    const isBetting = s.phase === 'betting';
    const isPlaying = s.phase === 'playing';

    _el('balance-display').textContent = '$'+s.balance;
    _el('bet-display').textContent = '$'+s.bet;
    _el('current-bet-display').textContent = s.bet;
    _el('deck-count').textContent = s.deck.length;

    // Round progress
    _el('round-num').textContent = s.round;
    _el('target-score').textContent = '$'+s.roundTarget.toLocaleString();
    const pct = Math.min(100,(s.roundScore/s.roundTarget)*100);
    _el('score-progress-bar').style.width = pct+'%';
    _el('score-progress-text').textContent = '$'+s.roundScore.toLocaleString()+' / $'+s.roundTarget.toLocaleString();

    // Hand pips
    const pipsEl = _el('hands-pips'); pipsEl.innerHTML='';
    for(let i=0;i<Model.HANDS_PER_ROUND;i++){
      const pip=document.createElement('div'); pip.className='hand-pip';
      const used=Model.HANDS_PER_ROUND-s.handsLeft;
      const activeIdx=used-(isPlaying?1:0);
      if(i<activeIdx) pip.classList.add('used');
      else if(i===activeIdx&&isPlaying) pip.classList.add('active');
      pipsEl.appendChild(pip);
    }

    // Discard pips
    const dpipsEl = _el('discard-pips'); dpipsEl.innerHTML='';
    for(let i=0;i<Model.DISCARDS_PER_ROUND;i++){
      const pip=document.createElement('div'); pip.className='disc-pip';
      if(i>=s.discardsLeft) pip.classList.add('used');
      dpipsEl.appendChild(pip);
    }

    // Player score
    const scoreEl=_el('player-score'), nameEl=_el('hand-name');
    if(s.playerHand.length>0){
      scoreEl.textContent=pScore;
      scoreEl.className='hand-score'+(pScore>thresh?' danger':'');
      nameEl.textContent=Model.getHandName(s.playerHand);
    } else { scoreEl.textContent=''; nameEl.textContent=''; }

    // Dealer score
    _el('dealer-score').textContent = s.dealerHand.length>0
      ? Model.handValue(s.dealerHand.filter(c=>c.faceUp)) : '';

    const dealThresh = Model.dealerThreshold();
    _el('dealer-threshold').textContent = dealThresh!==17 ? `Joue jusqu'à ${dealThresh}` : '';

    // Stats
    _el('stat-games').textContent=s.stats.games;
    _el('stat-wins').textContent=s.stats.wins;
    _el('stat-winrate').textContent=(s.stats.games>0?Math.round(s.stats.wins/s.stats.games*100):0)+'%';
    _el('stat-streak').textContent=s.stats.streak;

    // Multiplier chips
    _el('mult-blackjack').classList.toggle('active',Model.isBlackjack(s.playerHand));
    _el('mult-21').classList.toggle('active',pScore===Cards.blackjackScore(s.playerHand)&&!Model.isBlackjack(s.playerHand));
    _el('mult-5cards').classList.toggle('active',Model.isFiveCardCharlie(s.playerHand));

    // Side bet chips
    _updateSideBetChips(s.playerHand);

    // Effect badges
    _updateEffectsBadges(s);

    // Buttons
    _el('deal-row').classList.toggle('hidden',!isBetting);
    _el('play-buttons').classList.toggle('hidden',!isPlaying);
    _el('bust-choice').classList.add('hidden');
    if(isBetting) _el('btn-deal').disabled=s.bet===0||s.handsLeft<=0;
    if(isPlaying){
      _el('btn-double').disabled=s.playerHand.length!==2||s.balance<s.bet;
      _el('btn-discard').disabled=s.discardsLeft<=0&&!s.playerHand.some(c=>c.effect==='multi');
    }
    const canPay=isBetting&&Model.canPayRound()&&!Model.isRoundWon()&&s.handsLeft>=0;
    _el('btn-pay').style.display=canPay?'inline-block':'none';
  }

  function _updateSideBetChips(hand) {
    if (!hand || hand.length < 2) {
      Object.keys(Cards.SIDE_BETS).forEach(id => {
        const el = _el('sidebet-'+id);
        if (el) el.classList.remove('active');
      });
      return;
    }
    const triggered = Cards.evaluateSideBets(hand);
    Object.keys(Cards.SIDE_BETS).forEach(id => {
      const el = _el('sidebet-'+id);
      if (el) el.classList.toggle('active', triggered.includes(id));
    });
  }

  function _updateEffectsBadges(s) {
    const active = new Set();
    [...s.playerHand, ...s.dealerHand.filter(c=>c.faceUp)].forEach(c=>{ if(c.effect) active.add(c.effect); });
    ['glass','shiny','negative','gold','multi'].forEach(fx=>{
      const badge=_el('badge-'+fx);
      if(badge) badge.classList.toggle('visible',active.has(fx));
    });
    const shinyCount=s.playerHand.filter(c=>c.effect==='shiny').length;
    const shinyBadge=_el('badge-shiny');
    if(shinyBadge) shinyBadge.textContent=shinyCount>1?`✦ BRILLANT ×${shinyCount}`:'✦ BRILLANT';
    const goldCount=[...s.playerHand,...s.dealerHand.filter(c=>c.faceUp)].filter(c=>c.effect==='gold').length;
    const goldBadge=_el('badge-gold');
    if(goldBadge) goldBadge.textContent=goldCount>1?`◉ OR ×${goldCount}`:'◉ OR';
  }

  // ── CARD TOOLTIP ─────────────────────────────────────────────────────
  function showCardTooltip(data) {
    if (!data) { hideCardTooltip(); return; }
    const { card, isPlayer } = data;
    clearTimeout(tooltipTimeout);

    const panel = _el('card-tooltip');
    const previewCtx = _el('tooltip-card-canvas').getContext('2d');
    const W=160, H=240;
    _el('tooltip-card-canvas').width=W; _el('tooltip-card-canvas').height=H;

    // Draw mini card preview
    const fullCanvas = Cards.makeFaceCanvas(card);
    previewCtx.drawImage(fullCanvas, 0,0,W,H);

    // Card name
    const isRed=['♥','♦'].includes(card.suit);
    _el('tooltip-card-name').textContent = card.rank+' '+card.suit;
    _el('tooltip-card-name').style.color = isRed?'#e74c3c':'#1a1a2e';

    // Value
    const val = Cards.computeCardValue(card);
    _el('tooltip-card-value').textContent = (val>0?'+':'')+val+' pts';
    _el('tooltip-card-value').style.color = val<0?'#e74c3c':'#c9a84c';

    // Effect section
    const effectSection = _el('tooltip-effect');
    if (card.effect && Cards.EFFECTS[card.effect]) {
      const ef = Cards.EFFECTS[card.effect];
      effectSection.innerHTML = `
        <div class="tt-mod-row" style="border-color:${ef.color}">
          <span class="tt-mod-icon" style="color:${ef.color}">${ef.icon} ${ef.label}</span>
          <span class="tt-mod-desc">${ef.desc}</span>
        </div>`;
      effectSection.style.display='block';
    } else {
      effectSection.style.display='none';
    }

    // Style section
    const styleSection = _el('tooltip-style');
    if (card.style && Cards.STYLES[card.style]) {
      const st = Cards.STYLES[card.style];
      styleSection.innerHTML = `
        <div class="tt-mod-row" style="border-color:${st.color}">
          <span class="tt-mod-icon" style="color:${st.color}">${st.icon} ${st.label}</span>
          <span class="tt-mod-desc">${st.desc}</span>
        </div>`;
      styleSection.style.display='block';
    } else {
      styleSection.style.display='none';
    }

    panel.classList.add('visible');
    tooltipVisible = true;
  }

  function hideCardTooltip() {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
      _el('card-tooltip').classList.remove('visible');
      tooltipVisible = false;
    }, 120);
  }

  // ── BET / MESSAGE HELPERS ────────────────────────────────────────────
  function addBet(amount) {
    if(!Model.addBet(amount)){ flashBorder('#e74c3c'); return; }
    updateAll();
    floatText('+$'+amount,'#c9a84c','50%','55%');
  }
  function clearBet() { Model.clearBet(); updateAll(); }

  function showMessage(text, type, sub='') {
    const el=_el('message-overlay');
    _el('message-text').textContent=text;
    _el('message-text').className='message-text '+type;
    _el('message-sub').textContent=sub;
    el.classList.add('show');
    setTimeout(()=>el.classList.remove('show'), 2600);
  }

  function floatText(text, color, left, top) {
    const el=document.createElement('div');
    el.className='win-amount'; el.style.cssText=`left:${left};top:${top};color:${color};`;
    el.textContent=text; document.body.appendChild(el);
    setTimeout(()=>el.remove(),1500);
  }

  function showBustChoice() {
    _el('play-buttons').classList.add('hidden');
    _el('bust-choice').classList.remove('hidden');
  }
  function setDiscardMode(on) { _el('discard-mode-banner').classList.toggle('show',on); }
  function flashBorder(color) {
    document.body.style.boxShadow=`inset 0 0 40px ${color}55`;
    setTimeout(()=>document.body.style.boxShadow='',400);
  }
  function showGlassReveal(card) { if(!card) return; floatText(`◈ VERRE — ${card.rank}${card.suit} cachée`,'#7ecfff','50%','30%'); }

  function showGameOver() {
    const s=Model.get();
    _el('go-stats').textContent=`Round ${s.round} — $${s.balance} restants`;
    _el('gameover-overlay').classList.add('show');
  }
  function showRoundWin() {
    const s=Model.get();
    _el('rw-round').textContent=`ROUND ${s.round} TERMINÉ`;
    _el('rw-target').textContent=`Objectif atteint : $${s.roundTarget.toLocaleString()}`;
    _el('roundwin-overlay').classList.add('show');
  }
  function hideOverlays() {
    _el('gameover-overlay').classList.remove('show');
    _el('roundwin-overlay').classList.remove('show');
  }

  function _el(id) { return document.getElementById(id); }

  return {
    updateAll, addBet, clearBet,
    showMessage, floatText,
    showBustChoice, setDiscardMode, flashBorder,
    showGlassReveal, showGameOver, showRoundWin, hideOverlays,
    showCardTooltip, hideCardTooltip,
  };
})();
