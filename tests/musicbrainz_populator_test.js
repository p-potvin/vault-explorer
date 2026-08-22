const assert = require('assert').strict;
const path = require('path');
const fs = require('fs');

const { RateLimiter } = require('../scripts/musicbrainz/rate-limiter');
const { cleanSongFilename, extractAudioFileMetadata } = require('../scripts/musicbrainz/tag-reader');
const { MusicBrainzClient, DEFAULT_USER_AGENT } = require('../scripts/musicbrainz/client');
const { generateAlbumNfo, generateArtistNfo } = require('../scripts/musicbrainz/nfo-generator');
const { scanAudioFiles } = require('../scripts/populate-music-metadata');

console.log('======================================================================');
console.log(' VAULT EXPLORER: MUSICBRAINZ METADATA POPULATOR TEST SUITE            ');
console.log('======================================================================\n');

async function testSuite() {
    // ── TEST 1: User-Agent Format ───────────────────────────────────────────
    console.log('[Test 1] Testing MusicBrainz User-Agent header format...');
    console.log('User-Agent:', DEFAULT_USER_AGENT);
    assert.ok(DEFAULT_USER_AGENT.includes('VaultExplorer/'), 'User agent must include application name');
    assert.ok(DEFAULT_USER_AGENT.includes('( contact@vaultwares.ca )'), 'User agent must include contact email');
    console.log('✓ [PASS] User-Agent format validated.\n');

    // ── TEST 2: Song Filename Cleaning ──────────────────────────────────────
    console.log('[Test 2] Testing Song Filename Cleaners...');
    assert.equal(cleanSongFilename('01 - Breezeblocks.mp3'), 'Breezeblocks');
    assert.equal(cleanSongFilename('02. Left Hand Free [320kbps].m4a'), 'Left Hand Free');
    assert.equal(cleanSongFilename('14 - Midnight City (Official Audio).flac'), 'Midnight City');
    assert.equal(cleanSongFilename('Track 05 - Starlight [HQ].wav'), 'Track 05 - Starlight');
    assert.equal(cleanSongFilename('01 Cyberpunk.ogg'), 'Cyberpunk');
    console.log('✓ [PASS] Song Filename cleaning heuristics verified.\n');

    // ── TEST 3: Rate Limiter Token Bucket ───────────────────────────────────
    console.log('[Test 3] Testing Rate Limiter throughput & scheduling...');
    const limiter = new RateLimiter(50); // 50 requests/sec = 20ms interval
    const start = Date.now();
    const tasks = [];
    for (let i = 0; i < 5; i++) {
        tasks.push(limiter.schedule(async () => i));
    }
    const results = await Promise.all(tasks);
    const elapsed = Date.now() - start;
    console.log(`RateLimiter processed 5 items in ${elapsed}ms:`, results);
    assert.deepEqual(results, [0, 1, 2, 3, 4]);
    assert.ok(elapsed >= 60, `5 items at 50 RPS should take at least ~60-80ms (elapsed: ${elapsed}ms)`);
    console.log('✓ [PASS] RateLimiter throttling verified.\n');

    // ── TEST 4: Path Extraction & Metadata Resolution ───────────────────────
    console.log('[Test 4] Testing Path and Tag Extractor on G:\\Music structure...');
    const mockPath = 'G:\\Music\\Alt-J\\Unknown Album\\01 - Breezeblocks.mp3';
    const extracted = extractAudioFileMetadata(mockPath);
    console.log('Extracted metadata:', extracted);
    assert.equal(extracted.inferredArtist, 'Alt-J');
    assert.equal(extracted.inferredTitle, 'Breezeblocks');
    assert.equal(extracted.effectiveTitle, 'Breezeblocks');
    console.log('✓ [PASS] Audio metadata & path resolution verified.\n');

    // ── TEST 5: NFO XML Serializer ──────────────────────────────────────────
    console.log('[Test 5] Testing Album and Artist XML NFO generation...');
    const albumXml = generateAlbumNfo({
        album: 'An Awesome Wave',
        artist: 'Alt-J',
        year: '2012',
        releaseDate: '2012-05-25',
        genres: ['Indie Rock', 'Art Pop'],
        releaseMbid: '12345-mbid',
        artistMbid: '67890-mbid',
        coverUrl: 'https://coverartarchive.org/release/12345/front.jpg'
    });
    assert.ok(albumXml.includes('<title>An Awesome Wave</title>'));
    assert.ok(albumXml.includes('<artist>Alt-J</artist>'));
    assert.ok(albumXml.includes('<year>2012</year>'));
    assert.ok(albumXml.includes('<genre>Indie Rock</genre>'));
    assert.ok(albumXml.includes('<musicbrainzalbumid>12345-mbid</musicbrainzalbumid>'));

    const artistXml = generateArtistNfo({
        artist: 'Alt-J',
        artistSortName: 'alt-J',
        artistCountry: 'GB',
        artistMbid: '67890-mbid',
        genres: ['Indie Pop']
    });
    assert.ok(artistXml.includes('<title>Alt-J</title>'));
    assert.ok(artistXml.includes('<sorttitle>alt-J</sorttitle>'));
    assert.ok(artistXml.includes('<country>GB</country>'));
    console.log('✓ [PASS] XML NFO serialization verified.\n');

    // ── TEST 6: Live MusicBrainz API Query & Cover Art Lookups ──────────────
    console.log('[Test 6] Testing live MusicBrainz query on "Alt-J - Breezeblocks"...');
    const client = new MusicBrainzClient({ rps: 50 });
    const match = await client.searchRecording({
        title: 'Breezeblocks',
        artist: 'Alt-J'
    });

    console.log('MusicBrainz match result:', match);
    assert.ok(match, 'MusicBrainz must return a match for Alt-J - Breezeblocks');
    const normalizedArtist = match.artist.replace(/[\u2010\u2013\u2014-]/g, '-').toLowerCase();
    assert.ok(normalizedArtist.includes('alt-j'), `Artist must be Alt-J (got: ${match.artist})`);
    assert.ok(match.title.toLowerCase().includes('breezeblocks'), `Title must be Breezeblocks (got: ${match.title})`);
    assert.ok(match.releaseMbid || match.releaseGroupMbid, 'Must have a release or release-group MBID');

    if (match.releaseMbid || match.releaseGroupMbid) {
        console.log('Querying Cover Art Archive for release:', match.releaseMbid || match.releaseGroupMbid);
        const art = await client.getCoverArt(match.releaseMbid, match.releaseGroupMbid);
        console.log('Cover Art result:', art);
        if (art) {
            assert.ok(art.image, 'Cover Art Archive returned front cover URL');
        }
    }
    console.log('✓ [PASS] Live MusicBrainz & Cover Art lookup verified.\n');

    console.log('======================================================================');
    console.log(' ALL MUSICBRAINZ POPULATOR TESTS PASSED SUCCESSFULLY! (6/6)          ');
    console.log('======================================================================');
}

testSuite().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
