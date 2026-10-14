"use strict";
// Kio Color Picker: UXP UI controller; no WebView or external dependencies.
const ps = require("photoshop");
const {clamp,normalizedHue,hsvToRgb,rgbToHsv,toHex,fromHex,clone,same,rgbGradient}=require('./color/conversions.js');
const {relation,linkedColor}=require('./color/state.js');
const {pickerRegion,hsvToPoint,pointToSv,layout}=require('./ui/geometry.js');
const {createColorSync}=require('./photoshop/color-sync.js');
const { entrypoints } = require("uxp");

entrypoints.setup({ panels: { pickerPanel: { show() { init(); startSync(); syncFromPhotoshop(true); }, hide() { finishDrag(); closeHex(); stopSync(); } } } });

let colors={fg:{r:142,g:41,b:36},bg:{r:153,g:43,b:31}};
let rememberedHue={fg:3,bg:3};
// Authoritative, non-quantized HSB state. An RGB value of #000000 cannot
// represent saturation; reconstructing it on every drag used to move the
// cursor away from the exact black point (and made near-black positions jump).
let preciseHsv={fg:rgbToHsv(colors.fg,3),bg:rgbToHsv(colors.bg,3)};
let active='fg',linked=false;
let relative={h:0,s:0,v:0};  // BG's HSV offset relative to FG at link time
let commitTimer=null,drag=null,initialized=false;
let els={}, pollTimer=null, visible=true, notificationInstalled=false;
const sync=createColorSync(ps,error=>{console.error('Kio Color Picker:',error);setStatus('Cannot write Photoshop colors: '+error.message,true);},()=>{setStatus('');});
const notification=()=>{if(visible)syncFromPhotoshop();};
function startSync(){
  visible=true;
  if(pollTimer===null)pollTimer=setInterval(notification,500);
  if(!notificationInstalled&&ps.action){
    notificationInstalled=true;
    try {
      Promise.resolve(ps.action.addNotificationListener(['set','exchange','reset'],notification)).catch(()=>{notificationInstalled=false;});
    } catch(error) { notificationInstalled=false; } // Polling remains available.
  }
}
function stopSync(){visible=false;if(pollTimer!==null){clearInterval(pollTimer);pollTimer=null;}}
function closeHex(){if(els.hex&&document.activeElement===els.hex)els.hex.blur();if(els.hexBox)els.hexBox.classList.add('hidden');}
function finishDrag(){if(drag){drag=null;queueWrite(true);}}
const otherOf = id => id==='fg'?'bg':'fg';

