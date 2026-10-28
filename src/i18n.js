/**
 * English and Turkish strings, plus helpers that turn parser and query errors into sentences.
 * Placeholders look like {name}; every language defines exactly the same keys.
 */

/** Supported languages; the first one is the default. */
export const LANGUAGES = Object.freeze(['en', 'tr']);

const EN = {
  'app.title': 'JSON Formatter',
  'app.tagline': 'Format, validate, explore and compare JSON. Everything stays in your browser.',
  'toolbar.label': 'JSON tools',
  'action.format': 'Format',
  'action.minify': 'Minify',
  'action.sortKeys': 'Sort keys',
  'action.indent': 'Indent',
  'action.relaxed': 'Relaxed mode',
  'action.repair': 'Repair',
  'action.copy': 'Copy',
  'action.download': 'Download',
  'action.open': 'Open file',
  'action.sample': 'Sample',
  'action.clear': 'Clear',
  'action.expandAll': 'Expand all',
  'action.collapseAll': 'Collapse all',
  'indent.2': '2 spaces',
  'indent.4': '4 spaces',
  'indent.tab': 'Tab',
  'tab.formatted': 'Formatted',
  'tab.tree': 'Tree',
  'tab.diff': 'Diff',
  'output.label': 'Output',
  'output.empty': 'Paste JSON into the input, open a file or load a sample to see it here.',
  'input.label': 'Input',
  'input.placeholder': 'Paste JSON here, drop a .json file, or load the sample.',
  'input.stats': 'Lines: {lines} · {size}',
  'compare.label': 'Second document',
  'compare.placeholder': 'Paste the JSON to compare with the input.',
  'query.label': 'Query',
  'query.placeholder': '$..name',
  'query.matches': 'Matches: {count}',
  'query.none': 'No matches',
  'status.empty': 'Waiting for input',
  'status.valid': 'Valid JSON',
  'status.invalid': 'Invalid JSON',
  'status.stale': 'Showing the last valid version',
  'status.repairs': 'Relaxed fixes: {count}',
  'problem.goto': 'Jump to this position in the input',
  'repair.done': 'Fixes applied: {count}',
  'repair.nothing': 'Nothing to repair',
  'repair.comment': 'comment removed',
  'repair.trailing-comma': 'trailing comma removed',
  'repair.single-quote': 'single quotes replaced',
  'repair.unquoted-key': 'property name quoted',
  'tree.label': 'Document tree',
  'tree.hint': 'Tap a row to copy its path · ▸ opens and closes',
  'tree.exact': 'exact',
  'tree.copied': 'Copied {path}',
  'tree.lossy': 'Too precise for a JavaScript number, kept exactly as written',
  'diff.added': 'Added',
  'diff.removed': 'Removed',
  'diff.changed': 'Changed',
  'diff.summary': '{added} added · {removed} removed · {changed} changed',
  'diff.identical': 'No differences: the documents are equal.',
  'diff.empty': 'Paste a second document to compare it with the input.',
  'diff.invalid': 'The second document is not valid JSON.',
  'diff.noDocument': 'Enter a valid document in the input first.',
  'copy.done': 'Copied to the clipboard',
  'copy.failed': 'Could not copy',
  'file.drop': 'Drop a JSON file to open it',
  'file.failed': 'Could not read that file',
  'file.opened': 'Opened {name}',
  'lang.toggle': 'TR',
  'lang.toggleLabel': 'TR – Switch to Turkish',
  'split.label': 'Resize the panes',
  'footer.source': 'MIT · Source on GitHub',
  'footer.shortcuts': 'Ctrl+Enter format · Ctrl+Shift+Enter minify · Ctrl+O open · Ctrl+S download',
  'type.object': 'object',
  'type.array': 'array',
  'type.string': 'string',
  'type.number': 'number',
  'type.boolean': 'boolean',
  'type.null': 'null',
  'token.value': 'a value',
  'token.string': 'a string',
  'token.name': 'a property name',
  'token.digit': 'a digit',
  'token.hex': 'a hex digit',
  'token.index': 'an array index',
  'token.eof': 'end of input',
  'list.or': 'or',
  'list.more': '+{count} more',
  'error.location': 'Line {line}, column {column}',
  'error.hint.relaxed': 'Turn on Relaxed mode to accept this, then press Repair.',
  'error.unexpected-token': 'Expected {expected} but found {found}',
  'error.unexpected-end': 'Unexpected end of input: expected {expected}',
  'error.unterminated-string': 'Unterminated string: the closing quote is missing',
  'error.invalid-escape': 'Invalid escape sequence {found} in a string',
  'error.invalid-unicode-escape': 'Invalid \\u escape: expected {expected} but found {found}',
  'error.control-character': 'Control character {found} must be escaped inside a string',
  'error.invalid-number': 'Invalid number: expected {expected} but found {found}',
  'error.leading-zero': 'Numbers cannot have leading zeros',
  'error.comment-not-allowed': 'Comments are not allowed in strict JSON',
  'error.single-quote-not-allowed': 'Strings must use double quotes in strict JSON',
  'error.unquoted-key-not-allowed': 'Property names must be double-quoted in strict JSON: found {found}',
  'error.trailing-comma-not-allowed': 'Trailing commas are not allowed in strict JSON',
  'error.unterminated-comment': 'Unterminated comment: the closing */ is missing',
  'error.too-deep': 'Nesting is deeper than {limit} levels',
  'error.query-syntax': 'Invalid query: expected {expected} but found {found}',
};

