# Mneme

Mneme est une petite application web statique pour apprendre des traductions avec des cartes.

## Lancer l'application

Ouvrir `index.html` dans un navigateur.

Les fichiers nécessaires doivent rester dans le même dossier :

- `index.html`
- `styles.css`
- `app.js`

## Format des cartes

Dans l'éditeur, utiliser une carte par ligne :

```txt
mot; traduction; phrase facultative
bonjour; hello; Bonjour, comment allez-vous ?
merci; thank you; Merci pour votre aide.
```

## Import CSV/TXT

Le menu d'import accepte des fichiers `.csv` ou `.txt` avec ces colonnes :

```csv
mot,traduction,phrase facultative
bonjour,hello,"Bonjour, comment allez-vous ?"
```

Le séparateur peut être une virgule, un point-virgule ou une tabulation.

## Firebase

L'application peut stocker les cartes dans Firebase Firestore.

Renseigner dans l'interface :

- `apiKey`
- `projectId`
- `appId`

Puis utiliser `Enregistrer Firebase` ou `Charger Firebase`.
