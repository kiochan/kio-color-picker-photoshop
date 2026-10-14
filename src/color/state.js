"use strict";
const {normalizedHue,clamp}=require('./conversions.js');
function relation(a,b){return {h:normalizedHue(b.h-a.h+180)-180,s:b.s-a.s,v:b.v-a.v};}
function linkedColor(src,offset,sign){return {h:normalizedHue(src.h+sign*offset.h),s:clamp(src.s+sign*offset.s,0,1),v:clamp(src.v+sign*offset.v,0,1)};}
module.exports={relation,linkedColor};