const TR = {
  'app.title': 'JSON Biçimlendirici',
  'app.tagline': 'JSON’u biçimlendirin, doğrulayın, inceleyin ve karşılaştırın. Her şey tarayıcınızda kalır.',
  'toolbar.label': 'JSON araçları',
  'action.format': 'Biçimlendir',
  'action.minify': 'Küçült',
  'action.sortKeys': 'Anahtarları sırala',
  'action.indent': 'Girinti',
  'action.relaxed': 'Esnek mod',
  'action.repair': 'Onar',
  'action.copy': 'Kopyala',
  'action.download': 'İndir',
  'action.open': 'Dosya aç',
  'action.sample': 'Örnek',
  'action.clear': 'Temizle',
  'action.expandAll': 'Tümünü aç',
  'action.collapseAll': 'Tümünü kapat',
  'indent.2': '2 boşluk',
  'indent.4': '4 boşluk',
  'indent.tab': 'Sekme',
  'tab.formatted': 'Biçimli',
  'tab.tree': 'Ağaç',
  'tab.diff': 'Fark',
  'output.label': 'Çıktı',
  'output.empty': 'Burada görmek için girdiye JSON yapıştırın, bir dosya açın ya da bir örnek yükleyin.',
  'input.label': 'Girdi',
  'input.placeholder': 'JSON’u buraya yapıştırın, bir .json dosyası bırakın ya da örneği yükleyin.',
  'input.stats': 'Satır: {lines} · {size}',
  'compare.label': 'İkinci belge',
  'compare.placeholder': 'Girdiyle karşılaştırılacak JSON’u yapıştırın.',
  'query.label': 'Sorgu',
  'query.placeholder': '$..name',
  'query.matches': 'Eşleşme: {count}',
  'query.none': 'Eşleşme yok',
  'status.empty': 'Girdi bekleniyor',
  'status.valid': 'Geçerli JSON',
  'status.invalid': 'Geçersiz JSON',
  'status.stale': 'Son geçerli sürüm gösteriliyor',
  'status.repairs': 'Esnek düzeltme: {count}',
  'problem.goto': 'Girdide bu konuma git',
  'repair.done': 'Uygulanan düzeltme: {count}',
  'repair.nothing': 'Onarılacak bir şey yok',
  'repair.comment': 'yorum kaldırıldı',
  'repair.trailing-comma': 'sondaki virgül kaldırıldı',
  'repair.single-quote': 'tek tırnaklar çift tırnağa çevrildi',
  'repair.unquoted-key': 'özellik adı tırnağa alındı',
  'tree.label': 'Belge ağacı',
  'tree.hint': 'Yolu kopyalamak için satıra dokunun · ▸ açar ve kapatır',
  'tree.exact': 'aynen',
  'tree.copied': '{path} kopyalandı',
  'tree.lossy': 'JavaScript sayısına sığmıyor, yazıldığı gibi korunur',
  'diff.added': 'Eklendi',
  'diff.removed': 'Silindi',
  'diff.changed': 'Değişti',
  'diff.summary': '{added} eklendi · {removed} silindi · {changed} değişti',
  'diff.identical': 'Fark yok: belgeler eşit.',
  'diff.empty': 'Girdiyle karşılaştırmak için ikinci bir belge yapıştırın.',
  'diff.invalid': 'İkinci belge geçerli bir JSON değil.',
  'diff.noDocument': 'Önce girdiye geçerli bir belge yazın.',
  'copy.done': 'Panoya kopyalandı',
  'copy.failed': 'Kopyalanamadı',
  'file.drop': 'Açmak için bir JSON dosyası bırakın',
  'file.failed': 'Dosya okunamadı',
  'file.opened': '{name} açıldı',
  'lang.toggle': 'EN',
  'lang.toggleLabel': 'EN – İngilizceye geç',
  'split.label': 'Panelleri yeniden boyutlandır',
  'footer.source': 'MIT · Kaynak kodu GitHub’da',
  'footer.shortcuts': 'Ctrl+Enter biçimlendir · Ctrl+Shift+Enter küçült · Ctrl+O aç · Ctrl+S indir',
  'type.object': 'nesne',
  'type.array': 'dizi',
  'type.string': 'dize',
  'type.number': 'sayı',
  'type.boolean': 'mantıksal',
  'type.null': 'null',
  'token.value': 'bir değer',
  'token.string': 'bir dize',
  'token.name': 'bir özellik adı',
  'token.digit': 'bir rakam',
  'token.hex': 'bir onaltılık rakam',
  'token.index': 'bir dizi indisi',
  'token.eof': 'girdinin sonu',
  'list.or': 'veya',
  'list.more': '+{count} daha',
  'error.location': 'Satır {line}, sütun {column}',
  'error.hint.relaxed': 'Bunu kabul etmek için Esnek modu açın, sonra Onar’a basın.',
  'error.unexpected-token': '{expected} bekleniyordu ama {found} bulundu',
  'error.unexpected-end': 'Girdi beklenmedik biçimde bitti: {expected} bekleniyordu',
  'error.unterminated-string': 'Kapanmamış dize: kapanış tırnağı eksik',
  'error.invalid-escape': 'Dizede geçersiz kaçış dizisi: {found}',
  'error.invalid-unicode-escape': 'Geçersiz \\u kaçışı: {expected} bekleniyordu ama {found} bulundu',
  'error.control-character': '{found} denetim karakteri dize içinde kaçışlanmalıdır',
  'error.invalid-number': 'Geçersiz sayı: {expected} bekleniyordu ama {found} bulundu',
  'error.leading-zero': 'Sayılar baştaki sıfırlarla yazılamaz',
  'error.comment-not-allowed': 'Katı JSON’da yorumlara izin verilmez',
  'error.single-quote-not-allowed': 'Katı JSON’da dizeler çift tırnak kullanmalıdır',
  'error.unquoted-key-not-allowed': 'Katı JSON’da özellik adları çift tırnaklı olmalıdır: {found} bulundu',
  'error.trailing-comma-not-allowed': 'Katı JSON’da sondaki virgüle izin verilmez',
  'error.unterminated-comment': 'Kapanmamış yorum: kapanış */ eksik',
  'error.too-deep': 'İç içe yapı {limit} düzeyden derin',
  'error.query-syntax': 'Geçersiz sorgu: {expected} bekleniyordu ama {found} bulundu',
};

