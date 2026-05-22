// ============================================================
//  CARDS — Effects, Styles, Canvas Texture Generation
// ============================================================

const Cards = (() => {

  // ── EFFECT DEFINITIONS ──────────────────────────────────────────────
  // Each card can have ONE optional effect and ONE optional style.
  //
  // EFFECTS (change game mechanics):
  //   glass    → reveals dealer hidden card value
  //   shiny    → ×1.5 multiplier on winnings per shiny card in hand
  //   negative → card subtracts its value instead of adding (score impact)
  //   gold     → +10% bet bonus per gold card drawn (player OR dealer)
  //   multi    → free discard (costs no discard token)
  //
  // STYLES (change card rules):
  //   retro    → player can exceed bust limit by 1pt per retro card in play
  //   graffiti → card face value +2
  //   detailed → reduces dealer max-play threshold by 1 per detailed card
  //              (countered by dealer's own retro cards)

  const EFFECTS = {
    glass:    { id: 'glass',    label: 'VERRE',    color: '#7ecfff', desc: 'Révèle la carte cachée du croupier' },
    shiny:    { id: 'shiny',    label: 'BRILLANT', color: '#ff80ab', desc: '×1.5 gains par carte brillante' },
    negative: { id: 'negative', label: 'NÉGATIF',  color: '#e74c3c', desc: 'Soustrait des points au lieu d\'en ajouter' },
    gold:     { id: 'gold',     label: 'OR',       color: '#f0d078', desc: '+10% de la mise par carte or tirée' },
    multi:    { id: 'multi',    label: 'MULTICOLOR',color:'#c39bd3', desc: 'Défausse gratuite (sans token)' },
  };

  const STYLES = {
    retro:    { id: 'retro',    label: 'RÉTRO',    color: '#f39c12', desc: '+1 point de tolérance de bust par carte rétro' },
    graffiti: { id: 'graffiti', label: 'GRAFFITI', color: '#27ae60', desc: '+2 à la valeur de la carte' },
    detailed: { id: 'detailed', label: 'DÉTAILLÉ', color: '#2980b9', desc: 'Réduit le seuil max du croupier de 1' },
  };

  // Spawn probabilities (0–1). Set to 0 to disable.
  const EFFECT_WEIGHTS = {
    glass: 0.08, shiny: 0.10, negative: 0.08, gold: 0.09, multi: 0.07,
    none: 0.58
  };
  const STYLE_WEIGHTS = {
    retro: 0.08, graffiti: 0.10, detailed: 0.08,
    none: 0.74
  };

  function weightedRandom(weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [key, w] of Object.entries(weights)) {
      r -= w;
      if (r <= 0) return key === 'none' ? null : key;
    }
    return null;
  }

  function assignCardExtras(card) {
    card.effect = weightedRandom(EFFECT_WEIGHTS);
    card.style  = weightedRandom(STYLE_WEIGHTS);
    return card;
  }

  // ── COMPUTED CARD VALUE (with style) ────────────────────────────────
  function computeCardValue(card) {
    let val = card.value;
    if (card.style === 'graffiti') val += 2;
    if (card.effect === 'negative') val = -Math.abs(val); // negative effect inverts
    return val;
  }

  // ── HAND VALUE (accounting for styles & effects) ────────────────────
  function handValue(hand) {
    let val = 0, aces = 0;
    for (const c of hand) {
      if (!c.faceUp) continue;
      const cv = computeCardValue(c);
      val += cv;
      if (c.rank === 'A' && c.effect !== 'negative') aces++;
    }
    // Reduce aces from 11→1 only while above bust threshold
    // (bust threshold is computed separately)
    while (val > 21 && aces > 0) { val -= 10; aces--; }
    return val;
  }

  // ── BUST THRESHOLD (retro style) ────────────────────────────────────
  // Player bust threshold = 21 + (number of retro cards in hand)
  function bustThreshold(hand) {
    return 21 + hand.filter(c => c.style === 'retro' && c.faceUp).length;
  }

  // Blackjack activates at bust threshold (e.g. 3 retro → BJ at 24)
  function blackjackScore(hand) {
    return bustThreshold(hand);
  }

  function isBlackjack(hand) {
    return hand.length === 2 && handValue(hand) === blackjackScore(hand);
  }

  function isBust(hand) {
    return handValue(hand) > bustThreshold(hand);
  }

  function isFiveCardCharlie(hand) {
    return hand.length >= 5 && !isBust(hand);
  }

  // ── DEALER THRESHOLD ────────────────────────────────────────────────
  // Dealer plays until reaching dealerThreshold (default 17).
  // detailed cards in PLAYER hand reduce it by 1 each.
  // Dealer's own retro cards cancel detailed effects (1 retro cancels 1 detailed).
  function dealerThreshold(playerHand, dealerHand) {
    const detailed = playerHand.filter(c => c.style === 'detailed').length;
    const dealerRetro = dealerHand.filter(c => c.style === 'retro').length;
    const reduction = Math.max(0, detailed - dealerRetro);
    return Math.max(12, 17 - reduction); // never below 12
  }

  // ── MULTIPLIER COMPUTATION ───────────────────────────────────────────
  // Stacks all bonus multipliers for the round result.
  function computeMultiplier(playerHand, baseResult) {
    let mult = 1.0;

    if (isBlackjack(playerHand)) mult *= 1.5;
    else if (isFiveCardCharlie(playerHand)) mult *= 2.0;
    else if (handValue(playerHand) === blackjackScore(playerHand)) mult *= 1.2;

    // Each shiny card adds ×1.5
    const shinyCount = playerHand.filter(c => c.effect === 'shiny').length;
    if (shinyCount > 0) mult *= Math.pow(1.5, shinyCount);

    return parseFloat(mult.toFixed(2));
  }

  // Gold bonus: flat addition per gold card (player + dealer)
  function computeGoldBonus(playerHand, dealerHand, bet) {
    const goldCards = [...playerHand, ...dealerHand].filter(c => c.effect === 'gold').length;
    return Math.floor(bet * 0.10 * goldCards);
  }

  // ── HAND NAME ───────────────────────────────────────────────────────
  function getHandName(hand) {
    const score = handValue(hand);
    const threshold = bustThreshold(hand);
    if (isBust(hand)) return 'BUST';
    if (isBlackjack(hand)) return 'BLACKJACK!';
    if (isFiveCardCharlie(hand)) return 'MAIN DE 5';
    if (score === threshold) return `${threshold} PARFAIT`;
    if (score >= threshold - 3) return 'FORTE';
    if (score >= 13) return 'MOYENNE';
    return 'FAIBLE';
  }

  // ── GLASS EFFECT REVEAL ─────────────────────────────────────────────
  // Returns the dealer hidden card if any glass card is in player hand
  function getGlassReveal(playerHand, dealerHand) {
    const hasGlass = playerHand.some(c => c.effect === 'glass');
    if (!hasGlass) return null;
    return dealerHand.find(c => !c.faceUp) || null;
  }

  // ── CANVAS TEXTURE GENERATION ────────────────────────────────────────
  const EFFECT_COLORS = {
    glass:    '#7ecfff',
    shiny:    '#ff80ab',
    negative: '#e74c3c',
    gold:     '#f0d078',
    multi:    '#c39bd3',
  };
  const STYLE_COLORS = {
    retro:    '#f39c12',
    graffiti: '#27ae60',
    detailed: '#2980b9',
  };

  function makeFaceCanvas(card, glassRevealed = false) {
    const W = 256, H = 384;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    const isRed = ['♥','♦'].includes(card.suit);
    const rankColor = isRed ? '#c0392b' : '#1a1a2e';
    const effectColor = card.effect ? EFFECT_COLORS[card.effect] : null;
    const styleColor  = card.style  ? STYLE_COLORS[card.style]   : null;

    // ── Background ──
    _drawBackground(ctx, W, H, card);

    // ── Border ──
    _drawBorder(ctx, W, H, effectColor, styleColor);

    // ── Rank corners ──
    // Displayed value (graffiti +2)
    const displayRank = card.style === 'graffiti' ? _graffitiRank(card.rank) : card.rank;
    const displayColor = card.effect === 'negative' ? '#e74c3c' : rankColor;

    ctx.font = 'bold 50px Georgia,serif';
    ctx.fillStyle = displayColor;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(displayRank, 18, 12);
    ctx.font = '34px serif';
    ctx.fillStyle = displayColor;
    ctx.fillText(card.suit, 22, 62);

    ctx.save();
    ctx.translate(W, H); ctx.rotate(Math.PI);
    ctx.font = 'bold 50px Georgia,serif'; ctx.fillStyle = displayColor;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(displayRank, 18, 12);
    ctx.font = '34px serif'; ctx.fillStyle = displayColor;
    ctx.fillText(card.suit, 22, 62);
    ctx.restore();

    // ── Center suit / face art ──
    if (card.effect === 'negative') {
      // Draw suit with red slash
      ctx.font = '110px serif'; ctx.fillStyle = rankColor;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.5;
      ctx.fillText(card.suit, W/2, H/2);
      ctx.globalAlpha = 1;
      // Red minus
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(W/2-28, H/2-5, 56, 10);
    } else {
      ctx.font = '110px serif'; ctx.fillStyle = displayColor;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.88;
      ctx.fillText(card.suit, W/2, H/2);
      ctx.globalAlpha = 1;
    }

    // ── Face card label ──
    if (['J','Q','K'].includes(card.rank)) {
      const labels = {J:'VALET',Q:'DAME',K:'ROI'};
      ctx.font = 'italic bold 18px Georgia,serif';
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(labels[card.rank], W/2, H-16);
    }

    // ── Effect badge ──
    if (card.effect) {
      _drawEffectBadge(ctx, W, H, card.effect, effectColor);
    }

    // ── Style badge ──
    if (card.style) {
      _drawStyleBadge(ctx, W, H, card.style, styleColor);
    }

    // ── Glass reveal overlay ──
    if (glassRevealed) {
      _drawGlassReveal(ctx, W, H, card);
    }

    return cv;
  }

  function _graffitiRank(rank) {
    // Graffiti adds 2 to the displayed rank
    const numeric = { A:1, J:11, Q:12, K:13 };
    const n = numeric[rank] || parseInt(rank);
    const newVal = n + 2;
    if (newVal >= 11 && rank !== 'A') return ['J','Q','K','A'][Math.min(newVal-11,3)];
    return String(newVal);
  }

  function _drawBackground(ctx, W, H, card) {
    // Subtle tint based on style
    let bg = '#f5ead0';
    if (card.style === 'retro')    bg = '#fff8e8';
    if (card.style === 'graffiti') bg = '#f0fff0';
    if (card.style === 'detailed') bg = '#eef4ff';

    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, _lighten(bg, -8));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Retro: scanlines
    if (card.style === 'retro') {
      ctx.globalAlpha = 0.04;
      for (let y = 0; y < H; y += 4) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, y, W, 2);
      }
      ctx.globalAlpha = 1;
    }
    // Graffiti: paint splatters
    if (card.style === 'graffiti') {
      ctx.globalAlpha = 0.07;
      ['#27ae60','#e74c3c','#f39c12','#3498db'].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(40+i*55, 180+Math.sin(i)*30, 18+i*4, 0, Math.PI*2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    // Detailed: fine cross-hatch
    if (card.style === 'detailed') {
      ctx.strokeStyle = 'rgba(41,128,185,0.06)'; ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 10) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y = 0; y < H; y += 10) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    }
  }

  function _drawBorder(ctx, W, H, effectColor, styleColor) {
    // Outer gold border
    ctx.strokeStyle = '#c9a84c'; ctx.lineWidth = 5;
    ctx.strokeRect(7, 7, W-14, H-14);

    // Effect colored inner border
    if (effectColor) {
      ctx.strokeStyle = effectColor; ctx.lineWidth = 2;
      ctx.strokeRect(13, 13, W-26, H-26);
      // Corner glows
      const grd = ctx.createRadialGradient(14, 14, 0, 14, 14, 20);
      grd.addColorStop(0, effectColor + '60');
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd; ctx.fillRect(0,0,40,40);
      const grd2 = ctx.createRadialGradient(W-14, H-14, 0, W-14, H-14, 20);
      grd2.addColorStop(0, effectColor + '60');
      grd2.addColorStop(1, 'transparent');
      ctx.fillStyle = grd2; ctx.fillRect(W-40,H-40,40,40);
    } else {
      ctx.strokeStyle = 'rgba(201,168,76,0.3)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(13, 13, W-26, H-26);
    }

    // Style colored tab at bottom
    if (styleColor) {
      ctx.fillStyle = styleColor + '30';
      ctx.fillRect(7, H-30, W-14, 23);
    }
  }

  function _drawEffectBadge(ctx, W, H, effect, color) {
    const LABELS = { glass:'◈ VERRE', shiny:'✦ BRILLANT', negative:'⊖ NÉGATIF', gold:'◉ OR', multi:'❋ MULTI' };
    const label = LABELS[effect] || effect.toUpperCase();
    ctx.font = 'bold 13px Space Mono, monospace';
    const tw = ctx.measureText(label).width;
    const px = W/2 - tw/2 - 6, py = H - 28;
    ctx.fillStyle = color + 'cc';
    _roundRect(ctx, px, py, tw+12, 16, 3); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, W/2, py+8);
  }

  function _drawStyleBadge(ctx, W, H, style, color) {
    const LABELS = { retro:'▶ RÉTRO', graffiti:'★ GRAFF', detailed:'◎ DÉTAIL' };
    const label = LABELS[style] || style.toUpperCase();
    ctx.font = 'bold 11px Space Mono, monospace';
    ctx.fillStyle = color + 'aa';
    const tw = ctx.measureText(label).width;
    _roundRect(ctx, 12, H-46, tw+10, 13, 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 17, H-40);
  }

  function _drawGlassReveal(ctx, W, H, card) {
    // Frosted glass overlay with actual card value
    ctx.fillStyle = 'rgba(126,207,255,0.18)';
    ctx.fillRect(0, 0, W, H);
    // Show true value prominently
    ctx.font = 'bold 38px Georgia,serif';
    ctx.fillStyle = '#7ecfff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#7ecfff'; ctx.shadowBlur = 15;
    ctx.fillText(card.rank + card.suit, W/2, H/2 - 12);
    ctx.shadowBlur = 0;
    ctx.font = '11px Space Mono, monospace';
    ctx.fillStyle = '#7ecfff';
    ctx.fillText('VERRE · RÉVÉLÉ', W/2, H/2 + 30);
  }

  function makeBackCanvas() {
    const W = 256, H = 384;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0d1a3a'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#c9a84c'; ctx.lineWidth = 6; ctx.strokeRect(8,8,W-16,H-16);
    ctx.strokeStyle = 'rgba(201,168,76,0.4)'; ctx.lineWidth = 2; ctx.strokeRect(16,16,W-32,H-32);
    ctx.strokeStyle = 'rgba(201,168,76,0.18)'; ctx.lineWidth = 1;
    const step = 24;
    for (let x = -H; x < W+H; x+=step) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+H,H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x-H,H); ctx.stroke();
    }
    ctx.save(); ctx.translate(W/2,H/2); ctx.rotate(Math.PI/4);
    ctx.fillStyle='rgba(201,168,76,0.15)'; ctx.fillRect(-28,-28,56,56);
    ctx.strokeStyle='#c9a84c'; ctx.lineWidth=2; ctx.strokeRect(-28,-28,56,56);
    ctx.restore();
    ctx.font='bold italic 28px Georgia,serif'; ctx.fillStyle='rgba(201,168,76,0.7)';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('BJ', W/2, H/2);
    return cv;
  }

  // ── GLASS-REVEALED BACK CANVAS ──────────────────────────────────────
  // When player has a glass card: dealer's hidden card back shows its value
  function makeGlassBackCanvas(card) {
    const cv = makeBackCanvas();
    const W = 256, H = 384;
    const ctx = cv.getContext('2d');
    // Frosted overlay
    ctx.fillStyle = 'rgba(126,207,255,0.22)';
    ctx.fillRect(0, 0, W, H);
    // Value
    ctx.font = 'bold 40px Georgia,serif';
    ctx.fillStyle = '#7ecfff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#7ecfff'; ctx.shadowBlur = 18;
    ctx.fillText(card.rank + card.suit, W/2, H/2);
    ctx.shadowBlur = 0;
    return cv;
  }

  // ── HELPERS ─────────────────────────────────────────────────────────
  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
    ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
    ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
    ctx.closePath();
  }

  function _lighten(hex, amount) {
    const num = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, (num>>16) + amount);
    const g = Math.min(255, ((num>>8)&0xff) + amount);
    const b = Math.min(255, (num&0xff) + amount);
    return `rgb(${r},${g},${b})`;
  }

  return {
    EFFECTS, STYLES,
    assignCardExtras,
    computeCardValue, handValue, bustThreshold, blackjackScore,
    isBlackjack, isBust, isFiveCardCharlie,
    dealerThreshold,
    computeMultiplier, computeGoldBonus,
    getHandName, getGlassReveal,
    makeFaceCanvas, makeBackCanvas, makeGlassBackCanvas,
  };
})();
