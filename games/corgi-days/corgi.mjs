// Original layered SVG artwork. Coat colors and accessories stay live-editable.
export function corgi(p) {
  const palettes = {
    golden: ['#efb76e', '#d9904b', '#b27343', '#f4ca8a'],
    tricolor: ['#59554f', '#343633', '#30332f', '#dca164'],
    cocoa: ['#b99073', '#8a624d', '#6c4e40', '#d8ae88'],
    cream: ['#f3dfb1', '#d9bd85', '#ad9060', '#f9e9c8'],
  };
  const [light, dark, outline, tan] = palettes[p.coat] || palettes.golden;
  const color = /^#[a-f0-9]{6}$/i.test(p.color) ? p.color : '#df8066';
  const accessory = ['none', 'bandana', 'bow', 'crown', 'flower'].includes(p.accessory) ? p.accessory : 'none';
  return `<svg class="corgi corgi-v2" viewBox="0 0 320 300" role="img" aria-label="Fluffy ${p.coat in palettes ? p.coat : 'golden'} corgi with ${accessory}">
    <defs>
      <linearGradient id="fur" x1="0" y1="0" x2=".3" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
      <linearGradient id="cream-fur" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffdf4"/><stop offset="1" stop-color="#f0e4cb"/></linearGradient>
      <linearGradient id="inner-ear" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e5aaa0"/><stop offset="1" stop-color="#efc5ac"/></linearGradient>
      <radialGradient id="nose-shine" cx=".35" cy=".2" r=".9"><stop stop-color="#655349"/><stop offset="1" stop-color="#342d29"/></radialGradient>
    </defs>
    <ellipse cx="160" cy="277" rx="83" ry="10" fill="#607044" opacity=".13"/>
    <g stroke="${outline}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <g class="corgi-tail"><path d="M219 214C251 193 273 210 261 228C250 243 232 238 219 233" fill="url(#fur)"/><path d="M251 208C270 208 271 222 256 231L247 220Z" fill="#fff7e7" stroke="none"/></g>
      <path d="M105 179C76 196 73 237 89 257C106 277 209 279 231 255C248 236 232 195 210 181Z" fill="url(#fur)"/>
      <path d="M125 184C110 205 109 245 125 258C139 270 182 270 197 256C213 238 203 201 190 184" fill="url(#cream-fur)" stroke="none"/>
      <path d="M87 237C72 238 67 252 74 263C79 272 103 272 112 264L116 246" fill="url(#fur)"/>
      <path d="M231 237C247 238 252 252 245 263C240 272 216 272 207 264L204 246" fill="url(#fur)"/>
      <path d="M115 222C108 233 107 251 109 265C111 278 138 279 144 268L145 230" fill="url(#cream-fur)"/>
      <path d="M176 230L177 264C179 278 205 278 210 267C214 250 210 232 205 222" fill="url(#cream-fur)"/>
      <path d="M117 263L117 267M128 264L128 269M188 264L188 269M200 262L200 267" stroke="#c7b596" stroke-width="2"/>
    </g>
    <g class="corgi-head" stroke="${outline}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <g class="corgi-ear corgi-ear-left">
        <path d="M83 116C54 105 39 57 47 29C49 19 58 20 68 26C88 39 108 64 115 91Z" fill="url(#fur)"/>
        <path d="M79 91C64 79 54 51 57 36C72 43 92 68 97 85Z" fill="url(#inner-ear)" stroke="none"/>
        <path d="M65 83L80 89L75 99L91 95" fill="${tan}" stroke="none"/>
      </g>
      <g class="corgi-ear corgi-ear-right">
        <path d="M205 91C212 64 232 39 252 26C262 20 271 19 273 29C281 57 266 105 237 116Z" fill="url(#fur)"/>
        <path d="M223 85C228 68 248 43 263 36C266 51 256 79 241 91Z" fill="url(#inner-ear)" stroke="none"/>
        <path d="M255 83L240 89L245 99L229 95" fill="${tan}" stroke="none"/>
      </g>
      <path d="M70 120C75 91 103 75 138 73L146 66L153 72L164 65L171 73C214 73 240 91 249 120L255 137L247 137L257 155L247 155L249 167C239 196 204 213 160 214C115 213 80 196 71 167L73 155L63 155L73 137L65 137Z" fill="url(#fur)"/>
      ${p.coat === 'tricolor' ? `<path d="M77 140C79 115 105 102 126 116L126 153L94 169ZM243 140C241 115 215 102 194 116L194 153L226 169Z" fill="${tan}" stroke="none"/>` : ''}
      <path d="M153 75C145 96 148 115 136 132C123 140 106 136 93 144C79 154 82 173 97 185C110 196 135 205 160 205C186 205 210 196 223 185C238 173 241 154 227 144C214 136 197 140 184 132C172 115 175 96 167 75L162 81L158 76Z" fill="url(#cream-fur)" stroke="none"/>
      <path d="M96 121Q105 114 115 119M204 119Q214 114 223 121" fill="none" stroke="${tan}" stroke-width="5"/>
      <g class="corgi-eyes" stroke="none">
        <ellipse cx="111" cy="140" rx="10" ry="12" fill="#352f2a"/><ellipse cx="209" cy="140" rx="10" ry="12" fill="#352f2a"/>
        <ellipse cx="112" cy="145" rx="5" ry="4" fill="#765743"/><ellipse cx="210" cy="145" rx="5" ry="4" fill="#765743"/>
        <circle cx="108" cy="136" r="3.6" fill="#fffef9"/><circle cx="206" cy="136" r="3.6" fill="#fffef9"/>
        <circle cx="115" cy="143" r="1.6" fill="#fffef9"/><circle cx="213" cy="143" r="1.6" fill="#fffef9"/>
      </g>
      <g class="corgi-smile-eyes" fill="none" stroke="#40362d" stroke-width="4"><path d="M101 140Q111 129 121 140M199 140Q209 129 219 140"/></g>
      <ellipse cx="95" cy="158" rx="12" ry="6" fill="#e7a397" opacity=".55" stroke="none"/><ellipse cx="225" cy="158" rx="12" ry="6" fill="#e7a397" opacity=".55" stroke="none"/>
      <path d="M144 176Q160 198 176 176" fill="#544039" stroke="#544039" stroke-width="3"/>
      <path d="M152 182Q160 178 168 182L167 191Q160 199 153 191Z" fill="#eb9e9d" stroke="none"/>
      <path d="M160 184L160 189" stroke="#d27c80" stroke-width="1.5"/>
      <ellipse cx="145" cy="165" rx="21" ry="13" fill="#fff9ed" stroke="none"/><ellipse cx="175" cy="165" rx="21" ry="13" fill="#fff9ed" stroke="none"/>
      <path d="M144 154C146 149 174 149 176 154C176 161 166 168 160 168C154 168 144 161 144 154Z" fill="url(#nose-shine)" stroke="#40352e" stroke-width="1"/>
      <ellipse cx="155" cy="154" rx="6" ry="2" fill="#a58d77" opacity=".6" stroke="none"/>
      <path d="M160 168L160 172Q151 180 141 173M160 172Q169 180 179 173" fill="none" stroke="#5a4536" stroke-width="2.4"/>
      <g fill="#bba890" stroke="none" opacity=".65"><circle cx="135" cy="163" r="1.3"/><circle cx="138" cy="168" r="1"/><circle cx="185" cy="163" r="1.3"/><circle cx="182" cy="168" r="1"/></g>
      ${accessory === 'bandana' ? `<path d="M112 205Q160 221 208 205L183 218L158 246L132 217Z" fill="${color}" stroke="none"/><path d="M124 213Q160 226 196 213" fill="none" stroke="#fff" opacity=".35" stroke-width="2"/><path d="M153 230L158 224L163 230L158 236Z" fill="#fff4dc" stroke="none"/>` : ''}
      ${accessory === 'bow' ? `<path d="M155 216C130 194 118 202 125 224C126 236 144 231 156 222M165 216C190 194 202 202 195 224C194 236 176 231 164 222" fill="${color}" stroke="none"/><path d="M134 214L154 220M186 214L166 220" stroke="#fff" opacity=".3"/><rect x="154" y="210" width="12" height="18" rx="5" fill="${color}" stroke="#fff" stroke-opacity=".3" stroke-width="1.5"/>` : ''}
      ${accessory === 'crown' ? `<g transform="rotate(-8 160 73)"><path d="M132 75L126 46L144 56L158 34L175 55L192 43L188 75Z" fill="#f2cc71" stroke="#ba9043" stroke-width="2"/><path d="M134 69L185 69" stroke="#fff0b6" stroke-width="3"/><circle cx="158" cy="55" r="4" fill="${color}" stroke="none"/><circle cx="126" cy="45" r="3" fill="#f7de96" stroke="none"/><circle cx="158" cy="34" r="3" fill="#f7de96" stroke="none"/><circle cx="192" cy="43" r="3" fill="#f7de96" stroke="none"/></g>` : ''}
      ${accessory === 'flower' ? `<g transform="translate(221 101) rotate(20)" stroke="none"><path d="M4 4Q29 1 24 19Q9 22 4 4" fill="#7e9c6b"/><g fill="${color}"><ellipse cy="-11" rx="8" ry="12"/><ellipse cy="11" rx="8" ry="12"/><ellipse cx="11" rx="12" ry="8"/><ellipse cx="-11" rx="12" ry="8"/></g><circle r="7" fill="#f7de8e"/><circle cx="-2" cy="-2" r="2" fill="#fff2be"/></g>` : ''}
    </g>
    <g class="corgi-love" fill="#d68d83"><path d="M41 118C29 107 20 120 41 135C62 120 53 107 41 118Z"/><path d="M278 96C270 87 262 97 278 109C294 97 286 87 278 96Z"/></g>
  </svg>`;
}
