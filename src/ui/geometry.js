"use strict";
const {clamp}=require("../color/conversions.js");
function pickerRegion(pos) {
  const a=(pos.x-.5)/.38,b=(pos.y-.5)/.38;
  if(Math.abs(a)+Math.abs(b)<=1.015)return 'diamond';
  const r=Math.hypot(pos.x-.5,pos.y-.5);
  if(r>=.421&&r<=.505)return 'ring';
  return null;
}
// Orthogonally project the pointer onto the diamond when a drag leaves it.
// Independent u/v clamping caused a jump near the lower (black) vertex.
function constrainToDiamond(pos) {
  const x=pos.x-.5,y=pos.y-.5,d=.38;
  if(Math.abs(x)+Math.abs(y)<=d) return pos;
  const corners=[{x:0,y:-d},{x:d,y:0},{x:0,y:d},{x:-d,y:0}];
  let best=null,dist=Infinity;
  for(let i=0;i<4;i++) {
    const a=corners[i],b=corners[(i+1)%4];
    const dx=b.x-a.x,dy=b.y-a.y;
    const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1);
    const q={x:a.x+t*dx,y:a.y+t*dy};
    const delta=(x-q.x)**2+(y-q.y)**2;
    if(delta<dist){dist=delta;best=q;}
  }
  return {x:best.x+.5,y:best.y+.5};
}

function hsvToPoint(hsv){const u=hsv.s,t=1-hsv.v;return {x:.5+(u-t)*.38,y:.5+(u+t-1)*.38};}
function pointToSv(pos){const p=constrainToDiamond(pos),a=(p.x-.5)/.38,b=(p.y-.5)/.38;return {s:clamp((a+b+1)/2,0,1),v:1-clamp((b-a+1)/2,0,1)};}
function layout(width,height){const dimension=Math.max(1,Math.floor(Math.min(width-12,height-84,480)));return {dimension,railWidth:Math.min(Math.max(1,width-6),492,Math.max(220,dimension+12))};}
module.exports={pickerRegion,constrainToDiamond,hsvToPoint,pointToSv,layout};
