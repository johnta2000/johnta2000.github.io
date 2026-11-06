// Original flat vector artwork: a tiny, plush-inspired corgi loaf.
export function mountCorgi(host, pet) {
  host.innerHTML = `<svg class="corgi" viewBox="0 0 380 290" role="img" aria-label="A round cartoon corgi with tiny paws and a happy smile">
    <ellipse cx="189" cy="260" rx="129" ry="13" fill="#72835d" opacity=".14"/>
    <g class="loaf" stroke="#946e4c" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
      <path class="fur" d="M72 174C44 153 34 174 47 191L72 202"/>
      <path class="fur" d="M59 190C55 145 84 112 135 108C173 96 223 108 257 138C288 166 290 211 263 237C244 257 107 261 80 243C65 231 60 214 59 190Z"/>
      <path fill="#fff7e8" stroke="none" d="M61 207C95 218 130 211 169 209L266 206L267 237C244 257 108 260 80 243C69 234 64 221 61 207Z"/>
      <path fill="#fff7e8" d="M91 232C84 249 89 261 103 263C118 265 128 256 126 242"/>
      <path fill="#fff7e8" d="M255 235C257 254 268 261 282 256C294 252 294 241 284 230"/>
      <path class="fur" d="M177 117C161 93 155 47 169 40C180 34 209 69 218 91Z"/>
      <path fill="#efb4ac" stroke="none" d="M178 94C170 75 167 55 173 54C179 53 194 72 201 87Z"/>
      <path class="fur" d="M265 93C274 65 298 34 310 41C320 47 319 92 306 119Z"/>
      <path fill="#efb4ac" stroke="none" d="M283 90C290 72 303 52 307 56C311 61 307 88 301 100Z"/>
      <path class="fur" d="M150 171C147 122 176 86 229 86C284 84 323 114 329 163C336 209 303 244 246 248C187 253 154 222 150 171Z"/>
      <path fill="#fff7e8" stroke="none" d="M151 182C177 189 210 179 221 163C230 147 229 117 242 110C251 107 255 122 258 137C266 165 289 181 330 178C326 220 296 244 246 247C194 251 161 227 151 182Z"/>
      <path class="tricolor-brow" d="M184 147Q194 141 203 145M279 144Q289 139 297 145" fill="none" stroke="#dfa565" stroke-width="8"/>
      <g class="open-eyes" fill="#513f36" stroke="none"><ellipse cx="197" cy="165" rx="5.6" ry="7.2"/><ellipse cx="286" cy="163" rx="5.6" ry="7.2"/></g>
      <g class="sleep-eyes" fill="none" stroke="#513f36" stroke-width="3.5"><path d="M190 166Q197 171 204 166M279 164Q286 169 293 164"/></g>
      <g stroke="none" fill="#edb3a4" opacity=".8"><ellipse cx="185" cy="184" rx="12" ry="6"/><ellipse cx="300" cy="181" rx="11" ry="6"/></g>
      <path fill="#513f36" stroke="none" d="M234 180Q243 175 252 180Q255 186 244 191Q233 188 234 180Z"/>
      <path d="M244 190V194Q238 202 232 195M244 194Q250 201 256 194" stroke="#513f36" stroke-width="3" fill="none"/>
      <path fill="#fff7e8" d="M166 233C161 252 169 264 184 264C198 264 202 254 199 243"/>
      <g data-accessory="bandana"><path class="accent" d="M208 239Q240 254 273 238L246 269Z" stroke-width="2.5"/><path d="M242 253L247 259" stroke="#fff7e8" stroke-width="3"/></g>
      <g data-accessory="bow"><path class="accent" d="M238 244C214 222 202 233 213 252C221 261 229 252 238 248C254 261 274 263 271 244C270 225 250 234 242 242Z" stroke-width="2.5"/><circle class="accent" cx="241" cy="246" r="7" stroke-width="2.5"/></g>
      <g data-accessory="crown"><path fill="#f5d16e" d="M213 87L204 57L225 68L238 46L250 68L274 56L266 87Z" stroke-width="2.5"/><circle class="accent" cx="239" cy="75" r="4" stroke="none"/></g>
      <g data-accessory="flower" transform="translate(180 106)" stroke-width="2"><g class="accent"><ellipse cy="-11" rx="8" ry="11"/><ellipse cy="-11" rx="8" ry="11" transform="rotate(72)"/><ellipse cy="-11" rx="8" ry="11" transform="rotate(144)"/><ellipse cy="-11" rx="8" ry="11" transform="rotate(216)"/><ellipse cy="-11" rx="8" ry="11" transform="rotate(288)"/></g><circle r="7" fill="#f5d16e"/></g>
    </g>
    <g class="cuddle-hearts" fill="#d99593"><path d="M125 65C111 49 103 70 125 81C147 67 137 50 125 65Z"/><path d="M337 118C325 106 320 122 337 131C354 119 346 107 337 118Z"/></g>
    <g class="wash-bubbles" fill="#fffef8" fill-opacity=".7" stroke="#a8c9ca" stroke-width="2"><circle cx="135" cy="142" r="13"/><circle cx="305" cy="110" r="10"/><circle cx="332" cy="157" r="15"/><circle cx="153" cy="112" r="6"/></g>
    <g class="sleep-moons" fill="#7f789a" font-family="sans-serif" font-weight="600"><text x="311" y="112" font-size="18">z</text><text x="332" y="90" font-size="24">z</text></g>
    <g class="snack" transform="translate(249 211) rotate(-12)" fill="#d7a667" stroke="#946e4c" stroke-width="2"><rect x="-10" y="-6" width="20" height="13" rx="5"/><path d="M-3-2V3M4-2V3"/></g>
  </svg>`;
  let timer;
  function style(p) {
    const colors = {golden:'#e8b477', tricolor:'#655952', cocoa:'#b98d73', cream:'#eddbb5'};
    host.style.setProperty('--fur', colors[p.coat] || colors.golden);
    host.style.setProperty('--accessory', /^#[\da-f]{6}$/i.test(p.color) ? p.color : '#df8066');
    host.querySelector('.tricolor-brow').style.display = p.coat === 'tricolor' ? '' : 'none';
    host.querySelectorAll('[data-accessory]').forEach(g => g.style.display = g.dataset.accessory === p.accessory ? '' : 'none');
  }
  style(pet);
  host.dataset.ready = 'true';
  return {
    style,
    react(action='cuddle') {
      clearTimeout(timer);
      host.dataset.mood = ['feed','wash','sleep','play'].includes(action) ? action : 'cuddle';
      timer = setTimeout(() => delete host.dataset.mood, 3200);
    },
    dispose() {clearTimeout(timer);host.replaceChildren();}
  };
}
