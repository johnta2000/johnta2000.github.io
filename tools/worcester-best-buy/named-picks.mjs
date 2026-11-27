import { canModel } from './optimizer.mjs';

const filler = new Set("a an the some any i id we wed she shed my me her us you please can could would like love want wants looking for to get buy pick add also of and on in with from".split(' '));

function words(value) {
  return value.toLowerCase().normalize('NFKD')
    .replace(/['’]/g, '')
    .replace(/\bwi[ -]?fi\b/g, 'wifi')
    .replace(/\bair[ -]?fryers?\b/g, 'air fryer')
    .replace(/\bcrock[ -]?pots?\b/g, 'slow cooker')
    .replace(/light[ -]?strips?/g, 'light strip')
    .replace(/\b(?:lighting|lights)\b/g, 'light')
    .replace(/\b(?:gaming|games)\b/g, 'game')
    .replace(/\b(?:televisions?|tvs)\b/g, 'tv')
    .replace(/\b(?:feet|foot)\b/g, 'ft')
    .replace(/(\d)(ft|qt|inch)\b/g, '$1 $2')
    .match(/[a-z]+|\d+(?:\.\d+)?/g) || [];
}

function tokens(value) {
  return new Set(words(value).filter(word => !filler.has(word)).map(word =>
    word.endsWith('ies') ? word.slice(0, -3) + 'y' :
    word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word));
}

export function makeNameSearch(catalog) {
  const index = catalog.map(item => {
    const title = tokens(item.name + ' ' + (item.short || ''));
    let aliases = item.cat;
    if (title.has('espresso')) aliases += ' coffee machine maker';
    if (title.has('coffee') && title.has('maker')) aliases += ' machine';
    const searchable = new Set([...title, ...tokens(aliases)]);
    return { item, title, searchable, eligible: canModel(item) };
  });

  function matches(query) {
    const wanted = [...tokens(query)];
    if (!wanted.length) return [];
    return index.filter(entry => wanted.every(word => entry.searchable.has(word)))
      .map(entry => ({ entry, score: wanted.filter(word => entry.title.has(word)).length }))
      .sort((a, b) => Number(b.entry.eligible) - Number(a.entry.eligible) ||
        b.score - a.score || a.entry.item.price - b.entry.item.price)
      .map(({ entry }) => entry.item.id);
  }

  return function findNames(text) {
    const ids = new Set();
    const missing = [];
    for (const line of text.split(/[,;\n]+/).map(part => part.trim()).filter(Boolean)) {
      // The catalog also uses "and" between two sizes of the same product.
      const phrases = line.replace(/^(?:and|also|plus)\s+/i, '')
        .replace(/(\d+\s*qt)\s+and\s+(\d+\s*qt)/gi, '$1 $2')
        .split(/\s+(?:and(?: also)?|as well as|plus(?=\s+(?:an?|some|the)\b))\s+/i);
      for (const phrase of phrases) {
        if (!tokens(phrase).size) continue;
        const found = matches(phrase);
        if (!found.length) missing.push(phrase);
        found.forEach(id => ids.add(id));
      }
    }
    return { ids: [...ids], missing };
  };
}
