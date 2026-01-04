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

	// State
	let db = null; // SQLite database instance
	let episodeMap = new Map(); // Maps asset ID -> episode metadata
	let episodes = []; // Loaded transcript data

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
			dbStatus.textContent = `✓ Database loaded! Found ${episodeCount} episodes.`;
		} catch (error) {
			console.error("Database load error:", error);
			dbStatus.className = "status-message error";
			dbStatus.textContent = `Error loading database: ${error.message}`;
		}
	}

	function buildEpisodeMap() {
		episodeMap.clear();

		// Try to find the episodes table
		// Common table names in Apple Podcasts: ZMTEPISODE, ZMTPODCAST
		let tables = [];
		try {
			const tableResult = db.exec(
				"SELECT name FROM sqlite_master WHERE type='table'"
			);
			if (tableResult.length > 0) {
				tables = tableResult[0].values.map((row) => row[0]);
			}
			console.log("Database tables:", tables);
		} catch (e) {
			console.error("Could not list tables:", e);
		}

		// Try ZMTEPISODE table (common in Apple Podcasts)
		if (tables.includes("ZMTEPISODE")) {
			try {
				// First, let's see the schema for both tables
				const episodeSchema = db.exec("PRAGMA table_info(ZMTEPISODE)");
				if (episodeSchema.length > 0) {
					console.log(
						"ZMTEPISODE columns:",
						episodeSchema[0].values.map((r) => r[1])
					);
				}

				const podcastSchema = db.exec("PRAGMA table_info(ZMTPODCAST)");
				if (podcastSchema.length > 0) {
					console.log(
						"ZMTPODCAST columns:",
						podcastSchema[0].values.map((r) => r[1])
					);
				}

				// First, try a simple query to verify data exists
				const countResult = db.exec("SELECT COUNT(*) FROM ZMTEPISODE");
				console.log(
					"Total episodes in database:",
					countResult[0]?.values[0][0]
				);

				// Test a simple query first to see what's in the table
				const testQuery = db.exec(
					"SELECT ZSTORETRACKID, ZTITLE, ZPODCAST FROM ZMTEPISODE LIMIT 5"
				);
				console.log("Test query result:", testQuery);
				if (testQuery.length > 0) {
					console.log("Test query columns:", testQuery[0].columns);
					console.log("Test query first rows:", testQuery[0].values);
				}

				// Check if ZMTPODCAST has data
				const podcastCount = db.exec("SELECT COUNT(*) FROM ZMTPODCAST");
				console.log(
					"Total podcasts in database:",
					podcastCount[0]?.values[0][0]
				);

				// Simpler query - only select columns we know exist
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

				console.log("Executing main query...");
				let result;
				try {
					result = db.exec(query);
					console.log("Query result length:", result.length);
					if (result.length > 0) {
						console.log("Query returned", result[0].values.length, "rows");
					}
				} catch (queryError) {
					console.error("Query failed:", queryError);
					// Fallback: just query episode table without join
					console.log("Trying fallback query without JOIN...");
					result = db.exec(`
						SELECT 
							ZSTORETRACKID,
							ZASSETURL,
							ZTITLE,
							ZCLEANEDTITLE,
							ZDURATION,
							ZUUID,
							ZGUID,
							ZENTITLEDTRANSCRIPTIDENTIFIER,
							ZFREETRANSCRIPTIDENTIFIER,
							ZENCLOSUREURL,
							ZPODCAST
						FROM ZMTEPISODE
					`);
					console.log(
						"Fallback query returned",
						result[0]?.values?.length || 0,
						"rows"
					);
				}

				if (result.length > 0) {
					const columns = result[0].columns;
					const rows = result[0].values;

					console.log(`Processing ${rows.length} rows`);

					// Log first few rows for debugging
					console.log(
						"Sample episode data:",
						rows.slice(0, 3).map((row) => {
							const obj = {};
							columns.forEach((col, i) => (obj[col] = row[i]));
							return obj;
						})
					);

					rows.forEach((row) => {
						const episode = {};
						columns.forEach((col, i) => {
							episode[col] = row[i];
						});

						const metaData = {
							title:
								episode.ZTITLE || episode.ZCLEANEDTITLE || "Unknown Episode",
							showName: episode.podcast_title || "Unknown Show",
							author: episode.ZAUTHOR,
							artworkUrl: episode.ZIMAGEURL,
							duration: episode.ZDURATION,
							guid: episode.ZGUID,
						};

						// Map by ZSTORETRACKID (this is likely the ID in the filename)
						if (episode.ZSTORETRACKID) {
							episodeMap.set(String(episode.ZSTORETRACKID), metaData);
						}

						// Map by transcript identifiers
						if (episode.ZENTITLEDTRANSCRIPTIDENTIFIER) {
							// Extract numeric ID if present
							const idMatch = String(
								episode.ZENTITLEDTRANSCRIPTIDENTIFIER
							).match(/(\d{10,})/);
							if (idMatch) {
								episodeMap.set(idMatch[1], metaData);
							}
							episodeMap.set(
								String(episode.ZENTITLEDTRANSCRIPTIDENTIFIER),
								metaData
							);
						}

						if (episode.ZFREETRANSCRIPTIDENTIFIER) {
							const idMatch = String(episode.ZFREETRANSCRIPTIDENTIFIER).match(
								/(\d{10,})/
							);
							if (idMatch) {
								episodeMap.set(idMatch[1], metaData);
							}
							episodeMap.set(
								String(episode.ZFREETRANSCRIPTIDENTIFIER),
								metaData
							);
						}

						// Map by ZASSETURL ID
						if (episode.ZASSETURL) {
							const idMatch = String(episode.ZASSETURL).match(/(\d{10,})/);
							if (idMatch) {
								episodeMap.set(idMatch[1], metaData);
							}
						}

						// Map by ZENCLOSUREURL ID
						if (episode.ZENCLOSUREURL) {
							const idMatch = String(episode.ZENCLOSUREURL).match(/(\d{10,})/);
							if (idMatch) {
								episodeMap.set(idMatch[1], metaData);
							}
						}

						// Map by UUID
						if (episode.ZUUID) {
							episodeMap.set(String(episode.ZUUID), metaData);
						}

						// Map by GUID
						if (episode.ZGUID) {
							episodeMap.set(String(episode.ZGUID), metaData);
						}
					});
				}
			} catch (e) {
				console.error("Error querying ZMTEPISODE:", e);
			}
		}

		// Log some keys from the map
		console.log(
			"Sample episode map keys:",
			Array.from(episodeMap.keys()).slice(0, 10)
		);

		console.log(`Built episode map with ${episodeMap.size} entries`);
		return episodeMap.size;
	}

	function lookupMetadata(assetId) {
		// Try direct lookup
		if (episodeMap.has(assetId)) {
			console.log(`Direct match found for ${assetId}`);
			return episodeMap.get(assetId);
		}

		// Try partial match - key contains assetId
		for (const [key, value] of episodeMap) {
			if (key.includes(assetId)) {
				console.log(`Partial match: key "${key}" contains "${assetId}"`);
				return value;
			}
		}

		// Find similar IDs (same prefix) to help debug
		const prefix = assetId.substring(0, 6);
		const similarKeys = [];
		for (const key of episodeMap.keys()) {
			if (key.startsWith(prefix) && /^\d+$/.test(key)) {
				similarKeys.push(key);
				if (similarKeys.length >= 5) break;
			}
		}
		if (similarKeys.length > 0) {
			console.log(
				`No match for ${assetId}. Similar IDs in database:`,
				similarKeys
			);
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
		// Extract ID from filename
		const idMatch = file.name.match(/transcript[_-]?(\d+)/i);
		const assetId = idMatch ? idMatch[1] : null;

		console.log(`Processing file: ${file.name}`);
		console.log(`Extracted asset ID: ${assetId}`);
		console.log(`Episode map size: ${episodeMap.size}`);

		// Read file content
		const textContent = await readFileAsText(file);

		// Parse TTML
		const lines = parseTTML(textContent);

		// Lookup metadata from database
		let metadata = null;
		if (assetId) {
			metadata = lookupMetadata(assetId);
			console.log(`Lookup result for ${assetId}:`, metadata);
		}

		// Create episode object
		const episode = {
			id: assetId || file.name,
			filename: file.name,
			lines: lines,
			metadata: metadata,
		};

		// Add to state
		episodes.push(episode);

		// Show search section
		searchSection.style.display = "flex";

		// Render
		renderEpisode(episode);
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

		// Look for <p> or <span> tags with timing attributes
		const elements = xmlDoc.querySelectorAll("p[begin], span[begin]");

		elements.forEach((el) => {
			const begin = el.getAttribute("begin");
			const text = el.textContent.trim();

			if (text) {
				lines.push({
					time: formatTime(begin),
					rawTime: begin,
					text: text,
				});
			}
		});

		// If no timed elements found, try getting all <p> elements
		if (lines.length === 0) {
			const pElements = xmlDoc.querySelectorAll("p");
			pElements.forEach((el) => {
				const text = el.textContent.trim();
				if (text) {
					lines.push({
						time: "",
						rawTime: "",
						text: text,
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

	// =====================
	// Search Functionality
	// =====================

	let searchTimeout;
	searchInput.addEventListener("input", () => {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			performSearch(searchInput.value.trim());
		}, 200);
	});

	function performSearch(query) {
		resultsContainer.innerHTML = "";

		if (!query) {
			resultCount.textContent = "";
			episodes.forEach((ep) => renderEpisode(ep));
			return;
		}

		const lowerQuery = query.toLowerCase();
		let totalMatches = 0;
		let matchingEpisodes = 0;

		episodes.forEach((episode) => {
			const matchingLines = episode.lines.filter((line) =>
				line.text.toLowerCase().includes(lowerQuery)
			);

			if (matchingLines.length > 0) {
				matchingEpisodes++;
				totalMatches += matchingLines.length;
				renderEpisode(episode, query, matchingLines);
			}
		});

		resultCount.textContent = `${totalMatches} matches in ${matchingEpisodes} files`;
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

		const displayLines = filteredLines || episode.lines;

		const highlight = (text) => {
			if (!query) return escapeHtml(text);
			const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
			return escapeHtml(text).replace(regex, "<mark>$1</mark>");
		};

		card.innerHTML = `
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
												? `<p class="match-count">🔍 ${displayLines.length} matches</p>`
												: ""
										}
                </div>
            </div>
            <div class="transcript-content">
                ${
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
												.join("")
								}
            </div>
        `;

		resultsContainer.appendChild(card);
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
