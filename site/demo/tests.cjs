const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Small DOM test double: no browser, requests or external packages needed.
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.attributes = {}; this._text = ''; }
  append(...nodes) {
    for (let node of nodes) {
      if (typeof node === 'string') { const text = new Node('#text'); text._text = node; node = text; }
      if (node.tag === '#fragment') { this.append(...[...node.children]); continue; }
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node),1);
      node.parent = this; this.children.push(node);
    }
  }
  replaceChildren(...nodes) { for (const child of this.children) child.parent = null; this.children = []; this.append(...nodes); }
  setAttribute(name,value) { this.attributes[name] = value; }
  addEventListener(name,handler) { this.events[name] = handler; }
  set textContent(value) { this.children = []; this._text = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
}
const elements = new Map();
const document = {
  getElementById(id) { if (!elements.has(id)) elements.set(id,new Node('div')); return elements.get(id); },
  createElement(tag) { return new Node(tag); },
  createTextNode(text) { const node = new Node('#text'); node._text = String(text); return node; },
  createDocumentFragment() { return new Node('#fragment'); },
  querySelectorAll() { return []; }
};
const html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
let script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new Function(script);
script = script.replace('showHistory();updateConnection();loadCatalog();','globalThis.hooks = {renderText,safeImageUrl,readAnswer,welcome,addMessage,validateCatalog,filterCatalog,productCard};');
const context = vm.createContext({document,sessionStorage:{getItem:()=>null},crypto:require('node:crypto').webcrypto,window:{addEventListener(){}},URL,TextDecoder,AbortController,setTimeout,clearTimeout});
vm.runInContext(script,context);
const {renderText,safeImageUrl,readAnswer,welcome,addMessage,validateCatalog,filterCatalog,productCard} = context.hooks;
function all(node,tag) { return (node.tag === tag ? [node] : []).concat(node.children.flatMap(child => all(child,tag))); }

const href = 'https://ekt.kz/upload/iblock/example/product.jpg';
assert.equal(safeImageUrl(href),href);
for (const url of ['http://ekt.kz/photo.jpg','https://ekt.kz.evil.test/photo.jpg','https://evil.test/photo.jpg','https://ekt.kz@evil.test/photo.jpg','https://user:pass@ekt.kz/photo.jpg','https://ekt.kz:8443/photo.jpg','data:image/svg+xml,test','javascript:alert(1)']) assert.equal(safeImageUrl(url),null,url);
for (const url of ['https://ekt.kz/personal/cart/','https://ekt.kz/catalog/test/','https://ekt.kz/upload/a.jpg?track=1','https://ekt.kz/upload/a.jpg#fragment','https://ekt.kz/upload/../personal/cart/','https://ekt.kz/upload/%2f..%2fpersonal/cart/']) assert.equal(safeImageUrl(url),null,url);
const body = new Node('div');
renderText(body,`Фото товара\n![Выключатель](${href})`,true);
assert.equal(all(body,'img').length,1);
const image = all(body,'img')[0]; const card = all(body,'figure')[0];
assert.equal(image.src,href); assert.equal(image.alt,'Выключатель');
assert.equal(image.loading,'lazy'); assert.equal(image.decoding,'async'); assert.equal(image.referrerPolicy,'no-referrer');
const link = all(card,'a')[0];assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
image.events.error();assert.equal(image.hidden,true);assert.equal(all(card,'span')[0].hidden,false);
renderText(body,`Фото товара\n![Выключатель](${href})\nДополнительный текст`,true);
assert.equal(all(body,'figure')[0],card,'Streaming should reuse the image DOM node');
assert.equal(all(body,'img')[0].hidden,true,'Image fallback must survive streaming updates');

const blocked = '![Фото](https://evil.test/tracker.jpg) <img src=x onerror=alert(1)>';
renderText(body,blocked,true);assert.equal(all(body,'img').length,0);assert.equal(body.textContent,blocked);
renderText(body,`![Фото](${href})`);assert.equal(all(body,'img').length,0,'Images in user messages are text');
const userMessage = addMessage('user',`![Фото](${href})`);assert.equal(all(userMessage.body,'img').length,0);
const assistantMessage = addMessage('assistant',`![Фото](${href})`);assert.equal(all(assistantMessage.body,'img').length,1);
renderText(body,`![" onerror="alert(1)](${href})`,true);assert.equal(all(body,'img')[0].alt,'" onerror="alert(1)');assert.equal(all(body,'img')[0].attributes.onerror,undefined);
renderText(body,'**Название** [Карточка](https://ekt.kz/catalog/test/) `артикул` [плохо](javascript:alert(1))',true);
assert.equal(all(body,'strong').length,1);assert.equal(all(body,'code').length,1);assert.equal(all(body,'a').length,1);
welcome();const prompts = all(elements.get('messages'),'button').map(button => button.textContent);
for (const label of ['Какие товары есть?','Товары с фото','Подобрать выключатель','Доставка и оплата','Қазақша сұрақ қою']) assert(prompts.includes(label));

