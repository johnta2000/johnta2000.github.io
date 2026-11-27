import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canModel, price, quote, parseAmount, changeQuantity, encodeCart, decodeCart, subtotalOf, saleSavings, rankedAdditions, cheapestSubset } from '../optimizer.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const { data, picks } = JSON.parse(html.match(/id="catalog-data">([^<]*)<\/script>/)[1]);
const inventory = new Map(data.filter(canModel).map(item => [item.id, item]));

test('the two discounts unlock once, exactly at 100 dollars in eligible merchandise', () => {
  assert.deepEqual(quote(9999,true), {subtotal:9999, gap:1, mainDiscount:0, extraDiscount:0, savings:0, net:9999});
  assert.equal(quote(10000,true).net,5000);
  assert.equal(quote(10001,true).net,5001);
  assert.equal(quote(10000,false).net,6000);
  assert.equal(quote(20000,true).savings,5000);
  assert.equal(quote(0,true).net,0);
});

test('submitted starting amounts are read to the cent and reject malformed values', () => {
  for (const [text, expected] of [['',0],['.01',1],['$1,234.50',123450],['99.99',9999],['100',10000],['10.1',1010],
    ['-10',null],['0.999',null],['1,1',null],['Infinity',null],['<script>',null]]) assert.equal(parseAmount(text),expected);
});

test('cart links round-trip quantities and ignore invalid, excluded or other-platform IDs', () => {
  const cart = decodeCart('109.141x2.1.111.118.missing.139x0',inventory);
  assert.equal(encodeCart(cart),'109.141x2');
  assert.equal(subtotalOf(cart,inventory),10797);
  assert.equal(encodeCart(changeQuantity(cart,'item-141',-2)),'109');
  assert.equal(changeQuantity(cart,'item-141',1000).get('item-141'),99);
  assert.equal(encodeCart(cart),'109.141x2');
});

test('suggestions minimize overshoot and use local fixed-price eligible items', () => {
  const tv = decodeCart('109',inventory);
  const proposals = rankedAdditions(9999,data,tv);
  assert.equal(proposals[0].subtotal,10398);
  assert.equal(proposals[0].items[0].id,'item-141');
  assert.ok(proposals.every(proposal => proposal.items.every(i => canModel(i) && i.flag !== 'guest listing' && !tv.has(i.id))));
  assert.equal(rankedAdditions(9601,data,new Map())[0].subtotal,10000);
  assert.deepEqual(rankedAdditions(10000,data,new Map()),[]);
  assert.ok(rankedAdditions(0,data,new Map(),{category:'Lighting'}).every(x => x.items.every(i => i.cat === 'Lighting')));
});

test('curated carts use current DoorDash item prices and count displayed markdowns once', () => {
  for (const pick of picks) {
    const cart = new Map(pick.items.map(id => [id,1]));
    assert.ok([...cart.keys()].every(id => inventory.has(id) && inventory.get(id).flag !== 'guest listing'));
    const subtotal = subtotalOf(cart,inventory);
    assert.ok(subtotal >= 10000 && subtotal <= 11000);
    assert.equal(quote(subtotal,true).net,subtotal-5000);
  }
  assert.deepEqual(saleSavings(decodeCart('138.139',inventory),inventory,0),{markdown:12300, complete:true});
  assert.deepEqual(saleSavings(decodeCart('148.149',inventory),inventory,0),{markdown:6800, complete:true});
  assert.equal(saleSavings(decodeCart('138.139',inventory),inventory,1).complete,false);
});

test('cheapest qualifying subset matches an exhaustive search, retaining the starting subtotal', () => {
  const fixture = ['141','139','112','108','138','133'].map(n => inventory.get('item-'+n));
  for (const base of [0,651,4500,9750,10000,10001]) {
    for (let mask = 0; mask < 64; mask++) {
      const cart = new Map(); const units = [];
      fixture.forEach((item, index) => {
        if (!(mask & (1 << index))) return;
        const qty = index % 3 === 0 ? 2 : 1;
        cart.set(item.id,qty);
        for (let i = 0; i < qty; i++) units.push(price(item));
      });
      const total = base + subtotalOf(cart, inventory);
      let sums = [base];
      for (const value of units) sums = sums.concat(sums.map(sum => sum + value));
      const minimum = Math.min(total,...sums.filter(v => v >= 10000));
      const result = cheapestSubset(cart,inventory,total,base);
      if (result) {
        assert.equal(result.subtotal,base+subtotalOf(result.items,inventory));
        assert.ok([...result.items].every(([id,q]) => q <= cart.get(id)));
      }
      assert.equal(result?.subtotal ?? total,minimum);
    }
  }
});

test('changing basket size and ranking searches the correct qualifying carts', () => {
  const empty = new Map();
  const closest = rankedAdditions(0,data,empty)[0];
  assert.equal(closest.subtotal,10039);
  assert.equal(closest.items.length,3);
  assert.equal(rankedAdditions(0,data,empty,{maxItems:2})[0].subtotal,10098);
  const sales = rankedAdditions(0,data,empty,{rank:'sale',limit:50});
  assert.ok(sales.length);
  assert.ok(sales.every(x => x.subtotal >= 10000 && x.subtotal <= 11000 && x.markdown > 0));
  assert.ok(sales.every((x,i) => !i || x.markdown <= sales[i-1].markdown));
  const coffee = decodeCart('133.156',inventory);
  assert.equal(subtotalOf(coffee,inventory),10098);
  assert.equal(quote(10098,true).net,5098);
  assert.deepEqual(saleSavings(coffee,inventory,0),{markdown:15900,complete:true});
});

test('larger groups of similarly priced products preserve the highest-ranked qualifying totals', () => {
  const products = Array.from({ length: 22 }, (_, i) => ({
    id: 'item-' + (200 + i), price: [18, 24, 33, 41, 52, 60][i % 6],
    compare: 64 + i, cat: ['Gaming','Audio'][i % 2], platform: 'door'
  }));
  for (const rank of ['near','sale']) {
    const matches = [];
    function search(start, chosen, sum) {
      for (let i=start;i<products.length;i++) {
        const next = [...chosen,products[i]], total = sum + products[i].price * 100;
        if (total < 10000 && next.length < 3) search(i+1,next,total);
        if (total < 10000 || total-Math.min(...next.map(p=>p.price))*100 >= 10000 || (rank==='sale' && total>11000)) continue;
        matches.push([total,next.length,new Set(next.map(p=>p.cat)).size,next.reduce((n,p)=>n+(p.compare-p.price)*100,0)]);
      }
    }
    search(0,[],700);
    matches.sort((a,b)=>(rank==='sale'?b[3]-a[3]:0)||a[0]-b[0]||a[1]-b[1]||a[2]-b[2]||b[3]-a[3]);
    const actual=rankedAdditions(700,products,new Map(),{rank,limit:4});
    assert.deepEqual(actual.map(m=>[m.subtotal,m.items.length,m.categories,m.markdown]),matches.slice(0,4));
  }
});
