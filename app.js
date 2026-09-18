const defaultCards = `bonjour; hello; Bonjour, comment allez-vous ?
merci; thank you; Merci pour votre aide.
livre; book; Je lis un livre le soir.
maison; house; Cette maison est ancienne.
vite; quickly; Il marche vite.`;

const input = document.querySelector("#cards-input");
const flashcard = document.querySelector("#flashcard");
const promptEl = document.querySelector("#card-prompt");
const directionEl = document.querySelector("#card-direction");
const hintEl = document.querySelector("#card-hint");
const answerEl = document.querySelector("#card-answer");
const sentenceEl = document.querySelector("#card-sentence");
const countEl = document.querySelector("#card-count");
const loadButton = document.querySelector("#load-cards");
const resetButton = document.querySelector("#reset-cards");
const revealButton = document.querySelector("#reveal-card");
const shuffleButton = document.querySelector("#shuffle-card");
const nextButton = document.querySelector("#next-card");
const firebaseApiKeyInput = document.querySelector("#firebase-api-key");
const firebaseProjectIdInput = document.querySelector("#firebase-project-id");
const firebaseAppIdInput = document.querySelector("#firebase-app-id");
const saveConfigButton = document.querySelector("#save-config");
const loadRemoteButton = document.querySelector("#load-remote-cards");
const saveRemoteButton = document.querySelector("#save-remote-cards");
const syncStatus = document.querySelector("#sync-status");
const csvFileInput = document.querySelector("#csv-file");
const csvDelimiterInput = document.querySelector("#csv-delimiter");
const csvHasHeaderInput = document.querySelector("#csv-has-header");
const importCsvButton = document.querySelector("#import-csv");
const importSaveCsvButton = document.querySelector("#import-save-csv");

let cards = [];
let currentCard = null;
let revealed = false;
let firestoreDb = null;

function setStatus(message, isError = false) {
  syncStatus.textContent = message;
  syncStatus.classList.toggle("error", isError);
}

function parseCards(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(";").map((part) => part.trim());
      return {
        word: parts[0] || "",
        translation: parts[1] || "",
        sentence: parts.slice(2).join("; ").trim(),
      };
    })
    .filter((card) => card.word && card.translation);
}

function serializeCards(nextCards) {
  return nextCards
    .map((card) => [card.word, card.translation, card.sentence].filter(Boolean).join("; "))
    .join("\n");
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const candidates = [",", ";", "\t"];

  return candidates
    .map((delimiter) => ({
      delimiter,
      count: firstLine.split(delimiter).length,
    }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === delimiter && !inQuotes) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(field.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function csvRowsToCards(rows, hasHeader) {
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .map((row) => ({
      word: row[0] || "",
      translation: row[1] || "",
      sentence: row.slice(2).join(" ").trim(),
    }))
    .filter((card) => card.word && card.translation);
}

function readCsvFile() {
  const file = csvFileInput.files[0];

  if (!file) {
    setStatus("Choisissez un fichier CSV ou TXT.", true);
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      const text = String(reader.result || "");
      const selectedDelimiter = csvDelimiterInput.value;
      const delimiter = selectedDelimiter === "auto"
        ? detectDelimiter(text)
        : selectedDelimiter === "tab"
          ? "\t"
          : selectedDelimiter;
      const rows = parseCsv(text, delimiter);
      const nextCards = csvRowsToCards(rows, csvHasHeaderInput.checked);
      resolve(nextCards);
    });

    reader.addEventListener("error", () => {
      setStatus("Impossible de lire le fichier.", true);
      resolve([]);
    });

    reader.readAsText(file);
  });
}

function getCardId(card) {
  return encodeURIComponent(`${card.word.trim().toLowerCase()}::${card.translation.trim().toLowerCase()}`);
}

function createFirebaseClient() {
  const apiKey = firebaseApiKeyInput.value.trim();
  const projectId = firebaseProjectIdInput.value.trim();
  const appId = firebaseAppIdInput.value.trim();

  if (!apiKey || !projectId || !appId) {
    firestoreDb = null;
    setStatus("Mode local. Ajoutez la configuration Firebase pour utiliser Firestore.");
    return false;
  }

  if (!window.firebase) {
    firestoreDb = null;
    setStatus("Le client Firebase n'a pas pu être chargé.", true);
    return false;
  }

  const appName = `mneme-${projectId}`;
  const existingApp = firebase.apps.find((app) => app.name === appName);
  const app = existingApp || firebase.initializeApp({
    apiKey,
    projectId,
    appId,
    authDomain: `${projectId}.firebaseapp.com`,
  }, appName);

  firestoreDb = firebase.firestore(app);
  localStorage.setItem("mneme.firebaseApiKey", apiKey);
  localStorage.setItem("mneme.firebaseProjectId", projectId);
  localStorage.setItem("mneme.firebaseAppId", appId);
  setStatus("Connecté à Firebase.");
  return true;
}

