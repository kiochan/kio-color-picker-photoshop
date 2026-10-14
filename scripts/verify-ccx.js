"use strict";
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {check,runtime,root}=require('./check.js');
const {releaseMeta}=require('./release-meta.js');
// Read central directory without extracting files. CCX is produced by Adobe CLI only.
function zipEntries(buf){
 let end=-1;
 for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(buf.readUInt32LE(i)===0x06054b50&&i+22+buf.readUInt16LE(i+20)===buf.length){end=i;break;}
 if(end<0)throw Error('Invalid ZIP end record');
 if(buf.readUInt16LE(end+4)||buf.readUInt16LE(end+6))throw Error('Multi-disk ZIP unsupported');
 const count=buf.readUInt16LE(end+10),size=buf.readUInt32LE(end+12),start=buf.readUInt32LE(end+16);
 if(count===65535||start+size!==end)throw Error('Invalid/ZIP64 directory');
 let cursor=start;const files=new Map();
 for(let i=0;i<count;i++){
   if(cursor+46>end||buf.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid directory entry');
   const flags=buf.readUInt16LE(cursor+8),method=buf.readUInt16LE(cursor+10),packed=buf.readUInt32LE(cursor+20),length=buf.readUInt32LE(cursor+24);
   const nl=buf.readUInt16LE(cursor+28),el=buf.readUInt16LE(cursor+30),cl=buf.readUInt16LE(cursor+32),offset=buf.readUInt32LE(cursor+42);
   if(cursor+46+nl+el+cl>end)throw Error('Truncated entry');
   const name=buf.toString('utf8',cursor+46,cursor+46+nl);cursor+=46+nl+el+cl;
   if(flags&1||!name||name.includes('\\')||name.startsWith('/')||name.split('/').some(x=>x==='..'||x==='.')||files.has(name))throw Error('Unsafe or duplicate entry');
   if(offset+30>start||buf.readUInt32LE(offset)!==0x04034b50)throw Error('Invalid local header');
   const localNameLength=buf.readUInt16LE(offset+26),localExtraLength=buf.readUInt16LE(offset+28);
   const dataStart=offset+30+localNameLength+localExtraLength;
   if(dataStart+packed>start||length>16*1024*1024)throw Error('Invalid entry size');
   if(buf.toString('utf8',offset+30,offset+30+localNameLength)!==name)throw Error('Local filename mismatch');
   const data=buf.subarray(dataStart,dataStart+packed);
   const decoded=method===0?Buffer.from(data):method===8?zlib.inflateRawSync(data,{maxOutputLength:16*1024*1024}):null;
   if(!decoded||decoded.length!==length)throw Error('Unsupported compression or length mismatch');
   if(!name.endsWith('/'))files.set(name,decoded);
 }
 if(cursor!==end)throw Error('Directory length mismatch');
 return files;
}
function verifyContents(buf,expected){
 const entries=zipEntries(buf);
 assert.deepEqual([...entries.keys()].sort(),[...expected.keys()].sort(),'CCX file list differs from runtime allowlist');
 for(const [file,data] of expected){
   if(file==='manifest.json')assert.deepEqual(JSON.parse(entries.get(file).toString()),JSON.parse(data.toString()),'Manifest differs from source');
   else assert.ok(entries.get(file).equals(data),'Packaged bytes differ: '+file);
 }
 return entries.size;
}
function main(){
 const {version}=check();
 const tag=process.env.GITHUB_REF_TYPE==='tag'?releaseMeta(process.env.GITHUB_REF_NAME,version).tag:'v'+version+'-ci';
 const source=path.join(root,'dist/ccx/com.kiochan.colorpicker_PS.ccx'),buf=fs.readFileSync(source);
 const expected=new Map(runtime.map(file=>[file,fs.readFileSync(path.join(root,file))]));
 verifyContents(buf,expected);
 const dest=path.join(root,'dist/release');fs.mkdirSync(dest,{recursive:true});
 const name='kio-color-picker-'+tag.slice(1)+'.ccx';
 fs.copyFileSync(source,path.join(dest,name));
 const hash=crypto.createHash('sha256').update(buf).digest('hex');
 fs.writeFileSync(path.join(dest,'SHA256SUMS.txt'),hash+'  '+name+'\n');
 fs.writeFileSync(path.join(dest,'build-info.json'),JSON.stringify({tag,version,commit:process.env.GITHUB_SHA||null,packager:'Adobe UXP CLI PluginPackageCommand.package()',packagerCommit:'ef7e127b0e234e82b94d94e0c18443f3a738f929',file:name,sha256:hash,verifiedFiles:runtime.length,photoshopTestedByCI:false},null,2)+'\n');
 fs.writeFileSync(path.join(dest,'RELEASE_NOTES.md'),'Kio Color Picker '+tag+'\n\nBuilt with the packaging module from pinned Adobe UXP CLI source. Automated tests and packaged file checks passed.\n\nDownload the .ccx asset and install through Creative Cloud Desktop. SHA256SUMS.txt verifies the download; build-info.json records the source and packager commits.\n\nTarget: Windows 11 / Photoshop 27.x. CI does not run Photoshop or verify installation, rendering, color management or keyboard focus. See docs/TESTING.md before relying on this candidate.\n\nPlugin ID: com.kiochan.colorpicker (separate from Mini Color Picker). MIT License.\n');
 console.log('Verified '+runtime.length+' files; release assets ready.');
}
module.exports={zipEntries,verifyContents};
if(require.main===module)main();
