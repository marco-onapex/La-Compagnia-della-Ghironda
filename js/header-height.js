/**
 * Header Height Measurement & Dynamic Title Visibility
 * 
 * Core responsibilities:
 * 1. Misura l'altezza reale dell'header e la imposta come variabile CSS
 * 2. Usa Intersection Observer per monitorare quando il titolo hero esce dal viewport
 * 3. Mostra il titolo nell'header solo quando il titolo hero non è visibile
 * 4. Gestisce la navigazione attiva con aria-current per accessibilità
 * 5. Genera SVG concentrico dinamico basato su calcoli topografici (fBm algorithm)
 */

// ============================================
// Configuration Constants
// ============================================

/** Durata frame in millisecondi per requestAnimationFrame fallback (1000 / 60 FPS) */
const RAF_FALLBACK_MS = 16;

/** Timeout per attesa caricamento font in IE11 (ms) */
const FONT_LOAD_TIMEOUT_MS = 1000;

/** Retry timeout per elementi DOM non ancora pronti (ms) */
const DOM_RETRY_TIMEOUT_MS = 500;

/** Numero massimo di retry per inizializzazione elementi */
const DOM_RETRY_LIMIT = 3;

/** Threshold per Intersection Observer (Hero title visibility) */
const HERO_VISIBILITY_THRESHOLD = [0, 0.2];

/** Ratio minimo per considerare header title visibile (< 20% in viewport) */
const HERO_VISIBILITY_RATIO_THRESHOLD = 0.2;

/** Root margin per Intersection Observer sezioni */
const SECTION_OBSERVER_ROOT_MARGIN = '-85px 0px -66% 0px';

/** Thresholds per Intersection Observer sezioni */
const SECTION_VISIBILITY_THRESHOLD = [0, 0.5];

/** Fattore scala per raggio massimo ghironda (95% per non toccare bordo) */
const GHIRONDA_RADIUS_SAFETY_FACTOR = 0.95;

/** Numero totali di cerchi concentrici generati */
const GHIRONDA_CIRCLE_COUNT = 9;

/** Numero di octave per Fractional Brownian Motion algorithm */
const FBM_OCTAVE_COUNT = 3;

/** Frequenza base per ondulazioni topografiche */
const FBM_BASE_FREQUENCY = 2;

/** Numero punti per percorso SVG (qualità curva) */
const SVG_PATH_POINTS = 200;

/** Ampiezza minima perturbazione (% di raggio base) */
const SVG_AMPLITUDE_MIN_FACTOR = 0.04;

/** Ampiezza massima per livello esterno */
const SVG_AMPLITUDE_LEVEL_FACTOR = 0.01;

/** Larghezza stroke minima (px) */
const SVG_STROKE_WIDTH_MIN = 2.2;

/** Larghezza stroke massima (px) */
const SVG_STROKE_WIDTH_MAX = 5.7;

/** Opacità fill centro (80%) */
const SVG_FILL_OPACITY_CENTER = 0.8;

/** Decremento opacità per livello */
const SVG_FILL_OPACITY_STEP = 0.08;

/** Opacità stroke minima */
const SVG_STROKE_OPACITY_MIN = 0.40;

/** Opacità stroke centro */
const SVG_STROKE_OPACITY_CENTER = 0.95;

/** Decremento opacità stroke per livello */
const SVG_STROKE_OPACITY_STEP = 0.07;

/** Viewbox factor (moltiplicatore per r9) */
const SVG_VIEWBOX_FACTOR = 2.1;

/** Timeout debounce per resize (ms) */
const RESIZE_DEBOUNCE_MS = 300;

// ============================================
// IE11 Compatibility Shim
// ============================================

/**
 * Polyfill per requestAnimationFrame nei browser legacy (IE9-IE10)
 * Fallback a setTimeout con framerate ~60fps
 */
if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = function(callback) {
    return setTimeout(callback, RAF_FALLBACK_MS);
  };
}

// ============================================
// 1. Misura altezza header
// ============================================

