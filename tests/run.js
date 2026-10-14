"use strict";
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const C=require('../src/color/conversions.js'),G=require('../src/ui/geometry.js'),S=require('../src/color/state.js');
const {createColorSync}=require('../src/photoshop/color-sync.js');
function host(){
  class SolidColor{constructor(){this.rgb={red:0,green:0,blue:0};}}
  const solid=rgb=>{const c=new SolidColor();Object.assign(c.rgb,{red:rgb.r,green:rgb.g,blue:rgb.b});return c;};
  let fg=solid({r:142,g:41,b:36}),bg=solid({r:153,g:43,b:31}),listener=()=>{},writes=0,calls=0,gate=null,fail=false;
  const app={SolidColor,get foregroundColor(){return fg;},set foregroundColor(c){fg=c;writes++;listener();},get backgroundColor(){return bg;},set backgroundColor(c){bg=c;writes++;listener();}};
  return {app,core:{async executeAsModal(fn,options){assert.equal(options.timeOut,1.5);calls++;if(gate)await gate;if(fail){fail=false;throw Error('host busy');}await fn();}},action:{async addNotificationListener(events,fn){listener=fn;}},get writes(){return writes;},get calls(){return calls;},set gate(p){gate=p;},set fail(v){fail=v;},external(key,rgb){if(key==='fg')fg=solid(rgb);else bg=solid(rgb);listener();}};
}
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function harness(){
  const ps=host(),elements={},timers=new Map();let tick=0,lifecycle;
  function element(id){return {id,style:{},value:'',textContent:'',classList:{toggle(){},add(){},remove(){}},listeners:{},clientWidth:296,clientHeight:390,offsetHeight:69,setAttribute(){},addEventListener(k,fn){(this.listeners[k]||=[]).push(fn);},emit(k,e={}){for(const fn of this.listeners[k]||[])fn(Object.assign({button:0,buttons:1,clientX:150,clientY:80,preventDefault(){}},e));},getBoundingClientRect(){return {left:0,top:0,width:200,height:200};},querySelector(){return element('track');},focus(){doc.activeElement=this;},blur(){if(doc.activeElement===this)doc.activeElement=null;},select(){}};}
  const doc=element('document');doc.readyState='complete';doc.activeElement=null;doc.documentElement=element('html');doc.getElementById=id=>elements[id]||=(element(id));doc.querySelector=()=>doc.getElementById('slider-area');
  const win=element('window');win.innerWidth=310;win.innerHeight=455;
  const context=vm.createContext({console,document:doc,window:win,require:name=>name==='photoshop'?ps:name==='uxp'?{entrypoints:{setup(v){lifecycle=v.panels.pickerPanel;}}}:require(path.resolve(__dirname,'../src',name)),setTimeout:fn=>{timers.set(++tick,fn);return tick;},clearTimeout:id=>timers.delete(id),setInterval:()=>999,clearInterval(){}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8')+'\n globalThis.testApi={get colors(){return colors;},get hsv(){return preciseHsv;},get drag(){return drag;},setSelectedHsv,setSelectedRgb,selectColor,syncFromPhotoshop};',context);
  return {ps,elements,doc,win,lifecycle,api:context.testApi,tick(){const fns=[...timers.values()];timers.clear();fns.forEach(fn=>fn());}};
}
async function run(){
 const results=[];
 async function test(name,fn){await fn();results.push(name);}
 await test('RGB/HSV round trips, hue wrapping, black and white',()=>{
   for(let r=0;r<=255;r+=17)for(let g=0;g<=255;g+=17)for(let b=0;b<=255;b+=17){const h=C.rgbToHsv({r,g,b});assert.deepEqual(C.hsvToRgb(h.h,h.s,h.v),{r,g,b});}
   assert.equal(C.normalizedHue(-721),359);assert.equal(C.normalizedHue(720),0);
   assert.deepEqual(C.rgbToHsv({r:0,g:0,b:0},123,.7),{h:123,s:.7,v:0});
   assert.deepEqual(C.rgbToHsv({r:255,g:255,b:255},123,.7),{h:123,s:0,v:1});
 });
 await test('HEX validation and actual RGB ramps',()=>{
   assert.deepEqual(C.fromHex(' #8e2924 '),{r:142,g:41,b:36});for(const v of ['#12','GGGGGG','#1234567','<script>'])assert.equal(C.fromHex(v),null);
   for(const [k,a,b] of [['r','#002924','#FF2924'],['g','#8E0024','#8EFF24'],['b','#8E2900','#8E29FF']])assert.equal(C.rgbGradient({r:142,g:41,b:36},k),'linear-gradient(90deg, '+a+' 0%, '+b+' 100%)');
 });
 await test('Entire SV domain is reachable and projects inside diamond',()=>{
   for(let s=0;s<=100;s++)for(let v=0;v<=100;v++){const p=G.hsvToPoint({s:s/100,v:v/100}),h=G.pointToSv(p);assert.ok(Math.abs(h.s-s/100)<1e-12);assert.ok(Math.abs(h.v-v/100)<1e-12);}
   for(let x=-2;x<=2;x+=.1)for(let y=-2;y<=2;y+=.1){const p=G.constrainToDiamond({x,y});assert.ok(Math.abs(p.x-.5)+Math.abs(p.y-.5)<=.38000001);}
   assert.equal(G.pickerRegion({x:.5,y:.04}),'ring');assert.equal(G.pickerRegion({x:.5,y:.5}),'diamond');
 });
 await test('Bidirectional linked offsets wrap and retain unclipped relation',()=>{
   const a={h:350,s:.2,v:.4},b={h:10,s:.7,v:.8},rel=S.relation(a,b);assert.equal(rel.h,20);
   const linked=S.linkedColor(a,rel,1);assert.ok(Math.abs(linked.s-b.s)<1e-12);assert.equal(linked.h,b.h);
   assert.ok(Math.abs(S.linkedColor(b,rel,-1).v-a.v)<1e-12);assert.equal(S.linkedColor({h:359,s:1,v:1},rel,1).s,1);assert.equal(rel.s,.49999999999999994);
 });
 await test('Layout math fits minimum, tall, short and wide panels',()=>{
   for(const [w,h] of [[205,290],[310,455],[1000,290],[205,1400],[2200,2200]]){const a=G.layout(w-14,h-58);assert.ok(a.dimension<=480);assert.ok(a.dimension<=w-26);assert.ok(a.dimension+84<=h-58);assert.ok(a.railWidth<=w-20);}
 });
 await test('Serialized latest writes preserve untouched external swatch',async()=>{
   const ps=host(),errors=[],sync=createColorSync(ps,e=>errors.push(e));let release;ps.gate=new Promise(r=>release=r);
   const first=sync.write({fg:{r:1,g:2,b:3}});sync.write({fg:{r:4,g:5,b:6}});sync.write({fg:{r:7,g:8,b:9}});ps.external('bg',{r:20,g:30,b:40});release();await first;
   assert.deepEqual(sync.read(),{fg:{r:7,g:8,b:9},bg:{r:20,g:30,b:40}});assert.equal(ps.calls,2);assert.equal(sync.busy,false);assert.equal(errors.length,0);
   await sync.write({fg:{r:7,g:8,b:9}});assert.equal(ps.writes,2);
 });
 await test('Failure releases queue and later gesture can recover',async()=>{
   const ps=host(),errors=[],sync=createColorSync(ps,e=>errors.push(e));ps.fail=true;await sync.write({fg:{r:1,g:1,b:1}});assert.equal(errors.length,1);assert.equal(sync.busy,false);await sync.write({fg:{r:2,g:2,b:2}});assert.equal(sync.read().fg.r,2);
 });
 await test('Continuous drag writes before mouseup and cancellation stops stale moves',async()=>{
   const h=harness();h.elements.picker.emit('mousedown',{clientX:100,clientY:10});h.tick();await flush();assert.ok(h.ps.writes>0);h.doc.emit('mousemove',{clientX:190,clientY:100});h.tick();await flush();const n=h.ps.writes;assert.ok(n>1);h.doc.emit('pointercancel');await flush();assert.equal(h.api.drag,null);h.doc.emit('mousemove',{clientX:100,clientY:190});await flush();assert.equal(h.ps.writes,n);
   h.elements.picker.emit('mousedown',{clientX:100,clientY:10});h.doc.emit('mousemove',{buttons:0});assert.equal(h.api.drag,null);
 });
 await test('Own notifications and forced refresh preserve exact black HSB',async()=>{
   const h=harness();h.api.setSelectedHsv({h:281.234,s:.6789,v:0},true);await flush();h.api.syncFromPhotoshop(true);assert.ok(Math.abs(h.api.hsv.fg.h-281.234)<1e-10);assert.equal(h.api.hsv.fg.s,.6789);assert.equal(h.ps.writes,1);
   h.ps.external('bg',{r:22,g:33,b:44});assert.equal(h.api.hsv.fg.s,.6789);assert.equal(h.api.colors.bg.r,22);
 });
 await test('External BG edits update linked FG even with foreground selected',async()=>{
   const h=harness();h.elements['link-colors'].emit('click');h.ps.external('bg',{r:60,g:150,b:200});await flush();assert.ok(h.ps.writes>0);const n=h.ps.writes;h.api.syncFromPhotoshop();await flush();assert.equal(h.ps.writes,n);
 });
 await test('HEX rejects invalid input; picker and hide release text focus',async()=>{
   const h=harness();h.elements.foreground.emit('dblclick');assert.equal(h.doc.activeElement,h.elements['hex-input']);h.elements['hex-input'].value='bad';h.elements['hex-input'].emit('keydown',{key:'Enter'});assert.equal(h.ps.writes,0);h.elements['hex-input'].value='#000000';h.elements['hex-input'].emit('keydown',{key:'Enter'});await flush();assert.equal(h.doc.activeElement,null);assert.equal(h.api.colors.fg.r,0);
   h.elements.foreground.emit('dblclick');h.elements.picker.emit('mousedown',{clientX:100,clientY:10});assert.equal(h.doc.activeElement,null);h.lifecycle.hide();assert.equal(h.api.drag,null);
 });
 return results;
}
module.exports={run};
if(require.main===module)run().then(r=>console.log(r.map(n=>'PASS '+n).join('\n')+'\n'+r.length+' suites passed')).catch(e=>{console.error(e);process.exitCode=1;});
