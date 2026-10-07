const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
async function build(){
 const output=path.join(__dirname,'dist');fs.mkdirSync(output,{recursive:true});
 for(const name of ['index.html','style.css','app.js','favicon.svg','teacher.html','student.html','portal.css','setup.html'])fs.copyFileSync(path.join(__dirname,name),path.join(output,name));
 const publicConfig=fs.existsSync(path.join(__dirname,'supabase-public.json'))?JSON.parse(fs.readFileSync(path.join(__dirname,'supabase-public.json'),'utf8').replace(/^\uFEFF/,'')):{};
 const url=process.env.SUPABASE_URL||publicConfig.url||'',key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||publicConfig.key||'';
 if(key.startsWith('sb_secret_'))throw new Error('Use a Supabase publishable key, never a secret key.');
 if(key.startsWith('eyJ')){try{const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());if(payload.role!=='anon')throw new Error('Only the anon public key is allowed.');}catch(err){throw new Error('Invalid public anon key: '+err.message)}}
 if(url&&!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url))throw new Error('SUPABASE_URL must be your Supabase HTTPS project URL.');
 if(Boolean(url)!==Boolean(key))throw new Error('Configure both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
 fs.writeFileSync(path.join(output,'config.js'),'window.WRITING_CONFIG='+JSON.stringify({url,key})+';\n');
 await esbuild.build({entryPoints:{'portal.bundle':'portal.js','cloud-editor.bundle':'cloud-editor.js'},bundle:true,outdir:output,format:'esm',target:'es2022',minify:true});
 console.log('Static website built in dist/; Supabase '+(url?'configured':'not configured (worksheet and image saving remain available)'));
}build().catch(error=>{console.error(error.message);process.exitCode=1});