/**
 * Aggiorna la variabile CSS --header-height basata sull'altezza reale dell'elemento <header>
 * Necessario per calcoli di scroll-margin-top e posizionamento sticky corretto
 * 
 * Algoritmo:
 * 1. Seleziona elemento header dal DOM
 * 2. Legge offsetHeight (include padding, esclude margin)
 * 3. Imposta --header-height presso root element per accessibilità CSS
 * 
 * Chiamato da:
 * - Inizializzazione DOMContentReady
 * - Event listener resize window
 * - Promise document.fonts.ready (caricamento font completo)
 * 
 * @function updateHeaderHeight
 * @returns {void}
 */
function updateHeaderHeight() {
  const header = document.querySelector('header');
  if (header) {
    const height = header.offsetHeight;
    document.documentElement.style.setProperty('--header-height', `${height}px`);
  }
}

// Aggiorna all'inizio
updateHeaderHeight();

// Aggiorna al resize della finestra
window.addEventListener('resize', updateHeaderHeight);

// Aggiorna quando i font caricano (IE11 fallback)
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    updateHeaderHeight();
  });
} else {
  // IE11 fallback: aggiorna dopo timeout per font load asincrono
  setTimeout(updateHeaderHeight, FONT_LOAD_TIMEOUT_MS);
}

// ============================================
// 2. Intersection Observer per titolo hero
// ============================================

/**
 * Inizializza visibilità dinamica del titolo nell'header usando Intersection Observer
 * 
 * Responsabilità:
 * 1. Monitora quando il titolo hero (h1) esce dal viewport
 * 2. Mostra il titolo nell'header (header-title-wrapper) solo quando hero title è nascosto
 * 3. Gestisce aria-hidden e tabindex per accessibilità screen reader
 * 4. Evita manipolazione DOM inutile mediante caching dello stato (lastLogoState)
 * 
 * ALGORITMO INTERSECTION OBSERVER:
 * - Osserva l'elemento '.hero h1' con threshold [0, 0.2]
 * - Se ratio < 0.2 (>80% uscito dal viewport) → mostra header title
 * - Se ratio >= 0.2 (ancora visibile) → nascondi header title
 * - Transizioni CSS fluide (visibility 300ms, opacity 300ms)
 * 
 * ACCESSIBILITÀ:
 * - Quando visibile: aria-hidden="false", tabindex="0" (focusabile)
 * - Quando nascosto: aria-hidden="true", tabindex="-1" (non focusabile)
 * - Importante per screen reader: evita annuncio duplicato del titolo
 * 
 * RETRY LOGIC:
 * - Se elementi DOM non trovati, riprova fino a DOM_RETRY_LIMIT (3 volte)
 * - Timeout tra retry: DOM_RETRY_TIMEOUT_MS (500ms)
 * - Fallback silenzioso se elementi non trovati dopo max retry
 * 
 * @function initHeaderTitleVisibility
 * @param {number} [retryCount=0] - Numero di tentativi attuali (usato internamente)
 * @returns {void}
 */
