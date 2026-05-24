// ============================================================
//  CARDS — Effects, Styles, Canvas Textures, Side Bets
// ============================================================

const Cards = window.Cards = (() => {

  // ── EFFECT DEFINITIONS ──────────────────────────────────────────────
  const EFFECTS = {
    glass:    { id:'glass',    label:'VERRE',     color:'#7ecfff', icon:'◈', desc:'Révèle la valeur de la carte cachée du croupier' },
    shiny:    { id:'shiny',    label:'BRILLANT',  color:'#ff80ab', icon:'✦', desc:'×1.5 sur vos gains par carte brillante en main (cumulable)' },
    negative: { id:'negative', label:'NÉGATIF',   color:'#e74c3c', icon:'⊖', desc:'Cette carte soustrait sa valeur à votre score' },
    gold:     { id:'gold',     label:'OR',        color:'#f0d078', icon:'◉', desc:'+10% de la mise par carte or tirée (joueur + croupier)' },
    multi:    { id:'multi',    label:'MULTICOLOR', color:'#c39bd3', icon:'❋', desc:'Défausse cette carte gratuitement sans consommer de token' },
  };

  // ── STYLE DEFINITIONS ────────────────────────────────────────────────
  const STYLES = {
    retro:    { id:'retro',    label:'RÉTRO',    color:'#f39c12', icon:'▶', desc:'+1 point de tolérance de bust par carte rétro. Le blackjack s\'active au nouveau seuil.' },
    graffiti: { id:'graffiti', label:'GRAFFITI', color:'#27ae60', icon:'★', desc:'+2 à la valeur de la carte (affiché et calculé)' },
    detailed: { id:'detailed', label:'DÉTAILLÉ', color:'#2980b9', icon:'◎', desc:'Le croupier s\'arrête 1 point plus tôt par carte détaillée. Annulé par les cartes rétro du croupier.' },
  };

  // ── SIDE BET DEFINITIONS (bonus multipliers for hand patterns) ───────
  const SIDE_BETS = {
    flush3:     { id:'flush3',     label:'FLUSH',       icon:'♥♥♥', color:'#e74c3c', mult:1.5,  desc:'3+ cartes du même symbole (♠, ♥, ♦ ou ♣)' },
    straight3:  { id:'straight3',  label:'SUITE',       icon:'5-6-7', color:'#3498db', mult:1.8,  desc:'3 cartes consécutives (ex: 7-8-9)' },
    threeofkind:{ id:'threeofkind',label:'BRELAN',      icon:'777', color:'#9b59b6', mult:2.5,  desc:'3 cartes de même valeur' },
    sevenset:   { id:'sevenset',   label:'TRIPLE 7',    icon:'777', color:'#f0d078', mult:4.0,  desc:'3 cartes 7 exactement' },
    suitedpair: { id:'suitedpair', label:'PAIRE COLOR.', icon:'♠♠',  color:'#27ae60', mult:1.3,  desc:'2 cartes de même couleur ET même symbole (♠♠, ♥♥...)' },
    perfectpair:{ id:'perfectpair',label:'PAIRE PERF.', icon:'AA',  color:'#ff80ab', mult:2.0,  desc:'2 cartes identiques (même rang ET même couleur)' },
    coloredBJ:  { id:'coloredBJ',  label:'BJ COLORÉ',  icon:'♥A',  color:'#f0d078', mult:1.2,  desc:'Blackjack avec un As et une figure de même couleur' },
  };

  // Spawn probabilities
  const EFFECT_WEIGHTS = { glass:0.08, shiny:0.10, negative:0.08, gold:0.09, multi:0.07, none:0.58 };
  const STYLE_WEIGHTS  = { retro:0.08, graffiti:0.10, detailed:0.08, none:0.74 };

  function weightedRandom(weights) {
    const total = Object.values(weights).reduce((a,b)=>a+b, 0);
    let r = Math.random() * total;
    for (const [key, w] of Object.entries(weights)) { r -= w; if (r <= 0) return key === 'none' ? null : key; }
    return null;
  }

  function assignCardExtras(card) {
    card.effect = weightedRandom(EFFECT_WEIGHTS);
    card.style  = weightedRandom(STYLE_WEIGHTS);
    return card;
  }

  // ── SIDE BET EVALUATION ──────────────────────────────────────────────
  function evaluateSideBets(hand) {
    const faceUp = hand.filter(c => c.faceUp);
    if (faceUp.length < 2) return [];

    const triggered = [];

    // Numeric rank for straight detection — each face card has unique value
    const numRank = c => {
      if (c.rank === 'A')  return 1;
      if (c.rank === 'J')  return 11;
      if (c.rank === 'Q')  return 12;
      if (c.rank === 'K')  return 13;
      return parseInt(c.rank);
    };
    const isRed = c => ['♥','♦'].includes(c.suit);

    // ── Perfect pair: 2 premières cartes, même rang ET même symbole ──────
    // Ex: 7♦ + 7♦
    if (faceUp.length >= 2) {
      const [a,b] = faceUp.slice(0,2);
      if (a.rank === b.rank && a.suit === b.suit) triggered.push('perfectpair');
    }

    // ── Suited pair (paire suitée): 2 premières cartes, même rang, même symbole différent ──
    // En casino : "suited pair" = même RANG + même SYMBOLE → c'est la perfect pair.
    // "Colored pair" = même RANG + même couleur (rouge/rouge ou noir/noir).
    // On implémente : même RANG + même couleur (mais symboles potentiellement différents).
    // Ex: 7♦ + 7♥ (tous les deux rouges, même rang)
    if (faceUp.length >= 2) {
      const [a,b] = faceUp.slice(0,2);
      const sameRank  = a.rank === b.rank;
      const sameColor = isRed(a) === isRed(b);
      const sameSuit  = a.suit === b.suit;
      // Colored pair: même rang, même couleur, symboles différents (sinon c'est perfectpair)
      if (sameRank && sameColor && !sameSuit) triggered.push('suitedpair');
    }

    // ── Flush: 3+ cards of the exact same suit symbol ────────────────────
    if (faceUp.length >= 3) {
      const suitGroups = {};
      faceUp.forEach(c => { suitGroups[c.suit] = (suitGroups[c.suit]||0)+1; });
      if (Object.values(suitGroups).some(v => v >= 3)) triggered.push('flush3');
    }

    // ── Straight: 3+ consecutive ranks among hand cards ─────────────────
    // Uses unique rank values, finds longest consecutive run
    if (faceUp.length >= 3) {
      const uniqueNums = [...new Set(faceUp.map(numRank))].sort((a,b)=>a-b);
      let runLen = 1, best = 1;
      for (let i = 1; i < uniqueNums.length; i++) {
        runLen = uniqueNums[i] === uniqueNums[i-1]+1 ? runLen+1 : 1;
        best = Math.max(best, runLen);
      }
      if (best >= 3) triggered.push('straight3');
    }

    // ── Three of a kind: 3+ cards with same rank ────────────────────────
    if (faceUp.length >= 3) {
      const rankGroups = {};
      faceUp.forEach(c => { rankGroups[c.rank] = (rankGroups[c.rank]||0)+1; });
      if (Object.values(rankGroups).some(v => v >= 3)) triggered.push('threeofkind');
    }

    // Triple 7
    if (faceUp.length >= 3 && faceUp.filter(c=>c.rank==='7').length >= 3) triggered.push('sevenset');

    // Colored BJ (blackjack, ace + face same color)
    if (faceUp.length === 2) {
      const hasAce = faceUp.some(c=>c.rank==='A');
      const hasFace = faceUp.some(c=>['J','Q','K','10'].includes(c.rank));
      if (hasAce && hasFace && handValue(faceUp) === 21) {
        const ace = faceUp.find(c=>c.rank==='A');
        const face = faceUp.find(c=>c!==ace);
        if (isRed(ace) === isRed(face)) triggered.push('coloredBJ');
      }
    }

    return triggered;
  }

  function computeSideBetMultiplier(hand) {
    const bets = evaluateSideBets(hand);
    let mult = 1.0;
    bets.forEach(id => { if(SIDE_BETS[id]) mult *= SIDE_BETS[id].mult; });
    return parseFloat(mult.toFixed(2));
  }

  // ── CARD VALUE COMPUTATION ───────────────────────────────────────────
  function computeCardValue(card) {
    let val = card.value;
    if (card.style === 'graffiti') val += 2;
    if (card.effect === 'negative') val = -Math.abs(val);
    return val;
  }

  function handValue(hand) {
    let val = 0, aces = 0;
    for (const c of hand) {
      if (!c.faceUp) continue;
      const cv = computeCardValue(c);
      val += cv;
      if (c.rank === 'A' && c.effect !== 'negative') aces++;
    }
    while (val > 21 && aces > 0) { val -= 10; aces--; }
    return val;
  }

  function bustThreshold(hand) {
    return 21 + hand.filter(c => c.style === 'retro' && c.faceUp).length;
  }

  function blackjackScore(hand) { return bustThreshold(hand); }
  function isBlackjack(hand)    { return hand.length === 2 && handValue(hand) === blackjackScore(hand); }
  function isBust(hand)         { return handValue(hand) > bustThreshold(hand); }
  function isFiveCardCharlie(hand) { return hand.length >= 5 && !isBust(hand); }

  function dealerThreshold(playerHand, dealerHand) {
    const detailed = playerHand.filter(c => c.style === 'detailed').length;
    const dealerRetro = dealerHand.filter(c => c.style === 'retro').length;
    return Math.max(12, 17 - Math.max(0, detailed - dealerRetro));
  }

  function computeMultiplier(playerHand) {
    let mult = 1.0;
    if (isBlackjack(playerHand)) mult *= 1.5;
    else if (isFiveCardCharlie(playerHand)) mult *= 2.0;
    else if (handValue(playerHand) === blackjackScore(playerHand)) mult *= 1.2;
    const shinyCount = playerHand.filter(c => c.effect === 'shiny').length;
    if (shinyCount > 0) mult *= Math.pow(1.5, shinyCount);
    // Side bets
    const sideMult = computeSideBetMultiplier(playerHand);
    mult *= sideMult;
    return parseFloat(mult.toFixed(2));
  }

  function computeGoldBonus(playerHand, dealerHand, bet) {
    const goldCards = [...playerHand, ...dealerHand].filter(c => c.effect === 'gold').length;
    return Math.floor(bet * 0.10 * goldCards);
  }

  function getHandName(hand) {
    const score = handValue(hand);
    const threshold = bustThreshold(hand);
    if (isBust(hand)) return 'BUST';
    if (isBlackjack(hand)) return 'BLACKJACK!';
    if (isFiveCardCharlie(hand)) return 'MAIN DE 5';
    const bets = evaluateSideBets(hand);
    if (bets.includes('sevenset'))    return 'TRIPLE SEPT!';
    if (bets.includes('threeofkind')) return 'BRELAN!';
    if (bets.includes('straight3'))   return 'SUITE!';
    if (bets.includes('flush3'))      return 'FLUSH!';
    if (score === threshold) return `${threshold} PARFAIT`;
    if (score >= threshold - 3) return 'FORTE';
    if (score >= 13) return 'MOYENNE';
    return 'FAIBLE';
  }

  function getGlassReveal(playerHand, dealerHand) {
    if (!playerHand.some(c => c.effect === 'glass')) return null;
    return dealerHand.find(c => !c.faceUp) || null;
  }

  // ── CANVAS GENERATION ────────────────────────────────────────────────
  const EFFECT_COLORS = { glass:'#7ecfff', shiny:'#ff80ab', negative:'#e74c3c', gold:'#f0d078', multi:'#c39bd3' };
  const STYLE_COLORS  = { retro:'#f39c12', graffiti:'#27ae60', detailed:'#2980b9' };

  function makeFaceCanvas(card) {
    const W = 256, H = 384;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    const isRed = ['♥','♦'].includes(card.suit);
    const baseColor = isRed ? '#c0392b' : '#1a1a2e';
    const effectColor = card.effect ? EFFECT_COLORS[card.effect] : null;
    const styleColor  = card.style  ? STYLE_COLORS[card.style]   : null;

    _drawBackground(ctx, W, H, card);
    _drawBorder(ctx, W, H, effectColor, styleColor);

    const displayRank  = card.style === 'graffiti' ? _graffitiRank(card.rank) : card.rank;
    const displayColor = card.effect === 'negative' ? '#e74c3c' : baseColor;

    // Corner rank/suit
    ctx.font = 'bold 50px Georgia,serif'; ctx.fillStyle = displayColor;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(displayRank, 18, 12);
    ctx.font = '34px serif'; ctx.fillText(card.suit, 22, 62);
    ctx.save(); ctx.translate(W, H); ctx.rotate(Math.PI);
    ctx.font = 'bold 50px Georgia,serif'; ctx.fillStyle = displayColor;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(displayRank, 18, 12);
    ctx.font = '34px serif'; ctx.fillText(card.suit, 22, 62);
    ctx.restore();

    // Center
    _drawCenter(ctx, W, H, card, displayColor, baseColor);

    // Face card label
    if (['J','Q','K'].includes(card.rank)) {
      const labels = {J:'VALET',Q:'DAME',K:'ROI'};
      ctx.font = 'italic bold 18px Georgia,serif';
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(labels[card.rank], W/2, H-16);
    }

    if (card.effect) _drawEffectOverlay(ctx, W, H, card.effect, effectColor);
    if (card.style)  _drawStyleBadge(ctx, W, H, card.style, styleColor);

    return cv;
  }

  function _drawCenter(ctx, W, H, card, displayColor, baseColor) {
    switch(card.effect) {
      case 'glass':
        // Frosted glass — translucent layered look
        ctx.fillStyle = 'rgba(126,207,255,0.08)';
        ctx.fillRect(30, 90, W-60, H-180);
        // Center suit with refraction shimmer
        ctx.font = '100px serif'; ctx.fillStyle = displayColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.3; ctx.fillText(card.suit, W/2-3, H/2+3);
        ctx.globalAlpha = 0.7; ctx.fillText(card.suit, W/2, H/2);
        ctx.globalAlpha = 1;
        // Horizontal light streak
        const glassGrd = ctx.createLinearGradient(30, H/2-8, W-30, H/2-8);
        glassGrd.addColorStop(0, 'transparent');
        glassGrd.addColorStop(0.4, 'rgba(126,207,255,0.5)');
        glassGrd.addColorStop(0.6, 'rgba(255,255,255,0.8)');
        glassGrd.addColorStop(1, 'transparent');
        ctx.fillStyle = glassGrd;
        ctx.fillRect(30, H/2-8, W-60, 16);
        break;

      case 'shiny':
        // Normal suit + sparkle stars
        ctx.font = '100px serif'; ctx.fillStyle = displayColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.88; ctx.fillText(card.suit, W/2, H/2); ctx.globalAlpha = 1;
        // Draw 8-pointed stars around suit
        const starPositions = [[W/2-55,H/2-55],[W/2+52,H/2-50],[W/2-50,H/2+52],[W/2+55,H/2+55],[W/2,H/2-70]];
        starPositions.forEach(([sx,sy],i) => {
          ctx.fillStyle = '#ff80ab';
          ctx.globalAlpha = 0.7 + (i%2)*0.3;
          _drawStar(ctx, sx, sy, 8+i*2, 4+i);
          ctx.globalAlpha = 1;
        });
        break;

      case 'negative':
        // Inverted colors — dark bg for suit
        ctx.font = '100px serif';
        ctx.fillStyle = baseColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.4; ctx.fillText(card.suit, W/2, H/2); ctx.globalAlpha = 1;
        // Red X
        ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(W/2-28, H/2-28); ctx.lineTo(W/2+28, H/2+28); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W/2+28, H/2-28); ctx.lineTo(W/2-28, H/2+28); ctx.stroke();
        break;

      case 'gold':
        // Gold sheen + suit
        const goldGrd = ctx.createRadialGradient(W/2, H/2, 10, W/2, H/2, 80);
        goldGrd.addColorStop(0, 'rgba(240,208,120,0.4)');
        goldGrd.addColorStop(1, 'rgba(240,208,120,0)');
        ctx.fillStyle = goldGrd; ctx.fillRect(0, 0, W, H);
        ctx.font = '100px serif'; ctx.fillStyle = displayColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.88; ctx.fillText(card.suit, W/2, H/2); ctx.globalAlpha = 1;
        // Gold coin icon top-right
        ctx.beginPath(); ctx.arc(W-40, 50, 18, 0, Math.PI*2);
        ctx.fillStyle = '#f0d078'; ctx.fill();
        ctx.strokeStyle = '#b7770d'; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = 'bold 14px Georgia,serif'; ctx.fillStyle = '#7a5000';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('$', W-40, 50);
        break;

      case 'multi':
        // Rainbow gradient suit
        const rainbowColors = ['#e74c3c','#f39c12','#2ecc71','#3498db','#9b59b6'];
        ctx.font = '100px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        rainbowColors.forEach((col, i) => {
          ctx.fillStyle = col;
          ctx.globalAlpha = 0.25;
          ctx.fillText(card.suit, W/2 + Math.cos(i/5*Math.PI*2)*6, H/2 + Math.sin(i/5*Math.PI*2)*6);
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = displayColor;
        ctx.fillText(card.suit, W/2, H/2);
        break;

      default:
        ctx.font = '110px serif'; ctx.fillStyle = displayColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.88; ctx.fillText(card.suit, W/2, H/2); ctx.globalAlpha = 1;
    }
  }

  function _drawStar(ctx, cx, cy, outer, inner) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(cx + r*Math.cos(angle), cy + r*Math.sin(angle));
      else ctx.lineTo(cx + r*Math.cos(angle), cy + r*Math.sin(angle));
    }
    ctx.closePath(); ctx.fill();
  }

  function _graffitiRank(rank) {
    const numeric = { A:1, J:11, Q:12, K:13 };
    const n = numeric[rank] || parseInt(rank);
    const v = n + 2;
    if (v >= 14) return 'A'; if (v === 13) return 'K'; if (v === 12) return 'Q'; if (v === 11) return 'J';
    return String(v);
  }

  function _drawBackground(ctx, W, H, card) {
    let bg = '#f5ead0';
    if (card.style === 'retro')    bg = '#fff8e8';
    if (card.style === 'graffiti') bg = '#f0fff0';
    if (card.style === 'detailed') bg = '#eef4ff';
    if (card.effect === 'negative') bg = '#fff0f0';
    if (card.effect === 'glass')    bg = '#eef8ff';

    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, _lighten(bg, -10));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

    if (card.style === 'retro') {
      ctx.globalAlpha = 0.04;
      for (let y = 0; y < H; y += 4) { ctx.fillStyle='#000'; ctx.fillRect(0,y,W,2); }
      ctx.globalAlpha = 1;
    }
    if (card.style === 'graffiti') {
      ctx.globalAlpha = 0.08;
      ['#27ae60','#e74c3c','#f39c12','#3498db'].forEach((c,i) => {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(40+i*55, 180+Math.sin(i)*30, 18+i*4, 0, Math.PI*2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    if (card.style === 'detailed') {
      ctx.strokeStyle = 'rgba(41,128,185,0.07)'; ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 10) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y = 0; y < H; y += 10) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    }
    if (card.effect === 'glass') {
      // Glass: diagonal light lines
      ctx.globalAlpha = 0.07;
      ctx.strokeStyle = '#7ecfff'; ctx.lineWidth = 8;
      for (let i = -H; i < W+H; i += 50) {
        ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i+H,H); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (card.effect === 'negative') {
      // Negative: subtle invert pattern
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = '#e74c3c';
      for (let y = 0; y < H; y += 20) { ctx.fillRect(0,y,W,10); }
      ctx.globalAlpha = 1;
    }
  }

  function _drawBorder(ctx, W, H, effectColor, styleColor) {
    ctx.strokeStyle = '#c9a84c'; ctx.lineWidth = 5;
    ctx.strokeRect(7, 7, W-14, H-14);
    if (effectColor) {
      ctx.strokeStyle = effectColor; ctx.lineWidth = 2.5;
      ctx.strokeRect(13, 13, W-26, H-26);
      [[14,14],[W-14,14],[14,H-14],[W-14,H-14]].forEach(([cx,cy]) => {
        const grd = ctx.createRadialGradient(cx,cy,0,cx,cy,22);
        grd.addColorStop(0, effectColor+'70'); grd.addColorStop(1,'transparent');
        ctx.fillStyle = grd; ctx.fillRect(0,0,W,H);
      });
    } else {
      ctx.strokeStyle = 'rgba(201,168,76,0.3)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(13,13,W-26,H-26);
    }
    if (styleColor) {
      ctx.fillStyle = styleColor+'35';
      ctx.fillRect(7, H-32, W-14, 25);
    }
  }

  function _drawEffectOverlay(ctx, W, H, effect, color) {
    const LABELS = { glass:'◈ VERRE', shiny:'✦ BRILLANT', negative:'⊖ NÉGATIF', gold:'◉ OR', multi:'❋ MULTI' };
    const label = LABELS[effect];
    ctx.font = 'bold 12px monospace';
    const tw = ctx.measureText(label).width;
    const px = W/2-tw/2-7, py = H-30;
    ctx.fillStyle = color+'cc'; _roundRect(ctx,px,py,tw+14,17,3); ctx.fill();
    ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label, W/2, py+8);
  }

  function _drawStyleBadge(ctx, W, H, style, color) {
    const LABELS = { retro:'▶ RÉTRO', graffiti:'★ GRAFF', detailed:'◎ DÉTAIL' };
    const label = LABELS[style];
    ctx.font = 'bold 10px monospace';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = color+'aa'; _roundRect(ctx,12,H-48,tw+10,14,2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(label, 17, H-41);
  }

  function makeBackCanvas() {
    const W=256,H=384;
    const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
    const ctx=cv.getContext('2d');
    ctx.fillStyle='#0d1a3a'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#c9a84c'; ctx.lineWidth=6; ctx.strokeRect(8,8,W-16,H-16);
    ctx.strokeStyle='rgba(201,168,76,0.4)'; ctx.lineWidth=2; ctx.strokeRect(16,16,W-32,H-32);
    ctx.strokeStyle='rgba(201,168,76,0.18)'; ctx.lineWidth=1;
    for(let x=-H;x<W+H;x+=24){
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+H,H);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x-H,H);ctx.stroke();
    }
    ctx.save();ctx.translate(W/2,H/2);ctx.rotate(Math.PI/4);
    ctx.fillStyle='rgba(201,168,76,0.15)';ctx.fillRect(-28,-28,56,56);
    ctx.strokeStyle='#c9a84c';ctx.lineWidth=2;ctx.strokeRect(-28,-28,56,56);
    ctx.restore();
    ctx.font='bold italic 28px Georgia,serif';ctx.fillStyle='rgba(201,168,76,0.7)';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('BJ',W/2,H/2);
    return cv;
  }

  function makeGlassBackCanvas(card) {
    const cv=makeBackCanvas();
    const W=256,H=384;
    const ctx=cv.getContext('2d');
    ctx.fillStyle='rgba(126,207,255,0.25)'; ctx.fillRect(0,0,W,H);
    // Diagonal glass streaks
    ctx.strokeStyle='rgba(200,240,255,0.3)'; ctx.lineWidth=12;
    for(let i=-H;i<W+H;i+=60){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+H,H);ctx.stroke();}
    ctx.font='bold 42px Georgia,serif';ctx.fillStyle='#7ecfff';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.shadowColor='#7ecfff';ctx.shadowBlur=20;
    ctx.fillText(card.rank+card.suit,W/2,H/2);
    ctx.shadowBlur=0;
    return cv;
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
    ctx.closePath();
  }

  function _lighten(hex, amount) {
    const num = parseInt(hex.replace('#',''), 16);
    const r=Math.min(255,(num>>16)+amount);
    const g=Math.min(255,((num>>8)&0xff)+amount);
    const b=Math.min(255,(num&0xff)+amount);
    return `rgb(${r},${g},${b})`;
  }

  return {
    EFFECTS, STYLES, SIDE_BETS,
    assignCardExtras, computeCardValue, handValue,
    bustThreshold, blackjackScore, isBlackjack, isBust, isFiveCardCharlie,
    dealerThreshold, computeMultiplier, computeGoldBonus,
    evaluateSideBets, computeSideBetMultiplier,
    getHandName, getGlassReveal,
    makeFaceCanvas, makeBackCanvas, makeGlassBackCanvas,
  };
})();
