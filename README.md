# La Compagnia della Ghironda

Sito ufficiale della gilda "La Compagnia della Ghironda" per **The Miracle Shard**, uno shard di Ultima Online.

## 📖 Descrizione

Questo è un sito statico ospitato su GitHub Pages che presenta la gilda e le sue attività. La Compagnia della Ghironda è una fratellanza di spiriti liberi dedita alla ricerca, al commercio e alla lotta contro le entità demoniache di Ardania.

## 🏗️ Struttura del Progetto

```
La Compagnia della Ghironda/
├── index.html                 # Homepage - Identità della Compagnia
├── css/
│   └── style.css             # Stile principale
├── js/
│   └── (script.js opzionale)
├── pages/
│   ├── organizzazione.html    # Scopi e struttura
│   ├── attivita.html          # Attività e missioni
│   ├── membri.html            # Roster dei membri
│   └── contatti.html          # Informazioni di contatto
├── images/                    # Cartella per immagini (da aggiungere)
└── README.md                  # Questo file
```

## 🎨 Estetica

Il sito riprende lo stile narrativo del sito ufficiale di **The Miracle Shard** con un'estetica:
- **Fantasy épica**: Narrativa ricca e immersiva
- **Gipsy**: Libertà, movimento, spirito nomade
- **Demoniaca**: Colori scuri (oro, rosso, porpora), atmosfera cupa ma affascinante

**Colori principali:**
- Oro: `#d4af37`
- Rosso Scuro: `#8b0000`
- Porpora: `#4a0080`
- Arancione: `#ff6b35`
- Nero profondo: `#0a0a0a`

## 🚀 Deployment su GitHub Pages

### Opzione 1: Metodo Rapido

1. **Crea un repository** su GitHub con il nome `la-compagnia-della-ghironda` (oppure il nome che preferisci)

2. **Clona il repository** localmente:
   ```bash
   git clone https://github.com/TUO_USERNAME/la-compagnia-della-ghironda.git
   cd la-compagnia-della-ghironda
   ```

3. **Copia i file del progetto** nella cartella del repository

4. **Pubblica su GitHub**:
   ```bash
   git add .
   git commit -m "Iniziale: Sito della Compagnia della Ghironda"
   git push origin main
   ```

5. **Attiva GitHub Pages**:
   - Vai su: **Settings** → **Pages**
   - Seleziona `main` branch come sorgente
   - La pagina sarà disponibile a: `https://TUO_USERNAME.github.io/la-compagnia-della-ghironda/`

### Opzione 2: Repository `username.github.io`

Se desideri che il sito sia alla radice del dominio (es. `https://username.github.io/`):

1. Crea un repository con il nome `USERNAME.github.io`
2. Segui gli stessi passaggi di sopra
3. Il sito sarà direttamente accessibile a `https://USERNAME.github.io/`

## 📝 Customizzazione

### Aggiungere i Tuoi Dati di Contatto

Modifica il file `pages/contatti.html` e sostituisci i placeholder:
- `[Discord Link - Da aggiornare]` → Il tuo link Discord
- `[Email - Da aggiornare]` → La tua email
- `[Social Media]` → I tuoi account social

### Aggiungere Membri

Nel file `pages/membri.html`, aggiungi nuovi profili utilizzando il template fornito nelle note.

### Aggiungere Immagini

Carica le immagini nella cartella `images/` e referenziala nel CSS o HTML:
```html
<img src="images/nome-immagine.png" alt="Descrizione">
```

### Modificare i Colori

Modifica le variabili CSS nel file `css/style.css` sezione `:root`:
```css
:root {
  --color-accent-gold: #d4af37;
  --color-accent-red: #8b0000;
  /* ... */
}
```

## 🔗 Link Importanti

- **The Miracle Shard**: https://www.themiracleshard.com
- **Samsara**: https://www.themiracleshard.com/ambientazione/localita/samsara
- **Kur Nughul**: https://www.themiracleshard.com/ambientazione/dungeons/kur-nughul

## 📋 Pagine Disponibili

- **Index** (`index.html`) - Homepage con la storia della gilda
- **Organizzazione** (`pages/organizzazione.html`) - Scopi, obiettivi e struttura
- **Attività** (`pages/attivita.html`) - Cronaca di avventure e missioni
- **Membri** (`pages/membri.html`) - Roster dei giocatori
- **Contatti** (`pages/contatti.html`) - Informazioni di contatto e FAQ

## 💡 Suggerimenti per il Futuro

- Aggiungi una galleria di immagini stilizzate
- Crea una timeline delle avventure della gilda
- Aggiungi effetti parallasse o animazioni
- Integra un Blog/Cronaca in Markdown
- Aggiungi un form di contatto funzionante (con servizio esterno)
- Crea badge e distintivi per i ruoli

## 📄 Licenza

Questo sito è dedicato alla comunità di **The Miracle Shard**. I contenuti originali sono protetti dai diritti della comunità della gilda.

---

**La Compagnia della Ghironda** | The Miracle Shard - Shard di Ultima Online
