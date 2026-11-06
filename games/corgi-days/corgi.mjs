// Plush sprites follow the user's reference; accessories stay editable overlays.
export function corgi(p) {
  const coat = ['golden', 'tricolor', 'cocoa', 'cream'].includes(p.coat) ? p.coat : 'golden';
  const color = /^#[a-f0-9]{6}$/i.test(p.color) ? p.color : '#df8066';
  const accessory = ['none', 'bandana', 'bow', 'crown', 'flower'].includes(p.accessory) ? p.accessory : 'none';
  const accessories = {
    none: '',
    bandana: `<g transform="rotate(-9 885 946)"><path d="M745 881Q890 925 1042 880L1019 929L896 1031L781 932Z" fill="url(#fabric)"/><path d="M761 899Q890 943 1025 899L896 1012Z" fill="none" stroke="#fff5e8" stroke-opacity=".45" stroke-width="4" stroke-dasharray="7 6"/><path d="M878 963L896 943L914 963L896 983Z" fill="#fff1db" opacity=".9"/></g>`,
    bow: `<g transform="translate(875 937) rotate(-8)"><path d="M-13-7C-61-58-105-63-102-6C-108 54-57 46-12 11M13-7C61-58 105-63 102-6C108 54 57 46 12 11" fill="url(#fabric)" stroke="#563b33" stroke-opacity=".16" stroke-width="3"/><path d="M-84-24L-18 1L-79 27M84-24L18 1L79 27" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="4"/><rect x="-17" y="-27" width="34" height="53" rx="12" fill="url(#fabric)"/></g>`,
    crown: `<g transform="translate(725 338) rotate(-9)"><path d="M-100 12L-121-100L-55-60L0-137L57-59L119-102L100 12Z" fill="url(#gold)" stroke="#bd8d3e" stroke-width="5" stroke-linejoin="round"/><path d="M-95-5H95" stroke="#fff0b0" stroke-width="10"/><circle cy="-53" r="14" fill="${color}"/><g fill="#f9dd91" stroke="#c59948" stroke-width="3"><circle cx="-121" cy="-100" r="10"/><circle cy="-137" r="10"/><circle cx="119" cy="-102" r="10"/></g></g>`,
    flower: `<g transform="translate(558 438) rotate(-15)"><path d="M12 18Q107-9 92 53Q54 70 12 18" fill="#8eaa7b"/><g fill="url(#fabric)"><ellipse cy="-35" rx="27" ry="43"/><ellipse cy="35" rx="27" ry="43"/><ellipse cx="35" rx="43" ry="27"/><ellipse cx="-35" rx="43" ry="27"/></g><circle r="24" fill="url(#gold)"/><circle cx="-7" cy="-7" r="6" fill="#fff1ba"/></g>`,
  };
  return `<svg class="corgi corgi-plush" viewBox="0 0 1280 1280" role="img" aria-label="Round ${coat} plush corgi${accessory === 'none' ? '' : ' wearing a '+accessory}">
    <defs><linearGradient id="fabric" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="${color}"/><stop offset=".48" stop-color="${color}"/><stop offset="1" stop-color="#483c35"/></linearGradient><linearGradient id="gold" x2=".5" y2="1"><stop stop-color="#ffe8a3"/><stop offset=".5" stop-color="#eac26e"/><stop offset="1" stop-color="#c79541"/></linearGradient></defs>
    <ellipse cx="636" cy="1081" rx="475" ry="36" fill="#576a3d" opacity=".13"/>
    <g class="plush-body"><image href="assets/plush-${coat}.png" width="1280" height="1280"/>${accessories[accessory]}</g>
    <g class="plush-hearts" fill="#dc958c"><path d="M187 405C138 352 90 420 187 488C284 420 236 352 187 405Z"/><path d="M1123 324C1088 285 1051 334 1123 386C1195 334 1158 285 1123 324Z"/></g>
  </svg>`;
}
