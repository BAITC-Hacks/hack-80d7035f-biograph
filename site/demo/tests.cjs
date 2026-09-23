const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Small DOM test double: no browser, requests or external packages needed.
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.attributes = {}; this._text = ''; this.style = {}; this.value = ''; this.scrollHeight = 40; this.scrollTop = 0; this.clientHeight = 100; }
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
  focus() {}
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this),1); }
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
script = script.replace('showHistory();updateConnection();loadCatalog();','globalThis.hooks = {renderText,safeImageUrl,readAnswer,welcome,addMessage,validateCatalog,filterCatalog,productCard,attachmentMetadata,validateExtraction,attachmentChatInput,normalizeAttachmentDataUrl,selectAttachment,clearAttachment,submit};');
const savedStates = [];const requests = [];let extractionStatus = 200;
const extractedMarker = 'PRIVATE_DOCUMENT_ONLY_IN_REQUEST';const dataMarker = 'data:text/csv;base64,YXJ0aWNsZSxxdWFudGl0eQphYmMsMQ==';
class MockFileReader {readAsDataURL() {this.result = dataMarker.replace('text/csv','application/octet-stream');queueMicrotask(()=>this.onload());} abort() {this.onabort();}}
const context = vm.createContext({document,sessionStorage:{getItem:()=>null,setItem:(key,value)=>savedStates.push(value)},crypto:require('node:crypto').webcrypto,window:{addEventListener(){}},URL,TextDecoder,AbortController,setTimeout,clearTimeout,FileReader:MockFileReader,navigator:{onLine:true},matchMedia:()=>({matches:false}),fetch:async (url,options) => {requests.push({url,options});return url.includes('attachment-extract') ? new Response(JSON.stringify({ok:true,file_name:'items.csv',extracted_text:extractedMarker,warning:''}),{status:extractionStatus}) : new Response(JSON.stringify({output:'Найденные товары сверены с каталогом.'}),{headers:{'Content-Type':'application/json'}});}});
vm.runInContext(script,context);
const {renderText,safeImageUrl,readAnswer,welcome,addMessage,validateCatalog,filterCatalog,productCard,attachmentMetadata,validateExtraction,attachmentChatInput,normalizeAttachmentDataUrl,selectAttachment,clearAttachment,submit} = context.hooks;
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

for (const [name,type] of [['a.pdf','application/pdf'],['a.docx',''],['a.xlsx',''],['a.xls','application/vnd.ms-excel'],['a.csv','text/csv'],['a.jpeg','image/jpeg'],['a.png','image/png'],['a.webp','image/webp']]) assert(attachmentMetadata({name,type,size:30}).mimeType);
assert.equal(attachmentMetadata({name:'a.csv',type:'text/plain',size:700 * 1024}).mimeType,'text/csv');
for (const file of [{name:'x.exe',type:'',size:1},{name:'x.pdf',type:'',size:0},{name:'x.pdf',type:'',size:700*1024+1},{name:'x.png',type:'text/html',size:1}]) assert.throws(()=>attachmentMetadata(file));
assert.equal(validateExtraction({ok:true,extracted_text:'x'.repeat(6000)}).text.length,6000);
for (const value of [{ok:false,extracted_text:'x'},{ok:true,extracted_text:''},{ok:true,extracted_text:'x'.repeat(6001)}]) assert.throws(()=>validateExtraction(value));
for (const doc of ['Да, добавь','я'.repeat(6000),'"\\'.repeat(3000),'🙂'.repeat(3000)]) {
  const prepared = attachmentChatInput('"'.repeat(1000),'"'.repeat(175)+'.csv',doc);
  assert(prepared.chatInput.length <= 5900);assert(prepared.chatInput.startsWith('Сообщение с вложением.'));
  assert(!/^\s*да[,\s!]*добавь[.!]?\s*$/iu.test(prepared.chatInput));
  assert(prepared.chatInput.includes('BEGIN_UNTRUSTED_DOCUMENT'));
  if (doc.length > 100) assert.equal(prepared.truncated,true);
}
assert.throws(()=>attachmentChatInput('a'.repeat(1001),'a.csv','x'));
assert.equal(attachmentChatInput('Найди товар','a.csv','abc').truncated,false);
assert.equal(normalizeAttachmentDataUrl('data:application/octet-stream;base64,YWJj','application/pdf'),'data:application/pdf;base64,YWJj');
assert.equal(normalizeAttachmentDataUrl('data:;base64,YWJj','image/png'),'data:image/png;base64,YWJj');
assert.equal(normalizeAttachmentDataUrl('data:text/plain;base64,YWJj','text/csv'),'data:text/csv;base64,YWJj');
for (const data of ['data:text/html;base64,YWJj','https://example.test/file.pdf','data:application/pdf,YWJj','data:application/pdf;base64,YWJ','data:application/pdf;base64,!!!!']) assert.throws(()=>normalizeAttachmentDataUrl(data,'application/pdf'));
assert.throws(()=>normalizeAttachmentDataUrl('data:image/png;base64,YWJj','image/jpeg'));
assert.throws(()=>normalizeAttachmentDataUrl('data:;base64,YWJj','application/javascript'));