/** All strings by language. */
export const STRINGS = Object.freeze({ en: Object.freeze(EN), tr: Object.freeze(TR) });

/**
 * Looks up a string and fills its {placeholders}. Unknown languages fall back to English,
 * unknown keys return the key itself so a missing string is visible instead of blank.
 * @param {string} lang 'en' or 'tr'
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function t(lang, key, params = {}) {
  const table = Object.hasOwn(STRINGS, lang) ? STRINGS[lang] : STRINGS.en;
  const template = Object.hasOwn(table, key) ? table[key] : key;
  return template.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(params, name) ? String(params[name]) : whole));
}

/**
 * @param {string} lang
 * @returns {string} the language the toggle switches to
 */
export function otherLanguage(lang) {
  return lang === 'tr' ? 'en' : 'tr';
}

/**
 * Builds the sentence for a parser or query error (without its position).
 * @param {{code: string, expected?: string[], found?: string|null, limit?: number|null}} error
 * @param {string} lang
 * @returns {string}
 */
export function errorMessage(error, lang) {
  return t(lang, `error.${error.code}`, {
    expected: describeList(error.expected ?? [], lang),
    found: error.found === null || error.found === undefined ? t(lang, 'token.eof') : quoteFound(error.found),
    limit: error.limit ?? '',
  });
}

/**
 * @param {{line: number, column: number}} error
 * @param {string} lang
 * @returns {string} e.g. "Line 3, column 14"
 */
export function errorLocation(error, lang) {
  return t(lang, 'error.location', { line: error.line, column: error.column });
}

function describeList(items, lang) {
  const words = items.map((item) => describeExpected(item, lang));
  if (words.length < 2) return words.join('');
  return `${words.slice(0, -1).join(', ')} ${t(lang, 'list.or')} ${words.at(-1)}`;
}

/**
 * Quotes the offending text so its own quotes never clash with the message's. Only a string
 * from the input starts with a quote and is longer than one character; it is shown as written.
 * Anything else goes in single quotes, or in double quotes when it contains a single quote.
 */
function quoteFound(found) {
  if (found.length > 1 && (found[0] === '"' || found[0] === "'")) return found;
  return found.includes("'") ? `"${found}"` : `'${found}'`;
}

function describeExpected(item, lang) {
  const key = `token.${item}`;
  return Object.hasOwn(STRINGS.en, key) ? t(lang, key) : `'${item}'`;
}