function initHeaderTitleVisibility(retryCount = 0) {
  const heroTitle = document.querySelector('.hero h1');
  const headerTitleWrapper = document.querySelector('.header-title-wrapper');
  const headerTitleLink = document.querySelector('.header-title-link');
  const headerContainer = document.querySelector('.header-container');
  
  if (!heroTitle || !headerTitleWrapper || !headerContainer) {
    if (retryCount < 3) {
      setTimeout(() => initHeaderTitleVisibility(retryCount + 1), 500);
    }
    return;
  }

  // Inizializza hidden
  headerTitleWrapper.classList.remove('visible');
  headerContainer.classList.remove('title-visible');
  if (headerTitleLink) {
    headerTitleLink.setAttribute('aria-hidden', 'true');
    headerTitleLink.setAttribute('tabindex', '-1');
  }

  // Cache stato precedente per evitare ricalcoli inutili
  let lastLogoState = false;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        // Se il titolo hero è FUORI dal viewport (ratio < 0.2), mostra il logo
        const shouldShowLogo = entry.intersectionRatio < 0.2;
        

        
        // Previeni DOM manipulation se lo stato non è cambiato
        if (shouldShowLogo === lastLogoState) return;
        lastLogoState = shouldShowLogo;
        
        if (shouldShowLogo) {
          // Mostra logo - evita add se già present
          if (!headerTitleWrapper.classList.contains('visible')) {
            headerTitleWrapper.classList.add('visible');
            headerContainer.classList.add('title-visible');
            if (headerTitleLink) {
              headerTitleLink.setAttribute('aria-hidden', 'false');
              headerTitleLink.setAttribute('tabindex', '0');
            }
          }
        } else {
          // Nascondi logo - evita remove se già absent
          if (headerTitleWrapper.classList.contains('visible')) {
            headerTitleWrapper.classList.remove('visible');
            headerContainer.classList.remove('title-visible');
            if (headerTitleLink) {
              headerTitleLink.setAttribute('aria-hidden', 'true');
              headerTitleLink.setAttribute('tabindex', '-1');
            }
          }
        }
      });
    },
    {
      // Root margin negativo dalla cima = lo attiva PRIMA che esca dal viewport
      rootMargin: '0px 0px 0px 0px',
      // Threshold ridotto per evitare troppe transizioni (threshold: [0, 0.2])
      threshold: [0, 0.2]
    }
  );

  observer.observe(heroTitle);
}

// ============================================
// 3. Intersection Observer per sezioni attive
// ============================================

/**
 * Gestisce aria-current per la navigazione attiva basata su scroll position
 * 
 * Responsabilità:
 * 1. Traccia quale sezione è attualmente visibile nel viewport
 * 2. Aggiorna aria-current="page" sul link di navigazione corrispondente
 * 3. Rimuove aria-current dagli altri link
 * 4. Fornisce feedback visuale e screen reader feedback
 * 
 * ALGORITMO:
 * 1. Seleziona tutti gli elementi 'section[id]' (sezioni con ID)
 * 2. Seleziona tutti i link 'nav a[href^="#"]' (link di navigazione)
 * 3. Crea mappa sectionId → link element per lookups rapidi
 * 4. IntersectionObserver monitora quando sezioni entrano in viewport
 * 5. Quando sezione entry.isIntersecting={true}:
 *    - Rimuovi aria-current da TUTTI i link
 *    - Aggiungi aria-current="page" al link della sezione attiva
 * 
 * PARAMETRI OBSERVER:
 * - rootMargin: '-85px 0px -66% 0px'
 *   * -85px top: offset dell'header height (sezione considerate "visible" quando passano header)
 *   * -66% bottom: sezione visibile solo nel top 34% della viewport (80% di scroll margin per priorità top)
 * - threshold: [0, 0.5] = trigger al 0% e 50% visibility
 * 
 * NOTA ACCESSIBILITÀ:
 * - aria-current="page" deve essere ON SOLO QUANDO entry.isIntersecting (non quando esce)
 * - Previene annunci screen reader ridondanti
 * - Link mantenuti nel tab order (nessun tabindex modificato)
 * 
 * @function initActiveNavLink
 * @returns {void}
 */
function initActiveNavLink() {
  // Monitora tutte le sezioni
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('nav a[href^="#"]');
  
  if (sections.length === 0 || navLinks.length === 0) {
    return;
  }
  
  // Mapper tra ID sezione e href link
  const sectionMap = {};
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href && href.startsWith('#')) {
      const sectionId = href.slice(1);
      sectionMap[sectionId] = link;
    }
  });
  
  // Intersection Observer for sections
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const sectionId = entry.target.id;
        const link = sectionMap[sectionId];
        
        if (!link) return;
        
        if (entry.isIntersecting) {
          // Rimuovi aria-current da tutti i link
          navLinks.forEach(l => {
            l.removeAttribute('aria-current');
          });
          
          // Aggiungi aria-current al link attivo
          link.setAttribute('aria-current', 'page');
        }
      });
    },
    {
      // Trigger quando la sezione entra nel viewport (con offset della header height)
      rootMargin: '-85px 0px -66% 0px',
      threshold: [0, 0.5]
    }
  );
  
  // Osserva tutte le sezioni
  sections.forEach(section => {
    sectionObserver.observe(section);
  });
}

