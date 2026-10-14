"use strict";
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
const {check,root}=require('./check.js');
const cli=path.join(root,'.adobe-cli/packages/uxp-devtools-cli/src/uxp.js');
function run(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[cli,...args],{cwd:root,windowsHide:true,stdio:'inherit',timeout:120000});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Adobe CLI exited '+code)));});}
function ready(){return new Promise(resolve=>{const socket=net.connect(14001,'127.0.0.1');socket.setTimeout(500);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>{socket.destroy();resolve(false);});socket.once('timeout',()=>{socket.destroy();resolve(false);});});}
async function main(){
 const {version}=check();
 if(!fs.existsSync(cli))throw Error('Official Adobe CLI checkout/install is required; see docs/CI.md');
 const output=path.join(root,'dist/ccx');fs.mkdirSync(output,{recursive:true});
 const expected=path.join(output,'com.kiochan.colorpicker_PS.ccx');
 if(fs.existsSync(expected))throw Error('Refusing stale CCX output: use a fresh CI checkout.');
 const service=spawn(process.execPath,[cli,'service','start'],{cwd:root,windowsHide:true,stdio:'inherit'});
 let spawnError;service.on('error',e=>{spawnError=e;});
 try{
   let connected=false;
   for(let i=0;i<60;i++){if(spawnError)throw spawnError;if(await ready()){connected=true;break;}await new Promise(r=>setTimeout(r,500));}
   if(!connected)throw Error('Adobe UXP service did not become ready');
   await run(['plugin','package','--manifest',path.join(root,'dist','kio-color-picker-'+version,'manifest.json'),'--apps','PS','--outputPath',output]);
   if(!fs.existsSync(expected)||fs.statSync(expected).size===0)throw Error('Adobe CLI did not produce a CCX');
 }finally{try{await run(['service','stop']);}catch(e){console.warn(e.message);}service.kill();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
