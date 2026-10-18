(() => {
  const hero = document.querySelector(".hero");
  const canvas = document.getElementById("ascii-bg");
  if (!hero || !canvas) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const glyphs = "FLUIDfluid~:-.";
  const gravity = 900;
  const particleSpacing = 12;
  const startupSplashDuration = 3000;
  const smoothingRadius = particleSpacing * 2;
  const fixedStep = 1 / 30;
  const particles = [];
  let width = 0;
  let height = 0;
  let cellWidth = 8;
  let cellHeight = 10;
  let columns = 0;
  let rows = 0;
  let binColumns = 0;
  let binRows = 0;
  let binHeads;
  let nextInBin;
  let lambda;
  let deltaX;
  let deltaY;
  let cellCounts;
  let cellMotion;
  let surfaceByColumn;
  let lastFrame = 0;
  let accumulator = 0;
  let animationFrame = 0;
  let nextSplashTime = 0;
  let splashSequence = 0;

  function hash(x, y) {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  function getBin(x, y) {
    const column = Math.max(0, Math.min(binColumns - 1, Math.floor(x / smoothingRadius)));
    const row = Math.max(0, Math.min(binRows - 1, Math.floor(y / smoothingRadius)));
    return row * binColumns + column;
  }

  function rebuildBins() {
    binHeads.fill(-1);
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const bin = getBin(particle.x, particle.y);
      nextInBin[i] = binHeads[bin];
      binHeads[bin] = i;
    }
  }

  function forNearby(x, y, visit) {
    const centerColumn = Math.floor(x / smoothingRadius);
    const centerRow = Math.floor(y / smoothingRadius);
    for (let row = Math.max(0, centerRow - 1); row <= Math.min(binRows - 1, centerRow + 1); row++) {
      for (let column = Math.max(0, centerColumn - 1); column <= Math.min(binColumns - 1, centerColumn + 1); column++) {
        for (let i = binHeads[row * binColumns + column]; i !== -1; i = nextInBin[i]) visit(i);
      }
    }
  }

  function resize() {
    const bounds = hero.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    width = bounds.width;
    height = bounds.height;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(scale, 0, 0, scale, 0, 0);

    cellWidth = width < 600 ? 7 : 8;
    cellHeight = width < 600 ? 9 : 10;
    columns = Math.ceil(width / cellWidth);
    rows = Math.ceil(height / cellHeight);
    binColumns = Math.ceil(width / smoothingRadius);
    binRows = Math.ceil(height / smoothingRadius);
    binHeads = new Int32Array(binColumns * binRows);
    nextInBin = new Int32Array(Math.ceil(width / particleSpacing) * Math.ceil(height / particleSpacing));
    lambda = new Float32Array(nextInBin.length);
    deltaX = new Float32Array(nextInBin.length);
    deltaY = new Float32Array(nextInBin.length);
    cellCounts = new Uint8Array(columns * rows);
    cellMotion = new Float32Array(columns * rows);
    surfaceByColumn = new Float32Array(Math.ceil(width / particleSpacing));
    seedWater();
  }

  function seedWater() {
    particles.length = 0;
    const startX = particleSpacing * 0.55;
    for (let x = startX; x < width - particleSpacing * 0.35; x += particleSpacing) {
      const position = x / width;
      const surface = height * 0.32
        + Math.sin(position * Math.PI * 4 + 0.4) * height * 0.055
        + Math.sin(position * Math.PI * 9 + 1.7) * height * 0.025;
      for (let y = surface + particleSpacing * 0.5; y < height - particleSpacing * 0.35; y += particleSpacing) {
        const id = particles.length;
        particles.push({
          x: x + (hash(id, 11) - 0.5) * particleSpacing * 0.14,
          y: y + (hash(id, 23) - 0.5) * particleSpacing * 0.14,
          previousX: x,
          previousY: y,
          vx: 0,
          vy: 0
        });
      }
    }

    nextInBin = new Int32Array(particles.length);
    lambda = new Float32Array(particles.length);
    deltaX = new Float32Array(particles.length);
    deltaY = new Float32Array(particles.length);
    rebuildBins();
  }

  function pushSurface(x, impulse, radius, horizontalFlow) {
    surfaceByColumn.fill(Infinity);
    for (const particle of particles) {
      const column = Math.max(0, Math.min(surfaceByColumn.length - 1, Math.floor(particle.x / particleSpacing)));
      surfaceByColumn[column] = Math.min(surfaceByColumn[column], particle.y);
    }

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const column = Math.max(0, Math.min(surfaceByColumn.length - 1, Math.floor(particle.x / particleSpacing)));
      const depthBelowSurface = particle.y - surfaceByColumn[column];
      if (depthBelowSurface > particleSpacing * 2.5) continue;
      const distance = Math.abs(particle.x - x);
      if (distance >= radius) continue;
      const falloff = 0.5 + 0.5 * Math.cos(Math.PI * distance / radius);
      const surfaceBand = Math.max(0, 1 - depthBelowSurface / (particleSpacing * 2.5));
      particle.vy -= impulse * falloff * surfaceBand;
      particle.vx += (
        Math.sign(particle.x - x) * 0.2 + horizontalFlow * 0.3
      ) * impulse * falloff * surfaceBand;
    }
  }

  function projectDensity() {
    const radiusSquared = smoothingRadius * smoothingRadius;
    const restDensity = 1.6;

    for (let iteration = 0; iteration < 2; iteration++) {
      rebuildBins();
      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];
        let density = 0;
        let gradientX = 0;
        let gradientY = 0;
        let gradientSumSquared = 0;

        forNearby(particle.x, particle.y, j => {
          if (i === j) {
            density += 1;
            return;
          }
          const other = particles[j];
          const dx = particle.x - other.x;
          const dy = particle.y - other.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared >= radiusSquared || distanceSquared < 0.0001) return;
          const distance = Math.sqrt(distanceSquared);
          const weight = 1 - distance / smoothingRadius;
          density += weight * weight * weight;
          const gradient = -3 * weight * weight / (smoothingRadius * distance * restDensity);
          const gx = gradient * dx;
          const gy = gradient * dy;
          gradientSumSquared += gx * gx + gy * gy;
          gradientX += gx;
          gradientY += gy;
        });

        const constraint = Math.max(0, density / restDensity - 1);
        const denominator = gradientSumSquared + gradientX * gradientX + gradientY * gradientY + 0.00001;
        lambda[i] = -constraint / denominator;
      }

      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];
        let correctionX = 0;
        let correctionY = 0;

        forNearby(particle.x, particle.y, j => {
          if (i === j) return;
          const other = particles[j];
          const dx = particle.x - other.x;
          const dy = particle.y - other.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared >= radiusSquared || distanceSquared < 0.0001) return;
          const distance = Math.sqrt(distanceSquared);
          const weight = 1 - distance / smoothingRadius;
          const gradient = -3 * weight * weight / (smoothingRadius * distance * restDensity);
          const correction = (lambda[i] + lambda[j]) * gradient;
          correctionX += correction * dx;
          correctionY += correction * dy;
        });

        const magnitude = Math.hypot(correctionX, correctionY);
        const limit = particleSpacing * 0.35;
        if (magnitude > limit) {
          correctionX *= limit / magnitude;
          correctionY *= limit / magnitude;
        }
        deltaX[i] = correctionX;
        deltaY[i] = correctionY;
      }

      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];
        particle.x = Math.max(particleSpacing, Math.min(width - particleSpacing, particle.x + deltaX[i]));
        particle.y = Math.max(particleSpacing, Math.min(height - particleSpacing, particle.y + deltaY[i]));
      }
    }
  }

  function step(dt) {
    for (const particle of particles) {
      particle.previousX = particle.x;
      particle.previousY = particle.y;
      particle.vy += gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.x = Math.max(particleSpacing, Math.min(width - particleSpacing, particle.x));
      particle.y = Math.max(particleSpacing, Math.min(height - particleSpacing, particle.y));
    }

    projectDensity();

    const viscosity = 0.035;
    rebuildBins();
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      particle.vx = (particle.x - particle.previousX) / dt;
      particle.vy = (particle.y - particle.previousY) / dt;
      let neighborVx = 0;
      let neighborVy = 0;
      let neighbors = 0;
      forNearby(particle.x, particle.y, j => {
        if (i === j) return;
        neighborVx += particles[j].vx;
        neighborVy += particles[j].vy;
        neighbors++;
      });
      if (neighbors) {
        particle.vx += (neighborVx / neighbors - particle.vx) * viscosity;
        particle.vy += (neighborVy / neighbors - particle.vy) * viscosity;
      }
      if (particle.x <= particleSpacing || particle.x >= width - particleSpacing) particle.vx *= -0.18;
      if (particle.y >= height - particleSpacing) particle.vy *= -0.12;
      particle.vx *= 0.997;
      particle.vy *= 0.997;
    }
  }

  function render() {
    context.clearRect(0, 0, width, height);
    cellCounts.fill(0);
    cellMotion.fill(0);

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const column = Math.max(0, Math.min(columns - 1, Math.floor(particle.x / cellWidth)));
      const row = Math.max(0, Math.min(rows - 1, Math.floor(particle.y / cellHeight)));
      const cell = row * columns + column;
      const motion = Math.hypot(particle.vx, particle.vy);
      cellCounts[cell] = Math.min(255, cellCounts[cell] + 1);
      cellMotion[cell] += motion;

      if (hash(i, 37) > 0.35) {
        const adjacentColumn = column + (hash(i, 43) > 0.5 ? 1 : -1);
        if (adjacentColumn >= 0 && adjacentColumn < columns) {
          const adjacentCell = row * columns + adjacentColumn;
          cellCounts[adjacentCell] = Math.min(255, cellCounts[adjacentCell] + 1);
          cellMotion[adjacentCell] += motion;
        }
      }
    }

    context.textBaseline = "top";
    context.font = `${width < 600 ? 8 : 10}px "IBM Plex Mono", monospace`;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const cell = row * columns + column;
        const count = cellCounts[cell];
        if (!count || hash(column, row) > Math.min(0.98, 0.78 + count * 0.08)) continue;
        const motion = cellMotion[cell] / count;
        const alpha = Math.min(0.68, 0.24 + motion * 0.0013 + count * 0.035);
        const accent = motion > 95 && hash(column + 19, row + 71) > 0.87;
        context.fillStyle = accent
          ? `rgba(242,145,107,${alpha})`
          : `rgba(143,212,208,${alpha})`;
        const glyphIndex = Math.floor(hash(column + Math.floor(motion / 18), row + count) * glyphs.length);
        context.fillText(glyphs[glyphIndex], column * cellWidth, row * cellHeight);
      }
    }
  }

  function animate(time) {
    if (lastFrame) {
      accumulator = Math.min(fixedStep, accumulator + Math.min((time - lastFrame) / 1000, 0.05));
    }
    lastFrame = time;

    if (time >= nextSplashTime) {
      const event = ++splashSequence;
      const startupSplash = time < startupSplashDuration;
      const x = width * (0.1 + hash(event, 17) * 0.8);
      const impulse = startupSplash
        ? 650 + hash(event, 47) * 220
        : 300 + hash(event, 47) * 180;
      const radius = startupSplash
        ? width * (0.06 + hash(event, 61) * 0.04)
        : width * (0.035 + hash(event, 61) * 0.035);
      const horizontalFlow = hash(event, 89) * 2 - 1;
      pushSurface(x, impulse, radius, horizontalFlow);
      nextSplashTime = time + (startupSplash ? 130 : 950 + hash(event, 73) * 1000);
    }

    if (accumulator >= fixedStep) {
      step(fixedStep);
      accumulator = 0;
      render();
    }

    animationFrame = requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(animationFrame);
      lastFrame = 0;
      accumulator = 0;
    } else if (!reduceMotion) {
      animationFrame = requestAnimationFrame(animate);
    }
  });

  resize();
  pushSurface(width * 0.5, 700, width * 0.12, hash(0, 89) * 2 - 1);
  render();
  if (!reduceMotion) animationFrame = requestAnimationFrame(animate);
})();
