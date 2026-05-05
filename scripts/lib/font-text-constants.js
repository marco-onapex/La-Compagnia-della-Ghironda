/**
 * Single source of truth for the literal text that drives every font
 * subset.
 *
 * Why this file exists: scripts/subset-fonts-lcp.js and
 * scripts/subset-fonts-page.js used to hardcode the strings rendered
 * by their target selectors. The hardcoded copies could drift from
 * the actual DOM in index.html — adding a character to the hero h1
 * without re-running the subset would silently render that one glyph
 * in the fallback serif. tests/unit/font-subset-coverage.test.js
 * imports from this file AND parses index.html via jsdom, asserting
 * every rendered character is present in the matching constant. The
 * subset scripts also import from this file, so the test compares
 * literally the same source-of-truth that the build uses.
 *
 * IMPORTANT: when editing visible text in `index.html`, append the
 * literal string to the matching constant below. The coverage test
 * will fail loudly if a glyph is missing — fix by adding the source
 * string here, then re-run `npm run build:fonts:lcp` and
 * `npm run build:fonts:page`.
 */

/* Hero region — `'Cinzel LCP'` subset (preloaded). Hero h1, hero
   subtitle, skip-link, header-title (= h1 mirror). */
export const HERO_TEXT = [
  'La Compagnia della Ghironda' /* hero h1 + header title */,
  'Finché Gira, il Mondo Resta' /* hero subtitle */,
  'Salta al contenuto' /* skip-link */,
].join(' ');

/* Nav links — Cinzel weight 600. Source DOM uses mixed case;
   text-transform: uppercase shapes the uppercased string. */
export const NAV_TEXT = ['Origine e Identità', 'Obiettivo e Organizzazione', 'Usi e Costumi'].join(
  ' ',
);

/* Section h2 (= NAV_TEXT) + section h3 + .section strong + footer
   strong. Cinzel weight 700 (full). */
export const SECTION_HEADINGS_TEXT = [
  /* h3 (text-transform: uppercase) */
  'Chi Siamo',
  'Il Nome',
  'Lo Spirito',
  'Gli Obiettivi',
  'La Struttura',
  'Apertura e Tolleranza',
  'Influenza Samsariana',
  'Bottino e Fiamme',
  /* strong */
  'Compagnia della Ghironda',
  'La Compagnia della Ghironda',
].join(' ');

/* Body paragraphs — `.section p` + `footer p`. Cinzel weight 400.
   The browser matches body's inherited weight 400 against this face
   directly (no fuzzy match). Without an explicit Cinzel-400, body
   weight 400 fuzzy-matches to weight 600 (NAV-only subset) and
   produces "macedonia" rendering: nav glyphs in Cinzel, others in
   serif fallback. The subset must therefore cover EVERY char that
   any body paragraph or footer paragraph renders. Mirrors index.html
   verbatim so the bidirectional coverage test catches drift in either
   direction. */
