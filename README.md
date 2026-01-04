# Podcast Transcript Extractor

A lightweight, client-side web app that extracts and displays transcripts from Apple Podcasts' local cache files. Load your podcast library database, drag in TTML transcript files, and instantly search across all your podcast transcripts.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)

## Features

- **📁 Local SQLite Database Parsing** – Load your Apple Podcasts library database to get episode metadata (show name, episode title, artwork)
- **📝 TTML Transcript Parsing** – Extract text and timestamps from Apple's cached transcript files
- **🔍 Full-Text Search** – Search across multiple transcripts with highlighted matches
- **📖 Reading View** – Transcripts grouped into readable paragraphs with speaker labels
- **⏱️ Timestamped View** – Sentence-by-sentence view with precise timestamps
- **📋 Copy to Clipboard** – One-click copy of entire transcripts
- **🎨 Clean UI** – Collapsible transcript cards with podcast artwork
- **🔒 Privacy-First** – Everything runs locally in your browser, no data leaves your machine

## How to Use

### Step 1: Locate Your Apple Podcasts Data

Apple Podcasts stores its data in:

```
~/Library/Group Containers/243LU875E5.groups.com.apple.podcasts/
```

You'll need two things:

| File | Location |
|------|----------|
| **Database** | `Documents/MTLibrary.sqlite` |
| **Transcripts** | `Library/Cache/Assets/TTML/` |

### Step 2: Open the App

1. Clone this repo and open `index.html` in your browser, or
2. Use a local development server (e.g., VS Code Live Server)

### Step 3: Load Your Data

1. **Load Database** – Drag and drop `MTLibrary.sqlite` into the first drop zone
2. **Load Transcripts** – Drag TTML files from the cache folder into the second drop zone

### Step 4: Search & Browse

- Use the search bar to find text across all loaded transcripts
- Toggle between 📖 Reading and ⏱️ Timestamped views
- Click 📋 to copy a transcript to your clipboard

## Tech Stack

- **Pure HTML/CSS/JavaScript** – No build tools or frameworks
- **[sql.js](https://github.com/sql-js/sql.js/)** – Browser-based SQLite parsing
- **File API** – Local file reading without uploads
- **DOMParser** – XML/TTML parsing

## File Structure

```
podcast-transcript-extractor/
├── index.html      # Main UI
├── style.css       # Styling
├── app.js          # Core application logic
└── README.md       # This file
```

## Privacy

This app runs entirely in your browser. Your podcast library database and transcripts are never uploaded anywhere. All processing happens locally on your machine.

## Known Limitations

- **Orphaned Transcripts** – TTML files may exist for episodes you've deleted from your library. These will show a warning since metadata can't be found.
- **macOS Only** – Apple Podcasts cache paths are specific to macOS.
- **Safari Compatibility** – Best tested in Chrome/Firefox. Safari may have issues with some file operations.

## Contributing

Pull requests welcome! Please open an issue first to discuss major changes.

## License

MIT License – See [LICENSE](LICENSE) for details.

---

Built with ❤️ for podcast lovers who want to search their transcripts.