function relationFromForeground() {
  relative=relation(preciseHsv.fg,preciseHsv.bg);
}
function deriveOther(changed) {
  if(!linked)return;
  const src=preciseHsv[changed];
  const sign=changed==='fg'?1:-1;
  const dst=linkedColor(src,relative,sign);
  const other=otherOf(changed);
  rememberedHue[other]=dst.h;
  preciseHsv[other]=dst;
  colors[other]=hsvToRgb(dst.h,dst.s,dst.v);
}
function setStatus(str,fail=false) {
  if(!els.status)return;
  els.status.textContent=str;
  els.status.classList.toggle('error',fail);
  resizePicker();
}
function render() {
  if(!initialized)return;
  const hsv=preciseHsv[active],rgb=colors[active];
  rememberedHue[active]=hsv.h;
  els.foreground.style.backgroundColor=toHex(colors.fg);
  els.background.style.backgroundColor=toHex(colors.bg);
  els.foreground.classList.toggle('selected',active==='fg');
  els.background.classList.toggle('selected',active==='bg');
  els.link.classList.toggle('active',linked);
  els.link.setAttribute('aria-pressed',linked?'true':'false');
  els.link.title=linked?'Linked: background and foreground keep H/S/B differences':'Unlinked: edit foreground/background independently';
  els.diamondHue.style.backgroundColor=toHex(hsvToRgb(hsv.h,1,1));
  // Ring zero hue is at upper-left; yellow at the top, as in the reference image.
  const theta=(hsv.h-45)*Math.PI/180;
  els.hueCursor.style.left=(50+Math.sin(theta)*46)+'%';
  els.hueCursor.style.top=(50-Math.cos(theta)*46)+'%';
  // Rotated SV square: white at top, hue at right, black along the lower edge.
  const point=hsvToPoint(hsv);
  els.svCursor.style.left=(point.x*100)+'%';
  els.svCursor.style.top=(point.y*100)+'%';
  els.h.textContent='H: '+Math.round(hsv.h)+'°';
  els.s.textContent='S: '+Math.round(hsv.s*100)+'%';
  els.v.textContent='B: '+Math.round(hsv.v*100)+'%';
  for(const k of ['r','g','b']) {
    els['value-'+k].textContent=String(rgb[k]);
    els['marker-'+k].style.left=(100*rgb[k]/255)+'%';
    // True RGB channel ramp: vary only this channel; hold the other two constant.
    // Example, R at {R:142, G:41, B:36} runs #002924 → #FF2924.
    const track=els['track-'+k];
    track.style.backgroundImage=rgbGradient(rgb,k);
    // Fallback if the UXP renderer cannot display a linear gradient.
    track.style.backgroundColor=toHex(rgb);
  }
  if(document.activeElement!==els.hex)els.hex.value=toHex(colors[active]);
}
function selectColor(which) {finishDrag();if(commitTimer!==null)queueWrite(true);closeHex();active=which;render();}
function setSelectedRgb(rgb,immediate) {
  colors[active]=clone(rgb);
  preciseHsv[active]=rgbToHsv(rgb,rememberedHue[active],preciseHsv[active].s);
  rememberedHue[active]=preciseHsv[active].h;
  deriveOther(active);
  render();queueWrite(immediate);
}
function setSelectedHsv(hsv,immediate) {
  hsv={h:normalizedHue(hsv.h),s:clamp(hsv.s,0,1),v:clamp(hsv.v,0,1)};
  preciseHsv[active]=hsv;
  rememberedHue[active]=hsv.h;
  colors[active]=hsvToRgb(hsv.h,hsv.s,hsv.v);
  deriveOther(active);
  render();queueWrite(immediate);
}
function queueWrite(immediate) {
  if(immediate){if(commitTimer!==null)clearTimeout(commitTimer);commitTimer=null;requestWrite();return;}
  // Throttle instead of debounce: continuous gestures reach Photoshop every 40 ms.
  if(commitTimer===null)commitTimer=setTimeout(()=>{commitTimer=null;requestWrite();},40);
}
function requestWrite(){sync.write(linked?{fg:colors.fg,bg:colors.bg}:{[active]:colors[active]});}
function syncFromPhotoshop(force=false) {
  if(!initialized||sync.busy||commitTimer!==null||drag)return;
  if(document.activeElement===els.hex&&!force)return;
  try {
    const fresh=sync.read();
    const fgChanged=!same(fresh.fg,colors.fg),bgChanged=!same(fresh.bg,colors.bg);
    if(!force&&!fgChanged&&!bgChanged)return;
    colors={fg:clone(fresh.fg),bg:clone(fresh.bg)};
    for(const key of ['fg','bg']) {
      const old=preciseHsv[key];
      // Preserve sub-byte precision and latent H/S on unchanged RGB, including show().
      if(!same(colors[key],hsvToRgb(old.h,old.s,old.v)))preciseHsv[key]=rgbToHsv(colors[key],old.h,old.s);
    }
    rememberedHue={fg:preciseHsv.fg.h,bg:preciseHsv.bg.h};
    if(linked&&!force&&fgChanged!==bgChanged) {
      // Preserve the FG/BG relationship even when Photoshop's eyedropper changes one swatch.
      deriveOther(fgChanged?'fg':'bg');
      render();requestWrite();
    } else {
      if(linked&&fgChanged&&bgChanged)relationFromForeground();
      render();
    }
  } catch(err) {if(force){console.error(err);setStatus('Cannot read Photoshop colors',true);}}
}
function pointerPos(evt) {
  const rect=els.picker.getBoundingClientRect();
  return {x:(evt.clientX-rect.left)/rect.width,y:(evt.clientY-rect.top)/rect.height};
}
function updatePicker(region,pos,immediate=false) {
  const hsv={...preciseHsv[active]};
  if(region==='ring')hsv.h=normalizedHue(Math.atan2(pos.x-.5,.5-pos.y)*180/Math.PI+45);
  else {
    Object.assign(hsv,pointToSv(pos));
  }
  setSelectedHsv(hsv,immediate);
}
function updateSlider(key,evt,immediate=false) {
  const track=els['slider-'+key].querySelector('.slider-track'),rect=track.getBoundingClientRect();
  const ratio=clamp((evt.clientX-rect.left)/rect.width,0,1);
  const rgb=clone(colors[active]);rgb[key]=Math.round(ratio*255);
  setSelectedRgb(rgb,immediate);
}
function resizePicker() {
  if(!initialized)return;
  const width=window.innerWidth||document.documentElement.clientWidth||315;
  const height=window.innerHeight||document.documentElement.clientHeight||465;
  // Photoshop can resize a UXP panel without updating body height immediately.
  els.app.style.height=Math.max(1,height)+'px';
  els.app.classList.toggle('compact',width<265||height<380);
  // Keep the panel vertical at EVERY aspect ratio. Large horizontal panels no longer
  // move the RGB section to the side, and tall panels no longer separate it from the wheel.
  els.app.classList.remove('landscape');
  const stage=els.stage;
  const availableWidth=Math.max(1,stage.clientWidth);
  const {dimension,railWidth}=layout(availableWidth,els.workArea.clientHeight);
  els.picker.style.width=dimension+'px';els.picker.style.height=dimension+'px';
  stage.style.height=dimension+'px';els.sliderArea.style.width=railWidth+'px';
  els.app.classList.toggle('tiny-wheel',dimension<195);
}

