// Products to look for on "search / new arrivals" watches.
// A listing title must contain ALL "match" words and NONE of the "exclude" words.
// Edit this list, then hit the reload button on chrome://extensions.
const PRESETS = [
  { name: 'Topps Inception Basketball', match: ['inception', 'basketball'] },
  { name: 'Topps Chrome Basketball', match: ['chrome', 'basketball'], exclude: ['sapphire', 'black', 'bowman'] },
  { name: 'Bowman Basketball', match: ['bowman', 'basketball'] },
  { name: 'Topps Chrome Black Basketball', match: ['chrome', 'black', 'basketball'] },
  { name: 'Topps Chrome Sapphire Basketball', match: ['chrome', 'sapphire', 'basketball'] },
  { name: 'Topps Signature Series', match: ['signature series'] },
  { name: 'Topps Mint Disney', match: ['mint', 'disney'] },
];

// Skip breaks, singles and graded cards.
const GLOBAL_EXCLUDE = ['break', 'spot', ' psa ', ' bgs ', ' sgc ', 'random team', 'pick your', '#'];

// If not empty, a listing title must contain one of these words. Off by default
// because Topps.com names drops like "Chrome Basketball Sapphire Edition" with no "box".
// Example to only catch sealed product: ['box', 'pack', 'case', 'blaster', 'hanger', 'mega', 'hobby']
const REQUIRE_ANY = [];