export const BODY_TEXT = [
  /* Origine e Identità — Chi Siamo */
  "Nel cuore dell'Isola più remota dell'Arcipelago Perduto, lì dove il Villaggio di Samsara si erge come primo baluardo di Ardania contro le entità maligne, un gruppo di uomini e donne erranti ha scelto di stabilirsi non per riposare, ma per vegliare.",
  "Al principio erano Samsariani di nascita, figli del vento e della polvere, artisti di strada, idealisti e lavoratori che, dopo aver completato i loro viaggi e concluso affari in ogni angolo dei regni conosciuti, hanno sentito il richiamo della famiglia. Facendo ritorno a casa, hanno montato le loro tende sotto il cielo dell'arcipelago, scoprendo che la libertà che tanto amavano era minacciata da un male che continuava a crescere tra le cave di Kur Nughul.",
  "Con il tempo, altri spiriti liberi si sono uniti attorno al loro fuoco, attratti dal calore di una fratellanza che non conosce confini di sangue ma solo d'intento. Insieme hanno condiviso lo spirito combattivo di un popolo antico, l'astuzia del mercante che non teme l'azzardo e la spavalderia di chi affronta l'ignoto con un sorriso e una lama pronta.",
  /* Origine e Identità — Il Nome */
  "Oggi, questa comunione di intenti si consolida nella Compagnia della Ghironda. Scelgono questo nome perché, come lo strumento del loro folclore, la Compagnia è l'insieme di pezzi scompagnati che insieme trovano un'armonia inaspettata. Non sono un esercito di soldati, ma una carovana di colori contro le tenebre. Sono il rumore della festa che scaccia il silenzio del terrore; La mano scaltra che ruba il segreto al maligno per volgerlo contro di lui.",
  /* Origine e Identità — Lo Spirito */
  "Mentre i regni di Ardania si rifugiano dietro mura di pietra, i samsariani restano sulla soglia del baratro. Non lo fanno per eroismo o per spregio, ma come spiriti liberi che si rifiutano di smettere di ridere solo perché l'inferno ha deciso di emergere.",
  /* Obiettivo e Organizzazione — Gli Obiettivi */
  "Lo scopo della Compagnia della Ghironda è ampliare le proprie conoscenze sulle entità maligne che popolano Ardania, in particolare sulla razza demoniaca, con l'obiettivo di contrastare, dominare o distruggere ogni esemplare che incontrano sul loro cammino. Tale obiettivo è accompagnato da uno spiccato interesse per il commercio: i samsariani non si limitano alla caccia e alle esplorazioni ma coltivano fitte reti di scambio con altri popoli, sia per l'arricchimento personale che per il sostentamento del proprio insediamento.",
  /* Obiettivo e Organizzazione — La Struttura. Includes the
     literal `"Krujal"` quote and `"girotondi"` quote, so the subset
     must cover U+0022 (ASCII straight double-quote). */
  'Non sono organizzati in una rigida gerarchia ma ogni elemento ha la sua importanza e ricoprire il ruolo che più si addice alle sue capacità e alle esigenze del Campo, ci sono coloro che affinano maggiormente l\'arte del combattimento, chi si occupa dei rapporti commerciali e chi è più dedito agli studi. Si fanno chiamare "Krujal", termine che un demone utilizzò una volta per schernirli, definendoli in modo dispregiativo "girotondi", ma che loro adottarono con orgoglio dopo averlo sconfitto. Le decisioni vengono prese insieme con le modalità più disparate, dalle discussioni accese, alle sfide e perfino scommesse per poi essere rappresentate da un Portavoce, solitamente il più morigerato del gruppo. Tuttavia, non viene mai tollerato chi compromette l\'armonia e la sicurezza del campo.',
  /* Usi e Costumi — Apertura e Tolleranza */
  "La Compagnia della Ghironda accoglie uomini e donne di ogni provenienza e religione, promuovendo l'apertura verso il mondo e i suoi popoli e la conoscenza di culture diverse.",
  /* Usi e Costumi — Influenza Samsariana */
  "Essendo una compagnia fondata da Samsariani, i suoi membri subiscono fortemente l'influenza delle credenze del popolo dei Vaghi, sia chi lo è di sangue che non, e per questo motivo molte loro abitudini sono accompagnate da piccoli rituali scaramantici.",
  /* Usi e Costumi — Bottino e Fiamme */
  'Sono inoltre soliti, durante le loro cacce, spogliare i corpi dei demoni di ogni loro possedimento, che siano essi reagenti, tomi o preziosi, per poi bruciare in una grossa pira tutto ciò che non è utile al campo e ai loro studi, per essere certi di privare il maligno anche della più piccola fonte che possa contribuire alla sua crescita.',
  /* Footer — uses U+007C `|` separator. */
  'La Compagnia della Ghironda | The Miracle Shard',
].join(' ');

/* Crimson Text italic 400 — `.hero-tagline` (desktop ≥1024px) +
   `.quote-liberty`.

   Apostrophe convention: every literal apostrophe below is the ASCII
   straight U+0027 to match the actual character in `index.html`. The
   typographic curly U+2019 is NOT used by the visible DOM — including
   it would request a glyph the source Crimson Text Latin-Extended-A
   subset doesn't ship anyway, AND make the constants logically
   inconsistent with the rendered text (the SUPERSET-drift assertion
   in tests/unit/font-subset-coverage.test.js would now flag this).
   The previous version had `dall’Oscurità` (curly) here while the
   HTML had `dall'Oscurità` (ASCII) — fixed below. */
export const ITALIC_TEXT = [
  /* hero-tagline (desktop only — mobile ≤1023px collapses to
     `font-family: serif` so the italic face is never matched there) */
  "Nel cuore dell'Arcipelago Perduto, dove la Libertà combatte l'Oscurità",
  /* quote-liberty */
  'Finché una tenda resterà in piedi o un samsariano avrà fiato per cantare, ' +
    "la Libertà rimarrà un baluardo inespugnabile dall'Oscurità.",
].join(' ');
