// ============================================================
//  RENDERER — Three.js scene, card meshes, animations
// ============================================================

const Renderer = (() => {
  let scene, camera, renderer;
  const cardMeshes = { player: [], dealer: [] };
  let particles = [];
  let tableGroup;
  const clock = new THREE.Clock();
  const CARD_W = 1.4, CARD_H = 2.0, CARD_DEPTH = 0.04;

  // ── CARD MESH CREATION ───────────────────────────────────────────────
  function _makeTex(canvas) {
    return new THREE.CanvasTexture(canvas);
  }

  function _buildMesh(faceTex, backTex, faceUp) {
    const edgeMat = new THREE.MeshPhongMaterial({ color: 0xd4c5a0 });
    const faceMat = new THREE.MeshPhongMaterial({ map: faceTex });
    const backMat = new THREE.MeshPhongMaterial({ map: backTex });
    const geo = new THREE.BoxGeometry(CARD_W, CARD_DEPTH, CARD_H);
    // +Y faces camera (material index 2), -Y faces table (index 3)
    const mats = [edgeMat, edgeMat, faceUp ? faceMat : backMat, faceUp ? backMat : faceMat, edgeMat, edgeMat];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  function createCardMesh(card, faceUp, glassRevealed = false) {
    const group = new THREE.Group();

    const faceCanvas = Cards.makeFaceCanvas(card, false);
    // If glass revealed and card is hidden: show modified back
    const backCanvas = glassRevealed
      ? Cards.makeGlassBackCanvas(card)
      : Cards.makeBackCanvas();

    const faceTex = _makeTex(faceCanvas);
    const backTex = _makeTex(backCanvas);

    const mesh = _buildMesh(faceTex, backTex, faceUp);
    group.add(mesh);

    // Glow plane based on effect
    const glowColor = card.effect
      ? parseInt(Cards.EFFECTS[card.effect].color.replace('#',''), 16)
      : (faceUp ? (['♥','♦'].includes(card.suit) ? 0xc0392b : 0x1a3a6a) : 0x000000);

    const glowOpacity = card.effect ? 0.2 : 0.1;
    if (faceUp || glassRevealed) {
      const glowGeo = new THREE.PlaneGeometry(CARD_W+0.08, CARD_H+0.08);
      const glowMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: glowOpacity, side: THREE.DoubleSide });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = Math.PI/2; glow.position.y = -CARD_DEPTH/2 - 0.005;
      group.add(glow);
    }

    group.userData = {
      card, faceUp,
      targetPos: new THREE.Vector3(),
      targetRot: new THREE.Euler(),
      speed: 8,
      glowMesh: group.children[1] || null,
    };
    return group;
  }

  // ── POSITION HELPERS ─────────────────────────────────────────────────
  function getCardPosition(index, total, isDealer) {
    const spacing = Math.min(1.6, 8/Math.max(total, 1));
    const x = -(total-1)*spacing/2 + index*spacing;
    return new THREE.Vector3(x, -0.46, isDealer ? -2.5 : 2.5);
  }

  function repositionCards() {
    cardMeshes.player.forEach((m,i) => { m.userData.targetPos = getCardPosition(i, cardMeshes.player.length, false); });
    cardMeshes.dealer.forEach((m,i) => { m.userData.targetPos = getCardPosition(i, cardMeshes.dealer.length, true); });
  }

  // ── PUBLIC CARD ACTIONS ──────────────────────────────────────────────
  function dealCard(card, index, total, isDealer, glassRevealed = false) {
    const mesh = createCardMesh(card, card.faceUp, glassRevealed);
    mesh.position.set(0, 5, 0);
    mesh.rotation.set(0, Math.random()*Math.PI*2, Math.random()*0.3-0.15);
    mesh.userData.targetPos = getCardPosition(index, total, isDealer).clone();
    mesh.userData.targetRot = new THREE.Euler(0, 0, 0);
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
    mesh.userData.flipCanvas = Cards.makeFaceCanvas(card, false);
  }

  // Update dealer hidden card back to glass-revealed version
  function updateGlassReveal(index, card) {
    const mesh = cardMeshes.dealer[index];
    if (!mesh) return;
    const innerMesh = mesh.children[0];
    if (!innerMesh) return;
    const glassTex = _makeTex(Cards.makeGlassBackCanvas(card));
    innerMesh.material[2] = new THREE.MeshPhongMaterial({ map: glassTex });
  }

  function removePlayerCard(index) {
    const mesh = cardMeshes.player[index];
    if (!mesh) return;
    mesh.userData.discarding = true;
    mesh.userData.discardVel = new THREE.Vector3((Math.random()-0.5)*3, 4+Math.random()*2, -3-Math.random()*2);
    setTimeout(() => { scene.remove(mesh); cardMeshes.player.splice(index, 1); repositionCards(); }, 700);
  }

  function highlightCard(index, on) {
    const mesh = cardMeshes.player[index];
    if (!mesh) return;
    const inner = mesh.children[0];
    if (!inner || !Array.isArray(inner.material)) return;
    const color = on ? 0x9b59b6 : 0xd4c5a0;
    [0,1,4,5].forEach(i => inner.material[i] && inner.material[i].color.setHex(color));
    mesh.scale.setScalar(on ? 1.07 : 1.0);
  }

  function clearCards(cb) {
    [...cardMeshes.player, ...cardMeshes.dealer].forEach(m => {
      m.userData.clearing = true;
      m.userData.clearVel = new THREE.Vector3((Math.random()-0.5)*2, 3+Math.random()*2, (Math.random()-0.5)*2);
    });
    setTimeout(() => {
      [...cardMeshes.player, ...cardMeshes.dealer].forEach(m => scene.remove(m));
      cardMeshes.player.length = 0;
      cardMeshes.dealer.length = 0;
      if (cb) cb();
    }, 820);
  }

  function winBurst(color = 0xc9a84c, count = 60) {
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.08),
        new THREE.MeshBasicMaterial({ color })
      );
      p.position.set((Math.random()-0.5)*2, 0, (Math.random()-0.5)*2);
      p.userData.vel = new THREE.Vector3((Math.random()-0.5)*4, 2+Math.random()*4, (Math.random()-0.5)*4);
      p.userData.isBurst = true;
      scene.add(p);
      setTimeout(() => scene.remove(p), 1500);
    }
  }

  // ── SCENE SETUP ──────────────────────────────────────────────────────
  function init() {
    const canvas = document.getElementById('three-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.06);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 100);
    camera.position.set(0, 7, 10);
    camera.lookAt(0, 0, 0);

    _buildTable();
    _buildLights();
    _buildParticles();

    window.addEventListener('resize', _onResize);
    _animate();
  }

  function _buildTable() {
    tableGroup = new THREE.Group();
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(20,14), new THREE.MeshLambertMaterial({ color: 0x1a4a2e }));
    felt.rotation.x = -Math.PI/2; felt.position.y = -0.5; felt.receiveShadow = true;
    tableGroup.add(felt);
    const border = new THREE.Mesh(new THREE.TorusGeometry(7.5,0.3,8,60), new THREE.MeshPhongMaterial({ color: 0x5a3a1a, shininess:80 }));
    border.rotation.x = Math.PI/2; border.position.y = -0.4;
    tableGroup.add(border);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(14,0.04), new THREE.MeshBasicMaterial({ color:0xc9a84c, transparent:true, opacity:0.4 }));
    line.rotation.x = -Math.PI/2; line.position.y = -0.49;
    tableGroup.add(line);
    for (let a = 0; a < 8; a++) {
      const angle = (a/8)*Math.PI*2;
      const circ = new THREE.Mesh(new THREE.CircleGeometry(0.15,32), new THREE.MeshBasicMaterial({ color:0xc9a84c, transparent:true, opacity:0.3 }));
      circ.rotation.x = -Math.PI/2; circ.position.set(Math.cos(angle)*6, -0.49, Math.sin(angle)*5);
      tableGroup.add(circ);
    }
    scene.add(tableGroup);
  }

  function _buildLights() {
    scene.add(new THREE.AmbientLight(0x1a1a2e, 0.8));
    const spot = new THREE.SpotLight(0xfff5d0, 2.5, 25, Math.PI/4, 0.4);
    spot.position.set(0,12,3); spot.castShadow = true; spot.shadow.mapSize.set(2048,2048);
    scene.add(spot); scene.add(spot.target);
    scene.add(Object.assign(new THREE.PointLight(0xc9a84c, 0.8, 15), { position: new THREE.Vector3(-5,3,0) }));
    scene.add(Object.assign(new THREE.PointLight(0xc9a84c, 0.8, 15), { position: new THREE.Vector3(5,3,0) }));
  }

  function _buildParticles() {
    const count = 200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count*3);
    const speeds = [];
    for (let i = 0; i < count; i++) {
      pos[i*3]   = (Math.random()-0.5)*20;
      pos[i*3+1] = Math.random()*10-2;
      pos[i*3+2] = (Math.random()-0.5)*14;
      speeds.push(0.003 + Math.random()*0.007);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color:0xc9a84c, size:0.04, transparent:true, opacity:0.4 }));
    scene.add(pts);
    particles.push({ mesh: pts, speeds });
  }

  function _animate() {
    requestAnimationFrame(_animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();

    if (tableGroup) tableGroup.rotation.y = Math.sin(elapsed*0.05)*0.02;

    // Dust particles
    particles.forEach(p => {
      const pos = p.mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.array[i*3+1] += p.speeds[i]*dt*30;
        if (pos.array[i*3+1] > 10) pos.array[i*3+1] = -2;
      }
      pos.needsUpdate = true;
      p.mesh.rotation.y += dt*0.02;
    });

    // Card animations
    [...cardMeshes.player, ...cardMeshes.dealer].forEach(mesh => {
      _animateCard(mesh, dt, elapsed);
    });

    renderer.render(scene, camera);
  }

  function _animateCard(mesh, dt, elapsed) {
    if (mesh.userData.clearing) {
      mesh.userData.clearVel.y -= dt*9;
      mesh.position.add(mesh.userData.clearVel.clone().multiplyScalar(dt));
      mesh.rotation.x += dt*5; mesh.rotation.z += dt*3;
      return;
    }
    if (mesh.userData.discarding) {
      mesh.userData.discardVel.y -= dt*9;
      mesh.position.add(mesh.userData.discardVel.clone().multiplyScalar(dt));
      mesh.rotation.x += dt*6; mesh.rotation.z -= dt*4;
      return;
    }

    // Hover
    const hover = Math.sin(elapsed*2 + mesh.position.x)*0.015;

    if (mesh.userData.targetPos) {
      const tp = mesh.userData.targetPos.clone(); tp.y += hover;
      mesh.position.lerp(tp, dt*(mesh.userData.speed||5));
    }
    if (mesh.userData.targetRot) {
      const tr = mesh.userData.targetRot;
      mesh.rotation.x += (tr.x - mesh.rotation.x)*dt*6;
      mesh.rotation.y += (tr.y - mesh.rotation.y)*dt*6;
      mesh.rotation.z += (tr.z - mesh.rotation.z)*dt*6;
    }

    // Shiny pulse glow
    if (mesh.userData.card && mesh.userData.card.effect === 'shiny' && mesh.userData.faceUp) {
      const glowMesh = mesh.children[1];
      if (glowMesh && glowMesh.material) {
        glowMesh.material.opacity = 0.15 + Math.sin(elapsed*3 + mesh.position.x)*0.1;
      }
    }

    // Gold shimmer
    if (mesh.userData.card && mesh.userData.card.effect === 'gold' && mesh.userData.faceUp) {
      const glowMesh = mesh.children[1];
      if (glowMesh && glowMesh.material) {
        glowMesh.material.opacity = 0.1 + Math.abs(Math.sin(elapsed*2))*0.15;
      }
    }

    // Flip animation (dealer reveal)
    if (mesh.userData.flipping) {
      mesh.userData.flipProgress += dt*2.2;
      const prog = mesh.userData.flipProgress;
      if (mesh.userData.targetPos) {
        const lift = Math.sin(Math.min(prog,1)*Math.PI)*0.7;
        mesh.position.y = mesh.userData.targetPos.y + lift;
      }
      mesh.rotation.x = Math.PI*prog;
      if (prog >= 0.5 && !mesh.userData.flipDone) {
        mesh.userData.flipDone = true;
        const faceTex = _makeTex(mesh.userData.flipCanvas || Cards.makeFaceCanvas(mesh.userData.card));
        const inner = mesh.children[0];
        if (inner && Array.isArray(inner.material))
          inner.material[2] = new THREE.MeshPhongMaterial({ map: faceTex });
      }
      if (prog >= 1) {
        mesh.userData.flipping = false;
        mesh.userData.faceUp = true;
        mesh.rotation.x = 0; mesh.rotation.y = 0;
      }
    }
  }

  function _onResize() {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  return {
    init,
    dealCard, revealDealerCard, updateGlassReveal,
    repositionCards, removePlayerCard,
    highlightCard, clearCards, winBurst,
  };
})();
