import { CONFIG } from '../config.js';

/**
 * PALETTE COLORI - Tema Infernale Autentico (Kur Nughul)
 * 
 * Colori disposti da esterno (rosso cremisi) a centro (nero assoluto):
 * Indice:   0      1      2      3      4      5      6      7      8
 * Colore:  Rosso  ...    ...    ...    ...    ...    ...   Scuro  Nero
 * 
 * Mapping [8-i]: Quando i va da 8→0 (disegna fuori→centro), colore passa da 0→8
 * Così il centro (i=0) usa colore[8] = nero (scuro, on top) e l'esterno (i=8) usa colore[0] = rosso
 * 
 * OPACITÀ: 0.8 - (i * 0.08) = 80% centro → 16% esterno
 * STROKE: 2.2px → 5.7px, opacity 95% → 40%
 */
const HERO_SVG_PALETTE = ['#8B3A3A', '#7A2F2F', '#6B2424', '#5A1A1A', '#4A1515', '#3A0F0F', '#2A0A0A', '#1a0505', '#0a0000'];

/**
 * Genera SVG concentrico dinamico con algoritmo Fractional Brownian Motion (fBm)
 * 
 * Crea 9 cerchi concentrici frastagliati attorno all'immagine della ghironda.
 * I cerchi usano la palette colore infernale (rosso cremisi → nero) per effetto di profondità.
 * La topografia è generata con fBm (Fractional Brownian Motion) - come vere mappe topografiche.
 * 
 * @function setupHeroCircles
 * @returns {void}
 * @example
 * setupHeroCircles(); // Genera SVG e lo applica come CSS variable
 */
export function setupHeroCircles() {
  const ghirondaImg = document.querySelector('.ghironda-icon');
  const ghirondaWrapper = document.querySelector('.ghironda-wrapper');
  
  // Error handling: verifica DOM elements essenziali
  if (!ghirondaImg) {
    return;
  }
  if (!ghirondaWrapper) {
    return;
  }
  
  let lastSvgUrl = null;
  let rafRetries = 0;
  const RAF_MAX_RETRIES = 300; // ~5 secondi a 60fps

  /**
   * Interno: Genera i path SVG per i 9 cerchi concentrici
   * @function generateCircles
   * @inner
   */
  function generateCircles() {
    try {
      const rect = ghirondaImg.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      if (width === 0 || height === 0) {
        rafRetries += 1;
        if (rafRetries < RAF_MAX_RETRIES) {
          requestAnimationFrame(generateCircles);
        }
        // Superato il limite: abort silenzioso, il CSS fallback SVG resta visibile
        return;
      }

      rafRetries = 0; // reset al successo

      const diagonal = Math.sqrt(width * width + height * height);
      const r1 = diagonal / 2;

      const heroRect = ghirondaImg.closest('.hero').getBoundingClientRect();
      const imgCenterX = rect.left + width / 2;
      const imgCenterY = rect.top + height / 2;

      const distTopLeft = Math.sqrt((imgCenterX - heroRect.left) ** 2 + (imgCenterY - heroRect.top) ** 2);
      const distTopRight = Math.sqrt((heroRect.right - imgCenterX) ** 2 + (imgCenterY - heroRect.top) ** 2);
      const distBottomLeft = Math.sqrt((imgCenterX - heroRect.left) ** 2 + (heroRect.bottom - imgCenterY) ** 2);
      const distBottomRight = Math.sqrt((heroRect.right - imgCenterX) ** 2 + (heroRect.bottom - imgCenterY) ** 2);

      const r9 = Math.max(distTopLeft, distTopRight, distBottomLeft, distBottomRight) * CONFIG.HERO_SVG.radiusSafetyFactor;

      const ratio = Math.pow(r9 / r1, 1 / 8);

      let circlesHtml = '';

      // DISEGNA DALL'ESTERNO AL CENTRO (i=8..0) così il centro appare ON TOP
      for (let i = 8; i >= 0; i--) {
        const baseRadius = r1 * Math.pow(ratio, i);

        const numPoints = CONFIG.HERO_SVG.pointsPerCircle;
        const maxAmplitude = baseRadius * (0.04 + i * 0.01);
        const baseFrequency = 2;
        const numOctaves = CONFIG.HERO_SVG.fbmOctaves;

        let pathD = '';
        for (let j = 0; j <= numPoints; j++) {
          const angle = (j / numPoints) * Math.PI * 2;
          let perturbation = 0;
          let amplitude = maxAmplitude;
          let frequency = baseFrequency;

          for (let octave = 0; octave < numOctaves; octave++) {
            perturbation += Math.sin(angle * frequency) * amplitude;
            frequency *= 2;
            amplitude *= 0.5;
          }

          const radius = baseRadius + perturbation;
          const x = radius * Math.cos(angle);
          const y = radius * Math.sin(angle);

          pathD += (j === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
        }
        pathD += 'Z';

        const fillOpacity = 0.8 - (i * 0.08);
        circlesHtml += '<path d="' + pathD + '" fill="' + HERO_SVG_PALETTE[8 - i] + '" fill-opacity="' + fillOpacity.toFixed(3) + '" stroke="none"/>';

        const sw = 2.2 + (i / 8) * 3.5;
        const baseStrokeOpacity = 0.95 - (i * 0.07);
        const strokeOpacity = Math.max(baseStrokeOpacity, 0.40);
        const strokeColor = i === 0 ? '#000000' : '#330000';
        circlesHtml += '<path d="' + pathD + '" fill="none" stroke="' + strokeColor + '" stroke-width="' + sw.toFixed(1) + '" opacity="' + strokeOpacity.toFixed(2) + '" stroke-linecap="round" stroke-linejoin="round"/>';
      }

      const vb = r9 * CONFIG.HERO_SVG.viewboxFactor;
      const vbHalf = Math.floor(vb / 2);
      const svgHtml = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (-vbHalf) + ' ' + (-vbHalf) + ' ' + Math.ceil(vb) + ' ' + Math.ceil(vb) + '" width="' + Math.ceil(vb) + '" height="' + Math.ceil(vb) + '"><g>' + circlesHtml + '</g></svg>';

      const svgUrl = 'url(\'data:image/svg+xml;utf8,' + encodeURIComponent(svgHtml) + '\')';

      if (svgUrl !== lastSvgUrl) {
        lastSvgUrl = svgUrl;
        ghirondaWrapper.style.setProperty('--ghironda-circles', svgUrl);
        ghirondaWrapper.style.setProperty('--circle-size', Math.ceil(vb) + 'px');
      }
    } catch (error) {
      void error;
      // Silent failure in SVG generation
    }
  }
  
  // Generazione SVG: quando l'immagine è caricata (cached o dopo load event)
  if (ghirondaImg.complete && ghirondaImg.naturalWidth > 0) {
    generateCircles();
  } else {
    ghirondaImg.addEventListener('load', () => {
      generateCircles();
    });
  }
  
  // Rigenera al resize con debounce
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(generateCircles, 500);
  });
}