function loadSavedConfig() {
  firebaseApiKeyInput.value = localStorage.getItem("mneme.firebaseApiKey") || "";
  firebaseProjectIdInput.value = localStorage.getItem("mneme.firebaseProjectId") || "";
  firebaseAppIdInput.value = localStorage.getItem("mneme.firebaseAppId") || "";

  if (firebaseApiKeyInput.value && firebaseProjectIdInput.value && firebaseAppIdInput.value) {
    createFirebaseClient();
  }
}

function updateCount() {
  const label = cards.length > 1 ? "cartes" : "carte";
  countEl.textContent = `${cards.length} ${label}`;
}

function pickCard() {
  if (cards.length === 0) {
    currentCard = null;
    promptEl.textContent = "Aucune carte";
    directionEl.textContent = "Liste vide";
    hintEl.textContent = "Ajoutez au moins une ligne valide";
    answerEl.hidden = true;
    sentenceEl.hidden = true;
    return;
  }

  const card = cards[Math.floor(Math.random() * cards.length)];
  const reverse = Math.random() >= 0.5;

  currentCard = {
    prompt: reverse ? card.translation : card.word,
    answer: reverse ? card.word : card.translation,
    sentence: card.sentence,
    direction: reverse ? "Traduction → mot" : "Mot → traduction",
  };

  revealed = false;
  renderCard();
}

function renderCard() {
  if (!currentCard) {
    return;
  }

  promptEl.textContent = currentCard.prompt;
  directionEl.textContent = currentCard.direction;
  hintEl.hidden = revealed;
  hintEl.textContent = "Cliquer pour révéler";
  answerEl.hidden = !revealed;
  sentenceEl.hidden = !revealed || !currentCard.sentence;
  answerEl.textContent = currentCard.answer;
  sentenceEl.textContent = currentCard.sentence;
}

function revealCard() {
  if (!currentCard) {
    return;
  }

  revealed = true;
  renderCard();
}

function loadCards() {
  cards = parseCards(input.value);
  updateCount();
  pickCard();
}

async function loadRemoteCards() {
  if (!firestoreDb && !createFirebaseClient()) {
    return;
  }

  setStatus("Chargement des cartes...");

  try {
    const snapshot = await firestoreDb.collection("cards").orderBy("updatedAt", "asc").get();
    cards = snapshot.docs
      .map((cardDoc) => cardDoc.data())
      .map((card) => ({
        word: card.word || "",
        translation: card.translation || "",
        sentence: card.sentence || "",
      }))
      .filter((card) => card.word && card.translation);

    input.value = serializeCards(cards);
    updateCount();
    pickCard();
    setStatus(`${cards.length} carte(s) chargée(s) depuis Firebase.`);
  } catch (error) {
    setStatus(`Erreur Firebase : ${error.message}`, true);
  }
}

async function saveRemoteCards() {
  const nextCards = parseCards(input.value);

  await saveCardsToRemote(nextCards);
}

async function saveCardsToRemote(nextCards) {

  if (!firestoreDb && !createFirebaseClient()) {
    return;
  }

  if (nextCards.length === 0) {
    setStatus("Aucune carte valide à enregistrer.", true);
    return;
  }

  setStatus("Enregistrement des cartes...");

  try {
    await Promise.all(
      nextCards.map((card) =>
        firestoreDb.collection("cards").doc(getCardId(card)).set(
          {
            ...card,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
      ),
    );

    cards = nextCards;
    updateCount();
    pickCard();
    setStatus(`${nextCards.length} carte(s) enregistrée(s) dans Firebase.`);
  } catch (error) {
    setStatus(`Erreur Firebase : ${error.message}`, true);
  }
}

async function importCsvToList() {
  const nextCards = await readCsvFile();

  if (nextCards.length === 0) {
    setStatus("Aucune carte valide trouvée dans le fichier.", true);
    return;
  }

  input.value = serializeCards(nextCards);
  cards = nextCards;
  updateCount();
  pickCard();
  setStatus(`${nextCards.length} carte(s) importée(s) depuis le fichier.`);
}

async function importCsvAndSave() {
  const nextCards = await readCsvFile();

  if (nextCards.length === 0) {
    setStatus("Aucune carte valide trouvée dans le fichier.", true);
    return;
  }

  input.value = serializeCards(nextCards);
  await saveCardsToRemote(nextCards);
}

flashcard.addEventListener("click", revealCard);
revealButton.addEventListener("click", revealCard);
shuffleButton.addEventListener("click", pickCard);
nextButton.addEventListener("click", pickCard);
loadButton.addEventListener("click", loadCards);
saveConfigButton.addEventListener("click", createFirebaseClient);
loadRemoteButton.addEventListener("click", loadRemoteCards);
saveRemoteButton.addEventListener("click", saveRemoteCards);
importCsvButton.addEventListener("click", importCsvToList);
importSaveCsvButton.addEventListener("click", importCsvAndSave);
resetButton.addEventListener("click", () => {
  input.value = defaultCards;
  loadCards();
});

loadSavedConfig();
loadCards();
