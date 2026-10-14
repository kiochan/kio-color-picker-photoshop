"use strict";
const assert=require('node:assert/strict'),zlib=require('node:zlib');
const {releaseMeta}=require('../scripts/release-meta.js');
const {zipEntries,verifyContents}=require('../scripts/verify-ccx.js');
// Minimal test-only archive; never emitted as a release package.
function fixture(entries){
 const parts=[],central=[];let offset=0;
 for(const [name,text] of entries){
  const n=Buffer.from(name),data=Buffer.from(text),packed=zlib.deflateRawSync(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(8,10);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
  parts.push(local,n,packed);central.push(c,n);offset+=local.length+n.length+packed.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...parts,directory,end]);
}
function run(){
 assert.equal(releaseMeta('v0.3.0-beta.1','0.3.0').prerelease,true);
 assert.equal(releaseMeta('v0.3.0','0.3.0').prerelease,false);
 for(const tag of ['v0.4.0','0.3.0','v0.3.0-evil/1','v0.3.0-beta.01','v00.3.0','v0.3.0\n'])assert.throws(()=>releaseMeta(tag,'0.3.0'));
 const list=[['manifest.json','{"version":"0.3.0"}'],['LICENSE','MIT fixture']];
 const expected=new Map(list.map(([n,t])=>[n,Buffer.from(t)]));
 assert.equal(verifyContents(fixture(list),expected),2);
 assert.equal(verifyContents(fixture([['manifest.json','{ "version": "0.3.0" }'],list[1]]),expected),2);
 assert.throws(()=>verifyContents(fixture([list[0],['LICENSE','changed']]),expected));
 assert.throws(()=>verifyContents(fixture([list[0]]),expected));
 assert.throws(()=>verifyContents(fixture([...list,['secret.txt','extra']]),expected));
 assert.throws(()=>zipEntries(fixture([...list,list[1]])));
 assert.throws(()=>zipEntries(fixture([['../bad','x']])));
 assert.throws(()=>zipEntries(Buffer.from('not a ZIP')));
 assert.throws(()=>zipEntries(fixture(list).subarray(0,-3)));
 return 'Release tag and CCX content verification tests passed';
}
module.exports={run};if(require.main===module)console.log(run());
