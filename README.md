# Mneme

Mneme est une petite application web statique pour apprendre des traductions avec des cartes.

## Lancer l'application

Ouvrir `index.html` dans un navigateur.

Les fichiers nécessaires doivent rester dans le même dossier :

- `index.html`
- `styles.css`
- `app.js`
- `firebase-config.js`

## Format des cartes

Les decks s'importent depuis un fichier CSV ou TXT avec ces colonnes :

```txt
mot; traduction; phrase facultative; synonymes anglais facultatifs
bonjour; hello; Bonjour, comment allez-vous ?; hi / hey
merci; thank you; Merci pour votre aide.
```

## Import CSV/TXT

Le bouton `Importer un deck` ouvre une fenêtre de sélection de fichier. Le nom du deck est proposé à partir du nom du fichier, puis il peut être modifié avant enregistrement.

```csv
mot,traduction,phrase facultative
bonjour,hello,"Bonjour, comment allez-vous ?"
```

Le séparateur peut être une virgule, un point-virgule ou une tabulation. Une 4e colonne facultative peut contenir des synonymes anglais acceptes pour la saisie `FR -> EN`.

Le bouton `Charger un deck` ouvre la liste des decks enregistrés dans Firebase. Chaque deck affiche le ratio cartes deja reussies au moins une fois / total, et un bouton `Modifier` permet de supprimer des lignes importees par erreur avant sauvegarde.

## Revision

Chaque mot cree deux cartes independantes :

- `EN -> FR` : active des l'import.
- `FR -> EN` : verrouillee au depart, puis debloquee des que `EN -> FR` passe en revision.

Chaque sens a sa propre progression de repetition, son propre `ease`, son intervalle, ses oublis et sa note.

`EN -> FR` se fait en revelation classique. `FR -> EN` demande une saisie tapee avec correction automatique tolerante aux fautes simples et aux synonymes anglais importes.

Apres revelation ou correction automatique, quatre scores apparaissent :

- `0 Oublié` : ajoute une erreur, passe en reapprentissage, et garde environ la moitie de l'intervalle si la carte etait deja en revision.
- `1 Difficile` : fait peu progresser l'intervalle, baisse l'ease.
- `2 Correct` : ajoute une reponse correcte et suit la progression normale.
- `3 Facile` : ajoute une reponse correcte et allonge l'intervalle.

Un oubli en revision conserve environ la moitie de l'intervalle au lieu de tout perdre. Les cartes soeurs sont enterrees jusqu'au lendemain pour eviter qu'une reponse revele l'autre sens. Si `EN -> FR` est rate, `FR -> EN` est retrograde.

Chaque carte conserve deux sous-cartes :

- `reviewCards.en_fr` pour `EN -> FR`
- `reviewCards.fr_en` pour `FR -> EN`

Chaque sous-carte contient `state`, `ease`, `interval`, `reps`, `lapses`, `due`, `buried_until`, `note`, `noteLabel`, `reviewedAt`, `reviewDirection`, `reviewPrompt`, `reviewAnswer` et `nextReviewInDays`.

Pour une lecture plus directe dans Firestore, la carte expose aussi des champs plats :

- `note_fr_en`, `noteLabel_fr_en`, `next_review_fr_en`, `level_fr_en`
- `note_en_fr`, `noteLabel_en_fr`, `next_review_en_fr`, `level_en_fr`

Chaque reponse met a jour seulement le sens interroge.

Dans Firestore, ces champs sont dans chaque objet du tableau `cards` du document `decks/{deckId}`.

## Firebase

L'application stocke les decks dans Firebase Firestore, collection `decks`.

Pour ne pas ressaisir ces valeurs, remplir le fichier local `firebase-config.js` :

```js
window.MNEME_FIREBASE_CONFIG = {
  apiKey: "AIza...",
  projectId: "mon-projet",
  appId: "1:123:web:abc",
};
```

Ce fichier est ignoré par Git. Le fichier `firebase-config.example.js` sert de modèle.
