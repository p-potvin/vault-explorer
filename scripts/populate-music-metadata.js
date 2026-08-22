#!/usr/bin/env node

/**
 * ==============================================================================
 * Vault Explorer — MusicBrainz Music Library Metadata Populator
 * ==============================================================================
 * Traverses a music library (e.g. G:\Music\<Artist>\<Album>\<Track.ext>),
 * queries the MusicBrainz API and Cover Art Archive to retrieve rich metadata,
 * release info, genres, and album/artist art, and generates standard NFO/JSON
 * manifests and downloads album covers.
 *
 * User-Agent: VaultExplorer/<version> ( contact@vaultwares.ca )
 * Rate Limit: Configurable (default 50 requests/sec)
 *
 * Usage:
 *   node scripts/populate-music-metadata.js --dir "G:\Music" --rps 50
 *   node scripts/populate-music-metadata.js --dir "G:\Music" --limit 20 --dry-run
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const { MusicBrainzClient } = require('./musicbrainz/client');
const { LocalMusicBrainzDb } = require('./musicbrainz/local-db');
const { extractAudioFileMetadata } = require('./musicbrainz/tag-reader');
const { generateAlbumNfo, generateArtistNfo } = require('./musicbrainz/nfo-generator');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.wav', '.ogg', '.aac', '.opus', '.wma', '.aiff']);

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        dir: 'G:\\Music',
        host: 'musicbrainz.org',
        localDb: 'I:\\Musicbrainz\\musicbrainz_local.sqlite',
        rps: null,
        downloadArt: true,
        writeNfo: true,
        writeJson: true,
        dryRun: false,
        limit: 0,
        concurrency: null,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            options.help = true;
        } else if (arg === '--dir' && args[i + 1]) {
            options.dir = path.resolve(args[++i]);
        } else if (arg === '--host' && args[i + 1]) {
            options.host = args[++i].trim();
        } else if (arg === '--local-db' && args[i + 1]) {
            options.localDb = path.resolve(args[++i]);
        } else if (arg === '--rps' && args[i + 1]) {
            options.rps = parseFloat(args[++i]);
        } else if (arg === '--limit' && args[i + 1]) {
            options.limit = parseInt(args[++i], 10) || 0;
        } else if (arg === '--concurrency' && args[i + 1]) {
            options.concurrency = parseInt(args[++i], 10) || 1;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--no-art') {
            options.downloadArt = false;
        } else if (arg === '--no-nfo') {
            options.writeNfo = false;
        } else if (arg === '--no-json') {
            options.writeJson = false;
        }
    }

    const isOfficialMb = options.host === 'musicbrainz.org';
    if (options.rps === null) {
        options.rps = isOfficialMb ? 1 : 50;
    }
    if (options.concurrency === null) {
        options.concurrency = isOfficialMb ? 1 : 10;
    }

    return options;
}

function printHelp() {
    console.log(`
Vault Explorer — MusicBrainz Metadata Populator

Options:
  --dir <path>         Music library path to scan (default: "G:\\Music")
  --host <hostname>    MusicBrainz host (default: "musicbrainz.org" or local mirror)
  --rps <number>       Max requests per second (default: 1 for musicbrainz.org, 50 for mirrors)
  --concurrency <num>  Concurrent processing workers (default: 1 for musicbrainz.org)
  --limit <number>     Process only first N tracks (default: 0 = all)
  --dry-run            Scan & query MusicBrainz without writing files to disk
  --no-art             Skip downloading album cover art
  --no-nfo             Skip generating XML album.nfo and artist.nfo files
  --no-json            Skip generating album.json / metadata.json files
  --help, -h           Show this help message

Examples:
  node scripts/populate-music-metadata.js --dir "G:\\Music"
  node scripts/populate-music-metadata.js --dir "G:\\Music" --limit 10 --dry-run
  node scripts/populate-music-metadata.js --host "localhost:5000" --rps 50 --concurrency 10
`);
}

function scanAudioFiles(dir) {
    const audioFiles = [];

    function walk(currentDir) {
        let entries = [];
        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch (_) {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== '.thumbs' && entry.name !== 'node_modules') {
                    walk(fullPath);
                }
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (AUDIO_EXTENSIONS.has(ext)) {
                    audioFiles.push(fullPath);
                }
            }
        }
    }

    walk(dir);
    return audioFiles;
}

async function main() {
    const opts = parseArgs();
    if (opts.help) {
        printHelp();
        process.exit(0);
    }

    console.log('======================================================================');
    console.log(' VAULT EXPLORER — MUSICBRAINZ METADATA POPULATOR                      ');
    console.log('======================================================================');
    console.log(` Target Directory : ${opts.dir}`);
    console.log(` Rate Limit       : ${opts.rps} requests/sec`);
    console.log(` Concurrency      : ${opts.concurrency}`);
    console.log(` Download Art     : ${opts.downloadArt}`);
    console.log(` Write NFO / JSON : ${opts.writeNfo} / ${opts.writeJson}`);
    console.log(` Dry Run Mode     : ${opts.dryRun}`);
    if (opts.limit > 0) console.log(` Track Limit      : ${opts.limit}`);
    console.log('======================================================================\n');

    if (!fs.existsSync(opts.dir)) {
        console.error(`[Error] Target directory "${opts.dir}" does not exist.`);
        process.exit(1);
    }

    console.log(`[1/4] Scanning audio files in "${opts.dir}"...`);
    let allAudio = scanAudioFiles(opts.dir);
    console.log(`✓ Found ${allAudio.length} audio file(s).\n`);

    if (allAudio.length === 0) {
        console.log('No audio files found. Exiting.');
        process.exit(0);
    }

    if (opts.limit > 0 && opts.limit < allAudio.length) {
        allAudio = allAudio.slice(0, opts.limit);
        console.log(`[Limit] Truncated to first ${allAudio.length} file(s) for this run.\n`);
    }

    const localDb = new LocalMusicBrainzDb(opts.localDb);
    if (localDb.isAvailable) {
        console.log(`[Offline Mode] Using local MusicBrainz database at: "${localDb.dbPath}" (0ms lookup time)\n`);
    }

    const client = new MusicBrainzClient({ host: opts.host, rps: opts.rps });
    console.log(`[2/4] Initialized MusicBrainz client (Host: "${client.host}", Agent: "${client.userAgent}")...\n`);

    // Group tracks by album directory to batch album-level metadata and cover art
    const albumsMap = new Map(); // albumDirPath -> { artistDir, albumDir, tracks: [] }
    for (const filePath of allAudio) {
        const albumDir = path.dirname(filePath);
        const artistDir = path.dirname(albumDir);
        if (!albumsMap.has(albumDir)) {
            albumsMap.set(albumDir, {
                albumDir,
                artistDir,
                tracks: []
            });
        }
        albumsMap.get(albumDir).tracks.push(filePath);
    }

    console.log(`[3/4] Processing ${allAudio.length} tracks across ${albumsMap.size} album folder(s)...`);

    const stats = {
        total: allAudio.length,
        processed: 0,
        matched: 0,
        unmatched: 0,
        coversDownloaded: 0,
        nfosWritten: 0,
        errors: 0,
        startTime: Date.now()
    };

    const libraryManifest = [];

    // Helper: process a single track
    async function processTrack(filePath) {
        const fileMeta = extractAudioFileMetadata(filePath);
        const searchParams = {
            title: fileMeta.effectiveTitle,
            artist: fileMeta.effectiveArtist,
            album: fileMeta.effectiveAlbum
        };

        let mbResult = null;
        if (localDb.isAvailable) {
            mbResult = localDb.searchRecording(searchParams);
        }

        if (!mbResult) {
            try {
                mbResult = await client.searchRecording(searchParams);
            } catch (err) {
                stats.errors++;
            }
        }

        stats.processed++;
        const pct = Math.round((stats.processed / stats.total) * 100);

        if (mbResult) {
            stats.matched++;
            const matchRecord = {
                file: path.basename(filePath),
                path: filePath,
                title: mbResult.title,
                artist: mbResult.artist,
                album: mbResult.album,
                year: mbResult.releaseYear,
                releaseDate: mbResult.releaseDate,
                recordingMbid: mbResult.recordingMbid,
                releaseMbid: mbResult.releaseMbid,
                releaseGroupMbid: mbResult.releaseGroupMbid,
                artistMbid: mbResult.artistMbid,
                genres: mbResult.genres
            };
            libraryManifest.push(matchRecord);

            console.log(`[${stats.processed}/${stats.total} (${pct}%)] ✓ MATCH: "${fileMeta.effectiveArtist} - ${fileMeta.effectiveTitle}" -> "${mbResult.artist} - ${mbResult.title}" [${mbResult.album || 'Single'}]`);
            return { filePath, fileMeta, mbResult };
        } else {
            stats.unmatched++;
            console.log(`[${stats.processed}/${stats.total} (${pct}%)] ✗ NO MATCH: "${fileMeta.effectiveArtist || 'Unknown'} - ${fileMeta.effectiveTitle}"`);
            return { filePath, fileMeta, mbResult: null };
        }
    }

    // Process all tracks with concurrency pool
    const trackResults = [];
    for (let i = 0; i < allAudio.length; i += opts.concurrency) {
        const chunk = allAudio.slice(i, i + opts.concurrency);
        const chunkResults = await Promise.all(chunk.map(processTrack));
        trackResults.push(...chunkResults);
    }
    console.log('');

    // [4/4] Process Album-level metadata, NFOs, and Cover Art
    console.log(`[4/4] Resolving Album Covers, NFOs, and Manifests...`);

    const albumResults = new Map();
    for (const res of trackResults) {
        const albumDir = path.dirname(res.filePath);
        if (!albumResults.has(albumDir)) {
            albumResults.set(albumDir, []);
        }
        albumResults.get(albumDir).push(res);
    }

    for (const [albumDir, tracksInAlbum] of albumResults.entries()) {
        const matchedTracks = tracksInAlbum.filter(t => t.mbResult);
        if (matchedTracks.length === 0) continue;

        // Choose best representative release MBID from matched tracks
        const primaryMatch = matchedTracks[0].mbResult;
        const albumTitle = primaryMatch.album || tracksInAlbum[0].fileMeta.effectiveAlbum || path.basename(albumDir);
        const artistName = primaryMatch.artist || tracksInAlbum[0].fileMeta.effectiveArtist || path.basename(path.dirname(albumDir));
        const releaseMbid = primaryMatch.releaseMbid;
        const releaseGroupMbid = primaryMatch.releaseGroupMbid;
        const artistMbid = primaryMatch.artistMbid;
        const year = primaryMatch.releaseYear;
        const releaseDate = primaryMatch.releaseDate;
        const genres = [...new Set(matchedTracks.flatMap(t => t.mbResult.genres || []))].slice(0, 5);

        let coverUrl = '';

        // Download Cover Art if enabled
        if (opts.downloadArt && (releaseMbid || releaseGroupMbid)) {
            const coverPath = path.join(albumDir, 'cover.jpg');
            const folderPath = path.join(albumDir, 'folder.jpg');

            // Only download if cover doesn't already exist
            if (!fs.existsSync(coverPath) && !fs.existsSync(folderPath)) {
                try {
                    const artInfo = await client.getCoverArt(releaseMbid, releaseGroupMbid);
                    if (artInfo && (artInfo.image || artInfo.thumbnails?.large || artInfo.thumbnails?.['500'])) {
                        const targetUrl = artInfo.thumbnails?.['500'] || artInfo.thumbnails?.large || artInfo.image;
                        coverUrl = targetUrl;
                        if (!opts.dryRun) {
                            const dlRes = await client.downloadImage(targetUrl, coverPath);
                            if (dlRes && dlRes.success) {
                                stats.coversDownloaded++;
                                console.log(`  [Cover Art] Downloaded for "${artistName} - ${albumTitle}" -> ${path.basename(coverPath)}`);
                            }
                        }
                    }
                } catch (artErr) {
                    // Silently continue if art not found
                }
            }
        }

        // Write album.nfo
        if (opts.writeNfo && !opts.dryRun) {
            const albumNfoPath = path.join(albumDir, 'album.nfo');
            const nfoXml = generateAlbumNfo({
                album: albumTitle,
                artist: artistName,
                year,
                releaseDate,
                genres,
                releaseMbid,
                artistMbid,
                coverUrl
            });
            fs.writeFileSync(albumNfoPath, nfoXml, 'utf8');
            stats.nfosWritten++;

            // Write artist.nfo in artist dir if not existing
            const artistDir = path.dirname(albumDir);
            const artistNfoPath = path.join(artistDir, 'artist.nfo');
            if (!fs.existsSync(artistNfoPath)) {
                const artistXml = generateArtistNfo({
                    artist: artistName,
                    artistSortName: primaryMatch.artistSortName,
                    artistMbid,
                    artistCountry: primaryMatch.artistCountry,
                    genres
                });
                fs.writeFileSync(artistNfoPath, artistXml, 'utf8');
            }
        }

        // Write album.json
        if (opts.writeJson && !opts.dryRun) {
            const albumJsonPath = path.join(albumDir, 'album.json');
            const albumData = {
                album: albumTitle,
                artist: artistName,
                year,
                releaseDate,
                genres,
                musicbrainz: {
                    releaseMbid,
                    releaseGroupMbid,
                    artistMbid
                },
                tracks: tracksInAlbum.map(t => ({
                    file: path.basename(t.filePath),
                    title: t.mbResult ? t.mbResult.title : t.fileMeta.effectiveTitle,
                    artist: t.mbResult ? t.mbResult.artist : t.fileMeta.effectiveArtist,
                    trackNumber: t.mbResult ? t.mbResult.trackNumber : null,
                    recordingMbid: t.mbResult ? t.mbResult.recordingMbid : null
                }))
            };
            fs.writeFileSync(albumJsonPath, JSON.stringify(albumData, null, 2), 'utf8');
        }
    }

    // Write Master Library Manifest
    if (opts.writeJson && !opts.dryRun) {
        const manifestPath = path.join(opts.dir, 'music-metadata-manifest.json');
        try {
            fs.writeFileSync(manifestPath, JSON.stringify({
                generatedAt: new Date().toISOString(),
                totalTracks: allAudio.length,
                matchedTracks: stats.matched,
                tracks: libraryManifest
            }, null, 2), 'utf8');
            console.log(`\n✓ Master Library Manifest saved: ${manifestPath}`);
        } catch (_) {}
    }

    const elapsedSec = ((Date.now() - stats.startTime) / 1000).toFixed(1);
    const matchRate = stats.total > 0 ? Math.round((stats.matched / stats.total) * 100) : 0;

    console.log('\n======================================================================');
    console.log(' MUSICBRAINZ METADATA POPULATION SUMMARY                             ');
    console.log('======================================================================');
    console.log(` Total Tracks Processed : ${stats.processed} / ${stats.total}`);
    console.log(` Matches Found          : ${stats.matched} (${matchRate}%)`);
    console.log(` Unmatched              : ${stats.unmatched}`);
    console.log(` Cover Arts Downloaded  : ${stats.coversDownloaded}`);
    console.log(` NFO Files Written      : ${stats.nfosWritten}`);
    console.log(` Elapsed Time           : ${elapsedSec}s`);
    console.log('======================================================================');
}

if (require.main === module) {
    main().catch(err => {
        console.error('Fatal error in metadata populator:', err);
        process.exit(1);
    });
}

module.exports = { main, scanAudioFiles, parseArgs };