function applyHex() {
  const parsed=fromHex(els.hex.value);
  if(!parsed){setStatus('HEX format: #RRGGBB',true);return;}
  setStatus('');setSelectedRgb(parsed,true);closeHex();
}
function init() {
  if(initialized)return;
  const byId=id=>document.getElementById(id);
  if(!byId('picker'))return;
  els={
    picker:byId('picker'), stage:byId('picker-stage'), foreground:byId('foreground'),background:byId('background'),
    link:byId('link-colors'),app:byId('app'),workArea:byId('work-area'),sliderArea:document.querySelector('.slider-area'),
    hexBox:byId('hex-box'),hex:byId('hex-input'),hexClose:byId('hex-close'),
    diamondHue:byId('diamond-hue'),hueCursor:byId('hue-cursor'),svCursor:byId('sv-cursor'),
    h:byId('h-info'),s:byId('s-info'),v:byId('v-info'),status:byId('status')
  };
  for(const key of ['r','g','b']) {
    els['slider-'+key]=byId('slider-'+({r:'red',g:'green',b:'blue'}[key]));
    els['value-'+key]=byId('value-'+key);els['marker-'+key]=byId('marker-'+key);
    els['track-'+key]=byId('track-'+key);
  }
  initialized=true;
  els.foreground.addEventListener('click',evt=>{evt.preventDefault();selectColor('fg');});
  els.background.addEventListener('click',evt=>{evt.preventDefault();selectColor('bg');});
  for(const elem of [els.foreground,els.background])elem.addEventListener('dblclick',evt=>{
    evt.preventDefault();els.hexBox.classList.remove('hidden');els.hex.value=toHex(colors[active]);els.hex.focus();els.hex.select();
  });
  els.link.addEventListener('click',evt=>{
    evt.preventDefault();finishDrag();if(commitTimer!==null)queueWrite(true);closeHex();linked=!linked;
    if(linked)relationFromForeground();
    render();
  });
  els.hex.addEventListener('keydown',evt=>{
    if(evt.key==='Enter'){evt.preventDefault();applyHex();}
    else if(evt.key==='Escape'){evt.preventDefault();els.hex.blur();els.hexBox.classList.add('hidden');}
  });
  els.hexClose.addEventListener('click',()=>{els.hex.blur();els.hexBox.classList.add('hidden');});
  // Default click in swatches does not cause text-entry focus, important on Photoshop 27.2.
  els.picker.addEventListener('mousedown',evt=>{
    if(evt.button!==0)return;
    const pos=pointerPos(evt),region=pickerRegion(pos);
    if(!region)return;
    evt.preventDefault();closeHex();drag={type:region};updatePicker(region,pos);
  });
  for(const key of ['r','g','b'])els['slider-'+key].addEventListener('mousedown',evt=>{
    if(evt.button!==0)return;
    evt.preventDefault();closeHex();drag={type:'slider',key};updateSlider(key,evt);
  });
  document.addEventListener('mousemove',evt=>{
    if(!drag)return;
    // A mouseup outside a UXP panel may never reach document; stop a stale drag
    // before a later mousemove changes the current color unexpectedly.
    if(typeof evt.buttons==='number' && !(evt.buttons & 1)){finishDrag();return;}
    evt.preventDefault();
    if(drag.type==='slider')updateSlider(drag.key,evt);
    else updatePicker(drag.type,pointerPos(evt));
  });
  document.addEventListener('mouseup',evt=>{if(evt.button===0)finishDrag();});
  document.documentElement.addEventListener('mouseleave',finishDrag);
  window.addEventListener('blur',()=>{finishDrag();closeHex();});
  document.addEventListener('pointercancel',finishDrag);
  window.addEventListener('resize',resizePicker);
  // Some Photoshop builds resize the panel content without dispatching window.resize.
  if(typeof ResizeObserver==='function') {
    const observer=new ResizeObserver(()=>resizePicker());
    observer.observe(els.stage);
  }
  resizePicker();render();
  startSync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{init();syncFromPhotoshop(true);});
else {init();syncFromPhotoshop(true);}