(async () => {
  const payload = Buffer.from([{type:'begin'},{type:'item',content:'Фото: '},{type:'item',content:`![Выключатель](${href})`},{type:'end'}].map(JSON.stringify).join('\n'));
  const stream = new ReadableStream({start(controller) {for(let i=0;i<payload.length;i+=3) controller.enqueue(payload.slice(i,i+3));controller.close();}});
  let result = '';
  await readAnswer(new Response(stream,{headers:{'content-type':'application/json; charset=utf-8'}}),text => {result=text;renderText(body,text,true);});
  assert.equal(result,`Фото: ![Выключатель](${href})`);assert.equal(all(body,'img').length,1);
  await readAnswer(new Response(JSON.stringify({output:'Ответ'},null,2)),text => {result=text;});assert.equal(result,'Ответ');
  await assert.rejects(()=>readAnswer(new Response('<html>proxy error</html>'),()=>{}));
  selectAttachment({name:'items.csv',type:'text/csv',size:100});await submit('Найди товары из файла');
  assert.equal(requests.length,2);assert(requests[0].url.endsWith('/ekt-attachment-extract'));
  const extractionBody = JSON.parse(requests[0].options.body);assert.equal(extractionBody.mimeType,'text/csv');assert.equal(extractionBody.dataUrl,dataMarker);
  const chatBody = JSON.parse(requests[1].options.body);assert(chatBody.chatInput.includes(extractedMarker));assert(!chatBody.chatInput.includes(dataMarker));
  assert(savedStates.every(value=>!value.includes(extractedMarker) && !value.includes('base64') && !value.includes('extracted_text')));
  assert(savedStates.some(value=>value.includes('items.csv')));assert.equal(elements.get('attachment-chip').hidden,true);
  extractionStatus = 400;requests.length = 0;selectAttachment({name:'items.csv',type:'text/csv',size:100});await submit('Распознай файл');
  assert.equal(requests.length,1,'Failed extraction must not call chat or retry');assert.equal(elements.get('attachment-chip').hidden,false,'Failed extraction remains selected for explicit retry');
  extractionStatus = 413;requests.length = 0;await submit('Распознай файл');assert.equal(requests.length,1);assert(elements.get('attachment-status').textContent.includes('700 КБ'));
  elements.get('new-chat').events.click();assert.equal(elements.get('attachment-chip').hidden,true);
  console.log('PASS: existing images/catalog/streaming plus file types/700KiB and HTTP413, canonical MIME incl octet-stream/empty, unexpected-prefix rejection, extraction validation, <=5900 wrapper incl escaping/Unicode, non-consent, extract→chat, no raw/extracted text in sessionStorage, error without retry and new-dialog cleanup.');
})().catch(error => {console.error(error);process.exitCode=1;});


