"use strict";
const {same,clone}=require('../color/conversions.js');
// Host access and serialization are isolated from UI. Only edited channels are written.
function createColorSync(ps,onError=()=>{},onSuccess=()=>{}) {
  const {app,core}=ps;
  let pending=null,running=false;
  const readRgb=c=>({r:Math.round(c.rgb.red),g:Math.round(c.rgb.green),b:Math.round(c.rgb.blue)});
  const read=()=>({fg:readRgb(app.foregroundColor),bg:readRgb(app.backgroundColor)});
  const solid=rgb=>{const c=new app.SolidColor();c.rgb.red=rgb.r;c.rgb.green=rgb.g;c.rgb.blue=rgb.b;return c;};
  async function drain(){
    if(running)return;
    running=true;
    try{while(pending){
      const target=pending;pending=null;
      try{
        await core.executeAsModal(async()=>{
          const fresh=read();
          if(target.fg&&!same(target.fg,fresh.fg))app.foregroundColor=solid(target.fg);
          if(target.bg&&!same(target.bg,fresh.bg))app.backgroundColor=solid(target.bg);
        },{commandName:'Choose color',timeOut:1.5});
        onSuccess(read());
      }catch(error){onError(error);}
    }}finally{running=false;}
  }
  return {read,get busy(){return running||!!pending;},write(target){
    pending=Object.assign(pending||{},Object.fromEntries(Object.entries(target).map(([k,v])=>[k,clone(v)])));
    return drain();
  }};
}
module.exports={createColorSync};
