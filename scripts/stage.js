"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {check,runtime,root}=require('./check.js');
function stage(){
 const {version}=check();const dest=path.join(root,'dist','kio-color-picker-'+version);
 if(fs.existsSync(dest))throw Error('Stage already exists; choose a fresh version or archive it before retrying: '+dest);
 fs.mkdirSync(dest,{recursive:true});const hashes=[];
 for(const file of runtime){const src=path.join(root,file),out=path.join(dest,file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(src,out);hashes.push({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex')});}
 fs.writeFileSync(path.join(root,'dist','kio-color-picker-'+version+'-sha256.json'),JSON.stringify(hashes,null,2)+'\n');
 return {directory:dest,notice:'Local UDT input only. Not a CCX. Host validation and official packaging remain pending.'};
}
module.exports={stage};if(require.main===module)console.log(stage());