// ============================================
// 4. Calcola dimensioni ghironda e genera cerchi dinamici
// ============================================

/**
 * Genera SVG concentrico dinamico con algoritmo Fractional Brownian Motion (fBm)
 * Crea effetto di profondità infernale attorno all'icona della ghironda
 * 
 * RESPONSABILITÀ:
 * 1. Misura dimensioni dell'elemento .ghironda-icon a runtime
 * 2. Calcola 9 raggi concentrici basato su geometria della pagina
 * 3. Genera 9 cerchi con bordi frastagliati (topografici) usando fBm
 * 4. Imposta SVG via CSS custom property --ghironda-circles (background-image)
 * 5. Ricalcola al resize della finestra (con debounce 500ms)
 * 
 * ALGORITMO CALCOLO RAGGI:
 * Fase 1: Calcola r1 (raggio che inscrive l'immagine renderizzata)
 *         - r1 = diagonale bounding box / 2
 * 
 * Fase 2: Calcola r9 (raggio che ricopre tutto l'hero section)
 *         - Distanze dal centro immagine ai 4 angoli della hero section
 *         - r9 = max(distanze) * 0.95 (GHIRONDA_RADIUS_SAFETY_FACTOR)
 * 
 * Fase 3: Calcola ratio di espansione logaritmica
 *         - ratio = (r9 / r1) ^ (1/8)
 *         - Questo fa sì che ratio^8 = r9/r1 (crescita esponenziale "naturale")
 * 
 * Fase 4: Genera 9 raggi
 *         - r_i = r1 * ratio^i (per i=0..8)
 *         - Far dal più piccolo (centro) al più grande (bordo)
 * 
 * ALGORITMO fBm (FRACTIONAL BROWNIAN MOTION):
 * Crea contour topografiche naturali accumulando noise a multiple frequenze
 * 
 * Per ogni cerchio i (0-8):
 *   1. Genera 200 punti attorno al circonferenza (numPoints)
 *   2. Per ogni punto:
 *      - angle = (j / 200) * 2π
 *      - Accumula 3 ottave di perturbazione:
 *        * octave 0: freq=2Hz,   amp=maxAmp        (onde grandi)
 *        * octave 1: freq=4Hz,   amp=maxAmp/2      (onde medie)
 *        * octave 2: freq=8Hz,   amp=maxAmp/4      (onde piccole)
 *      - perturbation = Σ sin(angle * freq) * amp
 *      - radius_finale = baseRadius + perturbation
 *   3. Crea SVG path con linea M/L da questi 200 punti
 * 
 * STILE VISIVO (PALETTE DEL KUR NUGHUL):
 * Fill colors (Colori infernali, dal cremisi gitano al nero):
 *   - Centro (i=8):   #0a0000 (nero assoluto - abyss)
 *   - Esterno (i=0):  #8B3A3A (rosso cremisi scuro - fuoco infernale)
 * 
 * Fill opacity (decrescente verso esterno):
 *   - Centro: 80%
 *   - Esterno: 16%
 *   - Step: -8% per livello
 * 
 * Stroke (contorno topografico):
 *   - Colori: nero/rosso scurissimo (#000000 centro, #330000 esterno)
 *   - Width crescente verso esterno: 2.2px → 5.7px
 *   - Opacity decrescente: 95% → 40%
 *   - Effetto: linee di contorno "topografiche" ben marcate
 * 
 * SVG RENDERING:
 * - ViewBox dimensionato su r9 * 2.1 (GHIRONDA_VIEWBOX_FACTOR)
 * - Disegna dall'esterno al centro (i=8..0) → centro appare ON TOP
 * - Codificato come data:image/svg+xml URL
 * - Imposto in --ghironda-circles CSS custom property
 * - Usato come background-image del .ghironda-wrapper
 * 
 * PERFORMANCE OPTIMIZATION:
 * - Caching lastSvgUrl: rigenera SVG SOLO se dimensioni cambiano
 * - Debounce resize: rigenera max 1x ogni 500ms durante resize
 * - requestAnimationFrame fallback: genera async se immagine non caricata
 * - Supporto IE11: setTimeout fallback per generazione asincrona
 * 
 * @function initDynamicConcentricCircles
 * @returns {void}
 */
