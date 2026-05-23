// ============================================================
//  MAIN — Boot sequence
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Pass hover callback from Renderer → View
  Renderer.init((hoverData) => {
    if (hoverData && hoverData.card && hoverData.card.faceUp) {
      View.showCardTooltip(hoverData);
    } else {
      View.hideCardTooltip();
    }
  });

  View.updateAll();
  console.log('BlackJack Balatro — chargé');
});