const sample = {sku:'sample-1',name:'<img onerror=alert(1)> Автомат',category_name:'Автоматы',price:'123.45',currency:'KZT',stock_total:3,image_url:href,product_url:'https://ekt.kz/catalog/example/'};
const payload = {total_products:2,categories:[],updated_at:'2026-09-23T12:00:00Z',products:[sample,{...sample,sku:'sample-2',name:'Реле',category_name:'Реле',stock_total:0,image_url:null}]};
const validated = validateCatalog(payload);
assert.equal(validated.products.length,2);assert.equal(validated.products[0].price,123.45);
assert.equal(filterCatalog(validated.products,'SAMPLE-1','',false).length,1);
assert.equal(filterCatalog(validated.products,'автомат','',false).length,1);
assert.equal(filterCatalog(validated.products,'','Реле',false).length,1);
assert.equal(filterCatalog(validated.products,'','',true).length,1);
assert.equal(filterCatalog(validated.products,'missing','',false).length,0);
const abbreviated = [{sku:'drx-1',name:'АВ DRX 125 Legrand',category_name:'Силовые автоматические выключатели',stock_total:2}];
for (const query of ['автомат','Legrand автомат','силовой','выключатель']) assert.equal(filterCatalog(abbreviated,query,'',false).length,1,query);
assert.equal(filterCatalog(abbreviated,'кабель','',false).length,0);
assert.equal(filterCatalog(abbreviated,'Legrand кабель','',false).length,0);
for (const change of [{price:''},{price:null},{price:false},{stock_total:''},{stock_total:null},{stock_total:-1},{stock_total:1.5},{currency:'INVALID'}]) assert.throws(()=>validateCatalog({...payload,products:[{...sample,...change},payload.products[1]]}));
assert.throws(()=>validateCatalog({...payload,total_products:3}));
assert.equal(validateCatalog({total_products:0,categories:[],products:[]}).products.length,0);
const cardProduct = productCard(validated.products[0]);
assert.equal(all(cardProduct,'img').length,1);assert.equal(all(cardProduct,'h3')[0].textContent,sample.name);
assert.equal(all(cardProduct,'button')[0].textContent,'Спросить об этом товаре');
assert.equal(all(cardProduct,'a')[0].href,sample.product_url);
const unsafeCatalog = validateCatalog({...payload,products:[{...sample,image_url:'https://evil.test/x.jpg',product_url:'javascript:alert(1)'},payload.products[1]]});
assert.equal(unsafeCatalog.products[0].image_url,null);assert.equal(unsafeCatalog.products[0].product_url,null);
const noPhotoCard = productCard(unsafeCatalog.products[0]);assert.equal(all(noPhotoCard,'img').length,0);assert.equal(all(noPhotoCard,'a').length,0);

(async () => {
  const payload = Buffer.from([{type:'begin'},{type:'item',content:'Фото: '},{type:'item',content:`![Выключатель](${href})`},{type:'end'}].map(JSON.stringify).join('\n'));
  const stream = new ReadableStream({start(controller) {for(let i=0;i<payload.length;i+=3) controller.enqueue(payload.slice(i,i+3));controller.close();}});
  let result = '';
  await readAnswer(new Response(stream,{headers:{'content-type':'application/json; charset=utf-8'}}),text => {result=text;renderText(body,text,true);});
  assert.equal(result,`Фото: ![Выключатель](${href})`);assert.equal(all(body,'img').length,1);
  await readAnswer(new Response(JSON.stringify({output:'Ответ'},null,2)),text => {result=text;});assert.equal(result,'Ответ');
  await assert.rejects(()=>readAnswer(new Response('<html>proxy error</html>'),()=>{}));
  console.log('PASS: trusted images, XSS/unsafe URLs, lazy/referrer/alt, fallback, streaming DOM reuse, prompts, NDJSON/JSON, catalog schema/counts/numbers, filters, empty catalog and safe product cards.');
})().catch(error => {console.error(error);process.exitCode=1;});