function initDynamicConcentricCircles() {
  const ghirondaImg = document.querySelector('.ghironda-icon');
  const ghirondaWrapper = document.querySelector('.ghironda-wrapper');
  
  if (!ghirondaImg || !ghirondaWrapper) return;
  
  // Gradazione di colori: dal fuoco-oro del centro al nero assoluto dell'abisso senza ritorno
  const colors = ['#FFCC33', '#FF9933', '#FF6633', '#DD4433', '#BB2233', 
                  '#772233', '#441122', '#220011', '#000000'];
  
  let lastSvgUrl = null;
  
  function generateCircles() {
    // 1. MISURA DIMENSIONI DELL'IMMAGINE RENDERIZZATA
    const rect = ghirondaImg.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    if (width === 0 || height === 0) {
      requestAnimationFrame(generateCircles);
      return;
    }
    
    // 2. CALCOLA PRIMO RAGGIO CHE INSCRIVE LA BOUNDING BOX
    const diagonal = Math.sqrt(width * width + height * height);
    const r1 = diagonal / 2;
    
    // 3. CALCOLA NONO RAGGIO PER COPRIRE L'HERO
    const heroRect = ghirondaImg.closest('.hero').getBoundingClientRect();
    const imgCenterX = rect.left + width / 2;
    const imgCenterY = rect.top + height / 2;
    
    // Distanza dal centro dell'immagine ai 4 angoli dell'hero
    const distTopLeft = Math.sqrt((imgCenterX - heroRect.left) ** 2 + (imgCenterY - heroRect.top) ** 2);
    const distTopRight = Math.sqrt((heroRect.right - imgCenterX) ** 2 + (imgCenterY - heroRect.top) ** 2);
    const distBottomLeft = Math.sqrt((imgCenterX - heroRect.left) ** 2 + (heroRect.bottom - imgCenterY) ** 2);
    const distBottomRight = Math.sqrt((heroRect.right - imgCenterX) ** 2 + (heroRect.bottom - imgCenterY) ** 2);
    
    const r9 = Math.max(distTopLeft, distTopRight, distBottomLeft, distBottomRight) * 0.95;  // 95% per non toccare esattamente il bordo
    
    // 4. CALCOLA RATIO PER ESPANDERE DA r1 A r9 IN 9 CERCHI
    const ratio = Math.pow(r9 / r1, 1 / 8);  // ratio^8 = r9/r1
    
    // 4. GENERA 9 CERCHI COME CONTOUR LINES TOPOGRAFICI (GIRONI DI KUR NUGHUL)
    // Algoritmo Fractional Brownian Motion (fBm): come usato per disegnare vere mappe topografiche di montagne
    // EFFETTO: strati riempiti di colore che danno profondità, con linee topografiche di contorno
    
    // PALETTE: INFERNALE AUTENTICA - Kur Nughul è l'abisso, armonizzata alla palette gitana del sito
    // Colori cupi e cremisi (come la palette del sito) ma tenebrosi
    // i=0 (CENTRO) → #0a0000 (nero assoluto)
    // i=8 (ESTERNO) → #8B3A3A (rosso cremisi scuro, da --color-gipsy-red)
    const fillColors = ['#8B3A3A', '#7A2F2F', '#6B2424', '#5A1A1A', '#4A1515', 
                        '#3A0F0F', '#2A0A0A', '#1a0505', '#0a0000'];
    
    let circlesHtml = '';
    
    for (let i = 8; i >= 0; i--) {  // DISEGNA DALL'ESTERNO AL CENTRO così il centro (scuro) appare ON TOP
      const baseRadius = r1 * Math.pow(ratio, i);
      const assignedColor = fillColors[8-i];
      
      // fBm: accumula multiple ottave di rumore per frastagliamenti naturali
      const numPoints = 200;
      const maxAmplitude = baseRadius * (0.04 + i * 0.01);  // Ampiezza cresce verso esterno
      const baseFrequency = 2;  // Frequenza base per onde grossolane
      const numOctaves = 3;  // 3 livelli di rumore per naturalezza
      
      let pathD = '';
      for (let j = 0; j <= numPoints; j++) {
        const angle = (j / numPoints) * Math.PI * 2;
        let perturbation = 0;
        let amplitude = maxAmplitude;
        let frequency = baseFrequency;
        
        // Accumula multiple ottave: ogni ottava raddoppia frequenza, dimezza ampiezza
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
      
      // RIEMPIMENTO: area di background traparente colorata
      // Opacità DECRESCENTE verso l'esterno per effetto di profondità: centro SCURO e VISIBILE, esterno leggero
      const fillOpacity = 0.8 - (i * 0.08);  // 80% (centro) → 16% (esterno) - PIÙ VISIBILE ANCHE AL CENTRO
      circlesHtml += `<path d="${pathD}" fill="${fillColors[8-i]}" fill-opacity="${fillOpacity.toFixed(3)}" stroke="none"/>`;
      
      // CONTORNO TOPOGRAFICO: linee frastagliate con stroke crescente verso esterno
      const sw = 2.2 + (i / 8) * 3.5;  // 2.2px → 5.7px
      // Stroke MOLTO SCURO E MARCATO - ben distinto dal fill
      const baseStrokeOpacity = 0.95 - (i * 0.07);  // 95% (centro) → 40% (esterno) - LINEE NITIDE
      const strokeOpacity = Math.max(baseStrokeOpacity, 0.40);  // Min 40%
      // Usa uno shade più SCURO per le linee, non lo stesso colore del fill
      const strokeColor = i === 0 ? '#000000' : '#330000';  // Centro nero, altri rosso scurissimo
      circlesHtml += `<path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="${sw.toFixed(1)}" opacity="${strokeOpacity.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    
    // 5. CREA SVG CON VIEWBOX APPROPRIATO (basato su r9, non r1)
    const vb = r9 * 2.1;  // Usa r9 come riferimento, non r1
    const vbHalf = Math.floor(vb / 2);
    const svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-vbHalf} ${-vbHalf} ${Math.ceil(vb)} ${Math.ceil(vb)}" width="${Math.ceil(vb)}" height="${Math.ceil(vb)}"><g>${circlesHtml}</g></svg>`;
    
    // 6. IMPOSTA NEL CSS VIA VARIABILE
    const svgUrl = `url('data:image/svg+xml;utf8,${encodeURIComponent(svgHtml)}')`;
    
    if (svgUrl !== lastSvgUrl) {
      lastSvgUrl = svgUrl;
      document.documentElement.style.setProperty('--ghironda-circles', svgUrl);
      ghirondaWrapper.style.setProperty('--circle-size', Math.ceil(vb) + 'px');
    }
  }
  
  // ESEGUI QUANDO IMMAGINE CARICATA
  if (ghirondaImg.complete && ghirondaImg.naturalWidth > 0) {
    generateCircles();
  } else {
    ghirondaImg.addEventListener('load', generateCircles);
  }
  
  // RICALCOLA AL RESIZE (CON DEBOUNCE)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(generateCircles, 500);
  });
}

// Inizializza quando il DOM è pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initHeaderTitleVisibility();
    initActiveNavLink();
    
    // Defer non-critical SVG generation usando requestIdleCallback
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        initDynamicConcentricCircles();
      });
    } else {
      // Fallback per browser senza requestIdleCallback
      setTimeout(initDynamicConcentricCircles, 1000);
    }
  });
} else {
  initHeaderTitleVisibility();
  initActiveNavLink();
  
  // Defer non-critical SVG generation
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      initDynamicConcentricCircles();
    });
  } else {
    setTimeout(initDynamicConcentricCircles, 1000);
  }
}
