// ============================================================
//  RENDERER — Three.js scene, card meshes, animations, hover tooltip
// ============================================================

const Renderer = window.Renderer = (() => {
  let scene, camera, renderer;
  const cardMeshes = { player: [], dealer: [] };
  let particles = [];
  let tableGroup;
  const clock = new THREE.Clock();
  const CARD_W = 1.4, CARD_H = 2.0, CARD_DEPTH = 0.04;

  // Raycasting for hover
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let hoveredCard = null;
  let onCardHoverCb = null; // callback(cardData | null)

  // ── MESH BUILDERS ────────────────────────────────────────────────────
  function _makeTex(canvas) { return new THREE.CanvasTexture(canvas); }

  function _buildMesh(faceTex, backTex, faceUp) {
    const edgeMat = new THREE.MeshPhongMaterial({ color: 0xd4c5a0 });
    const faceMat = new THREE.MeshPhongMaterial({ map: faceTex });
    const backMat = new THREE.MeshPhongMaterial({ map: backTex });
    const geo = new THREE.BoxGeometry(CARD_W, CARD_DEPTH, CARD_H);
    const mats = [edgeMat,edgeMat, faceUp?faceMat:backMat, faceUp?backMat:faceMat, edgeMat,edgeMat];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  function createCardMesh(card, faceUp, glassRevealed=false) {
    const group = new THREE.Group();
    const faceCanvas = Cards.makeFaceCanvas(card);
    const backCanvas = glassRevealed ? Cards.makeGlassBackCanvas(card) : Cards.makeBackCanvas();
    const mesh = _buildMesh(_makeTex(faceCanvas), _makeTex(backCanvas), faceUp);
    group.add(mesh);

    // Effect glow plane
    const glowColor = card.effect
      ? parseInt(Cards.EFFECTS[card.effect].color.replace('#',''), 16)
      : (faceUp ? (['♥','♦'].includes(card.suit)?0xc0392b:0x1a3a6a) : 0x000000);
    const glowOpacity = card.effect ? 0.22 : 0.1;
    if (faceUp || glassRevealed) {
      const glowGeo = new THREE.PlaneGeometry(CARD_W+0.1, CARD_H+0.1);
      const glowMat = new THREE.MeshBasicMaterial({ color:glowColor, transparent:true, opacity:glowOpacity, side:THREE.DoubleSide });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = Math.PI/2; glow.position.y = -CARD_DEPTH/2-0.005;
      group.add(glow);
    }

    // For glass effect: add a 3D glass shard plane above the card
    if (card.effect === 'glass' && faceUp) {
      const glassGeo = new THREE.PlaneGeometry(CARD_W-0.1, CARD_H-0.1);
      const glassMat = new THREE.MeshPhongMaterial({
        color: 0x7ecfff, transparent: true, opacity: 0.15,
        side: THREE.DoubleSide, shininess: 200, specular: 0xffffff
      });
      const glassMesh = new THREE.Mesh(glassGeo, glassMat);
      glassMesh.rotation.x = Math.PI/2; glassMesh.position.y = CARD_DEPTH/2 + 0.01;
      group.add(glassMesh);
    }

    group.userData = {
      card, faceUp, isPlayerCard: false, cardIndex: -1,
      targetPos: new THREE.Vector3(), targetRot: new THREE.Euler(), speed: 8,
    };
    return group;
  }

  // ── POSITION ─────────────────────────────────────────────────────────
  function getCardPosition(index, total, isDealer) {
    const spacing = Math.min(1.6, 8/Math.max(total,1));
    const x = -(total-1)*spacing/2 + index*spacing;
    return new THREE.Vector3(x, -0.46, isDealer ? -2.5 : 2.5);
  }

  function repositionCards() {
    cardMeshes.player.forEach((m,i) => {
      m.userData.targetPos = getCardPosition(i, cardMeshes.player.length, false);
      m.userData.isPlayerCard = true; m.userData.cardIndex = i;
    });
    cardMeshes.dealer.forEach((m,i) => {
      m.userData.targetPos = getCardPosition(i, cardMeshes.dealer.length, true);
      m.userData.isPlayerCard = false; m.userData.cardIndex = i;
    });
  }

  // ── PUBLIC ACTIONS ────────────────────────────────────────────────────
  function dealCard(card, index, total, isDealer, glassRevealed=false) {
    const mesh = createCardMesh(card, card.faceUp, glassRevealed);
    mesh.position.set(0, 5, 0);
    mesh.rotation.set(0, Math.random()*Math.PI*2, Math.random()*0.3-0.15);
    mesh.userData.targetPos = getCardPosition(index, total, isDealer).clone();
    mesh.userData.targetRot = new THREE.Euler(0,0,0);
    mesh.userData.isPlayerCard = !isDealer;
    mesh.userData.cardIndex = index;
    scene.add(mesh);
    if (isDealer) cardMeshes.dealer.push(mesh);
    else cardMeshes.player.push(mesh);
    return mesh;
  }

  function revealDealerCard(index, card) {
    const mesh = cardMeshes.dealer[index];
    if (!mesh) return;
    mesh.userData.card = card;
    mesh.userData.faceUp = true;
    mesh.userData.flipping = true;
    mesh.userData.flipProgress = 0;
    mesh.userData.flipDone = false;
    mesh.userData.flipCanvas = Cards.makeFaceCanvas(card);
  }

  function updateGlassReveal(index, card) {
    const mesh = cardMeshes.dealer[index];
    if (!mesh) return;
    const inner = mesh.children[0];
    if (!inner) return;
    inner.material[2] = new THREE.MeshPhongMaterial({ map: _makeTex(Cards.makeGlassBackCanvas(card)) });
  }

  function removePlayerCard(index) {
    const mesh = cardMeshes.player[index];
    if (!mesh) return;
    mesh.userData.discarding = true;
    mesh.userData.discardVel = new THREE.Vector3((Math.random()-0.5)*3, 4+Math.random()*2, -3-Math.random()*2);
    setTimeout(() => { scene.remove(mesh); cardMeshes.player.splice(index,1); repositionCards(); }, 700);
  }

  function highlightCard(index, on) {
    const mesh = cardMeshes.player[index];
    if (!mesh) return;
    const inner = mesh.children[0];
    if (!inner || !Array.isArray(inner.material)) return;
    [0,1,4,5].forEach(i => inner.material[i]?.color.setHex(on ? 0x9b59b6 : 0xd4c5a0));
    mesh.scale.setScalar(on ? 1.07 : 1.0);
  }

  function clearCards(cb) {
    [...cardMeshes.player, ...cardMeshes.dealer].forEach(m => {
      m.userData.clearing = true;
      m.userData.clearVel = new THREE.Vector3((Math.random()-0.5)*2, 3+Math.random()*2, (Math.random()-0.5)*2);
    });
    setTimeout(() => {
      [...cardMeshes.player, ...cardMeshes.dealer].forEach(m => scene.remove(m));
      cardMeshes.player.length = 0; cardMeshes.dealer.length = 0;
      if (cb) cb();
    }, 820);
  }

  function winBurst(color=0xc9a84c, count=60) {
    for (let i=0;i<count;i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,0.08), new THREE.MeshBasicMaterial({color}));
      p.position.set((Math.random()-0.5)*2,0,(Math.random()-0.5)*2);
      p.userData.vel = new THREE.Vector3((Math.random()-0.5)*4, 2+Math.random()*4, (Math.random()-0.5)*4);
      p.userData.isBurst = true;
      scene.add(p);
      setTimeout(() => scene.remove(p), 1600);
    }
  }

  // ── INIT ─────────────────────────────────────────────────────────────
  function init(hoverCallback) {
    onCardHoverCb = hoverCallback || null;
    const canvas = document.getElementById('three-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.06);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 100);
    camera.position.set(0,7,10); camera.lookAt(0,0,0);

    _buildTable(); _buildLights(); _buildParticles();
    window.addEventListener('resize', _onResize);
    canvas.addEventListener('mousemove', _onMouseMove);
    _animate();
  }

  function _buildTable() {
    tableGroup = new THREE.Group();
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(20,14), new THREE.MeshLambertMaterial({color:0x1a4a2e}));
    felt.rotation.x=-Math.PI/2; felt.position.y=-0.5; felt.receiveShadow=true; tableGroup.add(felt);
    const border = new THREE.Mesh(new THREE.TorusGeometry(7.5,0.3,8,60), new THREE.MeshPhongMaterial({color:0x5a3a1a,shininess:80}));
    border.rotation.x=Math.PI/2; border.position.y=-0.4; tableGroup.add(border);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(14,0.04), new THREE.MeshBasicMaterial({color:0xc9a84c,transparent:true,opacity:0.4}));
    line.rotation.x=-Math.PI/2; line.position.y=-0.49; tableGroup.add(line);
    for(let a=0;a<8;a++){
      const angle=(a/8)*Math.PI*2;
      const c=new THREE.Mesh(new THREE.CircleGeometry(0.15,32),new THREE.MeshBasicMaterial({color:0xc9a84c,transparent:true,opacity:0.3}));
      c.rotation.x=-Math.PI/2; c.position.set(Math.cos(angle)*6,-0.49,Math.sin(angle)*5); tableGroup.add(c);
    }
    scene.add(tableGroup);
  }

  function _buildLights() {
    scene.add(new THREE.AmbientLight(0x1a1a2e, 0.8));
    const spot=new THREE.SpotLight(0xfff5d0,2.5,25,Math.PI/4,0.4);
    spot.position.set(0,12,3); spot.castShadow=true; spot.shadow.mapSize.set(2048,2048);
    scene.add(spot); scene.add(spot.target);
    const gl1=new THREE.PointLight(0xc9a84c,0.8,15); gl1.position.set(-5,3,0); scene.add(gl1);
    const gl2=new THREE.PointLight(0xc9a84c,0.8,15); gl2.position.set(5,3,0);  scene.add(gl2);
  }

  function _buildParticles() {
    const count=200, geo=new THREE.BufferGeometry();
    const pos=new Float32Array(count*3), speeds=[];
    for(let i=0;i<count;i++){
      pos[i*3]=(Math.random()-0.5)*20; pos[i*3+1]=Math.random()*10-2; pos[i*3+2]=(Math.random()-0.5)*14;
      speeds.push(0.003+Math.random()*0.007);
    }
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const pts=new THREE.Points(geo,new THREE.PointsMaterial({color:0xc9a84c,size:0.04,transparent:true,opacity:0.4}));
    scene.add(pts); particles.push({mesh:pts,speeds});
  }

  // ── HOVER RAYCASTING ─────────────────────────────────────────────────
  function _onMouseMove(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX-rect.left)/rect.width)*2-1;
    mouse.y = -((e.clientY-rect.top)/rect.height)*2+1;
  }

  function _checkHover() {
    raycaster.setFromCamera(mouse, camera);
    const allCards = [...cardMeshes.player, ...cardMeshes.dealer];
    // Get all inner meshes for raycasting
    const targets = allCards.flatMap(g => g.children.filter(c => c.isMesh && c.geometry.type === 'BoxGeometry'));
    const hits = raycaster.intersectObjects(targets);

    if (hits.length > 0) {
      // Find parent group
      const hitMesh = hits[0].object;
      const group = allCards.find(g => g.children.includes(hitMesh));
      if (group && group !== hoveredCard) {
        hoveredCard = group;
        if (onCardHoverCb && group.userData.card && group.userData.faceUp) {
          onCardHoverCb({ card: group.userData.card, isPlayer: group.userData.isPlayerCard });
        }
      }
    } else {
      if (hoveredCard) {
        hoveredCard = null;
        if (onCardHoverCb) onCardHoverCb(null);
      }
    }
  }

  // ── ANIMATE ──────────────────────────────────────────────────────────
  function _animate() {
    requestAnimationFrame(_animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();

    if (tableGroup) tableGroup.rotation.y = Math.sin(elapsed*0.05)*0.02;

    particles.forEach(p => {
      const pos = p.mesh.geometry.attributes.position;
      for(let i=0;i<pos.count;i++){
        pos.array[i*3+1] += p.speeds[i]*dt*30;
        if(pos.array[i*3+1]>10) pos.array[i*3+1]=-2;
      }
      pos.needsUpdate=true; p.mesh.rotation.y+=dt*0.02;
    });

    [...cardMeshes.player, ...cardMeshes.dealer].forEach(mesh => _animateCard(mesh, dt, elapsed));

    _checkHover();
    renderer.render(scene, camera);
  }

  function _animateCard(mesh, dt, elapsed) {
    if (mesh.userData.clearing) {
      mesh.userData.clearVel.y-=dt*9;
      mesh.position.add(mesh.userData.clearVel.clone().multiplyScalar(dt));
      mesh.rotation.x+=dt*5; mesh.rotation.z+=dt*3; return;
    }
    if (mesh.userData.discarding) {
      mesh.userData.discardVel.y-=dt*9;
      mesh.position.add(mesh.userData.discardVel.clone().multiplyScalar(dt));
      mesh.rotation.x+=dt*6; mesh.rotation.z-=dt*4; return;
    }

    const hover = Math.sin(elapsed*2+mesh.position.x)*0.015;
    if (mesh.userData.targetPos) {
      const tp=mesh.userData.targetPos.clone(); tp.y+=hover;
      mesh.position.lerp(tp,dt*(mesh.userData.speed||5));
    }
    if (mesh.userData.targetRot) {
      const tr=mesh.userData.targetRot;
      mesh.rotation.x+=(tr.x-mesh.rotation.x)*dt*6;
      mesh.rotation.y+=(tr.y-mesh.rotation.y)*dt*6;
      mesh.rotation.z+=(tr.z-mesh.rotation.z)*dt*6;
    }

    const card = mesh.userData.card;

    // ── Effect-specific animations ──
    if (card && mesh.userData.faceUp) {
      const glow = mesh.children[1];

      // Shiny: pulsing pink glow + star particle spawning
      if (card.effect === 'shiny' && glow?.material) {
        glow.material.opacity = 0.15 + Math.sin(elapsed*4+mesh.position.x)*0.12;
        glow.material.color.setHSL(0.9, 1, 0.5+Math.sin(elapsed*3)*0.1);
      }
      // Gold: golden shimmer
      if (card.effect === 'gold' && glow?.material) {
        glow.material.opacity = 0.1+Math.abs(Math.sin(elapsed*2))*0.18;
        glow.material.color.setHSL(0.13, 1, 0.5+Math.abs(Math.sin(elapsed*2))*0.15);
      }
      // Glass: refraction wobble on glass layer (children[2])
      if (card.effect === 'glass' && mesh.children[2]?.material) {
        mesh.children[2].material.opacity = 0.08+Math.sin(elapsed*3+mesh.position.x)*0.07;
        mesh.children[2].rotation.z = Math.sin(elapsed*0.5)*0.02;
      }
      // Negative: red pulse
      if (card.effect === 'negative' && glow?.material) {
        glow.material.opacity = 0.15+Math.sin(elapsed*5)*0.1;
        glow.material.color.setHex(0xe74c3c);
      }
      // Multi: cycling hue
      if (card.effect === 'multi' && glow?.material) {
        glow.material.color.setHSL((elapsed*0.2)%1, 1, 0.6);
        glow.material.opacity = 0.2;
      }

      // Lift card slightly if hovered
      if (mesh === hoveredCard && mesh.userData.targetPos) {
        mesh.position.y = mesh.userData.targetPos.y + hover + 0.18;
      }
    }

    // Flip animation
    if (mesh.userData.flipping) {
      mesh.userData.flipProgress+=dt*2.2;
      const prog=mesh.userData.flipProgress;
      if(mesh.userData.targetPos){
        const lift=Math.sin(Math.min(prog,1)*Math.PI)*0.7;
        mesh.position.y=mesh.userData.targetPos.y+lift;
      }
      mesh.rotation.x=Math.PI*prog;
      if(prog>=0.5&&!mesh.userData.flipDone){
        mesh.userData.flipDone=true;
        const faceTex=_makeTex(mesh.userData.flipCanvas||Cards.makeFaceCanvas(mesh.userData.card));
        const inner=mesh.children[0];
        if(inner&&Array.isArray(inner.material)) inner.material[2]=new THREE.MeshPhongMaterial({map:faceTex});
      }
      if(prog>=1){
        mesh.userData.flipping=false; mesh.userData.faceUp=true;
        mesh.rotation.x=0; mesh.rotation.y=0;
      }
    }
  }

  function _onResize() {
    camera.aspect=window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
  }

  return {
    init, dealCard, revealDealerCard, updateGlassReveal,
    repositionCards, removePlayerCard, highlightCard, clearCards, winBurst,
  };
})();
