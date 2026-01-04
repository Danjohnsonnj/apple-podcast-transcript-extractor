document.addEventListener("DOMContentLoaded", () => {
	// DOM Elements
	const dbDropZone = document.getElementById("db-drop-zone");
	const dbFileInput = document.getElementById("db-file-input");
	const dbStatus = document.getElementById("db-status");

	const ttmlDropZone = document.getElementById("ttml-drop-zone");
	const ttmlFileInput = document.getElementById("ttml-file-input");

	const searchSection = document.getElementById("search-section");
	const searchInput = document.getElementById("search-input");
	const resultCount = document.getElementById("result-count");
	const resultsContainer = document.getElementById("results-container");
	const transcriptManagement = document.getElementById("transcript-management");
	const episodeCountEl = document.getElementById("episode-count");
	const clearAllBtn = document.getElementById("clear-all-btn");

	// State
	let db = null; // SQLite database instance
	let episodeMap = new Map(); // Maps asset ID -> episode metadata
	let episodes = []; // Loaded transcript data

	// =====================
	// Transcript Management
	// =====================

	clearAllBtn.addEventListener("click", () => {
		if (episodes.length === 0) return;

		if (confirm(`Remove all ${episodes.length} transcript(s)?`)) {
			episodes = [];
			updateTranscriptUI();
		}
	});

	function removeEpisode(episodeId) {
		episodes = episodes.filter((ep) => ep.id !== episodeId);
		updateTranscriptUI();
	}

	function updateTranscriptUI() {
		resultsContainer.innerHTML = "";
		resultCount.textContent = "";
		searchInput.value = "";

		if (episodes.length === 0) {
			searchSection.style.display = "none";
			transcriptManagement.style.display = "none";
		} else {
			searchSection.style.display = "flex";
			transcriptManagement.style.display = "flex";
			episodeCountEl.textContent = `${episodes.length} transcript${
				episodes.length !== 1 ? "s" : ""
			} loaded`;
			episodes.forEach((ep) => renderEpisode(ep));
		}
	}

	// =====================
	// Database Handling
	// =====================

	dbDropZone.addEventListener("click", () => dbFileInput.click());

	dbDropZone.addEventListener("dragover", (e) => {
		e.preventDefault();
		dbDropZone.classList.add("drag-over");
	});

	dbDropZone.addEventListener("dragleave", () => {
		dbDropZone.classList.remove("drag-over");
	});

	dbDropZone.addEventListener("drop", (e) => {
		e.preventDefault();
		dbDropZone.classList.remove("drag-over");
		if (e.dataTransfer.files.length > 0) {
			loadDatabase(e.dataTransfer.files[0]);
		}
	});

	dbFileInput.addEventListener("change", (e) => {
		if (e.target.files.length > 0) {
			loadDatabase(e.target.files[0]);
		}
	});

	async function loadDatabase(file) {
		dbStatus.className = "status-message info";
		dbStatus.textContent = "Loading database...";

		try {
			const arrayBuffer = await file.arrayBuffer();
			const uintArray = new Uint8Array(arrayBuffer);

			// Initialize SQL.js
			const SQL = await initSqlJs({
				locateFile: (file) =>
					`https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`,
			});

			db = new SQL.Database(uintArray);

			// Query the database for episode information
			// The schema may vary; we'll try common table names
			const episodeCount = buildEpisodeMap();

			dbStatus.className = "status-message success";
			dbStatus.textContent = `✓ Database loaded! Found ${episodeCount} episodes. Refresh page to load a different database.`;

			// Hide the drop zone after successful load
			dbDropZone.style.display = "none";
		} catch (error) {
			console.error("Database load error:", error);
			dbStatus.className = "status-message error";
			dbStatus.textContent = `Error loading database: ${error.message}`;
		}
	}

	// Helper: Extract numeric ID (10+ digits) from a string
	function extractNumericId(str) {
		if (!str) return null;
		const match = String(str).match(/(\d{10,})/);
		return match ? match[1] : null;
	}

	function buildEpisodeMap() {
		episodeMap.clear();

		// Check for required tables
		let tables = [];
		try {
			const tableResult = db.exec(
				"SELECT name FROM sqlite_master WHERE type='table'"
			);
			if (tableResult.length > 0) {
				tables = tableResult[0].values.map((row) => row[0]);
			}
		} catch (e) {
			console.error("Could not list tables:", e);
			return 0;
		}

		if (!tables.includes("ZMTEPISODE")) {
			console.warn("ZMTEPISODE table not found in database");
			return 0;
		}

		try {
			const query = `
                    SELECT 
                        e.ZSTORETRACKID,
                        e.ZASSETURL,
                        e.ZTITLE,
                        e.ZCLEANEDTITLE,
                        e.ZDURATION,
                        e.ZUUID,
                        e.ZGUID,
                        e.ZENTITLEDTRANSCRIPTIDENTIFIER,
                        e.ZFREETRANSCRIPTIDENTIFIER,
                        e.ZENCLOSUREURL,
                        e.ZPODCAST,
                        p.ZTITLE as podcast_title,
                        p.ZAUTHOR,
                        p.ZIMAGEURL
                    FROM ZMTEPISODE e
                    LEFT JOIN ZMTPODCAST p ON e.ZPODCAST = p.Z_PK
                `;

			let result;
			try {
				result = db.exec(query);
			} catch (queryError) {
				// Fallback: query episode table without join
				result = db.exec(`
					SELECT 
						ZSTORETRACKID, ZASSETURL, ZTITLE, ZCLEANEDTITLE,
						ZDURATION, ZUUID, ZGUID,
						ZENTITLEDTRANSCRIPTIDENTIFIER, ZFREETRANSCRIPTIDENTIFIER,
						ZENCLOSUREURL, ZPODCAST
					FROM ZMTEPISODE
				`);
			}

			if (result.length === 0) return 0;

			const columns = result[0].columns;
			const rows = result[0].values;

			rows.forEach((row) => {
				// Convert row array to object
				const episode = {};
				columns.forEach((col, i) => {
					episode[col] = row[i];
				});

				const metadata = {
					title: episode.ZTITLE || episode.ZCLEANEDTITLE || "Unknown Episode",
					showName: episode.podcast_title || "Unknown Show",
					author: episode.ZAUTHOR,
					artworkUrl: episode.ZIMAGEURL,
					duration: episode.ZDURATION,
					guid: episode.ZGUID,
				};

				// Helper to add ID mappings
				const addMapping = (value) => {
					if (!value) return;
					episodeMap.set(String(value), metadata);
					const numericId = extractNumericId(value);
					if (numericId) {
						episodeMap.set(numericId, metadata);
					}
				};

				// Map by various identifiers for flexible lookup
				addMapping(episode.ZSTORETRACKID);
				addMapping(episode.ZENTITLEDTRANSCRIPTIDENTIFIER);
				addMapping(episode.ZFREETRANSCRIPTIDENTIFIER);
				addMapping(episode.ZASSETURL);
				addMapping(episode.ZENCLOSUREURL);
				addMapping(episode.ZUUID);
				addMapping(episode.ZGUID);
			});
		} catch (e) {
			console.error("Error building episode map:", e);
		}

		return episodeMap.size;
	}

	function lookupMetadata(assetId) {
		// Try direct lookup first (most common case)
		if (episodeMap.has(assetId)) {
			return episodeMap.get(assetId);
		}

		// Try partial match - key contains assetId
		for (const [key, value] of episodeMap) {
			if (key.includes(assetId)) {
				return value;
			}
		}

		return null;
	}

	// =====================
	// TTML File Handling
	// =====================

	ttmlDropZone.addEventListener("click", () => ttmlFileInput.click());

	ttmlDropZone.addEventListener("dragover", (e) => {
		e.preventDefault();
		ttmlDropZone.classList.add("drag-over");
	});

	ttmlDropZone.addEventListener("dragleave", () => {
		ttmlDropZone.classList.remove("drag-over");
	});

	ttmlDropZone.addEventListener("drop", (e) => {
		e.preventDefault();
		ttmlDropZone.classList.remove("drag-over");
		handleTTMLFiles(e.dataTransfer.files);
	});

	ttmlFileInput.addEventListener("change", (e) => {
		handleTTMLFiles(e.target.files);
	});

	function handleTTMLFiles(files) {
		Array.from(files).forEach(processFile);
	}

	async function processFile(file) {
		try {
			// Extract ID from filename (e.g., transcript_1000672687584.ttml)
			const idMatch = file.name.match(/transcript[_-]?(\d+)/i);
			const assetId = idMatch ? idMatch[1] : null;

			// Read and parse file
			const textContent = await readFileAsText(file);
			const lines = parseTTML(textContent);
			const paragraphs = groupIntoParagraphs(lines);

			// Lookup metadata from database
			const metadata = assetId ? lookupMetadata(assetId) : null;

			// Create episode object
			const episode = {
				id: assetId || file.name,
				filename: file.name,
				lines: lines,
				paragraphs: paragraphs,
				metadata: metadata,
			};

			// Add to state
			episodes.push(episode);

			// Show management and search sections
			searchSection.style.display = "flex";
			transcriptManagement.style.display = "flex";
			episodeCountEl.textContent = `${episodes.length} transcript${
				episodes.length !== 1 ? "s" : ""
			} loaded`;

			// Render
			renderEpisode(episode);
		} catch (error) {
			console.error(`Error processing ${file.name}:`, error);
		}
	}

	function readFileAsText(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = reject;
			reader.readAsText(file);
		});
	}

	function parseTTML(xmlString) {
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(xmlString, "text/xml");
		const lines = [];

		// Apple Podcasts TTML structure:
		// <p> (with ttm:agent for speaker) contains
		//   <span podcasts:unit="sentence"> contains
		//     <span podcasts:unit="word"> for each word

		// First, try to find sentence-level spans (Apple Podcasts format)
		const sentences = xmlDoc.querySelectorAll(
			'span[*|unit="sentence"], span[podcasts\\:unit="sentence"]'
		);

		if (sentences.length > 0) {
			sentences.forEach((sentence) => {
				const begin = sentence.getAttribute("begin");
				const end = sentence.getAttribute("end");

				// Get word spans within this sentence and join with spaces
				const wordSpans = sentence.querySelectorAll(
					'span[*|unit="word"], span[podcasts\\:unit="word"]'
				);
				let text;
				if (wordSpans.length > 0) {
					text = Array.from(wordSpans)
						.map((w) => w.textContent.trim())
						.join(" ");
				} else {
					text = sentence.textContent.trim();
				}

				// Get speaker from parent <p> element
				const parentP = sentence.closest("p");
				let speaker = null;
				if (parentP) {
					speaker =
						parentP.getAttribute("ttm:agent") ||
						parentP.getAttribute("agent") ||
						null;
				}

				if (text) {
					lines.push({
						time: formatTime(begin),
						rawTime: begin,
						rawEndTime: end,
						endTime: formatTime(end),
						text: text,
						speaker: speaker,
					});
				}
			});
		} else {
			// Fallback: Look for <p> tags with timing (standard TTML)
			const pElements = xmlDoc.querySelectorAll("p[begin]");

			pElements.forEach((el) => {
				const begin = el.getAttribute("begin");
				const end = el.getAttribute("end");

				// Check if there are word-level spans inside
				const wordSpans = el.querySelectorAll("span[begin]");
				let text;
				if (wordSpans.length > 0) {
					text = Array.from(wordSpans)
						.map((w) => w.textContent.trim())
						.join(" ");
				} else {
					text = el.textContent.trim();
				}

				let speaker =
					el.getAttribute("ttm:agent") ||
					el.getAttribute("agent") ||
					el.getAttribute("ttm:role") ||
					el.getAttribute("role") ||
					null;

				if (text) {
					lines.push({
						time: formatTime(begin),
						rawTime: begin,
						rawEndTime: end,
						endTime: formatTime(end),
						text: text,
						speaker: speaker,
					});
				}
			});
		}

		// If still no elements found, try getting all <p> elements
		if (lines.length === 0) {
			const pElements = xmlDoc.querySelectorAll("p");
			pElements.forEach((el) => {
				const text = el.textContent.trim();
				if (text) {
					lines.push({
						time: "",
						rawTime: "",
						rawEndTime: "",
						endTime: "",
						text: text,
						speaker: null,
					});
				}
			});
		}

		return lines;
	}

	function formatTime(timeStr) {
		if (!timeStr) return "";

		// Handle HH:MM:SS.mmm format
		const match = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})\.?(\d*)/);
		if (match) {
			const hours = parseInt(match[1]);
			const minutes = match[2];
			const seconds = match[3];

			if (hours > 0) {
				return `${hours}:${minutes}:${seconds}`;
			} else {
				return `${parseInt(minutes)}:${seconds}`;
			}
		}

		return timeStr;
	}

	// Parse time string to seconds for comparison
	function parseTimeToSeconds(timeStr) {
		if (!timeStr) return null;
		const match = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})\.?(\d*)?/);
		if (match) {
			const hours = parseInt(match[1]);
			const minutes = parseInt(match[2]);
			const seconds = parseInt(match[3]);
			const ms = match[4] ? parseInt(match[4].padEnd(3, "0").slice(0, 3)) : 0;
			return hours * 3600 + minutes * 60 + seconds + ms / 1000;
		}
		return null;
	}

	// Group lines into readable paragraphs
	function groupIntoParagraphs(lines, pauseThreshold = 1.5) {
		if (lines.length === 0) return [];

		const paragraphs = [];
		let currentParagraph = {
			startTime: lines[0].time,
			endTime: lines[0].endTime || lines[0].time,
			speaker: lines[0].speaker,
			lines: [lines[0]],
			text: lines[0].text,
		};

		for (let i = 1; i < lines.length; i++) {
			const prevLine = lines[i - 1];
			const currLine = lines[i];

			// Calculate pause between previous end and current start
			const prevEnd =
				parseTimeToSeconds(prevLine.rawEndTime) ||
				parseTimeToSeconds(prevLine.rawTime);
			const currStart = parseTimeToSeconds(currLine.rawTime);
			const pause = prevEnd && currStart ? currStart - prevEnd : 0;

			// Check if we should start a new paragraph
			const hasSentenceEnd = /[.!?]\s*$/.test(prevLine.text);
			const speakerChanged =
				currLine.speaker && currLine.speaker !== currentParagraph.speaker;
			const longPause = pause >= pauseThreshold;
			const paragraphTooLong = currentParagraph.text.split(/\s+/).length > 150;

			if ((hasSentenceEnd && longPause) || speakerChanged || paragraphTooLong) {
				// Finalize current paragraph
				currentParagraph.endTime = prevLine.endTime || prevLine.time;
				paragraphs.push(currentParagraph);

				// Start new paragraph
				currentParagraph = {
					startTime: currLine.time,
					endTime: currLine.endTime || currLine.time,
					speaker: currLine.speaker,
					lines: [currLine],
					text: currLine.text,
				};
			} else {
				// Continue current paragraph
				currentParagraph.lines.push(currLine);
				currentParagraph.text += " " + currLine.text;
				currentParagraph.endTime = currLine.endTime || currLine.time;
			}
		}

		// Don't forget the last paragraph
		paragraphs.push(currentParagraph);

		return paragraphs;
	}

	// =====================
	// Search Functionality
	// =====================

	const searchBtn = document.getElementById("search-btn");
	const stopBtn = document.getElementById("stop-btn");
	let searchCancelled = false;

	// Search on button click
	searchBtn.addEventListener("click", () => {
		performSearch(searchInput.value.trim());
	});

	// Search on Enter key
	searchInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			performSearch(searchInput.value.trim());
		}
	});

	// Stop button
	stopBtn.addEventListener("click", () => {
		searchCancelled = true;
	});

	async function performSearch(query) {
		// Reset UI
		resultsContainer.innerHTML = "";
		searchCancelled = false;

		if (!query) {
			resultCount.textContent = "";
			episodes.forEach((ep) => renderEpisode(ep));
			return;
		}

		// Show searching state
		searchBtn.disabled = true;
		stopBtn.style.display = "inline-block";
		resultCount.textContent = "Searching...";

		const lowerQuery = query.toLowerCase();
		let totalMatches = 0;
		let matchingEpisodes = 0;
		let processed = 0;

		for (const episode of episodes) {
			// Check if cancelled
			if (searchCancelled) {
				resultCount.textContent = `Search stopped. Found ${totalMatches} matches in ${matchingEpisodes} files (${processed}/${episodes.length} searched)`;
				break;
			}

			const matchingLines = episode.lines.filter((line) =>
				line.text.toLowerCase().includes(lowerQuery)
			);

			if (matchingLines.length > 0) {
				matchingEpisodes++;
				totalMatches += matchingLines.length;
				renderEpisode(episode, query, matchingLines);
			}

			processed++;

			// Update progress and yield to UI every 10 episodes
			if (processed % 10 === 0) {
				resultCount.textContent = `Searching... (${processed}/${episodes.length})`;
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		// Final results
		if (!searchCancelled) {
			resultCount.textContent = `${totalMatches} matches in ${matchingEpisodes} files`;
		}

		// Reset UI state
		searchBtn.disabled = false;
		stopBtn.style.display = "none";
	}

	// =====================
	// Rendering
	// =====================

	function renderEpisode(episode, query = "", filteredLines = null) {
		const card = document.createElement("div");
		card.className = "episode-card";

		const meta = episode.metadata;
		const hasMetadata = meta !== null;
		const title = meta?.title || "Unknown Episode";
		const showName = meta?.showName || "Unknown Show";
		const artworkUrl = meta?.artworkUrl || "";
		const notFoundNote = !hasMetadata
			? `<p class="not-found-note">⚠️ Episode ID ${episode.id} not found in database (may have been removed from library)</p>`
			: "";

		const highlight = (text) => {
			if (!query) return escapeHtml(text);
			const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
			return escapeHtml(text).replace(regex, "<mark>$1</mark>");
		};

		// Determine if transcript should be expanded (auto-expand when searching)
		const isExpanded = query !== "";
		const expandedClass = isExpanded ? "expanded" : "";
		const collapsedClass = isExpanded ? "" : "collapsed";
		const toggleText = isExpanded ? "Hide transcript" : "Show transcript";

		// Generate paragraph-based content (reading view)
		const paragraphs = episode.paragraphs || [];
		let displayParagraphs = paragraphs;

		// If searching, filter paragraphs that contain matches
		if (query && filteredLines) {
			const lowerQuery = query.toLowerCase();
			displayParagraphs = paragraphs.filter((p) =>
				p.text.toLowerCase().includes(lowerQuery)
			);
		}

		const paragraphsHtml =
			displayParagraphs.length === 0
				? "<p>No transcript content found.</p>"
				: displayParagraphs
						.map((p) => {
							const timeRange =
								p.endTime && p.endTime !== p.startTime
									? `${p.startTime} – ${p.endTime}`
									: p.startTime;
							const speakerLabel = p.speaker
								? `<span class="speaker">${escapeHtml(p.speaker)}:</span> `
								: "";
							return `
					<div class="paragraph">
						<span class="paragraph-time">${timeRange}</span>
						<p class="paragraph-text">${speakerLabel}${highlight(p.text)}</p>
					</div>
				`;
						})
						.join("");

		// Generate line-based content (timestamped view) for search results
		const displayLines = filteredLines || episode.lines;
		const linesHtml =
			displayLines.length === 0
				? "<p>No transcript content found.</p>"
				: displayLines
						.map(
							(line) => `
				<div class="line">
					<span class="time">${line.time}</span>
					<span class="text">${highlight(line.text)}</span>
				</div>
			`
						)
						.join("");

		const paragraphCount = paragraphs.length;

		card.innerHTML = `
            <button class="remove-episode-btn" title="Remove this transcript" aria-label="Remove transcript">&times;</button>
            <div class="meta-header">
                ${
									artworkUrl
										? `<img src="${artworkUrl}" class="artwork" alt="Artwork" onerror="this.style.display='none'">`
										: '<div class="artwork"></div>'
								}
                <div class="meta-info">
                    <p class="show-name" contenteditable="true" title="Click to edit">${escapeHtml(
											showName
										)}</p>
                    <h3 contenteditable="true" title="Click to edit">${escapeHtml(
											title
										)}</h3>
                    <p class="file-name">📄 ${escapeHtml(episode.filename)}</p>
                    ${notFoundNote}
                    ${
											query
												? `<p class="match-count">🔍 ${displayParagraphs.length} sections with matches</p>`
												: ""
										}
                </div>
            </div>
            <div class="transcript-controls">
                <button class="transcript-toggle ${expandedClass}" aria-expanded="${isExpanded}">
                    <span class="chevron">▶</span>
                    <span class="toggle-text">${toggleText}</span>
                    <span class="line-count">(${paragraphCount} paragraphs)</span>
                </button>
                <div class="view-mode-toggle">
                    <button class="view-mode-btn active" data-mode="reading" title="Reading view">📖</button>
                    <button class="view-mode-btn" data-mode="timestamped" title="Timestamped view">⏱️</button>
                    <button class="copy-btn" title="Copy transcript">📋</button>
                </div>
            </div>
            <div class="transcript-content ${collapsedClass}">
                <div class="transcript-view reading-view">${paragraphsHtml}</div>
                <div class="transcript-view timestamped-view" style="display: none;">${linesHtml}</div>
            </div>
        `;

		// Add toggle event listener
		const toggleBtn = card.querySelector(".transcript-toggle");
		const transcriptContent = card.querySelector(".transcript-content");
		const toggleTextSpan = card.querySelector(".toggle-text");

		toggleBtn.addEventListener("click", () => {
			const isCurrentlyExpanded = toggleBtn.classList.contains("expanded");

			if (isCurrentlyExpanded) {
				toggleBtn.classList.remove("expanded");
				transcriptContent.classList.add("collapsed");
				toggleBtn.setAttribute("aria-expanded", "false");
				toggleTextSpan.textContent = "Show transcript";
			} else {
				toggleBtn.classList.add("expanded");
				transcriptContent.classList.remove("collapsed");
				toggleBtn.setAttribute("aria-expanded", "true");
				toggleTextSpan.textContent = "Hide transcript";
			}
		});

		// View mode toggle
		const viewModeBtns = card.querySelectorAll(".view-mode-btn");
		const readingView = card.querySelector(".reading-view");
		const timestampedView = card.querySelector(".timestamped-view");

		viewModeBtns.forEach((btn) => {
			btn.addEventListener("click", () => {
				viewModeBtns.forEach((b) => b.classList.remove("active"));
				btn.classList.add("active");

				if (btn.dataset.mode === "reading") {
					readingView.style.display = "block";
					timestampedView.style.display = "none";
				} else {
					readingView.style.display = "none";
					timestampedView.style.display = "block";
				}
			});
		});

		// Copy button
		const copyBtn = card.querySelector(".copy-btn");
		copyBtn.addEventListener("click", async () => {
			// Get plain text version of transcript
			const plainText = paragraphs
				.map((p) => {
					const speaker = p.speaker ? `${p.speaker}: ` : "";
					return speaker + p.text;
				})
				.join("\n\n");

			try {
				await navigator.clipboard.writeText(plainText);
				copyBtn.textContent = "✓";
				setTimeout(() => {
					copyBtn.textContent = "📋";
				}, 2000);
			} catch (err) {
				console.error("Copy failed:", err);
				copyBtn.textContent = "❌";
				setTimeout(() => {
					copyBtn.textContent = "📋";
				}, 2000);
			}
		});

		resultsContainer.appendChild(card);

		// Add remove button event listener
		const removeBtn = card.querySelector(".remove-episode-btn");
		removeBtn.addEventListener("click", () => {
			removeEpisode(episode.id);
		});
	}

	function escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}

	function escapeRegex(string) {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
});
